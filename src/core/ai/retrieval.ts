import type { LifeOSContext } from '../registry/context';
import type { ChatMessage } from './provider';
import { resolveCandidates } from './lifeTools';

export interface RetrievalOptions {
  /** Rough character budget for the whole block (≈ 4 chars per token). */
  budget?: number;
  now?: number;
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** A record, compactly: title, type, key data, cycles, recent timeline, links. */
function describeRecord(os: LifeOSContext, id: string): string | null {
  const e = os.entities.get(id);
  if (!e) return null;
  const def = os.registry.entityTypes.get(e.type);
  const data = Object.entries(e.data as Record<string, unknown>)
    .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length) && typeof v !== 'object')
    .slice(0, 10)
    .map(([k, v]) => `${def?.fields.find((f) => f.key === k)?.label ?? k}: ${String(v).slice(0, 60)}`)
    .join('; ');
  const cycles = os.cycles.forEntity(e.id).map((c) => {
    const s = os.cycles.status(c);
    return `${c.name} (cycleId ${c.id}) ${s.state}${s.daysLeft != null ? `, ${s.daysLeft < 0 ? `${-s.daysLeft} d late` : `in ${s.daysLeft} d`}` : ''}${s.meterLeft != null ? `, ${Math.round(s.meterLeft)} km left` : ''}`;
  });
  const timeline = os.entities.timeline.forEntity(e.id, 5).map((t) => `${iso(t.occurredAt)} ${t.title}${t.body ? ` — ${t.body.slice(0, 60)}` : ''}`);
  const rels = os.relations.forEntity(e.id).slice(0, 6).map((r) => `${r.relation.kind}: ${r.other.title}`);
  const facts = os.facts.list({ subjectId: e.id, limit: 5 }).map((f) => f.text);
  return [
    `• ${e.title} [${def?.label ?? e.type}, id ${e.id}${e.status ? `, ${e.status}` : ''}]${data ? ` — ${data}` : ''}`,
    cycles.length ? `  cycles: ${cycles.join(' | ')}` : '',
    timeline.length ? `  recent: ${timeline.join(' | ')}` : '',
    rels.length ? `  linked: ${rels.join(', ')}` : '',
    facts.length ? `  facts: ${facts.join(' | ')}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * What the agent should know before answering this message, packed to a
 * budget in priority order: remembered facts that match, the records the
 * message is about (with cycles, recent timeline, links and their facts),
 * then other search hits. Returns '' when nothing is relevant.
 */
export function buildContext(os: LifeOSContext, userText: string, opts: RetrievalOptions = {}): string {
  const budget = opts.budget ?? 6000;
  const sections: Array<[string, string[]]> = [];
  const facts = os.facts.search(userText, 8);
  if (facts.length) sections.push(['Things the user told you before', facts.map((f) => `• ${f.text}${f.subjectId ? ` (about ${os.entities.get(f.subjectId)?.title ?? '?'})` : ''} [factId ${f.id}, ${iso(f.statedAt)}]`)]);
  const about = resolveCandidates(os, userText).filter((c) => c.score >= 0.8).slice(0, 3);
  const detailed = about.map((c) => describeRecord(os, c.id)).filter((x): x is string => !!x);
  if (detailed.length) sections.push(['Records this message is probably about', detailed]);
  const shown = new Set(about.map((c) => c.id));
  const all = os.entities.search.search(userText.split(/\s+/).filter((w) => w.length > 2).slice(0, 6).join(' '), { limit: 12 });
  const dumps = all.filter((h) => h.type === 'dump').slice(0, 4).map((h) => os.dumps.get(h.id)).filter((d): d is NonNullable<typeof d> => !!d);
  if (dumps.length) sections.push(['From the user’s brain dumps (verbatim)', dumps.map((d) => `• ${iso(d.createdAt)}: “${d.body.replace(/\s+/g, ' ').slice(0, 400)}”`)]);
  const hits = all.filter((h) => h.type !== 'fact' && h.type !== 'dump' && !shown.has(h.id)).slice(0, 8);
  if (hits.length) sections.push(['Other matching records', hits.map((h) => `• ${h.title} [${os.registry.entityTypes.get(h.type)?.label ?? h.type}, id ${h.id}]${h.subtitle ? ` — ${h.subtitle}` : ''}`)]);
  let out = '';
  for (const [title, lines] of sections) {
    const head = `\n## ${title}\n`;
    if (out.length + head.length > budget) break;
    out += head;
    for (const l of lines) {
      if (out.length + l.length + 1 > budget) break;
      out += `${l}\n`;
    }
  }
  return out.trim() ? `# Context (retrieved for this message — verify with tools before changing anything)${out}` : '';
}

/**
 * The last `turns` user messages and everything after them. Cuts only at a
 * user text message so tool_use / tool_result pairs stay together.
 */
export function historyWindow(history: ChatMessage[], turns = 12): ChatMessage[] {
  let seen = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.role === 'user' && typeof m.content === 'string') {
      seen++;
      if (seen === turns) return history.slice(i);
    }
  }
  return history;
}
