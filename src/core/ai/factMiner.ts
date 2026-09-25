import type { LifeOSContext } from '../registry/context';
import type { Fact } from '../repo/factRepo';
import type { LLMProvider } from './provider';
import { clearMatch, resolveCandidates } from './lifeTools';

export const FACT_MINER_PROMPT = `You extract durable personal facts from one message a user sent to their life assistant.
A fact is something worth remembering weeks later: preferences, relationships, names, recurring arrangements, where things are, how they like things done.
NOT facts: one-off events already being logged (a purchase, a service), questions, greetings, plans with no lasting truth.
Reply with ONLY a JSON object, no prose:
{"facts":[{"text":"<one short third-person sentence, e.g. 'Dad hates surprises'>","subject":"<name of the person/thing it is about, or null>","replaces":"<id of a KNOWN fact it updates, or null>"}]}
Return {"facts":[]} when there is nothing durable.`;

/** Parse the miner's reply; tolerate code fences and stray prose around the JSON. */
export function parseMined(text: string): Array<{ text: string; subject: string | null; replaces: string | null }> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const j = JSON.parse(text.slice(start, end + 1)) as { facts?: unknown };
    if (!Array.isArray(j.facts)) return [];
    return j.facts
      .filter((f): f is { text: string; subject?: unknown; replaces?: unknown } => !!f && typeof (f as { text?: unknown }).text === 'string' && (f as { text: string }).text.trim().length >= 3)
      .slice(0, 5)
      .map((f) => ({ text: f.text.trim(), subject: typeof f.subject === 'string' && f.subject.trim() ? f.subject.trim() : null, replaces: typeof f.replaces === 'string' ? f.replaces : null }));
  } catch {
    return [];
  }
}

/**
 * After every message: a second, cheap model call (Haiku) with a strict JSON
 * contract pulls out durable facts. Subjects resolve to records when one
 * clearly matches; duplicates are skipped; "replaces" supersedes a known fact.
 * Never throws — mining failing must not break the conversation.
 */
export async function mineFacts(os: LifeOSContext, provider: LLMProvider, userText: string, conversationId: string, opts: { onUsage?: (u: { input: number; output: number }) => void } = {}): Promise<Fact[]> {
  if (userText.trim().length < 8) return [];
  const known = os.facts.search(userText, 8);
  const system = `${FACT_MINER_PROMPT}\n\nKNOWN facts that may be updated:\n${known.length ? known.map((f) => `- [${f.id}] ${f.text}`).join('\n') : '(none)'}`;
  try {
    const res = await provider.complete({ system, messages: [{ role: 'user', content: userText }], tools: [], maxTokens: 400 });
    if (res.usage) opts.onUsage?.(res.usage);
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const out: Fact[] = [];
    for (const m of parseMined(text)) {
      const subjectId = m.subject ? (clearMatch(resolveCandidates(os, m.subject))?.id ?? null) : null;
      if (os.facts.findSame(m.text, subjectId)) continue;
      const replaces = m.replaces && known.some((k) => k.id === m.replaces) ? m.replaces : null;
      out.push(replaces ? os.facts.supersede(replaces, m.text, { source: 'talk', sourceRef: conversationId, subjectId }) : os.facts.add({ text: m.text, subjectId, subjectKey: !subjectId && m.subject ? `name:${m.subject.toLowerCase()}` : null, source: 'talk', sourceRef: conversationId }));
    }
    return out;
  } catch {
    return [];
  }
}
