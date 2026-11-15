import type { LifeOSContext } from '../registry/context';

/**
 * One privacy gate for money questions to a cloud model (docs/MODEL.md,
 * Privacy gate, 15 Nov; from broke). What leaves the phone is a summary:
 * amounts rounded (₹10 under ₹1,000, else ₹100) and people's names as stable
 * placeholders ("Person 3"). Shops keep their names. The phone puts the names
 * back in the answer and in any filter the model asks for, and works out every
 * exact figure it shows itself.
 */

const KEY = 'privacy.people';

/** Rounded the way the gate sends money. */
export const roundMoney = (n: number): number => (Math.abs(n) < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100);

const table = (os: LifeOSContext) => os.settings.get<Record<string, string>>(KEY, {});

/** A person's placeholder, the same one every time. */
export function personToken(os: LifeOSContext, name: string): string {
  const t = table(os);
  const hit = Object.entries(t).find(([, n]) => n.toLowerCase() === name.toLowerCase());
  if (hit) return hit[0];
  const token = `Person ${Object.keys(t).length + 1}`;
  os.settings.set(KEY, { ...t, [token]: name });
  return token;
}

/** Placeholders back to names (in the model's sentence, or a payee it filters by). */
export function unmask(os: LifeOSContext, text: string): string {
  const t = table(os);
  return text.replace(/\bPerson (\d+)\b/g, (m) => t[m] ?? m);
}

/** The people's names (and their first names) found in your words, swapped for placeholders. */
export function maskPeople(os: LifeOSContext, text: string, people: string[]): string {
  const names = [...new Set(people.flatMap((p) => [p, p.split(/\s+/)[0] ?? p]).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
  let out = text;
  for (const n of names) {
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (re.test(out)) out = out.replace(re, personToken(os, people.find((p) => p === n || p.split(/\s+/)[0] === n) ?? n));
  }
  return out;
}
