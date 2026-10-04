import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { confirmProposed, messageList, sourceLabel } from '@core/filing/messages';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Checkbox, EmptyState, Screen, Text, useToast } from '@ui/kit';

/**
 * First-run SMS import review (PRODUCT v4 §5 flow 6): months of bank texts
 * read as transactions, grouped by month, all ticked. Untick what isn't
 * yours to keep (or isn't spending), then file them in one go.
 */
export default function SmsReviewScreen() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const items = useLive((o) => messageList(o, { status: 'proposed', limit: 5000 }), []);
  const [off, setOff] = useState<Set<string>>(new Set());
  const months = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const it of items) {
      const k = format(it.receivedAt, 'MMMM yyyy');
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    return [...m];
  }, [items]);
  const keep = items.filter((i) => !off.has(i.id));
  const spend = keep.reduce((s, i) => s + (i.parsed?.kind === 'txn' && i.parsed.txn.direction === 'debit' ? i.parsed.txn.amount : 0), 0);
  const toggle = (id: string) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const file = () => {
    const n = confirmProposed(os, keep.map((i) => i.id), [...off]);
    toast.show({ message: `Filed ${n} transactions — see Money`, icon: 'check' });
    router.back();
  };
  if (!items.length) return <Screen title="Review SMS" onBack={() => router.back()}><EmptyState icon="check-circle" line="Nothing waiting — your SMS history is filed." /></Screen>;
  return (
    <Screen title="Review SMS" subtitle={`${items.length} found · ${keep.length} ticked · ${os.format.currency(spend)} spent`} onBack={() => router.back()} right={<Button title={`File ${keep.length}`} size="sm" icon="check" onPress={file} />}>
      <View style={{ gap: 16 }}>
        {months.map(([month, list]) => (
          <View key={month} style={{ gap: 6 }}>
            <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase', paddingHorizontal: 4 }}>
              {month} · {list.length}
            </Text>
            <View style={{ backgroundColor: t.c.bg.container, borderRadius: 20, paddingVertical: 4 }}>
              {list.map((i) => {
                const p = i.parsed?.kind === 'txn' ? i.parsed.txn : null;
                if (!p) return null;
                return (
                  <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Checkbox checked={!off.has(i.id)} onChange={() => toggle(i.id)} accessibilityLabel={`Keep ${p.counterparty ?? 'transaction'}`} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="rowTitle" numberOfLines={1}>
                        {p.counterparty ?? (p.channel === 'atm' ? 'ATM withdrawal' : 'Transaction')}
                      </Text>
                      <Text variant="caption" color="secondary" numberOfLines={1}>
                        {format(i.receivedAt, 'd MMM')} · {sourceLabel(i)}{p.last4 ? ` ••${p.last4}` : ''}
                      </Text>
                    </View>
                    <Text variant="label" color={p.direction === 'credit' ? t.c.ok.sageText : undefined} style={{ fontVariant: ['tabular-nums'] }}>
                      {p.direction === 'credit' ? '+' : '−'}
                      {os.format.currency(p.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}
