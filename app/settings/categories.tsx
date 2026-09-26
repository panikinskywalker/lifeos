import { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BUILTIN_CATEGORIES, categoryFor, categoryRules, setCategoryRules } from '@core/ingest/ingest';
import { CATEGORIES } from '@modules/finance/types';
import { CATEGORY_COLORS, CATEGORY_ICONS, addCategory, customCategories, deleteCategory, updateCategory, type CustomCategory } from '@modules/finance/categories';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, ChipRow, FilterChip, Icon, IconButton, RowItem, RowList, Screen, Section, Sheet, Text, TextField, useToast } from '@ui/kit';

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
  const mine = useLive((o) => customCategories(o), []);
  const [editing, setEditing] = useState<CustomCategory | 'new' | null>(null);

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
    <Screen title="Categories" subtitle="Your categories, and the keywords that decide them" onBack={() => router.back()}>
      <View style={{ gap: 16 }}>
        <Section title="Your categories" meta={mine.length ? String(mine.length) : undefined} action="New" onAction={() => setEditing('new')}>
          {mine.length ? (
            <RowList>
              {mine.map((c) => (
                <RowItem key={c.value} icon={c.icon} title={c.label} subtitle="Tap to rename, recolour or delete" trailing={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.color }} />} onPress={() => setEditing(c)} />
              ))}
            </RowList>
          ) : (
            <Text variant="caption" color="secondary">Add your own — Pets, Gym, Kids… They show up wherever you pick a category, in budgets, charts and rules. You can also add one straight from a transaction’s category picker.</Text>
          )}
          <Button title="New category" icon="plus" size="sm" variant="secondary" onPress={() => setEditing('new')} />
        </Section>
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
      <CategorySheet
        editing={editing}
        nextColor={CATEGORY_COLORS[mine.length % CATEGORY_COLORS.length]!}
        onClose={() => setEditing(null)}
        onSave={(c) => {
          if (editing === 'new') {
            const made = addCategory(os, c);
            if (made) {
              setCategory(made.value);
              toast.show({ message: `${made.label} added`, icon: 'check' });
            }
          } else if (editing) updateCategory(os, editing.value, c);
          setEditing(null);
        }}
        onDelete={(c) => {
          const go = () => {
            const n = deleteCategory(os, c.value);
            setEditing(null);
            toast.show({ message: n ? `${c.label} deleted · ${n} moved to Other` : `${c.label} deleted`, icon: 'trash' });
          };
          if (Platform.OS === 'web') return go();
          Alert.alert(`Delete ${c.label}?`, 'Transactions, budgets and subscriptions in it move to Other; rules that point to it are removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
        }}
      />
    </Screen>
  );
}

/** New or edit: a name, a colour, an icon. */
function CategorySheet({ editing, nextColor, onClose, onSave, onDelete }: { editing: CustomCategory | 'new' | null; nextColor: string; onClose: () => void; onSave: (c: { label: string; color: string; icon: string }) => void; onDelete: (c: CustomCategory) => void }) {
  const t = useTheme();
  const existing = editing && editing !== 'new' ? editing : null;
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[0]!);
  const [icon, setIcon] = useState('tag');
  const [shownFor, setShownFor] = useState<string | null>(null);
  const key = existing?.value ?? (editing === 'new' ? 'new' : null);
  if (key !== shownFor) {
    setShownFor(key);
    setName(existing?.label ?? '');
    setColor(existing?.color ?? nextColor);
    setIcon(existing?.icon ?? 'tag');
  }
  const taken = !!name.trim() && CATEGORIES.some((c) => c.label.toLowerCase() === name.trim().toLowerCase() && c.value !== existing?.value);
  return (
    <Sheet visible={!!editing} onClose={onClose} title={existing ? 'Edit category' : 'New category'}>
      <View style={{ gap: 14 }}>
        <TextField label="Name" value={name} onChange={setName} placeholder="Pets, Gym, Kids…" autoFocus={!existing} error={taken ? 'There’s already a category with this name' : undefined} />
        <Text variant="label" color="secondary">Colour</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {CATEGORY_COLORS.map((c) => (
            <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Colour ${c}`} accessibilityState={{ selected: color === c }} onPress={() => setColor(c)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: t.c.fg.primary }} />
          ))}
        </View>
        <Text variant="label" color="secondary">Icon</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORY_ICONS.map((i) => (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Icon ${i}`} accessibilityState={{ selected: icon === i }} onPress={() => setIcon(i)} style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: icon === i ? color : t.c.bg.tile }}>
              <Icon name={i} size={20} color={icon === i ? '#fff' : t.c.fg.secondary} />
            </Pressable>
          ))}
        </View>
        <Button title={existing ? 'Save' : 'Add category'} icon="check" disabled={!name.trim() || taken} onPress={() => onSave({ label: name, color, icon })} />
        {existing ? <Button title="Delete category" icon="trash" variant="destructive" onPress={() => onDelete(existing)} /> : null}
      </View>
    </Sheet>
  );
}
