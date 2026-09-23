import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@ui/theme/ThemeProvider';
import { TINT_KEYS } from '@ui/theme/tokens';
import { ICON_NAMES } from '@ui/icons';
import {
  BentoGrid,
  Button,
  ChipRow,
  Chip,
  DateField,
  EmptyState,
  FilterChip,
  Icon,
  IconBox,
  IconButton,
  MoneyField,
  NumberField,
  RecordHeader,
  RelationField,
  RowItem,
  Ring,
  SectionCard,
  Segmented,
  SelectField,
  Sheet,
  StackedBar,
  StatTile,
  SwitchField,
  TagsField,
  Text,
  TextField,
  Tile,
  ToastProvider,
  useToast,
} from '@ui/kit';

/**
 * /dev/components — every kit component in light and dark, with realistic
 * data. This is what gets diffed against the Claude Design canvas; a
 * component must appear here before any screen uses it.
 */
export default function ComponentGallery() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const outer = useTheme();
  const [mode, setMode] = useState<'both' | 'light' | 'dark'>('both');
  const modes: Array<'light' | 'dark'> = mode === 'both' ? ['light', 'dark'] : [mode];
  return (
    <ToastProvider>
      <View style={{ flex: 1, backgroundColor: outer.c.bg.ground }}>
        <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconButton icon="chevron-left" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <Text variant="heading" style={{ flex: 1 }}>
            Components
          </Text>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'both', label: 'Both' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {SECTIONS.map(([title, Demo]) => (
            <View key={title}>
              <Text variant="caption" color="secondary" style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {title}
              </Text>
              {modes.map((m) => (
                <ThemeProvider key={m} override={m}>
                  <Panel label={m}>
                    <Demo />
                  </Panel>
                </ThemeProvider>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </ToastProvider>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.c.bg.ground, paddingHorizontal: t.layout.gutter, paddingVertical: 16, gap: 12, borderTopWidth: 1, borderColor: t.c.line }}>
      <Text variant="caption" color="tertiary">
        {label}
      </Text>
      {children}
    </View>
  );
}

const Row = ({ children, wrap = true }: { children: React.ReactNode; wrap?: boolean }) => <View style={{ flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', gap: 8, alignItems: 'center' }}>{children}</View>;

function Colours() {
  const t = useTheme();
  const swatches: Array<[string, string]> = [
    ['ground', t.c.bg.ground], ['tile', t.c.bg.tile], ['raised', t.c.bg.tileRaised], ['bar', t.c.bg.bar],
    ['primary', t.c.fg.primary], ['secondary', t.c.fg.secondary], ['tertiary', t.c.fg.tertiary], ['line', t.c.line],
    ['mustard', t.c.accent.mustard], ['coral', t.c.alert.coral], ['sage', t.c.ok.sage],
  ];
  return (
    <>
      <Row>
        {swatches.map(([n, c]) => (
          <View key={n} style={{ alignItems: 'center', gap: 4, width: 56 }}>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: c, borderWidth: 1, borderColor: t.c.line }} />
            <Text variant="caption" color="secondary">{n}</Text>
          </View>
        ))}
      </Row>
      <Row>
        {TINT_KEYS.map((k) => (
          <View key={k} style={{ width: 72, height: 44, borderRadius: 12, backgroundColor: t.tints[k].fill, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="caption" color={t.tints[k].ink}>{k}</Text>
          </View>
        ))}
      </Row>
    </>
  );
}

function Type() {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="display">₹12,400</Text>
      <Text variant="title">Upkeep</Text>
      <Text variant="heading">Service due in 12 days</Text>
      <Text variant="body">Did the car service today, 6,400 at Hyundai.</Text>
      <Text variant="label">Last washed 24 days ago</Text>
      <Text variant="caption" color="secondary">Updated 2 min ago · by agent</Text>
      <Text variant="stat">35,120 km</Text>
    </View>
  );
}

function Icons() {
  const t = useTheme();
  return (
    <>
      <Row>
        {ICON_NAMES.map((n) => (
          <View key={n} accessibilityLabel={n} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={n} size={24} color={t.c.fg.primary} />
          </View>
        ))}
      </Row>
      <Row>
        {TINT_KEYS.map((k, i) => (
          <IconBox key={k} icon={(['wallet', 'wrench', 'people', 'check', 'heart', 'book', 'plane', 'file'] as const)[i]!} tint={k} />
        ))}
        <IconBox icon="car" tint="upkeep" inverse />
        <IconBox icon="sparkle" />
      </Row>
    </>
  );
}

function Tiles() {
  const t = useTheme();
  return (
    <BentoGrid>
      <StatTile size="1x1" tint="upkeep" icon="alert" label="Overdue" value="3" caption="Sneakers, filter, PUC" tone="alert" onPress={() => {}} />
      <StatTile size="1x1" tint="finance" filled icon="wallet" label="This month" value="₹12,400" caption="30% over pace" />
      <Tile size="2x1" tint="finance" icon="chart" label="Spend" meta="Sep" footer={<StackedBar legend={false} parts={SPEND(t)} />}>
        <Text variant="stat">₹48,210</Text>
      </Tile>
      <Tile size="2x2" tint="upkeep" filled icon="wrench" label="Upkeep" meta="This week" bodyAlign="top">
        <View style={{ gap: 8 }}>
          <RowLine icon="car" text="Creta service" meta="12 days" />
          <RowLine icon="card" text="Jio recharge" meta="3 days" />
          <RowLine icon="shoe" text="Wash white sneakers" meta="overdue" alert />
          <RowLine icon="shirt" text="Laundry" meta="today" />
        </View>
      </Tile>
      <Tile size="1x1" tint="health" icon="activity" label="Habits">
        <Ring progress={0.66} size={72} stroke={9} color={t.tints.health.ink} track={t.tints.health.fill}>
          <Text variant="label">4/6</Text>
        </Ring>
      </Tile>
      <Tile size="1x1" tint="people" icon="people" label="Call">
        <Text variant="heading">Dad</Text>
        <Text variant="caption" color="secondary">9 days since</Text>
      </Tile>
    </BentoGrid>
  );
}

function RowLine({ icon, text, meta, alert }: { icon: 'car' | 'card' | 'shoe' | 'shirt'; text: string; meta: string; alert?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon name={icon} size={18} color={t.tints.upkeep.ink} />
      <Text variant="label" color={t.tints.upkeep.ink} style={{ flex: 1 }} numberOfLines={1}>{text}</Text>
      <Text variant="caption" color={alert ? t.c.alert.coralText : t.tints.upkeep.ink}>{meta}</Text>
    </View>
  );
}

const SPEND = (t: ReturnType<typeof useTheme>) => [
  { label: 'Food', value: 14200, color: t.tints.finance.ink, display: '₹14.2k' },
  { label: 'Car', value: 8600, color: t.tints.upkeep.ink, display: '₹8.6k' },
  { label: 'Bills', value: 6100, color: t.tints.tasks.ink, display: '₹6.1k' },
  { label: 'Other', value: 1900, color: t.c.fg.tertiary, display: '₹1.9k' },
];

function Bars() {
  const t = useTheme();
  return (
    <>
      <StackedBar parts={SPEND(t)} />
      <StackedBar parts={[{ label: 'Paid', value: 3, color: t.c.ok.sage }, { label: 'Due', value: 1, color: t.c.accent.mustard }, { label: 'Late', value: 0.2, color: t.c.alert.coral }]} height={8} />
      <Row>
        <Ring progress={0.25} size={48} stroke={6} />
        <Ring progress={0.8} size={64} stroke={8} color={t.c.ok.sage}>
          <Text variant="caption">80%</Text>
        </Ring>
        <Ring progress={1.2} size={48} stroke={6} color={t.c.alert.coral} />
      </Row>
    </>
  );
}

function Rows() {
  const [done, setDone] = useState(false);
  return (
    <SectionCard title="Due this week" action="All" onAction={() => {}} flush>
      <RowItem icon="car" tint="upkeep" title="Creta · service" subtitle="Every 6 months or 10,000 km" value="12 d" divider onPress={() => {}} />
      <RowItem icon="card" tint="finance" title="Jio recharge" subtitle="₹719 · 84 days" value="₹719" divider onPress={() => {}} />
      <RowItem icon="shoe" tint="upkeep" title="Wash white sneakers" subtitle="Last washed 24 days ago" value="Overdue" valueTone="alert" divider />
      <RowItem icon="shirt" tint="upkeep" title="Laundry" subtitle="Every 4 days" checked={done} onToggle={setDone} />
    </SectionCard>
  );
}

function Chips() {
  const [sel, setSel] = useState('all');
  const opts = ['all', 'Subscriptions', 'Vehicles', 'Things', 'Chores', 'People', 'Documents'];
  return (
    <>
      <ChipRow>
        {opts.map((o) => (
          <FilterChip key={o} label={o === 'all' ? 'All' : o} selected={sel === o} onPress={() => setSel(o)} count={o === 'all' ? 14 : undefined} />
        ))}
      </ChipRow>
      <Row>
        <Chip label="Active" tone="ok" />
        <Chip label="Overdue" tone="alert" icon="alert" />
        <Chip label="Due" tone="accent" />
        <Chip label="Archived" />
        <Chip label="Finance" tint="finance" />
        <Chip label="#car" tint="upkeep" small />
      </Row>
    </>
  );
}

function Buttons() {
  return (
    <>
      <Row>
        <Button title="Mark done" icon="check" />
        <Button title="Snooze" variant="secondary" icon="clock" />
      </Row>
      <Row>
        <Button title="Add cost" variant="ghost" icon="plus" small />
        <Button title="Delete" variant="destructive" icon="trash" small />
        <Button title="Saving" loading small />
        <Button title="Disabled" disabled small />
      </Row>
      <Row>
        <IconButton icon="edit" accessibilityLabel="Edit" filled />
        <IconButton icon="more" accessibilityLabel="More" />
        <IconButton icon="mic" accessibilityLabel="Speak" filled />
      </Row>
    </>
  );
}

function SegmentedDemo() {
  const [v, setV] = useState('list');
  return <Segmented value={v} onChange={setV} options={[{ value: 'list', label: 'List' }, { value: 'week', label: 'This week' }]} />;
}

function Empty() {
  return <EmptyState icon="repeat" tint="upkeep" line="Nothing recurring yet. Say “laundry every 4 days” in Talk, or add one here." action="Add a cycle" onAction={() => {}} />;
}

function SheetAndToast() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <>
      <Row>
        <Button title="Open sheet" variant="secondary" onPress={() => setOpen(true)} />
        <Button title="Show toast" variant="secondary" onPress={() => toast.show({ message: 'Laundry marked done · next in 4 days', icon: 'check', undo: () => toast.show({ message: 'Undone' }) })} />
      </Row>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Mark done" footer={<Button title="Done" block onPress={() => setOpen(false)} />}>
        <Text variant="body" color="secondary">Creta · service</Text>
        <MoneyField label="Cost" value={6400} onChange={() => {}} />
        <NumberField label="Odometer" unit="km" value={35120} onChange={() => {}} />
      </Sheet>
    </>
  );
}

function Fields() {
  const [name, setName] = useState('Creta');
  const [notes, setNotes] = useState('');
  const [amt, setAmt] = useState<number | undefined>(719);
  const [km, setKm] = useState<number | undefined>();
  const [date, setDate] = useState<string | number | undefined>('2026-09-23');
  const [kind, setKind] = useState<string | undefined>('vehicle');
  const [cat, setCat] = useState<string | undefined>();
  const [tags, setTags] = useState(['car', 'hyundai']);
  const [rel, setRel] = useState([{ id: '1', title: 'Hyundai Service Centre' }]);
  const [on, setOn] = useState(true);
  return (
    <View style={{ gap: 16 }}>
      <TextField label="Name" required value={name} onChange={setName} />
      <TextField label="Notes" value={notes} onChange={setNotes} multiline placeholder="Anything worth remembering" />
      <MoneyField label="Amount" value={amt} onChange={setAmt} />
      <NumberField label="Odometer" unit="km" value={km} onChange={setKm} error={km === undefined ? 'Needed for km-based cycles' : undefined} />
      <DateField label="Last done" value={date} onChange={setDate} />
      <SelectField label="Kind" value={kind} onChange={setKind} options={[{ value: 'vehicle', label: 'Vehicle', icon: 'car' }, { value: 'item', label: 'Item', icon: 'shoe' }, { value: 'chore', label: 'Chore', icon: 'shirt' }]} />
      <SelectField label="Category" value={cat} onChange={setCat} options={['Food', 'Fuel', 'Bills', 'Car', 'Health', 'Travel', 'Shopping', 'Gifts'].map((c) => ({ value: c, label: c }))} />
      <RelationField label="Vendor" value={rel} onOpen={() => setRel([...rel, { id: String(rel.length + 1), title: 'Arjun' }])} onRemove={(id) => setRel(rel.filter((r) => r.id !== id))} />
      <TagsField label="Tags" value={tags} onChange={setTags} suggestions={['car', 'hyundai', 'insurance', 'home']} />
      <SwitchField label="Remind me before it's due" hint="3 days before" value={on} onChange={setOn} />
    </View>
  );
}

function Header() {
  return (
    <View style={{ marginHorizontal: -20 }}>
      <RecordHeader
        tint="upkeep"
        icon="car"
        title="Creta"
        subtitle="Hyundai · MH 12 AB 1234"
        status={{ label: 'Service in 12 days', tone: 'accent' }}
        stats={[{ label: 'Odometer', value: '35,120', unit: 'km' }, { label: 'This year', value: '₹18.4k' }, { label: 'Overdue', value: '1', tone: 'alert' }]}
        onBack={() => {}}
        actions={<IconButton icon="edit" accessibilityLabel="Edit" />}
      />
    </View>
  );
}

const SECTIONS: Array<[string, React.ComponentType]> = [
  ['Colour', Colours],
  ['Type', Type],
  ['Icons & IconBox', Icons],
  ['Tile · StatTile · BentoGrid', Tiles],
  ['StackedBar · Ring', Bars],
  ['RowItem · SectionCard · Checkbox', Rows],
  ['Chip · FilterChip', Chips],
  ['Button · IconButton', Buttons],
  ['Segmented', SegmentedDemo],
  ['EmptyState', Empty],
  ['Sheet · Toast with Undo', SheetAndToast],
  ['Form fields', Fields],
  ['RecordHeader', Header],
];
