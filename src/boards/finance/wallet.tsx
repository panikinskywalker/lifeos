import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { CardWheel, Icon, IconButton, ScreenHeader, Text, useBottomBarInset } from '@ui/kit';
import { incomeInRange, monthRange, netWorth, spendInRange } from '@modules/finance/lib';
import { INSTRUMENTS, type AccountData } from '@modules/finance/types';
import { KIND_WORD, Rows, SectionHead, Spark, day } from './parts';
import { UploadSheet } from './uploadSheet';

const INK = '#0B0B0D';
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** Each kind of account has its own card colour. */
const CARD: Record<AccountData['kind'], string> = { bank: blocks.lime, credit: blocks.lilac, cash: blocks.orange, wallet: blocks.sky, loan: blocks.pink, investment: blocks.mint };
const CASHLIKE = new Set<AccountData['kind']>(['bank', 'cash', 'wallet']);

/** What is in your accounts and what the cards owe (docs/MODEL.md, Money redesign: Accounts and cards). */
export function walletTotals(nw: ReturnType<typeof netWorth>) {
  const inAccounts = nw.accounts.filter((r) => CASHLIKE.has(r.account.data.kind) && r.balance > 0 && r.account.data.includeInNetWorth !== false).reduce((n, r) => n + r.balance, 0);
  const owing = nw.accounts.filter((r) => r.account.data.kind === 'credit' && r.balance < 0);
  return { inAccounts, owe: owing.reduce((n, r) => n - r.balance, 0), cards: owing.length };
}

/** Accounts and cards (direction B): the totals, the accounts and cards as a stacked wallet, this month in and out, investments. */
export function WalletScreen(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = useBottomBarInset();
  const [uploading, setUploading] = useState(false);
  const m = monthRange(0);
  const data = useLive((o) => ({ nw: netWorth(o), spent: spendInRange(o, m.start, m.end), income: incomeInRange(o, m.start, m.end) }), [m.start]);
  const money = (n: number, c?: string) => `${n < 0 ? '−' : ''}${os.format.currency(Math.round(Math.abs(n)), c)}`;
  const totals = walletTotals(data.nw);
  // The bank account with the most in it is drawn in full on top; the rest tuck under it as their edges, cards first.
  const cards = data.nw.accounts.filter((r) => r.account.data.kind !== 'investment').sort((a, b) => Number(b.account.data.kind === 'bank') - Number(a.account.data.kind === 'bank') || b.balance - a.balance);
  const rest = cards.slice(1).sort((a, b) => Number(b.account.data.kind === 'credit') - Number(a.account.data.kind === 'credit') || Math.abs(b.balance) - Math.abs(a.balance));
  // The main account starts in the middle of the wheel, with cards on both sides.
  const half = Math.min(4, Math.floor(rest.length / 2));
  const above = rest.slice(0, half).reverse();
  const below = rest.slice(half);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/finance' as never));
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.c.bg.ground }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: bottom, gap: 24 }}>
      <ScreenHeader title="Accounts and cards" subtitle="Money" onBack={back} right={<><IconButton icon="file" filled accessibilityLabel="Upload a statement" onPress={() => setUploading(true)} /><IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} accessibilityLabel="Add an account" onPress={() => router.push('/entity/account/new' as never)} /></>} />

      {/* Bank money and card dues side by side: setting what a card owes moves the second (17 Nov, Rutvij). */}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text color="secondary" style={{ fontSize: 14, lineHeight: 19 }}>In your accounts</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -1.4, color: blocks.sky, fontVariant: ['tabular-nums'] }}>{money(totals.inAccounts)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text color="secondary" style={{ fontSize: 14, lineHeight: 19 }}>{`On your cards${totals.cards ? ` · ${totals.cards}` : ''}`}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -1.4, color: totals.owe ? blocks.orange : t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{money(totals.owe)}</Text>
          </View>
        </View>
        <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'] }}>{`net worth ${money(data.nw.total)}`}</Text>
      </View>

      {cards.length ? (
        <CardWheel
          initial={above.length}
          cards={[...above, cards[0]!, ...below].map(({ account: acc, balance }) => {
            const d = acc.data;
            const card = d.kind === 'credit';
            const late = card && !!d.statement && d.statement.dueOn < format(new Date(), 'yyyy-MM-dd');
            return {
              key: acc.id,
              alert: late,
              title: acc.title.replace(/\s*[•·]+\s*\d{3,4}$/, ''),
              corner: card ? 'You owe' : KIND_WORD[d.kind],
              amount: card ? money(Math.max(0, -balance), d.currency) : money(balance, d.currency),
              tail: d.last4 ? `•••• ${d.last4}` : undefined,
              use: d.useFor || undefined,
              note: typeof d.knownBalance === 'number' && d.knownOn ? `bank said, ${format(day(d.knownOn), 'd MMM')}` : card ? (late ? 'bill is late' : 'from its spends') : undefined,
            };
          })}
          onOpen={(id) => router.push(`/entity/account/${id}` as never)}
        />
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Add an account" onPress={() => router.push('/entity/account/new' as never)} style={{ height: 120, borderRadius: 28, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.line, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="label">Add an account or card</Text>
        </Pressable>
      )}
      <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: -12 }}>Scroll the cards; tap the front one to open it</Text>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <MoneyTile icon="download" label="came in" value={money(data.income)} onPress={() => router.push('/module/finance/reports' as never)} />
        <MoneyTile icon="arrow-up" label="spent, your share" value={money(data.spent)} onPress={() => router.push('/module/finance/spend' as never)} />
      </View>

      {data.nw.holdings.length ? <Investments holdings={data.nw.holdings} /> : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Upload a statement or screenshot to update balances and funds" onPress={() => setUploading(true)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.line, opacity: pressed ? 0.8 : 1 })}>
        <Icon name="file" size={20} color={t.c.accent.gold} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>Upload a statement</Text>
          <Text color="secondary" style={{ fontSize: 13, lineHeight: 17 }}>A PDF or screenshot updates balances, card bills and funds</Text>
        </View>
      </Pressable>
      <UploadSheet visible={uploading} onClose={() => setUploading(false)} />

      <Text color="secondary" style={{ fontSize: 13, lineHeight: 18, paddingHorizontal: 4 }}>Balances follow the bank: each text that states one sets it. Cash taken from an ATM lands in Cash.</Text>
    </ScrollView>
  );
}

/** One account as a card: its colour by kind, name and last digits, the balance (what you owe on a card) and where that figure came from. */
/** An account drawn as its card, on its own page (direction A). */
export function AccountCard({ account, balance, money }: { account: ObjectRecord<AccountData>; balance: number; money: (n: number, c?: string) => string }) {
  return <WalletCard account={account} balance={balance} front first money={money} still />;
}

function WalletCard({ account: a, balance, front, first, money, still }: { account: ObjectRecord<AccountData>; balance: number; front: boolean; first: boolean; money: (n: number, c?: string) => string; still?: boolean }) {
  const router = useRouter();
  const d = a.data;
  const card = d.kind === 'credit';
  const late = card && !!d.statement && d.statement.dueOn < format(new Date(), 'yyyy-MM-dd');
  const figure = card ? money(Math.max(0, -balance), d.currency) : money(balance, d.currency);
  const source = typeof d.knownBalance === 'number' && d.knownOn ? `bank said, ${format(day(d.knownOn), 'd MMM')}` : card ? 'from its spends' : 'from opening balance';
  const bg = late ? '#FF8A7A' : CARD[d.kind] ?? blocks.sky;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a.title}${d.last4 ? ` ending ${d.last4}` : ''}, ${card ? 'you owe' : 'balance'} ${figure}${late ? ', bill late' : ''}`}
      disabled={still}
      onPress={() => router.push(`/entity/account/${a.id}` as never)}
      style={({ pressed }) => ({ height: front ? 196 : 72, marginTop: first ? 0 : -24, borderRadius: 28, backgroundColor: bg, paddingHorizontal: 20, paddingTop: front ? 16 : 34, paddingBottom: front ? 18 : 0, justifyContent: 'space-between', overflow: 'hidden', opacity: pressed ? 0.92 : 1 })}
    >
      <View pointerEvents="none" style={{ position: 'absolute', right: -50, bottom: -80, width: 220, height: 220, borderRadius: 110, borderWidth: 28, borderColor: 'rgba(11,11,13,0.06)' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '700', color: INK }}>{a.title}</Text>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: INK, letterSpacing: 1, fontVariant: ['tabular-nums'] }}>{front ? (d.last4 ? `•••• ${d.last4}` : KIND_WORD[d.kind]) : `${card ? 'owe ' : ''}${figure}`}</Text>
      </View>
      {front ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', color: 'rgba(11,11,13,0.68)' }}>{card ? 'You owe' : 'Balance'}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 32, lineHeight: 34, fontWeight: '700', letterSpacing: -1, color: INK, fontVariant: ['tabular-nums'] }}>{figure}</Text>
          </View>
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: 'rgba(11,11,13,0.68)', textAlign: 'right' }}>{source}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function MoneyTile({ icon, label, value, onPress }: { icon: string; label: string; value: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} onPress={onPress} style={({ pressed }) => ({ flex: 1, minWidth: 0, padding: 16, borderRadius: 24, backgroundColor: t.c.fg.primary, gap: 18, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(11,11,13,0.3)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={14} color={INK} />
      </View>
      <View style={{ gap: 2 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.6, color: INK, fontVariant: ['tabular-nums'] }}>{value}</Text>
        <Text style={{ fontSize: 13, lineHeight: 17, color: 'rgba(11,11,13,0.68)' }}>{label}</Text>
      </View>
    </Pressable>
  );
}

function Investments({ holdings }: { holdings: ReturnType<typeof netWorth>['holdings'] }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const money = os.format.currency;
  const top = [...holdings].sort((a, b) => b.value - a.value);
  const history = useLive((o) => Object.fromEntries(top.slice(0, 4).map((h) => [h.investment.id, o.cycles.readings(h.investment.id, 'value', 30).map((r) => r.value).reverse()])), [top.map((h) => h.investment.id).join()]);
  const sips = holdings.filter((h) => h.investment.data.sip);
  const total = holdings.reduce((n, h) => n + h.value, 0);
  const sipLine = sips.length ? `SIP${sips.length === 1 ? '' : 's'} of ${money(sips.reduce((n, h) => n + (h.investment.data.sip ?? 0), 0))} a month` : null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Investments" sub={[`${money(Math.round(total))} today`, sipLine].filter(Boolean).join(' · ')} action={`All ${holdings.length}`} chevron onAction={() => router.push('/entity/investment' as never)} />
      <Rows padding={14} gap={8}>
        {top.slice(0, 4).map(({ investment: i, value }) => {
          const d = i.data;
          const gain = d.currentValue != null && d.invested ? (d.currentValue - d.invested) / d.invested : null;
          const line = d.sip ? `SIP ${money(d.sip, d.currency)}${d.sipDay ? ` on the ${ordinal(d.sipDay)}` : ' a month'}` : d.maturesOn ? `Matures ${format(day(d.maturesOn), 'EEE d MMM yyyy')}` : `${INSTRUMENTS.find((x) => x.value === d.instrument)?.label ?? 'Holding'} · ${money(d.invested, d.currency)} in`;
          const spark = history[i.id] ?? [];
          return (
            <Pressable key={i.id} accessibilityRole="button" accessibilityLabel={`${i.title}, ${money(value, d.currency)}`} onPress={() => router.push(`/entity/investment/${i.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="rowTitle" numberOfLines={1}>{i.title}</Text>
                <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{line}</Text>
              </View>
              {spark.length > 1 ? <Spark values={spark} color={gain != null && gain < 0 ? t.c.alert.coralText : t.c.accent.gold} /> : null}
              <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(value, d.currency)}</Text>
                <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', fontVariant: ['tabular-nums'], color: gain == null ? t.c.fg.secondary : gain >= 0 ? t.c.accent.gold : t.c.alert.coralText }}>{gain == null ? 'no value yet' : `${gain >= 0 ? '+' : '−'}${Math.abs(gain * 100).toFixed(1)}%`}</Text>
              </View>
            </Pressable>
          );
        })}
      </Rows>
    </View>
  );
}
