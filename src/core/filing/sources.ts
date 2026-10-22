import type { LifeOSContext } from '../registry/context';
import type { SourceDef } from '../registry/types';
import { setSourceState, sourceState } from '../sources/deviceData';
import { fileMessage } from './messages';
import type { RawMessage } from './contract';

/**
 * Running a Source (docs/MODEL.md §4): ask the module's SourceDef for what is
 * new, file messages through the parsers in batches (the UI stays responsive),
 * keep the source's state (last sync, count, cursor, error). Platform decides
 * when to run and with what time limit; this is the one place a source's
 * output turns into records.
 */

const DAY = 86_400_000;

async function fileMany(os: LifeOSContext, msgs: RawMessage[], mode: 'live' | 'import'): Promise<{ confirmed: number; proposed: number }> {
  const out = { confirmed: 0, proposed: 0 };
  for (let i = 0; i < msgs.length; i += 200) {
    os.db.transaction(() => {
      for (const m of msgs.slice(i, i + 200)) {
        const r = fileMessage(os, m, { mode });
        if (r.status === 'confirmed') out.confirmed++;
        if (r.status === 'proposed') out.proposed++;
      }
    });
    if (i + 200 < msgs.length) await new Promise((r) => setTimeout(r, 16));
  }
  return out;
}

/**
 * Send what waits for a source that also writes, in order (docs/MODEL.md
 * layer 4). Unanswered changes keep waiting in their place; a throw (offline)
 * leaves every one waiting with the reason. Returns how many were taken.
 */
export async function sendWaiting(os: LifeOSContext, src: SourceDef): Promise<number> {
  if (!src.send) return 0;
  const items = os.outbox.waiting(src.id);
  if (!items.length) return 0;
  let answers: Awaited<ReturnType<NonNullable<SourceDef['send']>>>;
  try {
    answers = await src.send(os, items);
  } catch (e) {
    const why = (e as Error).message ?? String(e);
    for (const it of items) os.outbox.retry(it.id, why);
    throw e;
  }
  let sent = 0;
  const byId = new Map(answers.map((a) => [a.id, a]));
  for (const it of items) {
    const a = byId.get(it.id);
    if (a?.state === 'sent') {
      os.outbox.sent(it.id, a.result);
      sent++;
    } else if (a?.state === 'refused') os.outbox.refuse(it.id, a.error ?? 'Refused', a.result);
    else os.outbox.retry(it.id, a?.error ?? 'Not sent yet');
  }
  return sent;
}

/** Sync one source now: first send what waits for it, then read. Returns how many records it filed (or proposed, on import). */
export async function runSource(os: LifeOSContext, src: SourceDef, opts: { mode?: 'live' | 'import'; since?: number } = {}): Promise<number> {
  const mode = opts.mode ?? 'live';
  const st = sourceState(os, src.id);
  if (src.available && !(await src.available(os))) return 0;
  const since = opts.since ?? (st.cursor ? Number(st.cursor) : Date.now() - DAY);
  try {
    await sendWaiting(os, src);
    // A change still waiting is shown here already; reading now would put back the source's older copy.
    const left = src.send ? os.outbox.waiting(src.id).length : 0;
    if (left) throw new Error(`${left} change${left === 1 ? '' : 's'} still waiting to send; syncing once ${left === 1 ? 'it goes' : 'they go'}`);
    const r = await src.sync(os, since, { mode });
    let n = r.filed ?? 0;
    if (r.messages?.length && src.kind === 'messages') {
      const source = src.messageSource ?? 'sms';
      const msgs: RawMessage[] = [...r.messages].sort((a, b) => a.at - b.at).map((m) => ({ source, from: m.from, title: m.title ?? null, body: m.text, receivedAt: m.at, meta: m.meta, account: (m.meta?.account as string | undefined) ?? null }));
      const { confirmed, proposed } = await fileMany(os, msgs, mode);
      n += mode === 'import' ? proposed : confirmed;
    }
    // Readings: the Object must carry a `sourceKey` field (its schema keeps it), or every sync would duplicate.
    if (r.readings?.length) {
      for (const rd of r.readings) {
        if (!os.registry.objects.has(rd.object)) continue;
        const [hit] = os.records.query<Record<string, unknown>>(rd.object, { filter: { and: [{ field: 'data.sourceKey', op: 'eq', value: rd.sourceKey }] } }, { limit: 1 });
        if (hit) os.records.update(hit.id, { data: rd.data }, 'system');
        else {
          os.records.create({ object: rd.object, title: rd.title, data: { ...rd.data, sourceKey: rd.sourceKey }, occurredAt: rd.occurredAt }, 'system');
          n++;
        }
      }
    }
    setSourceState(os, src.id, { enabled: true, lastSync: Date.now(), cursor: r.cursor ?? String(Date.now()), addTotal: n, error: null });
    return n;
  } catch (e) {
    setSourceState(os, src.id, { error: ((e as Error).message ?? String(e)).slice(0, 200) });
    throw e;
  }
}

/** First run of a message source: the last `days` as proposals for the review screen. */
export function importSource(os: LifeOSContext, src: SourceDef, days: number): Promise<number> {
  return runSource(os, src, { mode: 'import', since: Date.now() - days * DAY });
}
