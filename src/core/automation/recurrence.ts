/**
 * Minimal, dependency-free recurrence. Supports the subset people actually
 * use on a phone, expressed as a compact RRULE-like string:
 *   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY;INTERVAL=n;BYDAY=MO,TU;BYMONTHDAY=15
 * Extend here rather than pulling a 100KB rrule lib until it's needed.
 */
export interface Recurrence {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay?: number[]; // 0=SU .. 6=SA
  byMonthDay?: number;
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function parseRRule(s: string): Recurrence {
  const parts = Object.fromEntries(s.split(';').map((p) => p.split('=') as [string, string]));
  const freq = (parts.FREQ ?? 'DAILY').toUpperCase() as Recurrence['freq'];
  const rec: Recurrence = { freq, interval: Math.max(1, Number(parts.INTERVAL ?? 1)) };
  if (parts.BYDAY) rec.byDay = parts.BYDAY.split(',').map((d) => DAYS.indexOf(d.toUpperCase())).filter((i) => i >= 0);
  if (parts.BYMONTHDAY) rec.byMonthDay = Number(parts.BYMONTHDAY);
  return rec;
}

export function formatRRule(r: Recurrence): string {
  const out = [`FREQ=${r.freq}`, `INTERVAL=${r.interval}`];
  if (r.byDay?.length) out.push(`BYDAY=${r.byDay.map((d) => DAYS[d]).join(',')}`);
  if (r.byMonthDay) out.push(`BYMONTHDAY=${r.byMonthDay}`);
  return out.join(';');
}

export function describeRRule(s: string | null | undefined): string {
  if (!s) return 'Once';
  const r = parseRRule(s);
  const every = r.interval === 1 ? '' : `${r.interval} `;
  switch (r.freq) {
    case 'DAILY':
      return r.interval === 1 ? 'Daily' : `Every ${every}days`;
    case 'WEEKLY': {
      const days = r.byDay?.length ? ' on ' + r.byDay.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ') : '';
      return (r.interval === 1 ? 'Weekly' : `Every ${every}weeks`) + days;
    }
    case 'MONTHLY':
      return (r.interval === 1 ? 'Monthly' : `Every ${every}months`) + (r.byMonthDay ? ` on the ${r.byMonthDay}` : '');
    case 'YEARLY':
      return r.interval === 1 ? 'Yearly' : `Every ${every}years`;
  }
}

/** Next occurrence strictly after `after`, stepping from `from` (the anchor). */
export function nextOccurrence(rrule: string, from: number, after: number = Date.now()): number {
  const r = parseRRule(rrule);
  let d = new Date(from);
  const guard = 5000;
  for (let i = 0; i < guard; i++) {
    d = step(d, r);
    if (d.getTime() > after) return d.getTime();
  }
  return d.getTime();
}

function step(d: Date, r: Recurrence): Date {
  const n = new Date(d);
  switch (r.freq) {
    case 'DAILY':
      n.setDate(n.getDate() + r.interval);
      return n;
    case 'WEEKLY': {
      if (r.byDay?.length) {
        // advance day by day until we land on an allowed weekday
        for (let i = 1; i <= 7 * r.interval; i++) {
          const c = new Date(d);
          c.setDate(d.getDate() + i);
          if (r.byDay.includes(c.getDay())) {
            const weeksAhead = Math.floor((i + d.getDay()) / 7);
            if (r.interval === 1 || weeksAhead % r.interval === 0 || weeksAhead === 0) return c;
          }
        }
      }
      n.setDate(n.getDate() + 7 * r.interval);
      return n;
    }
    case 'MONTHLY': {
      const day = r.byMonthDay ?? d.getDate();
      n.setDate(1);
      n.setMonth(n.getMonth() + r.interval);
      const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
      n.setDate(Math.min(day, last));
      return n;
    }
    case 'YEARLY':
      n.setFullYear(n.getFullYear() + r.interval);
      return n;
  }
}
