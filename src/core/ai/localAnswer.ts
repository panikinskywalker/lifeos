import type { LifeOSContext } from '../registry/context';
import { resolveCandidates } from './lifeTools';
import { neighbours } from '../graph/read';
import type { ReplyCard } from './cards';

const day = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * An answer from the phone alone (M4.1c), for when no model is free: the
 * records the question names with their key details and connections (dated
 * things newest first), remembered facts, and dumps that mention it. Not
 * prose — what's known, so you're never left with nothing.
 */
export function localAnswer(os: LifeOSContext, question: string): { text: string; cards: ReplyCard[] } {
  const q = question.replace(/[?]/g, ' ').trim();
  const lines: string[] = [];
  const cards: ReplyCard[] = [];
  const about = resolveCandidates(os, q).filter((c) => c.score >= 0.8 && c.why !== `a ${c.type}`).slice(0, 3);
  for (const c of about) {
    const e = os.entities.get(c.id);
    if (!e) continue;
    const def = os.registry.entityTypes.get(e.type);
    const n = neighbours(os, e.id, { limit: 8 });
    const dated = n.filter((x) => x.at);
    const other = n.filter((x) => !x.at);
    lines.push(`${e.title}${def ? ` (${def.label.toLowerCase()})` : ''}${e.subtitle ? ` — ${e.subtitle}` : ''}`);
    if (dated.length) lines.push(`  Latest: ${dated.slice(0, 3).map((x) => `${x.title}, ${day(x.at!)}${x.context ? ` (${x.context})` : ''}`).join(' · ')}`);
    if (other.length) lines.push(`  Linked: ${other.slice(0, 5).map((x) => `${x.label.toLowerCase()} ${x.title}`).join(' · ')}`);
    const notes = String((e.data as { notes?: string }).notes ?? '').split('\n').filter((l) => l.startsWith('•')).slice(0, 3);
    if (notes.length) lines.push(`  ${notes.join(' ')}`);
    for (const f of os.facts.list({ subjectId: e.id, limit: 2 })) lines.push(`  ${f.text}`);
    cards.push({ kind: 'record', entityId: e.id, type: e.type, title: e.title, subtitle: [def?.label, e.subtitle].filter(Boolean).join(' · '), icon: def?.icon });
  }
  const words = q.split(/\s+/).filter((w) => w.length > 2 && !/^(what|when|where|who|how|did|does|the|last|see|was|were|are|have|has|about|with|this|that|many|much)$/i.test(w)).join(' ');
  if (words) {
    for (const f of os.facts.search(words, 3)) if (!about.some((a) => a.id === f.subjectId)) lines.push(`• ${f.text}`);
    const dumps = os.entities.search.search(words, { limit: 6 }).filter((h) => h.type === 'dump').slice(0, 2);
    for (const h of dumps) {
      const d = os.dumps.get(h.id);
      if (d) lines.push(`You said on ${day(d.createdAt)}: “${d.body.replace(/\s+/g, ' ').slice(0, 140)}${d.body.length > 140 ? '…' : ''}”`);
    }
  }
  return { text: lines.length ? lines.join('\n') : 'Nothing on the phone matches that yet.', cards };
}
