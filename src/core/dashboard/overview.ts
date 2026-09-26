/**
 * A module's overview (v4 Browse): numbers, charts and what needs you,
 * computed by the module (pure) and drawn by one screen. The same card
 * headline shows on Today's area cards.
 */

export type ValueFormat = 'money' | 'number' | 'hours' | 'percent';

export interface OverviewRow {
  title: string;
  sub?: string | null;
  value?: string | null;
  entityId?: string;
  type?: string;
  tone?: 'alert' | 'ok';
}

export type OverviewBlock =
  | { kind: 'stats'; items: Array<{ label: string; value: string; sub?: string | null; tone?: 'alert' | 'ok' }> }
  | { kind: 'bars'; title: string; labels: string[]; values: number[]; format?: ValueFormat; note?: string }
  | { kind: 'breakdown'; title: string; parts: Array<{ label: string; value: number; color?: string }>; format?: ValueFormat }
  | { kind: 'progress'; title: string; items: Array<{ label: string; ratio: number; sub?: string | null; entityId?: string; type?: string; over?: boolean }> }
  | { kind: 'list'; title: string; items: OverviewRow[]; empty?: string; more?: { label: string; type: string } }
  | { kind: 'heat'; title: string; days: Array<{ day: string; value: number | null }> };

export interface ModuleOverview {
  /** One line for Today's area card: the number that matters, and a 7-point trend. */
  card?: { headline: string; sub?: string | null; series?: Array<number | null>; seriesFormat?: ValueFormat; alert?: boolean };
  blocks: OverviewBlock[];
}

export const DAY_MS = 86_400_000;
export const isoOf = (t: number | Date) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The last `n` months, oldest first: start/end ISO days and a short label. */
export function lastMonths(n: number, now = Date.now()): Array<{ start: string; end: string; label: string }> {
  const d = new Date(now);
  return Array.from({ length: n }, (_, i) => {
    const k = n - 1 - i;
    const s = new Date(d.getFullYear(), d.getMonth() - k, 1);
    const e = new Date(d.getFullYear(), d.getMonth() - k + 1, 0);
    return { start: isoOf(s), end: isoOf(e), label: SHORT_MONTHS[s.getMonth()]! };
  });
}
/** Days from today to an ISO day (negative = past). */
export const daysUntil = (iso: string, now = Date.now()) => Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${isoOf(now)}T12:00:00`).getTime()) / DAY_MS);
export const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? `${-n} d ago` : `in ${n} d`);
