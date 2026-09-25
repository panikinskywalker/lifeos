/**
 * Reply cards and Undo handles. A tool attaches them to its result under
 * symbol keys: JSON.stringify skips symbols, so the model never sees them,
 * while the Assistant lifts them onto the tool turn for the Talk screen.
 */

export type ReplyCard =
  | { kind: 'record'; entityId: string; type: string; title: string; subtitle?: string | null; icon?: string }
  | { kind: 'cycle'; entityId: string; cycleId: string; title: string; due: string; subtitle?: string | null }
  | { kind: 'list'; title: string; items: Array<{ entityId?: string; type?: string; title: string; value?: string | null }> }
  | { kind: 'number'; label: string; value: string; caption?: string | null }
  | { kind: 'chart'; title: string; bars: Array<{ label: string; value: number; display?: string }> };

export const UNDO: unique symbol = Symbol('lifeos.undo');
export const CARD: unique symbol = Symbol('lifeos.card');

export type ToolOutput<T extends object = Record<string, unknown>> = T & { [UNDO]?: () => void; [CARD]?: ReplyCard };

/** Attach an Undo and/or a reply card to a tool result. */
export function withExtras<T extends object>(result: T, extras: { undo?: () => void; card?: ReplyCard }): ToolOutput<T> {
  const out = result as ToolOutput<T>;
  if (extras.undo) out[UNDO] = extras.undo;
  if (extras.card) out[CARD] = extras.card;
  return out;
}

export function extrasOf(output: unknown): { undo?: () => void; card?: ReplyCard } {
  if (!output || typeof output !== 'object') return {};
  const o = output as ToolOutput;
  return { undo: o[UNDO], card: o[CARD] };
}
