import { format, formatDistanceToNowStrict, isToday, isYesterday, isThisYear } from 'date-fns';
import type { Formatters } from './registry/context';

export interface LocaleSettings {
  locale: string; // 'en-IN'
  currency: string; // 'INR'
  dateFormat: string; // 'dd/MM/yyyy'
  timeFormat: string; // 'h:mm a'
}

export const DEFAULT_LOCALE: LocaleSettings = { locale: 'en-IN', currency: 'INR', dateFormat: 'dd/MM/yyyy', timeFormat: 'h:mm a' };

function toDate(ts: number | string | Date): Date {
  return ts instanceof Date ? ts : new Date(ts);
}

export function createFormatters(get: () => LocaleSettings): Formatters {
  const nf = new Map<string, Intl.NumberFormat>();
  // Whole amounts print without decimals (₹24,000); anything else keeps two (₹719.50).
  const currencyFmt = (c: string, whole: boolean) => {
    const s = get();
    const key = `${s.locale}:${c}:${whole ? 0 : 2}`;
    if (!nf.has(key)) {
      try {
        nf.set(key, new Intl.NumberFormat(s.locale, { style: 'currency', currency: c, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }));
      } catch {
        nf.set(key, new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }));
      }
    }
    return nf.get(key)!;
  };
  return {
    defaultCurrency: () => get().currency,
    currency: (amount, c) => currencyFmt(c ?? get().currency, Number.isInteger(amount)).format(amount),
    number: (n, digits = 0) => new Intl.NumberFormat(get().locale, { maximumFractionDigits: digits }).format(n),
    date: (ts, style = 'medium') => {
      const d = toDate(ts);
      if (Number.isNaN(d.getTime())) return '';
      if (style === 'relative') {
        if (isToday(d)) return 'Today';
        if (isYesterday(d)) return 'Yesterday';
        return formatDistanceToNowStrict(d, { addSuffix: true });
      }
      if (style === 'short') return isThisYear(d) ? format(d, 'd MMM') : format(d, 'd MMM yyyy');
      if (style === 'long') return format(d, 'EEEE, d MMMM yyyy');
      return format(d, get().dateFormat);
    },
    time: (ts) => format(toDate(ts), get().timeFormat),
    dateTime: (ts) => {
      const d = toDate(ts);
      const day = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, isThisYear(d) ? 'd MMM' : 'd MMM yyyy');
      return `${day}, ${format(d, get().timeFormat)}`;
    },
  };
}
