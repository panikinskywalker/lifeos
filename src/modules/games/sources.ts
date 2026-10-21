import type { LifeOSContext } from '@core/registry/context';
import type { SourceDef } from '@core/registry/types';
import { applyTurfSync, isSyncPage, SETTING_REV, type TurfSyncPage } from './sync';

/**
 * Turf web as a Source (docs/MODEL.md layer 4, *Turf web*; R9c). Address in
 * settings, the phone's key (`tw_…`, made in Turf web › Settings › Connected
 * phones) in the secure store (You › Data sources › Turf web). Each sync asks
 * for what changed after the last change number applied; the cursor is
 * Turf web's, so core's time-based `since` is not used.
 */

export const TURF_URL = 'turfweb.url';
export const TURF_KEY = 'turfweb.key';
export const TURF_DEFAULT_URL = 'https://turf-web.noboyyoudont.workers.dev';

export function turfBase(os: LifeOSContext): string | null {
  const raw = os.settings.get<string>(TURF_URL, '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

export const isTurfKey = (k: string) => /^tw_[A-Za-z0-9_-]{16,}$/.test(k.trim());

/** One GET /api/sync?since=N. Errors say what to do, in the words the settings screen uses. */
export async function fetchTurfSync(os: LifeOSContext, since: number, doFetch: typeof fetch = fetch, timeoutMs = 45_000): Promise<TurfSyncPage> {
  const base = turfBase(os);
  const key = await os.device?.secrets?.get(TURF_KEY);
  if (!base || !key) throw new Error('Add Turf web’s address and this phone’s key first');
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : undefined;
  try {
    const r = await doFetch(`${base}/api/sync?since=${Math.max(0, Math.floor(since))}`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: ctl?.signal });
    if (r.status === 401 || r.status === 403) throw new Error('Turf web refused this phone’s key — make a new one in Turf web › Settings › Connected phones');
    if (r.status === 404) throw new Error('No Turf web at that address — check it');
    if (!r.ok) throw new Error(`Turf web answered ${r.status}`);
    const type = r.headers.get('content-type') ?? '';
    if (!type.includes('json')) throw new Error('Turf web sent a page, not data — check the address');
    const page = (await r.json()) as unknown;
    if (!isSyncPage(page)) throw new Error('Turf web sent something that isn’t a sync page');
    return page;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Turf web took too long to answer');
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Sync from the last change number (0: everything). Returns what the page changed. */
export async function syncTurf(os: LifeOSContext, doFetch: typeof fetch = fetch) {
  const since = os.settings.get<number>(SETTING_REV, 0);
  const r = applyTurfSync(os, await fetchTurfSync(os, since, doFetch));
  console.log(`[turf] synced ${since} → ${r.rev}: ${r.created} new, ${r.updated} changed, ${r.archived} archived, ${r.payments} payment entries, people ${r.peopleMatched} matched / ${r.peopleCreated} added, ${r.debtsOpen} open debts`);
  return r;
}

export const turfWebSource: SourceDef = {
  id: 'turf',
  label: 'Turf web',
  modules: ['games', 'crm', 'places', 'finance'],
  permission: 'Address and key',
  kind: 'readings',
  available: async (os) => !!turfBase(os) && !!(await os.device?.secrets?.get(TURF_KEY)),
  sync: async (os) => {
    const r = await syncTurf(os);
    return { filed: r.created, cursor: String(r.rev) };
  },
};
