import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LifeOSContext } from '@core/registry/context';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { ArcTicks, Disc, Icon, IconButton, InstrumentCard, PickerSheet, ScreenHeader, SectionHead, StackedBar, Text, Toggle, useBottomBarInset, useToast } from '@ui/kit';
import { forgetSplitwise, linkPerson, setSwConfig, suggestPerson, swConfig, syncSplitwise, SplitwiseClient, SplitwiseError, SPLITWISE, unlinkPerson } from '@modules/finance/splitwise';
import type { DebtData } from '@modules/finance/split';

const INK = '#0B0B0D';

/** One sync, from the screen: says what moved, or that Splitwise signed you out. */
export async function runSplitwiseSync(os: LifeOSContext): Promise<string> {
  try {
    const r = await syncSplitwise(os, new SplitwiseClient());
    const bits = [r.pushed && `${r.pushed} sent`, r.removed && `${r.removed} removed`, r.paidThere && `${r.paidThere} payment${r.paidThere === 1 ? '' : 's'} recorded`, r.settledHere && `${r.settledHere} settled here`].filter(Boolean);
    return bits.length ? `Splitwise: ${bits.join(' · ')}` : 'Splitwise is in step';
  } catch (e) {
    return e instanceof SplitwiseError && e.signedOut ? 'Splitwise signed you out. Sign in again.' : `Splitwise: ${(e as Error).message.slice(0, 80)}`;
  }
}

/**
 * Money › Splitwise (NR-Money-Splitwise): sign in on Splitwise's own page, see
 * where you stand, link your People to your Splitwise friends, send a group's
 * shares to a Splitwise group, and whether new shares go there on their own.
 */
export function SplitwiseScreen(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottom = useBottomBarInset();
  const c = useLive((o) => swConfig(o), []);
  const people = useLive((o) => o.records.query('person', {}, { limit: 3000 }).map((p) => ({ id: p.id, title: p.title })), []);
  // Groups with shares (Debts) or a trip's expenses (Bills): either can go to a Splitwise group.
  const groupIds = useLive((o) => [...new Set([...o.records.query<DebtData>('debt', {}, { limit: 3000 }).map((d) => d.data.groupId), ...(o.registry.objects.has('bill') ? o.records.query<{ groupId?: string }>('bill', {}, { limit: 3000 }).map((b) => b.data.groupId) : [])].filter((g): g is string => !!g))].map((id) => ({ id, title: o.records.get(id)?.title ?? 'A group' })), []);
  const [signingIn, setSigningIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<{ id: number; name: string } | null>(null);
  const [mapping, setMapping] = useState<string | null>(null);
  const connected = !!c.me && !c.signedOut;

  const sync = async (quiet = false) => {
    setBusy(true);
    const msg = await runSplitwiseSync(os);
    setBusy(false);
    if (!quiet || msg.includes('signed you out')) toast.show({ message: msg, icon: msg.includes('signed') ? 'alert' : 'check' });
  };
  // Opening the screen brings it up to date.
  useEffect(() => {
    if (c.me) void sync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = () => {
    // The session lives in the phone's cookie store, shared with LifeOS's calls: clear it.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native/Libraries/Network/RCTNetworking').default?.clearCookies?.(() => {});
    } catch {
      /* web */
    }
    forgetSplitwise(os);
    toast.show({ message: 'Signed out of Splitwise', icon: 'check' });
  };

  const linkedTo = (swId: number) => Object.entries(c.people).find(([, v]) => v.sw === swId)?.[0] ?? null;
  const linkedIds = new Set(Object.keys(c.people));
  const free = people.filter((p) => !linkedIds.has(p.id));
  const owedToYou = Object.values(c.balances).filter((b) => b > 0).reduce((n, b) => n + b, 0);
  const youOwe = Object.values(c.balances).filter((b) => b < 0).reduce((n, b) => n - b, 0);
  const money = (n: number) => os.format.currency(Math.round(n));
  const rows = [...c.friends].sort((a, b) => Number(!!linkedTo(a.id)) - Number(!!linkedTo(b.id)) || a.name.localeCompare(b.name));

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: bottom, gap: 22 }}>
        <ScreenHeader title="Udhari" subtitle="With Splitwise" onBack={() => (router.canGoBack() ? router.back() : router.replace('/browse' as never))} right={connected ? <IconButton icon="repeat" filled accessibilityLabel="Sync now" onPress={() => void sync()} /> : undefined} />

        {!connected ? (
          <View style={{ padding: 22, borderRadius: 32, backgroundColor: blocks.mint, gap: 16, overflow: 'hidden' }}>
            <View pointerEvents="none" style={{ position: 'absolute', right: -60, top: -50, width: 220, height: 220, borderRadius: 110, borderWidth: 30, borderColor: 'rgba(15,107,90,0.18)' }} />
            <Text style={{ fontSize: 26, lineHeight: 30, fontWeight: '700', letterSpacing: -0.8, color: INK }}>{c.signedOut ? 'Splitwise signed you out' : 'Splitwise and LifeOS, always in step'}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[['target', 'Turf and trip shares go there'], ['check', 'Paid by UPI, settled in both'], ['people', 'Balances side by side']].map(([icon, line]) => (
                <View key={line} style={{ flex: 1, padding: 12, borderRadius: 18, backgroundColor: 'rgba(11,11,13,0.08)', gap: 6 }}>
                  <Icon name={icon!} size={18} color={INK} />
                  <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '700', color: INK }}>{line}</Text>
                </View>
              ))}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Sign in with Splitwise" onPress={() => setSigningIn(true)} disabled={Platform.OS === 'web'} style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', color: '#F5F5F7' }}>{Platform.OS === 'web' ? 'Sign in on the phone' : 'Sign in with Splitwise'}</Text>
            </Pressable>
            <Text style={{ fontSize: 12, lineHeight: 16, color: 'rgba(11,11,13,0.72)' }}>On Splitwise's own page. Only people you link sync, and only their name there, the amount, what for and the day. No bank texts go there.</Text>
          </View>
        ) : (
          <>
            <InstrumentCard title="SPLITWISE · LIVE" value={money(owedToYou)} caption="to you" status={busy ? 'syncing' : 'live'} footer={{ label: c.lastSync ? `you owe ${money(youOwe)} · synced ${new Date(c.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : `you owe ${money(youOwe)}`, value: c.me!.name, good: true }} />
            {owedToYou + youOwe > 0 ? <StackedBar parts={[{ value: owedToYou, color: blocks.lime, label: 'owed to you' }, { value: youOwe, color: t.c.alert.coralText, label: 'you owe' }]} /> : null}
            {c.friends.length ? <ArcTicks share={Object.keys(c.people).length / c.friends.length} value={`${Object.keys(c.people).length} of ${c.friends.length}`} label="People linked" period="only linked people sync" color={blocks.lime} /> : null}

            <View style={{ gap: 10 }}>
              <SectionHead title="Link your people" sub={`${Object.keys(c.people).length} linked`} />
              <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
                {rows.length ? rows.map((f, i) => {
                  const mine = linkedTo(f.id);
                  const guess = mine ? null : suggestPerson(free, f.name);
                  const person = mine ?? guess;
                  const name = person ? people.find((p) => p.id === person)?.title : null;
                  return (
                    <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, borderTopWidth: i ? 1 : 0, borderColor: t.c.line }}>
                      <View>
                        <Disc name={f.name} colorKey={person ?? String(f.id)} size={36} />
                        {mine ? <View style={{ position: 'absolute', right: -2, bottom: -2, width: 13, height: 13, borderRadius: 7, backgroundColor: blocks.lime, borderWidth: 2, borderColor: t.c.bg.tile }} /> : null}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{f.name}</Text>
                        <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>
                          {mine ? `${name} in People${c.balances[mine] ? ` · ${c.balances[mine]! > 0 ? `${money(c.balances[mine]!)} to you` : `you owe ${money(-c.balances[mine]!)}`}` : ''}` : guess ? `looks like ${name} in People` : 'no one matched in People'}
                        </Text>
                      </View>
                      {mine ? (
                        <Chip label="Linked" lime onPress={() => { unlinkPerson(os, mine); toast.show({ message: `${f.name} unlinked`, icon: 'check', undo: () => linkPerson(os, mine, f) }); }} />
                      ) : guess ? (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <Chip label="Not them" onPress={() => setPicking(f)} />
                          <Chip label="Link" lime onPress={() => linkPerson(os, guess, f)} />
                        </View>
                      ) : (
                        <Chip label="Pick" dashed onPress={() => setPicking(f)} />
                      )}
                    </View>
                  );
                }) : <Text color="secondary" style={{ paddingVertical: 16, fontSize: 14 }}>{busy ? 'Reading your Splitwise friends…' : 'No Splitwise friends yet.'}</Text>}
              </View>
            </View>

            {groupIds.length ? (
              <View style={{ gap: 10 }}>
                <SectionHead title="Groups · where shares go" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {groupIds.map((g, i) => {
                    const to = c.groups[g.id];
                    const name = to ? c.swGroups.find((x) => x.id === to)?.name ?? 'a group' : 'just between you';
                    const bg = [blocks.sky, blocks.lilac, blocks.pink, blocks.yellow][i % 4]!;
                    return (
                      <Pressable key={g.id} accessibilityRole="button" accessibilityLabel={`${g.title} goes to ${name}. Change`} onPress={() => setMapping(g.id)} style={({ pressed }) => ({ width: '47%', minHeight: 130, padding: 16, borderRadius: 24, backgroundColor: bg, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1 })}>
                        <Text numberOfLines={2} style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, color: INK }}>{g.title.toUpperCase()}</Text>
                        <View style={{ gap: 2 }}>
                          <Text style={{ fontSize: 13, lineHeight: 17, color: 'rgba(11,11,13,0.68)' }}>goes to</Text>
                          <Text numberOfLines={1} style={{ fontSize: 18, lineHeight: 23, fontWeight: '700', color: INK }}>{`${name} ▾`}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>New shares go to Splitwise</Text>
                <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>for linked people, made after you link them · deleting one here deletes it there</Text>
              </View>
              <Toggle value={c.auto} onChange={(v) => setSwConfig(os, { auto: v })} accessibilityLabel="New shares go to Splitwise" />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Sign out of Splitwise" onPress={signOut} style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text color="secondary" style={{ fontSize: 13, lineHeight: 18, fontWeight: '700' }}>Sign out of Splitwise</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <PickerSheet visible={!!picking} onClose={() => setPicking(null)} title={picking ? `Who is ${picking.name}?` : undefined} items={free.map((p) => ({ id: p.id, title: p.title }))} onSelect={(id) => { if (picking) linkPerson(os, id, picking); setPicking(null); }} onCreate={(name) => { if (!picking) return; const p = os.records.create({ object: 'person', title: name, data: {} }, 'user'); linkPerson(os, p.id, picking); setPicking(null); }} />
      <PickerSheet visible={!!mapping} onClose={() => setMapping(null)} title="Its shares go to" items={[{ id: '0', title: 'Just between you (no group)' }, ...c.swGroups.map((g) => ({ id: String(g.id), title: g.name }))]} selected={mapping && c.groups[mapping] ? [String(c.groups[mapping])] : ['0']} onSelect={(id) => { if (mapping) { const groups = { ...c.groups }; if (id === '0') delete groups[mapping]; else groups[mapping] = Number(id); setSwConfig(os, { groups }); } setMapping(null); }} />
      {signingIn ? <SignIn onDone={(ok) => { setSigningIn(false); if (ok) void sync(); }} /> : null}
    </View>
  );
}

/** A small pill button for a row: lime, plain or dashed. */
function Chip({ label, lime, dashed, onPress }: { label: string; lime?: boolean; dashed?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ height: 34, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: lime ? blocks.lime : dashed ? 'transparent' : t.c.bg.tileRaised, borderWidth: dashed ? 1 : 0, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)', opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: lime ? INK : t.c.fg.primary }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Splitwise's own sign-in page, full screen. Once it moves past the sign-in
 * page, the session is in the phone's cookie store and the sign-in is done.
 */
function SignIn({ onDone }: { onDone: (ok: boolean) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WebView } = require('react-native-webview') as typeof import('react-native-webview');
  return (
    <Modal visible animationType="slide" onRequestClose={() => onDone(false)}>
      <View style={{ flex: 1, backgroundColor: t.c.bg.ground, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: t.layout.gutter, paddingVertical: 10 }}>
          <IconButton icon="x" filled accessibilityLabel="Cancel" onPress={() => onDone(false)} />
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '700' }}>Sign in to Splitwise</Text>
          {loading ? <ActivityIndicator color={t.c.accent.gold} /> : null}
        </View>
        <WebView
          source={{ uri: `${SPLITWISE}login` }}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(nav) => {
            const u = nav.url ?? '';
            if (!nav.loading && u.startsWith(SPLITWISE) && !/\/(login|signup|password|users\/(new|sign_in))/.test(u)) onDone(true);
          }}
          style={{ flex: 1 }}
        />
      </View>
    </Modal>
  );
}
