import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, EmptyState, FormField, FilterChip, Icon, RowItem, RowList, Section, Sheet, Text, useToast } from '@ui/kit';
import { EntityPicker } from '@ui/components/fields';
import { Disc, Hairline, IconDisc, SectionHead, Seg, SmallPill, StatusPill } from './parts';
import { applySplit, balanceWith, balances, clearSplit, settleUp, splitAmounts, undoSettle, type DebtData, type Party, type SplitMethod, type SplitRecord } from '@modules/finance/split';

const METHODS: Array<{ value: SplitMethod; label: string }> = [
  { value: 'equal', label: 'Equally' },
  { value: 'exact', label: '₹' },
  { value: 'percent', label: '%' },
  { value: 'shares', label: 'Shares' },
];

/** Money and people confirm (HANDOFF): a native confirm before settling. */
function confirm(title: string, body: string, ok: string, fn: () => void) {
  if (Platform.OS === 'web') return fn();
  Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: ok, onPress: fn }]);
}

const nameOf = (os: LifeOSContext, party: Party) => (party === 'me' ? 'You' : (os.records.get(party)?.title ?? 'Someone'));

/** A person in a split: 60-high row, their disc, what they owe. */
function ShareRow({ party, name, line, amount, tone, onPress }: { party: Party; name: string; line: string | null; amount: string; tone?: string; onPress?: () => void }) {
  const t = useTheme();
  const inner = (
    <>
      {party === 'me' ? <IconDisc icon="user" color={t.c.fg.primary} /> : <Disc name={name} colorKey={party} />}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="rowTitle" numberOfLines={1}>{name}</Text>
        {line ? <Text variant="caption" color="secondary" numberOfLines={1}>{line}</Text> : null}
      </View>
      <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'], color: tone }}>{amount}</Text>
    </>
  );
  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, minHeight: 60 };
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${amount}`} onPress={onPress} style={row}>{inner}</Pressable> : <View style={row}>{inner}</View>;
}

const METHOD_WORD: Record<SplitMethod, string> = { equal: 'Equally', exact: 'By amount', percent: 'By percent', shares: 'By shares' };

/** Transaction › Split (NR-Money-Transaction): who paid, who's in, how it's divided, what that leaves owed. */
export function SplitBlock({ entity, ctx }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = useTheme();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const split = (entity.data as { split?: SplitRecord }).split;
  if ((entity.data as { kind?: string }).kind !== 'expense') return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Split" sub={split ? `${METHOD_WORD[split.method]} · ${split.payer === 'me' ? 'you paid' : `${nameOf(ctx, split.payer)} paid`}` : undefined} action={split ? 'Change' : undefined} lime onAction={() => setOpen(true)} />
      {split ? (
        <View style={{ paddingTop: 6, paddingBottom: 14, paddingHorizontal: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          {split.shares.map((s, i) => (
            <React.Fragment key={s.party}>
              {i ? <Hairline /> : null}
              <ShareRow
                party={s.party}
                name={nameOf(ctx, s.party)}
                line={s.party === split.payer ? 'Paid' : split.payer === 'me' ? 'Owes you' : s.party === 'me' ? `You owe ${nameOf(ctx, split.payer)}` : null}
                amount={ctx.format.currency(s.amount)}
                tone={s.party !== split.payer && split.payer === 'me' ? t.c.accent.gold : undefined}
                onPress={s.party === 'me' ? undefined : () => router.push(`/entity/person/${s.party}` as never)}
              />
            </React.Fragment>
          ))}
          <View style={{ marginTop: 8 }}>
            <SmallPill
              title="Remove split"
              icon="trash"
              onPress={() => {
                const prev = split;
                clearSplit(ctx, entity.id);
                toast.show({ message: 'Split removed', icon: 'trash', undo: () => void applySplit(ctx, entity.id, prev) });
              }}
            />
          </View>
        </View>
      ) : (
        <Button title="Split this expense" icon="people" variant="secondary" block onPress={() => setOpen(true)} />
      )}
      <SplitSheet visible={open} onClose={() => setOpen(false)} tx={entity} />
    </View>
  );
}

/** Split a payment (NR-Money-Split). */
function SplitSheet({ visible, onClose, tx }: { visible: boolean; onClose: () => void; tx: ObjectRecord<any> }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const prev = (tx.data as { split?: SplitRecord }).split;
  const total = Number((tx.data as { amount: number }).amount);
  const groups = useLive((o) => o.records.query('group', {}, { limit: 50 }), []);
  const [payer, setPayer] = useState<Party>('me');
  const [people, setPeople] = useState<string[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [method, setMethod] = useState<SplitMethod>('equal');
  const [values, setValues] = useState<Record<string, number | undefined>>({});
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setPayer(prev?.payer ?? 'me');
    setPeople(prev ? prev.parts.map((p) => p.party).filter((p) => p !== 'me') : ((tx.data as { personIds?: string[] }).personIds ?? []));
    setGroupId(prev?.groupId ?? null);
    setMethod(prev?.method ?? 'equal');
    setValues(Object.fromEntries((prev?.parts ?? []).map((p) => [p.party, p.value])));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const parties: Party[] = ['me', ...people];
  const parts = parties.map((p) => ({ party: p, value: values[p] }));
  const preview = useMemo(() => {
    try {
      return { shares: splitAmounts(total, method, parts), error: null as string | null };
    } catch (e) {
      return { shares: [], error: (e as Error).message };
    }
  }, [total, method, JSON.stringify(parts)]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickGroup = (id: string) => {
    const on = groupId === id ? null : id;
    setGroupId(on);
    if (on) setPeople(os.groups.members(on).map((m) => m.memberId));
    if (on && method === 'shares') setValues(Object.fromEntries(os.groups.members(on).map((m) => [m.memberId, m.defaultShare])));
  };
  const mine = preview.shares.find((s) => s.party === 'me')?.amount ?? 0;
  const owedLine = payer === 'me' ? `${os.format.currency(total - mine)} to you` : `you owe ${os.format.currency(mine)}`;
  const save = () => {
    applySplit(os, tx.id, { payer, method, parts, groupId });
    onClose();
    toast.show({
      message: payer === 'me' ? `Split · ${os.format.currency(total - mine)} owed to you` : `Split · you owe ${nameOf(os, payer)} ${os.format.currency(mine)}`,
      icon: 'people',
      undo: () => (prev ? void applySplit(os, tx.id, prev) : clearSplit(os, tx.id)),
    });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={`Split ${os.format.currency(total)}`} footer={<Button title="Save split" icon="check" block disabled={!!preview.error || people.length === 0} onPress={save} />}>
      {groups.length ? (
        <FormField label="Group">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {groups.map((g) => (
              <FilterChip key={g.id} label={g.title} icon="people" selected={groupId === g.id} onPress={() => pickGroup(g.id)} />
            ))}
          </View>
        </FormField>
      ) : null}
      <FormField label="With">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {people.map((p) => (
            <Pressable key={p} accessibilityRole="button" accessibilityLabel={`Remove ${nameOf(os, p)}`} hitSlop={4} onPress={() => setPeople(people.filter((x) => x !== p))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 4, paddingRight: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
              <Disc name={nameOf(os, p)} colorKey={p} size={32} />
              <Text variant="label" numberOfLines={1}>{nameOf(os, p)}</Text>
              <Icon name="x" size={14} color={t.c.fg.secondary} />
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Add person" hitSlop={4} onPress={() => setPicking(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.accent.mustardSoft }}>
            <Icon name="plus" size={14} color={t.c.accent.gold} />
            <Text variant="label" color={t.c.accent.gold}>Add person</Text>
          </Pressable>
        </View>
      </FormField>
      <FormField label="Paid by">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {parties.map((p) => (
            <FilterChip key={p} label={nameOf(os, p)} selected={payer === p} onPress={() => setPayer(p)} />
          ))}
        </View>
      </FormField>
      <FormField label="Divide">
        <Seg value={method} onChange={setMethod} options={METHODS} />
      </FormField>
      <View style={{ paddingVertical: 4, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t.c.bg.tileRaised }}>
        {parties.map((p, i) => {
          const share = preview.shares.find((s) => s.party === p)?.amount;
          return (
            <React.Fragment key={p}>
              {i ? <Hairline /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{nameOf(os, p)}</Text>
                {method === 'equal' ? (
                  payer === p ? <Text variant="caption" color="secondary">paid</Text> : null
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 10, borderRadius: 12, backgroundColor: t.c.bg.tile }}>
                    <TextInput accessibilityLabel={`${nameOf(os, p)}, ${method}`} keyboardType="decimal-pad" value={values[p] != null ? String(values[p]) : ''} onChangeText={(s) => setValues({ ...values, [p]: s.trim() === '' ? undefined : Number(s.replace(/[^0-9.]/g, '')) })} placeholder={method === 'shares' ? '1' : '0'} placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} style={{ width: 52, color: t.c.fg.primary, fontSize: 14, textAlign: 'right', fontVariant: ['tabular-nums'], paddingVertical: 0 }} />
                    <Text variant="caption" color="secondary">{method === 'percent' ? '%' : method === 'shares' ? '×' : '₹'}</Text>
                  </View>
                )}
                <Text style={{ minWidth: 64, textAlign: 'right', fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{share != null ? os.format.currency(share) : '-'}</Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
      {preview.error && people.length ? (
        <Text variant="caption" color={t.c.alert.coralText}>
          {preview.error}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
          <Text variant="caption" color="secondary" style={{ flex: 1 }}>Each one is a Debt on their page, settled from there.</Text>
          {people.length ? <StatusPill lime={payer === 'me'} coral={payer !== 'me'} label={owedLine} /> : null}
        </View>
      )}
      <EntityPicker visible={picking} onClose={() => setPicking(false)} types={['person']} selected={people} exclude={people} title="Split with" onSelect={(id) => setPeople([...new Set([...people, id])])} />
    </Sheet>
  );
}

function SettleButton({ personId, groupId, amount, label }: { personId: string; groupId?: string; amount: number; label: string }) {
  const os = useOS();
  const toast = useToast();
  const name = nameOf(os, personId);
  const body = amount > 0 ? `${name} paid you ${os.format.currency(amount)}. Mark everything between you as settled?` : `You paid ${name} ${os.format.currency(-amount)}. Mark everything between you as settled?`;
  return (
    <Button
      title={label}
      icon="check"
      size="sm"
      onPress={() =>
        confirm('Settle up?', body, 'Settle', () => {
          const s = settleUp(os, personId, { groupId });
          toast.show({ message: `Settled with ${name}`, icon: 'check', undo: () => undoSettle(os, s) });
        })
      }
    />
  );
}

/** Person › Money: the running balance, open items, settle up. */
export function PersonBalanceSection({ entity, ctx }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) {
  const t = useTheme();
  const router = useRouter();
  const bal = useLive((o) => balanceWith(o, entity.id), [entity.id]);
  const open = useLive((o) => o.records.query<DebtData>('debt', { filter: { and: [{ field: 'data.personId', op: 'eq', value: entity.id }, { field: 'status', op: 'neq', value: 'settled' }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 20 }), [entity.id]);
  if (!open.length && bal === 0) return null;
  const first = entity.title.split(' ')[0];
  return (
    <Section title="Money" meta={open.length ? `${open.length} open` : undefined}>
      <Card>
        <Text variant="labelCaps" color="secondary" style={{ textTransform: 'uppercase' }}>
          {bal > 0 ? `${first} owes you` : bal < 0 ? `You owe ${first}` : 'All settled'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text variant="stat" style={{ flex: 1, color: bal > 0 ? t.c.ok.sageText : bal < 0 ? t.c.alert.coralText : undefined }}>
            {ctx.format.currency(Math.abs(bal))}
          </Text>
          {bal !== 0 ? <SettleButton personId={entity.id} amount={bal} label="Settle up" /> : null}
        </View>
      </Card>
      <RowList>
        {open.map((d) => (
          <RowItem key={d.id} icon={d.data.kind === 'split' ? 'people' : 'cash'} tint="finance" title={d.title} subtitle={`${format(new Date(`${d.data.date}T00:00:00`), 'EEE d MMM')} · ${d.data.direction === 'they_owe' ? 'owes you' : 'you owe'}`} value={`${d.data.direction === 'they_owe' ? '+' : '−'}${ctx.format.currency(d.data.amount)}`} valueTone={d.data.direction === 'they_owe' ? 'ok' : 'alert'} onPress={() => router.push(`/entity/debt/${d.id}`)} />
        ))}
      </RowList>
    </Section>
  );
}

/** Group › Balances: each member's balance with me inside this group. */
export function GroupBalanceSection({ entity, ctx }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) {
  const list = useLive((o) => balances(o, entity.id), [entity.id]);
  const members = useLive((o) => o.groups.members(entity.id), [entity.id]);
  return (
    <Section title="Balances" meta={`${members.length + 1} people`}>
      {list.length === 0 ? (
        <EmptyState icon="people" tint="people" line="All square. Split an expense from any transaction and pick this group." bare />
      ) : (
        <RowList>
          {list.map((b) => (
            <RowItem
              key={b.personId}
              icon="user"
              tint="people"
              title={nameOf(ctx, b.personId)}
              subtitle={b.amount > 0 ? 'owes you' : 'you owe'}
              value={ctx.format.currency(Math.abs(b.amount))}
              valueTone={b.amount > 0 ? 'ok' : 'alert'}
              strong
              trailing={<SettleButton personId={b.personId} groupId={entity.id} amount={b.amount} label="Settle" />}
            />
          ))}
        </RowList>
      )}
      <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>
        Only what’s between you and each member, like a personal ledger.
      </Text>
    </Section>
  );
}
