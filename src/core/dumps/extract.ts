import { z } from 'zod';
import type { LifeOSContext } from '../registry/context';
import type { AiToolDef } from '../registry/types';
import type { LLMProvider } from '../ai/provider';
import { parseMessage } from '../ai/parser';
import { clearMatch, resolveCandidates } from '../ai/lifeTools';
import { parseDateish } from '../ai/createAnything';
import type { Dump } from '../repo/dumpRepo';
import { extrasOf } from '../ai/cards';

/** Exact Undo from the tool that filed an item, while the app is running; after a restart Undo falls back to delete/forget. */
const undoHandles = new Map<string, () => void>();

/**
 * Brain-dump extraction (PRODUCT v4 §1.3, M4.1). Runs after the dump is
 * saved, never before: the parser first (one everyday sentence, offline and
 * free), otherwise one call on the small model chain that returns strict
 * JSON, which is then filed through the same tools Talk uses. Every record
 * or fact it touches is written to dump_extractions and gets a timeline line
 * pointing back at the dump; Undo reverses one item.
 */

const str = z.string().trim().min(1);
const opt = z.string().trim().optional().nullable().transform((v) => v || undefined);
const num = z.union([z.number(), z.string()]).optional().nullable().transform((v) => (v == null || v === '' ? undefined : typeof v === 'number' ? v : Number(String(v).replace(/[^\d.]/g, '')) || undefined));
const list = <T extends z.ZodTypeAny>(t: T) => z.unknown().optional().transform((xs) => (Array.isArray(xs) ? xs : []).flatMap((x) => { const r = t.safeParse(x); return r.success ? [r.data as z.infer<T>] : []; }));

export const ExtractionSchema = z.object({
  people: list(z.object({ name: str, company: opt, role: opt, relationship: opt, whereMet: opt, city: opt, note: opt })),
  tasks: list(z.object({ title: str, due: opt, priority: opt })),
  facts: list(z.object({ text: str, about: opt })),
  events: list(z.object({ about: str, what: str, date: opt, cost: num })),
  transactions: list(z.object({ amount: z.union([z.number(), z.string()]).transform((v) => (typeof v === 'number' ? v : Number(String(v).replace(/[^\d.]/g, '')))), kind: opt, merchant: opt, category: opt, date: opt, account: opt, for: opt, note: opt })),
  cycleUpdates: list(z.object({ about: str, action: z.enum(['done', 'next_due']).catch('done'), date: opt })),
  entitiesToCreate: list(z.object({ type: str, title: str, data: z.record(z.string(), z.unknown()).optional().nullable().transform((d) => d ?? {}) })),
});
export type Extracted = z.infer<typeof ExtractionSchema>;

export function extractionPrompt(os: LifeOSContext, now = new Date()): string {
  const skip = new Set(['person', 'task', 'transaction', 'group']);
  const types = [...os.registry.entityTypes.values()]
    .filter((t) => !skip.has(t.type))
    .map((t) => `${t.type}: ${t.fields.slice(0, 8).map((f) => f.key).join(', ')}`)
    .join('\n');
  const day = now.toISOString().slice(0, 10);
  return `You read one brain dump from the user's personal notes app and pull out structured items. Today is ${day}. Currency INR.
Reply with ONE JSON object and nothing else:
{"people":[{"name","company","role","relationship","whereMet","city","note"}],
 "tasks":[{"title","due","priority"}],
 "facts":[{"text","about"}],
 "events":[{"about","what","date","cost"}],
 "transactions":[{"amount","kind":"expense|income","merchant","category","date","account","for","note"}],
 "cycleUpdates":[{"about","action":"done|next_due","date"}],
 "entitiesToCreate":[{"type","title","data":{}}]}
Rules:
- Only what is clearly stated. Never invent people, amounts, dates, tasks or facts. Opinions, venting and feelings produce nothing on their own. An empty list is the right answer when nothing concrete is said.
- people: someone new or newly described. Put where you met in whereMet, not in facts.
- tasks: only things the user must do ("need to", "have to", "remind me", "should call").
- facts: lasting things worth remembering about a person or thing, one short sentence each; "about" = the name.
- events: something that happened to a thing the user owns ("serviced the car") — "about" names it.
- transactions: money actually spent or received. "for" = the title of an entitiesToCreate item it paid for. "account" = the card/bank named.
- entitiesToCreate: things bought or started (types below). Put the price in the matching field and a warranty as warrantyUntil like "2 years".
- Dates: ISO (YYYY-MM-DD) or relative like "2 years". Amounts: plain numbers ("32k" → 32000).
Record types for entitiesToCreate (type: fields):
${types}`;
}

/** Pull the JSON object out of a model reply (tolerates code fences and chatter). */
export function parseExtraction(text: string): Extracted {
  const body = text.replace(/```(?:json)?/gi, '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('extraction: no JSON in reply');
  return ExtractionSchema.parse(JSON.parse(body.slice(start, end + 1)));
}

export interface ExtractResult {
  status: 'done' | 'pending' | 'failed';
  via: 'parser' | 'model' | 'none';
  items: number;
  error?: string;
}

/** Error text on a dump that waits for a model key (the parser couldn't read it). */
export const NO_PROVIDER = 'no provider';

const WRITE_INTENTS = new Set(['done', 'expense', 'paid_back', 'split', 'recharge', 'remind', 'create_routine', 'remember']);

/**
 * Extract one dump. With no provider and nothing the parser understands the
 * dump stays pending (it'll run when a key is added or the phone is online).
 */
export async function extractDump(os: LifeOSContext, dumpId: string, provider?: LLMProvider | null): Promise<ExtractResult> {
  const dump = os.dumps.get(dumpId);
  if (!dump) throw new Error('dump not found');
  if (dump.status === 'done' || dump.status === 'skipped') return { status: 'done', via: 'none', items: os.dumps.extractions(dumpId).length };
  const filer = new Filer(os, dump);

  // Parser first: one everyday sentence, filed exactly as Talk would.
  const oneLine = dump.body.trim().replace(/\s+/g, ' ');
  const plan = !/\n\s*\S/.test(dump.body.trim()) ? parseMessage(os, oneLine) : null;
  if (plan && WRITE_INTENTS.has(plan.intent)) {
    const results: unknown[] = [];
    for (const step of plan.steps) {
      const call = step(results);
      if (!call) break;
      const out = await filer.run(call.name, call.input);
      results.push(out);
      if ((out as { error?: unknown })?.error) break;
    }
    const failed = results.find((r) => (r as { error?: unknown })?.error) as { error: string } | undefined;
    if (!failed) {
      filer.finish();
      os.dumps.setStatus(dumpId, 'done');
      return { status: 'done', via: 'parser', items: filer.count };
    }
  }

  if (!provider) {
    if (dump.error !== NO_PROVIDER) os.dumps.setStatus(dumpId, 'pending', NO_PROVIDER);
    return { status: 'pending', via: 'none', items: filer.count };
  }
  try {
    const r = await provider.complete({ system: extractionPrompt(os), messages: [{ role: 'user', content: dump.body }], tools: [], maxTokens: 900 });
    const text = r.content.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('');
    await filer.apply(parseExtraction(text));
    filer.finish();
    os.dumps.setStatus(dumpId, 'done');
    return { status: 'done', via: 'model', items: filer.count };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    const msg = (e as Error).message.slice(0, 300);
    os.dumps.setStatus(dumpId, 'failed', msg);
    return { status: 'failed', via: 'model', items: filer.count, error: msg };
  }
}

/** Everything still waiting, oldest first; one at a time so free tiers aren't flooded. */
export async function extractPending(os: LifeOSContext, provider?: LLMProvider | null, opts: { max?: number } = {}): Promise<ExtractResult[]> {
  const out: ExtractResult[] = [];
  for (const d of os.dumps.pending().slice(0, opts.max ?? 10)) {
    const r = await extractDump(os, d.id, provider);
    out.push(r);
    if (r.status === 'pending') break; // no provider: the rest would wait too
  }
  return out;
}

/** Reverse one extracted item: the tool's own Undo when we still have it, else delete what it created / forget its fact. */
export function undoExtraction(os: LifeOSContext, extractionId: string): boolean {
  const x = os.dumps.extraction(extractionId);
  if (!x || x.undone) return false;
  const exact = undoHandles.get(extractionId);
  if (exact) exact();
  else {
    if (x.factId) os.facts.forget(x.factId);
    if (x.entityId && x.action === 'created') os.entities.delete(x.entityId, 'user');
    else if (!x.factId) return false; // a logged or updated item can't be reversed without its handle
  }
  undoHandles.delete(extractionId);
  os.dumps.markUndone(extractionId);
  return true;
}

/** Runs tools for one dump without confirm cards (a dump is the user's own words; every item has Undo) and records what they touched. */
class Filer {
  count = 0;
  private created = new Map<string, string>(); // title (lower) → entity id, for transaction "for" links
  constructor(private os: LifeOSContext, private dump: Dump) {}

  private tool(name: string): AiToolDef | undefined {
    return this.os.registry.aiTools.get(name);
  }

  async run(name: string, input: Record<string, unknown>): Promise<unknown> {
    const def = this.tool(name);
    if (!def) return { error: `unknown tool ${name}` };
    let out: unknown;
    try {
      out = await def.run(def.input.parse(input), this.os);
    } catch (e) {
      return { error: (e as Error).message };
    }
    if (!(out as { error?: unknown })?.error) this.record(name, input, out as Record<string, unknown>);
    return out;
  }

  private note(x: { kind: string; action?: 'created' | 'updated' | 'logged'; entityId?: string | null; factId?: string | null; label: string }, undo?: () => void) {
    const row = this.os.dumps.addExtraction({ dumpId: this.dump.id, ...x });
    if (undo) undoHandles.set(row.id, undo);
    this.count++;
    if (x.entityId && this.os.entities.get(x.entityId)) {
      this.os.entities.timeline.add({ entityId: x.entityId, kind: 'dump', title: x.action === 'created' ? 'From a dump' : 'Mentioned in a dump', body: this.dump.body.slice(0, 160), actor: 'assistant', meta: { dumpId: this.dump.id }, occurredAt: this.dump.createdAt });
    }
  }

  private record(name: string, input: Record<string, unknown>, out: Record<string, unknown>) {
    const os = this.os;
    const undo = extrasOf(out).undo;
    switch (name) {
      case 'create_entity': {
        const type = String(input.type);
        const id = String(out.id);
        this.created.set(String(out.title ?? input.title ?? '').toLowerCase(), id);
        this.note({ kind: type, entityId: id, label: `${os.registry.entityTypes.get(type)?.label ?? type}: ${out.title ?? ''}` }, undo);
        break;
      }
      case 'create_person_from_mention': {
        const factId = out.factId ? String(out.factId) : null;
        // One Undo for the person and the "met at" fact; the fact row undoes just the fact.
        this.note({ kind: 'person', action: out.created ? 'created' : 'updated', entityId: String(out.id), label: `Person: ${out.title}` }, undo);
        if (factId) this.note({ kind: 'fact', factId, label: os.facts.get(factId)?.text ?? 'Fact' });
        break;
      }
      case 'remember_fact':
        if (out.factId && !out.alreadyKnown) this.note({ kind: 'fact', factId: String(out.factId), label: String(out.remembered ?? input.text) }, undo);
        break;
      case 'log_event':
      case 'mark_cycle_done':
      case 'set_next_due':
      case 'log_meter':
        this.note({ kind: 'cycle', action: 'logged', entityId: (input.entityId as string) ?? null, label: String(out.logged ?? (out.done ? `${out.done} done` : null) ?? (out.cycle ? `${out.cycle}: ${out.next ?? 'updated'}` : 'Updated')) }, undo);
        break;
      case 'split_transaction':
      case 'settle_debt':
        break; // the money itself is recorded by create_entity
      default:
        this.note({ kind: name.replace(/^create_/, ''), entityId: (out.id as string) ?? null, label: String(input.name ?? input.title ?? name.replace(/_/g, ' ')) }, undo);
    }
  }

  /** Facts filed by the shared tools say source 'talk'; these came from this dump. */
  finish() {
    this.os.db.run(`UPDATE facts SET source='dump', source_ref=? WHERE id IN (SELECT fact_id FROM dump_extractions WHERE dump_id=? AND fact_id IS NOT NULL)`, [this.dump.id, this.dump.id]);
  }

  private resolve(name: string | undefined, types?: string[]): string | undefined {
    if (!name) return undefined;
    const fresh = this.created.get(name.toLowerCase());
    if (fresh) return fresh;
    return clearMatch(resolveCandidates(this.os, name, types))?.id;
  }

  async apply(x: Extracted) {
    const os = this.os;
    const has = (t: string) => os.registry.entityTypes.has(t);
    for (const p of x.people) {
      if (!has('person')) break;
      const out = (await this.run('create_person_from_mention', { name: p.name, company: p.company, role: p.role, relationship: p.relationship, whereMet: p.whereMet, city: p.city, note: p.note })) as { id?: string; title?: string };
      if (out?.id && out.title) this.created.set(out.title.toLowerCase(), out.id);
    }
    for (const e of x.entitiesToCreate) {
      if (!has(e.type) || e.type === 'person') continue;
      await this.run('create_entity', { type: e.type, title: e.title, data: e.data });
    }
    for (const t of x.transactions) {
      if (!has('transaction') || !(t.amount > 0)) continue;
      const forId = this.resolve(t.for);
      const account = t.account ? this.resolve(t.account, ['account']) : undefined;
      const kind = t.kind === 'income' ? 'income' : 'expense';
      await this.run('create_entity', {
        type: 'transaction',
        data: { amount: t.amount, kind, category: t.category ?? 'other', merchant: t.merchant ?? t.for, date: t.date ?? 'today', note: t.note ?? (t.account && !account ? t.account : undefined), accountId: account },
        links: forId ? [{ toId: forId, kind: os.entities.get(forId)?.type ?? 'related' }] : undefined,
      });
    }
    for (const t of x.tasks) {
      if (!has('task')) break;
      await this.run('create_entity', { type: 'task', title: t.title, data: { dueDate: t.due, priority: t.priority } });
    }
    for (const f of x.facts) {
      const subjectId = this.resolve(f.about);
      await this.run('remember_fact', { text: f.text, subjectId });
    }
    for (const e of x.events) {
      const id = this.resolve(e.about);
      if (id) await this.run('log_event', { entityId: id, what: e.what, date: e.date, cost: e.cost });
      else await this.run('remember_fact', { text: `${e.what} (${e.about})${e.date ? ` on ${e.date}` : ''}` });
    }
    for (const c of x.cycleUpdates) {
      const id = this.resolve(c.about);
      if (!id) continue;
      if (c.action === 'next_due' && c.date) await this.run('set_next_due', { entityId: id, date: parseDateish(c.date) ?? c.date });
      else await this.run('log_event', { entityId: id, what: 'Done', date: c.date });
    }
  }
}
