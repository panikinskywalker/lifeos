import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { ZodError } from 'zod';
import type { ObjectRecord } from '@core/domain/types';
import type { RecordFormProps } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { DateField, Icon, IconButton, PickerSheet, Text, useToast } from '@ui/kit';
import { EntityPicker, FieldInput } from '@ui/components/fields';
import { addCategory } from '@modules/finance/categories';
import { CATEGORIES, type AccountData, type TransactionData } from '@modules/finance/types';
import { Caps, Disc, Hairline, Seg, accountIcon, catColor } from './parts';

const KINDS: Array<{ value: TransactionData['kind']; label: string }> = [{ value: 'expense', label: 'Spent' }, { value: 'income', label: 'Received' }, { value: 'transfer', label: 'Transfer' }, { value: 'investment', label: 'Investment' }];
const QUICK_CATEGORIES = ['food', 'groceries', 'transport', 'shopping', 'utilities', 'subscriptions'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD'];
const LABEL: TextStyle = { fontSize: 13, lineHeight: 17, fontWeight: '600', paddingHorizontal: 4 };
const INPUT: TextStyle = { fontSize: 16, lineHeight: 21, fontFamily: fontForWeight(500) };

function Labelled({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ gap: 8, minWidth: 0 }, style]}>
      <Text color="secondary" style={LABEL}>{label}</Text>
      {children}
    </View>
  );
}

/** A row in the Links card: its name, and what's linked or a lime Add. */
function LinkRow({ label, line, value, onPress }: { label: string; line?: string; value: string | null; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={value ? `${label}: ${value}` : `Add ${label}`} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{label}</Text>
        {line ? <Text color="secondary" style={{ fontSize: 12, lineHeight: 15 }}>{line}</Text> : null}
      </View>
      {value ? (
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{value}</Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="plus" size={14} color={t.c.accent.gold} />
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.accent.gold }}>Add</Text>
        </View>
      )}
    </Pressable>
  );
}

type Picking = null | 'payee' | 'account' | 'toAccountId' | 'tripId' | 'projectId' | 'investmentId' | 'personIds' | 'category' | 'status' | 'currency';
const SINGLE_LINKS: Array<{ key: 'tripId' | 'projectId' | 'investmentId'; label: string; object: string }> = [{ key: 'tripId', label: 'Trip', object: 'trip' }, { key: 'projectId', label: 'Project', object: 'project' }, { key: 'investmentId', label: 'Investment', object: 'investment' }];

/** The transaction form (NR-Money-Form): kind, amount, who, category, date and status, account, then details and links. New and Edit. */
export function TransactionForm({ id, initial, onSaved, linkTo }: RecordFormProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const def = os.registry.object('transaction');
  const existing = useMemo(() => (id ? os.records.get<TransactionData>(id) : null), [id, os]);
  // A payee can live on the link alone (filed from a message), so the link is read as well as the Field.
  const linkedPayee = useMemo(() => (id ? (os.links.forEntity(id, 'payee')[0]?.other.id ?? null) : null), [id, os]);
  const [d, setD] = useState<Partial<TransactionData> & Record<string, unknown>>(() => ({ kind: 'expense', date: format(new Date(), 'yyyy-MM-dd'), ...(existing?.data ?? {}), ...(initial ?? {}) }));
  const [payee, setPayee] = useState<string | null>((d.payeeId as string | undefined) ?? linkedPayee);
  const [status, setStatus] = useState<string>(existing?.status ?? def.statuses?.[0]?.value ?? 'cleared');
  const [amount, setAmount] = useState(d.amount != null ? String(d.amount) : '');
  const [amountError, setAmountError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState(!id);
  const [picking, setPicking] = useState<Picking>(null);
  const set = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }));
  const close = () => (router.canGoBack() ? router.back() : router.replace('/entity/transaction' as never));

  const accounts = useLive((o) => o.records.query<AccountData>('account', {}, { limit: 500 }), []);
  const customFields = useLive((o) => o.customFields.forType('transaction'), []);
  const payeeRef = useLive((o) => (payee ? o.records.ref(payee) : null), [payee]);
  const title = (rid: string | undefined) => (rid ? (os.records.ref(rid)?.title ?? null) : null);
  const account = accounts.find((a) => a.id === d.accountId);
  const lastFor = (pid: string) => os.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.payeeId', op: 'eq', value: pid }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 1 })[0]?.data.accountId;
  const usedForPayee = payee && d.accountId && lastFor(payee) === d.accountId ? payeeRef?.title : null;
  const instOf = (a: ObjectRecord<AccountData>) => (a.data.institutionId ? title(a.data.institutionId) : a.data.institution);

  const pickPayee = (pid: string) => {
    setPayee(pid);
    // New payment, no account yet: the one last used for this payee.
    if (!id && !d.accountId) {
      const last = lastFor(pid);
      if (last) set('accountId', last);
    }
    setPicking(null);
  };

  const save = () => {
    const n = Number(amount.replace(/[^0-9.]/g, ''));
    setError(null);
    setAmountError(false);
    if (!(n > 0)) {
      setAmountError(true);
      toast.show({ message: 'Add an amount first', icon: 'info' });
      return;
    }
    const data: Record<string, unknown> = { ...d, amount: n, merchant: (d.merchant ?? '').trim() || undefined, note: (d.note ?? '').trim() || undefined };
    if (payee !== linkedPayee || d.payeeId) data.payeeId = payee ?? undefined;
    try {
      if (id && linkedPayee && payee !== linkedPayee) os.links.unlink(id, linkedPayee, 'payee');
      const saved = (id ? os.records.update(id, { data: data as Partial<TransactionData>, status }) : os.records.create({ object: 'transaction', data: data as unknown as TransactionData, status })) as unknown as ObjectRecord;
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved);
      else if (id) close();
      else router.replace(`/entity/transaction/${saved.id}` as never);
    } catch (e) {
      setError(e instanceof ZodError ? (e.issues[0]?.message ?? 'Check the form') : (e as Error).message);
    }
  };

  const symbol = os.format.currency(0, d.currency).replace(/[\d.,\s]/g, '');
  const quick = [...new Set([...(d.category && !QUICK_CATEGORIES.includes(d.category) ? [d.category] : []), ...QUICK_CATEGORIES])];
  const categories = CATEGORIES;
  const box = { backgroundColor: t.c.bg.tile, borderRadius: 20 };
  const people = ((d.personIds as string[] | undefined) ?? []);
  const chevron = <Icon name="chevron-down" size={16} color={t.c.fg.secondary} />;

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 40, gap: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconButton icon="x" accessibilityLabel="Close" filled onPress={close} />
          <Text variant="title" numberOfLines={1} accessibilityRole="header" style={{ flex: 1 }}>{id ? 'Edit transaction' : 'New transaction'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Save" hitSlop={4} onPress={save} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '700', color: t.c.accent.mustardInk }}>Save</Text>
          </Pressable>
        </View>

        <Seg value={d.kind ?? 'expense'} options={KINDS} onChange={(v) => set('kind', v)} track={t.c.bg.tile} fontSize={13} />

        <Labelled label="Amount">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 76, paddingLeft: 20, paddingRight: 12, borderRadius: 24, backgroundColor: t.c.bg.tile, borderWidth: 1.5, borderColor: amountError ? t.c.alert.coral : focus ? t.c.fg.primary : 'transparent' }}>
            <Text color="secondary" style={{ fontSize: 34, lineHeight: 40, fontWeight: '700' }}>{symbol}</Text>
            <TextInput accessibilityLabel="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoFocus={!id} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} placeholder="0" placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} cursorColor={t.c.accent.mustard} style={{ flex: 1, minWidth: 0, color: t.c.fg.primary, fontSize: 34, fontFamily: fontForWeight(700), letterSpacing: -1, fontVariant: ['tabular-nums'], paddingVertical: 0 }} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Currency, ${d.currency ?? os.format.defaultCurrency()}`} hitSlop={4} onPress={() => setPicking('currency')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
              <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700' }}>{d.currency ?? os.format.defaultCurrency()}</Text>
              <Icon name="chevron-down" size={14} color={t.c.fg.secondary} />
            </Pressable>
          </View>
        </Labelled>

        <Labelled label="Paid to / from">
          <View style={[box, { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingLeft: 8, paddingRight: 10 }]}>
            {payeeRef ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingLeft: 4, paddingRight: 10, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, flexShrink: 1 }}>
                  <Disc name={payeeRef.title} colorKey={payeeRef.id} size={32} />
                  <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', flexShrink: 1 }}>{payeeRef.title}</Text>
                  <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500' }}>{os.registry.object(payeeRef.object).label}</Text>
                </View>
                <View style={{ flex: 1 }} />
                <IconButton icon="x" size={36} accessibilityLabel={`Remove ${payeeRef.title}`} color={t.c.fg.secondary} onPress={() => setPayee(null)} />
              </>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="Pick who was paid" onPress={() => setPicking('payee')} style={{ flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10 }}>
                <Icon name="plus" size={16} color={t.c.accent.gold} />
                <Text color="tertiary" style={INPUT}>Who was paid</Text>
              </Pressable>
            )}
          </View>
          <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, paddingHorizontal: 4 }}>A person or an organisation. Matched from the merchant.</Text>
        </Labelled>

        <Labelled label="Category">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {quick.map((c) => {
              const on = d.category === c;
              const cat = categories.find((x) => x.value === c);
              return (
                <Pressable key={c} accessibilityRole="button" accessibilityLabel={cat?.label ?? c} accessibilityState={{ selected: on }} hitSlop={4} onPress={() => set('category', on ? undefined : c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: on ? t.c.fg.primary : t.c.bg.tileRaised }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor(c, t), borderWidth: on ? 1 : 0, borderColor: t.c.bg.ground }} />
                  <Text variant="label" color={on ? t.c.bg.ground : undefined}>{cat?.label ?? c}</Text>
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="button" accessibilityLabel="All categories" hitSlop={4} onPress={() => setPicking('category')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
              <Text variant="label" color="secondary">All {categories.length}</Text>
              <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />
            </Pressable>
          </View>
        </Labelled>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <DateField label="Date" required quick={false} value={d.date} onChange={(v) => set('date', v as string | undefined)} />
          </View>
          <Labelled label="Status" style={{ flex: 1 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Status, ${def.statuses?.find((s) => s.value === status)?.label}`} onPress={() => setPicking('status')} style={[box, { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingHorizontal: 14 }]}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{def.statuses?.find((s) => s.value === status)?.label ?? status}</Text>
              {chevron}
            </Pressable>
          </Labelled>
        </View>

        <Labelled label="Account">
          <Pressable accessibilityRole="button" accessibilityLabel={account ? `Account, ${account.title}` : 'Pick an account'} onPress={() => setPicking('account')} style={[box, { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14 }]}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={account ? accountIcon(account.data.kind) : 'card'} size={16} color={t.tints.finance.ink} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text numberOfLines={1} color={account ? undefined : 'tertiary'} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{account?.title ?? 'Pick an account'}</Text>
              {account ? <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{[instOf(account), account.data.last4 ? `··${account.data.last4}` : null, usedForPayee ? `last used for ${usedForPayee}` : null].filter(Boolean).join(' · ')}</Text> : null}
            </View>
            {chevron}
          </Pressable>
        </Labelled>

        <View style={{ gap: 12 }}>
          <Caps style={{ paddingTop: 8, paddingHorizontal: 4 }}>DETAILS</Caps>
          <Labelled label="Merchant (as the bank wrote it)">
            <TextInput accessibilityLabel="Merchant" value={d.merchant ?? ''} onChangeText={(s) => set('merchant', s)} placeholder="Where or who" placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} style={[box, INPUT, { minHeight: 56, paddingHorizontal: 18, color: t.c.fg.primary }]} />
          </Labelled>
          <Labelled label="Note">
            <TextInput accessibilityLabel="Note" value={d.note ?? ''} onChangeText={(s) => set('note', s)} multiline numberOfLines={3} placeholder="Anything to remember" placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} style={[box, INPUT, { minHeight: 86, paddingHorizontal: 18, paddingVertical: 16, lineHeight: 22, color: t.c.fg.primary, textAlignVertical: 'top' }]} />
          </Labelled>
          {customFields.map((c) => {
            const key = `custom_${c.key}`;
            return <FieldInput key={key} field={{ key, label: c.label, type: c.fieldType, options: c.options.options }} value={d[key]} onChange={(v) => set(key, v)} />;
          })}
        </View>

        <View style={{ gap: 12 }}>
          <Caps style={{ paddingTop: 8, paddingHorizontal: 4 }}>LINKS</Caps>
          <View style={{ paddingVertical: 4, paddingHorizontal: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
            <LinkRow label="People" value={people.length ? people.map((p) => title(p)?.split(' ')[0]).filter(Boolean).join(', ') : null} onPress={() => setPicking('personIds')} />
            {SINGLE_LINKS.filter((l) => os.registry.hasObject(l.object)).map((l) => (
              <React.Fragment key={l.key}>
                <Hairline />
                <LinkRow label={l.label} value={title(d[l.key] as string | undefined)} onPress={() => setPicking(l.key)} />
              </React.Fragment>
            ))}
            <Hairline />
            <LinkRow label="To account" line="For transfers" value={title(d.toAccountId)} onPress={() => setPicking('toAccountId')} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.fg.tertiary }}>
          <Icon name="brain" size={18} color={t.c.accent.gold} />
          <Text color="secondary" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>Quicker: tell Dump “spent 486 on Swiggy”. Bank SMS files most of them on its own.</Text>
        </View>

        {error ? <Text variant="caption" color={t.c.alert.coralText} accessibilityLiveRegion="polite">{error}</Text> : null}
      </ScrollView>

      <EntityPicker visible={picking === 'payee'} onClose={() => setPicking(null)} types={['org', 'person']} title="Paid to / from" selected={payee ? [payee] : []} onSelect={pickPayee} />
      <EntityPicker visible={picking === 'personIds'} onClose={() => setPicking(null)} types={['person']} title="People" selected={people} onSelect={(pid) => set('personIds', people.includes(pid) ? people.filter((p) => p !== pid) : [...people, pid])} />
      {SINGLE_LINKS.filter((l) => os.registry.hasObject(l.object)).map((l) => (
        <EntityPicker key={l.key} visible={picking === l.key} onClose={() => setPicking(null)} types={[l.object]} title={l.label} selected={d[l.key] ? [d[l.key] as string] : []} onSelect={(rid) => { set(l.key, d[l.key] === rid ? undefined : rid); setPicking(null); }} />
      ))}
      <PickerSheet visible={picking === 'account'} onClose={() => setPicking(null)} title="Account" items={accounts.map((a) => ({ id: a.id, title: a.title, subtitle: instOf(a), icon: accountIcon(a.data.kind) }))} selected={d.accountId ? [d.accountId] : []} onSelect={(a) => { set('accountId', d.accountId === a ? undefined : a); setPicking(null); }} />
      <PickerSheet visible={picking === 'toAccountId'} onClose={() => setPicking(null)} title="To account" items={accounts.map((a) => ({ id: a.id, title: a.title, subtitle: instOf(a), icon: accountIcon(a.data.kind) }))} selected={d.toAccountId ? [d.toAccountId] : []} onSelect={(a) => { set('toAccountId', d.toAccountId === a ? undefined : a); setPicking(null); }} />
      <PickerSheet visible={picking === 'category'} onClose={() => setPicking(null)} title="Category" items={categories.map((c) => ({ id: c.value, title: c.label }))} selected={d.category ? [d.category] : []} onSelect={(c) => { set('category', c); setPicking(null); }} onCreate={(q) => { const c = addCategory(os, { label: q }); if (c) set('category', c.value); setPicking(null); }} />
      <PickerSheet visible={picking === 'status'} onClose={() => setPicking(null)} title="Status" items={(def.statuses ?? []).map((s) => ({ id: s.value, title: s.label }))} selected={[status]} onSelect={(s) => { setStatus(s); setPicking(null); }} />
      <PickerSheet visible={picking === 'currency'} onClose={() => setPicking(null)} title="Currency" items={CURRENCIES.map((c) => ({ id: c, title: c }))} selected={[d.currency ?? os.format.defaultCurrency()]} onSelect={(c) => { set('currency', c); setPicking(null); }} />
    </View>
  );
}
