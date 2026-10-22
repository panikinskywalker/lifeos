import type { LifeOSContext } from '@core/registry/context';
import type { SendAnswer, SourceDef } from '@core/registry/types';
import type { OutboxItem } from '@core/repo/outboxRepo';
import { applyTurfSync, isSyncPage, SETTING_REV, type TurfSyncPage } from './sync';
import { localMade, remapLocalMatch, resolveLocal, undoRefused, type TurfAction } from './changes';

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

type ActionResult = { id: string; status: number | 'skipped'; result?: { error?: string; id?: string } | null; repeated?: boolean };

/** One POST /api/actions with the key. */
async function postActions(os: LifeOSContext, actions: Array<{ id: string; method: string; body: Record<string, unknown> }>, doFetch: typeof fetch, timeoutMs: number): Promise<ActionResult[]> {
  const base = turfBase(os);
  const key = await os.device?.secrets?.get(TURF_KEY);
  if (!base || !key) throw new Error('Add Turf web’s address and this phone’s key first');
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : undefined;
  try {
    const r = await doFetch(`${base}/api/actions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions }),
      signal: ctl?.signal,
    });
    if (r.status === 401 || r.status === 403) throw new Error('Turf web refused this phone’s key — make a new one in Turf web › Settings › Connected phones');
    if (!r.ok) throw new Error(`Turf web answered ${r.status}`);
    return ((await r.json()) as { results?: ActionResult[] }).results ?? [];
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Turf web took too long to answer');
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * POST /api/actions: the waiting changes in order, each with its id (Turf web
 * stores every answer, so a resend gets the same answer and applies nothing
 * twice). 2xx → sent; 4xx → refused, and what it showed here is undone; a
 * server error stops Turf web there, so it and the rest keep waiting.
 * A change that names a match made here waits for Turf web's id for it: the
 * batch is cut there, sent, and the rest goes once the id is known; if the
 * match was refused, so is the change.
 */
export async function sendTurfActions(os: LifeOSContext, items: OutboxItem[], doFetch: typeof fetch = fetch, timeoutMs = 45_000): Promise<SendAnswer[]> {
  const answers: SendAnswer[] = [];
  const refusedLocal = new Set<string>();
  let rest = items.slice(0, 100);
  while (rest.length) {
    const batch: Array<{ item: OutboxItem; body: Record<string, unknown> }> = [];
    for (const item of rest) {
      const action = item.payload as TurfAction;
      const { body, missing } = resolveLocal(os, action.body);
      if (missing.some((m) => refusedLocal.has(m) || localMade(os, m) === 'refused' || localMade(os, m) === null)) {
        // Its match was refused (or is gone): this can't be made either.
        if (!batch.length) {
          undoRefused(os, item);
          answers.push({ id: item.id, state: 'refused', error: 'The match it belongs to wasn’t made in Turf web' });
          rest = rest.slice(1);
          continue;
        }
        break;
      }
      if (missing.length) break;
      batch.push({ item, body });
    }
    if (!batch.length) {
      // The first change waits for a match Turf web hasn't answered yet.
      for (const item of rest) answers.push({ id: item.id, state: 'waiting', error: 'Waiting for its match to reach Turf web' });
      break;
    }
    const results = await postActions(os, batch.map(({ item, body }) => ({ id: item.id, method: (item.payload as TurfAction).method, body })), doFetch, timeoutMs);
    const byId = new Map(results.map((x) => [x.id, x]));
    let stop = false;
    for (const { item } of batch) {
      const action = item.payload as TurfAction;
      const x = byId.get(item.id);
      if (stop || !x || x.status === 'skipped') {
        answers.push({ id: item.id, state: 'waiting', error: 'Waiting for the one before it' });
        stop = true;
      } else if (x.status >= 200 && x.status < 300) {
        if (action.creates && x.result?.id) remapLocalMatch(os, action.creates, String(x.result.id));
        answers.push({ id: item.id, state: 'sent', result: x.result });
      } else if (x.status >= 400 && x.status < 500) {
        undoRefused(os, item);
        if (action.creates) refusedLocal.add(action.creates);
        answers.push({ id: item.id, state: 'refused', error: x.result?.error ?? `Turf web said no (${x.status})`, result: x.result });
      } else {
        answers.push({ id: item.id, state: 'waiting', error: `Turf web answered ${x.status}; trying again next sync` });
        stop = true;
      }
    }
    const done = new Set(answers.map((a) => a.id));
    rest = stop ? [] : rest.filter((i) => !done.has(i.id));
  }
  // Anything not reached keeps its place.
  const done = new Set(answers.map((a) => a.id));
  for (const item of items) if (!done.has(item.id)) answers.push({ id: item.id, state: 'waiting', error: 'Waiting for the one before it' });
  return answers;
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
