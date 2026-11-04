import React, { useState, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { describeRRule } from '@core/automation/recurrence';
import type { ObjectRecord } from '@core/domain/types';
import { linkGroups } from '@core/graph/read';
import { dueOn, isoOf, streakOf, toggleCheckIn, type Habit } from '@core/habits/habits';
import { backlinks } from '@core/links';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import type { HabitLogData } from '@modules/habits';
import { CyclesSection } from '@ui/components/cycles';
import { TagChips } from '@ui/components/fields';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { monoFonts } from '@ui/theme/tokens';
import { Chip, Icon, IconButton, RowItem, RowList, ScreenHeader, Text, useToast } from '@ui/kit';
import { Caps, DAY, Disc, heatColor, HeatGrid, howOften, longestRun, Metric, mondayOf, Rule, SectionHead, Slab, streakSince, streakWord, toHabit, weekDone, type HabitRecord } from './parts';

const EVENTS_SHOWN = 5;

/**
 * A habit's page (NR-Habits-Record): the streak block, the numbers, today's
 * tick, the last 7 days (tap a day to fix it), check-ins by month, 13 weeks,
 * Details, Events, Links and Facts. Check-ins are `habit_log` records; the
 * changes come from the record's own timeline.
 */
export function HabitPage({ entity, controls, say }: { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const rec = entity as HabitRecord;
  const id = rec.id;
  const habit = toHabit(rec);
  const paused = rec.status === 'paused';
  const now = Date.now();
  const today = isoOf(now);
  const [allEvents, setAllEvents] = useState(false);

  const v = useLive((o) => {
    const logs = o.records.query<HabitLogData>('habit_log', { filter: { and: [{ field: 'data.habitId', op: 'eq', value: id }] }, sort: [{ field: 'createdAt', dir: 'desc' }] }, { limit: 2000 });
    const ticks = o.filings.ofKind('habit', { limit: 500 }).filter((f) => f.entityId === id && f.action === 'logged' && !f.undone && f.dumpId);
    const groups = linkGroups(o, id);
    return {
      logs,
      done: new Set(logs.map((l) => l.data.date)),
      ticks: ticks.map((f) => ({ at: f.createdAt, said: o.dumps.get(f.dumpId!)?.body.trim().split('\n')[0] ?? null })),
      changes: o.records.timeline.forEntity(id, 30).filter((e) => e.kind === 'created' || e.kind === 'updated' || e.kind === 'status'),
      facts: o.facts.list({ subjectId: id, limit: 50 }),
      links: groups.flatMap((g) => g.items.filter((i) => i.type !== 'habit_log').map((i) => ({ ...i, word: g.word }))),
      mentions: backlinks(o, id),
      tags: o.tags.forEntity(id).map((x) => x.name),
      reminders: o.reminders.forEntity(id).filter((r) => !r.doneAt),
      files: o.attachments.forEntity(id).filter((a) => a.kind !== 'cover'),
    };
  }, [id]);

  const { done } = v;
  const streak = streakOf(habit, done, now);
  const doneToday = done.has(today);
  const weekly = habit.frequency === 'weekly';
  const todayLog = v.logs.find((l) => l.data.date === today);
  const since = !weekly ? streakSince(habit, done, streak.count, now) : null;
  const heroLine = paused
    ? 'Paused. Not counted in today or streaks.'
    : [weekly ? `${weekDone(done, now)} of ${habit.perWeek} this week` : since ? `Since ${format(since, 'EEE d MMM')}` : 'Tick it today to start one', doneToday ? (todayLog && isoOf(todayLog.createdAt) === today ? `done today at ${format(todayLog.createdAt, 'h:mm a')}` : 'done today') : null].filter(Boolean).join(' · ');

  const last30 = Array.from({ length: 30 }, (_, i) => isoOf(now - i * DAY));
  const rate = weekly ? Math.min(1, last30.filter((d) => done.has(d)).length / ((habit.perWeek * 30) / 7)) : (() => {
    const due = last30.filter((d) => dueOn(habit, d));
    return due.length ? due.filter((d) => done.has(d)).length / due.length : 0;
  })();

  const week = Array.from({ length: 7 }, (_, i) => isoOf(now - (6 - i) * DAY));
  const start = [isoOf(rec.createdAt), ...[...done].sort().slice(0, 1)].sort()[0]!;
  const quarterFrom = mondayOf(now) - 84 * DAY;

  const events = [
    ...v.logs.map((l) => {
      const said = v.ticks.find((k) => Math.abs(k.at - l.createdAt) < 5000)?.said;
      return { key: l.id, at: l.createdAt, title: 'Checked in', sub: said ? `From a Dump: “${said}”` : isoOf(l.createdAt) !== l.data.date ? `Fixed later, for ${format(new Date(`${l.data.date}T12:00:00`), 'EEE d MMM')}` : 'Ticked by you', tick: true };
    }),
    ...v.changes.map((e) => ({ key: e.id, at: e.occurredAt, title: e.kind === 'created' ? 'Habit created' : e.title.replace('→', 'to'), sub: e.actor === 'assistant' ? 'By the agent' : e.actor === 'automation' ? 'By an automation' : 'By you', tick: false })),
  ].sort((a, b) => b.at - a.at);
  const shownEvents = allEvents ? events.slice(0, 30) : events.slice(0, EVENTS_SHOWN);
  const when = (at: number) => (isoOf(at) === today ? format(at, 'h:mm') : now - at < 6 * DAY ? format(at, 'EEE') : format(at, 'd MMM'));

  const details: Array<[string, string]> = [['Frequency', howOften(habit)], ...(rec.data.reminderTime ? [['Reminder', rec.data.reminderTime] as [string, string]] : []), ['Status', paused ? 'Paused' : 'Active'], ...(rec.data.why ? [['Why', rec.data.why] as [string, string]] : [])];
  const linkRows = [
    ...(v.logs.length ? [{ key: 'logs', icon: 'check-circle', title: 'Check-ins', sub: `link word: habit · ${v.logs.length}`, go: () => router.push(`/links/${id}` as never) }] : []),
    ...(v.ticks.length ? [{ key: 'dumps', icon: 'brain', title: 'Dumps that ticked it', sub: `${v.ticks.length} · each with Undo in To check`, go: () => router.push('/check' as never) }] : []),
    ...v.links.map((l) => ({ key: l.linkId, icon: os.registry.objects.get(l.type)?.icon ?? 'link', title: l.title, sub: l.word, go: () => router.push(`/entity/${l.type}/${l.id}` as never) })),
    ...v.mentions.map((n) => ({ key: n.id, icon: os.registry.objects.get(n.object)?.icon ?? 'file', title: n.title, sub: 'Mentioned here', go: () => router.push(`/entity/${n.object}/${n.id}` as never) })),
  ];

  return (
    <View style={{ paddingTop: insets.top + 16, paddingHorizontal: t.layout.gutter, gap: 24 }}>
      <ScreenHeader
        title={rec.title}
        subtitle={`Habit · ${paused ? 'paused' : howOften(habit).toLowerCase()}`}
        onBack={controls?.back}
        right={
          <>
            <IconButton icon="edit" accessibilityLabel="Edit habit" filled onPress={controls?.edit} />
            <IconButton icon="more" accessibilityLabel="More" filled onPress={controls?.more} />
          </>
        }
      />
      {rec.archived ? <Chip label="Archived" icon="archive" tone="muted" /> : null}

      <View style={{ padding: 20, borderRadius: 28, backgroundColor: t.c.accent.mustard, gap: 14, boxShadow: t.dark ? `0 10px 30px ${t.c.accent.mustard}40` : undefined }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Caps color={t.c.accent.mustardInk}>STREAK</Caps>
          <Icon name="flame" size={22} color={t.c.accent.mustardInk} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text color={t.c.accent.mustardInk} style={{ fontSize: 64, lineHeight: 64, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'] }}>{streak.count}</Text>
          <Text color={t.c.accent.mustardInk} style={{ fontSize: 17, lineHeight: 22, fontWeight: '600' }}>{weekly ? `${streak.count === 1 ? 'week' : 'weeks'} on target` : `${streak.count === 1 ? 'day' : 'days'} in a row`}</Text>
        </View>
        <Text color={t.c.accent.mustardInk} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500' }}>{heroLine}</Text>
      </View>

      <Slab style={{ padding: 16, flexDirection: 'row', gap: 12 }}>
        <Metric label="STREAK" value={streakWord(streak)} valueColor={t.c.accent.gold} />
        <Metric label="LAST 30 DAYS" value={`${Math.round(rate * 100)}%`} />
        <Metric label="ALL TIME" value={String(done.size)} />
      </Slab>

      {paused ? (
        <BigButton icon="check" label="Resume" lime onPress={() => os.records.setStatus(id, 'active')} />
      ) : doneToday ? (
        <BigButton icon="check-circle" label="Done today · tap to undo" onPress={() => toggleCheckIn(os, id, today)} />
      ) : (
        <BigButton icon="check" label="Done today" lime onPress={() => toggleCheckIn(os, id, today)} />
      )}

      <View style={{ gap: 10 }}>
        <SectionHead title="This week" sub="The last 7 days · tap a day to fix it" />
        <Slab radius={28} style={{ padding: 18, flexDirection: 'row', justifyContent: 'space-between' }}>
          {week.map((d) => <WeekDay key={d} iso={d} on={done.has(d)} due={dueOn(habit, d)} isToday={d === today} onPress={() => toggleCheckIn(os, id, d)} />)}
        </Slab>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHead title="Check-ins by month" sub="Every check-in is an Event on this record" />
        <Month habit={habit} done={done} start={start} now={now} />
      </View>

      <View style={{ gap: 10 }}>
        <SectionHead title="Last 13 weeks" sub={`${format(quarterFrom, 'd MMM')} to today`} />
        <Slab radius={28} style={{ padding: 18, flexDirection: 'row' }}>
          <HeatGrid weeks={13} now={now} cell={16} gap={4} radius={4} label={`${rec.title}, last 13 weeks`} colorOf={(iso) => heatColor(t.c, done.has(iso) ? 1 : 0)} />
        </Slab>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHead title="Details" action="Edit" chevron={false} onAction={controls?.edit} />
        <Slab style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
          {details.map(([k, val], i) => (
            <React.Fragment key={k}>
              {i ? <Rule /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 }}>
                <Text color="secondary" style={{ width: 110, flexShrink: 0, fontSize: 13, lineHeight: 20, fontWeight: '500' }}>{k}</Text>
                <Text variant="tileTitle" style={{ flex: 1, lineHeight: 20, minWidth: 0 }}>{val}</Text>
              </View>
            </React.Fragment>
          ))}
        </Slab>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHead title="Events" sub="Check-ins and changes" action={events.length > EVENTS_SHOWN ? (allEvents ? 'Less' : 'More') : undefined} chevron={false} onAction={() => setAllEvents((a) => !a)} />
        <Slab style={{ paddingVertical: 18, paddingHorizontal: 16 }}>
          <View style={{ gap: 18 }}>
            <View pointerEvents="none" style={{ position: 'absolute', left: 17, top: 18, bottom: 18, width: 2, borderRadius: 1, backgroundColor: t.c.rail }} />
            {shownEvents.map((e) => (
              <View key={e.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                <View style={{ margin: -4, padding: 4, borderRadius: 22, backgroundColor: t.c.bg.tile }}>
                  <Disc icon={e.tick ? 'check' : 'edit'} size={36} iconSize={16} color={e.tick ? undefined : t.c.fg.secondary} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: 7 }}>
                  <Text variant="rowTitle" numberOfLines={1}>{e.title}</Text>
                  <Text variant="caption" color="secondary">{e.sub}</Text>
                </View>
                <Text color="tertiary" style={{ fontFamily: monoFonts[500], fontSize: 12, lineHeight: 16, paddingTop: 10 }}>{when(e.at)}</Text>
              </View>
            ))}
          </View>
        </Slab>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHead title="Links" action={linkRows.length ? 'All' : 'Link'} chevron={false} onAction={() => (linkRows.length ? router.push(`/links/${id}` as never) : controls?.link())} />
        {linkRows.length ? (
          <Slab style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
            {linkRows.map((r, i) => (
              <React.Fragment key={r.key}>
                {i ? <Rule /> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={`${r.title}, ${r.sub}`} onPress={r.go} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
                  <Disc icon={r.icon} />
                  <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                    <Text variant="rowTitle" numberOfLines={1}>{r.title}</Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>{r.sub}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
                </Pressable>
              </React.Fragment>
            ))}
          </Slab>
        ) : (
          <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>Nothing linked to {rec.title} yet.</Text>
        )}
      </View>

      {v.reminders.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Reminders" />
          <RowList>
            {v.reminders.map((r) => (
              <RowItem key={r.id} icon="bell" tint="health" title={r.title} subtitle={`${os.format.dateTime(r.snoozedUntil ?? r.nextAt ?? r.dueAt)} · ${describeRRule(r.rrule)}`} onDone={() => { os.reminders.complete(r.id); toast.show({ message: r.rrule ? 'Done · rolled to the next one' : 'Reminder done', icon: 'check' }); }} onLongPress={() => os.reminders.remove(r.id)} />
            ))}
          </RowList>
        </View>
      ) : null}

      {v.files.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Attachments" />
          <RowList>
            {v.files.map((a) => <RowItem key={a.id} icon="file" tint="documents" title={a.name} subtitle={a.mime} onPress={() => void Linking.openURL(a.uri).catch(() => {})} onLongPress={() => os.attachments.remove(a.id)} />)}
          </RowList>
        </View>
      ) : null}

      {v.tags.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Tags" action="Edit" chevron={false} onAction={controls?.tags} />
          <TagChips tags={v.tags} module="habits" onPress={(name) => router.push(`/tag/${encodeURIComponent(name)}` as never)} />
        </View>
      ) : null}

      <CyclesSection entity={entity} />

      {v.facts.length ? (
        <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tileRaised, gap: 10 }}>
          <Caps>{`FACTS · ${v.facts.length}`}</Caps>
          <View>
            {v.facts.map((f) => (
              <Pressable key={f.id} accessibilityHint="Long-press to forget" onLongPress={() => os.facts.forget(f.id)}>
                <Text style={{ fontSize: 15, lineHeight: 24, fontWeight: '500' }}>• {f.text.replace(/\[\[|\]\]/g, '')}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {say}

      <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>Saying “did {rec.title.toLowerCase()}” in a dump ticks it too.</Text>
    </View>
  );
}

function BigButton({ icon, label, lime, onPress }: { icon: string; label: string; lime?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ height: 52, paddingHorizontal: 22, borderRadius: 999, backgroundColor: lime ? t.c.accent.mustard : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}>
      <Icon name={icon} size={18} color={lime ? t.c.accent.mustardInk : t.c.accent.gold} />
      <Text color={lime ? t.c.accent.mustardInk : 'primary'} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function WeekDay({ iso, on, due, isToday, onPress }: { iso: string; on: boolean; due: boolean; isToday: boolean; onPress: () => void }) {
  const t = useTheme();
  const day = new Date(`${iso}T12:00:00`);
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${format(day, 'EEE d MMM')}${isToday ? ', today' : ''}, ${on ? 'done' : 'not done'}`} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : due || on ? 1 : 0.4 })}>
      <Text variant="labelCaps" color="tertiary" style={{ letterSpacing: 0 }}>{format(day, 'EEEEE')}</Text>
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.accent.mustard : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: t.c.fg.tertiary, boxShadow: isToday ? `0 0 0 2px ${t.c.bg.tile}, 0 0 0 3.5px ${t.c.fg.primary}` : undefined }}>
        {on ? <Icon name="check" size={15} strokeWidth={2.6} color={t.c.accent.mustardInk} /> : null}
      </View>
    </Pressable>
  );
}

/** One month: done lime, missed coral outlined, the rest quiet; arrows back to when it started. Times-a-week habits have no missed days. */
function Month({ habit, done, start, now }: { habit: Habit; done: Set<string>; start: string; now: number }) {
  const t = useTheme();
  const [back, setBack] = useState(0);
  const here = new Date(now);
  const first = new Date(here.getFullYear(), here.getMonth() - back, 1, 12);
  const prev = new Date(first.getFullYear(), first.getMonth() - 1, 1, 12);
  const next = new Date(first.getFullYear(), first.getMonth() + 1, 1, 12);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const today = isoOf(now);
  const weekly = habit.frequency === 'weekly';
  const isos = Array.from({ length: days }, (_, i) => isoOf(new Date(first.getFullYear(), first.getMonth(), i + 1, 12)));
  const counted = isos.filter((d) => d >= start && d <= today && dueOn(habit, d));
  const hit = counted.filter((d) => done.has(d)).length;
  const inMonth = isos.filter((d) => done.has(d));
  const line = weekly ? `${inMonth.length} ${inMonth.length === 1 ? 'check-in' : 'check-ins'}` : counted.length ? `${hit} of ${counted.length} days` : 'Nothing due yet';
  const run = weekly ? 0 : longestRun(habit, new Set(inMonth)).count;
  const missed = (d: string) => !weekly && d >= start && d < today && dueOn(habit, d) && !done.has(d);
  const lead = (first.getDay() + 6) % 7;
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...isos];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
  return (
    <Slab radius={28} style={{ padding: 18, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton icon="chevron-left" size={36} filled accessibilityLabel={format(prev, 'MMMM')} disabled={isoOf(prev).slice(0, 7) < start.slice(0, 7)} onPress={() => setBack(back + 1)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="tileTitle">{format(first, 'MMMM yyyy')}</Text>
          <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{line}</Text>
        </View>
        <IconButton icon="chevron-right" size={36} filled accessibilityLabel={format(next, 'MMMM')} disabled={back === 0} onPress={() => setBack(back - 1)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => <Text key={i} variant="labelCaps" color="tertiary" style={{ flex: 1, textAlign: 'center', letterSpacing: 0 }}>{l}</Text>)}
      </View>
      <View accessibilityRole="image" accessibilityLabel={`${format(first, 'MMMM yyyy')}: ${line}`} style={{ gap: 6 }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
            {row.map((d, i) => {
              if (!d) return <View key={i} style={{ flex: 1, height: 40 }} />;
              const on = done.has(d);
              const miss = missed(d);
              return (
                <View key={d} style={{ flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.accent.mustard : miss ? t.c.bg.tileRaised : 'transparent', borderWidth: miss ? 1.5 : 0, borderColor: `${t.c.alert.coralText}8C` }}>
                  <Text color={on ? t.c.accent.mustardInk : miss ? t.c.alert.coralText : 'tertiary'} style={{ fontSize: 13, lineHeight: 17, fontWeight: on ? '700' : '600', fontVariant: ['tabular-nums'] }}>{Number(d.slice(8))}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <LegendDot color={t.c.accent.mustard} label="Done" />
        {weekly ? null : <LegendDot color={t.c.bg.tileRaised} border={`${t.c.alert.coralText}8C`} label="Missed" />}
        {run ? <Text color="secondary" style={{ marginLeft: 'auto', fontSize: 12, lineHeight: 15, fontWeight: '500' }}>Longest run {run} d</Text> : null}
      </View>
    </Slab>
  );
}

function LegendDot({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: color, borderWidth: border ? 1.5 : 0, borderColor: border }} />
      <Text color="secondary" style={{ fontSize: 12, lineHeight: 15, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}
