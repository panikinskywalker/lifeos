import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@ui/theme/ThemeProvider';
import { TINT_KEYS } from '@ui/theme/tokens';
import { ICON_NAMES } from '@ui/icons';
import {
  ActionSheet,
  AgentCard,
  BentoGrid,
  BottomBar,
  Button,
  Card,
  ChatBubble,
  Checkbox,
  Chip,
  ChipRow,
  Composer,
  DateField,
  DayChips,
  DetailRow,
  EmptyState,
  FilterChip,
  Icon,
  IconBox,
  IconButton,
  ListGroup,
  MoneyField,
  NumberField,
  RecordHeader,
  RelationField,
  Ring,
  RowItem,
  RowList,
  ScreenHeader,
  Section,
  Segmented,
  SelectField,
  Sheet,
  StackedBar,
  Stat,
  StatTile,
  Stepper,
  SwitchField,
  TagsField,
  Text,
  TextField,
  Tile,
  Timeline,
  ToastProvider,
  useToast,
  WeekStrip,
} from '@ui/kit';

/**
 * /dev/components — every kit component in light and dark, mirroring the
 * "Components & tokens" sheet of the LifeOS Claude Design canvas with the same
 * sample data, so the two can be compared side by side. A component must
 * appear here before any screen uses it.
 */
export default function ComponentGallery() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const outer = useTheme();
  // One theme by default: every Svg is its own bitmap on Android, and both themes at once ran Expo Go out of memory.
  const [mode, setMode] = useState<'both' | 'light' | 'dark'>(outer.dark ? 'dark' : 'light');
  const modes: Array<'light' | 'dark'> = mode === 'both' ? ['light', 'dark'] : [mode];
  return (
    <ToastProvider>
      <View style={{ flex: 1, backgroundColor: outer.c.bg.ground }}>
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, gap: 16 }}>
          <ScreenHeader title="Components" subtitle="Canvas: Components & tokens" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <Segmented value={mode} onChange={setMode} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'both', label: 'Both' }]} />
        </View>
        <FlatList
          data={SECTIONS}
          keyExtractor={([title]) => title}
          extraData={mode}
          initialNumToRender={3}
          windowSize={5}
          removeClippedSubviews
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          renderItem={({ item: [title, spec, Demo] }) => (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 10 }}>
                <Text variant="labelCaps" color="secondary" style={{ textTransform: 'uppercase' }}>
                  {title}
                </Text>
                <Text variant="caption" color="secondary" style={{ marginLeft: 'auto', fontSize: 12 }} numberOfLines={1}>
                  {spec}
                </Text>
              </View>
              {modes.map((m) => (
                <ThemeProvider key={m} override={m}>
                  <Panel label={m}>
                    <Demo />
                  </Panel>
                </ThemeProvider>
              ))}
            </View>
          )}
        />
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

const Row = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</View>;

function Colours() {
  const t = useTheme();
  const swatches: Array<[string, string]> = [
    ['ground', t.c.bg.ground], ['tile', t.c.bg.tile], ['nested', t.c.bg.tileRaised], ['nav bar', t.c.bg.bar],
    ['ink', t.c.fg.primary], ['secondary', t.c.fg.secondary], ['tertiary', t.c.fg.tertiary], ['track', t.c.line],
    ['mustard', t.c.accent.mustard], ['soft', t.c.accent.mustardSoft], ['coral', t.c.alert.coral], ['coral fill', t.c.alert.coralFill], ['sage', t.c.ok.sage],
  ];
  return (
    <>
      <Row>
        {swatches.map(([n, c]) => (
          <View key={n} style={{ alignItems: 'center', gap: 4, width: 62 }}>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: c, borderWidth: 1, borderColor: t.c.line }} />
            <Text variant="caption" color="secondary" style={{ fontSize: 11 }}>{n}</Text>
          </View>
        ))}
      </Row>
      <Row>
        {TINT_KEYS.map((k) => (
          <View key={k} style={{ width: 76, height: 44, borderRadius: 12, backgroundColor: t.tints[k].fill, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="label" color={t.tints[k].ink}>{k}</Text>
          </View>
        ))}
      </Row>
      <Row>
        {t.c.chart.map((c, i) => (
          <View key={c} style={{ width: 44, height: 14, borderRadius: 7, backgroundColor: c }} accessibilityLabel={`chart ${i + 1}`} />
        ))}
      </Row>
    </>
  );
}

function Type() {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="display">₹76,358</Text>
      <Text variant="stat">34,200 km</Text>
      <Text variant="title">Upkeep</Text>
      <Text variant="heading">This week</Text>
      <Text variant="rowTitle">Jio Prepaid</Text>
      <Text variant="body">did the car service today</Text>
      <Text variant="tileTitle">Spent this month</Text>
      <Text variant="caption" color="secondary">every 84 days · last 12 Jun</Text>
      <Text variant="label">Subscriptions</Text>
      <Text variant="labelCaps" color="secondary" style={{ textTransform: 'uppercase' }}>Overdue</Text>
      <Text variant="nav">Browse</Text>
    </View>
  );
}

function Icons() {
  const t = useTheme();
  return (
    <>
      <Row>
        {ICON_NAMES.map((n) => (
          <View key={n} accessibilityLabel={n} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={n} size={22} color={t.c.fg.primary} />
          </View>
        ))}
      </Row>
      <Row>
        {TINT_KEYS.map((k, i) => (
          <IconBox key={k} icon={(['wallet', 'wrench', 'user', 'check', 'heart', 'book', 'plane', 'file'] as const)[i]!} tint={k} />
        ))}
        <IconBox icon="bell" tone="accent" />
        <IconBox icon="alert" tone="alert" />
      </Row>
    </>
  );
}

const spend = (t: ReturnType<typeof useTheme>) => [
  { label: 'Rent', value: 32000, color: t.c.chart[0], display: '32,000' },
  { label: 'Travel', value: 18400, color: t.c.chart[1], display: '18,400' },
  { label: 'Food', value: 11200, color: t.c.chart[2], display: '11,200' },
  { label: 'Shopping', value: 8900, color: t.c.chart[3], display: '8,900' },
  { label: 'Other', value: 5858, color: t.c.chart[4], display: '5,858' },
];

function Tiles() {
  const t = useTheme();
  const [done, setDone] = useState<Record<string, boolean>>({});
  return (
    <View style={{ gap: 12 }}>
      <BentoGrid>
        <Tile iconTone="alert" icon="alert" label="Overdue">
          <Stat value="2" size="count" tone="alert" caption="Sneakers · Call Dad" />
        </Tile>
        <Tile tint="health" icon="activity" label="Habits">
          <Ring progress={2 / 3} size={72} color={t.tints.health.ink}>
            <Text variant="stat" style={{ fontSize: 18, lineHeight: 20 }}>2/3</Text>
          </Ring>
          <Text variant="caption" color="secondary">1 left today</Text>
        </Tile>
      </BentoGrid>
      <Tile size="2x1" tint="finance" icon="hourglass" label="Running out" meta="2" bodyAlign="top">
        <View style={{ gap: 12 }}>
          {[['jio', 'Jio Prepaid', '84-day plan · auto-pay off', '3 d'], ['nf', 'Netflix', 'monthly · HDFC card', '9 d']].map(([id, title, sub, when]) => (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Checkbox checked={!!done[id!]} onChange={(v) => setDone({ ...done, [id!]: v })} accessibilityLabel={`Done: ${title}`} />
              <IconBox icon="signal" tint="finance" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="rowTitle" numberOfLines={1}>{title}</Text>
                <Text variant="caption" color="secondary">{sub}</Text>
              </View>
              <Text variant="tileTitle">{when}</Text>
            </View>
          ))}
        </View>
      </Tile>
      <Tile size="2x1" tint="finance" icon="wallet" label="Spent this month" meta={<Chip label="Sep" small />} footer={<StackedBar parts={spend(t)} />}>
        <Stat value="₹76,358" size="hero" caption="of ₹1,25,000 budget · 61%" />
      </Tile>
      <StatTile size="2x1" tint="upkeep" filled icon="wrench" label="Filled tile" value="23" caption="cycles tracked" />
    </View>
  );
}

function Bars() {
  const t = useTheme();
  return (
    <>
      <Card>
        <StackedBar parts={spend(t).slice(0, 4).map((p, i) => ({ ...p, display: ['42%', '24%', '15%', '12%'][i] }))} />
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Ring progress={1 / 3} color={t.tints.health.ink}><Text variant="stat" style={{ fontSize: 18 }}>1/3</Text></Ring>
          <Ring progress={2 / 3} color={t.tints.health.ink}><Text variant="stat" style={{ fontSize: 18 }}>2/3</Text></Ring>
          <Ring progress={1} color={t.tints.upkeep.ink}><Icon name="check" size={22} color={t.tints.upkeep.ink} /></Ring>
          <Ring progress={0.61} color={t.tints.finance.ink}><Text variant="stat" style={{ fontSize: 16 }}>61%</Text></Ring>
        </View>
      </Card>
    </>
  );
}

function Rows() {
  const [laundry, setLaundry] = useState(false);
  return (
    <RowList>
      <RowItem icon="signal" tint="finance" title="Jio Prepaid" subtitle="every 84 days · last 4 Jul" value="₹749" meta="in 3 d" onDone={() => {}} />
      <RowItem icon="shirt" tint="upkeep" title="Laundry · darks" subtitle="every 7 days · last 16 Sep" meta="today" checked={laundry} onToggle={setLaundry} />
      <RowItem icon="shoe" tint="upkeep" title="Wash sneakers" subtitle="14 d · last 5 Sep" meta="4 d late" metaTone="alert" onDone={() => {}} doneLabel="Done" />
      <RowItem icon="user" tint="people" title="Priya Sharma" subtitle="Person · settled ₹2,600" onPress={() => {}} />
      <RowItem icon="wrench" tint="upkeep" title="Advaith Hyundai" tag={{ label: 'Vehicle', tint: 'upkeep' }} subtitle="HDFC UPI · Creta" value="−₹6,400" strong />
      <RowItem icon="rupee" tint="people" title="Priya Sharma" tag={{ label: 'Settlement', tint: 'people' }} subtitle="UPI · Goa trip" value="+₹2,600" valueTone="ok" strong />
    </RowList>
  );
}

function Chips() {
  const [sel, setSel] = useState('All');
  return (
    <>
      <ChipRow>
        {['All', 'Vehicles', 'Chores'].map((o) => (
          <FilterChip key={o} label={o} selected={sel === o} onPress={() => setSel(o)} />
        ))}
        <FilterChip label="New view" icon="plus" />
      </ChipRow>
      <Row>
        <Chip label="Bins out" icon="check" tint="upkeep" />
        <Chip label="Laundry" icon="shirt" />
        <Chip label="Sneakers" icon="alert" tone="alertText" />
      </Row>
      <Row>
        <Chip label="Vehicle" tint="upkeep" small />
        <Chip label="Food" tint="finance" small />
        <Chip label="Settlement" tint="people" small />
        <Chip label="Uncategorised" tone="alert" small />
        <Chip label="in 3 d" tone="muted" small />
      </Row>
      <Row>
        <Chip label="Active" tone="ok" caps />
        <Chip label="Optimal" tone="ok" caps small />
        <Chip label="Urgent" tone="alert" caps small />
        <Chip label="Live sync" tone="neutral" caps small />
        <Chip label="Agent briefing" tone="accent" caps small />
      </Row>
    </>
  );
}

function Buttons() {
  return (
    <>
      <Button title="Save routine" icon="check" size="lg" block />
      <Row>
        <Button title="Confirm" icon="check" size="sm" />
        <Button title="Edit" icon="edit" variant="secondary" size="sm" />
        <Button title="Delete" icon="trash" variant="destructive" size="sm" />
        <Button title="Saving" loading size="sm" />
      </Row>
      <Row>
        <IconButton icon="history" accessibilityLabel="History" filled />
        <IconButton icon="filter" accessibilityLabel="Filter" filled />
        <IconButton icon="sort" accessibilityLabel="Sort" filled />
        <IconButton icon="more" accessibilityLabel="More" />
      </Row>
    </>
  );
}

function SegmentedDemo() {
  const [kind, setKind] = useState('chore');
  const [range, setRange] = useState('month');
  return (
    <>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'chore', label: 'Chore' }, { value: 'personal', label: 'Personal' }, { value: 'home', label: 'Home' }]} />
      <Segmented value={range} onChange={setRange} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
    </>
  );
}

function Fields() {
  const [name, setName] = useState('Wash the sneakers');
  const [q, setQ] = useState('');
  const [every, setEvery] = useState(14);
  const [day, setDay] = useState<number | null>(5);
  const [remind, setRemind] = useState(true);
  const [quiet, setQuiet] = useState(false);
  const [cost, setCost] = useState<number | undefined>(6400);
  const [odo, setOdo] = useState<number | undefined>(34200);
  const [date, setDate] = useState<string | number | undefined>('2026-09-23');
  const [cat, setCat] = useState<string | undefined>();
  const [tags, setTags] = useState(['car']);
  const [rel, setRel] = useState([{ id: '1', title: 'Advaith Hyundai' }]);
  return (
    <View style={{ gap: 14 }}>
      <TextField label="Name" value={name} onChange={setName} />
      <TextField label="Search" value={q} onChange={setQ} placeholder="Placeholder text" leading="search" />
      <Stepper label="Repeat every" value={every} onChange={setEvery} unit="days" />
      <DayChips label="Preferred day" value={day} onChange={setDay} />
      <SwitchField icon="bell" iconTone="accent" label="Remind me" hint="Morning of · 8:00" value={remind} onChange={setRemind} />
      <SwitchField icon="moon" label="Quiet hours" hint={quiet ? 'On' : 'Off'} value={quiet} onChange={setQuiet} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><MoneyField label="Cost" value={cost} onChange={setCost} /></View>
        <View style={{ flex: 1 }}><NumberField label="Odometer" unit="km" value={odo} onChange={setOdo} /></View>
      </View>
      <NumberField label="With an error" value={undefined} onChange={() => {}} error="Needed for km-based cycles" />
      <DateField label="Last done" value={date} onChange={setDate} />
      <SelectField label="Category" value={cat} onChange={setCat} options={['Food', 'Fuel', 'Bills', 'Car', 'Health', 'Travel', 'Shopping', 'Gifts'].map((c) => ({ value: c, label: c }))} />
      <RelationField label="Vendor" value={rel} onOpen={() => setRel([...rel, { id: String(rel.length + 1), title: 'Ramesh' }])} onRemove={(id) => setRel(rel.filter((r) => r.id !== id))} />
      <TagsField label="Tags" value={tags} onChange={setTags} suggestions={['car', 'insurance', 'home']} />
    </View>
  );
}

function SheetAndToast() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <>
      <Row>
        <Button title="Open sheet" variant="secondary" size="sm" onPress={() => setOpen(true)} />
        <Button title="Toast · Undo" variant="secondary" size="sm" onPress={() => toast.show({ message: 'Service logged · Creta', icon: 'check', undo: () => toast.show({ message: 'Undone' }) })} />
        <Button title="Toast · Retry" variant="secondary" size="sm" onPress={() => toast.show({ message: 'Couldn’t reach the agent', icon: 'warning', action: { label: 'Retry', onPress: () => {} } })} />
      </Row>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Log a service" footer={<Button title="Save" icon="check" block onPress={() => setOpen(false)} />}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><MoneyField label="Cost" value={6400} onChange={() => {}} /></View>
          <View style={{ flex: 1 }}><NumberField label="Odometer" unit="km" value={34200} onChange={() => {}} /></View>
        </View>
      </Sheet>
    </>
  );
}

function Empty() {
  return <EmptyState icon="check" tint="upkeep" title="Nothing due today" line="Tell your agent what happened and it will file it here." action="Add a routine" />;
}

function Header() {
  return (
    <View style={{ marginHorizontal: -20 }}>
      <RecordHeader
        tint="upkeep"
        icon="car"
        title="Hyundai Creta"
        subtitle="Vehicle · 2022 · Diesel · KA 05"
        status={{ label: 'PUC due today', tone: 'alert' }}
        stats={[{ label: 'odometer', value: '34,200 km' }, { label: 'this year', value: '₹1.2L' }, { label: 'cycles', value: '3' }]}
        onBack={() => {}}
        actions={
          <>
            <IconButton icon="edit" accessibilityLabel="Edit record" filled="overlay" />
            <IconButton icon="more" accessibilityLabel="More" filled="overlay" />
          </>
        }
      />
    </View>
  );
}

function Week() {
  const days = [
    { key: 'mon', weekday: 'Mon', date: 21, dues: [{ id: 'a', icon: 'box' as const, label: 'Bins' }, { id: 'b', icon: 'shoe' as const, overdue: true, label: 'Sneakers' }] },
    { key: 'tue', weekday: 'Tue', date: 22, dues: [] },
    { key: 'wed', weekday: 'Wed', date: 23, today: true, dues: [{ id: 'c', icon: 'shirt' as const, tint: 'upkeep' as const, label: 'Laundry' }, { id: 'd', icon: 'file' as const, tint: 'documents' as const, label: 'PUC' }, { id: 'e', icon: 'signal' as const, tint: 'finance' as const, label: 'Jio' }] },
    { key: 'thu', weekday: 'Thu', date: 24, dues: [{ id: 'f', icon: 'drop' as const, tint: 'upkeep' as const, label: 'Plants' }] },
    { key: 'fri', weekday: 'Fri', date: 25, dues: [{ id: 'g', icon: 'wind' as const, tint: 'upkeep' as const, label: 'AC filter' }] },
    { key: 'sat', weekday: 'Sat', date: 26, dues: [{ id: 'h', icon: 'user' as const, tint: 'people' as const, label: 'Call Dad' }] },
    { key: 'sun', weekday: 'Sun', date: 27, dues: [] },
  ];
  const [sel, setSel] = useState('wed');
  return <WeekStrip days={days} selected={sel} onSelect={setSel} />;
}

function Agent() {
  return (
    <View style={{ gap: 12 }}>
      <ChatBubble text="did the car service, 6,400 at hyundai, 34,200 on the odo" />
      <AgentCard kind="record" icon="wrench" tint="upkeep" title="Service logged · Creta" detail="₹6,400 · Hyundai · 34,200 km" next="Next due 23 Mar 2027 or 44,200 km" filedUnder="Vehicles › Creta · Finance › Car" onUndo={() => {}} />
      <AgentCard kind="confirm" icon="user" tint="people" title="Settle ₹2,600 from Priya?" detail="Her balance goes from ₹4,000 to ₹1,400 owed to you" onConfirm={() => {}} onEdit={() => {}} />
      <AgentCard kind="number" icon="car" tint="finance" label="On the car this year" value="₹18,400" detail="Maintenance only · ₹1.2L with fuel and insurance" />
      <AgentCard
        kind="list"
        label="Where it went"
        items={[
          { id: '1', icon: 'wrench', tint: 'upkeep', title: 'Service', subtitle: '2 visits · Advaith Hyundai', value: '₹12,800' },
          { id: '2', icon: 'gauge', tint: 'upkeep', title: 'Tyres', subtitle: 'Rear pair · 9 Jun', value: '₹5,480' },
          { id: '3', icon: 'file', tint: 'documents', title: 'PUC', subtitle: '23 Mar', value: '₹120' },
        ]}
      />
    </View>
  );
}

function ComposerDemo() {
  const [text, setText] = useState('priya paid me back 2,600');
  return <Composer value={text} onChange={setText} onSend={() => setText('')} onMic={() => {}} />;
}

function Headers() {
  return (
    <View style={{ gap: 16 }}>
      <ScreenHeader compact title="Good morning, Rutvij" subtitle="Wednesday 23 Sep · 4 things need you" right={<IconButton icon="user-circle" accessibilityLabel="Your profile" filled />} />
      <ScreenHeader title="Transactions" subtitle="September · ₹76,358 out" onBack={() => {}} right={<><IconButton icon="filter" accessibilityLabel="Filter" filled /><IconButton icon="sort" accessibilityLabel="Sort" filled /></>} />
    </View>
  );
}

function Lists() {
  return (
    <View style={{ gap: 16 }}>
      <ListGroup title="Today" meta="₹6,520 out · ₹2,600 in">
        <RowItem icon="wrench" tint="upkeep" title="Advaith Hyundai" tag={{ label: 'Vehicle', tint: 'upkeep' }} subtitle="HDFC UPI · Creta" value="−₹6,400" strong />
      </ListGroup>
      <Section title="Cycles" meta="service · insurance · PUC">
        <RowItem icon="wrench" tint="upkeep" title="Service" subtitle="6 mo / 10,000 km · done today" value="23 Mar 2027" valueTone="secondary" meta="or 44,200 km" onDone={() => {}} />
      </Section>
      <Card icon="book" tint="memory" title="Notes" meta="Edited today">
        <Text variant="body" style={{ lineHeight: 21 }}>Rear-left tyre loses air slowly — mention at the next service.</Text>
      </Card>
      <Card>
        <DetailRow label="Make" value="Hyundai" divider />
        <DetailRow label="Insurer" value="HDFC Ergo" onPress={() => {}} divider />
        <DetailRow label="Notes" value="Spare key in the kitchen drawer. Service book in the glovebox." />
      </Card>
    </View>
  );
}

function History() {
  const t = useTheme();
  return (
    <Section title="Recent" meta="timeline">
      <Card>
        <Timeline
          entries={[
            { id: '1', title: 'Service · Advaith Hyundai', body: 'Today · 34,200 km · oil, filters, brake pads', value: '₹6,400', color: t.tints.upkeep.ink },
            { id: '2', title: 'Fuel · Shell ORR', body: '9 Sep · 34,010 km · 38 L', value: '₹2,900', color: t.tints.finance.ink },
            { id: '3', title: 'PUC · Advaith Hyundai', body: '23 Mar · valid 6 months', value: '₹120', color: t.tints.documents.ink },
          ]}
        />
      </Card>
    </Section>
  );
}

function Actions() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button title="Open action sheet" variant="secondary" size="sm" onPress={() => setOpen(true)} />
      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Hyundai Creta"
        actions={[
          { label: 'Edit', icon: 'edit', onPress: () => {} },
          { label: 'Duplicate', icon: 'file', onPress: () => {} },
          { label: 'Archive', icon: 'archive', onPress: () => {} },
          { label: 'Delete', icon: 'trash', destructive: true, onPress: () => {} },
        ]}
      />
    </>
  );
}

function Bar() {
  const [tab, setTab] = useState('today');
  return (
    <View style={{ paddingTop: 30 }}>
      <BottomBar
        floating={false}
        active={tab}
        onPress={setTab}
        items={[
          { key: 'today', label: 'Today', icon: 'sun' },
          { key: 'upkeep', label: 'Upkeep', icon: 'repeat' },
          { key: 'talk', label: 'Talk', icon: 'mic', primary: true },
          { key: 'browse', label: 'Browse', icon: 'folder' },
          { key: 'you', label: 'You', icon: 'user-circle' },
        ]}
      />
    </View>
  );
}

const SECTIONS: Array<[string, string, React.ComponentType]> = [
  ['Colour', 'surfaces · tints · chart', Colours],
  ['Type', 'Plus Jakarta Sans · tabular numerals', Type],
  ['Icons · IconBox', '2px stroke · round caps · tint + ink', Icons],
  ['Tile', '1×1 · 2×1 · 2×2 · radius 20 · pad 16', Tiles],
  ['StackedBar · Ring', '14 tall · 3px gaps · stroke 9', Bars],
  ['RowItem', 'done button · checkbox · Done pill · navigation · tag', Rows],
  ['Chip / FilterChip', 'filter · checklist · tag', Chips],
  ['Button · IconButton', 'radius 14 · mustard primary', Buttons],
  ['Segmented', 'pill track · mustard selected', SegmentedDemo],
  ['Form fields', 'input · stepper · day chips · toggle', Fields],
  ['Sheet · Toast', 'radius 24 top · scrim 28% · nav-bar ink', SheetAndToast],
  ['EmptyState', 'centered · one calm action', Empty],
  ['RecordHeader', 'module tint band · status chip · 3 stats', Header],
  ['WeekStrip', 'today in mustard · dues as pills', Week],
  ['AgentCard · ChatBubble', 'record · confirm · number · list', Agent],
  ['Composer', 'field · mic · mustard send', ComposerDemo],
  ['ScreenHeader', 'title 30 · subtitle 14 · round actions', Headers],
  ['Sections · Card · DetailRow', 'list group · section · notes', Lists],
  ['Timeline', 'dots on a rail', History],
  ['ActionSheet', 'rows in a sheet', Actions],
  ['BottomBar', 'dark pill · inset 20 · radius 22 · centre raised', Bar],
];
