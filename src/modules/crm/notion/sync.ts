import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { OutboxItem } from '@core/repo/outboxRepo';
import type { SendAnswer } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { resolveCandidates } from '@core/ai/lifeTools';
import { phoneKey } from '@core/identity';
import type { PersonData } from '../types';
import { touchLastSpoke } from '../lastSpoke';
import { COPY, NotionClient, NotionError, ORIGINAL_REFUSAL, WriteRefused, idsIn, isOriginal, normId, type NotionBlock, type NotionDataSource, type NotionPage } from './client';
import {
  KEYS, KEY_LABEL, LIFE_UPDATES, LIKES, LOG, MAPPED_CHANGES, NEW_PROPERTIES, PROP,
  applyKey, mergeLists, propOf, plain, blockText, bullet, divider, factBullet, findSection, heading2, isBullet, keyProperty, lifeValues, logLines, multiNames, namedProperty, norm,
  notionValues, propNumber, propText, relationshipFromAssociations, sectionKey, sections, stripDay, templateBlocks, type Key, type Section,
} from './mapping';

/**
 * Notion, kept in step with People, both ways (docs/MODEL.md layer 4; R2b).
 *
 * Pull (`syncNotion`): the copy's pages edited since the cursor (Notion's
 * last_edited_time, kept by the module like Turf keeps its change number);
 * each is matched to a Person (its Notion id, LifeOS id, phone, email, a
 * unique exact name; unsure → To check once; nothing → a new Person), then
 * reconciled Field by Field against the snapshot of what both sides last
 * agreed: a one-sided change goes the other way, both changed → the later
 * edit wins and the other value is shown once in To check. What LifeOS must
 * tell the page waits in the outbox, one item per Person.
 *
 * Push (`sendNotion`): for each waiting Person, read the page again (so an
 * edit made in Notion since is never overwritten), reconcile, and write what
 * LifeOS changed: the properties, the Likes bullets, new Facts under Life
 * Updates, new lines in the LifeOS log. Only ever to the copy (client.ts).
 */

export const SOURCE_ID = 'notion';
/** The phone's secure store key for the integration token (never settings, never a backup). */
export const NOTION_TOKEN = 'notion.token';
/** The data source LifeOS writes to (default: the copy, 📇 Personal CRM (1)). */
export const SETTING_TARGET = 'crm.notion.dataSource';
export const SETTING_TARGET_NAME = 'crm.notion.dataSourceName';
/** Notion's last_edited_time of the newest page pulled. */
export const SETTING_CURSOR = 'crm.notion.cursor';
/** Per Person: the page, and what both sides last agreed on. */
export const SETTING_SNAP = 'crm.notion.snap';
/** Pages asked about once in To check (page id → filing id). */
export const SETTING_ASKED = 'crm.notion.asked';
/** The last sync, for You › Data sources › Notion. */
export const SETTING_LAST = 'crm.notion.last';

export const FILING_MATCH = 'notion-match';
export const FILING_CONFLICT = 'notion-conflict';

export const isNotionToken = (t: string) => /^(ntn_|secret_)[A-Za-z0-9_-]{20,}$/.test(t.trim());

export interface NotionSnap {
  page: string;
  /** Normal forms both sides last agreed on, per Field. */
  v: Partial<Record<Key, string>>;
  /** Last Update? as last agreed. */
  update?: string;
  /** Blocks known: block id → the Fact it is, the section it sat in, and its text as both sides last agreed (R7f). */
  bullets?: Record<string, { f: string; s: string; t?: string }>;
  /** LifeOS Facts already written under Life Updates. */
  sent?: string[];
  /** LifeOS log lines already written. */
  log?: string[];
  /** Relationship was filled from Associations (only ever once). */
  rel?: 1;
  /** The page's last_edited_time when last reconciled. */
  edited?: string;
}

export interface NotionSyncResult {
  at: number;
  pulled: number;
  created: number;
  matched: number;
  updated: number;
  facts: number;
  conflicts: number;
  asked: number;
  queued: number;
  first: boolean;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export const notionTarget = (os: LifeOSContext) => os.settings.get<string>(SETTING_TARGET, '') || COPY.dataSource;
export const notionTargetName = (os: LifeOSContext) => os.settings.get<string>(SETTING_TARGET_NAME, '') || (normId(notionTarget(os)) === normId(COPY.dataSource) ? COPY.name : 'Your copy');
export const notionLast = (os: LifeOSContext) => os.settings.get<NotionSyncResult | null>(SETTING_LAST, null);
const snaps = (os: LifeOSContext) => os.settings.get<Record<string, NotionSnap>>(SETTING_SNAP, {});
export const notionSnap = (os: LifeOSContext, personId: string): NotionSnap | null => snaps(os)[personId] ?? null;
function saveSnap(os: LifeOSContext, personId: string, s: NotionSnap) {
  const all = snaps(os);
  all[personId] = s;
  os.settings.set(SETTING_SNAP, all);
}

export async function notionClient(os: LifeOSContext, opts: { target?: string | null } = {}): Promise<NotionClient> {
  const token = await os.device?.secrets?.get(NOTION_TOKEN);
  if (!token) throw new Error('Paste your Notion token first (You › Data sources › Notion)');
  return new NotionClient({ token, target: opts.target === undefined ? notionTarget(os) : opts.target });
}

/** Point LifeOS at another copy (never the original). Starts afresh: the next sync pulls every page of it. */
export function setNotionTarget(os: LifeOSContext, dataSourceId: string, name?: string): void {
  if (isOriginal(dataSourceId)) throw new WriteRefused(ORIGINAL_REFUSAL);
  const same = normId(dataSourceId) === normId(notionTarget(os));
  os.settings.set(SETTING_TARGET, dataSourceId);
  os.settings.set(SETTING_TARGET_NAME, name ?? '');
  if (same) return;
  os.settings.set(SETTING_CURSOR, null);
  os.settings.set(SETTING_SNAP, {});
  os.settings.set(SETTING_ASKED, {});
  fromNotion(() => {
    for (const p of os.records.query<PersonData>('person', {}, { limit: 10000 })) if (p.data.notionId) os.records.update<PersonData>(p.id, { data: { notionId: undefined } }, 'system');
  });
}

/**
 * A pasted link → the copy's data source. Refuses your original, by its ids
 * at once and, once Notion has answered, by what the link turned out to be.
 */
export async function resolveNotionLink(os: LifeOSContext, link: string): Promise<{ dataSource: string; name: string }> {
  const ids = idsIn(link.replace(/[?&]v=[0-9a-f-]{32,36}/gi, ''));
  if (ids.some(isOriginal)) throw new WriteRefused(ORIGINAL_REFUSAL);
  if (!ids.length) throw new Error('That isn’t a Notion link — copy it from the copy’s ••• › Copy link');
  const client = await notionClient(os, { target: null });
  const title = (t?: Array<{ plain_text?: string }>) => plain(t) || 'Your copy';
  const check = (ds: NotionDataSource) => {
    if (isOriginal(ds.id) || isOriginal(ds.parent?.database_id)) throw new WriteRefused(ORIGINAL_REFUSAL);
    return { dataSource: ds.id, name: title(ds.title) };
  };
  const viaDatabase = async (id: string) => {
    const db = await client.getDatabase(id);
    const ds = db.data_sources?.[0];
    if (!ds) throw new Error('That database has no data source Notion will show');
    if (isOriginal(ds.id) || isOriginal(db.id)) throw new WriteRefused(ORIGINAL_REFUSAL);
    return check(await client.getDataSource(ds.id));
  };
  for (const id of ids) {
    try {
      return check(await client.getDataSource(id));
    } catch (e) {
      if (e instanceof WriteRefused) throw e;
    }
    try {
      return await viaDatabase(id);
    } catch (e) {
      if (e instanceof WriteRefused) throw e;
    }
    try {
      // A page link: the database inside it.
      const kids = await client.listChildren(id);
      const db = kids.find((b) => b.type === 'child_database');
      if (db) return await viaDatabase(db.id);
    } catch (e) {
      if (e instanceof WriteRefused) throw e;
    }
  }
  throw new Error('Notion can’t see that — share the copy with your integration (••• › Connections), then paste its link again');
}

/* ------------------------------------------------------------------ */
/* Queueing changes made in LifeOS                                     */
/* ------------------------------------------------------------------ */

/** While > 0, what changes is Notion's own value coming in: never sent back (no echo). */
let applying = 0;
export function fromNotion<T>(fn: () => T): T {
  applying++;
  try {
    return fn();
  } finally {
    applying--;
  }
}
/** People being sent right now: a change to them meanwhile gets its own item. */
const inFlight = new Set<string>();

function enqueue(os: LifeOSContext, personId: string): OutboxItem | null {
  const p = os.records.get(personId);
  if (!p || p.object !== 'person') return null;
  if (!inFlight.has(personId) && os.outbox.forRecord(personId).some((i) => i.source === SOURCE_ID && i.state === 'waiting')) return null;
  return os.outbox.add({ source: SOURCE_ID, payload: { personId }, label: `${p.title} · to Notion`, recordId: personId });
}

/** A change in LifeOS about this Person: one waiting item (payload: just the id; send reads the record). Not before the first sync, which queues everyone; never an echo. */
export function queuePerson(os: LifeOSContext, personId: string): OutboxItem | null {
  if (applying) return null;
  if (!os.settings.get<string | null>(SETTING_CURSOR, null)) return null;
  return enqueue(os, personId);
}

const isPerson = (os: LifeOSContext, id: string | null | undefined) => !!id && os.records.ref(id)?.object === 'person';

/** crm's bus listeners: person made or edited, a Fact about them, a call / meeting / payment linked, tags changed, a debt with them. */
export function listenForNotion(os: LifeOSContext): () => void {
  const offs = [
    bus.on('entity.created', ({ entity }) => {
      if (entity.object === 'person') queuePerson(os, entity.id);
      else if (entity.object === 'debt') {
        const pid = (entity.data as { personId?: string }).personId;
        if (isPerson(os, pid)) queuePerson(os, pid!);
      }
    }),
    bus.on('entity.updated', ({ entity, changed }) => {
      if (entity.object === 'person' && changed.some((k) => MAPPED_CHANGES.has(k))) queuePerson(os, entity.id);
      else if (entity.object === 'debt') {
        const pid = (entity.data as { personId?: string }).personId;
        if (isPerson(os, pid)) queuePerson(os, pid!);
      }
    }),
    bus.on('relation.added', ({ relation }) => {
      if ((relation.confidence ?? 1) < 0.9) return;
      const a = os.records.ref(relation.fromId);
      const b = os.records.ref(relation.toId);
      if (!a || !b) return;
      const [person, other] = a.object === 'person' ? [a, b] : b.object === 'person' ? [b, a] : [null, null];
      if (person && other && (other.object === 'event' || other.object === 'transaction')) queuePerson(os, person.id);
    }),
    bus.on('tag.applied', ({ entityId }) => {
      if (isPerson(os, entityId)) queuePerson(os, entityId);
    }),
    bus.on('data.changed', ({ table, id }) => {
      if (table === 'record_tags' && isPerson(os, id)) queuePerson(os, id);
      if (table === 'facts') {
        const f = os.facts.get(id);
        // Any Fact on a Person, Notion's too (edited here); the sync's own writes are not queued (fromNotion).
        if (f && f.active && isPerson(os, f.subjectId)) queuePerson(os, f.subjectId!);
      }
    }),
  ];
  return () => offs.forEach((o) => o());
}

/* ------------------------------------------------------------------ */
/* Reconciling one Person with one page                                */
/* ------------------------------------------------------------------ */

interface Ctx {
  os: LifeOSContext;
  client: NotionClient;
  schema: NotionDataSource;
  now: number;
  out: NotionSyncResult;
}

const q = (v: string) => (v ? `‘${v}’` : '');
/** "Notion said ‘Pune’, LifeOS kept ‘Bengaluru’ for Priya’s City". */
export function conflictLabel(name: string, key: Key, kept: string, lost: string, winner: 'notion' | 'lifeos'): string {
  const field = `${name}’s ${KEY_LABEL[key]}`;
  const [loser, keeper] = winner === 'lifeos' ? ['Notion', 'LifeOS'] : ['LifeOS', 'Notion'];
  const said = lost ? `${loser} said ${q(lost)}` : `${loser} cleared it`;
  const keptS = kept ? `${keeper} kept ${q(kept)}` : `${keeper} kept it empty`;
  return `${said}, ${keptS} for ${field}`;
}

function fileConflict(ctx: Ctx, person: ObjectRecord<PersonData>, page: NotionPage, key: Key, kept: string, lost: string, winner: 'notion' | 'lifeos') {
  ctx.os.filings.add({ source: SOURCE_ID, sourceRef: page.id, kind: FILING_CONFLICT, action: 'updated', entityId: person.id, label: conflictLabel(person.title, key, kept, lost, winner), before: { key, kept, lost, winner, pageId: page.id }, flag: 'Changed in Notion and in LifeOS', confidence: 0.9 });
  ctx.out.conflicts++;
}

const factBySourceRef = (os: LifeOSContext, ref: string) => os.db.get<{ id: string }>(`SELECT id FROM facts WHERE source_ref=? AND deleted_at IS NULL LIMIT 1`, [ref])?.id ?? null;

/** A Notion Fact edited in LifeOS, to be written back to its bullet (R7f: Facts are editable anywhere). */
interface BulletEdit {
  k: string;
  block: NotionBlock;
  text: string;
}

/**
 * Text of the bullets of the sections that are Facts (not Likes, not the LifeOS log): each one a Fact, once.
 * A bullet's text as both sides last agreed is kept: changed in Notion, Notion's text wins; changed only in
 * LifeOS, the edit is returned to be written back.
 */
function readFacts(ctx: Ctx, person: ObjectRecord<PersonData>, body: Section[], snap: NotionSnap): BulletEdit[] {
  const edits: BulletEdit[] = [];
  const { os } = ctx;
  const known = (snap.bullets ??= {});
  for (const s of body) {
    const key = sectionKey(s.title);
    if (key === LIKES || key === LOG) continue;
    for (const b of s.blocks) {
      if (!isBullet(b)) continue;
      const t = blockText(b);
      if (!t) continue;
      const k = normId(b.id);
      const seen = known[k];
      if (seen) {
        // One LifeOS wrote stays as written in Notion; Notion's own bullets follow whichever side changed.
        const f = os.facts.get(seen.f);
        if (f && f.active && f.source === 'notion') {
          // Snaps from before R7f have no text: LifeOS could not edit then, so the Fact's text is the agreed one.
          const agreed = seen.t ?? f.text;
          if (t !== agreed) {
            const next = f.text === t ? f : os.facts.supersede(f.id, t, { source: 'notion', sourceRef: `notion:${b.id}`, subjectId: person.id });
            known[k] = { f: next.id, s: s.title, t };
          } else if (f.text !== agreed) edits.push({ k, block: b, text: f.text });
          else seen.t = t;
        }
        continue;
      }
      const same = factBySourceRef(os, `notion:${b.id}`) ?? os.facts.findSame(t, person.id)?.id ?? (key === sectionKey(LIFE_UPDATES) ? os.facts.findSame(stripDay(t), person.id)?.id : null) ?? null;
      if (same) {
        known[k] = { f: same, s: s.title, t };
        continue;
      }
      const at = Date.parse(b.created_time ?? '') || ctx.now;
      const f = os.facts.add({ text: t, subjectId: person.id, source: 'notion', sourceRef: `notion:${b.id}`, statedAt: at });
      known[k] = { f: f.id, s: s.title, t };
      ctx.out.facts++;
    }
  }
  return edits;
}

/** Where a new section goes: before the LifeOS log (it stays last), else at the end. */
function beforeLog(blocks: NotionBlock[], body: Section[]): string | null {
  const log = findSection(body, LOG);
  const live = blocks.filter((b) => !b.in_trash);
  if (!log?.heading) return live[live.length - 1]?.id ?? null;
  const i = live.findIndex((b) => b.id === log.heading!.id);
  return i > 0 ? live[i - 1]!.id : null;
}
const lastOf = (s: Section) => (s.blocks.length ? s.blocks[s.blocks.length - 1]!.id : s.heading!.id);

/**
 * Bring one Person and one page into step. Applies what changed in Notion to
 * the Person (as Notion's: no echo), files conflicts, reads the page's
 * bullets as Facts. With `push`, writes what changed in LifeOS to the page;
 * without, says whether there is anything to write.
 */
async function reconcile(ctx: Ctx, personId: string, page: NotionPage, push: boolean, lifeUpdatedAt?: number): Promise<{ pushNeeded: boolean; changed: boolean }> {
  const { os, client, schema } = ctx;
  let person = os.records.get<PersonData>(personId)!;
  const prev = notionSnap(os, personId);
  const snap: NotionSnap = prev && normId(prev.page) === normId(page.id) ? { ...prev, v: { ...prev.v } } : { page: page.id, v: {} };
  snap.page = page.id;
  const blocks = await client.listChildren(page.id);
  const body = sections(blocks);
  const n = notionValues(page, body);
  const notionNewer = (Date.parse(page.last_edited_time) || 0) >= (lifeUpdatedAt ?? person.updatedAt);
  let changed = false;
  const apply = (fn: () => void) => {
    fromNotion(fn);
    changed = true;
  };

  // Relationship, filled once from Associations where it is plain.
  if (!snap.rel && !person.data.relationship && !n.relationship) {
    const r = relationshipFromAssociations(multiNames(page, PROP.associations));
    if (r) {
      apply(() => os.records.update<PersonData>(personId, { data: { relationship: r } }, 'system'));
      snap.rel = 1;
    }
  }
  person = os.records.get<PersonData>(personId)!;
  const l = lifeValues(os, person);

  const toPush: Partial<Record<Key, string>> = {};
  for (const k of KEYS) {
    const nv = n[k] ?? '';
    const lv = l[k] ?? '';
    const nn = norm(k, nv);
    const nl = norm(k, lv);
    const s = snap.v[k] ?? '';
    if (nn === nl) {
      snap.v[k] = nn;
      continue;
    }
    const nChanged = nn !== s;
    const lChanged = nl !== s;
    if (k !== 'likes' && !schema.properties[propOf(k)!]) {
      // The copy has no such column (yet): nothing to compare with.
      continue;
    }
    if (snap.v[k] === undefined && nn && nl && (k === 'tags' || k === 'likes' || k === 'upi')) {
      // First time these two meet: a list is merged, never one side dropped (a Turf tag never wipes your Associations).
      const union = mergeLists(nv, lv);
      if (norm(k, union) !== nl) apply(() => applyKey(os, personId, k, union));
      snap.v[k] = nn;
      if (norm(k, union) !== nn) toPush[k] = union;
    } else if (nChanged && !lChanged) {
      apply(() => applyKey(os, personId, k, nv));
      snap.v[k] = nn;
    } else if (lChanged && !nChanged) {
      toPush[k] = lv;
    } else if (notionNewer) {
      apply(() => applyKey(os, personId, k, nv));
      fileConflict(ctx, person, page, k, nv, lv, 'notion');
      snap.v[k] = nn;
    } else {
      fileConflict(ctx, person, page, k, lv, nv, 'lifeos');
      // Notion's value has been seen; LifeOS's goes to the page.
      snap.v[k] = nn;
      toPush[k] = lv;
    }
  }

  // Last Contacted ↔ last spoke: the later date wins, both ways.
  const nLast = propText(page, PROP.lastContacted);
  const lLast = (os.records.get<PersonData>(personId)!.data.lastContactAt ?? '').slice(0, 10);
  const later = [nLast, lLast].filter(Boolean).sort().pop() ?? '';
  if (later && later > lLast) {
    const [y, m, d] = later.split('-').map(Number);
    apply(() => touchLastSpoke(os, personId, new Date(y!, m! - 1, d!, 12).getTime(), ctx.now));
  }
  const pushLast = !!later && later !== nLast && !!schema.properties[PROP.lastContacted];

  // Last Update? → a Fact (once per change); the newest Fact said in LifeOS → Last Update? and a Life Updates bullet.
  const nUpdate = propText(page, PROP.lastUpdate);
  const notionUpdateNew = !!nUpdate && nUpdate !== (snap.update ?? '');
  if (notionUpdateNew) {
    if (!os.facts.findSame(nUpdate, personId)) {
      fromNotion(() => os.facts.add({ text: nUpdate, subjectId: personId, source: 'notion', sourceRef: `notion:update:${page.id}`, statedAt: Date.parse(page.last_edited_time) || ctx.now }));
      ctx.out.facts++;
    }
    snap.update = nUpdate;
  } else if (!nUpdate) snap.update = '';
  // The page's bullets as Facts (never twice); a Fact LifeOS already has is matched, not written back.
  const edits = fromNotion(() => readFacts(ctx, os.records.get<PersonData>(personId)!, body, snap));
  const sent = new Set(snap.sent ?? []);
  const onPage = new Set(Object.values(snap.bullets ?? {}).map((b) => b.f));
  const unsent = os.facts
    .list({ subjectId: personId, limit: 500 })
    .filter((f) => f.source !== 'notion' && !sent.has(f.id) && !onPage.has(f.id))
    .sort((a, b) => a.statedAt - b.statedAt);
  const newestUnsent = unsent[unsent.length - 1];
  const editedAt = Date.parse(page.last_edited_time) || 0;
  const pushUpdate = !!newestUnsent && !!schema.properties[PROP.lastUpdate] && !(notionUpdateNew && editedAt > newestUnsent.statedAt) && newestUnsent.text !== nUpdate;

  // LifeOS-only columns.
  const lifeosIdWrong = !!schema.properties[PROP.lifeosId] && propText(page, PROP.lifeosId) !== personId;
  let balance: number | null = null;
  const tool = os.registry.aiTools.get('balances');
  if (tool && schema.properties[PROP.balance]) {
    const r = (await tool.run({ personId }, os).catch(() => null)) as { balances?: Array<{ amount?: number }> } | null;
    const a = r?.balances?.[0]?.amount;
    balance = typeof a === 'number' ? a : 0;
  }
  const balanceWrong = balance != null && propNumber(page, PROP.balance) !== balance;

  const logs = logLines(os, personId, ctx.now);
  const logged = new Set(snap.log ?? []);
  const newLogs = logs.filter((x) => !logged.has(x.key));

  const pushNeeded = Object.keys(toPush).length > 0 || pushLast || pushUpdate || unsent.length > 0 || edits.length > 0 || lifeosIdWrong || balanceWrong || newLogs.length > 0;
  snap.edited = page.last_edited_time;
  if (!push || !pushNeeded) {
    saveSnap(os, personId, snap);
    return { pushNeeded, changed };
  }

  // Properties.
  const props: Record<string, unknown> = {};
  for (const k of Object.keys(toPush) as Key[]) {
    if (k === 'likes') continue;
    const p = keyProperty(schema, k, toPush[k]!, new Date(ctx.now));
    if (p) props[p[0]] = p[1];
  }
  const add = (p: [string, Record<string, unknown>] | null) => p && (props[p[0]] = p[1]);
  if (pushLast) add(namedProperty(schema, PROP.lastContacted, later));
  if (pushUpdate) add(namedProperty(schema, PROP.lastUpdate, newestUnsent!.text));
  if (lifeosIdWrong) add(namedProperty(schema, PROP.lifeosId, personId));
  if (balanceWrong) add(namedProperty(schema, PROP.balance, balance));
  if (Object.keys(props).length) await client.updatePage(page.id, props);
  for (const k of Object.keys(toPush) as Key[]) if (k !== 'likes') snap.v[k] = norm(k, toPush[k]);
  if (pushUpdate) snap.update = newestUnsent!.text;

  // Likes: that section's bullets are rewritten.
  if (toPush.likes !== undefined) {
    const items = (toPush.likes ? toPush.likes.split(',') : []).map((x) => x.trim()).filter(Boolean);
    const sec = findSection(body, LIKES);
    if (sec) {
      for (const b of sec.blocks.filter(isBullet)) await client.deleteBlock(b.id);
      const keep = sec.blocks.filter((b) => !isBullet(b));
      const after = keep.length ? keep[keep.length - 1]!.id : sec.heading!.id;
      if (items.length) await client.appendChildren(page.id, items.map(bullet), after);
    } else {
      await client.appendChildren(page.id, [heading2('Likes'), divider(), ...items.map(bullet)], beforeLog(blocks, body));
    }
    snap.v.likes = norm('likes', toPush.likes);
  }

  // Notion's Facts edited in LifeOS: the bullet takes the new words.
  for (const e of edits) {
    await client.updateBlockText(e.block.id, e.block.type, e.text);
    snap.bullets![e.k]!.t = e.text;
  }

  // Facts said in LifeOS: under Life Updates, dated.
  if (unsent.length) {
    const sec = findSection(body, sectionKey(LIFE_UPDATES));
    const lines = unsent.map((f) => bullet(factBullet(f.text, f.statedAt, ctx.now)));
    const made = sec ? await client.appendChildren(page.id, lines, lastOf(sec)) : (await client.appendChildren(page.id, [heading2('Life Updates'), divider(), ...lines], beforeLog(blocks, body))).slice(2);
    snap.bullets ??= {};
    made.forEach((b, i) => {
      if (unsent[i]) snap.bullets![normId(b.id)] = { f: unsent[i]!.id, s: 'Life Updates' };
    });
    snap.sent = [...sent, ...unsent.map((f) => f.id)];
  }

  // The LifeOS log: newest last, at the end of the page.
  if (newLogs.length) {
    const sec = findSection(body, LOG);
    const lines = newLogs.slice(-100).map((x) => bullet(x.text));
    if (sec) await client.appendChildren(page.id, lines, lastOf(sec));
    else await client.appendChildren(page.id, [heading2('LifeOS log'), divider(), ...lines]);
    snap.log = [...logged, ...newLogs.map((x) => x.key)];
  }

  ctx.out.updated++;
  saveSnap(os, personId, snap);
  return { pushNeeded: false, changed };
}

/* ------------------------------------------------------------------ */
/* Matching a page to a Person                                         */
/* ------------------------------------------------------------------ */

const normName = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

type Match = { personId: string } | { ask: string[] } | { none: true };

function matchPage(os: LifeOSContext, page: NotionPage, people: ObjectRecord<PersonData>[], paired: Set<string>): Match {
  const pid = normId(page.id);
  const byNotion = people.find((p) => normId(p.data.notionId) === pid);
  if (byNotion) return { personId: byNotion.id };
  const free = people.filter((p) => !paired.has(p.id));
  const lifeosId = propText(page, PROP.lifeosId);
  const byId = lifeosId ? free.find((p) => p.id === lifeosId) : undefined;
  if (byId) return { personId: byId.id };
  const phone = phoneKey(propText(page, PROP.phone));
  if (phone.length >= 8) {
    const hits = free.filter((p) => phoneKey(p.data.phone) === phone);
    if (hits.length === 1) return { personId: hits[0]!.id };
  }
  const email = propText(page, PROP.email).toLowerCase();
  if (email) {
    const hits = free.filter((p) => (p.data.email ?? '').toLowerCase() === email);
    if (hits.length === 1) return { personId: hits[0]!.id };
  }
  const name = normName(propText(page, PROP.name));
  if (!name) return { none: true };
  const same = free.filter((p) => normName(p.title) === name);
  if (same.length === 1) return { personId: same[0]!.id };
  if (same.length > 1) return { ask: same.slice(0, 5).map((p) => p.id) };
  const freeIds = new Set(free.map((p) => p.id));
  const fuzzy = resolveCandidates(os, propText(page, PROP.name), ['person']).filter((c) => c.score >= 0.8 && freeIds.has(c.id));
  if (fuzzy.length) return { ask: fuzzy.slice(0, 3).map((c) => c.id) };
  return { none: true };
}

/** An unsure match, asked once in To check: which Person is this page? */
function askMatch(os: LifeOSContext, page: NotionPage, candidates: string[]): void {
  const name = propText(page, PROP.name) || 'Untitled';
  const f = os.filings.add({ source: SOURCE_ID, sourceRef: page.id, kind: FILING_MATCH, action: 'logged', entityId: candidates[0] ?? null, label: `Is Notion’s “${name}” one of your People?`, before: { pageId: page.id, name, candidates }, flag: 'Unsure which Person this page is', confidence: 0.5 });
  const asked = os.settings.get<Record<string, string>>(SETTING_ASKED, {});
  asked[normId(page.id)] = f.id;
  os.settings.set(SETTING_ASKED, asked);
}

/** A Person offered in a notion-match card not answered yet: no page is made for them meanwhile. */
function waitingForAnswer(os: LifeOSContext, personId: string): boolean {
  for (const fid of Object.values(os.settings.get<Record<string, string>>(SETTING_ASKED, {}))) {
    const f = os.filings.get(fid);
    if (f && !f.checked && !f.undone && (matchAskOf(f.before)?.candidates ?? []).includes(personId)) return true;
  }
  return false;
}

/** The answer to a notion-match card: this Person, or someone new. The next send brings the two into step. */
export function answerNotionMatch(os: LifeOSContext, filingId: string, personId: string | 'new'): string | null {
  const f = os.filings.get(filingId);
  const ask = f?.before as { pageId?: string; name?: string } | null;
  if (!f || !ask?.pageId) return null;
  let id: string;
  if (personId === 'new') id = os.records.create<PersonData>({ object: 'person', title: ask.name || 'Untitled', data: { notionId: ask.pageId } }, 'user').id;
  else {
    os.records.update<PersonData>(personId, { data: { notionId: ask.pageId } }, 'user');
    id = personId;
  }
  os.filings.setChecked(filingId);
  // The others offered get their own pages now, like everyone.
  for (const c of matchAskOf(f.before)?.candidates ?? []) {
    const p = os.records.get<PersonData>(c);
    if (c !== id && p && !p.data.notionId && !waitingForAnswer(os, c)) queuePerson(os, c);
  }
  return id;
}

/** The other value of a notion-conflict, after all: written to the Person as your change, so it goes to Notion too. */
export function takeOtherValue(os: LifeOSContext, filingId: string): void {
  const f = os.filings.get(filingId);
  const c = f?.before as { key?: Key; lost?: string } | null;
  if (!f?.entityId || !c?.key) return;
  applyKey(os, f.entityId, c.key, c.lost ?? '', 'user');
  os.filings.setChecked(filingId);
}

export const conflictOf = (before: Record<string, unknown> | null) => (before?.key ? (before as { key: Key; kept: string; lost: string; winner: 'notion' | 'lifeos'; pageId: string }) : null);
export const matchAskOf = (before: Record<string, unknown> | null) => (before?.pageId && Array.isArray(before.candidates) ? (before as { pageId: string; name: string; candidates: string[] }) : null);

/* ------------------------------------------------------------------ */
/* Pull and push                                                       */
/* ------------------------------------------------------------------ */

/** The copy's columns, with the ones LifeOS adds made once. */
async function schemaWithColumns(client: NotionClient, target: string): Promise<NotionDataSource> {
  let schema: NotionDataSource;
  try {
    schema = await client.getDataSource(target);
  } catch (e) {
    if (e instanceof NotionError && (e.status === 404 || e.status === 400)) throw new NotionError(e.status, e.code, 'Notion can’t see the copy — share 📇 Personal CRM (1) with your integration (••• › Connections)');
    throw e;
  }
  if (isOriginal(schema.id) || isOriginal(schema.parent?.database_id)) throw new WriteRefused(ORIGINAL_REFUSAL);
  const missing = Object.fromEntries(Object.entries(NEW_PROPERTIES).filter(([name]) => !schema.properties[name]));
  if (Object.keys(missing).length) {
    const next = await client.updateDataSource(target, missing);
    schema = next?.properties ? next : { ...schema, properties: { ...schema.properties, ...Object.fromEntries(Object.entries(missing).map(([name, def]) => [name, { name, type: Object.keys(def)[0]! }])) } };
  }
  return schema;
}

const emptyResult = (first: boolean): NotionSyncResult => ({ at: Date.now(), pulled: 0, created: 0, matched: 0, updated: 0, facts: 0, conflicts: 0, asked: 0, queued: 0, first });
const live = (p: NotionPage) => !p.in_trash && !p.archived;

/** Pull: the copy's pages edited since the cursor (all of them the first time), into People. */
export async function syncNotion(os: LifeOSContext, client?: NotionClient): Promise<NotionSyncResult> {
  client ??= await notionClient(os);
  const target = notionTarget(os);
  const schema = await schemaWithColumns(client, target);
  const cursor = os.settings.get<string | null>(SETTING_CURSOR, null);
  const first = !cursor;
  const out = emptyResult(first);
  const ctx: Ctx = { os, client, schema, now: Date.now(), out };
  const pages = (await client.queryDataSource(target, cursor ? { since: cursor } : {})).filter(live);
  const asked = os.settings.get<Record<string, string>>(SETTING_ASKED, {});
  const all = snaps(os);
  const byPage = new Map(Object.entries(all).map(([pid, s]) => [normId(s.page), pid]));
  let newest = cursor ?? '';
  for (const page of pages) {
    out.pulled++;
    if (page.last_edited_time > newest) newest = page.last_edited_time;
    const people = os.records.query<PersonData>('person', {}, { limit: 10000 });
    for (const p of people) if (p.data.notionId) byPage.set(normId(p.data.notionId), p.id);
    let personId = byPage.get(normId(page.id)) ?? null;
    let lifeAt: number | undefined;
    if (personId && !os.records.get(personId)) personId = null;
    if (!personId) {
      if (asked[normId(page.id)]) continue; // asked once; the answer brings it in
      const paired = new Set(byPage.values());
      const m = matchPage(os, page, people, paired);
      if ('ask' in m) {
        askMatch(os, page, m.ask);
        out.asked++;
        continue;
      }
      if ('personId' in m) {
        personId = m.personId;
        lifeAt = os.records.get(personId)?.updatedAt;
        fromNotion(() => os.records.update<PersonData>(personId!, { data: { notionId: page.id } }, 'system'));
        out.matched++;
      } else {
        const p = fromNotion(() => os.records.create<PersonData>({ object: 'person', title: propText(page, PROP.name) || 'Untitled', data: { notionId: page.id } }, 'system'));
        os.filings.add({ source: SOURCE_ID, sourceRef: page.id, kind: 'person', entityId: p.id, label: `Person: ${p.title} (from Notion)` });
        personId = p.id;
        out.created++;
      }
      byPage.set(normId(page.id), personId);
    }
    const r = await reconcile(ctx, personId, page, false, lifeAt);
    if (r.changed) out.updated++;
    if (r.pushNeeded && enqueue(os, personId)) out.queued++;
  }
  if (first) {
    // Everyone, both ways: every Person without a page gets one.
    for (const p of os.records.query<PersonData>('person', {}, { limit: 10000 })) {
      if (!p.data.notionId && !all[p.id] && !waitingForAnswer(os, p.id) && enqueue(os, p.id)) out.queued++;
    }
  }
  os.settings.set(SETTING_CURSOR, newest || new Date().toISOString());
  out.at = Date.now();
  os.settings.set(SETTING_LAST, out);
  console.log(`[notion] pulled ${out.pulled}: ${out.created} new, ${out.matched} matched, ${out.facts} facts, ${out.conflicts} conflicts, ${out.asked} asked, ${out.queued} to send`);
  return out;
}

/** A page LifeOS makes for a Person who has none, from the database's template. */
async function createPageFor(ctx: Ctx, person: ObjectRecord<PersonData>): Promise<NotionPage> {
  const { os, client, schema } = ctx;
  const l = lifeValues(os, person);
  const props: Record<string, unknown> = {};
  for (const k of KEYS) {
    if (k === 'likes') continue;
    const p = keyProperty(schema, k, l[k] ?? '', new Date(ctx.now));
    if (p && (l[k] || k === 'name')) props[p[0]] = p[1];
  }
  const lifeosId = namedProperty(schema, PROP.lifeosId, person.id);
  if (lifeosId) props[lifeosId[0]] = lifeosId[1];
  const likes = (l.likes ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const page = await client.createPage(notionTarget(os), props, templateBlocks(likes));
  fromNotion(() => os.records.update<PersonData>(person.id, { data: { notionId: page.id } }, 'system'));
  // Made from LifeOS: its Relationship is LifeOS's, never filled from Associations.
  saveSnap(os, person.id, { page: page.id, v: {}, rel: 1 });
  ctx.out.created++;
  return page;
}

/**
 * Send: each waiting Person to the copy — read its page again, reconcile,
 * write what changed here. sent / refused (Notion's words, or the hard rule)
 * / waiting (offline, Notion down: this one and the rest keep their place).
 */
export async function sendNotion(os: LifeOSContext, items: OutboxItem[], client?: NotionClient): Promise<SendAnswer[]> {
  client ??= await notionClient(os);
  const target = notionTarget(os);
  const schema = await schemaWithColumns(client, target);
  const out = emptyResult(false);
  const ctx: Ctx = { os, client, schema, now: Date.now(), out };
  const answers: SendAnswer[] = [];
  let stop: string | null = null;
  for (const item of items.slice(0, 100)) {
    if (stop) {
      answers.push({ id: item.id, state: 'waiting', error: stop });
      continue;
    }
    const personId = (item.payload as { personId?: string } | null)?.personId ?? item.recordId ?? '';
    const person = os.records.get<PersonData>(personId);
    if (!person || person.object !== 'person') {
      answers.push({ id: item.id, state: 'sent', result: { skipped: 'no such person' } });
      continue;
    }
    inFlight.add(personId);
    try {
      const pageId = notionSnap(os, personId)?.page ?? person.data.notionId ?? null;
      let page: NotionPage | null = null;
      if (pageId) {
        page = await client.getPage(pageId);
        if (!live(page)) throw new WriteRefused(`${person.title}’s Notion page is in the trash — restore it in Notion`);
        // Before anything is read into LifeOS: the page must be in the copy (never the original).
        client.assertWritable(page.id, 'page');
      } else if (waitingForAnswer(os, personId)) {
        // Offered as the match for a page in To check: the answer decides.
        answers.push({ id: item.id, state: 'sent', result: { skipped: 'asked in To check' } });
        continue;
      } else if (item.attempts > 0) {
        // A try before may have made it already: find it by its LifeOS id rather than making a second.
        const [hit] = schema.properties[PROP.lifeosId] ? await client.queryDataSource(target, { filter: { property: PROP.lifeosId, rich_text: { equals: personId } } }) : [];
        if (hit) {
          page = hit;
          fromNotion(() => os.records.update<PersonData>(personId, { data: { notionId: hit.id } }, 'system'));
        }
      }
      page ??= await createPageFor(ctx, person);
      await reconcile(ctx, personId, page, true);
      answers.push({ id: item.id, state: 'sent', result: { page: page.id } });
    } catch (e) {
      if (e instanceof WriteRefused) answers.push({ id: item.id, state: 'refused', error: e.message });
      else if (e instanceof NotionError && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 409) answers.push({ id: item.id, state: 'refused', error: e.message });
      else {
        stop = (e as Error).message ?? 'Notion didn’t answer';
        answers.push({ id: item.id, state: 'waiting', error: stop });
      }
    } finally {
      inFlight.delete(personId);
    }
  }
  const done = new Set(answers.map((a) => a.id));
  for (const item of items) if (!done.has(item.id)) answers.push({ id: item.id, state: 'waiting', error: 'Next sync' });
  return answers;
}
