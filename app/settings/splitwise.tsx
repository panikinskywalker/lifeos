import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format, isToday, isYesterday } from 'date-fns';
import { runSource } from '@core/filing/sources';
import { sourceState } from '@core/sources/deviceData';
import { lifeosBalance, linkedGroups, linkGroup, olderBills, sendOlderBills, splitwiseBalances, splitwiseClient, splitwiseLast, splitwiseMe, splitwiseSource, SPLITWISE_SOURCE, SPLITWISE_TOKEN, unlinkGroup, type SwGroup } from '@modules/finance';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { Button, Icon, PickerSheet, Screen, Text, useToast } from '@ui/kit';

const STEPS = [
  'On secure.splitwise.com/apps, tap Register your application. Any name and any website will do (LifeOS, https://example.com).',
  'Open the app you made and copy its API key.',
  'Paste it here, load your groups and link each one you want to a group in LifeOS. A trip’s group brings its Bills into that trip’s Money.',
];

const when = (at: number) => `${isToday(at) ? 'Today' : isYesterday(at) ? 'Yesterday' : format(at, 'd MMM')}, ${format(at, 'H:mm')}`;
const sym = (cur: string) => (cur === 'INR' ? '₹' : cur === 'JPY' ? '¥' : cur === 'USD' ? '$' : cur === 'EUR' ? '€' : `${cur} `);
const amt = (n: number, cur = 'INR') => `${n < 0 ? '−' : ''}${sym(cur)}${Math.round(Math.abs(n)).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US')}`;
const word = (n: number, cur = 'INR') => (Math.abs(n) < 0.5 ? 'settled' : n > 0 ? `owed ${amt(n, cur)}` : `you owe ${amt(-n, cur)}`);

/**
 * You › Data sources › Splitwise (docs/MODEL.md layer 2, *Splitwise*): the API
 * key (kept in the phone's secure store, never shown again), your Splitwise
 * groups and which LifeOS Group each keeps in step, both balances side by
 * side, Bills that were here before the link (Send them), changes waiting or
 * refused, Sync now. Laid out like You › Data sources › Notion.
 */
export default function SplitwiseSettings() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState<SwGroup[] | null>(null);
  const [picking, setPicking] = useState<SwGroup | null>(null);
  const state = useLive(
    (o) => ({
      src: sourceState(o, SPLITWISE_SOURCE),
      last: splitwiseLast(o),
      me: splitwiseMe(o),
      linked: linkedGroups(o).map((g) => ({ id: g.id, title: g.title, swId: g.data.splitwiseId!, mine: lifeosBalance(o, g.id), older: olderBills(o, g.id).length })),
      theirs: splitwiseBalances(o),
      lifeosGroups: o.registry.objects.has('group') ? o.records.query<{ kind?: string }>('group', {}, { limit: 500 }).filter((g) => !g.archived) : [],
      waiting: o.outbox.waiting(SPLITWISE_SOURCE).length,
      refused: o.outbox.refused(SPLITWISE_SOURCE).slice(0, 5),
    }),
    [],
  );

  useEffect(() => {
    void os.device?.secrets?.get(SPLITWISE_TOKEN).then((k) => setHasToken(!!k));
  }, [os]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings/sources' as never));
  const sync = async () => {
    setBusy(true);
    try {
      const n = await runSource(os, splitwiseSource);
      const st = sourceState(os, SPLITWISE_SOURCE);
      toast.show({ message: st.error ? `Splitwise: ${st.error}` : n ? `${n} brought in step with Splitwise` : 'In step with Splitwise', icon: st.error ? 'info' : 'check' });
    } finally {
      setBusy(false);
    }
  };
  const load = async () => {
    setBusy(true);
    try {
      const c = await splitwiseClient(os);
      if (!c) return;
      setGroups(await c.groups());
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    } finally {
      setBusy(false);
    }
  };
  const saveToken = async () => {
    const k = token.trim();
    if (k.length < 20) return toast.show({ message: 'That doesn’t look like a Splitwise API key', icon: 'info' });
    setBusy(true);
    try {
      await os.device?.secrets?.set(SPLITWISE_TOKEN, k);
      const c = await splitwiseClient(os);
      const me = await c!.me();
      os.settings.set('finance.splitwise.me', { id: me.id, name: [me.first_name, me.last_name].filter(Boolean).join(' ') });
      setToken('');
      setHasToken(true);
      toast.show({ message: `Connected as ${me.first_name ?? 'you'}`, icon: 'check' });
      setGroups(await c!.groups());
    } catch (e) {
      await os.device?.secrets?.set(SPLITWISE_TOKEN, null);
      setHasToken(false);
      toast.show({ message: (e as Error).message, icon: 'info' });
    } finally {
      setBusy(false);
    }
  };
  const forget = async () => {
    await os.device?.secrets?.set(SPLITWISE_TOKEN, null);
    os.settings.set('finance.splitwise.me', null);
    setHasToken(false);
    setGroups(null);
  };
  const link = async (sw: SwGroup, groupId: string | null) => {
    setPicking(null);
    linkGroup(os, sw, groupId);
    await sync();
  };

  const pill = state.src.error ? { label: 'NEEDS ATTENTION', bg: t.c.alert.coral, fg: t.c.alert.coralText, icon: 'info' as const } : hasToken && state.linked.length ? { label: 'ON', bg: t.c.ok.sage, fg: t.c.ok.sageText, icon: 'check' as const } : { label: 'OFF', bg: t.c.bg.tileRaised, fg: t.c.fg.secondary, icon: 'link' as const };
  const card = { padding: 14, gap: 12, borderRadius: 24, backgroundColor: t.c.bg.tile } as const;
  const linkedSw = new Set(state.linked.map((l) => l.swId));

  return (
    <Screen title="Splitwise" subtitle="You › Data sources" onBack={back} contentStyle={{ gap: 14 }}>
      <View style={card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="transfer" size={18} color={t.c.fg.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text variant="rowTitle" style={{ fontWeight: '700' }}>Splitwise</Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>{state.me ? `Connected as ${state.me.name}` : hasToken ? 'Connected' : 'Not connected'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: pill.bg }}>
            <Icon name={pill.icon} size={13} color={pill.fg} />
            <Text variant="labelMicro" color={pill.fg}>{pill.label}</Text>
          </View>
        </View>
        {hasToken ? (
          <>
            <View style={{ height: 1, backgroundColor: t.c.line }} />
            <Text variant="caption" color="secondary">
              {state.src.error ? state.src.error : state.last ? `Last sync ${when(state.last.at)} · ${state.last.created} in, ${state.last.updated} changed, ${state.last.deleted} deleted${state.last.matched ? `, ${state.last.matched} matched` : ''}` : 'Not synced yet'}
              {state.waiting ? ` · ${state.waiting} waiting to send` : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={busy ? 'Working…' : 'Sync now'} size="sm" icon="refresh" disabled={busy || !state.linked.length} onPress={sync} />
              <Button title="Forget the key" size="sm" variant="secondary" onPress={forget} />
            </View>
          </>
        ) : null}
      </View>

      {!hasToken ? (
        <View style={card}>
          <Text variant="label">Connect Splitwise</Text>
          {STEPS.map((s, i) => (
            <Text key={i} variant="caption" color="secondary">{`${i + 1}. ${s}`}</Text>
          ))}
          <TextInput value={token} onChangeText={setToken} placeholder="Your Splitwise API key" placeholderTextColor={t.c.fg.tertiary} autoCapitalize="none" autoCorrect={false} secureTextEntry style={{ height: 50, paddingHorizontal: 16, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, color: t.c.fg.primary, fontFamily: fontForWeight(500), fontSize: 15 }} />
          <Button title={busy ? 'Checking…' : 'Save and connect'} icon="link" disabled={busy || !token.trim()} onPress={saveToken} />
          <Text variant="caption" color="tertiary">The key stays in the phone’s secure store and is never shown again.</Text>
        </View>
      ) : null}

      {state.linked.length ? (
        <View style={card}>
          <Text variant="label">Kept in step</Text>
          {state.linked.map((l) => {
            const theirs = state.theirs[l.id] ?? {};
            const curs = Object.entries(theirs).filter(([, v]) => Math.abs(v) >= 0.5);
            const inr = theirs.INR ?? (curs.length ? null : 0);
            const differs = inr != null && Object.keys(theirs).length <= 1 && Math.abs(inr - l.mine) >= 1;
            return (
              <View key={l.id} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.c.line }}>
                <Text variant="rowTitle">{l.title}</Text>
                <Text variant="caption" color="secondary">{`LifeOS: ${word(l.mine)}`}</Text>
                <Text variant="caption" color={differs ? t.c.alert.coralText : 'secondary'}>{`Splitwise: ${curs.length ? curs.map(([c, v]) => word(v, c)).join(' · ') : 'settled'}${differs ? ' · they differ; Sync now' : ''}`}</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {l.older ? <Button title={`Send ${l.older} to Splitwise`} size="sm" icon="send" onPress={() => { const n = sendOlderBills(os, l.id); toast.show({ message: `${n} waiting to send`, icon: 'check' }); void sync(); }} /> : null}
                  <Button title="Open the group" size="sm" variant="secondary" onPress={() => router.push(`/entity/group/${l.id}` as never)} />
                  <Button title="Unlink" size="sm" variant="secondary" onPress={() => unlinkGroup(os, l.id)} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {hasToken ? (
        <View style={card}>
          <Text variant="label">Your Splitwise groups</Text>
          {groups == null ? (
            <Button title={busy ? 'Loading…' : 'Load my groups'} size="sm" variant="secondary" disabled={busy} onPress={load} />
          ) : groups.length ? (
            groups.map((g) => (
              <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.c.line }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="rowTitle" numberOfLines={1}>{g.name}</Text>
                  <Text variant="caption" color="secondary">{`${g.members.length} people`}</Text>
                </View>
                {linkedSw.has(g.id) ? <Text variant="labelMicro" color={t.c.ok.sageText}>LINKED</Text> : <Button title="Link" size="sm" icon="link" onPress={() => setPicking(g)} />}
              </View>
            ))
          ) : (
            <Text variant="caption" color="secondary">No groups in Splitwise yet.</Text>
          )}
        </View>
      ) : null}

      {state.refused.length ? (
        <View style={card}>
          <Text variant="label">Not sent</Text>
          {state.refused.map((r) => (
            <Text key={r.id} variant="caption" color={t.c.alert.coralText}>{`${r.label}: ${r.error ?? 'refused'}`}</Text>
          ))}
        </View>
      ) : null}

      <PickerSheet
        visible={!!picking}
        onClose={() => setPicking(null)}
        title={picking ? `Keep “${picking.name}” in step with` : undefined}
        items={[{ id: '__new', title: `A new group, “${picking?.name ?? ''}”`, icon: 'plus' }, ...state.lifeosGroups.map((g) => ({ id: g.id, title: g.title, subtitle: g.data.kind === 'trip' ? 'Trip group · its Bills show in the trip’s Money' : null, icon: 'people' }))]}
        onSelect={(id) => picking && void link(picking, id === '__new' ? null : id)}
      />
    </Screen>
  );
}
