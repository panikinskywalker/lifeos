import type { LifeOSContext } from '@core/registry/context';
import type { LLMProvider } from '@core/ai/provider';
import { recordUsage } from '@core/ai/routing';
import { roundMoney } from '@core/ai/privacy';
import { CATEGORIES, type TransactionData } from './types';
import { learnCategory, recategorise } from './filing/rules';
import { peopleNames } from './filing/moneyIn';

/**
 * AI sorts what is left in Other (docs/MODEL.md, Better categories, 15 Nov):
 * the shops whose payments have no category, by name with a rounded typical
 * amount (never people, never texts), go to your model with your category
 * list; each answer it is sure of is taught for that shop (so the next payment
 * files itself) and applied to its payments, with Undo.
 */

export interface OtherShop {
  name: string;
  ids: string[];
  typical: number;
}

/** Shops (not people) with spending still in Other that you have not set yourself; most payments first. */
export function otherShops(os: LifeOSContext, limit = 40): OtherShop[] {
  const people = new Set(peopleNames(os).map((n) => n.toLowerCase()));
  const by = new Map<string, OtherShop>();
  for (const t of os.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.category', op: 'eq', value: 'other' }] } }, { limit: 5000 })) {
    const name = (t.title || t.data.merchant || '').trim();
    if (!name || people.has(name.toLowerCase()) || /^other$/i.test(name)) continue;
    if (os.db.get(`SELECT 1 AS x FROM events WHERE record_id=? AND actor='user' LIMIT 1`, [t.id])) continue;
    const s = by.get(name.toLowerCase()) ?? { name, ids: [], typical: 0 };
    s.ids.push(t.id);
    s.typical += t.data.amount;
    by.set(name.toLowerCase(), s);
  }
  return [...by.values()].map((s) => ({ ...s, typical: roundMoney(s.typical / s.ids.length) })).sort((a, b) => b.ids.length - a.ids.length).slice(0, limit);
}

const SYSTEM = `You sort Indian card and UPI payments into spending categories. You get shop or merchant names as a bank wrote them, with a rounded typical amount, and the user's category list (id: label). Answer with one JSON object only: {"<name exactly as given>": "<category id>"}. Use only ids from the list. Leave out any name you are not sure of; never guess "other".`;

export function sortPrompt(shops: OtherShop[]): string {
  const cats = CATEGORIES.filter((c) => c.value !== 'other' && c.value !== 'transfer').map((c) => `${c.value}: ${c.label}`).join('\n');
  return `Categories:\n${cats}\n\nShops:\n${shops.map((s) => `${s.name} (about ₹${s.typical}, ${s.ids.length} payment${s.ids.length === 1 ? '' : 's'})`).join('\n')}`;
}

/** The model's JSON, kept to names we sent and ids we have. */
export function readSort(text: string, shops: OtherShop[]): Record<string, string> {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return {};
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return {};
  }
  const ids = new Set(CATEGORIES.map((c) => c.value).filter((v) => v !== 'other' && v !== 'transfer'));
  const names = new Map(shops.map((s) => [s.name.toLowerCase(), s.name]));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const name = names.get(k.toLowerCase());
    if (name && typeof v === 'string' && ids.has(v)) out[name] = v;
  }
  return out;
}

export interface SortDone {
  shops: Array<{ name: string; category: string }>;
  changed: Array<{ id: string; was: string }>;
  learnedBefore: Record<string, string>;
}

/** Teach each sorted shop and recategorise its payments. */
export function applySort(os: LifeOSContext, shops: OtherShop[], picks: Record<string, string>): SortDone {
  const learnedBefore = os.settings.get<Record<string, string>>('merchantCategories', {});
  const done: SortDone = { shops: [], changed: [], learnedBefore };
  os.db.transaction(() => {
    for (const s of shops) {
      const cat = picks[s.name];
      if (!cat) continue;
      learnCategory(os, s.name, cat, s.ids[0]);
      done.changed.push(...recategorise(os, s.ids, cat));
      done.shops.push({ name: s.name, category: cat });
    }
  });
  return done;
}

export function undoSort(os: LifeOSContext, d: SortDone): void {
  os.db.transaction(() => {
    for (const c of d.changed) if (os.records.get(c.id)) os.records.update(c.id, { data: { category: c.was } }, 'user');
    os.settings.set('merchantCategories', d.learnedBefore);
  });
}

/** Ask the model once and apply what it is sure of. Logged in Sent to Claude with what left the phone. */
export async function sortWithAI(os: LifeOSContext, model: LLMProvider): Promise<SortDone | null> {
  const shops = otherShops(os);
  if (!shops.length) return null;
  const at = Date.now();
  const r = await model.complete({ system: SYSTEM, messages: [{ role: 'user', content: sortPrompt(shops) }], tools: [], maxTokens: 1500 });
  const text = r.content.map((b) => ('text' in b && typeof b.text === 'string' ? b.text : '')).join('');
  recordUsage(os, { provider: model.id, model: model.model ?? model.id, purpose: 'chat', input: r.usage?.input ?? 0, output: r.usage?.output ?? 0, at });
  os.brain.sent.add({ at, pass: 'ask', why: 'Sort the payments in Other', model: model.model ?? model.id, lines: [`Money · ${shops.length} shop names with a rounded typical amount; no people, no texts`], records: shops.length, input: r.usage?.input ?? 0, output: r.usage?.output ?? 0, cacheRead: 0, cacheWrite: 0, outcome: 'ok', error: null });
  return applySort(os, shops, readSort(text, shops));
}
