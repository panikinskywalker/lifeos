/**
 * The Notion REST client for crm's notion source (docs/MODEL.md layer 4,
 * *Notion: your People CRM, kept in step*; R2b). Talks to
 * https://api.notion.com/v1 from the phone with your internal-integration
 * token, ~3 requests a second (a gap between calls, 429s retried after
 * Retry-After).
 *
 * THE HARD RULE: LifeOS never writes to your original People CRM. Every write
 * goes through `assertWritable`, twice over:
 * 1. by kind: a data source must be the copy LifeOS is pointed at (never the
 *    original's database or data source); a page must have been read (or made)
 *    by this client and sit in that copy; a block must have been read from
 *    such a page (or made in one) — anything else is refused;
 * 2. on the wire: `request` refuses any write whose path or parent names the
 *    original's database or data source, whatever called it.
 * Reads of the original are allowed (it is only ever read), though sync reads
 * only the copy.
 */

export const NOTION_BASE = 'https://api.notion.com/v1';
export const NOTION_VERSION = '2025-09-03';

/** Your original People CRM (🫂 Contacts): READ-ONLY, never written. */
export const ORIGINAL = { database: 'ebfd756d-aaee-4ead-8de5-d04c33253ce6', dataSource: '90150d9b-31a4-46dc-84ad-280e5388783b' } as const;
/** The copy, 📇 Personal CRM (1) (made 30 Oct with all 83 people): the only place LifeOS writes, and the default. */
export const COPY = { page: '40991ce1-3f82-81bb-a4df-f0ff4d0d830d', database: '69b91ce1-3f82-82f9-8bf1-81aefeae9b3d', dataSource: 'd5691ce1-3f82-8389-945f-87d26161f264', name: '📇 Personal CRM (1)' } as const;

export const ORIGINAL_REFUSAL = 'That’s your original CRM — LifeOS only writes to a copy';

/** A Notion id without dashes, lower case (links carry them bare, the API with dashes). */
export const normId = (id: string | null | undefined) => (id ?? '').replace(/-/g, '').toLowerCase();
const ORIGINAL_IDS = new Set([normId(ORIGINAL.database), normId(ORIGINAL.dataSource)]);
export const isOriginal = (id: string | null | undefined) => !!id && ORIGINAL_IDS.has(normId(id));
/** 32 hex → the dashed form the API answers with. */
export const dashed = (id: string) => {
  const n = normId(id);
  return n.length === 32 ? `${n.slice(0, 8)}-${n.slice(8, 12)}-${n.slice(12, 16)}-${n.slice(16, 20)}-${n.slice(20)}` : id;
};

/** A write LifeOS refuses to make (the original, or something not read from the copy). Never retried. */
export class WriteRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WriteRefused';
  }
}

/** Notion answered with an error (status 0: not reached at all). */
export class NotionError extends Error {
  constructor(public status: number, public code: string | null, message: string) {
    super(message);
    this.name = 'NotionError';
  }
}

export interface RichText {
  plain_text?: string;
  text?: { content?: string };
}

export interface NotionParent {
  type?: string;
  data_source_id?: string;
  database_id?: string;
  page_id?: string;
}

export interface NotionPage {
  object?: 'page';
  id: string;
  parent: NotionParent;
  properties: Record<string, Record<string, unknown> & { type?: string }>;
  last_edited_time: string;
  created_time?: string;
  in_trash?: boolean;
  archived?: boolean;
  url?: string;
}

export interface NotionBlock {
  object?: 'block';
  id: string;
  type: string;
  created_time?: string;
  has_children?: boolean;
  in_trash?: boolean;
  [type: string]: unknown;
}

export interface NotionDataSource {
  object?: 'data_source';
  id: string;
  title?: RichText[];
  parent?: NotionParent;
  properties: Record<string, { id?: string; name?: string; type: string; [k: string]: unknown }>;
}

/** Test seam: the gap between calls and how to wait (tests set gapMs to 0). */
export const notionTiming = {
  gapMs: 350,
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  now: () => Date.now(),
  retries: 3,
};

const HEX_ID = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi;
/** Every Notion-looking id in a string (a path, a pasted link). */
export const idsIn = (s: string) => (s.match(HEX_ID) ?? []).map(normId);

const TOKEN_HINT = 'Notion refused the token — paste a new one in You › Data sources › Notion';

export class NotionClient {
  /** The data source LifeOS writes to (null: this client only reads). */
  readonly target: string | null;
  private targetDatabase: string | null = null;
  /** Pages read or made by this client → their parent. */
  private pages = new Map<string, NotionParent>();
  /** Blocks read or made by this client → the page they are in. */
  private blocks = new Map<string, string>();
  private last = 0;
  /** Every call made, for the record (tests read it). */
  readonly calls: Array<{ method: string; path: string }> = [];

  constructor(private opts: { token: string; target: string | null; fetch?: typeof fetch }) {
    if (!opts.token) throw new Error('Paste your Notion token first (You › Data sources › Notion)');
    if (opts.target && isOriginal(opts.target)) throw new WriteRefused(ORIGINAL_REFUSAL);
    this.target = opts.target ? normId(opts.target) : null;
  }

  /**
   * The one guard every write goes through. Throws WriteRefused for the
   * original's database or data source, for a page whose parent is the
   * original, and for any page or block this client did not read from (or
   * make in) the copy it writes to.
   */
  assertWritable(id: string, kind: 'data_source' | 'database' | 'page' | 'block'): void {
    const n = normId(id);
    if (!n) throw new WriteRefused('Nothing to write to');
    if (isOriginal(n)) throw new WriteRefused(ORIGINAL_REFUSAL);
    if (!this.target) throw new WriteRefused('This Notion connection only reads');
    switch (kind) {
      case 'data_source':
        if (n !== this.target) throw new WriteRefused('LifeOS writes only to the copy it is pointed at');
        return;
      case 'database':
        // LifeOS changes the copy's columns through its data source, never a database.
        throw new WriteRefused('LifeOS never writes to a database directly');
      case 'page': {
        const parent = this.pages.get(n);
        if (!parent) throw new WriteRefused('LifeOS writes only to pages it read from the copy');
        if (isOriginal(parent.data_source_id) || isOriginal(parent.database_id)) throw new WriteRefused(ORIGINAL_REFUSAL);
        const ds = normId(parent.data_source_id);
        const db = normId(parent.database_id);
        const inCopy = ds ? ds === this.target : !!db && db === this.targetDatabase;
        if (!inCopy) throw new WriteRefused('That page isn’t in the copy LifeOS writes to');
        return;
      }
      case 'block': {
        if (this.pages.has(n)) return this.assertWritable(n, 'page');
        const page = this.blocks.get(n);
        if (!page) throw new WriteRefused('LifeOS changes only blocks it read from the copy');
        return this.assertWritable(page, 'page');
      }
    }
  }

  private remember(page: NotionPage) {
    this.pages.set(normId(page.id), page.parent ?? {});
  }

  /** A gap between calls (~3 a second), then the call; a 429 waits Retry-After and goes again. */
  async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const isQuery = method === 'POST' && /^\/data_sources\/[^/]+\/query$/.test(path);
    if (method !== 'GET' && !isQuery) {
      // Guard 2, on the wire: no write names the original, whoever asked for it.
      const parent = (body as { parent?: NotionParent } | undefined)?.parent;
      if (idsIn(path).some(isOriginal) || isOriginal(parent?.data_source_id) || isOriginal(parent?.database_id) || isOriginal(parent?.page_id)) throw new WriteRefused(ORIGINAL_REFUSAL);
    }
    const doFetch = this.opts.fetch ?? fetch;
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + notionTiming.gapMs - notionTiming.now();
      if (wait > 0) await notionTiming.sleep(wait);
      this.last = notionTiming.now();
      this.calls.push({ method, path });
      let r: Response;
      try {
        r = await doFetch(`${NOTION_BASE}${path}`, {
          method,
          headers: { Authorization: `Bearer ${this.opts.token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        throw new NotionError(0, 'offline', 'Notion can’t be reached right now — trying again next sync');
      }
      if (r.status === 429 && attempt < notionTiming.retries) {
        const s = Number(r.headers?.get?.('retry-after'));
        await notionTiming.sleep((Number.isFinite(s) && s > 0 ? s : 1) * 1000);
        continue;
      }
      const json = (await r.json().catch(() => null)) as (T & { message?: string; code?: string }) | null;
      if (!r.ok) {
        if (r.status === 401) throw new NotionError(401, json?.code ?? 'unauthorized', TOKEN_HINT);
        throw new NotionError(r.status, json?.code ?? null, json?.message ?? `Notion answered ${r.status}`);
      }
      return json as T;
    }
  }

  /* Reads ------------------------------------------------------------ */

  async getDataSource(id: string): Promise<NotionDataSource> {
    const ds = await this.request<NotionDataSource>('GET', `/data_sources/${dashed(id)}`);
    if (this.target && normId(ds.id) === this.target) this.targetDatabase = normId(ds.parent?.database_id) || null;
    return ds;
  }

  getDatabase(id: string): Promise<{ id: string; data_sources?: Array<{ id: string; name?: string }>; title?: RichText[] }> {
    return this.request('GET', `/databases/${dashed(id)}`);
  }

  /** Every page in a data source (edited on or after `since`, an ISO time, when given). */
  async queryDataSource(id: string, opts: { since?: string; filter?: unknown } = {}): Promise<NotionPage[]> {
    const out: NotionPage[] = [];
    let cursor: string | undefined;
    const filter = opts.filter ?? (opts.since ? { timestamp: 'last_edited_time', last_edited_time: { on_or_after: opts.since } } : undefined);
    do {
      const r = await this.request<{ results: NotionPage[]; has_more?: boolean; next_cursor?: string | null }>('POST', `/data_sources/${dashed(id)}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}), ...(filter ? { filter } : {}) });
      for (const p of r.results ?? []) {
        if (p.object && p.object !== 'page') continue;
        this.remember(p);
        out.push(p);
      }
      cursor = r.has_more && r.next_cursor ? r.next_cursor : undefined;
    } while (cursor);
    return out;
  }

  async getPage(id: string): Promise<NotionPage> {
    const p = await this.request<NotionPage>('GET', `/pages/${dashed(id)}`);
    this.remember(p);
    return p;
  }

  /** A page's (or block's) children, every page of them. They become writable only if their page is. */
  async listChildren(blockId: string): Promise<NotionBlock[]> {
    const n = normId(blockId);
    const owner = this.pages.has(n) ? n : this.blocks.get(n) ?? null;
    const out: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const r = await this.request<{ results: NotionBlock[]; has_more?: boolean; next_cursor?: string | null }>('GET', `/blocks/${dashed(blockId)}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`);
      for (const b of r.results ?? []) {
        if (owner) this.blocks.set(normId(b.id), owner);
        out.push(b);
      }
      cursor = r.has_more && r.next_cursor ? r.next_cursor : undefined;
    } while (cursor);
    return out;
  }

  /* Writes (each through assertWritable) ----------------------------- */

  /** Add columns to the copy (PATCH data source). */
  async updateDataSource(id: string, properties: Record<string, unknown>): Promise<NotionDataSource> {
    this.assertWritable(id, 'data_source');
    return this.request<NotionDataSource>('PATCH', `/data_sources/${dashed(id)}`, { properties });
  }

  /** A new page in the copy. */
  async createPage(dataSourceId: string, properties: Record<string, unknown>, children?: unknown[]): Promise<NotionPage> {
    this.assertWritable(dataSourceId, 'data_source');
    const p = await this.request<NotionPage>('POST', '/pages', { parent: { type: 'data_source_id', data_source_id: dashed(dataSourceId) }, properties, ...(children?.length ? { children: children.slice(0, 100) } : {}) });
    this.pages.set(normId(p.id), p.parent ?? { type: 'data_source_id', data_source_id: dataSourceId });
    return p;
  }

  async updatePage(id: string, properties: Record<string, unknown>): Promise<NotionPage> {
    this.assertWritable(id, 'page');
    return this.request<NotionPage>('PATCH', `/pages/${dashed(id)}`, { properties });
  }

  /** Append blocks to a page (after one of its blocks, when given), 100 at a time. Returns what was made. */
  async appendChildren(blockId: string, children: unknown[], after?: string | null): Promise<NotionBlock[]> {
    this.assertWritable(blockId, 'block');
    if (after) this.assertWritable(after, 'block');
    const n = normId(blockId);
    const owner = this.pages.has(n) ? n : this.blocks.get(n)!;
    const made: NotionBlock[] = [];
    let place = after ?? null;
    for (let i = 0; i < children.length; i += 100) {
      const r = await this.request<{ results: NotionBlock[] }>('PATCH', `/blocks/${dashed(blockId)}/children`, { children: children.slice(i, i + 100), ...(place ? { after: dashed(place) } : {}) });
      // Notion answers with the parent's children; the new ones are those we hadn't seen.
      const fresh = (r.results ?? []).filter((b) => !this.blocks.has(normId(b.id)));
      for (const b of fresh) this.blocks.set(normId(b.id), owner);
      made.push(...fresh);
      if (place && fresh.length) place = fresh[fresh.length - 1]!.id;
    }
    return made;
  }

  /** New words for a bullet (a Notion Fact edited in LifeOS; R7f). */
  async updateBlockText(id: string, type: string, textValue: string): Promise<void> {
    this.assertWritable(id, 'block');
    await this.request('PATCH', `/blocks/${dashed(id)}`, { [type]: { rich_text: [{ type: 'text', text: { content: textValue.slice(0, 2000) } }] } });
  }

  async deleteBlock(id: string): Promise<void> {
    this.assertWritable(id, 'block');
    await this.request('DELETE', `/blocks/${dashed(id)}`);
    this.blocks.delete(normId(id));
  }
}
