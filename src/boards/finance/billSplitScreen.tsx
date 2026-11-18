import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LifeOSContext } from '@core/registry/context';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Button, PickerSheet, ScreenHeader, Sheet, StackedBar, Stepper, Text, useBottomBarInset, useToast } from '@ui/kit';
import { EntityPicker } from '@ui/components/fields';
import { splitBill, type BillLine, type LinePortions } from '@modules/finance/billSplit';
import { applySplit, type Party } from '@modules/finance/split';
import { saveQuick, type QuickPayment } from '@modules/finance/quickAdd';
import { Disc } from './parts';

const INK = '#0B0B0D';
const COLORS = [blocks.lime, '#FF8A6A', blocks.pink, blocks.yellow, blocks.sky, blocks.lilac, blocks.mint];

/**
 * Split a scanned bill by item (NR-Money-BillSplit): who had what. Tap a face
 * on a line to take them off it; hold a line for portions. A line no one took
 * is shared by everyone; tax and service go in proportion. Save files the
 * payment with each person's share (and so their Debts, and Splitwise).
 */
export function BillSplitScreen({ params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottom = useBottomBarInset();
  const bill = useMemo(() => {
    try {
      return JSON.parse(params.bill ?? '') as { p: QuickPayment; account: string | 'cash' | null };
    } catch {
      return null;
    }
  }, [params.bill]);
  const [people, setPeople] = useState<string[]>([]);
  const [portions, setPortions] = useState<LinePortions>([]);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [payer, setPayer] = useState<Party>(bill?.account === null ? '' : 'me');
  const [pickingPayer, setPickingPayer] = useState(false);
  const names = useLive((o) => Object.fromEntries(people.map((id) => [id, o.records.get(id)?.title ?? 'Someone'])), [people.join()]);

  if (!bill) return <View style={{ flex: 1, backgroundColor: t.c.bg.ground }} />;
  const p = bill.p;
  const lines: BillLine[] = p.lines?.length ? p.lines : [{ name: p.payee || 'The bill', qty: 1, total: p.amount }];
  const everyone: Party[] = ['me', ...people];
  const color = (party: Party) => COLORS[everyone.indexOf(party) % COLORS.length]!;
  const label = (party: Party) => (party === 'me' ? 'You' : names[party] ?? 'Someone');
  const shares = splitBill(lines, portions, everyone, p.amount);
  const shareOf = (party: Party) => shares.find((s) => s.party === party)?.amount ?? 0;
  const money = (n: number) => os.format.currency(n);
  const payerId = payer || 'me';
  const toYou = payerId === 'me' ? shares.filter((s) => s.party !== 'me').reduce((n, s) => n + s.amount, 0) : 0;

  // A line's portions: explicit, or everyone at 1 until you change something.
  const linePortions = (i: number) => portions[i] ?? Object.fromEntries(everyone.map((x) => [x, 1]));
  const setLine = (i: number, next: Partial<Record<Party, number>>) => {
    const copy = [...portions];
    copy[i] = next;
    setPortions(copy);
  };
  const toggle = (i: number, party: Party) => {
    const cur = { ...linePortions(i) };
    cur[party] = (cur[party] ?? 0) > 0 ? 0 : 1;
    setLine(i, cur);
  };
  const what = (party: Party) =>
    lines
      .filter((_, i) => (linePortions(i)[party] ?? 0) > 0 || !Object.values(linePortions(i)).some((n) => (n ?? 0) > 0))
      .map((l) => l.name.split(' ').slice(0, 2).join(' ').toLowerCase())
      .slice(0, 3)
      .join(' · ');

  const save = () => {
    const { id, undo } = saveQuick(os, p, bill.account);
    applySplit(os, id, { payer: payerId, method: 'exact', parts: shares.map((s) => ({ party: s.party, value: s.amount })) });
    toast.show({ message: payerId === 'me' ? `Saved · ${money(toYou)} to you` : `Saved · you owe ${label(payerId)} ${money(shareOf('me'))}`, icon: 'check', undo });
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: bottom + 24, gap: 18 }}>
        <ScreenHeader title="Split the bill" subtitle="Money" onBack={() => router.back()} />

        <View style={{ padding: 20, borderRadius: 32, backgroundColor: blocks.yellow, gap: 10, overflow: 'hidden' }}>
          <View pointerEvents="none" style={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: 90, borderWidth: 24, borderColor: 'rgba(224,138,30,0.25)' }} />
          <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, color: INK }}>{`${(p.payee || 'A bill').toUpperCase()} · ${p.date}`}</Text>
          <Text style={{ fontSize: 46, lineHeight: 50, fontWeight: '700', letterSpacing: -1.8, color: INK, fontVariant: ['tabular-nums'] }}>{money(p.amount)}</Text>
          <Text style={{ fontSize: 13, lineHeight: 18, color: 'rgba(11,11,13,0.72)' }}>{[`${lines.length} item${lines.length === 1 ? '' : 's'} read from the bill`, p.tax ? `tax ${money(p.tax)}` : null, p.service ? `service ${money(p.service)}` : null].filter(Boolean).join(' · ')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row' }}>
              {everyone.map((x, k) => (
                <View key={x} style={{ marginLeft: k ? -9 : 0, borderRadius: 18, borderWidth: 2, borderColor: blocks.yellow }}>
                  <Disc name={label(x)} colorKey={x} size={32} />
                </View>
              ))}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Add someone" onPress={() => setAdding(true)} style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(11,11,13,0.12)', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: INK }}>+ Add</Text>
            </Pressable>
          </View>
        </View>

        {people.length ? <Text color="secondary" style={{ fontSize: 13, lineHeight: 18, paddingHorizontal: 4 }}>Tap a face on an item to take them off it. Hold an item for portions.</Text> : <Text color="secondary" style={{ fontSize: 13, lineHeight: 18, paddingHorizontal: 4 }}>Add who was there, then say who had what.</Text>}

        {lines.map((line, i) => {
          const lp = linePortions(i);
          const any = Object.values(lp).some((n) => (n ?? 0) > 0);
          const out = everyone.filter((x) => !((lp[x] ?? 0) > 0));
          return (
            <Pressable key={`${line.name}${i}`} accessibilityRole="button" accessibilityLabel={`${line.name}, ${money(line.total)}. Hold for portions`} onLongPress={() => setOpen(i)} style={{ padding: 14, borderRadius: 22, backgroundColor: t.c.bg.tile, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700' }}>{line.name}</Text>
                  <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{[line.qty > 1 ? `${line.qty} × ${money(line.total / line.qty)}` : null, !any ? 'no one yet · shared by everyone' : out.length && people.length ? `${out.map(label).join(', ')} not on it` : null].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(line.total)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {everyone.map((x) => {
                  const n = lp[x] ?? 0;
                  return (
                    <Pressable key={x} accessibilityRole="checkbox" accessibilityState={{ checked: n > 0 }} accessibilityLabel={`${label(x)} had ${line.name}`} onPress={() => toggle(i, x)} hitSlop={4} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: n > 0 ? color(x) : 'transparent', borderWidth: n > 0 ? 0 : 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.25)' }}>
                      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '800', color: n > 0 ? INK : t.c.fg.secondary }}>{label(x).slice(0, 1)}</Text>
                      {n > 1 ? <View style={{ position: 'absolute', right: -5, top: -5, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#F5F5F7', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 10, lineHeight: 13, fontWeight: '800', color: INK }}>{`×${n}`}</Text></View> : null}
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          );
        })}

        {p.tax || p.service ? (
          <View style={{ padding: 14, borderRadius: 22, backgroundColor: t.c.bg.tile, gap: 6 }}>
            {p.tax ? <Row left="Tax" right={money(p.tax)} /> : null}
            {p.service ? <Row left="Service charge" right={money(p.service)} /> : null}
            <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>shared in proportion to what each had</Text>
          </View>
        ) : null}

        <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 14 }}>
          <StackedBar parts={shares.map((s) => ({ value: s.amount, color: color(s.party), label: label(s.party) }))} />
          {everyone.map((x) => (
            <View key={x} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Disc name={label(x)} colorKey={x} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{label(x)}</Text>
                <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{what(x)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(shareOf(x))}</Text>
                <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', color: x === 'me' || x === payerId ? t.c.fg.secondary : t.c.accent.gold }}>{x === 'me' ? 'your share' : x === payerId ? 'paid' : payerId === 'me' ? 'owes you' : `owes ${label(payerId)}`}</Text>
              </View>
            </View>
          ))}
          <View style={{ flexDirection: 'row', paddingTop: 8, borderTopWidth: 1, borderColor: t.c.line }}>
            <Text color="secondary" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>Adds up to the bill</Text>
            <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '700' }}>{`${money(shares.reduce((n, s) => n + s.amount, 0))} ✓`}</Text>
          </View>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel={`Paid by ${label(payerId)}. Change`} onPress={() => setPickingPayer(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>Paid by</Text>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700' }}>{`${label(payerId)} ▾`}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title="Equal split" variant="secondary" onPress={() => setPortions([])} block /></View>
          <View style={{ flex: 1.4 }}><Button title={payerId === 'me' ? `Save · ${money(toYou)} to you` : 'Save'} onPress={save} disabled={!people.length} block /></View>
        </View>
      </ScrollView>

      <EntityPicker visible={adding} onClose={() => setAdding(false)} types={['person']} selected={people} exclude={people} title="Who was there?" onSelect={(id) => setPeople((xs) => [...new Set([...xs, id])])} />
      <PickerSheet visible={pickingPayer} onClose={() => setPickingPayer(false)} title="Who paid?" items={everyone.map((x) => ({ id: x, title: label(x) }))} selected={[payerId]} onSelect={(id) => { setPayer(id); setPickingPayer(false); }} />
      <Sheet visible={open != null} onClose={() => setOpen(null)} title={open != null ? lines[open]!.name : ''}>
        {open != null ? (
          <View style={{ gap: 6 }}>
            <Text color="secondary" style={{ fontSize: 13, lineHeight: 18 }}>{`Portions: who had how much of ${money(lines[open]!.total)}.`}</Text>
            {everyone.map((x) => {
              const lp = linePortions(open);
              const total = Object.values(lp).reduce<number>((n, v) => n + (v ?? 0), 0);
              const each = total ? (lines[open]!.total * (lp[x] ?? 0)) / total : 0;
              return (
                <View key={x} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 }}>
                  <Disc name={label(x)} colorKey={x} size={30} />
                  <Text style={{ flex: 1, fontSize: 15, lineHeight: 20 }}>{label(x)}</Text>
                  <Text color="secondary" style={{ width: 72, textAlign: 'right', fontSize: 13, lineHeight: 18 }}>{money(Math.round(each))}</Text>
                  <Stepper value={lp[x] ?? 0} min={0} max={20} onChange={(v) => setLine(open, { ...lp, [x]: v })} />
                </View>
              );
            })}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 19 }}>{left}</Text>
      <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: '700' }}>{right}</Text>
    </View>
  );
}
