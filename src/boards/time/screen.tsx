import React from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format } from 'date-fns';
import { onThisDay, periodOf, periodSummary, type DayMark, type Span } from '@core/almanac/almanac';
import { isoDay } from '@core/dashboard/metrics';
import { categoryOf } from '@modules/finance/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Card, EmptyState, Icon, IconButton, RowItem, RowList, Screen, Section, Segmented, StackedBar, Stat, Text } from '@ui/kit';
import { RecordRow } from '@ui/components/RecordRow';

const fmtHours = (h: number) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;
const firstLine = (s: string) => s.trim().split('\n')[0]!;

/**
 * The Time board (docs/MODEL.md layer 5, R8): any day, month or year as one
 * page: what was spent and on what, body and screen-time averages, what
 * happened, what you dumped, upkeep done, who and what was added; a day also
 * looks back (On this day). At `/time` (`app/time.tsx`) and Browse › Boards.
 */
export function TimeScreen() {
  const params = useLocalSearchParams<{ span?: Span; day?: string }>();
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const span: Span = params.span === 'day' || params.span === 'year' ? params.span : 'month';
  const anchor = params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : isoDay(Date.now());
  const p = periodOf(span, anchor);
  const s = useLive((o) => periodSummary(o, p), [span, p.from]);
  const txs = useLive(
    (o) =>
      span === 'day' && o.registry.objects.has('transaction')
        ? o.records.query('transaction', { filter: { and: [{ field: 'data.date', op: 'eq', value: p.from }] } }, { limit: 100 })
        : [],
    [span, p.from],
  );
  const back = useLive((o) => (span === 'day' ? onThisDay(o, p.from) : []), [span, p.from]);
  const go = (next: { span?: Span; day?: string }) => router.setParams({ span: next.span ?? span, day: next.day ?? anchor });
  const money = os.format.currency;
  const perDay = span === 'day' ? '' : ' a day';
  const h = s.health;
  const body = [
    h.steps != null && { icon: 'shoe', label: 'Steps', value: Math.round(h.steps).toLocaleString('en-IN') + perDay, id: 'steps' },
    h.sleep != null && { icon: 'moon', label: 'Sleep', value: fmtHours(h.sleep) + (span === 'day' ? '' : ' a night'), id: 'sleep' },
    h.screen != null && { icon: 'signal', label: 'Screen time', value: fmtHours(h.screen) + perDay, id: 'screen' },
    h.restingHr != null && { icon: 'heart', label: 'Resting heart rate', value: `${Math.round(h.restingHr)} bpm`, id: 'resting_hr' },
    h.heartRate != null && h.restingHr == null && { icon: 'heart', label: 'Heart rate', value: `${Math.round(h.heartRate)} bpm`, id: 'heart_rate' },
    h.weight != null && { icon: 'scale', label: 'Weight', value: `${h.weight.toFixed(1)} kg`, id: 'weight' },
    s.workouts.count > 0 && { icon: 'activity', label: 'Workouts', value: `${s.workouts.count} · ${Math.round(s.workouts.minutes)} min`, id: null },
  ].filter(Boolean) as Array<{ icon: string; label: string; value: string; id: string | null }>;
  const cats = s.spend.byCategory.slice(0, 6);

  return (
    <Screen title="Time" subtitle="Your life by date" onBack={() => (router.canGoBack() ? router.back() : router.replace('/browse'))}>
      <Segmented<Span> options={[{ value: 'day', label: 'Day' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} value={span} onChange={(v) => go({ span: v })} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconButton icon="chevron-left" accessibilityLabel="Earlier" onPress={() => go({ day: p.prev })} />
        <Text variant="title" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
          {p.label}
        </Text>
        <IconButton icon="chevron-right" accessibilityLabel="Later" disabled={p.current} onPress={() => go({ day: p.next })} />
      </View>

      {span === 'month' ? <MonthGrid from={p.from} days={s.days} onDay={(day) => go({ span: 'day', day })} /> : null}
      {span === 'year' ? <YearGrid year={p.from.slice(0, 4)} days={s.days} onMonth={(day) => go({ span: 'month', day })} money={money} /> : null}

      {s.empty ? <EmptyState icon="calendar" tint="tasks" line={`Nothing recorded for ${p.label}.`} /> : null}

      {s.spend.total || s.spend.income ? (
        <Card icon="wallet" tint="finance" title="Money" meta={`${s.spend.count} ${s.spend.count === 1 ? 'payment' : 'payments'}`}>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 24 }}>
              <Stat value={money(s.spend.total)} caption="spent" size="count" />
              {s.spend.income ? <Stat value={money(s.spend.income)} caption="came in" size="count" tone="ok" /> : null}
            </View>
            {cats.length ? <StackedBar parts={cats.map((c) => ({ label: categoryOf(c.category).label, value: c.total, color: t.paletteColor(categoryOf(c.category).color) ?? t.c.fg.tertiary, display: money(c.total) }))} /> : null}
            {span === 'day' && txs.length ? (
              <RowList>
                {txs.map((e) => (
                  <RecordRow key={e.id} entity={e} value={money(Number((e.data as { amount?: number }).amount ?? 0))} />
                ))}
              </RowList>
            ) : p.current && span !== 'day' && cats.length ? (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/spend', params: { period: span === 'year' ? 'year' : 'month' } } as never)}>
                <Text variant="caption" color="secondary">See every payment ›</Text>
              </Pressable>
            ) : null}
          </View>
        </Card>
      ) : null}

      {body.length ? (
        <Section title="Body & phone">
          <RowList>
            {body.map((b) => (
              <RowItem key={b.label} icon={b.icon} tint="health" title={b.label} value={b.value} chevron={!!b.id} onPress={b.id ? () => router.push(`/metric/${b.id}` as never) : undefined} />
            ))}
          </RowList>
        </Section>
      ) : null}

      {s.happened.length ? (
        <Section title="What happened" meta={String(s.happened.length)}>
          <RowList>
            {s.happened.slice(0, 30).map((e) => (
              <RecordRow key={e.id} entity={e} showType />
            ))}
          </RowList>
        </Section>
      ) : null}

      {s.dumps.length ? (
        <Section title="What you dumped" meta={String(s.dumps.length)}>
          <RowList>
            {s.dumps.slice(0, span === 'day' ? 50 : 12).map((d) => (
              <RowItem key={d.id} icon="brain" tint="memory" title={firstLine(d.body)} subtitle={format(new Date(d.createdAt), span === 'day' ? 'h:mm a' : 'EEE d MMM')} chevron onPress={() => router.push(`/dump/${d.id}` as never)} />
            ))}
          </RowList>
        </Section>
      ) : null}

      {s.done.length ? (
        <Section title="Upkeep done" meta={String(s.done.length)}>
          <RowList>
            {s.done.slice(0, 20).map((d) => {
              const e = os.records.get(d.entityId);
              return <RowItem key={d.id} icon="repeat" tint="upkeep" title={d.title} subtitle={`${e?.title ?? ''}${span === 'day' ? '' : ` · ${format(new Date(d.at), 'd MMM')}`}`} value={d.cost ? money(d.cost) : undefined} onPress={e ? () => router.push(`/entity/${e.object}/${e.id}` as never) : undefined} />;
            })}
          </RowList>
        </Section>
      ) : null}

      {back.length ? (
        <Section title="On this day">
          <RowList>
            {back.flatMap((d) => [
              <RowItem key={d.day} icon="history" tint="memory" title={d.ago} subtitle={format(new Date(`${d.day}T12:00:00`), 'EEE d MMM yyyy')} chevron onPress={() => go({ span: 'day', day: d.day })} />,
              ...d.items.slice(0, 3).map((i) => <RowItem key={`${d.day}-${i.kind}-${i.id}`} icon={ON_THIS_DAY_ICON[i.kind]} tint="memory" title={i.title} onPress={() => router.push((i.kind === 'dump' ? `/dump/${i.id}` : `/entity/${i.type}/${i.id}`) as never)} />),
            ])}
          </RowList>
        </Section>
      ) : null}

      {s.newPeople.length || s.created.length || s.facts ? (
        <Section title="Added">
          <RowList>
            {s.newPeople.slice(0, 10).map((e) => (
              <RecordRow key={e.id} entity={e} subtitle={`New · ${format(new Date(e.createdAt), 'd MMM')}`} />
            ))}
            {s.created.filter((c) => c.type !== 'person').slice(0, 8).map((c) => {
              const def = os.registry.objects.get(c.type)!;
              return <RowItem key={c.type} icon={def.icon} tint="tasks" title={c.count === 1 ? def.label : def.labelPlural} value={`+${c.count}`} valueTone="secondary" onPress={() => router.push(`/entity/${c.type}` as never)} />;
            })}
            {s.facts ? <RowItem icon="sparkle" tint="memory" title={s.facts === 1 ? 'Fact remembered' : 'Facts remembered'} value={`+${s.facts}`} valueTone="secondary" onPress={() => router.push('/memory')} /> : null}
          </RowList>
        </Section>
      ) : null}
    </Screen>
  );
}

export const ON_THIS_DAY_ICON = { dump: 'brain', event: 'calendar', trip: 'plane', person: 'user', done: 'repeat', fact: 'sparkle' } as const;

/** A month as a calendar: each day marked with what's in it (dumps, events, spend); tap a day to open it. */
function MonthGrid({ from, days, onDay }: { from: string; days: DayMark[]; onDay: (day: string) => void }) {
  const t = useTheme();
  const [y, m] = from.split('-').map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const count = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday first
  const by = new Map(days.map((d) => [d.day, d]));
  const maxSpend = Math.max(1, ...days.map((d) => d.spend));
  const today = isoDay(Date.now());
  const cells: Array<string | null> = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => isoDay(new Date(y, m - 1, i + 1)))];
  while (cells.length % 7) cells.push(null);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} variant="labelMicro" color="tertiary" style={{ flex: 1, textAlign: 'center' }}>
            {d}
          </Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 4 }}>
          {cells.slice(r * 7, r * 7 + 7).map((day, i) => {
            if (!day) return <View key={i} style={{ flex: 1, aspectRatio: 1 }} />;
            const mk = by.get(day);
            const future = day > today;
            const heat = mk?.spend ? 0.15 + 0.6 * (mk.spend / maxSpend) : 0;
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={`${day}${mk?.dumps ? `, ${mk.dumps} dumps` : ''}${mk?.events ? `, ${mk.events} events` : ''}`}
                disabled={future}
                onPress={() => onDay(day)}
                style={({ pressed }) => ({ flex: 1, aspectRatio: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: t.c.bg.tile, borderWidth: day === today ? 1.5 : 0, borderColor: t.c.fg.primary, opacity: future ? 0.35 : pressed ? 0.7 : 1, overflow: 'hidden' })}
              >
                {heat ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: t.tints.finance.fill, opacity: heat }} /> : null}
                <Text variant="caption">{Number(day.slice(8))}</Text>
                <View style={{ flexDirection: 'row', gap: 3, height: 5 }}>
                  {mk?.dumps ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.tints.memory.ink }} /> : null}
                  {mk?.events ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.tints.tasks.ink }} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginTop: 4 }}>
        <Legend color={t.tints.memory.ink} label="dumped" />
        <Legend color={t.tints.tasks.ink} label="event" />
        <Legend color={t.tints.finance.fill} label="spent (darker = more)" square />
      </View>
    </View>
  );
}

function Legend({ color, label, square }: { color: string; label: string; square?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: square ? 10 : 6, height: square ? 10 : 6, borderRadius: square ? 3 : 3, backgroundColor: color }} />
      <Text variant="caption" color="secondary">{label}</Text>
    </View>
  );
}

/** A year as twelve months, each with its spend and how many dumps; tap one to open it. */
function YearGrid({ year, days, onMonth, money }: { year: string; days: DayMark[]; onMonth: (day: string) => void; money: (n: number) => string }) {
  const t = useTheme();
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const ds = days.filter((d) => d.day.startsWith(key));
    return { key, label: format(new Date(Number(year), i, 1), 'MMM'), spend: ds.reduce((n, d) => n + d.spend, 0), dumps: ds.reduce((n, d) => n + d.dumps, 0), events: ds.reduce((n, d) => n + d.events, 0) };
  });
  const now = isoDay(Date.now()).slice(0, 7);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {months.map((m) => {
        const future = m.key > now;
        return (
          <Pressable key={m.key} accessibilityRole="button" disabled={future} onPress={() => onMonth(`${m.key}-01`)} style={({ pressed }) => ({ flexBasis: '30%', flexGrow: 1, padding: 10, borderRadius: 12, backgroundColor: t.c.bg.tile, gap: 2, opacity: future ? 0.35 : pressed ? 0.7 : 1 })}>
            <Text variant="label">{m.label}</Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {m.spend ? money(m.spend) : '—'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {m.dumps ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Icon name="brain" size={11} color={t.tints.memory.ink} />
                  <Text variant="caption" color="secondary">{m.dumps}</Text>
                </View>
              ) : null}
              {m.events ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Icon name="calendar" size={11} color={t.tints.tasks.ink} />
                  <Text variant="caption" color="secondary">{m.events}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
