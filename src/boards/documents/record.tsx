import React, { useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { daysUntil, inDays } from '@core/dashboard/overview';
import type { Field } from '@core/domain/types';
import { DAY } from '@core/cycles/schedule';
import { logDone, undoLoggedDone } from '@core/cycles/upkeep';
import { linkGroups, type LinkItem } from '@core/graph/read';
import { backlinks } from '@core/links';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { EntityPicker, TagChips } from '@ui/components/fields';
import { useLive } from '@ui/hooks';
import { ActionSheet, Icon, IconButton, RowItem, RowList, Text, useToast } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { tintForModule } from '@ui/theme/moduleTint';
import { monoFonts } from '@ui/theme/tokens';
import { documentType, markFiled, type DocumentData } from '@modules/documents';
import { DocumentFile } from './file';
import { kindLabel } from './overview';
import { ActionPill, AddPill, Block, Card, dayWords, Disc, dueTone, fileSize, fileWhere, folderName, isoWords, kindColor, Lined, longDay, PaperHero, StatusTag, Tag, type Doc } from './parts';

/**
 * A Document's page (NR-Documents-Record): the paper, its title and pills, the
 * expiry at a glance, File, Cycle, Details, Validity, Links, Notes and Events.
 * What else hangs on the record (tags, reminders, attachments, facts, mentions)
 * follows only when it exists; the More menu adds it, and deletes.
 */

const LINK_FIELDS = documentType.fields.filter((f) => f.type === 'link');
const linkWord = (f: Field) => (f.linkWord ?? f.key).replace(/^\w/, (c) => c.toUpperCase());
/** "in 12 d", then months, then years: a passport's "in 1200 d" says nothing. */
const farWords = (days: number) => (days > 730 ? `in ${Math.round(days / 365)} y` : days > 90 ? `in ${Math.round(days / 30)} mo` : inDays(days));

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 }}>
      <Text color="secondary" style={{ fontSize: 14, lineHeight: 18, fontWeight: '500', width: 136 }}>{label}</Text>
      <Text selectable={mono} style={[{ flex: 1, fontSize: 15, lineHeight: 20, textAlign: 'right', fontVariant: ['tabular-nums'] }, mono ? { fontFamily: monoFonts[700] } : { fontWeight: '600' }]}>{value}</Text>
    </View>
  );
}

function Stat({ value, label, color, first }: { value: string; label: string; color?: string; first?: boolean }) {
  const t = useTheme();
  return (
    <View style={[{ flex: 1, minWidth: 0, gap: 2 }, first ? null : { paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: t.c.line }]}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} color={color} style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

const useRenew = (id: string) => useLive((o) => o.cycles.forEntity(id).find((x) => x.template === 'document.expiry' && x.nextDueAt != null) ?? null, [id]);

/** Its Renew Cycle: when it is due, how much of the notice has gone, Mark done and Snooze. */
function CycleBlock({ entity, ctx }: { entity: Doc; ctx: LifeOSContext }) {
  const t = useTheme();
  const toast = useToast();
  const now = Date.now();
  const c = useRenew(entity.id);
  if (!c) return null;
  const days = ctx.cycles.status(c, now).daysLeft ?? 0;
  const lead = c.leadDays;
  const inNotice = days <= lead;
  const gone = Math.max(0, Math.min(lead, lead - days));
  const from = c.nextDueAt! - lead * DAY;
  const snoozed = c.snoozedUntil != null && c.snoozedUntil > now;
  const tone = dueTone(days, t);
  const done = () => {
    const d = logDone(ctx, c.id);
    toast.show({ message: `${c.name} done`, icon: 'check', undo: () => undoLoggedDone(ctx, d) });
  };
  const snooze = () => {
    ctx.cycles.snooze(c.id, now + DAY);
    toast.show({ message: 'Snoozed a day', icon: 'clock', undo: () => void ctx.cycles.update(c.id, { snoozedUntil: c.snoozedUntil }) });
  };
  return (
    <Block title="Cycle">
      <Card pad={16} gap={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Disc icon="refresh" color={t.c.accent.gold} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="rowTitle">{c.name}</Text>
            <Text variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>{`due ${dayWords(c.nextDueAt!, now)} · on Upkeep ${inNotice ? 'since' : 'from'} ${dayWords(from, now)}`}</Text>
          </View>
          <Tag label={days > 90 ? format(c.nextDueAt!, 'MMM yyyy') : inDays(days)} bg={tone.bg} fg={tone.fg} />
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {gone ? <View style={{ flexGrow: gone, flexBasis: 0, height: 10, borderRadius: 5, backgroundColor: days < 0 ? t.c.alert.coral : t.c.accent.mustard }} /> : null}
          {gone < lead ? <View style={{ flexGrow: lead - gone, flexBasis: 0, height: 10, borderRadius: 5, backgroundColor: t.c.bg.dim }} /> : null}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{lead} days’ notice</Text>
          {inNotice ? <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{gone} of {lead} gone</Text> : null}
        </View>
        {inNotice ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ActionPill title="Mark done" icon="check" grow onPress={done} />
            <ActionPill title={snoozed ? 'Snoozed' : 'Snooze'} grow disabled={snoozed} onPress={snooze} />
          </View>
        ) : null}
      </Card>
    </Block>
  );
}

/** Links: every linked record, then a dashed pill for each Field not yet set. Hold one to open it in Links or remove it. */
function LinksBlock({ entity, ctx }: { entity: Doc; ctx: LifeOSContext }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [picking, setPicking] = useState<Field | null>(null);
  const [held, setHeld] = useState<LinkItem | null>(null);
  const rows = useLive((o) => linkGroups(o, entity.id).flatMap((g) => g.items), [entity.id]);
  const data = entity.data as unknown as Record<string, unknown>;
  const unset = LINK_FIELDS.filter((f) => !data[f.key]);
  const remove = (i: LinkItem) => {
    const field = LINK_FIELDS.find((f) => data[f.key] === i.id);
    if (field) ctx.records.update<DocumentData>(entity.id, { data: { [field.key]: undefined } });
    else ctx.links.remove(i.linkId);
    toast.show({ message: `Removed the link to ${i.title}`, icon: 'link', undo: () => (field ? void ctx.records.update<DocumentData>(entity.id, { data: { [field.key]: i.id } }) : void ctx.links.link(i.fromId, i.toId, i.kind)) });
  };
  const open = (i: LinkItem) => router.push(`/entity/${i.type}/${i.id}` as never);
  return (
    <Block title="Links">
      <Card>
        <Lined>
          {[
            ...rows.map((i) => {
              const def = ctx.registry.objects.get(i.type);
              const sub = ctx.records.get(i.id)?.subtitle;
              return (
                <Pressable key={i.linkId} accessibilityRole="button" accessibilityHint="Hold for more" onPress={() => open(i)} onLongPress={() => setHeld(i)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, opacity: pressed ? 0.75 : 1 })}>
                  <Disc icon={def?.icon ?? 'link'} color={t.tints[tintForModule(i.module ?? undefined)].ink} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="rowTitle" numberOfLines={1}>{i.title}</Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>{[def?.label.toLowerCase(), sub].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
                </Pressable>
              );
            }),
            ...(unset.length ? [
              <View key="add" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: rows.length ? 4 : 0 }}>
                {unset.map((f) => <AddPill key={f.key} label={linkWord(f)} onPress={() => setPicking(f)} />)}
              </View>,
            ] : []),
          ]}
        </Lined>
      </Card>
      {picking ? (
        <EntityPicker
          visible
          onClose={() => setPicking(null)}
          types={[picking.linkTo as string]}
          title={picking.label}
          exclude={[entity.id]}
          onSelect={(id) => {
            ctx.records.update<DocumentData>(entity.id, { data: { [picking.key]: id } });
            setPicking(null);
          }}
        />
      ) : null}
      <ActionSheet
        visible={!!held}
        onClose={() => setHeld(null)}
        title={held?.title}
        actions={held ? [
          { label: 'Open', icon: 'arrow-right', onPress: () => open(held) },
          { label: 'Show in Links', icon: 'link', onPress: () => router.push(`/links/${held.id}` as never) },
          { label: 'Remove link', icon: 'trash', destructive: true, onPress: () => remove(held) },
        ] : []}
      />
    </Block>
  );
}

/** Events: found, filed, on Upkeep, done; the date on the left, a dot on a rail. Rescans' own bookkeeping stays out. */
function Events({ entity, ctx }: { entity: Doc; ctx: LifeOSContext }) {
  const t = useTheme();
  const events = useLive((o) => o.records.timeline.forEntity(entity.id, 30), [entity.id]);
  const cycle = useRenew(entity.id);
  const now = Date.now();
  const f = entity.data.file;
  const rows = events
    .filter((e) => !(e.kind === 'updated' && e.actor === 'system'))
    .map((e) => {
      const to = (e.meta as { to?: string } | null)?.to;
      if (e.kind === 'created') return f && e.actor === 'system' ? { id: e.id, at: e.occurredAt, title: 'Found in your folders', body: fileWhere(ctx, f) || null, dot: t.tints.documents.ink } : { id: e.id, at: e.occurredAt, title: 'Added by hand', body: null, dot: t.c.fg.tertiary };
      if (e.kind === 'status' && to === 'filed') return { id: e.id, at: e.occurredAt, title: 'Filed', body: null, dot: t.c.fg.tertiary };
      if (e.kind === 'status' && to === 'missing') return { id: e.id, at: e.occurredAt, title: 'File gone', body: 'Moved out of your folders or deleted', dot: t.c.alert.coralText };
      return { id: e.id, at: e.occurredAt, title: e.title, body: e.body ?? null, dot: t.c.fg.tertiary };
    });
  const notice = cycle ? cycle.nextDueAt! - cycle.leadDays * DAY : null;
  if (cycle && notice! <= now) rows.push({ id: 'notice', at: notice!, title: `${cycle.name} is on Upkeep`, body: `${cycle.leadDays} days before it expires`, dot: t.c.accent.mustard });
  rows.sort((a, b) => b.at - a.at);
  if (!rows.length) return null;
  return (
    <Block title="Events">
      <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
        {rows.map((r, i) => (
          <View key={r.id} style={{ flexDirection: 'row', gap: 10 }}>
            <Text numberOfLines={1} color={i ? 'secondary' : 'primary'} style={{ width: 52, fontSize: 13, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{format(r.at, new Date(r.at).getFullYear() === new Date(now).getFullYear() ? 'd MMM' : 'MMM yy')}</Text>
            <View style={{ width: 14, alignItems: 'center' }}>
              <View style={{ height: 20, justifyContent: 'center' }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.dot }} /></View>
              {i < rows.length - 1 ? <View style={{ width: 2, flex: 1, marginTop: 4, borderRadius: 1, backgroundColor: t.c.line }} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2, paddingBottom: i < rows.length - 1 ? 14 : 0 }}>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{r.title}</Text>
              {r.body ? <Text variant="caption" color="secondary">{r.body}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </Block>
  );
}

/** What else hangs on the record. Nothing on the artboard; shown only when it exists, so nothing added through More gets lost. */
function AlsoHere({ entity, ctx }: { entity: Doc; ctx: LifeOSContext }) {
  const router = useRouter();
  const id = entity.id;
  const tags = useLive((o) => o.tags.forEntity(id), [id]);
  const reminders = useLive((o) => o.reminders.forEntity(id), [id]).filter((r) => !r.doneAt);
  const files = useLive((o) => o.attachments.forEntity(id), [id]).filter((a) => a.kind !== 'cover');
  const facts = useLive((o) => o.facts.list({ subjectId: id, limit: 50 }), [id]);
  const dumps = useLive((o) => o.dumps.forEntity(id), [id]);
  const notes = useLive((o) => backlinks(o, id), [id]);
  return (
    <>
      {tags.length ? <Block title="Tags"><TagChips tags={tags.map((x) => x.name)} module="documents" onPress={(name) => router.push(`/tag/${encodeURIComponent(name)}`)} /></Block> : null}
      {reminders.length ? (
        <Block title="Reminders">
          <RowList>
            {reminders.map((r) => {
              const at = r.snoozedUntil ?? r.nextAt ?? r.dueAt;
              return <RowItem key={r.id} icon="bell" tint="documents" title={r.title} subtitle={ctx.format.dateTime(at)} doneLabel={at < Date.now() ? 'Done' : undefined} onDone={() => ctx.reminders.complete(r.id)} onLongPress={() => ctx.reminders.remove(r.id)} />;
            })}
          </RowList>
        </Block>
      ) : null}
      {files.length ? <Block title="Attachments"><RowList>{files.map((a) => <RowItem key={a.id} icon="file" tint="documents" title={a.name} subtitle={a.size ? fileSize(a.size) : a.mime} onPress={() => Linking.openURL(a.uri).catch(() => {})} onLongPress={() => ctx.attachments.remove(a.id)} />)}</RowList></Block> : null}
      {facts.length ? <Block title="Facts"><Card pad={16} gap={12}>{facts.map((x) => <Pressable key={x.id} accessibilityHint="Hold to forget" onLongPress={() => ctx.facts.forget(x.id)}><Text selectable>{x.text.replace(/\[\[|\]\]/g, '')}</Text></Pressable>)}</Card></Block> : null}
      {dumps.length ? <Block title="Dumps"><RowList>{dumps.slice(0, 8).map((d) => <RowItem key={d.id} icon="brain" tint="memory" title={d.body.trim().split('\n')[0]!} subtitle={dayWords(d.createdAt)} chevron onPress={() => router.push(`/dump/${d.id}` as never)} />)}</RowList></Block> : null}
      {notes.length ? <Block title="Mentioned in"><RowList>{notes.map((n) => <RowItem key={n.id} icon="notebook" tint="memory" title={n.title} onPress={() => router.push(`/entity/${n.object}/${n.id}` as never)} />)}</RowList></Block> : null}
    </>
  );
}

export function DocumentPage({ entity, ctx, controls, say }: { entity: Doc; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const custom = useLive((o) => o.customFields.forType('document'), []);
  const now = Date.now();
  const d = entity.data;
  const f = d.file;
  const dot = kindColor(d.kind, t);
  const folder = f ? folderName(ctx, f) : null;
  const preview = f ? `${(f.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? f.mime.split('/').pop() ?? 'file').toUpperCase()} · ${fileSize(f.size)}` : null;
  const days = d.expiresOn ? daysUntil(d.expiresOn, now) : null;
  const linkedId = d.assetId ?? d.personId ?? d.tripId;
  const linked = linkedId ? ctx.records.get(linkedId)?.title : null;
  const customRows = custom.map((c) => ({ label: c.label, value: (d as unknown as Record<string, unknown>)[`custom_${c.key}`] })).filter((c) => c.value != null && c.value !== '');
  return (
    <View style={{ paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingHorizontal: t.layout.gutter }}>
        <IconButton icon="chevron-left" filled accessibilityLabel="Back to Documents" onPress={controls?.back} />
        <Text color="secondary" style={{ flex: 1, textAlign: 'center', fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Document</Text>
        <IconButton icon="more" filled accessibilityLabel="More" onPress={controls?.more} />
        <Pressable accessibilityRole="button" accessibilityLabel="Edit" onPress={controls?.edit} hitSlop={2} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.fg.primary, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
          <Text color={t.c.bg.ground} style={{ fontSize: 13, lineHeight: 17, fontWeight: '700' }}>Edit</Text>
        </Pressable>
      </View>

      <View style={{ gap: 22, paddingTop: 18, paddingHorizontal: t.layout.gutter }}>
        <PaperHero dot={dot} label={preview} />

        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={{ fontSize: 34, lineHeight: 38, fontWeight: '600', letterSpacing: -1 }}>{entity.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Tag label={kindLabel(d.kind)} dot={dot} />
            {/* Made before the form filed them by hand: no file card to say Filed on, so the pill does. */}
            {entity.status === 'new' && !f ? <Pressable accessibilityRole="button" accessibilityLabel="New. Mark as filed" onPress={() => markFiled(ctx, entity.id)} hitSlop={8}><StatusTag status="new" /></Pressable> : <StatusTag status={entity.status} />}
            {folder ? <Tag label={folder} dot={t.tints.documents.ink} fg={t.c.fg.secondary} /> : null}
          </View>
        </View>

        {d.expiresOn || linked ? (
          <View style={{ flexDirection: 'row', gap: 14 }}>
            {d.expiresOn ? <Stat first value={isoWords(d.expiresOn, now)} label={days! < 0 ? 'expired' : 'expires'} /> : null}
            {days != null ? <Stat value={farWords(days)} label={days < 0 ? 'overdue' : 'to renew'} color={days < 0 ? t.c.alert.coralText : days <= 30 ? t.c.accent.gold : undefined} /> : null}
            {linked ? <Stat first={!d.expiresOn} value={linked} label={d.kind === 'insurance' ? 'covers' : 'for'} /> : null}
          </View>
        ) : null}

        {f ? <Block title="File"><DocumentFile entity={entity} ctx={ctx} /></Block> : null}
        <CycleBlock entity={entity} ctx={ctx} />

        <Block title="Details">
          <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
            <Lined>
              {[
                <Row key="kind" label="Type" value={kindLabel(d.kind)} />,
                ...(d.number ? [<Row key="number" label="Reference number" value={d.number} mono />] : []),
                ...(d.issuer ? [<Row key="issuer" label="Issuer" value={d.issuer} />] : []),
                ...customRows.map((c) => <Row key={c.label} label={c.label} value={String(c.value)} />),
              ]}
            </Lined>
          </Card>
        </Block>

        {d.issuedOn || d.expiresOn ? (
          <Block title="Validity">
            <Card pad={0} gap={0} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
              <Lined>
                {[
                  ...(d.issuedOn ? [<Row key="issued" label="Issued" value={longDay(d.issuedOn)} />] : []),
                  ...(d.expiresOn ? [<Row key="expires" label="Expires" value={longDay(d.expiresOn)} />] : []),
                ]}
              </Lined>
            </Card>
          </Block>
        ) : null}

        <LinksBlock entity={entity} ctx={ctx} />

        {d.notes ? (
          <Block title="Notes">
            <View style={{ paddingVertical: 16, paddingHorizontal: 18, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
              <Text selectable style={{ fontSize: 15, lineHeight: 22, fontWeight: '500' }}>{d.notes}</Text>
            </View>
          </Block>
        ) : null}

        <Events entity={entity} ctx={ctx} />
        {say}
        <AlsoHere entity={entity} ctx={ctx} />
      </View>
    </View>
  );
}
