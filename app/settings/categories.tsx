import { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BUILTIN_CATEGORIES, categoryRules, rangeRule, ruleAmounts, ruleCategory, ruleText, setCategoryRules } from '@modules/finance/filing/rules';
import { CATEGORIES } from '@modules/finance/types';
import { CATEGORY_COLORS, CATEGORY_ICONS, addCategory, categoryTargets, customCategories, deleteCategory, setCategoryTarget, updateCategory, type CustomCategory } from '@modules/finance/categories';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, ChipRow, FilterChip, Icon, IconButton, NumberField, RowItem, Segmented, SwitchField, RowList, Screen, Section, Sheet, Text, TextField, useToast } from '@ui/kit';

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
  const [amountText, setAmountText] = useState('');
  const [multiples, setMultiples] = useState(false);
  const [direction, setDirection] = useState<'spent' | 'received' | 'any'>('spent');
  const amounts = [...new Set(amountText.split(/[,/\s]+/).map((x) => Number(x.replace(/[₹rs.]+$/i, '').replace(/^(?:₹|rs\.?)/i, ''))).filter((n) => Number.isFinite(n) && n > 0))];
  const [category, setCategory] = useState('food');
  const [showBuiltin, setShowBuiltin] = useState(false);
  const t = useTheme();
  const mine = useLive((o) => customCategories(o), []);
  const targets = useLive((o) => categoryTargets(o), []);
  const [targetFor, setTargetFor] = useState<string | null>(null);
  const groups = useLive((o) => (o.registry.objects.has('group') ? o.records.query('group', {}, { limit: 200 }) : []), []);
  const [mode, setMode] = useState<'exact' | 'range'>('exact');
  const [min, setMin] = useState<number | undefined>(undefined);
  const [max, setMax] = useState<number | undefined>(undefined);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [after, setAfter] = useState('');
  const [hours, setHours] = useState<number | undefined>(48);
  const hasRange = mode === 'range' && (min != null || max != null);
  const [editing, setEditing] = useState<CustomCategory | 'new' | null>(null);

  const add = () => {
    const k = keyword.trim();
    if (hasRange) {
      const rule = { keyword: '', min: min ?? null, max: max ?? null, direction, fromGroupId: groupId, afterKeyword: after.trim() || null, withinHours: after.trim() ? (hours ?? 48) : null, category };
      setCategoryRules(os, [...rules, rule]);
      setMin(undefined);
      setMax(undefined);
      setAfter('');
      setGroupId(null);
      toast.show({ message: `${ruleText(rule, os.format.currency)} → ${label(category)}`, icon: 'tag' });
      return;
    }
    if (!k && !amounts.length) return;
    const rule = { keyword: k, amounts: amounts.length ? amounts : null, multiples: amounts.length ? multiples : undefined, direction: amounts.length || direction !== 'spent' ? direction : undefined, category };
    const same = (r: (typeof rules)[number]) => r.keyword.toLowerCase() === k.toLowerCase() && ruleAmounts(r).join() === amounts.join() && (r.direction ?? 'spent') === direction;
    setCategoryRules(os, [...rules.filter((r) => !same(r)), rule]);
    setKeyword('');
    setAmountText('');
    setMultiples(false);
    toast.show({ message: `${ruleText(rule, os.format.currency)} → ${label(category)}`, icon: 'tag' });
  };
  // Re-sort past spends that ended up in Other (or where a rule now says otherwise).
  const apply = () => {
    let n = 0;
    for (const e of os.records.query<{ merchant?: string; category?: string; kind?: string; note?: string; amount?: number }>('transaction', { filter: { and: [{ field: 'data.kind', op: 'in', value: ['expense', 'income'] }] } }, { limit: 5000 })) {
      // A rule decides; nothing else overrides a category you (or it) already set.
      const dir = e.data.kind === 'income' ? 'credit' : 'debit';
      let c = ruleCategory(os, e.data.merchant, e.data.note ?? '', e.data.amount ?? null, dir);
      // Range rules: only where they're sure (from the group / after the payment) — past guesses aren't worth the noise.
      if (!c && e.data.amount != null) {
        const payerId = os.links.forEntity(e.id).find((r) => r.relation.kind === 'person' && r.direction === 'out')?.other.id ?? null;
        const rr = rangeRule(os, { amount: e.data.amount, direction: dir, payerId, merchant: e.data.merchant, at: e.occurredAt ?? e.createdAt });
        if (rr?.sure) c = rr.category;
      }
      if (c && c !== e.data.category) {
        os.records.update(e.id, { data: { category: c } }, 'system');
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
                <RowItem key={c.value} icon={c.icon} title={c.label} subtitle="Tap to rename, recolour or delete" trailing={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.paletteColor(c.color) }} />} onPress={() => setEditing(c)} />
              ))}
            </RowList>
          ) : (
            <Text variant="caption" color="secondary">Add your own — Pets, Gym, Kids… They show up wherever you pick a category, in targets, charts and rules. You can also add one straight from a transaction’s category picker.</Text>
          )}
          <Button title="New category" icon="plus" size="sm" variant="secondary" onPress={() => setEditing('new')} />
        </Section>
        <Section title="Monthly targets" meta={Object.keys(targets).length ? String(Object.keys(targets).length) : undefined}>
          <Text variant="caption" color="secondary">A monthly amount per category. Spend and the Money overview show how you are pacing against it. Leave blank for none.</Text>
          <RowList>
            {CATEGORIES.filter((c) => !['salary', 'freelance', 'transfer', 'investment'].includes(c.value)).map((c) => (
              <RowItem
                key={c.value}
                icon={c.icon}
                title={c.label}
                subtitle={targets[c.value] ? `${os.format.currency(targets[c.value]!)} a month` : 'No target'}
                onPress={() => setTargetFor(c.value)}
                chevron
              />
            ))}
          </RowList>
        </Section>
        <Section title="Add a rule">
          <View style={{ gap: 10 }}>
            <Segmented<'exact' | 'range'>
              options={[{ value: 'exact', label: 'Words or exact amounts' }, { value: 'range', label: 'A range' }]}
              value={mode}
              onChange={(m) => {
                setMode(m);
                if (m === 'range') setDirection('received');
              }}
            />
            {mode === 'exact' ? (
              <>
                <TextField label="If the merchant or message says" value={keyword} onChange={setKeyword} placeholder="ZOMATO, rent, Guru Tailors…" autoCapitalize="characters" hint="Leave empty to go by the amount alone." />
                <TextField label="And / or the amount is exactly" value={amountText} onChange={setAmountText} placeholder="28   or   147, 131" keyboardType="numbers-and-punctuation" hint="One amount or several, separated by commas — ₹28 is always the water bottle; ₹147 or ₹131 is a football share." />
                {amounts.length ? <SwitchField label="Also 2×, 3× … of these" value={multiples} onChange={setMultiples} hint="Two bottles (₹56), or someone paying a friend’s share too (₹294)." /> : null}
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <NumberField label="From ₹" value={min} onChange={setMin} placeholder="100" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <NumberField label="To ₹" value={max} onChange={setMax} placeholder="200" />
                  </View>
                </View>
                <Text variant="caption" color="secondary">A range alone catches too much, so it’s sure only when one of these is true — otherwise it files it as a guess you can check in the bell.</Text>
                {groups.length ? (
                  <>
                    <Text variant="label" color="secondary">From someone in</Text>
                    <ChipRow>
                      {groups.map((g) => (
                        <FilterChip key={g.id} label={g.title} selected={groupId === g.id} onPress={() => setGroupId(groupId === g.id ? null : g.id)} />
                      ))}
                    </ChipRow>
                  </>
                ) : (
                  <Text variant="caption" color="secondary">Tip: make a group of the people (Browse › People › Groups) and it can go by who paid.</Text>
                )}
                <TextField label="Or soon after you paid" value={after} onChange={setAfter} placeholder="TURF, Green Arena…" autoCapitalize="characters" hint="A word in that payment’s merchant — shares come in after you book." />
                {after.trim() ? <NumberField label="Within hours" value={hours} onChange={setHours} placeholder="48" /> : null}
              </>
            )}
            {mode === 'range' || amounts.length ? (
              <Segmented<'spent' | 'received' | 'any'> options={[{ value: 'spent', label: 'Money out' }, { value: 'received', label: 'Money in' }, { value: 'any', label: 'Either' }]} value={direction} onChange={setDirection} />
            ) : null}
            <ChipRow>
              {CATEGORIES.filter((c) => c.value !== 'transfer').map((c) => (
                <FilterChip key={c.value} label={c.label} selected={category === c.value} onPress={() => setCategory(c.value)} />
              ))}
            </ChipRow>
            <Button title="Add rule" icon="plus" size="sm" disabled={mode === 'range' ? !hasRange : !keyword.trim() && !amounts.length} onPress={add} />
          </View>
        </Section>
        <Section title="Your rules" meta={String(rules.length)}>
          {rules.length ? (
            <RowList>
              {rules.map((r) => (
                <RowItem key={`${r.keyword}|${ruleAmounts(r).join()}|${r.min ?? ''}-${r.max ?? ''}|${r.direction ?? ''}`} icon={r.keyword.trim() ? 'tag' : 'rupee'} tint="finance" title={ruleText(r, os.format.currency)} subtitle={r.min != null || r.max != null ? [r.fromGroupId ? `from ${os.records.get(r.fromGroupId)?.title ?? 'a group'}` : null, r.afterKeyword ? `after a ${r.afterKeyword} payment (${r.withinHours ?? 48} h)` : null].filter(Boolean).join(' or ') || 'Always a guess to check' : r.keyword.trim() && ruleAmounts(r).length ? 'Both must match' : r.keyword.trim() ? 'Merchant or message says' : 'Exact amount'} value={label(r.category)} chevron={false} trailing={<IconButton icon="trash" size={34} accessibilityLabel={`Remove ${ruleText(r)}`} onPress={() => setCategoryRules(os, rules.filter((x) => x !== r))} />} />
              ))}
            </RowList>
          ) : (
            <Text variant="caption" color="secondary">No rules yet. Add one when a merchant keeps landing in the wrong place, or when an exact amount always means the same thing.</Text>
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
      <TargetSheet
        key={targetFor ?? 'none'}
        category={targetFor}
        current={targetFor ? targets[targetFor] : undefined}
        onClose={() => setTargetFor(null)}
        onSave={(m) => {
          if (targetFor) setCategoryTarget(os, targetFor, m);
          setTargetFor(null);
        }}
      />
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
function TargetSheet({ category, current, onClose, onSave }: { category: string | null; current: number | undefined; onClose: () => void; onSave: (monthly: number | null) => void }) {
  const [amount, setAmount] = useState<number | undefined>(current);
  const cat = CATEGORIES.find((c) => c.value === category);
  return (
    <Sheet visible={!!category} onClose={onClose} title={cat ? `${cat.label} target` : 'Target'}>
      <View style={{ gap: 14 }}>
        <NumberField label="Per month ₹" value={amount} onChange={setAmount} placeholder="8000" autoFocus />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Save" icon="check" onPress={() => onSave(amount && amount > 0 ? amount : null)} />
          {current ? <Button title="Remove" variant="secondary" icon="trash" onPress={() => onSave(null)} /> : null}
        </View>
      </View>
    </Sheet>
  );
}

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
            <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Colour ${c}`} accessibilityState={{ selected: color === c }} onPress={() => setColor(c)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.paletteColor(c), borderWidth: color === c ? 3 : 0, borderColor: t.c.fg.primary }} />
          ))}
        </View>
        <Text variant="label" color="secondary">Icon</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORY_ICONS.map((i) => (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Icon ${i}`} accessibilityState={{ selected: icon === i }} onPress={() => setIcon(i)} style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: icon === i ? t.paletteColor(color) : t.c.bg.tile }}>
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
