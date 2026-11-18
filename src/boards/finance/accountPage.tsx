import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Icon, NumberField, SelectField, Sheet, Text, TextField, TrackColumns, useToast } from '@ui/kit';
import { ASK_AGENT_MODEL, fillCardUses, unnamedCard } from '@modules/finance/askAgent';
import { blocks } from '@ui/theme/tokens';
import { accountBalance, accountFlows, cardUses, mergeAccount, pocketBalances, setBalance, setPockets } from '@modules/finance/lib';
import { EntityPicker } from '@ui/components/fields';
import { FX_CURRENCIES } from '@modules/finance/filing/fx';
import type { AccountData, TransactionData } from '@modules/finance/types';
import { FieldRow, FieldValue, Hairline, KIND_WORD, Metric, Quick, RecordBar, RecordExtras, Rows, SectionHead, StatusPill, TxRow, day, kindWord, relDay, shortMoney } from './parts';
import { AccountCard } from './wallet';

/** An Account's page (docs/MODEL.md, Money pages with no artboard): who it is, three numbers, add or move money, money out by month, its payments, its Fields. Built from the kit. */
export function AccountPage({ entity, ctx, controls, say }: { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: React.ReactNode }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = useTheme();
  const router = useRouter();
  const a = entity as ObjectRecord<AccountData>;
  const d = a.data;
  const money = (n: number) => `${n < 0 ? '−' : ''}${ctx.format.currency(Math.abs(n), d.currency)}`;
  const balance = useLive((o) => accountBalance(o, a), [a.id, a.version]);
  const flows = useLive((o) => accountFlows(o, a.id, 6), [a.id, a.version]);
  const txns = useLive((o) => o.records.query<TransactionData>('transaction', { filter: { or: [{ field: 'data.accountId', op: 'eq', value: a.id }, { field: 'data.toAccountId', op: 'eq', value: a.id }] }, sort: [{ field: 'data.date', dir: 'desc' }, { field: 'createdAt', dir: 'desc' }] }, { limit: 10 }), [a.id]);
  const institution = useLive((o) => (d.institutionId ? (o.records.ref(d.institutionId)?.title ?? null) : (d.institution ?? null)), [d.institutionId, d.institution]);

  const now = flows[flows.length - 1];
  const today = format(new Date(), 'yyyy-MM-dd');
  const card = d.kind === 'credit';
  const owed = Math.max(0, -balance);
  const st = card ? d.statement : undefined;
  const late = !!st && st.dueOn < today;
  const monthName = format(new Date(), 'MMM').toUpperCase();
  const addTx = (kind: string) => router.push({ pathname: '/entity/[type]/new', params: { type: 'transaction', accountId: a.id, kind } } as never);
  // Set balance (docs/MODEL.md, Balances follow the bank): what the bank shows becomes the start; Undo puts the old one back.
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const [typed, setTyped] = useState<number | undefined>(undefined);
  // Naming a card named only by its bank: the name is kept (Undo), then Ask Money fills its uses from the product.
  const uses = cardUses(d.useFor, d.kind);
  const [product, setProduct] = useState('');
  const [working, setWorking] = useState(false);
  const nameIt = () => {
    const before = a.title;
    ctx.records.update(a.id, { title: product.trim() }, 'user');
    setProduct('');
    toast.show({ message: `Named ${product.trim()}`, icon: 'check', undo: () => void ctx.records.update(a.id, { title: before }, 'user') });
    void (async () => {
      const key = await ctx.device?.claudeKey?.().catch(() => null);
      if (!key) return;
      setWorking(true);
      const n = await fillCardUses(ctx, { apiKey: key }).catch(() => 0);
      ctx.brain.sent.add({ at: Date.now(), pass: 'ask', why: 'Use it for, on a card you named', model: ASK_AGENT_MODEL, lines: ['Money agent · each card’s bank and spend by category and shop, rounded; no account digits'], records: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, outcome: n ? 'ok' : 'error', error: null });
      setWorking(false);
    })();
  };
  // A forex card holds several currencies: Set balance asks for each (17 Nov, Rutvij).
  const forex = d.kind === 'forex';
  const pockets = useLive((o) => (forex ? pocketBalances(o, a) : []), [a.id, a.version, forex]);
  const [rows, setRows] = useState<Array<{ currency?: string; amount?: number }>>([]);
  const [pocketing, setPocketing] = useState(false);
  const openSet = () => {
    if (!forex) return setAsk(true);
    setRows(pockets.length ? pockets.map((p) => ({ currency: p.currency, amount: p.amount })) : [{ currency: 'USD' }]);
    setPocketing(true);
  };
  const savePockets = () => {
    const kept = rows.filter((r): r is { currency: string; amount: number } => !!r.currency && (r.amount ?? 0) > 0);
    const before = setPockets(ctx, a.id, kept);
    setPocketing(false);
    toast.show({ message: `On the card: ${kept.map((r) => ctx.format.currency(r.amount, r.currency)).join(' · ') || 'nothing'}`, icon: 'check', undo: () => void ctx.records.update(a.id, { data: { pockets: before } }, 'user') });
  };
  // A copy of another account (two HSBC accounts that are one): merge it into the real one, with Undo.
  const [merging, setMerging] = useState(false);
  const mergeInto = (intoId: string) => {
    setMerging(false);
    const into = ctx.records.get(intoId)?.title ?? 'that account';
    const go = () => {
      const undo = mergeAccount(ctx, a.id, intoId);
      toast.show({ message: `Merged into ${into}`, icon: 'check', undo });
      router.back();
    };
    if (Platform.OS === 'web') return go();
    Alert.alert(`Merge into ${into}?`, `${a.title}'s payments move to ${into}, which keeps its own balance and learns these last digits. ${a.title} goes.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Merge', onPress: go }]);
  };
  const saveBalance = () => {
    if (typed == null) return;
    // A card's figure is what you owe: its balance is that, below zero.
    const before = setBalance(ctx, a.id, card ? -Math.abs(typed) : typed);
    setAsk(false);
    setTyped(undefined);
    toast.show({ message: card ? `Owed set to ${money(Math.abs(typed))}` : `Balance set to ${money(typed)}`, icon: 'check', undo: () => void ctx.records.update(a.id, { data: before }, 'user') });
  };

  return (
    <View style={{ paddingHorizontal: t.layout.gutter, gap: 24 }}>
      {controls ? <RecordBar label="Account" controls={controls} /> : null}

      <View style={{ gap: 14 }}>
        <AccountCard account={a} balance={balance} money={money} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill label={[institution ?? KIND_WORD[d.kind], d.last4 ? `··${d.last4}` : null].filter(Boolean).join(' · ')} lime />
          <StatusPill label={d.includeInNetWorth === false ? 'Not in net worth' : 'In net worth'} />
          {d.currency && d.currency !== 'INR' ? <StatusPill label={d.currency} /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 14, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.c.line }}>
          {card ? (
            <>
              <Metric label="BILL" value={st ? money(st.total) : '-'} line={st ? `${late ? 'was due' : 'due'} ${format(day(st.dueOn), 'EEE d MMM')}` : 'no statement yet'} color={late ? t.c.alert.coralText : undefined} />
              <Metric label="LIMIT USED" value={d.creditLimit ? `${Math.round((owed / d.creditLimit) * 100)}%` : '-'} line={d.creditLimit ? `of ${shortMoney(ctx, d.creditLimit)}` : 'no limit set'} />
            </>
          ) : (
            <>
              <Metric label={`IN · ${monthName}`} value={shortMoney(ctx, now?.in ?? 0)} />
              <Metric label={`OUT · ${monthName}`} value={shortMoney(ctx, now?.out ?? 0)} />
            </>
          )}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Quick label="Add" icon="plus" onPress={() => addTx('expense')} />
        <Quick label="Transfer" icon="arrow.up.arrow.down" onPress={() => addTx('transfer')} />
        <Quick label={card ? 'Set owed' : 'Set balance'} icon="check" onPress={openSet} />
        <Quick label="Edit" icon="edit" onPress={() => controls?.edit()} />
      </View>

      {/* What the card is for. A card named only by its bank asks which card it is first: uses come from the product, never a guess (17 Nov, Rutvij). */}
      {card && !uses.length && unnamedCard(a) ? (
        <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="sparkle" size={22} color={t.c.accent.gold} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700' }}>{`Which ${institution ?? 'card'} card is this?`}</Text>
              <Text variant="caption" color="secondary">Its name tells Ask Money its rewards, so it can say what to use it for.</Text>
            </View>
          </View>
          <TextField label="Card name" value={product} onChange={setProduct} placeholder="Amazon Pay, Coral, Forex…" />
          <Button title="Save" onPress={nameIt} disabled={product.trim().length < 2} block />
        </View>
      ) : uses.length || card ? (
        <Pressable accessibilityRole="button" accessibilityLabel={uses.length ? `Use it for ${uses.join(', ')}. Edit` : 'What is this card best for? Ask Money'} disabled={working} onPress={() => (uses.length ? controls?.edit() : router.push({ pathname: '/module/[id]/[page]', params: { id: 'finance', page: 'ask', card: a.id } } as never))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 24, backgroundColor: uses.length ? blocks.lime : t.c.bg.tile, opacity: pressed ? 0.85 : 1 })}>
          {working ? <ActivityIndicator color={t.c.accent.gold} /> : <Icon name="sparkle" size={22} color={uses.length ? '#0B0B0D' : t.c.accent.gold} />}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, color: uses.length ? 'rgba(11,11,13,0.62)' : t.c.fg.secondary }}>USE IT FOR</Text>
            {uses.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
                {uses.map((u) => (
                  <Text key={u} style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: blocks.lime, backgroundColor: '#0B0B0D', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' }}>{u}</Text>
                ))}
              </View>
            ) : (
              <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', color: t.c.fg.primary }}>{working ? 'Ask Money is looking up its rewards' : 'Tap and Ask Money works it out for this card'}</Text>
            )}
          </View>
          {working ? null : <Icon name={uses.length ? 'edit' : 'chevron-right'} size={16} color={uses.length ? '#0B0B0D' : t.c.fg.secondary} />}
        </Pressable>
      ) : null}
      {forex && pockets.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="On the card" sub={`${pockets.length} ${pockets.length === 1 ? 'currency' : 'currencies'}`} action="Set" lime onAction={openSet} />
          <View style={{ paddingVertical: 4, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
            {pockets.map((p, i) => (
              <View key={p.currency} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderTopWidth: i ? 1 : 0, borderColor: t.c.line }}>
                <Text style={{ width: 52, fontSize: 13, lineHeight: 17, fontWeight: '700', color: t.c.fg.secondary }}>{p.currency}</Text>
                <Text style={{ flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{ctx.format.currency(p.amount, p.currency)}</Text>
                <Text color="secondary" style={{ fontSize: 14, lineHeight: 19, fontVariant: ['tabular-nums'] }}>{p.inr == null ? 'no rate yet' : `≈ ${ctx.format.currency(Math.round(p.inr))}`}</Text>
              </View>
            ))}
          </View>
          <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>Spends abroad in a currency come off it. Rupees at today’s rate.</Text>
        </View>
      ) : null}

      <Sheet visible={pocketing} onClose={() => setPocketing(false)} title="What is on the card?" footer={<Button title="Save" onPress={savePockets} disabled={!rows.some((r) => r.currency && (r.amount ?? 0) > 0)} />}>
        <View style={{ gap: 12 }}>
          {rows.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <SelectField label={i ? undefined : 'Currency'} options={FX_CURRENCIES.map((c) => ({ value: c, label: c }))} value={r.currency} onChange={(v) => setRows(rows.map((x, k) => (k === i ? { ...x, currency: v } : x)))} />
              </View>
              <View style={{ flex: 1 }}>
                <NumberField label={i ? undefined : 'Amount'} value={r.amount} onChange={(v) => setRows(rows.map((x, k) => (k === i ? { ...x, amount: v } : x)))} />
              </View>
            </View>
          ))}
          <Button title="Add a currency" icon="plus" variant="secondary" size="sm" onPress={() => setRows([...rows, { currency: FX_CURRENCIES.find((c) => !rows.some((r) => r.currency === c)) }])} />
          <Text variant="caption" color="secondary">What the card app shows for each currency. Spends abroad after this come off it.</Text>
        </View>
      </Sheet>

      <Sheet visible={ask} onClose={() => setAsk(false)} title={card ? 'What does the card app say you owe?' : 'What does the bank show?'} footer={<Button title={card ? 'Set owed' : 'Set balance'} onPress={saveBalance} disabled={typed == null} />}>
        <View style={{ gap: 10 }}>
          <NumberField label={card ? 'Owed now' : 'Balance now'} unit="₹" value={typed} onChange={setTyped} autoFocus />
          <Text variant="caption" color="secondary">This becomes the figure from now on; only payments after it are added. The app shows {card ? money(owed) : money(balance)}.</Text>
        </View>
      </Sheet>

      {flows.some((f) => f.out > 0) ? (
        <TrackColumns label="Money out" period="last 6 months" value={shortMoney(ctx, now?.out ?? 0)} values={flows.map((f) => f.out)} labels={flows.map((f) => f.label)} today={flows.length - 1} axis={(n) => shortMoney(ctx, n)} />
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHead title="Payments" sub={txns.length ? `latest ${txns.length}` : null} action="Add" lime onAction={() => addTx('expense')} />
        {txns.length ? (
          <Rows>
            {txns.map((x) => (
              <TxRow key={x.id} tx={x} line={[x.data.toAccountId === a.id && x.data.kind === 'transfer' ? 'Transfer in' : kindWord(x.data), relDay(x.data.date)].join(' · ')} />
            ))}
          </Rows>
        ) : (
          <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>No payments on this account yet. Bank texts that name its last digits land here.</Text>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SectionHead title="Fields" />
        <View style={{ paddingVertical: 6, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          <FieldRow label="Type"><FieldValue>{KIND_WORD[d.kind]}</FieldValue></FieldRow>
          {institution ? (<><Hairline /><FieldRow label="Bank or issuer"><FieldValue>{institution}</FieldValue></FieldRow></>) : null}
          {d.last4 ? (<><Hairline /><FieldRow label="Last 4 digits"><FieldValue>{d.last4}</FieldValue></FieldRow></>) : null}
          <Hairline />
          <FieldRow label="Opening balance"><FieldValue>{money(d.openingBalance ?? 0)}</FieldValue></FieldRow>
          {card && d.creditLimit ? (<><Hairline /><FieldRow label="Credit limit"><FieldValue>{money(d.creditLimit)}</FieldValue></FieldRow></>) : null}
          {d.useFor ? (<><Hairline /><FieldRow label="Use it for"><FieldValue>{d.useFor}</FieldValue></FieldRow></>) : null}
          <Hairline />
          <FieldRow label="In net worth"><FieldValue>{d.includeInNetWorth === false ? 'No' : 'Yes'}</FieldValue></FieldRow>
        </View>
      </View>

      <Button title="This is a copy of another account" icon="link" variant="secondary" size="sm" onPress={() => setMerging(true)} />
      <EntityPicker visible={merging} onClose={() => setMerging(false)} types={['account']} selected={[]} exclude={[a.id]} title="Which account is it a copy of?" onSelect={mergeInto} />

      <RecordExtras entity={a} module="finance" />

      {say}
    </View>
  );
}
