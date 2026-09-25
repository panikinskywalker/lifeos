import { z } from 'zod';
import type { Entity } from '../domain/types';
import type { LifeOSContext } from '../registry/context';
import type { AiToolDef } from '../registry/types';
import { logDone, undoLoggedDone, upkeep } from '../cycles/upkeep';
import type { Cycle } from '../cycles/cycleRepo';
import { cycleStatus, dateField } from '../cycles/schedule';
import { withExtras, type ReplyCard } from './cards';

/** Words that name a record type rather than a record ("the car", "my passport"). */
const TYPE_WORDS: Record<string, string[]> = {
  vehicle: ['car', 'bike', 'scooter', 'vehicle', 'motorcycle'],
  subscription: ['subscription', 'recharge', 'plan', 'membership'],
  document: ['passport', 'licence', 'license', 'insurance', 'policy', 'document'],
  routine: ['chore', 'routine', 'laundry', 'cleaning'],
  person: ['person', 'friend'],
};
const STOP = new Set(['the', 'my', 'a', 'an', 'our', 'his', 'her', 'their', 'of', 'to', 'for', 'at', 'in', 'on', 'did', 'done', 'with']);

export interface Candidate {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  score: number;
  why: string;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Which record does a phrase mean? Scores: exact title
 * 0.95, title starts with / contains the phrase 0.85 / 0.8, the only record of
 * a named type ("the car") 0.9, full-text hits 0.4–0.6. Returns candidates,
 * best first.
 */
export function resolveCandidates(os: LifeOSContext, text: string, types?: string[]): Candidate[] {
  const q = norm(text);
  if (!q) return [];
  const words = q.split(' ').filter((w) => !STOP.has(w));
  const phrase = words.join(' ');
  const out = new Map<string, Candidate>();
  const add = (e: { id: string; type: string; title: string; subtitle?: string | null }, score: number, why: string) => {
    if (types?.length && !types.includes(e.type)) return;
    const prev = out.get(e.id);
    if (!prev || prev.score < score) out.set(e.id, { id: e.id, type: e.type, title: e.title, subtitle: e.subtitle ?? null, score, why });
  };
  if (phrase) {
    const hits = os.entities.search.search(phrase, { types, limit: 20 });
    for (const h of hits) {
      const t = norm(h.title);
      add(h, t === phrase ? 0.95 : t.startsWith(phrase) ? 0.85 : t.includes(phrase) ? 0.8 : 0.6, 'title');
    }
    for (const w of words) {
      if (w.length < 3) continue;
      for (const h of os.entities.search.search(w, { types, limit: 10 })) add(h, norm(h.title).split(' ').includes(w) ? 0.55 : 0.4, `matches "${w}"`);
    }
  }
  for (const [type, ws] of Object.entries(TYPE_WORDS)) {
    if (!words.some((w) => ws.includes(w)) || !os.registry.entityTypes.has(type)) continue;
    const all = os.entities.query(type, {}, { limit: 3 });
    if (all.length === 1) add(all[0]!, 0.9, `your only ${type}`);
    else for (const e of all) add(e, 0.5, `a ${type}`);
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, 6);
}

/** One clear winner (≥ 0.8 and 0.15 ahead of the next), or null. */
export function clearMatch(c: Candidate[]): Candidate | null {
  const [a, b] = c;
  if (!a || a.score < 0.8) return null;
  if (b && a.score - b.score < 0.15) return null;
  return a;
}

const recordCard = (os: LifeOSContext, e: Entity): ReplyCard => ({ kind: 'record', entityId: e.id, type: e.type, title: e.title, subtitle: [os.registry.entityTypes.get(e.type)?.label, e.subtitle].filter(Boolean).join(' · '), icon: os.registry.entityTypes.get(e.type)?.icon });

function dueText(os: LifeOSContext, c: Cycle): string {
  const s = cycleStatus(c, Date.now(), c.meter ? os.cycles.latestMeter(c.entityId, c.meter) : null);
  const parts: string[] = [];
  if (c.nextDueAt) parts.push(`next ${new Date(c.nextDueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${s.daysLeft != null ? ` (${s.daysLeft < 0 ? `${-s.daysLeft} d late` : s.daysLeft === 0 ? 'today' : `in ${s.daysLeft} d`})` : ''}`);
  if (c.nextDueMeter != null) parts.push(`at ${c.nextDueMeter.toLocaleString('en-IN')} km`);
  return parts.join(' or ') || 'no next date';
}

const cycleCard = (os: LifeOSContext, c: Cycle): ReplyCard => {
  const e = os.entities.get(c.entityId);
  return { kind: 'cycle', entityId: c.entityId, cycleId: c.id, title: e && e.title !== c.name ? `${e.title} · ${c.name}` : c.name, due: dueText(os, c) };
};

/** The cycle on a record that a phrase ("service", "wash", "renewal") refers to; the only one if there is one. */
export function pickCycle(os: LifeOSContext, entityId: string, hint?: string): Cycle | null {
  const cycles = os.cycles.forEntity(entityId);
  const h = norm(hint ?? '');
  // No hint: only an unambiguous single cycle. A hint must match — "washed the car" never rolls its service.
  if (!h) return cycles.length === 1 ? cycles[0]! : null;
  return cycles.find((c) => norm(c.name) === h) ?? cycles.find((c) => h.includes(norm(c.name)) || norm(c.name).includes(h)) ?? cycles.find((c) => norm(c.name).split(' ').some((w) => w.length > 3 && h.includes(w))) ?? null;
}

const at = (iso?: string) => (iso ? (dateField(iso) ?? new Date(iso).getTime()) : Date.now());
const MONEY_TYPES = ['transaction', 'debt', 'account', 'budget', 'subscription'];

export const lifeTools: AiToolDef[] = [
  {
    name: 'resolve_entity',
    description: 'Find which record a phrase means ("the car", "Dad", "Jio", "white sneakers"). Returns `match` when one record clearly fits, else `candidates` — then ask the user which one (list the titles) and, once they answer, call remember_alias.',
    input: z.object({ text: z.string(), types: z.array(z.string()).optional() }),
    run: async (input, os) => {
      const i = input as { text: string; types?: string[] };
      const c = resolveCandidates(os, i.text, i.types);
      const m = clearMatch(c);
      return m ? { match: m } : { candidates: c, ask: c.length > 1 ? 'Which one did they mean?' : c.length === 0 ? 'Nothing matches — ask or offer to create it.' : undefined };
    },
  },
  {
    name: 'log_event',
    description: 'Log that something happened to a record ("did the car service today, 6,400 at Hyundai", "washed the white sneakers"). Adds a timeline entry; when it matches one of the record\'s cycles it also rolls that cycle (and files the cost as an expense). Use resolve_entity first to get entityId.',
    input: z.object({ entityId: z.string(), what: z.string().describe('Short event, e.g. "Service", "Wash"'), date: z.string().optional().describe('ISO date; default today'), cost: z.number().optional(), meter: z.number().optional().describe('Odometer reading if said'), note: z.string().optional() }),
    confirm: (i: { cost?: number }) => !!i.cost,
    run: async (input, os) => {
      const i = input as { entityId: string; what: string; date?: string; cost?: number; meter?: number; note?: string };
      const e = os.entities.get(i.entityId);
      if (!e) return { error: 'record not found' };
      const when = at(i.date);
      const cycle = pickCycle(os, e.id, i.what);
      if (cycle) {
        const done = logDone(os, cycle.id, { at: when, cost: i.cost ?? null, meter: i.meter ?? null, note: i.note ?? null, asExpense: !!i.cost });
        const after = os.cycles.get(cycle.id)!;
        return withExtras({ logged: `${cycle.name} done on ${e.title}`, cycleRolled: true, next: dueText(os, after), expenseFiled: !!done.transactionId }, { undo: () => undoLoggedDone(os, done), card: cycleCard(os, after) });
      }
      const ev = os.entities.timeline.add({ entityId: e.id, kind: 'event', title: i.what, body: [i.note, i.cost ? os.format.currency(i.cost) : null].filter(Boolean).join(' · ') || null, actor: 'assistant', occurredAt: when, meta: { cost: i.cost ?? null } });
      const reading = i.meter != null ? os.cycles.logMeter(e.id, i.meter, { at: when, unit: 'km' }, 'assistant') : null;
      return withExtras({ logged: `${i.what} on ${e.title}`, cycleRolled: false }, { undo: () => { os.entities.timeline.remove(ev.id); if (reading) os.cycles.removeReading(reading); }, card: recordCard(os, e) });
    },
  },
  {
    name: 'mark_cycle_done',
    description: 'Mark a recurring thing done ("did laundry", "paid the Jio recharge"): rolls the cycle to its next due. Give cycleId, or entityId (+ cycle name when the record has several). Optional cost files an expense.',
    input: z.object({ cycleId: z.string().optional(), entityId: z.string().optional(), cycle: z.string().optional(), date: z.string().optional(), cost: z.number().optional(), meter: z.number().optional(), note: z.string().optional() }),
    confirm: (i: { cost?: number }) => !!i.cost,
    run: async (input, os) => {
      const i = input as { cycleId?: string; entityId?: string; cycle?: string; date?: string; cost?: number; meter?: number; note?: string };
      const c = i.cycleId ? os.cycles.get(i.cycleId) : i.entityId ? pickCycle(os, i.entityId, i.cycle) : null;
      if (!c) return { error: i.entityId ? `Which cycle? This record has: ${os.cycles.forEntity(i.entityId).map((x) => x.name).join(', ') || 'none'}` : 'cycleId or entityId required' };
      const done = logDone(os, c.id, { at: at(i.date), cost: i.cost ?? null, meter: i.meter ?? null, note: i.note ?? null, asExpense: !!i.cost });
      const after = os.cycles.get(c.id)!;
      return withExtras({ done: c.name, next: dueText(os, after) }, { undo: () => undoLoggedDone(os, done), card: cycleCard(os, after) });
    },
  },
  {
    name: 'set_next_due',
    description: 'Set when a recurring thing is next due ("Jio runs out on the 30th", "service at 40,000 km").',
    input: z.object({ cycleId: z.string().optional(), entityId: z.string().optional(), cycle: z.string().optional(), date: z.string().optional().describe('ISO date'), meter: z.number().optional() }),
    run: async (input, os) => {
      const i = input as { cycleId?: string; entityId?: string; cycle?: string; date?: string; meter?: number };
      const c = i.cycleId ? os.cycles.get(i.cycleId) : i.entityId ? pickCycle(os, i.entityId, i.cycle) : null;
      if (!c) return { error: 'Which cycle? Give cycleId or entityId + cycle name.' };
      const prev = { nextDueAt: c.nextDueAt, nextDueMeter: c.nextDueMeter };
      os.cycles.setNextDue(c.id, { ...(i.date ? { nextDueAt: at(i.date) } : {}), ...(i.meter != null ? { nextDueMeter: i.meter } : {}) }, 'assistant');
      const after = os.cycles.get(c.id)!;
      return withExtras({ cycle: c.name, next: dueText(os, after) }, { undo: () => os.cycles.setNextDue(c.id, prev, 'user'), card: cycleCard(os, after) });
    },
  },
  {
    name: 'log_meter',
    description: 'Record a meter reading on a record — the car\'s odometer ("Creta is at 34,200 km"). Cycles by km recompute from it.',
    input: z.object({ entityId: z.string(), value: z.number(), date: z.string().optional() }),
    run: async (input, os) => {
      const i = input as { entityId: string; value: number; date?: string };
      const e = os.entities.get(i.entityId);
      if (!e) return { error: 'record not found' };
      const m = os.registry.entityTypes.get(e.type)?.meters?.[0];
      const id = os.cycles.logMeter(e.id, i.value, { at: at(i.date), meter: m?.meter, unit: m?.unit ?? 'km', label: m?.label }, 'assistant');
      return withExtras({ logged: `${m?.label ?? 'Reading'} ${i.value}` }, { undo: () => os.cycles.removeReading(id), card: recordCard(os, os.entities.get(e.id)!) });
    },
  },
  {
    name: 'upkeep_status',
    description: 'What is overdue / due soon across all cycles (services, renewals, chores, people to call).',
    input: z.object({ limit: z.number().optional() }),
    run: async (input, os) => {
      const u = upkeep(os);
      const items = u.items.slice(0, (input as { limit?: number }).limit ?? 12);
      return withExtras(
        { overdue: u.overdue, items: items.map((i) => ({ record: i.entity.title, cycle: i.cycle.name, cycleId: i.cycle.id, entityId: i.entity.id, state: i.status.state, daysLeft: i.status.daysLeft, meterLeft: i.status.meterLeft })) },
        { card: { kind: 'list', title: u.overdue ? `${u.overdue} overdue` : 'Coming up', items: items.map((i) => ({ entityId: i.entity.id, type: i.entity.type, title: i.cycle.name === i.entity.title ? i.entity.title : `${i.entity.title} · ${i.cycle.name}`, value: dueText(os, i.cycle) })) } },
      );
    },
  },
];

/** Money & people records ask before the assistant creates, changes or deletes them (HANDOFF). */
export const PEOPLE_TYPES = ['person', 'group'];
export function touchesMoneyOrPeople(os: LifeOSContext, type: string | undefined): boolean {
  return !!type && (MONEY_TYPES.includes(type) || PEOPLE_TYPES.includes(type));
}
export { recordCard };
