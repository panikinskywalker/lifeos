import { brainSettings, type BrainModel } from '@core/brain';
import { recordUsage } from '@core/ai/routing';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { OutingData, OutingKind, TripData } from './types';
import { daysToStart, isoOf, linkedTo } from './trips';
import { nightsOf, stopSpan, stopsOf } from './stops';
import { addThing, thingsOf, thingStatus, type ThingStatus } from './outings';
import { checklistOf, isDone, notesOf, type TaskLike } from './prep';
import { tripBills } from './money';

/**
 * The trip copilot (the trip template, JP-Copilot): a question about the trip
 * answered by Claude through the app's brain, with the user's key and inside
 * the brain's daily budget, logged in Sent to Claude like every call. What
 * leaves is the trip as plain records (stops and nights, stays and journeys,
 * things to do, the checklist and notes, the expenses), each with a short key;
 * never a booking reference, a mail or a phone number. Claude may propose
 * changes (add a thing to do, a Task, a note, an expense; tick a Task; set a
 * stay's check-in); nothing is saved until you press Save to the trip, and
 * that has an Undo.
 */

export const COPILOT_SYSTEM = `You are the trip copilot inside LifeOS, a personal app on one person's phone. They are planning or on a trip with friends. You get the trip as records (each with a short key like s1, t4) and their question. Answer from the records and general travel knowledge.

How to answer:
- reply: 1 to 4 short sentences, plain and warm, British English. No greetings, no emoji, no exclamation marks, never an em dash (use a colon or a comma). Lead with the answer. Use the records' own names, days and amounts.
- changes: only when the question asks for something to be added, planned, ticked or noted, or when one obvious change would help. Each change is one of:
  add_thing (title, stop = a stop key, day = YYYY-MM-DD or "", kind = see|eat|do|relax|shop, status = idea|want|planned),
  add_task (title, section = to-do|documents|money|packing, due = YYYY-MM-DD or ""),
  add_note (title, line = the detail, priority = low|medium|high|urgent),
  add_bill (title, amount, currency, category = food|transport|stays|fun|shopping|other, day = YYYY-MM-DD),
  tick_task (ref = the task key),
  set_check_in (ref = the stay key, value = the check-in time like 15:00-23:00).
  Fill unused fields with "" or 0. Never invent prices, times or bookings as facts; an idea is an idea.
- needs: the outside sources the question needs that you cannot reach here: "booking" (Booking.com, to find or book things and stays) or "gmail" (their mail). Usually empty.
- LifeOS never books, pays or sends on its own; never word the reply as if it had.`;

export const COPILOT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'changes', 'needs'],
  properties: {
    reply: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'ref', 'title', 'stop', 'day', 'kind', 'status', 'section', 'due', 'line', 'priority', 'amount', 'currency', 'category', 'value'],
        properties: {
          type: { type: 'string', enum: ['add_thing', 'add_task', 'add_note', 'add_bill', 'tick_task', 'set_check_in'] },
          ref: { type: 'string' },
          title: { type: 'string' },
          stop: { type: 'string' },
          day: { type: 'string' },
          kind: { type: 'string' },
          status: { type: 'string' },
          section: { type: 'string' },
          due: { type: 'string' },
          line: { type: 'string' },
          priority: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          category: { type: 'string' },
          value: { type: 'string' },
        },
      },
    },
    needs: { type: 'array', items: { type: 'string', enum: ['booking', 'gmail'] } },
  },
} as const;

type Plainish = string | number | boolean | null;
export interface TripContext {
  /** What leaves, as JSON. */
  record: Record<string, unknown>;
  /** Short key → record id. */
  keys: Map<string, string>;
  /** How many records went (for the Sent log). */
  count: number;
}

interface Ev {
  kind?: string;
  startAt?: number;
  endAt?: number;
  booking?: string;
  checkIn?: string;
  checkOut?: string;
  toPay?: number;
  cost?: number;
  currency?: string;
  mode?: string;
  plan?: string;
  stopId?: string;
  fromStopId?: string;
  toStopId?: string;
  flightNo?: string;
  location?: string;
}

const drop = (o: Record<string, Plainish | undefined>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && v !== false));

/** The trip as Claude reads it: plain records with short keys, no references, no mail. */
export function tripContext(os: LifeOSContext, trip: ObjectRecord<TripData>, now = Date.now()): TripContext {
  const keys = new Map<string, string>();
  const ids = new Map<string, string>();
  const key = (prefix: string, id: string) => {
    const had = ids.get(id);
    if (had) return had;
    let n = 1;
    while (keys.has(`${prefix}${n}`)) n++;
    const k = `${prefix}${n}`;
    keys.set(k, id);
    ids.set(id, k);
    return k;
  };
  const people = (trip.data.personIds ?? []).map((id) => os.records.get(id)?.title).filter(Boolean) as string[];
  const nights = nightsOf(os, trip);
  const stops = stopsOf(os, trip.id).map((s) => {
    const sp = stopSpan(nights, s.id);
    return drop({ key: key('p', s.id), name: s.title, local: s.data.localName, from: sp?.from, to: sp?.to, nights: sp?.nights });
  });
  const stopKey = (id?: string) => (id ? ids.get(id) ?? null : null);
  const ev = linkedTo<Ev>(os, trip.id, 'event').filter((e) => !e.archived && e.data.startAt).sort((a, b) => a.data.startAt! - b.data.startAt!);
  const stays = ev.filter((e) => e.data.kind === 'stay').map((e) => drop({ key: key('s', e.id), name: e.title.replace(/^Stay · /, ''), stop: stopKey(e.data.stopId), from: isoOf(e.data.startAt!), to: e.data.endAt ? isoOf(e.data.endAt) : null, status: e.data.booking ?? 'confirmed', check_in: e.data.checkIn ?? 'not known', check_out: e.data.checkOut, to_pay: e.data.toPay ? Math.round(e.data.toPay) : null, currency: e.data.currency }));
  const moves = ev.filter((e) => e.data.kind !== 'stay').map((e) => drop({ key: key('j', e.id), what: e.title, kind: e.data.kind, day: isoOf(e.data.startAt!), time: new Date(e.data.startAt!).toTimeString().slice(0, 5), mode: e.data.mode, status: e.data.booking ?? e.data.plan, flight: e.data.flightNo }));
  const things = (thingsOf(os, trip.id) as ObjectRecord<OutingData>[]).map((t) => drop({ key: key('t', t.id), title: t.title, kind: t.data.kind, stop: stopKey(t.data.stopId), day: t.data.day, until: t.data.until, status: t.data.kind === 'event' ? null : thingStatus(t), cost: t.data.cost ?? null }));
  const tasks = checklistOf(os, trip.id).map((t) => drop({ key: key('c', t.id), title: t.title, section: t.data.section, due: t.data.dueDate, done: isDone(t) }));
  const notes = notesOf(os, trip.id).map((t) => drop({ key: key('n', t.id), title: t.title, priority: t.data.priority }));
  const bills = tripBills(os, trip.id).slice(0, 40).map((b) => drop({ what: b.title, amount: Math.round(b.data.amount), currency: b.data.currency, day: b.data.date, kind: b.data.kind }));
  const record = {
    today: isoOf(now),
    trip: drop({ destination: trip.data.destination, from: trip.data.startDate, to: trip.data.endDate, starts_in_days: daysToStart(trip.data, now), local_currency: trip.data.localCurrency, inr_per_local: trip.data.fxRate, travellers: ['you', ...people].join(', ') }),
    stops,
    stays,
    journeys: moves,
    things,
    checklist: tasks,
    notes,
    expenses: bills,
  };
  return { record, keys, count: stops.length + stays.length + moves.length + things.length + tasks.length + notes.length + bills.length + 1 };
}

export type ChangeType = 'add_thing' | 'add_task' | 'add_note' | 'add_bill' | 'tick_task' | 'set_check_in';
export interface Change {
  type: ChangeType;
  ref: string;
  title: string;
  stop: string;
  day: string;
  kind: string;
  status: string;
  section: string;
  due: string;
  line: string;
  priority: string;
  amount: number;
  currency: string;
  category: string;
  value: string;
}

export interface CopilotAnswer {
  reply: string;
  changes: Change[];
  needs: Array<'booking' | 'gmail'>;
}

const TYPES: ChangeType[] = ['add_thing', 'add_task', 'add_note', 'add_bill', 'tick_task', 'set_check_in'];
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const iso = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(s(v)) ? s(v) : '');

/** The answer, read leniently: unknown change types and empty titles are left out. */
export function parseCopilot(v: unknown): CopilotAnswer | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.reply !== 'string') return null;
  const changes = (Array.isArray(o.changes) ? o.changes : [])
    .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
    .filter((c) => TYPES.includes(c.type as ChangeType))
    .map((c) => ({ type: c.type as ChangeType, ref: s(c.ref), title: s(c.title), stop: s(c.stop), day: iso(c.day), kind: s(c.kind), status: s(c.status), section: s(c.section), due: iso(c.due), line: s(c.line), priority: s(c.priority), amount: typeof c.amount === 'number' && Number.isFinite(c.amount) ? c.amount : 0, currency: s(c.currency).toUpperCase(), category: s(c.category), value: s(c.value) }))
    .filter((c) => (c.type === 'tick_task' || c.type === 'set_check_in' ? !!c.ref : !!c.title) && (c.type !== 'add_bill' || c.amount > 0) && (c.type !== 'set_check_in' || !!c.value));
  const needs = (Array.isArray(o.needs) ? o.needs : []).filter((x): x is 'booking' | 'gmail' => x === 'booking' || x === 'gmail');
  return { reply: o.reply.trim(), changes, needs: [...new Set(needs)] };
}

export type CopilotResult = { ok: true; answer: CopilotAnswer; keys: Map<string, string> } | { ok: false; note: 'off' | 'no key' | 'over budget' | 'error'; error?: string };

/** One question, one call: budget first, the Sent to Claude log after. */
export async function askCopilot(os: LifeOSContext, model: BrainModel | null, trip: ObjectRecord<TripData>, question: string, history: Array<{ q: string; a: string }> = [], now = Date.now()): Promise<CopilotResult> {
  const settings = brainSettings(os);
  if (!settings.on) return { ok: false, note: 'off' };
  if (!model) return { ok: false, note: 'no key' };
  const ctx = tripContext(os, trip, now);
  const maxTokens = 1500;
  const user = `${history.length ? `Earlier in this chat:\n${history.slice(-3).map((h) => `Q: ${h.q}\nA: ${h.a}`).join('\n')}\n\n` : ''}Question: ${question.trim()}\n\nThe trip:\n${JSON.stringify(ctx.record)}`;
  const estimate = Math.ceil((COPILOT_SYSTEM.length + user.length) / 4) + maxTokens;
  if (os.brain.sent.tokensToday(now) + estimate > settings.budget) return { ok: false, note: 'over budget' };
  const base = { at: now, pass: 'copilot', why: 'you asked the trip copilot', model: model.model, lines: [`Travel · question: ${question.trim().slice(0, 200)}`, `Travel · ${trip.data.destination}: ${ctx.count} records (stops, stays, journeys, things, checklist, notes, expenses), no references`], records: ctx.count };
  try {
    const r = await model.complete({ system: COPILOT_SYSTEM, user, maxTokens, schema: COPILOT_SCHEMA as unknown as Record<string, unknown> });
    const answer = parseCopilot(parseJson(r.text));
    os.brain.sent.add({ ...base, ...r.usage, outcome: answer ? 'ok' : 'error', error: answer ? null : 'The answer was not the expected JSON' });
    recordUsage(os, { provider: 'claude', model: model.model, purpose: 'brain', input: r.usage.input + r.usage.cacheRead + r.usage.cacheWrite, output: r.usage.output, at: now });
    return answer ? { ok: true, answer, keys: ctx.keys } : { ok: false, note: 'error', error: 'The answer was not the expected JSON' };
  } catch (e) {
    const usage = (e as { usage?: { input: number; output: number; cacheRead: number; cacheWrite: number } }).usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    os.brain.sent.add({ ...base, ...usage, outcome: 'error', error: (e as Error).message.slice(0, 300) });
    return { ok: false, note: 'error', error: (e as Error).message };
  }
}

function parseJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** A change in one line, as the Proposed changes card shows it; `sign` is + for new, ~ for a change. */
export function changeLine(os: LifeOSContext, c: Change, keys: Map<string, string>): { sign: '+' | '~'; text: string } {
  const title = (k: string) => {
    const id = keys.get(k);
    return id ? os.records.get(id)?.title.replace(/^Stay · /, '') ?? k : k;
  };
  const day = (d: string) => (d ? ` · ${Number(d.slice(8, 10))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(d.slice(5, 7)) - 1]}` : '');
  const STATUS: Record<string, string> = { idea: 'Idea', want: 'Want to', planned: 'Planned' };
  switch (c.type) {
    case 'add_thing':
      return { sign: '+', text: `${c.stop && keys.has(c.stop) ? `${title(c.stop)}: ` : ''}${c.title} · ${STATUS[c.status] ?? 'Idea'}${day(c.day)}` };
    case 'add_task':
      return { sign: '+', text: `To-do: ${c.title}${day(c.due)}` };
    case 'add_note':
      return { sign: '+', text: `Note: ${c.title}` };
    case 'add_bill':
      return { sign: '+', text: `Expense: ${c.title} · ${Math.round(c.amount).toLocaleString('en-US')} ${c.currency || 'INR'}` };
    case 'tick_task':
      return { sign: '~', text: `Done: ${title(c.ref)}` };
    case 'set_check_in':
      return { sign: '~', text: `${title(c.ref)}: check-in ${c.value}` };
  }
}

/** How an expense is saved: the board passes finance's Bill maker (a module never imports another). */
export type MakeBill = (title: string, input: { amount: number; currency: string; date: string; category: string; tripId: string; groupId?: string }) => string;

const KINDS: OutingKind[] = ['see', 'eat', 'do', 'relax', 'shop'];
const STATUSES: ThingStatus[] = ['idea', 'want', 'planned'];
const SECTIONS = ['to-do', 'documents', 'money', 'packing'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

/** Save the changes to the trip; returns how many were saved and the Undo. */
export function applyChanges(os: LifeOSContext, trip: ObjectRecord<TripData>, changes: Change[], keys: Map<string, string>, makeBill?: MakeBill, now = Date.now()): { saved: number; undo: () => void } {
  const created: string[] = [];
  const restore: Array<() => void> = [];
  const today = isoOf(now);
  for (const c of changes) {
    if (c.type === 'add_thing') {
      const stopId = keys.get(c.stop);
      const t = addThing(os, trip.id, c.title, { kind: KINDS.includes(c.kind as OutingKind) ? (c.kind as OutingKind) : 'do', stopId: stopId && os.records.get(stopId)?.object === 'stop' ? stopId : undefined, day: c.day || undefined, status: STATUSES.includes(c.status as ThingStatus) ? (c.status as ThingStatus) : 'idea', suggested: true });
      created.push(t.id);
    } else if (c.type === 'add_task' || c.type === 'add_note') {
      if (!os.registry.objects.has('task')) continue;
      const note = c.type === 'add_note';
      const data: TaskLike = { tripId: trip.id, priority: note ? ((PRIORITIES.includes(c.priority) ? c.priority : 'medium') as TaskLike['priority']) : 'medium', section: note ? 'notes' : SECTIONS.includes(c.section) ? c.section : 'to-do', ...(c.due && !note ? { dueDate: c.due } : {}), ...(c.line ? { notes: c.line } : {}) };
      created.push(os.records.create({ object: 'task', title: c.title, status: 'todo', data }, 'user').id);
    } else if (c.type === 'add_bill') {
      if (!makeBill) continue;
      created.push(makeBill(c.title, { amount: c.amount, currency: c.currency || 'INR', date: c.day || today, category: c.category || 'other', tripId: trip.id, groupId: trip.data.groupId }));
    } else if (c.type === 'tick_task') {
      const id = keys.get(c.ref);
      const t = id ? os.records.get<TaskLike>(id) : undefined;
      if (!t || t.object !== 'task' || isDone(t)) continue;
      const was = t.status ?? 'todo';
      os.records.update<TaskLike>(t.id, { status: 'done', data: { completedAt: now } }, 'user');
      restore.push(() => os.records.get(t.id) && os.records.update<TaskLike>(t.id, { status: was, data: { completedAt: undefined } }, 'user'));
    } else if (c.type === 'set_check_in') {
      const id = keys.get(c.ref);
      const e = id ? os.records.get<Ev>(id) : undefined;
      if (!e || e.object !== 'event') continue;
      const was = e.data.checkIn;
      os.records.update<Ev>(e.id, { data: { checkIn: c.value } }, 'user');
      restore.push(() => os.records.get(e.id) && os.records.update<Ev>(e.id, { data: { checkIn: was } }, 'user'));
    } else continue;
  }
  return {
    saved: created.length + restore.length,
    undo: () => {
      for (const id of created) if (os.records.get(id)) os.records.delete(id, 'user');
      for (const f of restore.reverse()) f();
    },
  };
}
