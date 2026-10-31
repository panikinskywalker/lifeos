import { keyHash, type Ask, type BrainDef, type Candidate, type Nudge } from '@core/brain/contract';
import type { LifeOSContext } from '@core/registry/context';
import type { StockData } from './types';
import { productKey, setOnList, spaces, stillGood, stockState, undoStock, useUp, type StockUndo } from './stock';
import { dayWords, goingOffCandidates, runningOutCandidates, useByWords } from './nudges';

/**
 * What Home brings the brain (docs/MODEL.md layer 8): *going off* (use soon,
 * probably gone: is this right?), *running out* (put on the shopping list on
 * its own: done, undo?), and the Cook tonight slot from what is lime and
 * mustard. Built on R7e's candidate functions.
 */

const COOK_SPACES = new Set(['Fridge', 'Freezer', 'Kitchen']);

function goingOff(os: LifeOSContext, now: number): Candidate[] {
  return goingOffCandidates(os, now).map((n) => {
    const s = os.records.get<StockData>(n.stockId)!;
    const st = stockState(s.data, now);
    const gone = st.state === 'probably gone';
    return {
      key: `inventory:off:${s.id}:${s.data.boughtOn ?? ''}:${s.data.checkedOn ?? ''}:${gone ? 'gone' : 'soon'}`,
      kind: 'going off',
      shape: 'check',
      subjectId: s.id,
      title: s.title,
      line: gone ? `${s.title}: bought ${dayWords(s.data.boughtOn, now)}, probably gone. Still there?` : `${s.title}: bought ${dayWords(s.data.boughtOn, now)}, ${useByWords(st.daysLeft, now)}`,
      record: { thing: s.title, size: s.data.size ?? null, bought: s.data.boughtOn ?? null, keeps_days: s.data.lifeDays ?? null, days_left: st.daysLeft, state: st.state, estimated: st.estimated },
      urgent: n.urgent,
      rank: n.rank,
      yes: gone ? 'It’s gone' : 'Right',
      payload: { stockId: s.id, gone },
    } satisfies Candidate;
  });
}

function runningOut(os: LifeOSContext, now: number): Candidate[] {
  return runningOutCandidates(os, now).flatMap((n) => {
    const s = os.records.get<StockData>(n.stockId)!;
    if (s.data.onList) return [];
    return [{
      key: `inventory:low:${s.id}:${s.data.boughtOn ?? ''}`,
      kind: 'running out',
      shape: 'done',
      subjectId: s.id,
      title: s.title,
      line: `${s.title}: on the shopping list (${n.why})`,
      record: { thing: s.title, size: s.data.size ?? null, bought: s.data.boughtOn ?? null, rebuy_every_days: s.data.rateDays ?? null, left: s.data.quantity },
      urgent: n.urgent,
      rank: 10 + n.rank,
      payload: { stockId: s.id },
    } satisfies Candidate];
  });
}

/** Cook tonight: one dish from what is fresh and what to use soon in the Fridge, Freezer and Kitchen; null with fewer than 3 things. */
export function dishAsk(os: LifeOSContext, now = Date.now()): Ask | null {
  const where = new Set(spaces(os).filter((s) => COOK_SPACES.has(s.title)).map((s) => s.id));
  const soon: string[] = [];
  const fresh: string[] = [];
  for (const s of os.records.query<StockData>('stock', {}, { limit: 5000 })) {
    if (!s.data.spaceId || !where.has(s.data.spaceId)) continue;
    const st = stockState(s.data, now).state;
    if (st === 'use soon') soon.push(s.title);
    else if (st === 'fresh' && s.data.lifeDays) fresh.push(s.title);
  }
  if (soon.length + fresh.length < 3) return null;
  return {
    key: `inventory:dish:${keyHash([...soon, ...fresh].map(productKey))}`,
    slot: 'cook tonight',
    prompt: 'One dish to cook tonight from these, using the ones to use soon first: the dish, then the things it uses ("Palak paneer: spinach, paneer, cream").',
    record: { use_soon: soon, fresh },
    route: '/module/inventory/index',
    brief: true,
  };
}

export const inventoryBrain: BrainDef = {
  candidates: (os, now) => [...goingOff(os, now), ...runningOut(os, now)],
  asks: (os, now) => {
    const a = dishAsk(os, now);
    return a ? [a] : [];
  },
  act(os, verb, nudge: Nudge) {
    const p = (nudge.payload ?? {}) as { stockId?: string; gone?: boolean };
    if (!p.stockId || !os.records.get(p.stockId)) return null;
    if (nudge.kind === 'running out') {
      if (verb === 'apply') return setOnList(os, p.stockId, true);
      if (verb === 'undo' && nudge.undo) undoStock(os, nudge.undo as StockUndo);
      return null;
    }
    if (verb === 'yes' && p.gone) useUp(os, p.stockId);
    if (verb === 'no') stillGood(os, p.stockId);
    return null;
  },
  skills: [
    { name: 'Home', body: 'Things that go off come before things that run out: food is lost, butter can wait. A guess (estimated) is said as a guess ("probably"). Running out means it is on the list already; say so, not "buy".' },
  ],
};
