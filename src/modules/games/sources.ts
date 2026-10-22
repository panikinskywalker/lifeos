import type { LifeOSContext } from '@core/registry/context';
import type { SendAnswer, SourceDef } from '@core/registry/types';
import type { OutboxItem } from '@core/repo/outboxRepo';
import { applyTurfSync, isSyncPage, SETTING_REV, type TurfSyncPage } from './sync';
import { undoRefused, type TurfAction } from './payments';

/**
 * Turf web as a Source (docs/MODEL.md layer 4, *Turf web*; R9c). Address in
 * settings, the phone's key (`tw_…`, made in Turf web › Settings › Connected
 * phones) in the secure store (You › Data sources › Turf web). Each sync asks
 * for what changed after the last change number applied; the cursor is
 * Turf web's, so core's time-based `since` is not used. Changes made here go
 * first, through `POST /api/actions` (R9c.2).
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

type ActionResult = { id: string; status: number | 'skipped'; result?: { error?: string } | null; repeated?: boolean };

/**
 * POST /api/actions: the waiting changes in order, each with its id (Turf web
 * stores every answer, so a resend gets the same answer and applies nothing
 * twice). 2xx → sent; 4xx → refused, and what it showed here is undone; a
 * server error stops Turf web there, so it and the rest keep waiting.
 */
export async function sendTurfActions(os: LifeOSContext, items: OutboxItem[], doFetch: typeof fetch = fetch, timeoutMs = 45_000): Promise<SendAnswer[]> {
  const base = turfBase(os);
  const key = await os.device?.secrets?.get(TURF_KEY);
  if (!base || !key) throw new Error('Add Turf web’s address and this phone’s key first');
  const batch = items.slice(0, 100);
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : undefined;
  let results: ActionResult[];
  try {
    const r = await doFetch(`${base}/api/actions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions: batch.map((i) => ({ id: i.id, ...(i.payload as TurfAction) })) }),
      signal: ctl?.signal,
    });
    if (r.status === 401 || r.status === 403) throw new Error('Turf web refused this phone’s key — make a new one in Turf web › Settings › Connected phones');
    if (!r.ok) throw new Error(`Turf web answered ${r.status}`);
    results = ((await r.json()) as { results?: ActionResult[] }).results ?? [];
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Turf web took too long to answer');
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const byId = new Map(results.map((x) => [x.id, x]));
  return batch.map((item): SendAnswer => {
    const x = byId.get(item.id);
    if (!x || x.status === 'skipped') return { id: item.id, state: 'waiting', error: 'Waiting for the one before it' };
    if (x.status >= 200 && x.status < 300) return { id: item.id, state: 'sent', result: x.result };
    if (x.status >= 400 && x.status < 500) {
      undoRefused(os, item);
      return { id: item.id, state: 'refused', error: x.result?.error ?? `Turf web said no (${x.status})`, result: x.result };
    }
    return { id: item.id, state: 'waiting', error: `Turf web answered ${x.status}; trying again next sync` };
  });
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
  send: (os, items) => sendTurfActions(os, items),
};
