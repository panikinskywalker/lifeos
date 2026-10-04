import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, Chip, EmptyState, FormField, FilterChip, NumberField, RowItem, RowList, Section, Segmented, Sheet, Text, useToast } from '@ui/kit';
import { EntityPicker } from '@ui/components/fields';
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

/** Transaction › Split: who paid, who's in, how it's divided — and what that leaves owed. */
export function SplitSection({ entity, ctx }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const split = (entity.data as { split?: SplitRecord }).split;
  if ((entity.data as { kind?: string }).kind !== 'expense') return null;
  return (
    <Section title="Split" action={split ? 'Change' : undefined} onAction={() => setOpen(true)}>
      {split ? (
        <RowList>
          {split.shares.map((s) => (
            <RowItem key={s.party} icon={s.party === 'me' ? 'user' : 'people'} tint="people" title={nameOf(ctx, s.party)} subtitle={s.party === split.payer ? 'Paid' : split.payer === 'me' ? 'Owes you' : s.party === 'me' ? `You owe ${nameOf(ctx, split.payer)}` : null} value={ctx.format.currency(s.amount)} strong />
          ))}
          <Button
            title="Remove split"
            icon="trash"
            size="sm"
            variant="secondary"
            onPress={() => {
              const prev = split;
              clearSplit(ctx, entity.id);
              toast.show({ message: 'Split removed', icon: 'trash', undo: () => void applySplit(ctx, entity.id, prev) });
            }}
          />
        </RowList>
      ) : (
        <Button title="Split this expense" icon="people" variant="secondary" block onPress={() => setOpen(true)} />
      )}
      <SplitSheet visible={open} onClose={() => setOpen(false)} tx={entity} />
    </Section>
  );
}

function SplitSheet({ visible, onClose, tx }: { visible: boolean; onClose: () => void; tx: ObjectRecord<any> }) {
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
  const save = () => {
    applySplit(os, tx.id, { payer, method, parts, groupId });
    onClose();
    const mine = preview.shares.find((s) => s.party === 'me')?.amount ?? 0;
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
            <Chip key={p} label={nameOf(os, p)} icon="x" onPress={() => setPeople(people.filter((x) => x !== p))} />
          ))}
          <Chip label="Add person" icon="plus" tone="accent" onPress={() => setPicking(true)} />
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
        <Segmented value={method} onChange={setMethod} options={METHODS} />
      </FormField>
      <RowList>
        {parties.map((p) => {
          const share = preview.shares.find((s) => s.party === p)?.amount;
          return method === 'equal' ? (
            <RowItem key={p} icon={p === 'me' ? 'user' : 'people'} tint="people" title={nameOf(os, p)} value={share != null ? os.format.currency(share) : '—'} />
          ) : (
            <View key={p} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <NumberField label={nameOf(os, p)} value={values[p]} onChange={(v) => setValues({ ...values, [p]: v })} unit={method === 'percent' ? '%' : method === 'shares' ? '×' : '₹'} placeholder={method === 'shares' ? '1' : '0'} />
              </View>
              <Text variant="rowTitle" style={{ width: 96, textAlign: 'right', paddingBottom: 14 }}>
                {share != null ? os.format.currency(share) : '—'}
              </Text>
            </View>
          );
        })}
      </RowList>
      {preview.error && people.length ? (
        <Text variant="caption" color={t.c.alert.coralText}>
          {preview.error}
        </Text>
      ) : null}
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
        Only what’s between you and each member — like a personal ledger.
      </Text>
    </Section>
  );
}
