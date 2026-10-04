/** Days to the next birthday and the age it will be; null when the date is unreadable. */
export function nextBirthday(iso: string): { days: number; age: number | null } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  const days = Math.ceil((next.getTime() - now.getTime()) / 86400000);
  return { days, age: d.getFullYear() > 1900 ? next.getFullYear() - d.getFullYear() : null };
}


