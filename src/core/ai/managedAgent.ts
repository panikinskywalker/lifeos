/**
 * A small Claude Managed Agents client over fetch (docs/MODEL.md, Ask Money is
 * an agent: how it runs). Anthropic runs the agent loop; the app creates the
 * agent and its environment once, opens a session per conversation, sends
 * events and reads them back by polling (React Native's fetch cannot stream).
 * No React Native here, so it is unit-tested with a fake fetch.
 */

export interface ManagedConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ManagedEvent {
  id: string;
  type: string;
  [key: string]: unknown;
}

export class ManagedError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const VERSION = '2026-10-21';
const BETA = 'managed-agents-2026-04-01';

export async function managedRequest<T>(cfg: ManagedConfig, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const f = cfg.fetchImpl ?? fetch;
  const res = await f(`${(cfg.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': VERSION, 'anthropic-beta': BETA },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } } | null)?.error?.message ?? (text.slice(0, 200) || res.statusText);
    throw new ManagedError(res.status, msg);
  }
  return json as T;
}

/** Every event of a session so far, oldest first (follows the pages). */
export async function sessionEvents(cfg: ManagedConfig, sessionId: string): Promise<ManagedEvent[]> {
  const out: ManagedEvent[] = [];
  let page: string | null = null;
  for (let i = 0; i < 20; i++) {
    const r: { data?: ManagedEvent[]; next_page?: string | null } = await managedRequest(cfg, 'GET', `/v1/sessions/${sessionId}/events${page ? `?page=${encodeURIComponent(page)}` : ''}`);
    out.push(...(r.data ?? []));
    page = r.next_page ?? null;
    if (!page) break;
  }
  return out;
}

export const sendEvents = (cfg: ManagedConfig, sessionId: string, events: unknown[]) => managedRequest(cfg, 'POST', `/v1/sessions/${sessionId}/events`, { events });

/** A session is done with this turn when it terminates, or goes idle for any reason but waiting on us. */
export function turnOver(e: ManagedEvent): 'done' | 'budget' | 'ended' | null {
  if (e.type === 'session.status_terminated') return 'ended';
  if (e.type !== 'session.status_idle') return null;
  const why = (e.stop_reason as { type?: string } | undefined)?.type;
  return why === 'requires_action' ? null : why === 'budget_reached' ? 'budget' : 'done';
}

/** A cheap, stable fingerprint of an agent definition, to know when the stored agent needs updating. */
export function fingerprint(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
