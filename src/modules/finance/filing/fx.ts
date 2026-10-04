import type { LifeOSContext } from '@core/registry/context';

/**
 * Exchange rates for spends in USD / GBP / JPY / AED (M4.2c). The app
 * fetches a day's rates when online (platform) and stores them here; filing
 * converts to rupees with the latest stored rate, and anything filed while
 * no rate was known is converted once one arrives.
 */

export const FX_CURRENCIES = ['USD', 'GBP', 'JPY', 'AED'] as const;
const KEY = 'fx.rates';

export interface FxRates {
  /** ISO day the rates are for. */
  day: string;
  /** Rupees per one unit of each currency. */
  inrPer: Record<string, number>;
}

export function fxRates(os: LifeOSContext): FxRates | null {
  return os.settings.get<FxRates | null>(KEY, null);
}

/** Store rates given as "1 INR = x units" (what most rate APIs return with base INR). */
export function setFxRatesFromInrBase(os: LifeOSContext, day: string, perInr: Record<string, number>): FxRates {
  const inrPer: Record<string, number> = {};
  for (const c of FX_CURRENCIES) if (perInr[c] && perInr[c]! > 0) inrPer[c] = 1 / perInr[c]!;
  const r = { day, inrPer };
  os.settings.set(KEY, r);
  return r;
}

/** Rupees for an amount in `currency`, or null when no rate is known yet. */
export function toInr(os: LifeOSContext, amount: number, currency: string): { inr: number; rate: number } | null {
  if (currency === 'INR') return { inr: amount, rate: 1 };
  const rate = fxRates(os)?.inrPer[currency];
  return rate ? { inr: Math.round(amount * rate * 100) / 100, rate } : null;
}

/** Transactions filed in a foreign currency before any rate was known: convert them now. */
export function applyPendingFx(os: LifeOSContext): number {
  if (!os.registry.objects.has('transaction')) return 0;
  const pending = os.records.query<{ originalAmount?: number; originalCurrency?: string; fxRate?: number }>('transaction', { filter: { and: [{ field: 'data.originalCurrency', op: 'notNull' }] } }, { limit: 2000 }).filter((e) => e.data.originalCurrency && !e.data.fxRate && e.data.originalAmount);
  let n = 0;
  for (const e of pending) {
    const c = toInr(os, e.data.originalAmount!, e.data.originalCurrency!);
    if (!c) continue;
    os.records.update(e.id, { data: { amount: c.inr, fxRate: c.rate } }, 'system');
    n++;
  }
  return n;
}
