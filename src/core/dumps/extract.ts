import { activeHabits, habitSaid } from '../habits/habits';
import type { LifeOSContext } from '../registry/context';
import type { AiToolDef } from '../registry/types';
import type { ChatMessage, ContentBlock, LLMProvider } from '../ai/provider';
import { parseMessage } from '../ai/parser';
import { stripNulls, toolSpec } from '../ai/assistant';
import { extrasOf } from '../ai/cards';
import { exactUndo, graphTools, newSession, reverseWrite } from '../graph/tools';
import { classifyFailure } from '../ai/limits';
import type { Dump } from '../repo/dumpRepo';

/**
 * Filing what you said (docs/GRAPH.md §3). Runs after the dump is saved,
 * never before, and never asks: the parser takes one everyday sentence
 * offline; anything else goes to the agent on the free chain with the graph
 * tools, which find-or-create the things mentioned, set their details,
 * record what happened with who and where, link things and add to-dos. Every
 * write lands in To check with Undo.
 */

/** Error text on a dump that waits for a model key (the parser couldn't read it). */
export const NO_PROVIDER = 'no provider';

const WRITE_INTENTS = new Set(['done', 'expense', 'paid_back', 'split', 'recharge', 'remind', 'create_routine', 'remember']);
const MAX_ROUNDS = 6;
const CHUNK = 1400;

export interface ExtractResult {
  /** pending = no key yet (the parser did what it could) · waiting = a provider limit/outage, will resume. */
  status: 'done' | 'pending' | 'waiting' | 'failed';
  via: 'parser' | 'model' | 'none';
  items: number;
  error?: string;
}

/** The filing instructions: short, because free tiers count tokens per minute. */
export function filingPrompt(os: LifeOSContext, subject?: { type: string; title: string } | null, now = new Date()): string {
  const keep = ['person', 'place', 'org', 'trip', 'event', 'task', 'vehicle', 'asset', 'subscription', 'document', 'routine', 'note', 'project', 'account'];
  const types = keep
    .map((t) => os.registry.objects.get(t))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => `${d.id}: ${d.fields.filter((f) => f.type !== 'link' && f.key !== 'notes').slice(0, 7).map((f) => f.key).join(', ')}`)
    .join('\n');
  const day = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `You file what the user said into their personal life graph, using the tools. Today is ${day}.
${subject ? `The user is on the page of ${subject.type} "${subject.title}": "this", "she", "he", "it" mean it.\n` : ''}Go through it sentence by sentence and file everything:
- each thing that happened (flight, dinner, meeting, visit, call…) → its own record_event with kind, when, and roles (with / at / from / to). The people and places in roles are created for you — don't upsert them first.
- people or things mentioned outside an event → upsert_node (details in attributes; "new friend / colleague / neighbour" sets relationship)
- more details about a thing → set_attributes (known fields; anything else goes to its notes)
- relationships ("her brother Mike", "works at Zomato") → link (family_of, friend_of, works_at, knows, lives_in, owns…)
- every amount spent or received → log_spend (the card or bank goes in account) · to-dos → create_task · a chore or service done on something they own → log_done${habitLine(os)}
Rules: never ask questions. File only what was said; never invent people, dates or amounts. Feelings and opinions alone are not filed. "I"/"me" is the user — never a record, never linked. Keep dates as said ("8 Sept", "yesterday"). Reply "done" only after every sentence is filed.
Record types (type: fields):
${types}`;
}

function habitLine(os: LifeOSContext): string {
  const hs = activeHabits(os);
  return hs.length ? `\n- a habit they track done (${hs.map((h) => h.title).slice(0, 12).join(', ')}) → check_in` : '';
}

/** Split a long dump at paragraph / sentence boundaries so each request stays small. */
export function chunks(body: string, size = CHUNK): string[] {
  const text = body.trim();
  if (text.length <= size) return [text];
  const parts = text.split(/(?<=[.!?])\s+|\n+/).filter((p) => p.trim());
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (cur && cur.length + p.length + 1 > size) {
      out.push(cur.trim());
      cur = '';
    }
    cur += `${p} `;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Sentences, as said (keeps "Dr." etc. together well enough for everyday speech). */
export function sentences(body: string): string[] {
  return body.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
}

/**
 * File one dump. The parser files the everyday sentences in it straight
 * away (once); the model files the rest, chunk by chunk, resuming where it
 * stopped. Limits and outages make it wait (never fail); with no key it
 * waits for one.
 */
export async function extractDump(os: LifeOSContext, dumpId: string, provider?: LLMProvider | null): Promise<ExtractResult> {
  const dump = os.dumps.get(dumpId);
  if (!dump) throw new Error('dump not found');
  if (dump.status === 'done' || dump.status === 'skipped') return { status: 'done', via: 'none', items: os.dumps.extractions(dumpId).length };
  const session = newSession(dump.id, { source: dump.subjectId ? 'record-voice' : 'dump', subjectId: dump.subjectId, saidNew: /\bnew\b/i.test(dump.body) });

  // 1. Parser first, once: every everyday sentence ("did laundry", "spent 450 on lunch") is filed offline now.
  let progress = dump.progress;
  if (!progress.parsed) {
    const rest = dump.subjectId ? dump.body.trim() : await parserPass(os, dump);
    progress = { parsed: true, rest, chunksDone: 0 };
    os.dumps.setProgress(dumpId, progress);
  }
  const rest = (progress.rest ?? '').trim();
  const parsedItems = os.dumps.extractions(dumpId).length;
  if (!rest) {
    os.dumps.setStatus(dumpId, 'done');
    return { status: 'done', via: 'parser', items: parsedItems };
  }

  // 2. The rest needs a model.
  if (!provider) {
    if (dump.error !== NO_PROVIDER || dump.retryAt) os.dumps.setStatus(dumpId, 'pending', NO_PROVIDER);
    return { status: 'pending', via: parsedItems ? 'parser' : 'none', items: parsedItems };
  }
  const subject = dump.subjectId ? os.records.get(dump.subjectId) : undefined;
  const system = filingPrompt(os, subject ? { type: os.registry.objects.get(subject.object)?.label.toLowerCase() ?? subject.object, title: subject.title } : null);
  const tools = graphTools(session);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const specs = tools.map(toolSpec);
  const parts = chunks(rest);
  try {
    for (let i = progress.chunksDone ?? 0; i < parts.length; i++) {
      // Resuming (or the parser took some sentences): tell the model what's already filed so nothing doubles.
      const filed = os.dumps.extractions(dumpId).filter((x) => !x.undone).map((x) => `- ${x.label}`);
      const sys = filed.length ? `${system}\nAlready filed from this text — don't file these again:\n${filed.slice(-40).join('\n')}` : system;
      await fileChunk(os, provider, sys, specs, byName, parts[i]!);
      progress = { ...progress, chunksDone: i + 1 };
      os.dumps.setProgress(dumpId, progress);
    }
    os.dumps.setStatus(dumpId, 'done');
    return { status: 'done', via: 'model', items: os.dumps.extractions(dumpId).length };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    const f = classifyFailure(e);
    if (f.kind === 'wait') {
      // Not a failure: file it when the provider is back. Never counts toward giving up.
      os.dumps.setWaiting(dumpId, f.reason, f.until);
      return { status: 'waiting', via: 'model', items: os.dumps.extractions(dumpId).length, error: f.reason };
    }
    os.dumps.setStatus(dumpId, 'failed', f.reason);
    return { status: 'failed', via: 'model', items: os.dumps.extractions(dumpId).length, error: f.reason };
  }
}

/** Files every sentence the parser understands; returns the sentences left for the model. */
async function parserPass(os: LifeOSContext, dump: Dump): Promise<string> {
  const left: string[] = [];
  for (const sentence of sentences(dump.body)) {
    // "did yoga", "went for a run": tick the habit, on the phone.
    const h = sentence.length <= 200 ? habitSaid(os, sentence, dump.createdAt) : null;
    if (h && os.registry.aiTools.has('habit_check_in')) {
      const out = (await runLogged(os, dump, 'habit_check_in', { habit: h.habit.title, date: h.date, entityId: h.habit.id })) as { error?: unknown };
      if (!out?.error) continue;
    }
    const plan = sentence.length <= 200 ? parseMessage(os, sentence.replace(/[.!]+$/, '')) : null;
    if (!plan || !WRITE_INTENTS.has(plan.intent)) {
      left.push(sentence);
      continue;
    }
    const results: unknown[] = [];
    let failed = false;
    for (const step of plan.steps) {
      const call = step(results);
      if (!call) break;
      const out = await runLogged(os, dump, call.name, call.input);
      results.push(out);
      if ((out as { error?: unknown })?.error) {
        failed = true;
        break;
      }
    }
    if (failed && !results.some((r) => !(r as { error?: unknown })?.error)) left.push(sentence);
  }
  return left.join(' ');
}

async function fileChunk(os: LifeOSContext, provider: LLMProvider, system: string, specs: ReturnType<typeof toolSpec>[], byName: Map<string, AiToolDef>, text: string) {
  const messages: ChatMessage[] = [{ role: 'user', content: text }];
  let nudged = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const r = await provider.complete({ system, messages, tools: specs, maxTokens: 1200 });
    messages.push({ role: 'assistant', content: r.content });
    const calls = r.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
    if (!calls.length) {
      // Some models answer in prose the first time ("Got it, Karan works at…"). One nudge, then accept it
      // (a rant with nothing to file is a legitimate empty answer).
      if (round === 0 && !nudged) {
        nudged = true;
        messages.push({ role: 'user', content: 'Nothing was filed. File what I said now by calling the tools — do not reply in text. If there is truly nothing to file, reply "done".' });
        continue;
      }
      return;
    }
    const results: ContentBlock[] = [];
    for (const c of calls) {
      const def = byName.get(c.name);
      let out: unknown;
      let isError = false;
      try {
        if (!def) throw new Error(`unknown tool ${c.name}`);
        out = await def.run(def.input.parse(stripNulls(c.input)), os);
        isError = !!(out as { error?: unknown })?.error;
      } catch (e) {
        out = { error: (e as Error).message.slice(0, 300) };
        isError = true;
      }
      results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out ?? null).slice(0, 1500), is_error: isError });
    }
    messages.push({ role: 'user', content: results });
  }
}

/** A parser plan's tool call, logged in To check like the graph tools' writes. */
async function runLogged(os: LifeOSContext, dump: Dump, name: string, input: Record<string, unknown>): Promise<unknown> {
  const def = os.registry.aiTools.get(name);
  if (!def) return { error: `unknown tool ${name}` };
  let out: Record<string, unknown>;
  try {
    out = (await def.run(def.input.parse(input), os)) as Record<string, unknown>;
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (out?.error || out?.alreadyKnown) return out;
  if (name === 'split_transaction' || name === 'settle_debt') return out; // the money itself was logged by create_entity
  const created = name.startsWith('create_');
  const entityId = ((created ? out.id : (input.entityId ?? (input.cycleId ? os.cycles.get(String(input.cycleId))?.entityId : undefined))) as string | undefined) ?? null;
  const type = entityId ? os.records.get(entityId)?.object : undefined;
  const label = String(out.logged ?? out.done ?? out.remembered ?? (out.title ? `${os.registry.objects.get(String(input.type ?? type))?.label ?? 'Record'}: ${out.title}` : null) ?? input.title ?? name.replace(/_/g, ' '));
  const row = os.dumps.addExtraction({ dumpId: dump.id, kind: name === 'remember_fact' ? 'fact' : (type ?? name.replace(/^create_/, '')), action: created ? 'created' : 'logged', entityId, factId: (out.factId as string) ?? null, label });
  const undo = extrasOf(out).undo;
  if (undo) exactUndo.set(row.id, undo);
  return out;
}

/** Everything still waiting, oldest first; one at a time so free tiers aren't flooded. */
export async function extractPending(os: LifeOSContext, provider?: LLMProvider | null, opts: { max?: number; newestFirst?: boolean } = {}): Promise<ExtractResult[]> {
  const out: ExtractResult[] = [];
  // Low on free budget: what was just said matters most; the older backlog waits.
  const due = os.dumps.pending();
  if (opts.newestFirst) due.reverse();
  for (const d of due.slice(0, opts.max ?? 10)) {
    const r = await extractDump(os, d.id, provider);
    out.push(r);
    if (r.status === 'waiting') break; // every provider is resting: the rest would wait too
  }
  return out;
}

/** Cancel one filed item (To check › cancel, or Undo under a dump). */
export function undoExtraction(os: LifeOSContext, extractionId: string): boolean {
  return reverseWrite(os, extractionId);
}
