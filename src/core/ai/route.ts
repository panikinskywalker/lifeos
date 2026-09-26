/**
 * One box (docs/GRAPH.md §5): is this something to file, or a question to
 * answer? Speech recognisers rarely add "?", so questions are also known by
 * how they start. Anything else is filed — a statement is never lost.
 */
const ASK_START =
  /^(?:who|whom|whose|what|what's|whats|which|why|how|when (?:did|do|does|is|was|will|are|were|am)|where (?:did|do|does|is|was|are|were|am)|show me|list|find|search|tell me|give me|remind me (?:what|who|when|where)|do i|did i|am i|have i|has|had i|is there|are there|was there|were there|is my|are my|can you (?:tell|show|find|list)|should i|could you (?:tell|show|find))\b/i;

export type InputKind = 'ask' | 'tell';

export function classifyInput(text: string): InputKind {
  const t = text.trim();
  if (!t) return 'tell';
  if (/\?\s*$/.test(t)) return 'ask';
  // Several sentences are a dump even if one of them starts like a question.
  if (t.split(/(?<=[.!])\s+|\n+/).filter(Boolean).length > 1) return 'tell';
  return ASK_START.test(t) ? 'ask' : 'tell';
}
