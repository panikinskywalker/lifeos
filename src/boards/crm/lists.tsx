import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FieldOption, ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { ChipRow, FilterChip, Icon, IconButton, ScreenHeader, Text } from '@ui/kit';
import { BUILTIN_RELATIONSHIPS, daysSince, GROUP_KINDS, listItems, personType, type GroupData, type PersonData } from '@modules/crm';
import { balances } from '@modules/finance/split';
import { BalanceChip, Chip28, Face, FaceStack, shortSpan } from './parts';

/**
 * Everyone (NR-People-List, NR-People-ListAZ): search, a pill per
 * relationship (yours too), sorted by last spoke or by name, grouped by
 * relationship or A–Z with the G4 rail down the right edge; then the groups.
 * The row pieces here (search field, section head, row card, person and
 * group rows) are the People home's too.
 */

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

/** Relationship dots, from the artboards (family salmon, friend pink, colleague sky, vendor lilac). */
const REL_DOT: Record<string, string> = { family: '#FFB1A1', friend: '#F4A8CE', colleague: '#A9C4FF', vendor: '#C9A7F5', partner: '#FF8A6A', client: '#9FB8F7', acquaintance: '#F2D7A0' };
/** A relationship you added: its palette colour, drawn in the face colours. */
const PALETTE_DOT: Record<string, string> = { red: '#FFB1A1', orange: '#FF8A6A', yellow: '#F6E27F', green: '#9FE0B5', mint: '#DCEFC8', teal: '#8AD3DD', cyan: '#8AD3DD', blue: '#A9C4FF', indigo: '#9FB8F7', purple: '#C9A7F5', pink: '#F4A8CE', brown: '#F2D7A0', gray: 'rgba(245,245,247,0.42)' };

/** Person's Relationship options: the seven, then the ones you added. */
export function relationshipOptions(): FieldOption[] {
  return [...(personType.fields.find((f) => f.key === 'relationship')?.options ?? [])];
}

export function relationshipColor(value: string | undefined, options = relationshipOptions()): string {
  if (!value) return 'rgba(245,245,247,0.42)';
  if (REL_DOT[value]) return REL_DOT[value]!;
  const c = options.find((o) => o.value === value)?.color;
  return (c && (PALETTE_DOT[c] ?? (c.startsWith('#') ? c : undefined))) ?? 'rgba(245,245,247,0.42)';
}

export function relationshipLabel(value: string | undefined, options = relationshipOptions()): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value.replace(/^\w/, (c) => c.toUpperCase());
}

/** A cadence, short: weekly · every 2 wk · monthly · every 3 mo · every 6 mo · yearly. */
export function cadenceShort(v: string | undefined): string | null {
  return v ? ({ '7': 'weekly', '14': 'every 2 wk', '30': 'monthly', '91': 'every 3 mo', '182': 'every 6 mo', '365': 'yearly' } as Record<string, string>)[v] ?? `every ${v} d` : null;
}

/** Last spoke as a chip: quiet; lime when the rhythm says today; coral once past it. */
export function SpokeChip({ person }: { person: ObjectRecord<PersonData> }) {
  const since = daysSince(person.data.lastContactAt);
  const every = Number(person.data.contactEvery) || null;
  const over = since != null && every != null ? since - every : null;
  return <Chip28 label={shortSpan(since)} tone={over == null || over < 0 ? 'quiet' : over === 0 ? 'lime' : 'coral'} />;
}

/** Does a person match what was typed: name, company, city, UPI IDs, likes, role. */
export function matchesPerson(p: ObjectRecord<PersonData>, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const d = p.data;
  return [p.title, d.company, d.city, d.role, ...listItems(d.upi), ...listItems(d.likes)].some((x) => x?.toLowerCase().includes(s));
}

/** The search field (48, raised, 16 radius): "Name, company, city or UPI ID". */
export function SearchField({ value, onChange, placeholder = 'Name, company, city or UPI ID' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line }}>
      <Icon name="search" size={18} color={t.c.fg.tertiary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.c.fg.tertiary}
        selectionColor={t.c.accent.mustard}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search people"
        style={{ flex: 1, minHeight: 46, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 16, lineHeight: 21, paddingVertical: 0 }}
      />
      {value ? <IconButton icon="x" accessibilityLabel="Clear search" size={28} onPress={() => onChange('')} /> : null}
    </View>
  );
}

/** A section's head: 17/600 title, a 13 line under it, an "All 42 ›" on the right. */
export function SectionHead({ title, sub, action, onAction }: { title: string; sub?: string | null; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sub}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: sub ? 0 : 2 }}>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>{action}</Text>
          <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A card of rows (24 radius), hairlines between them. */
export function RowCard({ children, pad = 14 }: { children: React.ReactNode; pad?: number }) {
  const t = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ padding: pad, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 8 }}>
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          {i ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
          {r}
        </React.Fragment>
      ))}
    </View>
  );
}

/** "Friend · Football", "Colleague · UnifyApps": their relationship, then company (or the first group they are in). */
export function personLine(p: ObjectRecord<PersonData>, group?: string | null, options?: FieldOption[]): string {
  return [relationshipLabel(p.data.relationship, options), p.data.company || group].filter(Boolean).join(' · ');
}

/** The person row: face 40, name, a relationship dot and line, last spoke on the right. */
export function PersonRow({ person, line, right, options, onPress }: { person: ObjectRecord<PersonData>; line?: string; right?: React.ReactNode; options?: FieldOption[]; onPress: () => void }) {
  const t = useTheme();
  const sub = line ?? personLine(person, null, options);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={[person.title, sub].filter(Boolean).join(', ')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, opacity: pressed ? 0.75 : 1 })}>
      <Face id={person.id} name={person.title} photo={person.data.photo?.uri} size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{person.title}</Text>
        {sub ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {person.data.relationship ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: relationshipColor(person.data.relationship, options) }} /> : null}
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sub}</Text>
          </View>
        ) : null}
      </View>
      {right ?? <SpokeChip person={person} />}
    </Pressable>
  );
}

export interface GroupItem {
  group: ObjectRecord<GroupData>;
  members: Array<{ id: string; name: string; photo?: string | null }>;
  /** + they owe you, − you owe them, summed over the group's members. */
  balance: number;
}

/** Your groups, by name, with their members and the group's balance (when Money is installed). */
export function loadGroups(os: LifeOSContext): GroupItem[] {
  const money = os.registry.objects.has('debt');
  return os.records.query<GroupData>('group', { sort: [{ field: 'title', dir: 'asc' }] }, { limit: 500 }).map((g) => ({
    group: g,
    members: (g.data.memberIds ?? []).flatMap((id) => {
      const p = os.records.get<PersonData>(id);
      return p ? [{ id: p.id, name: p.title, photo: p.data.photo?.uri ?? null }] : [];
    }),
    balance: money ? balances(os, g.id).reduce((a, b) => a + b.amount, 0) : 0,
  }));
}

export const groupKindLabel = (kind?: string) => GROUP_KINDS.find((k) => k.value === kind)?.label ?? null;

/** The group row: stacked faces, name, "Home · 3 people", the balance chip, a chevron. */
export function GroupRow({ item, line, chevron, format, onPress }: { item: GroupItem; line: string; chevron?: boolean; format: (n: number) => string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.group.title}, ${line}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, opacity: pressed ? 0.75 : 1 })}>
      {item.members.length ? <FaceStack people={item.members} size={24} ground={t.c.bg.tile} max={4} /> : (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="people" size={14} color={t.c.fg.secondary} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{item.group.title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{line}</Text>
      </View>
      {item.balance ? <BalanceChip amount={item.balance} format={format} /> : null}
      {chevron ? <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} /> : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* G4 · the A–Z rail                                                   */
/* ------------------------------------------------------------------ */

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
const STEP = 19; // an 18 letter and a 1 gap
const RAIL_PAD = 6;

/** A name's letter: its first letter, accents dropped; anything else is "#". */
export function letterOf(name: string): string {
  const c = name.trim().normalize('NFD').replace(/[̀-ͯ]/g, '')[0]?.toUpperCase() ?? '#';
  return c >= 'A' && c <= 'Z' ? c : '#';
}

/** G4: letters down the right edge (those with people white, the rest faint). Tap or drag to jump; while dragging the strip darkens and a lime bubble shows the letter. */
function AZRail({ present, current, onJump }: { present: Set<string>; current: string | null; onJump: (letter: string) => void }) {
  const t = useTheme();
  const ref = useRef<View>(null);
  const top = useRef(0);
  const [drag, setDrag] = useState<number | null>(null);
  const pick = (pageY: number) => {
    const i = Math.max(0, Math.min(LETTERS.length - 1, Math.floor((pageY - top.current - RAIL_PAD) / STEP)));
    setDrag(i);
    // An empty letter jumps to the next one that has people (else the one before).
    const after = LETTERS.slice(i).find((l) => present.has(l));
    const before = [...LETTERS.slice(0, i)].reverse().find((l) => present.has(l));
    const target = after ?? before;
    if (target) onJump(target);
  };
  const shown = drag != null ? LETTERS[drag]! : current;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center' }}>
      <View>
        <View
          ref={ref}
          onLayout={() => ref.current?.measureInWindow((_x, y) => (top.current = y))}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => {
            const y = e.nativeEvent.pageY;
            ref.current?.measureInWindow((_x, wy) => {
              top.current = wy;
              pick(y);
            });
          }}
          onResponderMove={(e) => pick(e.nativeEvent.pageY)}
          onResponderRelease={() => setDrag(null)}
          onResponderTerminate={() => setDrag(null)}
          accessibilityRole="adjustable"
          accessibilityLabel="Jump to a letter"
          accessibilityValue={shown ? { text: shown } : undefined}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            const list = LETTERS.filter((l) => present.has(l));
            const at = Math.max(0, list.indexOf(current ?? list[0]!));
            const next = list[e.nativeEvent.actionName === 'increment' ? Math.min(list.length - 1, at + 1) : Math.max(0, at - 1)];
            if (next) onJump(next);
          }}
          style={{ alignItems: 'center', gap: 1, paddingVertical: RAIL_PAD, paddingHorizontal: 3, borderRadius: 999, backgroundColor: drag != null ? 'rgba(255,255,255,0.06)' : 'transparent' }}
        >
          {LETTERS.map((l) => {
            const on = l === shown;
            return (
              <View key={l} pointerEvents="none" style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.accent.mustard : 'transparent' }}>
                <Text style={{ fontSize: 10, lineHeight: 13, fontWeight: on ? '800' : '700', color: on ? t.c.fg.onAccent : present.has(l) ? t.c.fg.primary : 'rgba(245,245,247,0.22)' }}>{l}</Text>
              </View>
            );
          })}
        </View>
        {drag != null ? (
          <View pointerEvents="none" style={{ position: 'absolute', right: 42, top: RAIL_PAD + drag * STEP + 9 - 28, width: 56, height: 56, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 6, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}>
            <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '800', color: t.c.fg.onAccent }}>{LETTERS[drag]}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The list screen                                                     */
/* ------------------------------------------------------------------ */

type Sort = 'spoke' | 'name';
type View_ = 'relationship' | 'az';

/** Longest since you spoke first; "never" last. */
const bySpoke = (a: ObjectRecord<PersonData>, b: ObjectRecord<PersonData>) => {
  const da = daysSince(a.data.lastContactAt);
  const db = daysSince(b.data.lastContactAt);
  if (da == null || db == null) return da == null && db == null ? a.title.localeCompare(b.title) : da == null ? 1 : -1;
  return db - da || a.title.localeCompare(b.title);
};
const byName = (a: ObjectRecord<PersonData>, b: ObjectRecord<PersonData>) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

/**
 * Everyone, or one relationship (`params.relationship`, comma-separated:
 * "colleague,client" is Work), or just the groups (`params.view = 'groups'`).
 * `params.title` names the screen when the home opens a filter.
 */
export function PeopleList({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const groupsOnly = params.view === 'groups';
  const [q, setQ] = useState('');
  const [rel, setRel] = useState<string[]>(() => (params.relationship ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const [sort, setSort] = useState<Sort>('spoke');
  const [view, setView] = useState<View_>(params.view === 'az' ? 'az' : 'relationship');
  const scroll = useRef<ScrollView>(null);
  const azTop = useRef(0);
  const offsets = useRef<Record<string, number>>({});
  const [current, setCurrent] = useState<string | null>(null);

  const data = useLive((os) => {
    const people = os.records.query<PersonData>('person', {}, { limit: 5000 });
    const groups = loadGroups(os);
    const groupOf = new Map<string, string>();
    for (const g of groups) for (const m of g.group.data.memberIds ?? []) if (!groupOf.has(m)) groupOf.set(m, g.group.title);
    return { people, groups, groupOf, options: relationshipOptions() };
  }, []);
  const { options } = data;
  const format = ctx.format.currency;

  const shown = useMemo(() => data.people.filter((p) => (!rel.length || rel.includes(p.data.relationship ?? '')) && matchesPerson(p, q)), [data.people, rel, q]);
  const groupsShown = useMemo(() => (rel.length && !groupsOnly ? [] : data.groups.filter((g) => !q.trim() || g.group.title.toLowerCase().includes(q.trim().toLowerCase()) || g.members.some((m) => m.name.toLowerCase().includes(q.trim().toLowerCase())))), [data.groups, rel, q, groupsOnly]);

  // Pills: All, then every relationship someone has, and every one you added.
  const used = useMemo(() => new Set(data.people.map((p) => p.data.relationship).filter(Boolean) as string[]), [data.people]);
  const builtin = new Set(BUILTIN_RELATIONSHIPS.map((o) => o.value));
  const pills = options.filter((o) => used.has(o.value) || !builtin.has(o.value) || rel.includes(o.value));

  const az = view === 'az' && !groupsOnly;
  const sorted = [...shown].sort(az || sort === 'name' ? byName : bySpoke);
  const line = (p: ObjectRecord<PersonData>) => personLine(p, data.groupOf.get(p.id), options);
  const open = (p: ObjectRecord<PersonData>) => router.push(`/entity/person/${p.id}` as never);

  const byRel = useMemo(() => {
    const out: Array<{ key: string; label: string; people: ObjectRecord<PersonData>[] }> = [];
    for (const o of options) {
      const ps = sorted.filter((p) => p.data.relationship === o.value);
      if (ps.length) out.push({ key: o.value, label: o.label, people: ps });
    }
    const rest = sorted.filter((p) => !options.some((o) => o.value === p.data.relationship));
    if (rest.length) out.push({ key: 'other', label: 'No relationship', people: rest });
    return out;
  }, [sorted, options]);

  const letters = useMemo(() => {
    const m = new Map<string, ObjectRecord<PersonData>[]>();
    for (const p of sorted) {
      const l = letterOf(p.title);
      m.set(l, [...(m.get(l) ?? []), p]);
    }
    return LETTERS.filter((l) => m.has(l)).map((l) => ({ letter: l, people: m.get(l)! }));
  }, [sorted]);
  const present = useMemo(() => new Set(letters.map((l) => l.letter)), [letters]);

  const jump = (l: string) => {
    const y = offsets.current[l];
    if (y == null) return;
    setCurrent(l);
    scroll.current?.scrollTo({ y: Math.max(0, azTop.current + y - 8), animated: false });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!az) return;
    const y = e.nativeEvent.contentOffset.y - azTop.current + 16;
    let at: string | null = letters[0]?.letter ?? null;
    for (const { letter } of letters) if ((offsets.current[letter] ?? Infinity) <= y) at = letter;
    if (at !== current) setCurrent(at);
  };

  const relTitle = rel.length === 1 ? relationshipLabel(rel[0], options) : null;
  const title = groupsOnly ? 'Groups' : params.title || relTitle || 'Everyone';
  const subtitle = groupsOnly
    ? `${data.groups.length} group${data.groups.length === 1 ? '' : 's'}`
    : rel.length
      ? `${shown.length} of ${data.people.length} people`
      : `${data.people.length} ${data.people.length === 1 ? 'person' : 'people'} · ${az ? 'A–Z' : `${data.groups.length} group${data.groups.length === 1 ? '' : 's'}`}`;

  const groupLine = (g: GroupItem) => [groupKindLabel(g.group.data.kind), String(g.members.length), g.group.data.defaultSplit === 'shares' ? 'by shares' : g.group.data.defaultSplit === 'equal' ? 'equally' : null].filter(Boolean).join(' · ');
  const groupsBlock = groupsShown.length ? (
    <View style={{ gap: 10 }}>
      {groupsOnly ? null : <SectionHead title="Groups" sub={`${groupsShown.length} group${groupsShown.length === 1 ? '' : 's'}`} />}
      <RowCard>
        {groupsShown.map((g) => (
          <GroupRow key={g.group.id} item={g} line={groupLine(g)} format={format} onPress={() => router.push(`/entity/group/${g.group.id}` as never)} />
        ))}
      </RowCard>
    </View>
  ) : null;

  const quiet = (s: string) => (
    <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary, textAlign: 'center', paddingVertical: 20 }}>{s}</Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView
        ref={scroll}
        onScroll={onScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 24, gap: az ? 16 : 20 }}
      >
        <ScreenHeader
          title={title}
          subtitle={subtitle}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/crm/index' as never))}
          right={<IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel={groupsOnly ? 'Add a group' : 'Add a person'} onPress={() => router.push((groupsOnly ? '/entity/group/new' : '/entity/person/new') as never)} />}
        />
        <SearchField value={q} onChange={setQ} placeholder={groupsOnly ? 'Group or member' : undefined} />
        {groupsOnly ? null : (
          <>
            {view === 'relationship' ? (
              <ChipRow>
                <FilterChip label="All" selected={!rel.length} onPress={() => setRel([])} />
                {pills.map((o) => (
                  <FilterChip key={o.value} label={o.label.replace(/ \/ .*$/, '')} selected={rel.includes(o.value)} onPress={() => setRel(rel.length === 1 && rel[0] === o.value ? [] : [o.value])} />
                ))}
              </ChipRow>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {az ? null : <FilterChip label={sort === 'spoke' ? 'Last spoke' : 'Name'} icon="sort" onPress={() => setSort(sort === 'spoke' ? 'name' : 'spoke')} />}
              {az ? <FilterChip label="Name" icon="sort" /> : null}
              <FilterChip label={az ? 'A–Z' : 'By relationship'} icon="filter" onPress={() => setView(az ? 'relationship' : 'az')} />
            </View>
          </>
        )}

        {groupsOnly ? (
          groupsBlock ?? quiet(q ? `No group matches “${q.trim()}”` : 'No groups yet. Add flatmates, a trip crew or family.')
        ) : az ? (
          <View style={{ gap: 6, paddingRight: 22 }} onLayout={(e) => (azTop.current = e.nativeEvent.layout.y)}>
            {letters.map(({ letter, people }) => (
              <View key={letter} style={{ gap: 6 }} onLayout={(e) => (offsets.current[letter] = e.nativeEvent.layout.y)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingHorizontal: 4, paddingBottom: 2 }}>
                  <Text accessibilityRole="header" style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.accent.mustard }}>{letter}</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: t.c.line }} />
                </View>
                <RowCard pad={10}>
                  {people.map((p) => <PersonRow key={p.id} person={p} line={line(p)} options={options} onPress={() => open(p)} />)}
                </RowCard>
              </View>
            ))}
            {!letters.length ? quiet(q ? `No one matches “${q.trim()}”` : 'No one here yet.') : null}
          </View>
        ) : (
          <>
            {byRel.map((g) => (
              <View key={g.key} style={{ gap: 10 }}>
                <Text accessibilityRole="header" style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.tertiary }}>{`${g.label} · ${g.people.length}`.toUpperCase()}</Text>
                <RowCard>
                  {g.people.map((p) => <PersonRow key={p.id} person={p} line={line(p)} options={options} onPress={() => open(p)} />)}
                </RowCard>
              </View>
            ))}
            {!byRel.length ? quiet(q ? `No one matches “${q.trim()}”` : rel.length ? 'No one with this relationship yet.' : 'No one here yet.') : null}
            {groupsBlock}
          </>
        )}
      </ScrollView>
      {az && letters.length ? <AZRail present={present} current={current} onJump={jump} /> : null}
    </View>
  );
}
