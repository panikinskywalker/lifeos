import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { compareMetric, formatMetric, isoDay, METRICS, screenTopApps, type MetricId } from '@core/dashboard/metrics';
import { usageDays } from '@core/sources/deviceData';
import { latestMeasurement, workoutsIn } from '@modules/health';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { IconButton, Screen, Text, niceMax, useToast } from '@ui/kit';
import { homeLayout, saveHomeLayout } from '../../screens/homeLayout';
import { Bars, Caps, Disc, GridLegend, Group, Hairline, Head, Lines, MissingCard, Note, Panel, Pill, Row, RowValue, SecHead, Seg, StatCell, StatRow, WideButton, YearGrid, changeTone, kindIcon, originIcon, pageFor, type PageDef, type PageKey } from './parts';
import { atNoon, barView, clock, dayWords, lineView, readingsIn, shortDay, splitValue, yearGrid, type BarPeriod, type Reading } from './data';

/**
 * One page per metric. Steps, heart rate and screen time are drawn to
 * NR-Health-Steps (a period switch, the month's bars with its average and
 * best day, against the month before, 26 weeks, the readings); sleep and
 * weight to NR-Health-Weight (a line against the period before, then the
 * readings with where each came from). Each adds what only it has.
 */

const NEW_WEIGHT = '/entity/measurement/new?metric=weight';
const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
const percent = (c: number) => `${signed(c)}${Math.abs(Math.round(c * 100))}%`;

function useBack() {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/module/health' as never));
}

/** Round pin: shows a metric's tile on Today, or takes it off (only metrics with a tile have one). */
function PinButton({ tile }: { tile: string }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const layout = useLive((o) => homeLayout(o), []);
  const pinned = !layout.find((x) => x.id === tile)?.hidden;
  const toggle = () => {
    saveHomeLayout(os, layout.map((x) => (x.id === tile ? { ...x, hidden: pinned } : x)));
    toast.show({ message: pinned ? 'Taken off Today' : 'Pinned to Today', icon: 'pin', undo: () => saveHomeLayout(os, layout) });
  };
  return <IconButton icon="pin" filled color={pinned ? t.c.fg.primary : t.c.fg.tertiary} accessibilityLabel={pinned ? 'Take off Today' : 'Pin to Today'} onPress={toggle} />;
}

const sourceSub = (p: PageDef, plural = false) => `Metric${plural ? 's' : ''} · from ${p.source === 'usage' ? 'Usage access' : 'Health Connect'}`;

function bestIndex<T>(rows: T[], valueOf: (r: T) => number | null, better: 'up' | 'down' | 'none') {
  let at = -1;
  rows.forEach((r, i) => {
    const v = valueOf(r);
    if (v == null) return;
    const cur = at >= 0 ? valueOf(rows[at]!)! : null;
    if (cur == null || (better === 'down' ? v < cur : v > cur)) at = i;
  });
  return at;
}

function bigNumberParts(id: MetricId, text: string) {
  return id === 'steps' ? { num: text, unit: 'steps' } : splitValue(text);
}

function Big({ num, unit }: { num: string; unit?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 40, lineHeight: 41, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'], flexShrink: 1 }}>{num}</Text>
      {unit ? <Text color="secondary" numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{unit}</Text> : null}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 }}>
      <Text color="secondary" style={{ fontSize: 14, lineHeight: 18 }}>{label}</Text>
      <Text variant="label" numberOfLines={1} style={{ flexShrink: 1, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

function RoundNav({ dir, label, onPress, disabled }: { dir: 'chevron-left' | 'chevron-right'; label: string; onPress: () => void; disabled?: boolean }) {
  return <IconButton icon={dir} filled size={36} accessibilityLabel={label} disabled={disabled} onPress={onPress} />;
}

/** Empty: the one-metric card, then what to do. */
function NoData({ page }: { page: PageDef }) {
  const router = useRouter();
  const back = useBack();
  return (
    <Screen contentStyle={{ gap: 24 }}>
      <Head dot sub={sourceSub(page)} title={page.title} onBack={back} right={page.tile ? <PinButton tile={page.tile} /> : undefined} />
      <MissingCard page={page} action={page.key === 'weight' ? 'Add a reading' : 'Data sources'} onAction={() => router.push((page.key === 'weight' ? NEW_WEIGHT : '/settings/sources') as never)} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Steps, heart rate, screen time                                       */
/* ------------------------------------------------------------------ */

const BAR_PERIODS: Array<{ value: BarPeriod; label: string }> = [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }];

function BarPage({ ctx, page }: { ctx: LifeOSContext; page: PageDef }) {
  const router = useRouter();
  const t = useTheme();
  const back = useBack();
  const id = page.metric;
  const def = METRICS[id];
  const [period, setPeriod] = useState<BarPeriod>('month');
  const [offset, setOffset] = useState(0);
  const [allReadings, setAllReadings] = useState(false);
  const f = (v: number) => formatMetric(id, v, ctx.format.currency);

  const d = useLive((os) => {
    const now = Date.now();
    const today = isoDay(now);
    const view = barView(os, id, period, offset, now);
    const grid = yearGrid(os, id, now);
    const alsoDays = page.also ? new Map(readingsIn(os, page.also, view.from, view.to).map((r) => [r.day, r.value])) : null;
    return {
      view,
      cmp: compareMetric(os, id, now),
      grid,
      readings: readingsIn(os, id, view.from, view.to),
      alsoDays,
      alsoToday: alsoDays?.get(today) ?? null,
      walks: page.key === 'steps' ? workoutsIn(os, 7, now).workouts.filter((w) => w.kind === 'walk' || w.kind === 'run') : [],
      apps: page.key === 'screen' ? screenTopApps(os, 'week', now, 8) : [],
      usageToday: page.key === 'screen' ? usageDays(os, today, today)[0] ?? null : null,
    };
  }, [id, period, offset, page.key, page.also]);

  if (!d.grid.cells.some((c) => c != null) && !d.view.days.length) return <NoData page={page} />;

  const v = d.view;
  const bars = v.buckets.map((b) => b.value);
  const lit = period === 'day' ? bars.length - 1 : bestIndex(bars, (x) => x, def.better);
  const big = def.agg === 'sum' && period !== 'day' ? v.total : period === 'day' ? v.days[0]?.value ?? null : v.perDay;
  const bigParts = big != null ? bigNumberParts(id, f(big)) : null;
  const dayIdx = bestIndex(v.days, (x) => x.value, def.better);
  const worstIdx = bestIndex(v.days, (x) => x.value, def.better === 'down' ? 'up' : 'down');
  const bestDay = v.days[dayIdx];
  const worstDay = v.days[worstIdx];
  const scale = niceMax(Math.max(...v.days.map((x) => x.value), v.prevPerDay ?? 0, 1));
  const shown = allReadings ? d.readings : d.readings.slice(0, 5);

  return (
    <Screen contentStyle={{ gap: 24 }}>
      <Head dot sub={sourceSub(page)} title={page.title} onBack={back} right={page.tile ? <PinButton tile={page.tile} /> : undefined} />
      <Seg label="Period" options={BAR_PERIODS} value={period} onChange={(p) => { if (p) { setPeriod(p); setOffset(0); } }} />

      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <RoundNav dir="chevron-left" label={v.earlier} onPress={() => setOffset((o) => o - 1)} />
          <Text variant="tileTitle" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>{v.title}</Text>
          <RoundNav dir="chevron-right" label={v.later} disabled={offset >= 0} onPress={() => setOffset((o) => o + 1)} />
        </View>
        {bigParts ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Big num={bigParts.num} unit={bigParts.unit} />
              {period !== 'day' && v.perDay != null ? (
                <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{def.agg === 'sum' ? `${f(v.perDay)} a day · dashed line` : 'a day on average · dashed line'}</Text>
              ) : null}
            </View>
            {v.change != null ? <Pill label={`${percent(v.change)} ${v.vs}`} tone={changeTone(v.change, def.better)} /> : null}
          </View>
        ) : (
          <Text variant="caption" color="secondary">No {def.label.toLowerCase()} for this period.</Text>
        )}
        {bars.some((x) => x != null) ? (
          <Bars
            values={bars}
            labels={v.buckets.map((b) => b.label)}
            height={140}
            lit={lit}
            average={period === 'day' ? null : v.perDay}
            pill={lit >= 0 && bars[lit] != null ? f(bars[lit]!) : null}
            label={`${def.label}, ${v.title}${bestDay ? `; ${def.better === 'down' ? 'lowest' : 'highest'} ${dayWords(bestDay.day)} at ${f(bestDay.value)}` : ''}`}
          />
        ) : null}
      </Panel>

      {v.days.length ? (
        <View style={{ gap: 10 }}>
          <View style={{ paddingTop: 6, paddingHorizontal: 4 }}>
            <Text variant="heading">{v.prevPerDay != null ? v.against : v.title}</Text>
            {page.better ? <Text variant="caption" color="secondary">{page.better}</Text> : null}
          </View>
          <View style={{ padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, gap: 14 }}>
            <StatRow bare>
              {v.perDay != null ? <StatCell label={v.nowCaps} value={f(v.perDay)} /> : null}
              {v.prevPerDay != null ? <StatCell label={v.prevCaps} value={f(v.prevPerDay)} dim /> : null}
            </StatRow>
            <View style={{ gap: 6 }}>
              {v.perDay != null ? <Meter pct={v.perDay / scale} color={t.c.accent.mustard} /> : null}
              {v.prevPerDay != null ? <Meter pct={v.prevPerDay / scale} color={t.c.fg.tertiary} /> : null}
            </View>
            <Hairline />
            <View style={{ gap: 8 }}>
              {bestDay && v.days.length > 1 ? <Fact label={def.better === 'down' ? 'Lowest day' : def.better === 'up' ? 'Best day' : 'Highest day'} value={`${dayWords(bestDay.day)} · ${f(bestDay.value)}`} /> : null}
              {worstDay && v.days.length > 1 ? <Fact label={def.better === 'up' ? 'Quietest day' : 'Highest day'} value={`${dayWords(worstDay.day)} · ${f(worstDay.value)}`} /> : null}
              <Fact label="Days with a reading" value={`${v.days.length} of ${v.span}`} />
              {d.cmp.thisWeek != null && d.cmp.lastWeek != null && period !== 'week' ? <Fact label="This week vs last" value={`${f(d.cmp.thisWeek)} · ${f(d.cmp.lastWeek)}`} /> : null}
              {d.cmp.usual != null ? <Fact label="Your usual week" value={`${f(d.cmp.usual)}${d.cmp.vsUsual != null ? ` · ${percent(d.cmp.vsUsual)}` : ''}`} /> : null}
              {page.also && d.alsoToday != null ? <Fact label="Average through today" value={formatMetric(page.also, d.alsoToday, ctx.format.currency)} /> : null}
            </View>
          </View>
        </View>
      ) : null}

      {d.grid.cells.some((c) => c != null) ? (
        <View style={{ gap: 10 }}>
          <SecHead title="The year" sub="Last 26 weeks · brighter is more" />
          <Panel>
            <YearGrid cells={d.grid.cells} label={`${def.label} per day for the last 26 weeks`} />
            <GridLegend range={d.grid.range} />
          </Panel>
        </View>
      ) : null}

      {page.key === 'screen' ? <ScreenExtras apps={d.apps} usage={d.usageToday} fmt={(h) => formatMetric('screen', h, ctx.format.currency)} /> : null}

      {d.readings.length ? (
        <View style={{ gap: 10 }}>
          <SecHead title="Readings" sub={page.key === 'screen' ? 'A day’s total, newest first' : 'One Measurement a day, newest first'} action={d.readings.length > 5 ? (allReadings ? 'Less' : `All ${d.readings.length}`) : undefined} onAction={() => setAllReadings((a) => !a)} />
          <Group>
            {shown.map((r) => {
              const also = d.alsoDays?.get(r.day);
              const sub = [originWords(r, page), also != null ? `average ${formatMetric(page.also!, also, ctx.format.currency)}` : null].filter(Boolean).join(' · ');
              return (
                <Row key={r.key} title={dayWords(r.day)} sub={sub} right={<>{bestDay && r.day === bestDay.day && v.days.length > 1 && def.better !== 'none' ? <Pill small label="best" tone="good" /> : null}<RowValue>{f(r.value)}</RowValue></>} onPress={r.id ? () => router.push(`/entity/measurement/${r.id}` as never) : undefined} />
              );
            })}
          </Group>
        </View>
      ) : null}

      {d.walks.length ? (
        <View style={{ gap: 10 }}>
          <SecHead title="Walks and runs this week" />
          <Group>
            {d.walks.map((w) => (
              <Row key={w.id} minHeight={56} lead={<Disc icon={kindIcon(w.kind)} color={t.c.accent.mustard} />} title={w.title} sub={`${dayWords(w.date)}${w.km ? ` · ${w.km} km` : ''}`} right={<RowValue>{w.minutes} min</RowValue>} onPress={() => router.push(`/entity/workout/${w.id}` as never)} />
            ))}
          </Group>
        </View>
      ) : null}
    </Screen>
  );
}

function Meter({ pct, color }: { pct: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: t.c.bg.tileRaised, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%`, height: '100%', borderRadius: 5, backgroundColor: color }} />
    </View>
  );
}

function ScreenExtras({ apps, usage, fmt }: { apps: Array<{ package: string; label: string; ms: number }>; usage: { pickups?: number | null; firstUse?: number | null; lastUse?: number | null } | null; fmt: (hours: number) => string }) {
  const t = useTheme();
  return (
    <>
      {usage && (usage.pickups || usage.firstUse) ? (
        <View style={{ padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, gap: 8 }}>
          {usage.pickups ? <Fact label="Pickups today" value={String(usage.pickups)} /> : null}
          {usage.firstUse ? <Fact label="First and last use" value={`${clock(usage.firstUse)} to ${usage.lastUse ? clock(usage.lastUse) : 'now'}`} /> : null}
        </View>
      ) : null}
      {apps.length ? (
        <View style={{ gap: 10 }}>
          <SecHead title="Apps this week" />
          <Group>
            {apps.map((a) => <Row key={a.package} lead={<Disc icon="signal" color={t.tints.tasks.ink} />} title={a.label} right={<RowValue>{fmt(a.ms / 3_600_000)}</RowValue>} />)}
          </Group>
        </View>
      ) : null}
    </>
  );
}

function originWords(r: Reading, page: PageDef) {
  if (r.origin.kind === 'source') return page.source === 'usage' ? 'Usage access' : 'Health Connect';
  if (r.origin.kind === 'dump') return `From a Dump: “${r.origin.said}”`;
  return `Added by you${r.notes ? ` · ${r.notes}` : ''}`;
}

/* ------------------------------------------------------------------ */
/* Sleep, weight                                                        */
/* ------------------------------------------------------------------ */

type LinePeriod = 'week' | 'month' | 'year';
const LINE_PERIODS: Array<{ value: LinePeriod; label: string }> = [{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }];
const WEEKDAY3 = (day: string) => atNoon(day).toLocaleDateString('en-GB', { weekday: 'short' });

/** The bottom axis: each night in a week (Today last), four dates in a month, each month in a year. */
function xLabelsFor(buckets: Array<{ key: string; label: string }>, period: LinePeriod, known: number[], fit: boolean) {
  if (period === 'week') return buckets.map((b, i) => ({ at: i, text: i === buckets.length - 1 ? 'Today' : WEEKDAY3(b.key), lit: i === buckets.length - 1 }));
  if (period === 'year') return buckets.map((b, i) => ({ at: i, text: b.label }));
  const first = fit ? known[0] ?? 0 : 0;
  const last = fit ? known[known.length - 1] ?? 0 : buckets.length - 1;
  const ticks = last - first < 3 ? [first, last] : [first, first + Math.round((last - first) / 3), first + Math.round(((last - first) * 2) / 3), last];
  return [...new Set(ticks)].map((i) => ({ at: i, text: shortDay(buckets[i]!.key) }));
}

function SleepPage({ ctx, page }: { ctx: LifeOSContext; page: PageDef }) {
  const router = useRouter();
  const back = useBack();
  const [period, setPeriod] = useState<LinePeriod>('week');
  const [all, setAll] = useState(false);
  const f = (v: number) => formatMetric('sleep', v, ctx.format.currency);
  const t = useTheme();
  const d = useLive((os) => {
    const now = Date.now();
    const { s, before } = lineView(os, 'sleep', period, now);
    return { s, before, cmp: compareMetric(os, 'sleep', now), nights: readingsIn(os, 'sleep', s.from, s.to), has: !!latestMeasurement(os, 'sleep') };
  }, [period]);
  if (!d.has) return <NoData page={page} />;

  const words = { week: { title: 'Weekly average', sub: 'this week vs last · dashed = last week', prev: 'LAST WEEK' }, month: { title: '30-day average', sub: 'these 30 days vs the 30 before · dashed = before', prev: 'THE 30 BEFORE' }, year: { title: 'Yearly average', sub: 'this year vs last · dashed = last year', prev: 'LAST YEAR' } }[period];
  const values = d.s.buckets.map((b) => b.value);
  const known = values.flatMap((v, i) => (v == null ? [] : [i]));
  const nights = d.nights;
  const longest = nights.length ? nights[bestIndex(nights, (n) => n.value, 'up')]! : null;
  const shortest = nights.length ? nights[bestIndex(nights, (n) => n.value, 'down')]! : null;
  const gap = d.s.value != null && d.s.prev != null ? Math.round((d.s.value - d.s.prev) * 60) : null;
  const when = (day: string) => (period === 'week' ? WEEKDAY3(day) : shortDay(day));
  const lastKnown = known.length ? values[known[known.length - 1]!]! : null;
  const shown = all ? nights : nights.slice(0, 5);

  return (
    <Screen contentStyle={{ gap: 24 }}>
      <Head dot sub={sourceSub(page)} title={page.title} onBack={back} right={<PinButton tile="sleep" />} />
      <View style={{ gap: 10 }}>
        <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>A night is counted on the morning you wake</Text>
        <Seg label="Sleep period" options={LINE_PERIODS} value={period} onChange={(p) => p && setPeriod(p)} />
        <Panel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="tileTitle">{words.title}</Text>
              <Text color="secondary" numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500' }}>{words.sub}</Text>
            </View>
            {gap != null ? <Pill label={`${signed(gap)}${Math.abs(gap)} min`} tone={changeTone(gap, 'up')} /> : null}
          </View>
          {d.s.value != null ? <Big num={f(d.s.value)} /> : <Text variant="caption" color="secondary">No nights in this period.</Text>}
          {known.length ? (
            <Lines values={values} before={d.before.buckets.map((b) => b.value)} color={t.c.accent.mustard} xLabels={xLabelsFor(d.s.buckets, period, known, false)} formatY={(n) => `${n}h`} pill={lastKnown != null ? f(lastKnown) : null} halo label={`Hours slept, ${words.title.toLowerCase()}${longest && shortest ? `; shortest ${dayWords(shortest.day)} at ${f(shortest.value)}, longest ${dayWords(longest.day)} at ${f(longest.value)}` : ''}`} />
          ) : null}
          <Hairline />
          <StatRow bare>
            <StatColumn label="LONGEST" value={longest ? f(longest.value) : 'None'} sub={longest ? when(longest.day) : ''} />
            <StatColumn label="SHORTEST" value={shortest ? f(shortest.value) : 'None'} sub={shortest ? when(shortest.day) : ''} />
            <StatColumn label={words.prev} value={d.s.prev != null ? f(d.s.prev) : 'None'} sub="a night" dim />
          </StatRow>
          {d.cmp.usual != null ? <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500' }}>{`Your usual week: ${f(d.cmp.usual)} a night${d.cmp.vsUsual != null ? ` · this week ${percent(d.cmp.vsUsual)}` : ''}`}</Text> : null}
        </Panel>
      </View>

      {nights.length ? (
        <View style={{ gap: 10 }}>
          <SecHead title="Nights" sub="Each one a Measurement, with where it came from" action={nights.length > 5 ? (all ? 'Less' : `All ${nights.length}`) : undefined} onAction={() => setAll((a) => !a)} />
          <Group>
            {shown.map((n) => (
              <ReadingRow key={n.key} r={n} page={page} value={f(n.value)} sub={n.asleep && n.awake ? `${clock(n.asleep)} to ${clock(n.awake)}` : undefined} onPress={() => router.push(`/entity/measurement/${n.id}` as never)} />
            ))}
          </Group>
        </View>
      ) : null}
    </Screen>
  );
}

/** A compact stat: 17/700 number over a small line. */
function StatColumn({ label, value, sub, dim }: { label: string; value: string; sub: string; dim?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
      <Caps>{label}</Caps>
      <Text numberOfLines={1} color={dim ? 'secondary' : 'primary'} style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text color="secondary" numberOfLines={1} style={{ fontSize: 12, lineHeight: 16 }}>{sub}</Text>
    </View>
  );
}

/** A reading with its origin on a disc (NR-Health-Weight). */
function ReadingRow({ r, page, value, sub, onPress }: { r: Reading; page: PageDef; value: string; sub?: string; onPress?: () => void }) {
  const t = useTheme();
  const o = originIcon(t, r.origin);
  return <Row minHeight={52} lead={<Disc icon={o.icon} color={o.color} />} title={dayWords(r.day)} sub={sub ?? originWords(r, page)} right={<RowValue>{value}</RowValue>} onPress={onPress} />;
}

function WeightPage({ ctx, page }: { ctx: LifeOSContext; page: PageDef }) {
  const router = useRouter();
  const back = useBack();
  const t = useTheme();
  const [period, setPeriod] = useState<LinePeriod>('month');
  const [all, setAll] = useState(false);
  const f = (v: number) => formatMetric('weight', v, ctx.format.currency);
  const d = useLive((os) => {
    const now = Date.now();
    const { s } = lineView(os, 'weight', period, now);
    return { s, latest: latestMeasurement(os, 'weight'), readings: readingsIn(os, 'weight', s.from, s.to), cmp: compareMetric(os, 'weight', now) };
  }, [period]);
  if (!d.latest) return <NoData page={page} />;

  const title = { week: 'Last 7 days', month: 'Last 30 days', year: 'Last 12 months' }[period];
  const values = d.s.buckets.map((b) => b.value);
  const known = values.flatMap((v, i) => (v == null ? [] : [i]));
  const oldest = d.readings[d.readings.length - 1];
  const newest = d.readings[0];
  const gap = oldest && newest && oldest !== newest ? newest.value - oldest.value : null;
  const big = splitValue(f(d.latest.data.value));
  const shown = all ? d.readings : d.readings.slice(0, 3);
  const n = d.readings.length;

  return (
    <Screen contentStyle={{ gap: 24 }}>
      <Head dot sub={sourceSub(page)} title={page.title} onBack={back} />
      <View style={{ gap: 10 }}>
        <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>The latest reading, not an average</Text>
        <Seg label="Weight period" options={LINE_PERIODS} value={period} onChange={(p) => p && setPeriod(p)} />
        <Panel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="tileTitle">{title}</Text>
              <Text color="secondary" numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{oldest && newest ? `${n} ${n === 1 ? 'reading' : 'readings'} · ${shortDay(oldest.day)}${oldest !== newest ? ` to ${shortDay(newest.day)}` : ''}` : 'No readings in this period'}</Text>
            </View>
            {gap != null ? <Pill label={`${signed(gap)}${Math.abs(gap).toFixed(1)} kg`} /> : null}
          </View>
          <Big num={big.num} unit={`${big.unit ?? 'kg'} · ${dayWords(d.latest.data.date)}`} />
          {known.length > 1 ? (
            <Lines values={values} color={t.c.fg.primary} fit xLabels={xLabelsFor(d.s.buckets, period, known, true)} formatY={(x) => String(x)} label={`Weight${oldest && newest ? ` from ${f(oldest.value)} on ${shortDay(oldest.day)} to ${f(newest.value)} on ${shortDay(newest.day)}` : ''}`} />
          ) : known.length === 1 ? (
            <Text variant="caption" color="secondary">One reading in this period; the line starts with the second.</Text>
          ) : null}
          {d.cmp.lastWeek != null || d.cmp.usual != null ? (
            <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{[d.cmp.lastWeek != null ? `Last week ${f(d.cmp.lastWeek)}` : null, d.cmp.usual != null ? `your usual ${f(d.cmp.usual)}` : null].filter(Boolean).join(' · ')}</Text>
          ) : null}
          <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500' }}>Weight has no better direction here, so the change stays neutral.</Text>
        </Panel>
      </View>

      <View style={{ gap: 10 }}>
        <SecHead title="Weight readings" sub="Each one a Measurement, with where it came from" action={n > 3 ? (all ? 'Less' : `All ${n}`) : undefined} onAction={() => setAll((a) => !a)} />
        {n ? (
          <Group>
            {shown.map((r) => <ReadingRow key={r.key} r={r} page={page} value={f(r.value)} onPress={() => router.push(`/entity/measurement/${r.id}` as never)} />)}
          </Group>
        ) : null}
        <WideButton title="Add a reading" icon="plus" onPress={() => router.push(NEW_WEIGHT as never)} />
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

export function MetricPage({ ctx, page: key }: { ctx: LifeOSContext; page: PageKey }) {
  const page = pageFor(key);
  if (key === 'sleep') return <SleepPage ctx={ctx} page={page} />;
  if (key === 'weight') return <WeightPage ctx={ctx} page={page} />;
  return <BarPage ctx={ctx} page={page} />;
}

/** A board screen for each page (keys are the page keys: /module/health/steps …). */
export const pageScreen = (key: PageKey) => {
  const Screen_ = ({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) => <MetricPage ctx={ctx} page={key} />;
  Screen_.displayName = `HealthPage_${key}`;
  return Screen_;
};
