import type { LifeOSContext } from '../registry/context';
import type { AiToolDef } from '../registry/types';
import type { ChatMessage, ContentBlock, LLMProvider } from '../ai/provider';
import { parseMessage } from '../ai/parser';
import { toolSpec } from '../ai/assistant';
import { extrasOf } from '../ai/cards';
import { exactUndo, graphTools, newSession, reverseWrite } from '../graph/tools';
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
  status: 'done' | 'pending' | 'failed';
  via: 'parser' | 'model' | 'none';
  items: number;
  error?: string;
}

/** The filing instructions: short, because free tiers count tokens per minute. */
export function filingPrompt(os: LifeOSContext, subject?: { type: string; title: string } | null, now = new Date()): string {
  const keep = ['person', 'place', 'org', 'trip', 'event', 'task', 'vehicle', 'asset', 'subscription', 'document', 'routine', 'note', 'project', 'account'];
  const types = keep
    .map((t) => os.registry.entityTypes.get(t))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => `${d.type}: ${d.fields.filter((f) => f.type !== 'relation' && f.key !== 'notes').slice(0, 7).map((f) => f.key).join(', ')}`)
    .join('\n');
  const day = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `You file what the user said into their personal life graph, using the tools. Today is ${day}.
${subject ? `The user is on the page of ${subject.type} "${subject.title}": "this", "she", "he", "it" mean it.\n` : ''}Break what they said into:
- things mentioned → upsert_node (put details in attributes)
- more details about a thing → set_attributes (known fields; anything else goes to its notes)
- something that happened → record_event with kind, when, and roles (with / at / from / to)
- relationships → link (works_at, family_of, friend_of, knows, lives_in, owns…)
- to-dos → create_task · money → log_spend · a chore or service done on something they own → log_done
Rules: never ask questions. File only what was said; never invent people, dates or amounts. Feelings and opinions alone are not filed. "I"/"me" is the user — never a record. Keep dates as said ("8 Sept", "yesterday"). When everything is filed, reply "done".
Record types (type: fields):
${types}`;
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

/**
 * File one dump. No provider and nothing the parser understands → it waits
 * (runs again when a key is added or the phone is online).
 */
export async function extractDump(os: LifeOSContext, dumpId: string, provider?: LLMProvider | null): Promise<ExtractResult> {
  const dump = os.dumps.get(dumpId);
  if (!dump) throw new Error('dump not found');
  if (dump.status === 'done' || dump.status === 'skipped') return { status: 'done', via: 'none', items: os.dumps.extractions(dumpId).length };
  const session = newSession(dump.id, { source: dump.subjectId ? 'record-voice' : 'dump', subjectId: dump.subjectId });

  // Parser first: one everyday sentence ("did laundry", "spent 450 on lunch"), filed offline.
  const oneLine = dump.body.trim().replace(/\s+/g, ' ');
  const plan = !dump.subjectId && !/\n\s*\S/.test(dump.body.trim()) ? parseMessage(os, oneLine) : null;
  if (plan && WRITE_INTENTS.has(plan.intent)) {
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
    if (!failed) {
      os.dumps.setStatus(dumpId, 'done');
      return { status: 'done', via: 'parser', items: os.dumps.extractions(dumpId).length };
    }
  }

  if (!provider) {
    if (dump.error !== NO_PROVIDER) os.dumps.setStatus(dumpId, 'pending', NO_PROVIDER);
    return { status: 'pending', via: 'none', items: 0 };
  }
  const subject = dump.subjectId ? os.entities.get(dump.subjectId) : undefined;
  const system = filingPrompt(os, subject ? { type: os.registry.entityTypes.get(subject.type)?.label.toLowerCase() ?? subject.type, title: subject.title } : null);
  const tools = graphTools(session);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const specs = tools.map(toolSpec);
  try {
    for (const part of chunks(dump.body)) await fileChunk(os, provider, system, specs, byName, part);
    os.dumps.setStatus(dumpId, 'done');
    return { status: 'done', via: 'model', items: session.writes };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    const msg = (e as Error).message.slice(0, 300);
    // Part of it is already filed (and in To check): don't file it twice on a retry.
    if (session.writes) {
      os.dumps.setStatus(dumpId, 'done', `partly filed: ${msg}`);
      return { status: 'done', via: 'model', items: session.writes, error: msg };
    }
    os.dumps.setStatus(dumpId, 'failed', msg);
    return { status: 'failed', via: 'model', items: 0, error: msg };
  }
}

async function fileChunk(os: LifeOSContext, provider: LLMProvider, system: string, specs: ReturnType<typeof toolSpec>[], byName: Map<string, AiToolDef>, text: string) {
  const messages: ChatMessage[] = [{ role: 'user', content: text }];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const r = await provider.complete({ system, messages, tools: specs, maxTokens: 1200 });
    messages.push({ role: 'assistant', content: r.content });
    const calls = r.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
    if (!calls.length) return;
    const results: ContentBlock[] = [];
    for (const c of calls) {
      const def = byName.get(c.name);
      let out: unknown;
      let isError = false;
      try {
        if (!def) throw new Error(`unknown tool ${c.name}`);
        out = await def.run(def.input.parse(c.input), os);
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
  const type = entityId ? os.entities.get(entityId)?.type : undefined;
  const label = String(out.logged ?? out.done ?? out.remembered ?? (out.title ? `${os.registry.entityTypes.get(String(input.type ?? type))?.label ?? 'Record'}: ${out.title}` : null) ?? input.title ?? name.replace(/_/g, ' '));
  const row = os.dumps.addExtraction({ dumpId: dump.id, kind: name === 'remember_fact' ? 'fact' : (type ?? name.replace(/^create_/, '')), action: created ? 'created' : 'logged', entityId, factId: (out.factId as string) ?? null, label });
  const undo = extrasOf(out).undo;
  if (undo) exactUndo.set(row.id, undo);
  return out;
}

/** Everything still waiting, oldest first; one at a time so free tiers aren't flooded. */
export async function extractPending(os: LifeOSContext, provider?: LLMProvider | null, opts: { max?: number } = {}): Promise<ExtractResult[]> {
  const out: ExtractResult[] = [];
  for (const d of os.dumps.pending().slice(0, opts.max ?? 10)) out.push(await extractDump(os, d.id, provider));
  return out;
}

/** Cancel one filed item (To check › cancel, or Undo under a dump). */
export function undoExtraction(os: LifeOSContext, extractionId: string): boolean {
  return reverseWrite(os, extractionId);
}
