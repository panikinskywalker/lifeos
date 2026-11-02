/**
 * Code's own words for when, shared by the modules' candidates: "today",
 * "tomorrow", "Thu" (inside a week), "on 12 Nov", "in 4 months"; late is
 * "3 days late". No em dashes (the house style).
 */

const DAY = 86_400_000;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A day as "12 Nov" (and the year when it is not this one). */
export function dayMonth(at: number, now = Date.now()): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTH[d.getMonth()]}${d.getFullYear() !== new Date(now).getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

/** When something is due, `days` from today: today · tomorrow · Thu · on 12 Nov; or "3 days late". */
export function dueWords(days: number, now = Date.now()): string {
  if (days < 0) return `${plural(-days, 'day')} late`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  const at = now + days * DAY;
  if (days < 7) return WEEKDAY[new Date(at).getDay()]!;
  return `on ${dayMonth(at, now)}`;
}

/** How far off: "in 5 days", "in 3 weeks", "in 4 months". */
export function inWords(days: number): string {
  if (days < 21) return `in ${plural(days, 'day')}`;
  if (days < 60) return `in ${plural(Math.round(days / 7), 'week')}`;
  return `in ${plural(Math.round(days / 30), 'month')}`;
}

/** A spend's day: today, yesterday, or its weekday. */
export function pastDay(isoDay: string, now = Date.now()): string {
  const start = (t: number) => new Date(new Date(t).setHours(0, 0, 0, 0)).getTime();
  const at = new Date(`${isoDay.slice(0, 10)}T12:00:00`).getTime();
  const days = Math.round((start(now) - start(at)) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : WEEKDAY[new Date(at).getDay()]!;
}
