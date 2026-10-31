import type { LifeOSContext } from '../registry/context';
import { notifyPrefs, outOfQuiet } from '../notify/plan';
import { recordUsage } from '../ai/routing';
import { newId } from '../domain/ids';
import { NUDGE_FILING, type ActResult, type Ask, type BrainDef, type Candidate, type Nudge } from './contract';
import type { BrainModel } from './model';
import { parseAnswer, RESPONSE_SCHEMA, sentLines, systemPrompt, userMessage, type BrainAnswer, type Outgoing } from './prompt';
import { startOfDay } from './store';
import { UPKEEP, upkeepBrain } from './upkeep';

/**
 * The brain's pass (docs/MODEL.md layer 8): gather every module's candidates,
 * keep the limits, ask Claude once about what is new, file the nudges into To
 * check, keep what it answered, log what left, notify the urgent first.
 */

export type PassName = 'morning' | 'evening' | 'event' | 'manual';

export interface BrainSettings {
  on: boolean;
  /** The standing model (Haiku 5.5: enough for the passes). */
  model: string;
  /** A stronger model for one day only (Opus 5.5 on the first day); back to `model` the next. */
  forToday?: { model: string; day: string };
  /** Tokens a day (cache reads count a tenth). */
  budget: number;
  morning: string;
  evening: string;
}

export const DEFAULT_BRAIN: BrainSettings = { on: true, model: 'claude-haiku-5-5', budget: 40_000, morning: '07:00', evening: '19:00' };
/** In To check and the brief: per module, per day (layer 8, *How many*). */
export const PER_MODULE = 2;
/** As phone notifications, across LifeOS, per day. */
export const NOTIFY_PER_DAY = 3;
const MAX_TOKENS = 4000;

export function brainSettings(os: LifeOSContext): BrainSettings {
  return { ...DEFAULT_BRAIN, ...os.settings.get<Partial<BrainSettings>>('brain', {}) };
}
export function setBrainSettings(os: LifeOSContext, patch: Partial<BrainSettings>) {
  os.settings.set('brain', { ...brainSettings(os), ...patch });
}

export const STRONG_MODEL = 'claude-opus-5-5';

/**
 * The model for a pass now: the one-day model on its day, else the standing
 * one. The very first time the brain runs it starts with a day on Opus (agreed
 * 31 Oct: Opus for the first day, then Haiku).
 */
export function brainModelId(os: LifeOSContext, now = Date.now()): string {
  if (os.settings.get<unknown>('brain', null) === null) setBrainSettings(os, { forToday: { model: STRONG_MODEL, day: iso(now) } });
  const s = brainSettings(os);
  return s.forToday?.day === iso(now) ? s.forToday.model : s.model;
}

/** Use `model` for the rest of today only (null: back to the standing model now). */
export function setModelForToday(os: LifeOSContext, model: string | null, now = Date.now()) {
  setBrainSettings(os, { forToday: model ? { model, day: iso(now) } : undefined });
}

export interface Brains {
  module: string;
  name: string;
  def: BrainDef;
}

/** Every module that offers candidates, and core's Upkeep. */
export function brains(os: LifeOSContext): Brains[] {
  const out: Brains[] = [{ module: UPKEEP, name: 'Upkeep', def: upkeepBrain }];
  for (const m of os.registry.modules.values()) if (m.brain) out.push({ module: m.id, name: m.name, def: m.brain });
  return out;
}

export function brainOf(os: LifeOSContext, module: string): BrainDef | undefined {
  return module === UPKEEP ? upkeepBrain : os.registry.modules.get(module)?.brain;
}

const iso = (at: number) => new Date(at - new Date(at).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** The house style: no em dashes in anything shown. */
export const plainDashes = (s: string) => s.replace(/\s*\u2014\s*/g, ', ').replace(/\s*\u2013\s*/g, ' to ').trim();

/**
 * How many a module may file today: two, or one once its nudges keep being
 * turned down (Not this three times in 14 days, and more often than acted on);
 * less what it already filed today.
 */
export function moduleLimit(os: LifeOSContext, module: string, now: number): number {
  const a = os.brain.nudges.answers(module, now);
  const perDay = a.no >= 3 && a.no > a.yes ? PER_MODULE - 1 : PER_MODULE;
  return Math.max(0, perDay - os.brain.nudges.filedToday(module, now));
}

/** Urgent first, then soonest; at most `n`. */
export function pick(cands: Candidate[], n: number): Candidate[] {
  return [...cands].sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || (a.rank ?? 9) - (b.rank ?? 9) || a.title.localeCompare(b.title)).slice(0, n);
}

/** What is new and allowed: not filed before, not turned down, not held back today, within the module's limit. */
export function gather(os: LifeOSContext, now: number): { nudges: Array<{ b: Brains; c: Candidate }>; asks: Array<{ b: Brains; ask: Ask }> } {
  const L = os.brain.learned;
  const today = iso(now);
  const nudges: Array<{ b: Brains; c: Candidate }> = [];
  const asks: Array<{ b: Brains; ask: Ask }> = [];
  const seen = new Set<string>();
  for (const b of brains(os)) {
    let cands: Candidate[] = [];
    try {
      cands = b.def.candidates(os, now);
    } catch (e) {
      console.warn(`brain: ${b.module} candidates failed`, e);
    }
    const fresh = cands.filter((c) => {
      if (seen.has(c.key) || os.brain.nudges.filed(c.key) || L.has(`not-this:${c.key}`) || L.get(`held:${c.key}`) === today) return false;
      seen.add(c.key);
      return true;
    });
    for (const c of pick(fresh, moduleLimit(os, b.module, now))) nudges.push({ b, c });
    try {
      for (const ask of b.def.asks?.(os, now) ?? []) if (!L.has(ask.key)) asks.push({ b, ask });
    } catch (e) {
      console.warn(`brain: ${b.module} asks failed`, e);
    }
  }
  return { nudges, asks };
}

export interface PassResult {
  passId: string;
  filed: Nudge[];
  /** Claude was asked. */
  called: boolean;
  /** Why it was not, or why it fell back to code's words. */
  note?: 'nothing new' | 'no key' | 'over budget' | 'error' | 'off';
  error?: string;
  notified: number;
}

/** Run one pass. `model` is null without a Claude key: nudges are then filed in code's words. */
export async function runPass(os: LifeOSContext, opts: { pass: PassName; model: BrainModel | null; now?: number; why?: string }): Promise<PassResult> {
  const now = opts.now ?? Date.now();
  const passId = newId(now);
  const set = brainSettings(os);
  const result: PassResult = { passId, filed: [], called: false, notified: 0 };
  markPass(os, opts.pass, now, passId);
  if (!set.on) return { ...result, note: 'off' };
  for (const b of brains(os)) for (const s of b.def.skills ?? []) os.brain.skills.put({ module: b.module, name: s.name, body: s.body, source: 'code' }, { seed: true });

  const { nudges, asks } = gather(os, now);
  // Asks on a nudge that the learned store already answers stay home.
  const outgoing: Outgoing[] = nudges.map(({ b, c }) => ({ module: b.module, moduleName: b.name, candidate: c, asks: (c.asks ?? []).filter((k) => !os.brain.learned.has(k.key)) }));
  if (!outgoing.length && !asks.length) return { ...result, note: 'nothing new' };

  let answer: BrainAnswer | null = null;
  let ids: ReturnType<typeof userMessage> | null = null;
  if (!opts.model) result.note = 'no key';
  else {
    const system = systemPrompt(os.brain.skills.all());
    const d = new Date(now);
    ids = userMessage({ today: `${iso(now)} (${WEEKDAY[d.getDay()]})`, pass: opts.pass, nudges: outgoing, asks: asks.map(({ b, ask }) => ({ module: b.module, moduleName: b.name, ask })) });
    const estimate = Math.ceil((system.length + ids.text.length) / 4) + MAX_TOKENS;
    if (os.brain.sent.tokensToday(now) + estimate > set.budget) result.note = 'over budget';
    else {
      const lines = sentLines(outgoing, asks.map(({ b, ask }) => ({ moduleName: b.name, ask })));
      const base = { at: now, pass: opts.pass, why: opts.why ?? `${opts.pass} pass`, model: opts.model.model, lines, records: lines.length };
      try {
        const r = await opts.model.complete({ system, user: ids.text, maxTokens: MAX_TOKENS, schema: RESPONSE_SCHEMA as unknown as Record<string, unknown> });
        result.called = true;
        answer = parseAnswer(r.text);
        os.brain.sent.add({ ...base, ...r.usage, outcome: answer ? 'ok' : 'error', error: answer ? null : 'The answer was not the expected JSON' });
        recordUsage(os, { provider: 'claude', model: opts.model.model, purpose: 'brain', input: r.usage.input + r.usage.cacheRead + r.usage.cacheWrite, output: r.usage.output, at: now });
        if (!answer) result.note = 'error';
      } catch (e) {
        const usage = (e as { usage?: { input: number; output: number; cacheRead: number; cacheWrite: number } }).usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
        os.brain.sent.add({ ...base, ...usage, outcome: 'error', error: (e as Error).message.slice(0, 300) });
        result.called = true;
        result.note = 'error';
        result.error = (e as Error).message;
      }
    }
  }

  // Keep what it answered.
  if (answer && ids) {
    for (const f of answer.fills) {
      const a = ids.askIds.get(f.id);
      if (!a) continue;
      const items = (f.items ?? []).map(plainDashes).filter(Boolean);
      const text = plainDashes(f.text ?? '');
      if (a.ask.list ? items.length : text) os.brain.learned.put(a.ask.key, a.ask.list ? items : text, { module: a.module, source: 'claude', at: now });
    }
    for (const r of answer.remember) if (r.key && r.value) os.brain.learned.put(r.key, r.value, { module: r.module || 'brain', kind: 'fact', source: 'claude', at: now });
    for (const s of answer.skills) if (s.name && s.body) os.brain.skills.put({ module: s.module || 'brain', name: s.name, body: plainDashes(s.body), source: 'claude' });
  }

  // File them.
  const said = new Map<Outgoing, { keep: boolean; line: string }>();
  if (answer && ids) for (const n of answer.nudges) {
    const o = ids.nudgeIds.get(n.id);
    if (o) said.set(o, n);
  }
  const today = iso(now);
  for (const o of outgoing) {
    const c = o.candidate;
    const s = said.get(o);
    if (answer && s && !s.keep && !c.urgent) {
      os.brain.learned.put(`held:${c.key}`, today, { module: o.module, kind: 'held', source: 'claude', at: now });
      continue;
    }
    const line = s?.line?.trim() ? plainDashes(s.line) : c.line;
    const nudge = fileNudge(os, o.module, c, { passId, line, at: now });
    result.filed.push(nudge);
  }

  result.notified = notifyFiled(os, result.filed, brains(os), now);
  return result;
}

/** One nudge into To check: the row, its filing, and for a done nudge the thing done (with what Undo needs). */
export function fileNudge(os: LifeOSContext, module: string, c: Candidate, x: { passId: string; line: string; at: number }): Nudge {
  const n = os.brain.nudges.add(module, c, x);
  const filing = os.filings.add({ source: 'brain', sourceRef: x.passId, kind: NUDGE_FILING[c.shape], entityId: c.subjectId ?? null, label: x.line, confidence: 1 });
  let undo: unknown;
  if (c.shape === 'done') {
    try {
      undo = brainOf(os, module)?.act?.(os, 'apply', n);
    } catch (e) {
      console.warn(`brain: ${module} apply failed`, e);
    }
  }
  os.brain.nudges.update(n.id, { filingId: filing.id, undo: undo ?? null, at: x.at });
  return os.brain.nudges.get(n.id)!;
}

/** At most three a day across LifeOS, urgent first; inside quiet hours they wait until it ends. */
function notifyFiled(os: LifeOSContext, filed: Nudge[], all: Brains[], now: number): number {
  let slots = NOTIFY_PER_DAY - os.brain.nudges.notifiedToday(now);
  if (slots <= 0) return 0;
  const quiet = notifyPrefs(os).quiet;
  const at = outOfQuiet(now, quiet);
  let n = 0;
  for (const x of [...filed].sort((a, b) => Number(b.urgent) - Number(a.urgent))) {
    if (slots-- <= 0) break;
    void os.notify({ title: all.find((b) => b.module === x.module)?.name ?? 'LifeOS', body: x.line, at: at > now ? at : undefined, data: { route: '/check', nudgeId: x.id } });
    // The time it shows: now, or when quiet hours end (the notification plan keeps it until then).
    os.brain.nudges.update(x.id, { notifiedAt: Math.max(at, now), at: now });
    n++;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* When                                                                  */
/* ------------------------------------------------------------------ */

interface PassMarks {
  day: string;
  morning?: number;
  evening?: number;
  last?: { at: number; pass: PassName; passId: string };
}

function markPass(os: LifeOSContext, pass: PassName, at: number, passId: string) {
  const cur = os.settings.get<PassMarks>('brain.passes', { day: '' });
  const day = iso(at);
  const next: PassMarks = cur.day === day ? { ...cur } : { day };
  if (pass === 'morning' || pass === 'evening') next[pass] = at;
  // An evening pass also stands for the morning one it caught up.
  if (pass === 'evening' && !next.morning) next.morning = at;
  next.last = { at, pass, passId };
  os.settings.set('brain.passes', next);
}

/** The last pass today (for "Updated 7 pm"), or null. */
export function lastPassToday(os: LifeOSContext, now = Date.now()): { at: number; pass: PassName } | null {
  const m = os.settings.get<PassMarks>('brain.passes', { day: '' });
  return m.day === iso(now) && m.last ? m.last : null;
}

const atTime = (now: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return startOfDay(now) + ((h ?? 0) * 60 + (m ?? 0)) * 60_000;
};

/** Which scheduled pass is due now: the evening one from its time, else the morning one from its time; once a day each. */
export function passDue(os: LifeOSContext, now = Date.now()): 'morning' | 'evening' | null {
  const s = brainSettings(os);
  if (!s.on) return null;
  const m = os.settings.get<PassMarks>('brain.passes', { day: '' });
  const done = m.day === iso(now) ? m : { day: '' } as PassMarks;
  if (now >= atTime(now, s.evening)) return done.evening ? null : 'evening';
  if (now >= atTime(now, s.morning)) return done.morning ? null : 'morning';
  return null;
}

/* ------------------------------------------------------------------ */
/* Your answer on a card                                                 */
/* ------------------------------------------------------------------ */

export type CardVerb = 'yes' | 'no' | 'later' | 'undo';

/**
 * What a card's buttons do. Yes: the module's verb (it may hand back a link to
 * open). Not this: never again for this key, and the module may undo its
 * guess. Later: ticked, nothing else. Undo (a done nudge): the module puts it back.
 */
export function answerNudge(os: LifeOSContext, nudgeId: string, verb: CardVerb): ActResult | null {
  const n = os.brain.nudges.get(nudgeId);
  if (!n || n.state !== 'open') return null;
  const def = brainOf(os, n.module);
  let out: unknown = null;
  try {
    if (verb === 'yes' || verb === 'no' || verb === 'undo') out = def?.act?.(os, verb, n);
  } catch (e) {
    console.warn(`brain: ${n.module} ${verb} failed`, e);
  }
  if (verb === 'no') os.brain.learned.put(`not-this:${n.key}`, n.title, { module: n.module, kind: 'not-this', source: 'you' });
  os.brain.nudges.update(n.id, { state: verb === 'undo' ? 'undone' : verb });
  if (n.filingId) {
    if (verb === 'undo') os.filings.markUndone(n.filingId);
    else os.filings.setChecked(n.filingId);
  }
  const r = out as ActResult | null;
  return r && typeof r === 'object' && typeof r.open === 'string' ? { open: r.open } : {};
}
