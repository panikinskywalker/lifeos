/**
 * The life graph's link words (docs/GRAPH.md §2). Open vocabulary: these are
 * the ones the agent is told about and the UI knows how to phrase in both
 * directions; any other kind still works and shows as-is.
 */
export interface EdgeWord {
  /** How it reads from the source: "Flight — with — Kendal". */
  out: string;
  /** How it reads from the target: "Kendal — went on — Flight". */
  in: string;
}

export const EDGE_WORDS: Record<string, EdgeWord> = {
  with: { out: 'With', in: 'Was at' },
  at: { out: 'At', in: 'Happened here' },
  from: { out: 'From', in: 'Departures' },
  to: { out: 'To', in: 'Arrivals' },
  part_of: { out: 'Part of', in: 'Includes' },
  works_at: { out: 'Works at', in: 'People here' },
  knows: { out: 'Knows', in: 'Knows' },
  family_of: { out: 'Family', in: 'Family' },
  partner_of: { out: 'Partner', in: 'Partner' },
  friend_of: { out: 'Friend', in: 'Friend' },
  lives_in: { out: 'Lives in', in: 'Residents' },
  owns: { out: 'Owns', in: 'Owned by' },
  paid_for: { out: 'Paid for', in: 'Paid by' },
  about: { out: 'About', in: 'Mentioned in' },
  located_in: { out: 'In', in: 'Contains' },
};

/** Edges that read the same both ways (stored once, either direction). */
export const SYMMETRIC_EDGES = new Set(['knows', 'family_of', 'partner_of', 'friend_of']);

export function edgeLabel(kind: string, direction: 'out' | 'in'): string {
  const w = EDGE_WORDS[kind];
  if (w) return w[direction];
  const words = kind.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface Provenance {
  source?: 'dump' | 'record-voice' | 'manual' | 'sms' | 'notification' | 'assistant';
  sourceId?: string | null;
  confidence?: number;
  validFrom?: number | null;
  validTo?: number | null;
}
