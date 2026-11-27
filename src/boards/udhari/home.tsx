import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LifeOSContext } from '@core/registry/context';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { ArcTicks, Disc, Icon, IconButton, PickerSheet, ScreenHeader, SectionHead, Text, Toggle, useBottomBarInset, useToast } from '@ui/kit';
import { forgetSplitwise, linkPerson, retryRefused, setSwConfig, suggestPerson, swConfig, syncSplitwise, SplitwiseClient, SplitwiseError, SPLITWISE, unlinkPerson, type SwBalance } from '@modules/finance/splitwise';
import type { DebtData } from '@modules/finance/split';

const INK = '#0B0B0D';

/** One sync, from the screen: says what moved, or that Splitwise signed you out. */
export async function runSplitwiseSync(os: LifeOSContext): Promise<string> {
  try {
    const r = await syncSplitwise(os, new SplitwiseClient());
    const notSent = (r.billsFailed ?? 0) + (r.sharesFailed ?? 0);
    const bits = [r.pushed && `${r.pushed} sent`, r.billsSent && `${r.billsSent} trip expense${r.billsSent === 1 ? '' : 's'} sent`, notSent && `${notSent} not sent, see why in Udhari`, r.removed && `${r.removed} removed`, r.paidThere && `${r.paidThere} payment${r.paidThere === 1 ? '' : 's'} recorded`, r.settledHere && `${r.settledHere} settled here`].filter(Boolean);
    return bits.length ? `Splitwise: ${bits.join(' · ')}` : 'Splitwise is in step';
  } catch (e) {
    return e instanceof SplitwiseError && e.signedOut ? 'Splitwise signed you out. Sign in again.' : `Splitwise: ${(e as Error).message.slice(0, 80)}`;
  }
}

/** Sync from a screen, with a busy flag and a toast. */
function useSync() {
  const os = useOS();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const sync = async (quiet = false) => {
    setBusy(true);
    const msg = await runSplitwiseSync(os);
    setBusy(false);
    if (!quiet || msg.includes('signed you out') || msg.includes('not sent')) toast.show({ message: msg, icon: msg.includes('signed') || msg.includes('not sent') ? 'alert' : 'check' });
  };
  return { busy, sync };
}

/** Groups with shares (Debts) or a trip's expenses (Bills): either can go to a Splitwise group. */
function useLocalGroups() {
  return useLive((o) => [...new Set([...o.records.query<DebtData>('debt', {}, { limit: 3000 }).map((d) => d.data.groupId), ...(o.registry.objects.has('bill') ? o.records.query<{ groupId?: string }>('bill', {}, { limit: 3000 }).map((b) => b.data.groupId) : [])].filter((g): g is string => !!g))].map((id) => ({ id, title: o.records.get(id)?.title ?? 'A group' })), []);
}

/**
 * Udhari's front page (NR-Money-Splitwise): where you stand. What you are owed
 * and what you owe overall, then each friend and each group with a balance, as
 * Splitwise has it. Linking people and groups is in Set up.
 */
export function SplitwiseScreen(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = useBottomBarInset();
  const c = useLive((o) => swConfig(o), []);
  const localGroups = useLocalGroups();
  const [signingIn, setSigningIn] = useState(false);
  const { busy, sync } = useSync();
  const connected = !!c.me && !c.signedOut;
  // Opening the screen brings it up to date.
  useEffect(() => {
    if (c.me) void sync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (n: number, cur = 'INR') => os.format.currency(Math.round(Math.abs(n)), cur);
  const known = c.friends.some((f) => f.balance !== undefined);
  // Before a sync has read every friend's balance, the linked ones' rupee balances stand in.
  const balanceOf = (f: (typeof c.friends)[number]): SwBalance => {
    if (f.balance) return f.balance;
    const person = Object.entries(c.people).find(([, v]) => v.sw === f.id)?.[0];
    const b = person ? c.balances[person] : undefined;
    return b ? [{ currency: 'INR', amount: b }] : [];
  };
  const withBalance = c.friends.map((f) => ({ ...f, b: balanceOf(f) })).filter((f) => f.b.length);
  const inrOf = (b: SwBalance) => b.find((x) => x.currency === 'INR')?.amount ?? 0;
  withBalance.sort((a, b) => Math.abs(inrOf(b.b)) - Math.abs(inrOf(a.b)) || Math.abs(b.b[0]!.amount) - Math.abs(a.b[0]!.amount));
  const totals = new Map<string, { owed: number; owe: number }>();
  for (const f of withBalance) for (const x of f.b) {
    const tt = totals.get(x.currency) ?? { owed: 0, owe: 0 };
    if (x.amount > 0) tt.owed += x.amount; else tt.owe -= x.amount;
    totals.set(x.currency, tt);
  }
  // The headline is in rupees; with no rupee balance at all (only a trip's yen, say), in that currency.
  const heroCur = totals.has('INR') || !totals.size ? 'INR' : [...totals.keys()][0]!;
  const inr = totals.get(heroCur) ?? { owed: 0, owe: 0 };
  const others = [...totals.entries()].filter(([cur]) => cur !== heroCur);
  const net = inr.owed - inr.owe;
  const settledCount = c.friends.length - withBalance.length;
  const groups = c.swGroups.filter((g) => g.balance?.length);
  const personOf = (swId: number) => Object.entries(c.people).find(([, v]) => v.sw === swId)?.[0] ?? null;
  const unmapped = localGroups.filter((g) => !c.groups[g.id]);
  const failed = Object.entries(c.failed ?? {});
  const linkedCount = Object.keys(c.people).length;
  const heroBg = !withBalance.length || net >= 0 ? blocks.lime : blocks.pink;
  const amountLines = (b: SwBalance) => b.map((x) => ({ key: x.currency, text: fmt(x.amount, x.currency), owed: x.amount > 0 }));

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: bottom, gap: 22 }}>
        <ScreenHeader
          title="Udhari"
          subtitle={connected && c.lastSync ? `Splitwise · synced ${new Date(c.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'With Splitwise'}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/browse' as never))}
          right={connected ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <IconButton icon="repeat" filled accessibilityLabel="Sync now" onPress={() => void sync()} />
              <IconButton icon="settings" filled accessibilityLabel="Set up Splitwise" onPress={() => router.push('/board/udhari/setup' as never)} />
            </View>
          ) : undefined}
        />

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
            {/* Where you stand, overall. */}
            <View accessible accessibilityLabel={withBalance.length ? `${net >= 0 ? 'You are owed' : 'You owe'} ${fmt(net, heroCur)} overall` : 'All settled up'} style={{ padding: 22, borderRadius: 32, backgroundColor: heroBg, gap: 14, overflow: 'hidden' }}>
              <View pointerEvents="none" style={{ position: 'absolute', right: -50, top: -60, width: 200, height: 200, borderRadius: 100, borderWidth: 28, borderColor: 'rgba(11,11,13,0.07)' }} />
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, color: 'rgba(11,11,13,0.62)' }}>{!known && busy ? 'READING SPLITWISE…' : withBalance.length ? (net >= 0 ? 'OVERALL, YOU ARE OWED' : 'OVERALL, YOU OWE') : 'OVERALL'}</Text>
                <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: 46, lineHeight: 52, fontWeight: '800', letterSpacing: -1.6, color: INK }}>{withBalance.length ? fmt(net, heroCur) : 'Settled up'}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, padding: 12, borderRadius: 18, backgroundColor: 'rgba(11,11,13,0.08)', gap: 2 }}>
                  <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '700', color: 'rgba(11,11,13,0.62)' }}>Owed to you</Text>
                  <Text style={{ fontSize: 20, lineHeight: 25, fontWeight: '800', color: INK }}>{fmt(inr.owed, heroCur)}</Text>
                </View>
                <View style={{ flex: 1, padding: 12, borderRadius: 18, backgroundColor: 'rgba(11,11,13,0.08)', gap: 2 }}>
                  <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '700', color: 'rgba(11,11,13,0.62)' }}>You owe</Text>
                  <Text style={{ fontSize: 20, lineHeight: 25, fontWeight: '800', color: INK }}>{fmt(inr.owe, heroCur)}</Text>
                </View>
              </View>
              {others.map(([cur, v]) => (
                <Text key={cur} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: 'rgba(11,11,13,0.72)' }}>
                  {[v.owed ? `${fmt(v.owed, cur)} owed to you` : '', v.owe ? `you owe ${fmt(v.owe, cur)}` : ''].filter(Boolean).join(' · ')}
                </Text>
              ))}
            </View>

            {failed.length ? (
              <View style={{ gap: 10 }}>
                <SectionHead title="Not sent to Splitwise" sub={`${failed.length} waiting`} />
                <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
                  {failed.map(([key, f], i) => (
                    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: t.c.line }}>
                      <Icon name="alert" size={18} color={t.c.alert.coralText} />
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{f.what}</Text>
                        <Text numberOfLines={2} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{`Splitwise said: ${f.error}`}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, paddingHorizontal: 4 }}>Everything else synced. These wait until you change them here or try again.</Text>
                <View style={{ alignSelf: 'flex-start' }}><Chip label={busy ? 'Trying…' : 'Try again'} lime onPress={() => { if (busy) return; retryRefused(os); void sync(); }} /></View>
              </View>
            ) : null}

            <View style={{ gap: 10 }}>
              <SectionHead title="People" sub={withBalance.length ? `${withBalance.length} with a balance` : undefined} />
              <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
                {withBalance.length ? withBalance.map((f, i) => {
                  const person = personOf(f.id);
                  const lines = amountLines(f.b);
                  const allOwed = lines.every((l) => l.owed), allOwe = lines.every((l) => !l.owed);
                  return (
                    <Pressable key={f.id} accessibilityRole="button" accessibilityLabel={`${f.name}: ${lines.map((l) => (l.owed ? `owes you ${l.text}` : `you owe ${l.text}`)).join(', ')}`} onPress={() => router.push((person ? `/entity/person/${person}` : '/board/udhari/setup') as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: t.c.line, opacity: pressed ? 0.7 : 1 })}>
                      <Disc name={f.name} colorKey={person ?? String(f.id)} size={38} />
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{f.name}</Text>
                        <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{allOwed ? 'owes you' : allOwe ? 'you owe' : 'both ways'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 1 }}>
                        {lines.map((l) => (
                          <Text key={l.key} style={{ fontSize: 16, lineHeight: 21, fontWeight: '800', color: l.owed ? blocks.lime : t.c.alert.coralText }}>{l.text}</Text>
                        ))}
                      </View>
                    </Pressable>
                  );
                }) : <Text color="secondary" style={{ paddingVertical: 16, fontSize: 14 }}>{busy && !known ? 'Reading your Splitwise balances…' : 'No one owes anyone. All settled up.'}</Text>}
              </View>
              {settledCount > 0 && withBalance.length ? <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, paddingHorizontal: 4 }}>{`${settledCount} other friend${settledCount === 1 ? ' is' : 's are'} settled up.`}</Text> : null}
            </View>

            {groups.length ? (
              <View style={{ gap: 10 }}>
                <SectionHead title="Groups" sub="your balance in each" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {groups.map((g, i) => {
                    const bg = [blocks.sky, blocks.lilac, blocks.yellow, blocks.mint][i % 4]!;
                    const lines = amountLines(g.balance!);
                    return (
                      <View key={g.id} accessible accessibilityLabel={`${g.name}: ${lines.map((l) => (l.owed ? `you are owed ${l.text}` : `you owe ${l.text}`)).join(', ')}`} style={{ width: '47%', minHeight: 130, padding: 16, borderRadius: 24, backgroundColor: bg, justifyContent: 'space-between' }}>
                        <Text numberOfLines={2} style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, color: INK }}>{g.name.toUpperCase()}</Text>
                        <View style={{ gap: 2 }}>
                          {lines.map((l) => (
                            <View key={l.key}>
                              <Text style={{ fontSize: 13, lineHeight: 17, color: 'rgba(11,11,13,0.68)' }}>{l.owed ? 'you are owed' : 'you owe'}</Text>
                              <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 20, lineHeight: 25, fontWeight: '800', color: INK }}>{l.text}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Pressable accessibilityRole="button" accessibilityLabel="Set up Splitwise" onPress={() => router.push('/board/udhari/setup' as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.85 : 1 })}>
              <Icon name="settings" size={20} color={t.c.fg.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>Set up</Text>
                <Text color="secondary" numberOfLines={2} style={{ fontSize: 12, lineHeight: 16 }}>
                  {[`${linkedCount} of ${c.friends.length} people linked`, unmapped.length ? `${unmapped.map((g) => g.title).slice(0, 2).join(', ')} not going to a Splitwise group` : '', c.auto ? 'new shares go on their own' : 'new shares stay here'].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={t.c.fg.secondary} />
            </Pressable>
          </>
        )}
      </ScrollView>
      {signingIn ? <SignIn onDone={(ok) => { setSigningIn(false); if (ok) void sync(); }} /> : null}
    </View>
  );
}

/**
 * Udhari › Set up: link your People to your Splitwise friends, send a group's
 * shares to a Splitwise group, whether new shares go there on their own, and
 * sign out.
 */
export function SplitwiseSetupScreen(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottom = useBottomBarInset();
  const c = useLive((o) => swConfig(o), []);
  const people = useLive((o) => o.records.query('person', {}, { limit: 3000 }).map((p) => ({ id: p.id, title: p.title })), []);
  const groupIds = useLocalGroups();
  const { busy } = useSync();
  const [picking, setPicking] = useState<{ id: number; name: string } | null>(null);
  const [mapping, setMapping] = useState<string | null>(null);

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
    router.canGoBack() ? router.back() : router.replace('/board/udhari' as never);
  };

  const linkedTo = (swId: number) => Object.entries(c.people).find(([, v]) => v.sw === swId)?.[0] ?? null;
  const linkedIds = new Set(Object.keys(c.people));
  const free = people.filter((p) => !linkedIds.has(p.id));
  const rows = [...c.friends].sort((a, b) => Number(!!linkedTo(a.id)) - Number(!!linkedTo(b.id)) || a.name.localeCompare(b.name));

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: bottom, gap: 22 }}>
        <ScreenHeader title="Set up" subtitle="Udhari · Splitwise" onBack={() => (router.canGoBack() ? router.back() : router.replace('/board/udhari' as never))} />

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
                      {mine ? `${name} in People` : guess ? `looks like ${name} in People` : 'no one matched in People'}
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
        {c.me ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Sign out of Splitwise" onPress={signOut} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text color="secondary" style={{ fontSize: 13, lineHeight: 18, fontWeight: '700' }}>{`Sign out of Splitwise (${c.me.name})`}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <PickerSheet visible={!!picking} onClose={() => setPicking(null)} title={picking ? `Who is ${picking.name}?` : undefined} items={free.map((p) => ({ id: p.id, title: p.title }))} onSelect={(id) => { if (picking) linkPerson(os, id, picking); setPicking(null); }} onCreate={(name) => { if (!picking) return; const p = os.records.create({ object: 'person', title: name, data: {} }, 'user'); linkPerson(os, p.id, picking); setPicking(null); }} />
      <PickerSheet visible={!!mapping} onClose={() => setMapping(null)} title="Its shares go to" items={[{ id: '0', title: 'Just between you (no group)' }, ...c.swGroups.map((g) => ({ id: String(g.id), title: g.name }))]} selected={mapping && c.groups[mapping] ? [String(c.groups[mapping])] : ['0']} onSelect={(id) => { if (mapping) { const groups = { ...c.groups }; if (id === '0') delete groups[mapping]; else groups[mapping] = Number(id); setSwConfig(os, { groups }); } setMapping(null); }} />
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
