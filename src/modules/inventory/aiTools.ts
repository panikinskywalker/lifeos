import { z } from 'zod';
import type { AiToolDef } from '@core/registry/types';
import type { LifeOSContext } from '@core/registry/context';
import { withExtras } from '@core/ai/cards';
import type { StockData } from './types';
import { goingOffCandidates, runningOutCandidates } from './nudges';
import { addFromLine, quantityWords, spaceNamed, spaces, stockState, undoAll } from './stock';

/**
 * Home's tools (R7e): what's running low, what to use soon, what's in a
 * space, and adding from one line. Called by Talk now, and by the brain's
 * passes later (layer 8).
 */

function inSpace(os: LifeOSContext, space: string) {
  const sp = os.records.get(space)?.object === 'space' ? os.records.get(space)! : spaceNamed(os, space);
  if (!sp) return null;
  const now = Date.now();
  const things = os.records
    .query<StockData>('stock', { filter: { and: [{ field: 'data.spaceId', op: 'eq', value: sp.id }] } }, { limit: 2000 })
    .filter((s) => s.data.quantity > 0)
    .map((s) => ({ id: s.id, title: s.title, size: s.data.size ?? null, quantity: s.data.quantity, state: stockState(s.data, now).state }));
  return { space: sp.title, things };
}

export const inventoryAiTools: AiToolDef[] = [
  {
    name: 'stock_low',
    description: 'Things at home running low: their learned rebuy rate is nearly up with one or less left, or half of the last one is left. Each with why ("every 3 wk · 18 d").',
    input: z.object({}),
    run: async (_i, os) => {
      const rows = runningOutCandidates(os).map((n) => ({ id: n.stockId, title: n.title, why: n.why, line: n.line }));
      return withExtras({ things: rows }, { card: { kind: 'list', title: 'Running low', items: rows.map((r) => ({ entityId: r.id, type: 'stock', title: r.title, value: r.why })) } });
    },
  },
  {
    name: 'use_soon',
    description: 'Things at home to use soon or probably gone, from when they were bought and how long they keep (LifeOS’s estimate unless you said). Soonest first.',
    input: z.object({}),
    run: async (_i, os) => {
      const rows = goingOffCandidates(os).map((n) => ({ id: n.stockId, title: n.title, why: n.why, line: n.line, estimated: n.estimated }));
      return withExtras({ things: rows }, { card: { kind: 'list', title: 'Use soon', items: rows.map((r) => ({ entityId: r.id, type: 'stock', title: r.title, value: r.why })) } });
    },
  },
  {
    name: 'whats_in',
    description: 'What is in a space at home (Fridge, Freezer, Kitchen, Cabinets, Bathroom, Cleaning, or one you added), with each thing’s state.',
    input: z.object({ space: z.string().describe('Space name or id') }),
    run: async (input, os) => {
      const r = inSpace(os, (input as { space: string }).space);
      if (!r) return { error: 'No such space', spaces: spaces(os).map((s) => s.title) };
      return withExtras(r, { card: { kind: 'list', title: r.space, items: r.things.map((x) => ({ entityId: x.id, type: 'stock', title: [x.title, quantityWords(x.quantity)].filter(Boolean).join(' '), value: x.state })) } });
    },
  },
  {
    name: 'add_stock',
    description: 'Add things to Home from one line ("eggs, butter, 2 milk"): each into the space its name suggests, or the space given. Something you already have gains the new ones.',
    input: z.object({ line: z.string(), space: z.string().optional() }),
    run: async (input, os) => {
      const i = input as { line: string; space?: string };
      const spaceId = i.space ? spaceNamed(os, i.space)?.id : undefined;
      const done = addFromLine(os, i.line, { spaceId });
      return withExtras({ added: done.map((u) => os.records.get(u.id)?.title).filter(Boolean) }, { undo: () => undoAll(os, done) });
    },
  },
];
