import type { LifeOSContext } from '@core/registry/context';
import type { SourceDef } from '@core/registry/types';
import { applyTurfPull, type TurfPull } from './pull';

/**
 * Turf Ledger as a Source (docs/MODEL.md layer 4, *Services that also write*;
 * R9a reads). Address in settings, token in the phone's secure store
 * (You › Data sources › Turf Ledger). The pull is the whole ledger every time.
 */

export const TURF_URL = 'turf.url';
export const TURF_TOKEN = 'turf.token';

export function turfBase(os: LifeOSContext): string | null {
  const raw = os.settings.get<string>(TURF_URL, '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

/** One GET /api/lifeos. Errors say what to do, in the words the settings screen uses. */
export async function fetchTurfPull(os: LifeOSContext, doFetch: typeof fetch = fetch, timeoutMs = 45_000): Promise<TurfPull> {
  const base = turfBase(os);
  const token = await os.device?.secrets?.get(TURF_TOKEN);
  if (!base || !token) throw new Error('Add Turf Ledger’s address and token first');
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : undefined;
  try {
    const r = await doFetch(`${base}/api/lifeos`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: ctl?.signal });
    if (r.status === 401) throw new Error('Turf Ledger refused the token — check it matches LIFEOS_TOKEN');
    if (r.status === 404) throw new Error('Turf Ledger doesn’t have the LifeOS endpoint turned on yet');
    if (r.status === 403) throw new Error('Turf Ledger asked for a sign-in — the LifeOS endpoint must be reachable without one');
    if (!r.ok) throw new Error(`Turf Ledger answered ${r.status}`);
    const type = r.headers.get('content-type') ?? '';
    if (!type.includes('json')) throw new Error('Turf Ledger sent a page, not data — check the address');
    return (await r.json()) as TurfPull;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Turf Ledger took too long to answer');
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const turfLedgerSource: SourceDef = {
  id: 'turf',
  label: 'Turf Ledger',
  modules: ['games', 'crm', 'places', 'finance'],
  permission: 'Address and token',
  kind: 'readings',
  available: async (os) => !!turfBase(os) && !!(await os.device?.secrets?.get(TURF_TOKEN)),
  sync: async (os) => {
    const r = applyTurfPull(os, await fetchTurfPull(os));
    console.log(`[turf] pulled: ${r.created} new, ${r.updated} changed, ${r.archived} archived, people ${r.peopleMatched} matched / ${r.peopleCreated} added, ${r.debtsOpen} open debts`);
    return { filed: r.created, cursor: String(Date.now()) };
  },
};
