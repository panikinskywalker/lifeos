/** Days to the next birthday (0 = today) and the age it will be; null when the date is unreadable. */
export function nextBirthday(iso: string, now: Date = new Date()): { days: number; age: number | null } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  // Whole local days, from today's midnight, so a birthday today is 0 (not a year away).
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = new Date(now.getFullYear(), month, day);
  if (next < today) next.setFullYear(now.getFullYear() + 1);
  const days = Math.round((next.getTime() - today.getTime()) / 86400000);
  // Year 1900 means "no year" (NO_YEAR in types.ts): no age.
  return { days, age: year > 1900 ? next.getFullYear() - year : null };
}
