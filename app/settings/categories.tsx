import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BUILTIN_CATEGORIES, categoryFor, categoryRules, setCategoryRules } from '@core/ingest/ingest';
import { CATEGORIES } from '@modules/finance/types';
import { useLive, useOS } from '@ui/hooks';
import { Button, ChipRow, FilterChip, IconButton, RowItem, RowList, Screen, Section, Text, TextField, useToast } from '@ui/kit';

const label = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

/**
 * You › Categories (M4.2c): your keyword rules — "ZOMATO → Food" — checked
 * first for every bank SMS and payment notification (merchant and message
 * text, whole words). Then what you've taught it, then the built-in list.
 */
export default function CategoriesScreen() {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const rules = useLive((o) => categoryRules(o), []);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('food');
  const [showBuiltin, setShowBuiltin] = useState(false);

  const add = () => {
    const k = keyword.trim();
    if (!k) return;
    setCategoryRules(os, [...rules.filter((r) => r.keyword.toLowerCase() !== k.toLowerCase()), { keyword: k, category }]);
    setKeyword('');
    toast.show({ message: `“${k}” → ${label(category)}`, icon: 'tag' });
  };
  // Re-sort past spends that ended up in Other (or where a rule now says otherwise).
  const apply = () => {
    let n = 0;
    for (const e of os.entities.query<{ merchant?: string; category?: string; kind?: string; note?: string }>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }] } }, { limit: 5000 })) {
      const c = categoryFor(os, e.data.merchant, e.data.note ?? '');
      if (c !== 'other' && c !== e.data.category && (e.data.category === 'other' || rules.some((r) => (e.data.merchant ?? '').toLowerCase().includes(r.keyword.toLowerCase())))) {
        os.entities.update(e.id, { data: { category: c } }, 'system');
        n++;
      }
    }
    toast.show({ message: n ? `Re-sorted ${n} transaction${n === 1 ? '' : 's'}` : 'Nothing to change', icon: 'check' });
  };

  return (
    <Screen title="Categories" subtitle="Keywords that decide a spend’s category" onBack={() => router.back()}>
      <View style={{ gap: 16 }}>
        <Section title="Add a rule">
          <View style={{ gap: 10 }}>
            <TextField label="If the merchant or message says" value={keyword} onChange={setKeyword} placeholder="ZOMATO, rent, Guru Tailors…" autoCapitalize="characters" />
            <ChipRow>
              {CATEGORIES.filter((c) => c.value !== 'transfer').map((c) => (
                <FilterChip key={c.value} label={c.label} selected={category === c.value} onPress={() => setCategory(c.value)} />
              ))}
            </ChipRow>
            <Button title="Add rule" icon="plus" size="sm" disabled={!keyword.trim()} onPress={add} />
          </View>
        </Section>
        <Section title="Your rules" meta={String(rules.length)}>
          {rules.length ? (
            <RowList>
              {rules.map((r) => (
                <RowItem key={r.keyword} icon="tag" tint="finance" title={r.keyword} value={label(r.category)} chevron={false} trailing={<IconButton icon="trash" size={34} accessibilityLabel={`Remove ${r.keyword}`} onPress={() => setCategoryRules(os, rules.filter((x) => x !== r))} />} />
              ))}
            </RowList>
          ) : (
            <Text variant="caption" color="secondary">No rules yet. Add one when a merchant keeps landing in the wrong place.</Text>
          )}
        </Section>
        <Button title="Apply to past transactions" icon="refresh" variant="secondary" onPress={apply} />
        <Section title="Built in" action={showBuiltin ? 'Hide' : 'Show'} onAction={() => setShowBuiltin((x) => !x)}>
          {showBuiltin ? (
            <View style={{ gap: 8 }}>
              {BUILTIN_CATEGORIES.map(([re, c]) => (
                <Text key={c} variant="caption" color="secondary">
                  <Text variant="label">{label(c)}</Text> · {re.source.replace(/^\(\?:\^\|\[\^a-z0-9\]\)\(\?:/, '').replace(/\)\(\?:\$\|\[\^a-z0-9\]\)$/, '').split('|').join(', ')}
                </Text>
              ))}
            </View>
          ) : (
            <Text variant="caption" color="secondary">Swiggy, Zomato, Uber, Amazon, Netflix… Your rules and corrections always win.</Text>
          )}
        </Section>
      </View>
    </Screen>
  );
}
