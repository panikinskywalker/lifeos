import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { runSource } from '@core/filing/sources';
import { financeModule } from '@modules/finance';
import { eventType } from '@modules/projects/types';
import {
  COPY, NOTION_ASKED, NOTION_CONFLICT, NOTION_MATCH, NOTION_TOKEN, NotionClient, ORIGINAL, ORIGINAL_REFUSAL, WriteRefused, answerNotionMatch, crmModule, normId,
  notionTiming, resolveNotionLink, setNotionTarget, takeOtherNotionValue, type PersonData,
} from '.';

/* ------------------------------------------------------------------ */
/* A Notion that lives in memory: the REST shapes the client uses      */
/* ------------------------------------------------------------------ */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86_400_000;
const uid = (() => {
  let n = 0;
  return () => {
    n++;
    const h = n.toString(16).padStart(12, '0');
    return `aaaaaaaa-bbbb-4ccc-8ddd-${h}`;
  };
})();
const rt = (s: string) => [{ type: 'text', text: { content: s }, plain_text: s }];
const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const BASE_PROPS: Json = {
  Name: { id: 'title', name: 'Name', type: 'title', title: {} },
  Associations: { id: 'a', name: 'Associations', type: 'multi_select', multi_select: { options: ['Family', 'Friend', 'College', 'Inner Circle', 'Colleague'].map((name) => ({ name })) } },
  Birthday: { id: 'b', name: 'Birthday', type: 'date', date: {} },
  'Last Contacted': { id: 'c', name: 'Last Contacted', type: 'date', date: {} },
  'Last Update?': { id: 'd', name: 'Last Update?', type: 'rich_text', rich_text: {} },
  Status: { id: 'e', name: 'Status', type: 'formula', formula: { expression: '' } },
};

class FakeNotion {
  clock = Date.now() - 2 * DAY;
  sources = new Map<string, Json>();
  databases = new Map<string, Json>();
  pages = new Map<string, Json>();
  blocks = new Map<string, Json>();
  /** page or block id → its children's ids, in order. */
  kids = new Map<string, string[]>();
  log: Array<{ method: string; path: string; body: Json | null }> = [];
  /** Answer the next n calls with 429. */
  tooMany = 0;

  constructor() {
    for (const [db, ds, title] of [[ORIGINAL.database, ORIGINAL.dataSource, '🫂 Contacts'], [COPY.database, COPY.dataSource, 'Contacts']] as const) {
      this.databases.set(normId(db), { object: 'database', id: db, data_sources: [{ id: ds, name: title }] });
      this.sources.set(normId(ds), { object: 'data_source', id: ds, title: rt(title), parent: { type: 'database_id', database_id: db }, properties: structuredClone(BASE_PROPS) });
    }
    // The copy's page holds its database, like 📇 Personal CRM (1).
    this.kids.set(normId(COPY.page), [this.addBlock(COPY.page, { type: 'child_database', id: COPY.database, child_database: { title: 'Contacts' } })]);
  }

  private edited(at = (this.clock += 60_000)) {
    return new Date(at).toISOString();
  }

  addBlock(parent: string, b: Json): string {
    const id = b.id ?? uid();
    const inner = b[b.type] as Json | undefined;
    if (inner?.rich_text) inner.rich_text = (inner.rich_text as Json[]).map((t) => ({ type: 'text', text: t.text, plain_text: t.plain_text ?? t.text?.content ?? '' }));
    this.blocks.set(normId(id), { object: 'block', created_time: this.edited(this.clock), has_children: false, ...b, id, parent: normId(parent) });
    return id;
  }

  /** A page from the database's template. */
  seedPage(ds: string, p: { name: string; associations?: string[]; birthday?: string; lastContacted?: string; update?: string; body?: Array<[string, string[]]>; likes?: string[] }): string {
    const id = uid();
    const props: Json = {
      Name: { id: 'title', type: 'title', title: rt(p.name) },
      Associations: { id: 'a', type: 'multi_select', multi_select: (p.associations ?? []).map((name) => ({ name })) },
      Birthday: { id: 'b', type: 'date', date: p.birthday ? { start: p.birthday } : null },
      'Last Contacted': { id: 'c', type: 'date', date: p.lastContacted ? { start: p.lastContacted } : null },
      'Last Update?': { id: 'd', type: 'rich_text', rich_text: p.update ? rt(p.update) : [] },
      Status: { id: 'e', type: 'formula', formula: { type: 'string', string: 'OK' } },
    };
    this.pages.set(normId(id), { object: 'page', id, parent: { type: 'data_source_id', data_source_id: ds, database_id: normId(ds) === normId(ORIGINAL.dataSource) ? ORIGINAL.database : COPY.database }, properties: props, created_time: this.edited(), last_edited_time: this.edited(), in_trash: false });
    const sections: Array<[string, string[]]> = p.body ?? [['Basic Deets', []], ['#How do I know them/First Met', []], ['Address', []], ['Family members', ['']], ['Likes', p.likes ?? []], ['Gift ideas', []], ['About them', []], ['Life Updates', []], ['Lore', []]];
    const ids: string[] = [];
    for (const [title, bullets] of sections) {
      const h3 = title.startsWith('#');
      const type = h3 ? 'heading_3' : 'heading_2';
      ids.push(this.addBlock(id, { type, [type]: { rich_text: rt(h3 ? title.slice(1) : title) } }));
      ids.push(this.addBlock(id, { type: 'divider', divider: {} }));
      for (const t of bullets) ids.push(this.addBlock(id, { type: 'bulleted_list_item', bulleted_list_item: { rich_text: t ? rt(t) : [] } }));
    }
    this.kids.set(normId(id), ids);
    return id;
  }

  page(id: string) {
    return this.pages.get(normId(id))!;
  }
  /** What a page says: its properties as text and its body as [heading, bullets]. */
  text(id: string, prop: string): string {
    const p = this.page(id).properties[prop];
    if (!p) return '';
    const v = p[p.type];
    if (p.type === 'multi_select') return v.map((o: Json) => o.name).join(', ');
    if (p.type === 'select') return v?.name ?? '';
    if (p.type === 'date') return v?.start ?? '';
    if (p.type === 'number') return v == null ? '' : String(v);
    if (p.type === 'formula') return v?.string ?? '';
    if (typeof v === 'string' || v == null) return v ?? '';
    return v.map((t: Json) => t.plain_text).join('');
  }
  section(id: string, heading: string): string[] {
    const out: string[] = [];
    let inside = false;
    for (const bid of this.kids.get(normId(id)) ?? []) {
      const b = this.blocks.get(normId(bid))!;
      if (b.in_trash) continue;
      if (/^heading_/.test(b.type)) {
        inside = b[b.type].rich_text.map((t: Json) => t.plain_text).join('') === heading;
        continue;
      }
      if (inside && b.type === 'bulleted_list_item') out.push(b.bulleted_list_item.rich_text.map((t: Json) => t.plain_text).join(''));
    }
    return out;
  }
  headings(id: string): string[] {
    return (this.kids.get(normId(id)) ?? []).map((b) => this.blocks.get(normId(b))!).filter((b) => /^heading_/.test(b.type) && !b.in_trash).map((b) => b[b.type].rich_text.map((t: Json) => t.plain_text).join(''));
  }
  pagesIn(ds: string) {
    return [...this.pages.values()].filter((p) => normId(p.parent.data_source_id) === normId(ds));
  }
  /** Someone edits a page in Notion. */
  editProps(id: string, props: Json, at?: number) {
    const p = this.page(id);
    Object.assign(p.properties, this.shape(normId(p.parent.data_source_id), props));
    p.last_edited_time = this.edited(at);
  }
  /** Someone changes one bullet's words in Notion. */
  editBullet(id: string, from: string, to: string) {
    const b = (this.kids.get(normId(id)) ?? []).map((x) => this.blocks.get(normId(x))!).find((x) => !x.in_trash && x.type === 'bulleted_list_item' && x.bulleted_list_item.rich_text.map((t: Json) => t.plain_text).join('') === from)!;
    b.bulleted_list_item = { rich_text: rt(to) };
    this.page(id).last_edited_time = this.edited();
  }
  /** Someone rewrites a section's bullets in Notion. */
  setSection(id: string, heading: string, bullets: string[]) {
    const list = this.kids.get(normId(id))!;
    let at = -1;
    let inside = false;
    list.forEach((bid, i) => {
      const b = this.blocks.get(normId(bid))!;
      if (/^heading_/.test(b.type)) inside = b[b.type].rich_text.map((t: Json) => t.plain_text).join('') === heading;
      else if (inside && b.type === 'bulleted_list_item') b.in_trash = true;
      if (inside) at = i;
    });
    list.splice(at + 1, 0, ...bullets.map((t) => this.addBlock(id, { type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt(t) } })));
    this.page(id).last_edited_time = this.edited();
  }
  writes() {
    return this.log.filter((c) => c.method !== 'GET' && !/\/query$/.test(c.path));
  }

  private shape(ds: string, props: Json): Json {
    const schema = this.sources.get(ds)!.properties;
    const out: Json = {};
    for (const [name, v] of Object.entries(props)) {
      const type = schema[name]?.type ?? Object.keys(v as Json)[0];
      let val = (v as Json)[type];
      if (type === 'title' || type === 'rich_text') val = (val as Json[]).map((t) => ({ type: 'text', text: t.text, plain_text: t.text.content }));
      out[name] = { id: schema[name]?.id ?? name, type, [type]: val };
    }
    return out;
  }

  private json(status: number, body: unknown, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  }
  private missing() {
    return this.json(404, { object: 'error', status: 404, code: 'object_not_found', message: 'Could not find that. Make sure it is shared with your integration.' });
  }

  fetch = async (url: string | URL, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? 'GET').toUpperCase();
    const u = new URL(String(url));
    const path = u.pathname.replace(/^\/v1/, '');
    const body = init.body ? (JSON.parse(String(init.body)) as Json) : null;
    this.log.push({ method, path, body });
    expect((init.headers as Record<string, string>)['Notion-Version']).toBe('2025-09-03');
    if (this.tooMany > 0) {
      this.tooMany--;
      return this.json(429, { code: 'rate_limited', message: 'Slow down' }, { 'retry-after': '1' });
    }
    let m: RegExpExecArray | null;
    if ((m = /^\/data_sources\/([^/]+)$/.exec(path))) {
      const ds = this.sources.get(normId(m[1]));
      if (!ds) return this.missing();
      if (method === 'PATCH') {
        for (const [name, def] of Object.entries(body!.properties as Json)) ds.properties[name] = { id: name, name, type: Object.keys(def as Json)[0], ...(def as Json) };
      }
      return this.json(200, ds);
    }
    if ((m = /^\/data_sources\/([^/]+)\/query$/.exec(path))) {
      const ds = normId(m[1]);
      if (!this.sources.has(ds)) return this.missing();
      let list = this.pagesIn(ds).filter((p) => !p.in_trash);
      const f = body?.filter;
      if (f?.timestamp === 'last_edited_time') list = list.filter((p) => p.last_edited_time >= f.last_edited_time.on_or_after);
      if (f?.property) list = list.filter((p) => this.text(p.id, f.property) === f.rich_text.equals);
      const start = body?.start_cursor ? Number(body.start_cursor) : 0;
      const size = Math.min(body?.page_size ?? 100, 2); // small pages, so paging is exercised
      const slice = list.slice(start, start + size);
      return this.json(200, { object: 'list', results: slice, has_more: start + size < list.length, next_cursor: start + size < list.length ? String(start + size) : null });
    }
    if ((m = /^\/databases\/([^/]+)$/.exec(path))) return this.databases.get(normId(m[1])) ? this.json(200, this.databases.get(normId(m[1]))) : this.missing();
    if (path === '/pages' && method === 'POST') {
      const ds = normId(body!.parent.data_source_id);
      if (!this.sources.has(ds)) return this.missing();
      const id = uid();
      const page = { object: 'page', id, parent: { type: 'data_source_id', data_source_id: body!.parent.data_source_id, database_id: COPY.database }, properties: this.shape(ds, body!.properties), created_time: this.edited(), last_edited_time: this.edited(), in_trash: false };
      this.pages.set(normId(id), page);
      this.kids.set(normId(id), (body!.children ?? []).map((c: Json) => this.addBlock(id, c)));
      return this.json(200, page);
    }
    if ((m = /^\/pages\/([^/]+)$/.exec(path))) {
      const p = this.pages.get(normId(m[1]));
      if (!p) return this.missing();
      if (method === 'PATCH') {
        Object.assign(p.properties, this.shape(normId(p.parent.data_source_id), body!.properties));
        p.last_edited_time = this.edited();
      }
      return this.json(200, p);
    }
    if ((m = /^\/blocks\/([^/]+)\/children$/.exec(path))) {
      const parent = normId(m[1]);
      if (!this.pages.has(parent) && !this.blocks.has(parent) && !this.kids.has(parent)) return this.missing();
      const list = this.kids.get(parent) ?? [];
      if (method === 'GET') {
        const live = list.map((b) => this.blocks.get(normId(b))!).filter((b) => !b.in_trash);
        const start = Number(u.searchParams.get('start_cursor') ?? 0);
        const size = 4;
        return this.json(200, { object: 'list', results: live.slice(start, start + size), has_more: start + size < live.length, next_cursor: start + size < live.length ? String(start + size) : null });
      }
      // PATCH: append (after a block, when given); answers with the new blocks.
      const made = (body!.children as Json[]).map((c) => this.addBlock(parent, c));
      const at = body!.after ? list.findIndex((b) => normId(b) === normId(body!.after)) + 1 : list.length;
      list.splice(at > 0 ? at : list.length, 0, ...made);
      this.kids.set(parent, list);
      const page = this.pages.get(parent);
      if (page) page.last_edited_time = this.edited();
      return this.json(200, { object: 'list', results: made.map((b) => this.blocks.get(normId(b))) });
    }
    if ((m = /^\/blocks\/([^/]+)$/.exec(path)) && method === 'PATCH') {
      // New words for a block (R7f: a Notion Fact edited in LifeOS).
      const b = this.blocks.get(normId(m[1]));
      if (!b) return this.missing();
      b[b.type] = { ...b[b.type], rich_text: rt((body![b.type].rich_text as Json[]).map((t) => t.text.content).join('')) };
      const page = this.pages.get(b.parent);
      if (page) page.last_edited_time = this.edited();
      return this.json(200, b);
    }
    if ((m = /^\/blocks\/([^/]+)$/.exec(path)) && method === 'DELETE') {
      const b = this.blocks.get(normId(m[1]));
      if (!b) return this.missing();
      b.in_trash = true;
      const page = this.pages.get(b.parent);
      if (page) page.last_edited_time = this.edited();
      return this.json(200, b);
    }
    return this.json(400, { code: 'invalid_request_url', message: `No route ${method} ${path}` });
  };
}

/* ------------------------------------------------------------------ */

let os: LifeOSContext;
let notion: FakeNotion;
let secrets: Record<string, string>;
const agenda: ModuleManifest = { id: 'agenda', name: 'Agenda', version: '1', description: '', icon: 'x', color: '#000', objects: [eventType] };

async function boot(opts: { finance?: boolean } = {}) {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, agenda, ...(opts.finance ? [financeModule] : [])], registry: new Registry() });
  secrets = { [NOTION_TOKEN]: 'ntn_test_token_1234567890abcdef' };
  os.device = { secrets: { get: async (k) => secrets[k] ?? null, set: async (k, v) => void (v ? (secrets[k] = v) : delete secrets[k]) } };
}

beforeEach(async () => {
  notionTiming.gapMs = 0;
  notion = new FakeNotion();
  vi.stubGlobal('fetch', notion.fetch);
  await boot();
});
afterEach(() => {
  vi.unstubAllGlobals();
  os.db.close();
});

const src = () => os.registry.sources.get('notion')!;
const sync = () => runSource(os, src());
const people = () => os.records.query<PersonData>('person', {}, { limit: 1000 });
const byName = (name: string) => people().find((p) => p.title === name)!;
const facts = (id: string) => os.facts.list({ subjectId: id }).map((f) => f.text).sort();
const tags = (id: string) => os.tags.forEntity(id).map((t) => t.name).sort();
const waiting = () => os.outbox.waiting('notion');
const originalIds = () => new Set([normId(ORIGINAL.dataSource), normId(ORIGINAL.database), ...notion.pagesIn(ORIGINAL.dataSource).map((p) => normId(p.id)), ...[...notion.blocks.values()].filter((b) => notion.pagesIn(ORIGINAL.dataSource).some((p) => normId(p.id) === b.parent)).map((b) => normId(b.id))]);
/** No write ever named the original or anything in it. */
function expectOriginalUntouched() {
  const ids = originalIds();
  for (const w of notion.writes()) {
    const named = [...(w.path.match(/[0-9a-f-]{36}|[0-9a-f]{32}/gi) ?? []), w.body?.parent?.data_source_id, w.body?.parent?.database_id, w.body?.after].filter(Boolean).map((x) => normId(String(x)));
    for (const n of named) expect(ids.has(n), `${w.method} ${w.path} touched the original`).toBe(false);
  }
}

/** The copy as of 30 Oct, a few pages from the template; the original holds the same people. */
function seed() {
  const today = Date.now();
  const kunal = notion.seedPage(COPY.dataSource, {
    name: 'Kunal Shah',
    associations: ['Friend', 'College'],
    birthday: '2024-03-15',
    lastContacted: isoDay(today - 20 * DAY),
    update: 'Started at Google',
    body: [['Basic Deets', []], ['#How do I know them/First Met', ['Met at IIT orientation']], ['Address', ['Koramangala 4th block']], ['Family members', ['']], ['Likes', ['Filter coffee', 'Pottery']], ['Gift ideas', ['A Hario V60']], ['About them', []], ['Life Updates', ['Got engaged']], ['Lore', []]],
  });
  const priya = notion.seedPage(COPY.dataSource, { name: 'Priya Sharma', associations: ['Family'], birthday: '2025-11-02', likes: ['Jazz'] });
  const orig = notion.seedPage(ORIGINAL.dataSource, { name: 'Kunal Shah', associations: ['Friend'], birthday: '2024-03-15', likes: ['Filter coffee'] });
  return { kunal, priya, orig };
}

/* ------------------------------------------------------------------ */

describe('the hard rule: LifeOS never writes to the original', () => {
  it('every write path of the client refuses the original: data source, database, a page whose parent is the original, its blocks', async () => {
    const { orig, kunal } = seed();
    expect(() => new NotionClient({ token: 't', target: ORIGINAL.dataSource })).toThrow(ORIGINAL_REFUSAL);
    expect(() => new NotionClient({ token: 't', target: ORIGINAL.database })).toThrow(ORIGINAL_REFUSAL);
    const c = new NotionClient({ token: 't', target: COPY.dataSource });
    await expect(c.updateDataSource(ORIGINAL.dataSource, { Phone: { phone_number: {} } })).rejects.toThrow(ORIGINAL_REFUSAL);
    await expect(c.updateDataSource(ORIGINAL.database, { Phone: { phone_number: {} } })).rejects.toThrow(ORIGINAL_REFUSAL);
    await expect(c.updateDataSource(normId(ORIGINAL.dataSource), {})).rejects.toThrow(ORIGINAL_REFUSAL);
    await expect(c.createPage(ORIGINAL.dataSource, {})).rejects.toThrow(ORIGINAL_REFUSAL);
    await expect(c.createPage(ORIGINAL.database, {})).rejects.toThrow(ORIGINAL_REFUSAL);
    // A page of the original, read first: still never written, nor its blocks.
    await c.getPage(orig);
    const blocks = await c.listChildren(orig);
    await expect(c.updatePage(orig, { Name: { title: [] } })).rejects.toThrow(ORIGINAL_REFUSAL);
    await expect(c.appendChildren(orig, [{ type: 'divider', divider: {} }])).rejects.toThrow(ORIGINAL_REFUSAL);
    await expect(c.deleteBlock(blocks[0]!.id)).rejects.toThrow(ORIGINAL_REFUSAL);
    await expect(c.appendChildren((await c.getPage(kunal)).id, [{ type: 'divider', divider: {} }], blocks[0]!.id)).rejects.toThrow();
    // A page found by a query of the original (reading it is allowed): never written.
    const [fromQuery] = await c.queryDataSource(ORIGINAL.dataSource);
    await expect(c.updatePage(fromQuery!.id, {})).rejects.toThrow(ORIGINAL_REFUSAL);
    // Something not read from the copy is never written either.
    const stranger = new NotionClient({ token: 't', target: COPY.dataSource });
    await expect(stranger.updatePage(kunal, {})).rejects.toThrow(WriteRefused);
    await expect(stranger.deleteBlock(blocks[1]!.id)).rejects.toThrow(WriteRefused);
    // On the wire, whoever asks.
    await expect(c.request('PATCH', `/data_sources/${ORIGINAL.dataSource}`, {})).rejects.toThrow(ORIGINAL_REFUSAL);
    await expect(c.request('POST', '/pages', { parent: { type: 'data_source_id', data_source_id: ORIGINAL.dataSource }, properties: {} })).rejects.toThrow(ORIGINAL_REFUSAL);
    await expect(c.request('DELETE', `/blocks/${ORIGINAL.database}`)).rejects.toThrow(ORIGINAL_REFUSAL);
    expect(notion.writes()).toEqual([]);
  });

  it('a Person pointed at a page of the original is refused on send, and nothing is read into LifeOS from it', async () => {
    const { orig } = seed();
    await sync();
    const p = os.records.create<PersonData>({ object: 'person', title: 'Old link', data: {} });
    os.records.update<PersonData>(p.id, { data: { notionId: orig } });
    const before = notion.writes().length;
    await sync().catch(() => {});
    const refused = os.outbox.refused('notion').find((i) => i.recordId === p.id);
    expect(refused?.error).toBe(ORIGINAL_REFUSAL);
    expect(os.records.get<PersonData>(p.id)!.title).toBe('Old link');
    expect(notion.writes().slice(before).some((w) => w.path.includes(orig))).toBe(false);
    expectOriginalUntouched();
  });

  it('the target can be another copy, never the original (by its ids, or a link to the page holding it)', async () => {
    const holder = 'cccccccc-dddd-4eee-8fff-000000000001';
    notion.pages.set(normId(holder), { object: 'page', id: holder, parent: { type: 'workspace' }, properties: {}, last_edited_time: new Date().toISOString() });
    notion.kids.set(normId(holder), [notion.addBlock(holder, { type: 'child_database', id: ORIGINAL.database, child_database: { title: '🫂 Contacts' } })]);
    expect(() => setNotionTarget(os, ORIGINAL.dataSource)).toThrow(ORIGINAL_REFUSAL);
    await expect(resolveNotionLink(os, `https://www.notion.so/ryu/Contacts-${normId(ORIGINAL.database)}?v=1234567890abcdef1234567890abcdef`)).rejects.toThrow(ORIGINAL_REFUSAL);
    await expect(resolveNotionLink(os, `collection://${ORIGINAL.dataSource}`)).rejects.toThrow(ORIGINAL_REFUSAL);
    await expect(resolveNotionLink(os, `https://www.notion.so/Personal-CRM-${normId(holder)}`)).rejects.toThrow(ORIGINAL_REFUSAL);
    expect(await resolveNotionLink(os, `https://app.notion.com/p/${normId(COPY.page)}`)).toMatchObject({ dataSource: COPY.dataSource });
    expect(notion.writes()).toEqual([]);
  });
});

describe('first sync', () => {
  it('adds the columns to the copy only; pages become People; People without pages get pages on send', async () => {
    const { kunal, priya } = seed();
    const k = os.records.create<PersonData>({ object: 'person', title: 'Kunal Shah', data: { phone: '+91 98450 12345' } });
    os.facts.add({ text: 'Plays badminton on Sundays', subjectId: k.id, source: 'user', statedAt: Date.now() - DAY });
    os.tags.apply(k.id, 'Football'); // a Turf player: the tag joins the Associations, never replaces them
    const asha = os.records.create<PersonData>({ object: 'person', title: 'Asha Iyer', data: { likes: 'books, chai', relationship: 'colleague', city: 'Pune' } });
    os.tags.apply(asha.id, 'Colleague');

    expect(await sync()).toBeGreaterThan(0);
    // The columns, added once, to the copy.
    const patches = notion.writes().filter((w) => w.method === 'PATCH' && w.path.startsWith('/data_sources/'));
    expect(patches.map((w) => normId(w.path.split('/')[2]))).toEqual([normId(COPY.dataSource)]);
    expect(Object.keys(patches[0]!.body!.properties).sort()).toEqual(['Balance', 'City', 'Email', 'Keep in touch', 'LifeOS id', 'Phone', 'Relationship', 'Role', 'UPI IDs', 'Works at'].sort());
    expect(Object.keys(notion.sources.get(normId(ORIGINAL.dataSource))!.properties)).toEqual(Object.keys(BASE_PROPS));

    // Kunal matched by name (no second Kunal); Priya made.
    expect(people().filter((p) => p.title === 'Kunal Shah')).toHaveLength(1);
    const kd = os.records.get<PersonData>(k.id)!.data;
    expect(kd).toMatchObject({ notionId: kunal, birthday: '1900-03-15', likes: 'Filter coffee, Pottery', relationship: 'friend', lastContactAt: isoDay(Date.now() - 20 * DAY) });
    expect(tags(k.id)).toEqual(['College', 'Football', 'Friend']);
    // Bullets → Facts (not Likes, not empty ones); Last Update? → a Fact.
    expect(facts(k.id)).toEqual(['A Hario V60', 'Got engaged', 'Koramangala 4th block', 'Met at IIT orientation', 'Plays badminton on Sundays', 'Started at Google']);
    expect(os.facts.list({ subjectId: k.id }).filter((f) => f.source === 'notion')).toHaveLength(5);
    const p = byName('Priya Sharma');
    expect(p.data).toMatchObject({ notionId: priya, birthday: '1900-11-02', relationship: 'family', likes: 'Jazz' });
    expect(tags(p.id)).toEqual(['Family']);
    // Everyone waits to be sent: Kunal (phone, LifeOS id…), Priya (LifeOS id), Asha (no page yet).
    expect(waiting().map((i) => i.recordId).sort()).toEqual([k.id, p.id, asha.id].sort());

    await sync();
    expect(waiting()).toEqual([]);
    // Asha's page, in the copy, from the template.
    const ashaPage = os.records.get<PersonData>(asha.id)!.data.notionId!;
    expect(notion.page(ashaPage).parent.data_source_id).toBe(COPY.dataSource);
    expect(notion.text(ashaPage, 'Name')).toBe('Asha Iyer');
    expect(notion.text(ashaPage, 'LifeOS id')).toBe(asha.id);
    expect(notion.text(ashaPage, 'City')).toBe('Pune');
    expect(notion.text(ashaPage, 'Relationship')).toBe('Colleague');
    expect(notion.text(ashaPage, 'Associations')).toBe('Colleague');
    expect(notion.section(ashaPage, 'Likes')).toEqual(['books', 'chai']);
    expect(notion.headings(ashaPage).at(-1)).toBe('LifeOS log');
    // Kunal's page heard what LifeOS knows.
    expect(notion.text(kunal, 'Phone')).toBe('+91 98450 12345');
    expect(notion.text(kunal, 'LifeOS id')).toBe(k.id);
    expect(notion.text(kunal, 'Relationship')).toBe('Friend');
    expect(notion.text(kunal, 'Associations').split(', ').sort()).toEqual(['College', 'Football', 'Friend']);
    expect(notion.text(kunal, 'Last Update?')).toBe('Plays badminton on Sundays');
    expect(notion.section(kunal, 'Life Updates')).toEqual(['Got engaged', expect.stringMatching(/^\d{1,2} [A-Z][a-z]{2} · Plays badminton on Sundays$/)]);
    expect(notion.text(kunal, 'Birthday')).toBe('2024-03-15'); // unchanged: LifeOS agreed
    expect(notion.text(priya, 'Relationship')).toBe('Family');
    expect(notion.text(kunal, 'Status')).toBe('OK'); // the formula is never written
    expect(notion.writes().some((w) => w.body?.properties?.Status)).toBe(false);
    expectOriginalUntouched();
  });

  it('re-sync is idempotent: no second People, Facts, tags, bullets or log lines', async () => {
    const { kunal } = seed();
    const k = os.records.create<PersonData>({ object: 'person', title: 'Kunal Shah', data: {} });
    const ev = os.records.create({ object: 'event', title: 'Lunch at Toit', data: { kind: 'met', startAt: Date.now() - 3 * DAY } });
    os.links.link(ev.id, k.id, 'with', {}, 'system');
    await sync();
    await sync();
    const snapshot = () => ({ people: people().length, facts: os.facts.list({ limit: 1000 }).length, tags: os.tags.forEntity(k.id).length, log: notion.section(kunal, 'LifeOS log'), updates: notion.section(kunal, 'Life Updates'), likes: notion.section(kunal, 'Likes'), pages: notion.pagesIn(COPY.dataSource).length });
    const once = snapshot();
    expect(once.log).toEqual([expect.stringMatching(/ · Lunch at Toit$/)]);
    // Touch every page in Notion so all of it is pulled again.
    for (const p of notion.pagesIn(COPY.dataSource)) notion.editProps(p.id, {});
    await sync();
    await sync();
    expect(snapshot()).toEqual(once);
    expect(waiting()).toEqual([]);
  });

  it('an unsure match is asked once in To check; the answer brings the page in', async () => {
    const rahul = notion.seedPage(COPY.dataSource, { name: 'Rahul', associations: ['Friend'] });
    const r1 = os.records.create<PersonData>({ object: 'person', title: 'Rahul', data: { city: 'Pune' } });
    os.records.create<PersonData>({ object: 'person', title: 'Rahul', data: { city: 'Delhi' } });
    await sync();
    const asks = () => os.filings.toCheck().filter((f) => f.kind === NOTION_MATCH);
    expect(asks()).toHaveLength(1);
    expect(asks()[0]!.label).toBe('Is Notion’s “Rahul” one of your People?');
    expect(people().filter((p) => p.title === 'Rahul')).toHaveLength(2);
    notion.editProps(rahul, {});
    await sync();
    await sync();
    expect(os.filings.toCheck().filter((f) => f.kind === NOTION_MATCH)).toHaveLength(1);
    expect(os.settings.get<Record<string, string>>(NOTION_ASKED, {})[normId(rahul)]).toBeTruthy();
    answerNotionMatch(os, asks()[0]!.id, r1.id);
    expect(asks()).toHaveLength(0);
    await sync();
    expect(tags(r1.id)).toEqual(['Friend']);
    expect(notion.text(rahul, 'City')).toBe('Pune');
    expect(notion.text(rahul, 'LifeOS id')).toBe(r1.id);
    expect(people().filter((p) => p.title === 'Rahul')).toHaveLength(2);
  });
});

describe('newest edit wins, per Field', () => {
  async function paired() {
    const { kunal } = seed();
    const k = os.records.create<PersonData>({ object: 'person', title: 'Kunal Shah', data: { city: 'Mumbai' } });
    await sync();
    await sync();
    expect(waiting()).toEqual([]);
    return { kunal, k };
  }

  it('Notion → LifeOS, LifeOS → Notion, without echo', async () => {
    const { kunal, k } = await paired();
    notion.editProps(kunal, { Role: { rich_text: [{ text: { content: 'Designer' } }] }, Associations: { multi_select: [{ name: 'Friend' }, { name: 'College' }, { name: 'Inner Circle' }] } });
    await sync();
    expect(os.records.get<PersonData>(k.id)!.data.role).toBe('Designer');
    expect(tags(k.id)).toEqual(['College', 'Friend', 'Inner Circle']);
    expect(waiting()).toEqual([]); // no echo
    const writes = notion.writes().length;
    os.records.update<PersonData>(k.id, { data: { email: 'kunal@example.com' } });
    expect(waiting()).toHaveLength(1);
    os.records.update<PersonData>(k.id, { data: { role: 'Design lead' } });
    expect(waiting()).toHaveLength(1); // one item per Person
    await sync();
    expect(notion.text(kunal, 'Email')).toBe('kunal@example.com');
    expect(notion.text(kunal, 'Role')).toBe('Design lead');
    expect(notion.writes().length).toBeGreaterThan(writes);
    // A tag added here becomes an association there.
    os.tags.apply(k.id, 'Bouldering');
    await sync();
    expect(notion.text(kunal, 'Associations').split(', ').sort()).toEqual(['Bouldering', 'College', 'Friend', 'Inner Circle']);
  });

  it('both changed: the later edit wins and the other is shown once in To check', async () => {
    const { kunal, k } = await paired();
    // LifeOS edits City now; Notion's edit is older (an hour ago): LifeOS wins.
    os.records.update<PersonData>(k.id, { data: { city: 'Bengaluru' } });
    notion.editProps(kunal, { City: { rich_text: [{ text: { content: 'Pune' } }] } }, Date.now() - 3_600_000);
    // The waiting change is sent first: send reads the page again, sees both, keeps the newer.
    await sync();
    const conflicts = () => os.filings.toCheck().filter((f) => f.kind === NOTION_CONFLICT);
    expect(conflicts().map((f) => f.label)).toEqual(['Notion said ‘Pune’, LifeOS kept ‘Bengaluru’ for Kunal Shah’s City']);
    expect(notion.text(kunal, 'City')).toBe('Bengaluru');
    expect(os.records.get<PersonData>(k.id)!.data.city).toBe('Bengaluru');
    await sync();
    expect(conflicts()).toHaveLength(1);

    // Notion's later edit wins over an older one here.
    os.filings.setChecked(conflicts()[0]!.id);
    os.records.update<PersonData>(k.id, { data: { role: 'PM' } });
    notion.editProps(kunal, { Role: { rich_text: [{ text: { content: 'Founder' } }] } }, Date.now() + 3_600_000);
    await sync();
    expect(os.records.get<PersonData>(k.id)!.data.role).toBe('Founder');
    const c = conflicts()[0]!;
    expect(c.label).toBe('LifeOS said ‘PM’, Notion kept ‘Founder’ for Kunal Shah’s Role');
    // "Use the other": LifeOS's value after all, sent to Notion.
    takeOtherNotionValue(os, c.id);
    expect(os.records.get<PersonData>(k.id)!.data.role).toBe('PM');
    await sync();
    expect(notion.text(kunal, 'Role')).toBe('PM');
    expectOriginalUntouched();
  });

  it('Last Contacted: the later date wins both ways; Birthday: month and day, the next one written back', async () => {
    const { kunal, k } = await paired();
    notion.editProps(kunal, { 'Last Contacted': { date: { start: isoDay(Date.now() - 2 * DAY) } } });
    await sync();
    expect(os.records.get<PersonData>(k.id)!.data.lastContactAt).toBe(isoDay(Date.now() - 2 * DAY));
    notion.editProps(kunal, { 'Last Contacted': { date: { start: isoDay(Date.now() - 30 * DAY) } } });
    await sync();
    await sync();
    expect(os.records.get<PersonData>(k.id)!.data.lastContactAt).toBe(isoDay(Date.now() - 2 * DAY));
    expect(notion.text(kunal, 'Last Contacted')).toBe(isoDay(Date.now() - 2 * DAY));
    // A birthday with a year known here keeps it; Notion gets the next occurrence.
    os.records.update<PersonData>(k.id, { data: { birthday: '1994-01-05' } });
    await sync();
    const now = new Date();
    const next = new Date(now.getFullYear(), 0, 5) < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? now.getFullYear() + 1 : now.getFullYear();
    expect(notion.text(kunal, 'Birthday')).toBe(`${next}-01-05`);
    expect(os.records.get<PersonData>(k.id)!.data.birthday).toBe('1994-01-05');
    notion.editProps(kunal, { Birthday: { date: { start: '2024-01-07' } } });
    await sync();
    expect(os.records.get<PersonData>(k.id)!.data.birthday).toBe('1994-01-07');
  });
});

describe('the page body', () => {
  it('likes edited here rewrite the copy’s Likes bullets; a Fact said here lands under Life Updates; a call lands in the LifeOS log', async () => {
    const { kunal } = seed();
    await sync();
    await sync();
    const k = byName('Kunal Shah');
    expect(notion.section(kunal, 'Likes')).toEqual(['Filter coffee', 'Pottery']);
    os.records.update<PersonData>(k.id, { data: { likes: 'Filter coffee, RCB, bouldering' } });
    await sync();
    expect(notion.section(kunal, 'Likes')).toEqual(['Filter coffee', 'RCB', 'bouldering']);
    expect(facts(k.id)).not.toContain('RCB');

    os.facts.add({ text: 'Moved to Pune', subjectId: k.id, source: 'talk' });
    await sync();
    expect(notion.section(kunal, 'Life Updates')).toEqual(['Got engaged', expect.stringMatching(/^\d{1,2} [A-Z][a-z]{2} · Moved to Pune$/)]);
    expect(notion.text(kunal, 'Last Update?')).toBe('Moved to Pune');

    const call = os.records.create({ object: 'event', title: 'Call with Kunal', data: { kind: 'call', startAt: Date.now() - 60 * 60_000 } });
    os.links.link(call.id, k.id, 'with', {}, 'system');
    await sync();
    expect(notion.section(kunal, 'LifeOS log')).toEqual([expect.stringMatching(/ · Call with Kunal$/)]);
    expect(notion.headings(kunal).at(-1)).toBe('LifeOS log');
    // Pulled back: nothing doubles, the log is never read as Facts.
    notion.editProps(kunal, {});
    await sync();
    await sync();
    expect(facts(k.id).filter((t) => t.includes('Moved to Pune'))).toEqual(['Moved to Pune']);
    expect(facts(k.id).some((t) => t.includes('Call with Kunal'))).toBe(false);
    expect(notion.section(kunal, 'LifeOS log')).toHaveLength(1);
    // Likes edited in Notion come back as likes, not Facts.
    notion.setSection(kunal, 'Likes', ['Filter coffee', 'Chess']);
    await sync();
    expect(os.records.get<PersonData>(k.id)!.data.likes).toBe('Filter coffee, Chess');
    expect(facts(k.id)).not.toContain('Chess');
    expect(waiting()).toEqual([]);
    expectOriginalUntouched();
  });
});

describe('a Notion Fact edited in LifeOS (R7f)', () => {
  it('changes its bullet in the copy; changed there afterwards, the Fact follows', async () => {
    const { kunal } = seed();
    await sync();
    await sync();
    const k = byName('Kunal Shah');
    const f = os.facts.list({ subjectId: k.id }).find((x) => x.text === 'Koramangala 4th block')!;
    expect(f.source).toBe('notion');
    os.facts.edit(f.id, 'HSR Layout, sector 2');
    expect(waiting().map((i) => i.recordId)).toContain(k.id);
    await sync();
    expect(notion.section(kunal, 'Address')).toEqual(['HSR Layout, sector 2']);
    expect(os.facts.get(f.id)).toMatchObject({ text: 'HSR Layout, sector 2', active: true, source: 'notion' });
    // Agreed now: another sync writes nothing to it and keeps one Fact.
    const before = notion.writes().filter((w) => w.method === 'PATCH' && /^\/blocks\/[^/]+$/.test(w.path)).length;
    notion.editProps(kunal, {});
    await sync();
    expect(notion.writes().filter((w) => w.method === 'PATCH' && /^\/blocks\/[^/]+$/.test(w.path))).toHaveLength(before);
    expect(facts(k.id).filter((t) => /HSR|Koramangala/.test(t))).toEqual(['HSR Layout, sector 2']);
    // Changed in Notion: Notion's words come back.
    notion.editBullet(kunal, 'HSR Layout, sector 2', 'Indiranagar 12th main');
    await sync();
    expect(facts(k.id).filter((t) => /HSR|Koramangala|Indiranagar/.test(t))).toEqual(['Indiranagar 12th main']);
    expect(notion.section(kunal, 'Address')).toEqual(['Indiranagar 12th main']);
    expectOriginalUntouched();
  });
});

describe('Balance', () => {
  it('comes from the balances tool when finance is registered', async () => {
    os.db.close();
    await boot({ finance: true });
    const { kunal } = seed();
    const k = os.records.create<PersonData>({ object: 'person', title: 'Kunal Shah', data: {} });
    os.records.create({ object: 'debt', title: 'Dinner', data: { personId: k.id, direction: 'they_owe', amount: 500, date: isoDay(Date.now()), kind: 'loan' } });
    await sync();
    await sync();
    expect(notion.text(kunal, 'Balance')).toBe('500');
  });

  it('is left empty without finance', async () => {
    const { kunal } = seed();
    await sync();
    await sync();
    expect(notion.text(kunal, 'Balance')).toBe('');
    expect(notion.writes().some((w) => w.path.startsWith('/pages') && w.body?.properties?.Balance)).toBe(false);
  });
});

describe('the client', () => {
  it('waits Retry-After on a 429 and goes again', async () => {
    seed();
    const waits: number[] = [];
    const sleep = notionTiming.sleep;
    notionTiming.sleep = async (ms) => void waits.push(ms);
    try {
      notion.tooMany = 1;
      const c = new NotionClient({ token: 't', target: COPY.dataSource });
      expect((await c.getDataSource(COPY.dataSource)).id).toBe(COPY.dataSource);
      expect(waits).toContain(1000);
    } finally {
      notionTiming.sleep = sleep;
    }
  });

  it('is unavailable without a token, and the token is never in settings', async () => {
    delete secrets[NOTION_TOKEN];
    expect(await src().available!(os)).toBe(false);
    expect(await sync()).toBe(0);
    expect(JSON.stringify(os.settings.all())).not.toContain('ntn_');
  });
});
