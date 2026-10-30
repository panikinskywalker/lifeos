import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { Icon, Text, useToast } from '@ui/kit';
import { blocks } from '@ui/theme/tokens';
import { GROUP_KINDS, type GroupData, type PersonData } from '@modules/crm';
import { balances, settleUp, undoSettle, type DebtData, type SplitRecord } from '@modules/finance/split';
import { Face, FaceStack } from './parts';
import { Chip, ChoicePill, DotChip, GROUND, Hairline, INK, INK2, LIME, NoirPage, PageHero, RAISED, Row, Rows, SectionHead, SHEET_SOLID, Stats, Timeline, type TimelineItem } from './profile';

/**
 * Group (NR-People-Group): the hero with the name, members · balance ·
 * shared, everyone's face with their share, kind · place · default split,
 * Balances with Settle, Shared expenses, Members & shares (Equally / By
 * shares), the Timeline and Other groups. "You" are not a Person: you are
 * the first face, with one share.
 */

const firstOf = (title: string) => title.trim().split(/\s+/)[0] ?? title;
const kindLabel = (k: string | undefined) => GROUP_KINDS.find((x) => x.value === k)?.label ?? null;
const METHOD: Record<string, string> = { equal: 'equally', shares: 'by shares', percent: 'by percent', exact: 'exact amounts' };

interface Tx {
  amount: number;
  date: string;
  merchant?: string;
  split?: SplitRecord;
}

/** "You" as a face: the lime disc with Y. */
function YouFace({ size }: { size: 40 | 56 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size === 56 ? 20 : 14, lineHeight: size === 56 ? 26 : 18, fontWeight: '700', color: GROUND }}>Y</Text>
    </View>
  );
}

function Stepper({ value, onMinus, onPlus }: { value: string; onMinus?: () => void; onPlus?: () => void }) {
  const btn = (icon: string, label: string, onPress?: () => void) => (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: pressed ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', opacity: onPress ? 1 : 0.4 })}>
      <Icon name={icon} size={16} color={INK} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, borderRadius: 999, backgroundColor: RAISED }}>
      {btn('minus', 'Fewer shares', onMinus)}
      <Text style={{ minWidth: 44, textAlign: 'center', fontSize: 18, lineHeight: 24, fontWeight: '700', color: INK }}>{value}</Text>
      {btn('plus', 'More shares', onPlus)}
    </View>
  );
}

export function GroupPage({ entity, ctx, controls, say }: { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [allTx, setAllTx] = useState(false);
  const g = entity as ObjectRecord<GroupData>;
  const id = entity.id;
  const byShares = g.data.defaultSplit === 'shares';
  const fmt = (n: number) => ctx.format.currency(n);

  const view = useLive(
    (os) => {
      let members = os.groups.members(id);
      if (!members.length) members = (g.data.memberIds ?? []).map((m) => ({ memberId: m, defaultShare: 1 }));
      const people = members
        .map((m) => ({ ...m, rec: os.records.get<PersonData>(m.memberId) }))
        .filter((m): m is { memberId: string; defaultShare: number; rec: ObjectRecord<PersonData> } => !!m.rec);
      const hasDebts = os.registry.objects.has('debt');
      const bals = hasDebts ? balances(os, id) : [];
      const open = hasDebts ? os.records.query<DebtData>('debt', { filter: { and: [{ field: 'status', op: 'neq', value: 'settled' }, { field: 'data.groupId', op: 'eq', value: id }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 500 }) : [];
      const reason = new Map<string, string>();
      for (const d of open) if (!reason.has(d.data.personId) && d.data.reason) reason.set(d.data.personId, `${d.data.direction === 'they_owe' ? 'owes for' : 'paid'} ${d.data.reason}`);
      const payments = hasDebts ? os.records.query<DebtData>('debt', { filter: { and: [{ field: 'data.groupId', op: 'eq', value: id }, { field: 'data.kind', op: 'eq', value: 'payment' }] } }, { limit: 200 }) : [];
      const txMap = new Map<string, ObjectRecord<Tx>>();
      if (os.registry.objects.has('transaction')) {
        for (const t of os.records.query<Tx>('transaction', { filter: { and: [{ field: 'data.split.groupId', op: 'eq', value: id }] } }, { limit: 500 })) txMap.set(t.id, t);
        for (const l of os.links.forEntity(id)) {
          if (l.other.object !== 'transaction' || txMap.has(l.other.id)) continue;
          const t = os.records.get<Tx>(l.other.id);
          if (t) txMap.set(t.id, t);
        }
      }
      const txs = [...txMap.values()].sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0));
      const name = (pid: string) => (pid === 'me' ? 'You' : firstOf(os.records.get(pid)?.title ?? 'Someone'));
      const memberSet = new Set(people.map((m) => m.memberId));
      const others = os.records
        .query<GroupData>('group', {}, { limit: 500 })
        .filter((o) => o.id !== id)
        .map((o) => {
          const ms = os.groups.members(o.id).map((m) => m.memberId);
          const ids = ms.length ? ms : o.data.memberIds ?? [];
          return { o, ids };
        })
        .filter(({ ids }) => ids.some((m) => memberSet.has(m)))
        .map(({ o, ids }) => ({
          id: o.id,
          title: o.title,
          sub: [kindLabel(o.data.kind), `${ids.length + 1} people`, o.data.defaultSplit === 'shares' ? 'by shares' : 'equally'].filter(Boolean).join(' · '),
          people: ids.map((m) => os.records.get<PersonData>(m)).filter((x): x is ObjectRecord<PersonData> => !!x).map((x) => ({ id: x.id, name: x.title, photo: x.data.photo?.uri ?? null })),
          net: hasDebts ? balances(os, o.id).reduce((a, b) => a + b.amount, 0) : 0,
        }));
      const events = os.records.timeline.forEntity(id, 100).filter((e) => e.kind !== 'relation');
      const place = g.data.placeId ? os.records.get(g.data.placeId)?.title ?? null : null;
      const photo = g.data.photo?.uri ?? os.attachments.cover(id)?.uri ?? null;
      return { people, bals, reason, payments, txs, name, others, events, place, photo };
    },
    [id, entity.version],
  );

  const weight = (share: number) => (byShares ? Math.max(0, share) : 1);
  const total = 1 + view.people.reduce((a, m) => a + weight(m.defaultShare), 0);
  const pct = (w: number) => `${Math.round((w / total) * 100)}%`;
  const net = view.bals.reduce((a, b) => a + b.amount, 0);
  const memberIds = view.people.map((m) => m.memberId);

  const settle = (personId: string, amount: number) => {
    const s = settleUp(ctx, personId, { groupId: id });
    const who = firstOf(ctx.records.get(personId)?.title ?? 'them');
    toast.show({ message: `Settled ${fmt(Math.abs(amount))} with ${who}`, icon: 'check', undo: () => undoSettle(ctx, s) });
  };
  const setShare = (memberId: string, share: number) => ctx.groups.setMembers(id, memberIds, { [memberId]: Math.max(1, share) });
  const setSplit = (v: 'equal' | 'shares') => {
    if (g.data.defaultSplit === v) return;
    ctx.records.update<GroupData>(id, { data: { defaultSplit: v } });
  };

  const tl: TimelineItem[] = [
    ...view.txs.map((t) => ({ id: t.id, at: t.occurredAt ?? t.createdAt, title: `${t.title} · ${fmt(t.data.amount)}`, icon: 'receipt', dot: blocks.lilac, onPress: () => router.push(`/entity/transaction/${t.id}`) })),
    ...view.payments.map((d) => ({ id: d.id, at: d.occurredAt ?? d.createdAt, title: d.data.direction === 'i_owe' ? `${view.name(d.data.personId)} settled ${fmt(d.data.amount)}` : `You settled ${fmt(d.data.amount)} with ${view.name(d.data.personId)}`, icon: 'check', dot: LIME })),
    ...view.events.map((e) => ({ id: e.id, at: e.occurredAt, title: e.kind === 'created' ? `${entity.title} made` : e.title, icon: 'edit', dot: blocks.yellow })),
  ];
  const txShown = allTx ? view.txs : view.txs.slice(0, 3);

  return (
    <NoirPage>
      <PageHero photo={view.photo} gradient={['#3A2E46', '#1C1626']} handle="Group" controls={controls} sheetTop={170} name={entity.title}>
        <Stats
          items={[
            { value: String(view.people.length + 1), label: 'members' },
            net > 0 ? { value: fmt(net), label: 'owed to you' } : net < 0 ? { value: fmt(-net), label: 'you owe' } : { value: 'settled', label: 'money' },
            { value: String(view.txs.length), label: 'shared' },
          ]}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 14, paddingHorizontal: 20 }}>
          <View style={{ width: 64, alignItems: 'center', gap: 6 }}>
            <YouFace size={56} />
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: INK }}>You</Text>
            <Chip label={pct(1)} />
          </View>
          {view.people.map((m) => (
            <Pressable key={m.memberId} onPress={() => router.push(`/entity/person/${m.memberId}`)} style={{ width: 64, alignItems: 'center', gap: 6 }}>
              <Face id={m.memberId} name={m.rec.title} photo={m.rec.data.photo?.uri} size={56} />
              <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: INK }}>{firstOf(m.rec.title)}</Text>
              <Chip label={pct(weight(m.defaultShare))} />
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {kindLabel(g.data.kind) ? <DotChip label={kindLabel(g.data.kind)!} dot={blocks.lilac} /> : null}
          {view.place ? <DotChip label={view.place} dot="#FF8A6A" onPress={() => router.push(`/entity/place/${g.data.placeId}`)} /> : null}
          <DotChip label={byShares ? 'Split by shares' : 'Split equally'} dot={LIME} />
        </View>
        {say}

        <Hairline />
        <SectionHead title="Balances" />
        {view.bals.length ? (
          <Rows>
            {view.bals.map((b) => {
              const rec = ctx.records.get<PersonData>(b.personId);
              return (
                <Row
                  key={b.personId}
                  minHeight={48}
                  lead={<Face id={b.personId} name={rec?.title ?? '?'} photo={rec?.data.photo?.uri} size={40} />}
                  title={rec?.title ?? 'Someone'}
                  sub={view.reason.get(b.personId) ?? null}
                  onPress={() => router.push(`/entity/person/${b.personId}`)}
                  trailing={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Chip label={b.amount > 0 ? `owes you ${fmt(b.amount)}` : `you owe ${fmt(-b.amount)}`} tone={b.amount > 0 ? 'lime' : 'white'} />
                      <Pressable onPress={() => settle(b.personId, b.amount)} accessibilityRole="button" accessibilityLabel={`Settle with ${firstOf(rec?.title ?? '')}`} style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: LIME, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                        <Text style={{ fontSize: 13, lineHeight: 20, fontWeight: '700', color: GROUND }}>Settle</Text>
                      </Pressable>
                    </View>
                  }
                />
              );
            })}
          </Rows>
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 17, color: INK2 }}>{`All square in ${entity.title}. Split an expense and pick this group.`}</Text>
        )}

        <Hairline />
        <SectionHead title="Shared expenses" meta={view.txs.length > 3 ? (allTx ? 'Less' : `All ${view.txs.length}`) : undefined} onPress={() => setAllTx((v) => !v)} />
        {view.txs.length ? (
          <Rows>
            {txShown.map((t) => (
              <Row
                key={t.id}
                icon="receipt"
                title={t.title}
                sub={t.data.split ? `${view.name(t.data.split.payer)} paid · ${METHOD[t.data.split.method] ?? t.data.split.method}` : ctx.format.date(t.occurredAt ?? t.createdAt, 'medium')}
                trailing={<Text style={{ fontSize: 16, fontWeight: '700', color: INK }}>{fmt(t.data.amount)}</Text>}
                onPress={() => router.push(`/entity/transaction/${t.id}`)}
              />
            ))}
          </Rows>
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 17, color: INK2 }}>Nothing shared yet. Split a transaction with this group and it shows here.</Text>
        )}

        <Hairline />
        <SectionHead title="Members & shares" meta="Edit" onPress={() => controls?.edit()} />
        <Rows>
          {[
            <View key="me" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <YouFace size={40} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '600', color: INK }}>You</Text>
              <Stepper value={pct(1)} />
            </View>,
            ...view.people.map((m) => (
              <View key={m.memberId} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Face id={m.memberId} name={m.rec.title} photo={m.rec.data.photo?.uri} size={40} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '600', color: INK }}>{firstOf(m.rec.title)}</Text>
                <Stepper value={pct(weight(m.defaultShare))} onMinus={byShares && m.defaultShare > 1 ? () => setShare(m.memberId, m.defaultShare - 1) : undefined} onPlus={byShares ? () => setShare(m.memberId, m.defaultShare + 1) : undefined} />
              </View>
            )),
          ]}
        </Rows>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <ChoicePill label="Equally" selected={!byShares} onPress={() => setSplit('equal')} />
          <ChoicePill label="By shares" selected={byShares} onPress={() => setSplit('shares')} />
          <ChoicePill label="Add member" icon="plus" onPress={() => controls?.edit()} />
        </View>

        {tl.length ? (
          <>
            <Hairline />
            <SectionHead title="Timeline" />
            <Timeline items={tl.slice().sort((a, b) => b.at - a.at).slice(0, 12)} dense ring={SHEET_SOLID} />
          </>
        ) : null}

        {view.others.length ? (
          <>
            <Hairline />
            <SectionHead title="Other groups" />
            <Rows>
              {view.others.map((o) => (
                <Row
                  key={o.id}
                  lead={<FaceStack people={o.people} size={24} ground={SHEET_SOLID} max={3} />}
                  title={o.title}
                  sub={o.sub}
                  onPress={() => router.push(`/entity/group/${o.id}`)}
                  trailing={o.net > 0 ? <Chip label={`owes you ${fmt(o.net)}`} tone="lime" /> : o.net < 0 ? <Chip label={`you owe ${fmt(-o.net)}`} tone="white" /> : undefined}
                />
              ))}
            </Rows>
          </>
        ) : null}
      </PageHero>
    </NoirPage>
  );
}
