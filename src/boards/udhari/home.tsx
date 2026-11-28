import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, isThisYear, isToday, isYesterday } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Button, Disc, EmptyState, FilterChip, Icon, IconButton, PickerSheet, ScreenHeader, SectionHead, Sheet, StackedBar, Text, Toggle, useBottomBarInset, useToast } from '@ui/kit';
import { linkPerson, setSwConfig, SplitwiseClient, suggestPerson, swConfig, unlinkPerson, type SwExpense } from '@modules/finance/splitwise';
import { AddSheet } from '../../screens/AddSheet';
import { PayOrRemind } from '../../screens/PayOrRemind';
import { personRecords, swTotals, udhariActivity, udhariGroups, udhariPeople, type ActivityRow, type GroupRow, type PersonRow } from './data';
import { runSplitwiseSync, signOutSplitwise } from './splitwise';

const INK = '#0B0B0D';
const GROUP_FILLS = [blocks.sky, blocks.lilac, blocks.pink, blocks.yellow];
type Filter = 'all' | 'owe' | 'owed' | 'groups' | 'settled';

function useScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useBottomBarInset();
  return { t, style: { paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: bottom, gap: 22 } };
}
const back = (router: ReturnType<typeof useRouter>) => () => (router.canGoBack() ? router.back() : router.replace('/browse' as never));

/**
 * Udhari home (NR-Udhari-Home): who owes whom first, from LifeOS's own shares
 * and Bills (it works signed out too), then each group's net, what moved
 * lately, and Splitwise kept in step underneath.
 */
export function UdhariHome(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const { t, style } = useScreen();
  const c = useLive((o) => swConfig(o), []);
  const people = useLive((o) => udhariPeople(o), []);
  const groups = useLive((o) => udhariGroups(o), []);
  const activity = useLive((o) => udhariActivity(o, 4), []);
  // A trip's people Splitwise could not take yet (not a friend there, no email).
  const waitingCount = useLive((o) => { const c2 = swConfig(o); return new Set(Object.values(c2.waiting ?? {}).flat().filter((id) => !c2.people[id])).size; }, []);
  const toCheck = useLive((o) => {
    const k = swConfig(o);
    const linked = new Set(Object.keys(k.people));
    const free = o.records.query('person', {}, { limit: 3000 }).filter((p) => !linked.has(p.id)).map((p) => ({ id: p.id, title: p.title }));
    return k.friends.filter((f) => !Object.values(k.people).some((v) => v.sw === f.id) && suggestPerson(free, f.name)).length;
  }, []);
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const connected = !!c.me && !c.signedOut;
  const money = (n: number) => os.format.currency(Math.round(Math.abs(n)));
  // Everyone you know of: LifeOS's own figure, and Splitwise's for friends no one is linked to yet.
  const owedToYou = people.owe.reduce((n, r) => n + valueOf(r), 0);
  const youOwe = -people.owed.reduce((n, r) => n + valueOf(r), 0);
  const sw = useLive((o) => swTotals(o), []);
  const { to: swTo, owe: swOwe } = sw;
  const net = owedToYou - youOwe;
  const synced = c.lastSync ? new Date(c.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;

  const sync = async (quiet = false) => {
    setBusy(true);
    const msg = await runSplitwiseSync(os);
    setBusy(false);
    if (!quiet || msg.includes('signed you out')) toast.show({ message: msg, icon: msg.includes('signed') ? 'alert' : 'check' });
  };
  // Opening Udhari brings Splitwise up to date.
  useEffect(() => {
    if (connected) void sync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = (f: Filter) => filter === 'all' || filter === f;
  const mapped = Object.entries(c.groups).map(([g, sw]) => `${os.records.get(g)?.title ?? 'A group'} to ${c.swGroups.find((x) => x.id === sw)?.name ?? 'a group'}`);
  const nothing = !people.owe.length && !people.owed.length;

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView contentContainerStyle={style}>
        <ScreenHeader title="Udhari" subtitle={connected ? `In step with Splitwise${synced ? ` · ${synced}` : ''}` : 'From your shares in LifeOS'} onBack={back(router)} right={connected ? <IconButton icon="repeat" filled accessibilityLabel="Sync with Splitwise now" onPress={() => void sync()} /> : undefined} />

        {/* Overall */}
        <View style={{ padding: 20, borderRadius: 32, backgroundColor: t.c.bg.tile, gap: 16 }}>
          <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2 }} color="secondary">OVERALL</Text>
          <View style={{ gap: 2 }}>
            <Text color="secondary" style={{ fontSize: 15, lineHeight: 20 }}>{net > 0 ? 'You’re owed' : net < 0 ? 'You owe' : 'All square'}</Text>
            <Text style={{ fontSize: 44, lineHeight: 50, fontWeight: '700', letterSpacing: -1.5, color: net > 0 ? blocks.lime : net < 0 ? t.c.alert.coralText : t.c.fg.primary }}>{money(net)}</Text>
          </View>
          {owedToYou + youOwe > 0 ? <StackedBar parts={[{ value: owedToYou, color: blocks.lime, label: 'owed to you' }, { value: youOwe, color: t.c.alert.coralText, label: 'you owe' }]} legend={false} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label={`${people.owe.length} ${people.owe.length === 1 ? 'person owes' : 'people owe'} you`} value={money(owedToYou)} color={blocks.lime} onPress={() => setFilter('owe')} />
            <Stat label={`You owe ${people.owed.length}`} value={money(youOwe)} color={t.c.alert.coralText} onPress={() => setFilter('owed')} />
          </View>
          {connected && swTo + swOwe > 0 ? (
            <View style={{ gap: 6 }}>
              <Text color="secondary" style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2 }}>SPLITWISE SAYS</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Stat label="To you" value={money(swTo)} color={blocks.lime} onPress={() => setFilter('owe')} />
                <Stat label="You owe" value={money(swOwe)} color={t.c.alert.coralText} onPress={() => setFilter('owed')} />
              </View>
              {Object.keys(sw.unrated).length ? <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{`and ${Object.entries(sw.unrated).map(([cur, v]) => `${cur} ${Math.round(Math.abs(v)).toLocaleString()} ${v > 0 ? 'to you' : 'you owe'}`).join(' · ')} (no trip rate to count it in rupees)`}</Text> : null}
              {Math.abs(swTo - owedToYou) >= 1 || Math.abs(swOwe - youOwe) >= 1 ? <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>Apart from LifeOS: tap someone to see both sides, link people and groups to bring them in step.</Text> : null}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pill label="Add an expense" icon="plus" lime onPress={() => setAdding(true)} />
            <Pill label="Settle up" icon="check" onPress={() => router.push('/module/finance/debts' as never)} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <FilterChip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterChip label={`Owe you · ${people.owe.length}`} selected={filter === 'owe'} onPress={() => setFilter('owe')} />
          <FilterChip label={`You owe · ${people.owed.length}`} selected={filter === 'owed'} onPress={() => setFilter('owed')} />
          <FilterChip label="Groups" selected={filter === 'groups'} onPress={() => setFilter('groups')} />
          <FilterChip label="Settled" selected={filter === 'settled'} onPress={() => setFilter('settled')} />
        </ScrollView>

        {nothing && (filter === 'all' || filter === 'owe' || filter === 'owed') ? <EmptyState icon="check" line="All square with everyone. Split a payment, a game or a trip and it shows here." bare /> : null}

        {show('owe') && people.owe.length ? (
          <View style={{ gap: 10 }}>
            <SectionHead title="Owe you" sub="biggest first; the oldest share shows how long" />
            <People rows={people.owe} />
          </View>
        ) : null}
        {show('owed') && people.owed.length ? (
          <View style={{ gap: 10 }}>
            <SectionHead title="You owe" />
            <People rows={people.owed} />
          </View>
        ) : null}
        {filter === 'settled' ? (
          <View style={{ gap: 10 }}>
            <SectionHead title="Settled" sub="square now, settled in the last 60 days" />
            {people.settled.length ? <People rows={people.settled} /> : <Text color="secondary" style={{ fontSize: 14, paddingHorizontal: 4 }}>Nothing settled lately.</Text>}
          </View>
        ) : null}

        {show('groups') && groups.length ? (
          <View style={{ gap: 10 }}>
            <SectionHead title="Groups" sub="each one’s net for you" action={groups.length > 2 && filter === 'all' ? `All ${groups.length}` : undefined} onAction={() => router.push('/board/udhari/groups' as never)} />
            <Groups rows={filter === 'all' ? groups.slice(0, 2) : groups} />
          </View>
        ) : null}

        {filter === 'all' && activity.length ? (
          <View style={{ gap: 10 }}>
            <SectionHead title="Activity" action="All" onAction={() => router.push('/board/udhari/activity' as never)} />
            <Activity rows={activity} />
          </View>
        ) : null}

        {filter === 'all' ? (
          <View style={{ gap: 10 }}>
            <SectionHead title="Splitwise" sub="kept in step, underneath" />
            {connected ? (
              <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
                <Line first title="People linked" sub={`${Object.keys(c.people).length} of ${c.friends.length} Splitwise friends${toCheck ? ` · ${toCheck} to check` : ''}`} badge={toCheck ? `${toCheck} new` : undefined} onPress={() => router.push('/board/udhari/splitwise' as never)} />
                <Line title="Groups" sub={mapped.length ? mapped.join(' · ') : 'none mapped; shares go between you'} onPress={() => router.push('/board/udhari/splitwise' as never)} />
                {waitingCount ? <Line title="Not on Splitwise yet" sub={`${waitingCount} in a trip · add an email in People and they are invited`} alert onPress={() => router.push('/board/udhari/splitwise' as never)} /> : null}
                {Object.keys(c.failed ?? {}).length ? <Line title="Not sent to Splitwise" sub={`${Object.keys(c.failed!).length} waiting · see what Splitwise said`} alert onPress={() => router.push('/board/udhari/splitwise' as never)} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, borderTopWidth: 1, borderColor: t.c.line }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>New shares go to Splitwise</Text>
                    <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>only linked people; Turf, trips and splits · a trip with people gets its own Splitwise group</Text>
                  </View>
                  <Toggle value={c.auto} onChange={(v) => setSwConfig(os, { auto: v })} accessibilityLabel="New shares go to Splitwise" />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, borderTopWidth: 1, borderColor: t.c.line }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>Last sync</Text>
                    <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{busy ? 'Syncing…' : synced ?? 'not yet'}</Text>
                  </View>
                  <Pill label={busy ? 'Syncing…' : 'Sync now'} small onPress={() => !busy && void sync()} />
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Sign out of Splitwise" onPress={() => { signOutSplitwise(os); toast.show({ message: 'Signed out of Splitwise', icon: 'check' }); }} style={{ minHeight: 64, paddingVertical: 10, justifyContent: 'center', borderTopWidth: 1, borderColor: t.c.line, gap: 2 }}>
                  <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.alert.coralText }}>Sign out of Splitwise</Text>
                  <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>LifeOS keeps your shares; nothing goes there</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="Sign in with Splitwise" onPress={() => router.push('/board/udhari/splitwise' as never)} style={({ pressed }) => ({ padding: 18, borderRadius: 28, backgroundColor: blocks.mint, gap: 10, opacity: pressed ? 0.9 : 1 })}>
                <Text style={{ fontSize: 18, lineHeight: 23, fontWeight: '700', color: INK }}>{c.signedOut ? 'Splitwise signed you out' : 'Sign in with Splitwise'}</Text>
                <Text style={{ fontSize: 13, lineHeight: 18, color: 'rgba(11,11,13,0.72)' }}>This page works from LifeOS’s own shares. Sign in and linked people’s shares and payments go there on their own.</Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </ScrollView>
      <AddSheet visible={adding} onClose={() => setAdding(false)} />
    </View>
  );
}

/** Udhari › Groups: every group with shares or Bills, your net in each. */
export function UdhariGroups(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const { t, style } = useScreen();
  const groups = useLive((o) => udhariGroups(o), []);
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView contentContainerStyle={style}>
        <ScreenHeader title="Groups" subtitle="each one’s net for you" onBack={back(router)} />
        {groups.length ? <Groups rows={groups} /> : <EmptyState icon="people" line="No group has shares yet. Pick a group when you split a payment, or start a trip." bare />}
      </ScrollView>
    </View>
  );
}

/** Udhari › Activity: what moved lately, newest first. */
export function UdhariActivity(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const { t, style } = useScreen();
  const rows = useLive((o) => udhariActivity(o, 60), []);
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView contentContainerStyle={style}>
        <ScreenHeader title="Activity" subtitle="shares, Bills and paybacks" onBack={back(router)} />
        {rows.length ? <Activity rows={rows} /> : <EmptyState icon="history" line="Nothing shared yet." bare />}
      </ScrollView>
    </View>
  );
}

/** The bar's raised button: Money's + sheet, over Udhari. */
export function UdhariAdd(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <AddSheet visible onClose={back(router)} />
    </View>
  );
}

function Stat({ label, value, color, onPress }: { label: string; value: string; color: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} onPress={onPress} style={({ pressed }) => ({ flex: 1, padding: 14, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, gap: 4, opacity: pressed ? 0.85 : 1 })}>
      <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{label}</Text>
      <Text style={{ fontSize: 20, lineHeight: 25, fontWeight: '700', color }}>{value}</Text>
    </Pressable>
  );
}

function Pill({ label, icon, lime, small, onPress }: { label: string; icon?: string; lime?: boolean; small?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flex: small ? undefined : 1, height: small ? 34 : 48, paddingHorizontal: small ? 14 : 16, borderRadius: 999, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: lime ? blocks.lime : t.c.bg.tileRaised, opacity: pressed ? 0.85 : 1 })}>
      {icon ? <Icon name={icon} size={16} color={lime ? INK : t.c.fg.primary} /> : null}
      <Text style={{ fontSize: small ? 13 : 15, lineHeight: 20, fontWeight: '700', color: lime ? INK : t.c.fg.primary }}>{label}</Text>
    </Pressable>
  );
}

function Tag({ label, color }: { label: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: color ? `${color}22` : t.c.bg.tileRaised }}>
      <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: color ?? t.c.fg.secondary }}>{label}</Text>
    </View>
  );
}

/** The figure a row stands for: LifeOS's, or Splitwise's for a friend only Splitwise knows. */
const valueOf = (r: PersonRow) => (onlySw(r) ? (r.swAmount ?? 0) : r.amount);
/** Splitwise has a balance with them and LifeOS has none: Splitwise's figure stands. */
const onlySw = (r: PersonRow) => r.swOnly || (!r.amount && !!r.swAmount);

function People({ rows }: { rows: PersonRow[] }) {
  const os = useOS();
  const t = useTheme();
  const [open, setOpen] = useState<PersonRow | null>(null);
  const apart = (r: PersonRow) => !onlySw(r) && r.swAmount !== null && Math.abs(r.swAmount - r.amount) >= 1;
  const said = (n: number) => (n > 0 ? `${os.format.currency(Math.round(n))} to you` : n < 0 ? `you owe ${os.format.currency(Math.round(-n))}` : 'square');
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
      {rows.map((r, i) => (
        <Pressable key={r.personId} accessibilityRole="button" accessibilityLabel={`${r.name}, ${said(valueOf(r))}${r.swOnly ? ', only on Splitwise' : ''}`} onPress={() => setOpen(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: t.c.line }}>
          <View>
            <Disc name={r.name} colorKey={r.personId} size={40} />
            {r.linked ? <View style={{ position: 'absolute', right: -2, bottom: -2, width: 13, height: 13, borderRadius: 7, backgroundColor: blocks.mint, borderWidth: 2, borderColor: t.c.bg.tile }} /> : null}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{r.name}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {r.tags.slice(0, 2).map((x) => <Tag key={x} label={x} />)}
              {onlySw(r) ? <Tag label={r.swOnly ? 'Only on Splitwise' : 'On Splitwise, not in LifeOS'} color={blocks.sky} /> : r.linked && !apart(r) ? <Tag label="Splitwise" color={blocks.mint} /> : null}
              {apart(r) ? <Tag label={`Splitwise: ${said(r.swAmount!)}`} color={t.c.alert.coralText} /> : null}
              {r.oldestDays ? <Tag label={`${r.oldestDays} days`} color={t.c.alert.coralText} /> : null}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: valueOf(r) > 0 ? blocks.lime : valueOf(r) < 0 ? t.c.alert.coralText : t.c.fg.secondary }}>{valueOf(r) ? os.format.currency(Math.round(Math.abs(valueOf(r)))) : 'Settled'}</Text>
            {r.swOnly ? <Pill label="Link" small lime onPress={() => setOpen(r)} /> : r.amount ? <PayOrRemind personId={r.personId} name={r.name} balance={r.amount} open={r.open} compact /> : null}
          </View>
        </Pressable>
      ))}
      <PersonSheet row={open} onClose={() => setOpen(null)} />
    </View>
  );
}

/**
 * One person, both sides: what LifeOS has and what Splitwise has (read live),
 * and linking them, so a friend only Splitwise knows joins People.
 */
function PersonSheet({ row, onClose }: { row: PersonRow | null; onClose: () => void }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const c = useLive((o) => swConfig(o), []);
  const people = useLive((o) => o.records.query('person', {}, { limit: 3000 }).map((p) => ({ id: p.id, title: p.title })), []);
  const personId = row && !row.swOnly ? row.personId : null;
  const local = useLive((o) => (personId ? personRecords(o, personId) : []), [personId]);
  const [theirs, setTheirs] = useState<{ list: SwExpense[]; error?: string } | null>(null);
  const [picking, setPicking] = useState<'person' | 'friend' | null>(null);
  const signedIn = !!c.me && !c.signedOut;
  const friendId = row?.friendId ?? (personId ? c.people[personId]?.sw ?? null : null);
  useEffect(() => {
    setTheirs(null);
    if (!row || !friendId || !signedIn) return;
    let live = true;
    new SplitwiseClient().friendExpenses(friendId).then((list) => live && setTheirs({ list })).catch((e) => live && setTheirs({ list: [], error: (e as Error).message }));
    return () => {
      live = false;
    };
  }, [row, friendId, signedIn]);
  if (!row) return null;
  const money = (n: number, cur = 'INR') => (cur === 'INR' ? os.format.currency(Math.round(Math.abs(n))) : `${cur} ${Math.round(Math.abs(n)).toLocaleString()}`);
  const said = (n: number | null) => (n === null ? '—' : n > 0 ? `${money(n)} to you` : n < 0 ? `you owe ${money(n)}` : 'square');
  const linkedIds = new Set(Object.keys(c.people));
  const free = people.filter((p) => !linkedIds.has(p.id));
  const freeFriends = c.friends.filter((f) => !Object.values(c.people).some((v) => v.sw === f.id));
  const guessPerson = row.swOnly ? suggestPerson(free, row.name) : null;
  const guessFriend = personId && !c.people[personId] ? suggestPerson(freeFriends.map((f) => ({ id: String(f.id), title: f.name })), row.name) : null;
  const friendName = (id: number) => c.friends.find((f) => f.id === id)?.name ?? 'them';
  const link = (pid: string, fid: number) => {
    linkPerson(os, pid, { id: fid, name: friendName(fid) });
    toast.show({ message: `${friendName(fid)} linked`, icon: 'check', undo: () => unlinkPerson(os, pid) });
    onClose();
  };
  const mine = (e: SwExpense) => {
    const u = e.users.find((x) => x.user_id === c.me?.id);
    return u ? Number(u.paid_share) - Number(u.owed_share) : 0;
  };

  return (
    <Sheet visible onClose={onClose} title={row.name} footer={personId ? <Button title="Open their page" variant="secondary" onPress={() => { onClose(); router.push(`/entity/person/${personId}` as never); }} /> : undefined}>
      <View style={{ gap: 18 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[['In LifeOS', row.swOnly ? null : row.amount], ['On Splitwise', signedIn && friendId ? (row.swAmount ?? c.friends.find((f) => f.id === friendId)?.balance ?? 0) : null]].map(([label, n]) => (
            <View key={label as string} style={{ flex: 1, padding: 14, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, gap: 4 }}>
              <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{label as string}</Text>
              <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700' }}>{n === null ? (label === 'In LifeOS' ? 'not in People' : signedIn ? 'not linked' : 'signed out') : said(n as number)}</Text>
              {label === 'On Splitwise' && n !== null && Object.keys(row.swOther).length ? <Text color="secondary" style={{ fontSize: 11, lineHeight: 14 }}>{`Splitwise keeps ${Object.entries(row.swOther).map(([cur, v]) => `${cur} ${Math.round(v).toLocaleString()}`).join(', ')} apart; counted at your trip's rate`}</Text> : null}
            </View>
          ))}
        </View>

        {row.swOnly ? (
          <View style={{ gap: 8 }}>
            <Text color="secondary" style={{ fontSize: 13, lineHeight: 18 }}>Link them to someone in People: what you share from now goes to Splitwise, and their payments settle here.</Text>
            {guessPerson ? <Button title={`Link to ${people.find((p) => p.id === guessPerson)?.title}`} icon="link" onPress={() => link(guessPerson, row.friendId!)} /> : null}
            <Button title={guessPerson ? 'Someone else in People' : 'Pick in People, or add them'} variant="secondary" onPress={() => setPicking('person')} />
          </View>
        ) : personId && c.people[personId] ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text color="secondary" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>{`Linked to ${c.people[personId]!.name} on Splitwise`}</Text>
            <Pill label="Unlink" small onPress={() => { const was = c.people[personId]!; unlinkPerson(os, personId); toast.show({ message: `${row.name} unlinked`, icon: 'check', undo: () => linkPerson(os, personId, { id: was.sw, name: was.name }, was.at) }); }} />
          </View>
        ) : personId && signedIn ? (
          <View style={{ gap: 8 }}>
            {guessFriend ? <Button title={`Link to ${friendName(Number(guessFriend))} on Splitwise`} icon="link" onPress={() => link(personId, Number(guessFriend))} /> : null}
            <Button title="Pick a Splitwise friend" variant="secondary" onPress={() => setPicking('friend')} />
          </View>
        ) : null}

        {friendId && signedIn ? (
          <View style={{ gap: 8 }}>
            <SectionHead title="On Splitwise" sub={theirs ? `${theirs.list.length} latest` : 'reading…'} />
            {theirs?.error ? <Text style={{ fontSize: 13, color: t.c.alert.coralText }}>{`Splitwise: ${theirs.error.slice(0, 120)}`}</Text> : null}
            {theirs?.list.map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 19, fontWeight: '600' }}>{e.payment ? 'Payment' : e.description}</Text>
                  <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{[format(new Date(e.date), 'd MMM yyyy'), e.group_id ? c.swGroups.find((g) => g.id === e.group_id)?.name ?? 'a group' : 'between you', `${money(Number(e.cost), e.currency_code)} in all`].join(' · ')}</Text>
                </View>
                {Math.abs(mine(e)) >= 0.5 ? <Text style={{ fontSize: 14, fontWeight: '700', color: mine(e) > 0 ? blocks.lime : t.c.alert.coralText }}>{`${mine(e) > 0 ? '+' : '−'}${money(mine(e), e.currency_code)}`}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {personId ? (
          <View style={{ gap: 8 }}>
            <SectionHead title="In LifeOS" sub={`${local.length} latest`} />
            {local.length ? local.map((r) => (
              <Pressable key={r.key} accessibilityRole="button" accessibilityLabel={r.title} onPress={() => { onClose(); router.push(r.route as never); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 19, fontWeight: '600' }}>{r.title}</Text>
                  <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{`${format(new Date(`${r.date}T00:00:00`), 'd MMM yyyy')} · ${r.sub}`}</Text>
                </View>
                {Math.abs(r.amount) >= 0.5 ? <Text style={{ fontSize: 14, fontWeight: '700', color: r.amount > 0 ? blocks.lime : t.c.alert.coralText }}>{`${r.amount > 0 ? '+' : '−'}${money(r.amount)}`}</Text> : null}
              </Pressable>
            )) : <Text color="secondary" style={{ fontSize: 13 }}>Nothing shared with them in LifeOS.</Text>}
          </View>
        ) : null}
      </View>
      <PickerSheet visible={picking === 'person'} onClose={() => setPicking(null)} title={`Who is ${row.name}?`} items={free} onSelect={(id) => { setPicking(null); link(id, row.friendId!); }} onCreate={(name) => { const p = os.records.create({ object: 'person', title: name, data: {} }, 'user'); setPicking(null); link(p.id, row.friendId!); }} />
      <PickerSheet visible={picking === 'friend'} onClose={() => setPicking(null)} title={`${row.name} on Splitwise`} items={freeFriends.map((f) => ({ id: String(f.id), title: f.name }))} onSelect={(id) => { setPicking(null); if (personId) link(personId, Number(id)); }} />
    </Sheet>
  );
}

function Groups({ rows }: { rows: GroupRow[] }) {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const c = useLive((o) => swConfig(o), []);
  const [mapping, setMapping] = useState<GroupRow | null>(null);
  const connected = !!c.me && !c.signedOut;
  const mapTo = (g: GroupRow, id: string) => {
    const groups = { ...c.groups };
    // "Between you" also keeps a trip's group from being made on Splitwise on its own.
    const off = new Set(c.noGroup ?? []);
    if (id === '0') {
      delete groups[g.id];
      off.add(g.id);
    } else {
      groups[g.id] = Number(id);
      off.delete(g.id);
    }
    // A new mapping is read again from the start: what both have is matched, the rest goes across.
    setSwConfig(os, { groups, noGroup: [...off], billGroupsSeen: (c.billGroupsSeen ?? []).filter((x) => x !== g.id) });
    setMapping(null);
    if (id !== '0') {
      toast.show({ message: `${g.title} syncs with ${c.swGroups.find((x) => String(x.id) === id)?.name ?? 'Splitwise'}…`, icon: 'repeat' });
      void runSplitwiseSync(os).then((msg) => toast.show({ message: msg, icon: msg.includes('signed') ? 'alert' : 'check' }));
    }
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {rows.map((g, i) => (
        <Pressable key={g.id} accessibilityRole="button" accessibilityLabel={`${g.title}, ${g.net > 0 ? `${os.format.currency(g.net)} to you` : g.net < 0 ? `you owe ${os.format.currency(-g.net)}` : 'square'}`} onPress={() => router.push(`/entity/group/${g.id}` as never)} style={({ pressed }) => ({ width: '47%', flexGrow: 1, minHeight: 168, padding: 16, borderRadius: 24, backgroundColor: GROUP_FILLS[i % GROUP_FILLS.length], justifyContent: 'space-between', opacity: pressed ? 0.85 : 1 })}>
          <View style={{ flexDirection: 'row' }}>
            {g.memberIds.slice(0, 4).map((m, j) => (
              <View key={m} style={{ marginLeft: j ? -10 : 0, borderRadius: 16, borderWidth: 2, borderColor: GROUP_FILLS[i % GROUP_FILLS.length] }}>
                <Disc name={os.records.get(m)?.title ?? '?'} colorKey={m} size={28} />
              </View>
            ))}
          </View>
          <View style={{ gap: 2 }}>
            <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 20, fontWeight: '700', color: INK }}>{g.title}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, color: 'rgba(11,11,13,0.68)' }}>{g.sub}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 22, lineHeight: 27, fontWeight: '700', color: INK }}>{os.format.currency(Math.round(Math.abs(g.net)))}</Text>
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: 'rgba(11,11,13,0.68)' }}>{g.net > 0 ? 'to you' : g.net < 0 ? 'you owe' : 'all square'}</Text>
          </View>
          {connected ? (
            <Pressable accessibilityRole="button" accessibilityLabel={c.groups[g.id] ? `Syncs with ${c.swGroups.find((x) => x.id === c.groups[g.id])?.name} on Splitwise. Change` : 'Link to a Splitwise group'} onPress={() => setMapping(g)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, height: 30, borderRadius: 999, backgroundColor: 'rgba(11,11,13,0.12)', opacity: pressed ? 0.8 : 1 })}>
              <Icon name={c.groups[g.id] ? 'check' : 'link'} size={13} color={INK} />
              <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: INK, maxWidth: 120 }}>{c.groups[g.id] ? c.swGroups.find((x) => x.id === c.groups[g.id])?.name ?? 'Splitwise' : 'Splitwise group'}</Text>
            </Pressable>
          ) : null}
        </Pressable>
      ))}
      <PickerSheet visible={!!mapping} onClose={() => setMapping(null)} title={mapping ? `${mapping.title} on Splitwise` : undefined} items={[{ id: '0', title: 'No group (between you)' }, ...c.swGroups.map((x) => ({ id: String(x.id), title: x.name }))]} selected={mapping && c.groups[mapping.id] ? [String(c.groups[mapping.id])] : ['0']} onSelect={(id) => mapping && mapTo(mapping, id)} />
    </View>
  );
}

const dayLabel = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  return (isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, isThisYear(d) ? 'EEE d MMM' : 'EEE d MMM yyyy')).toUpperCase();
};

function Activity({ rows }: { rows: ActivityRow[] }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
      {rows.map((r, i) => (
        <Pressable key={r.key} accessibilityRole="button" accessibilityLabel={`${r.title}, ${dayLabel(r.date)}`} onPress={() => router.push(r.route as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: t.c.line }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={r.payment ? 'check' : 'people'} size={16} color={r.payment ? blocks.mint : t.c.fg.secondary} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text color="secondary" style={{ fontSize: 10, lineHeight: 13, fontWeight: '700', letterSpacing: 0.8 }}>{dayLabel(r.date)}</Text>
            <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{r.title}</Text>
            <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{r.sub}</Text>
          </View>
          {Math.abs(r.amount) >= 1 ? <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: r.amount > 0 ? blocks.lime : t.c.alert.coralText }}>{`${r.amount > 0 ? '+' : '−'}${os.format.currency(Math.round(Math.abs(r.amount)))}`}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

function Line({ title, sub, badge, alert, first, onPress }: { title: string; sub: string; badge?: string; alert?: boolean; first?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderColor: t.c.line }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: alert ? t.c.alert.coralText : t.c.fg.primary }}>{title}</Text>
        <Text numberOfLines={2} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{sub}</Text>
      </View>
      {badge ? <Tag label={badge} color={blocks.lime} /> : null}
      <Icon name="chevron-right" size={16} color={t.c.fg.tertiary} />
    </Pressable>
  );
}
