import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Sheet, Text as KitText, useToast } from '@ui/kit';
import { toggleTask, type TaskData } from '@modules/projects';
import {
  backHome, checklistOf, clothesSpaceId, daysToStart, deadlines, departureDay, docsShelf, dueToday, emergencyFor, filterChecklist, isDone, isDownload, KIND_WORDS, notesOf, offlineSavedAt, pack, packingList, projectedOf, readyToFly, SECTION_LABEL, stillPacked, tripBalances, tripFlights, tripLedger, tripPapers, tripPhase,
  type ClothesKind, type Deadline, type PackingList, type Paper, type ShelfTile, type TaskLike, type TripData,
} from '@modules/travel';
import { companions, plural } from './parts';
import { Anim, bgImage, JP_SANS, MONO } from './jp/kit';
import { C, DotMatrix, Faces, FACE, money, TripHeader, TripScreen, isJapan, tripRoutes } from './jp/shell';
import { Ico, saveOfflineCopy, shareText, type IcoName } from './jp/search';
import { hear } from './jp/listen';

/**
 * Prep (the trip template: JP-Todo, JP-Pack, JP-Docs), one screen with three
 * tabs. Checklist: the LED count and the bar, the filters, Due today, what
 * goes live soon, the notes as alerts, each section's strip and its Tasks
 * (ticks are projects'), the no-date cards to mark done, ask the copilot, add
 * an item or a note (typed or said). Packing: what LifeOS suggests, the
 * clothes in four states (in the bag, suggested, not picked, away), the
 * things (the trip's list, the Bathroom, Claude's), the departure-day check
 * and Pack. Docs: saved offline, the shelf with each paper's status, the
 * viewer, downloads and the emergency card.
 */

export const prepRoute = (tripId: string, tab?: 'checklist' | 'packing' | 'docs') => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'prep', trip: tripId, ...(tab ? { tab } : {}) } });

type Tab = 'checklist' | 'packing' | 'docs';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''}`;
const isoOf = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const RED_SOFT = 'rgba(255,92,71,0.18)';
const RED_TEXT = '#FF8A7A';
const LIME_SOFT = 'rgba(215,245,92,0.16)';
const STRIP: Record<string, string> = { documents: '#A9C4FF', money: '#F26B2B', 'to-do': '#D7F55C', packing: '#F4A8CE' };
const F = { semi: 'PlusJakartaSans_600SemiBold', bold: 'PlusJakartaSans_700Bold', xbold: 'PlusJakartaSans_800ExtraBold', med: 'PlusJakartaSans_500Medium', reg: 'PlusJakartaSans_400Regular' };

/* ------------------------------------------------------------------ */
/* Small pieces                                                         */
/* ------------------------------------------------------------------ */

function Tick({ done, onPress, label, size = 26 }: { done: boolean; onPress?: () => void; label: string; size?: number }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: done }} hitSlop={10} disabled={!onPress} onPress={onPress} style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? C.lime : 'transparent', borderWidth: done ? 0 : size > 22 ? 2 : 1.5, borderColor: size > 22 ? 'rgba(245,245,247,0.3)' : 'rgba(245,245,247,0.4)' }}>
      {done ? <Ico name="check" size={size > 22 ? 15 : 12} color={C.ink} /> : null}
    </Pressable>
  );
}

function DatePill({ label, tone = 'quiet', small }: { label: string; tone?: 'quiet' | 'red' | 'lime'; small?: boolean }) {
  const bg = tone === 'red' ? RED_SOFT : tone === 'lime' ? LIME_SOFT : C.raised;
  const fg = tone === 'red' ? RED_TEXT : tone === 'lime' ? C.lime : C.mid;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: small ? 22 : 24, paddingHorizontal: 9, borderRadius: 999, backgroundColor: bg, flexShrink: 0 }}>
      {tone === 'lime' && small ? <Ico name="check" size={13} color={C.lime} /> : null}
      <Text numberOfLines={1} style={{ color: fg, fontSize: small ? 11 : 12, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: F.semi }}>{label}</Text>
    </View>
  );
}

function Head17({ title, sub, right, pad = true }: { title: string; sub?: string | null; right?: React.ReactNode; pad?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: pad ? 'flex-end' : 'center', gap: 8, paddingTop: pad ? 10 : 0, paddingHorizontal: pad ? 4 : 0 }}>
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontVariant: ['tabular-nums'], fontFamily: F.semi }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: F.med }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const Label = ({ children, color = C.low }: { children: React.ReactNode; color?: string }) => <Text style={{ color, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: F.semi }}>{children}</Text>;

/** The two papers with a count, as the artboards draw "Your files". */
function PaperStack({ count }: { count: number }) {
  const sheet = (left: number, rot: string, band: string) => (
    <View style={{ position: 'absolute', top: 6, left, width: 36, height: 46, backgroundColor: '#F3F1EC', borderRadius: 5, boxShadow: '0 4px 10px rgba(0,0,0,0.4)', overflow: 'hidden', transform: [{ rotate: rot }] }}>
      <View style={{ height: 10, backgroundColor: band }} />
      {['80%', '60%', '70%'].map((w) => <View key={w} style={{ width: w as `${number}%`, height: 3, marginTop: 4, marginHorizontal: 5, backgroundColor: 'rgba(11,11,13,0.2)', borderRadius: 2 }} />)}
    </View>
  );
  return (
    <View style={{ height: 58 }}>
      {sheet(12, '-10deg', '#FF5C47')}
      {sheet(40, '8deg', '#6CC6FF')}
      <View style={{ position: 'absolute', top: 0, right: 0, height: 26, minWidth: 26, paddingHorizontal: 7, borderRadius: 13, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.ink, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: F.xbold }}>{count}</Text>
      </View>
    </View>
  );
}

/** The twelve-dot spinner on the live card. */
function Spinner({ color = C.ink }: { color?: string }) {
  const dots = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { x: 20 + 16 * Math.cos(a), y: 20 + 16 * Math.sin(a), o: 0.15 + i * 0.07 };
  });
  return (
    <Anim k="jspin" style={{ width: 40, height: 40 }}>
      <Svg width={40} height={40} viewBox="0 0 40 40">
        <G>{dots.map((d, i) => <Circle key={i} cx={d.x} cy={d.y} r={2.4} fill={color} opacity={d.o} />)}</G>
      </Svg>
    </Anim>
  );
}

function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, backgroundColor: C.tile, borderRadius: 999 }}>
      {(['checklist', 'packing', 'docs'] as const).map((t) => (
        <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => onChange(t)} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === t ? C.white : 'transparent' }}>
          <Text numberOfLines={1} style={{ color: tab === t ? C.ink : C.mid, fontSize: 14, lineHeight: 18, fontFamily: F.semi }}>{t === 'checklist' ? 'Checklist' : t === 'packing' ? 'Packing' : 'Docs'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                           */
/* ------------------------------------------------------------------ */

export function PrepScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(params.tab === 'packing' || params.tab === 'docs' ? params.tab : 'checklist');
  useEffect(() => {
    if (params.tab === 'packing' || params.tab === 'docs' || params.tab === 'checklist') setTab(params.tab);
  }, [params.tab]);
  const d = useLive((os) => {
    const trip = os.records.get<TripData>(params.trip ?? '');
    if (trip?.object !== 'trip') return null;
    const items = checklistOf(os, trip.id);
    return { trip, items, ready: readyToFly(items) };
  }, [params.trip]);
  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, padding: 24, paddingTop: 80, gap: 12 }}>
        <Text style={{ color: C.mid, fontSize: 15, fontFamily: F.med }}>That trip isn’t here any more.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace(tripRoutes.travel)}>
          <Text style={{ color: C.lime, fontSize: 15, fontFamily: F.semi }}>All trips</Text>
        </Pressable>
      </View>
    );
  }
  const { trip, items, ready } = d;
  return (
    <TripScreen tripId={trip.id} active="prep">
      <View>
        <TripHeader trip={trip} label={`Prep · ${ready.done}/${ready.total} done`} />
        <Anim k="jr" delay={80}>
          <Tabs tab={tab} onChange={setTab} />
        </Anim>
      </View>
      {tab === 'checklist' ? <Checklist ctx={ctx} trip={trip} items={items} openAdd={params.add === '1'} onTab={setTab} /> : tab === 'packing' ? <Packing ctx={ctx} trip={trip} items={items} /> : <Docs ctx={ctx} trip={trip} items={items} />}
    </TripScreen>
  );
}

/** Ticking, with an Undo when it was a tick (projects' toggle). */
function useTick(ctx: LifeOSContext) {
  const toast = useToast();
  return (task: ObjectRecord<TaskLike>) => {
    const was = task.status;
    toggleTask(ctx, task as unknown as ObjectRecord<TaskData>);
    if (was !== 'done') toast.show({ message: `${task.title} done`, icon: 'check', undo: () => void ctx.records.update(task.id, { status: was ?? 'todo', data: { completedAt: undefined } }, 'user') });
  };
}

/** "You ticked · 17 Dec 18:02", or the first line of the notes. */
function tickedLine(t: ObjectRecord<TaskLike>): string | null {
  if (isDone(t)) return t.data.completedAt ? `You ticked · ${dm(isoOf(t.data.completedAt))} ${hhmm(t.data.completedAt)}` : t.data.notes?.split('\n')[0] ?? 'done';
  return t.data.notes?.split('\n')[0]?.trim() || null;
}

/** A trip's people, you first: name and face colour by id. */
function usePeople(ctx: LifeOSContext, trip: ObjectRecord<TripData>) {
  return useLive((os) => {
    const people = companions(os, trip);
    const color = new Map<string, string>(people.map((p, i) => [p.id, FACE[(i + 1) % FACE.length]!]));
    return { names: ['You', ...people.map((p) => p.name)], color, name: new Map(people.map((p) => [p.id, p.name])) };
  }, [trip.id, trip.version]);
}

/* ------------------------------------------------------------------ */
/* Checklist                                                            */
/* ------------------------------------------------------------------ */

type Filter = 'today' | 'overdue' | 'week' | 'before' | 'during' | 'nodate';
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'today', label: 'Due today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'before', label: 'Before you fly' },
  { value: 'during', label: 'During the trip' },
  { value: 'nodate', label: 'No date' },
];

function TaskRow({ t, onTick, onOpen, people, last }: { t: ObjectRecord<TaskLike>; onTick: () => void; onOpen: () => void; people: ReturnType<typeof usePeople>; last?: boolean }) {
  const today = isoOf(Date.now());
  const week = isoOf(Date.now() + 7 * 86_400_000);
  const done = isDone(t);
  const due = t.data.dueDate;
  const who = t.data.personIds?.[0];
  const line = tickedLine(t);
  const pill = done || !due ? null : due < today ? { label: `was ${dm(due)}`, tone: 'red' as const } : due === today ? { label: 'today', tone: 'red' as const } : { label: dm(due), tone: due <= week ? ('lime' as const) : ('quiet' as const) };
  return (
    <>
      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, opacity: pressed ? 0.75 : 1 })}>
        <Tick done={done} label={t.title} onPress={onTick} />
        <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: done ? C.low : C.white, fontSize: 15, lineHeight: 20, fontFamily: F.semi, textDecorationLine: done ? 'line-through' : 'none' }}>{t.title}</Text>
          {who && people.name.get(who) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: people.color.get(who) ?? C.lime, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.ink, fontSize: 9, lineHeight: 9, fontFamily: F.bold }}>{people.name.get(who)!.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: C.mid, fontSize: 12, fontFamily: F.reg }}>{line ?? people.name.get(who)}</Text>
            </View>
          ) : line ? (
            <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: F.reg }}>{line}</Text>
          ) : null}
        </View>
        {pill ? <DatePill label={pill.label} tone={pill.tone} /> : null}
      </Pressable>
      {last ? null : <View style={{ height: 1, backgroundColor: C.line }} />}
    </>
  );
}

function Checklist({ ctx, trip, items, openAdd, onTab }: { ctx: LifeOSContext; trip: ObjectRecord<TripData>; items: ObjectRecord<TaskLike>[]; openAdd: boolean; onTab: (t: Tab) => void }) {
  const router = useRouter();
  const tick = useTick(ctx);
  const people = usePeople(ctx, trip);
  const now = Date.now();
  const today = isoOf(now);
  const extra = useLive((os) => ({ notes: notesOf(os, trip.id), soon: deadlines(os, trip, now).filter((x) => x.day <= isoOf(now + 14 * 86_400_000)) }), [trip.id, trip.version]);
  const ready = readyToFly(items, now);
  const todays = dueToday(items, now);
  const [filter, setFilter] = useState<Filter | null>(todays.length ? 'today' : null);
  const [section, setSection] = useState<string | null>(null);
  const [adding, setAdding] = useState(openAdd);
  const [said, setSaid] = useState('');
  const [allNotes, setAllNotes] = useState(false);
  const counts: Record<Filter, number> = { today: todays.length, overdue: filterChecklist(items, 'overdue', trip, now).length, week: filterChecklist(items, 'week', trip, now).length, before: filterChecklist(items, 'before', trip, now).length, during: filterChecklist(items, 'during', trip, now).length, nodate: filterChecklist(items, 'nodate', trip, now).length };
  const shown = (filter === 'today' ? todays : filter ? filterChecklist(items, filter, trip, now) : items).filter((t) => t.data.section !== 'packing' && (!section || (t.data.section || 'to-do') === section));
  const dated = shown.filter((t) => isDone(t) || t.data.dueDate);
  const nodate = shown.filter((t) => !isDone(t) && !t.data.dueDate);
  const groups = new Map<string, ObjectRecord<TaskLike>[]>();
  for (const t of dated) groups.set(t.data.section || 'to-do', [...(groups.get(t.data.section || 'to-do') ?? []), t]);
  const order = ['documents', 'money', 'to-do'];
  const sections = [...groups.entries()].sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - ((order.indexOf(b[0]) + 99) % 99));
  const days = daysToStart(trip.data, now);
  const phase = tripPhase(trip.data, now);
  const topDue = todays.length ? todays : items.filter((t) => !isDone(t) && t.data.dueDate && t.data.dueDate > today).slice(0, 3);
  const docs = items.filter((t) => t.data.section === 'documents');
  const live: Deadline | undefined = extra.soon[0];
  const liveWords = live ? (live.kind === 'seats' ? ['SEATS', 'OPEN'] : live.kind === 'cancel' ? ['CANCEL', 'BY'] : ['CARD', 'DUE']) : null;
  const say = async () => {
    const heard = await hear('Add an item or a note');
    if (heard) {
      setSaid(heard);
      setAdding(true);
    } else router.push(tripRoutes.listen(trip.id));
  };
  const open = (t: ObjectRecord<TaskLike>) => router.push(`/entity/task/${t.id}` as never);
  return (
    <>
      <Anim k="jr" delay={110}>
        <View style={{ gap: 14, padding: 18, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <DotMatrix text={`${ready.done}/${ready.total}`} pitch={5} label={`${ready.done} of ${ready.total} done`} />
            <View style={{ flexGrow: 1 }} />
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: C.white, fontSize: 15, lineHeight: 19, fontVariant: ['tabular-nums'], fontFamily: F.semi }}>done</Text>
              <Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: F.med }}>{phase === 'away' ? 'on the trip now' : phase === 'back' ? 'back home' : days != null ? (days === 0 ? 'you fly today' : `${plural(days, 'day')} to go`) : 'no dates yet'}</Text>
            </View>
          </View>
          <View style={{ height: 28 }}>
            <View style={[bgImage('repeating-linear-gradient(90deg, rgba(245,245,247,0.28) 0 1.5px, transparent 1.5px 5px)'), { position: 'absolute', top: 5, left: 0, right: 0, height: 18, borderRadius: 18 }]} />
            <Anim k="jbar" style={[bgImage('linear-gradient(90deg, #D7F55C10 0%, #D7F55CAA 45%, #D7F55C 100%)'), { position: 'absolute', top: 5, left: 0, height: 18, width: `${Math.max(4, Math.round(ready.share * 100))}%`, borderRadius: 18, boxShadow: '0 0 18px #D7F55C88, 0 0 4px #D7F55C' }]} />
          </View>
        </View>
      </Anim>

      <Anim k="jr" delay={170}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
          {FILTERS.map((f) => {
            const on = filter === f.value;
            return (
              <Pressable key={f.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFilter(on ? null : f.value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingLeft: 6, paddingRight: 16, borderRadius: 999, backgroundColor: on ? C.white : C.raised, flexShrink: 0 }}>
                <View style={{ height: 28, minWidth: 28, paddingHorizontal: 6, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.lime : '#303036' }}>
                  <Text numberOfLines={1} style={{ color: on ? C.ink : C.mid, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: F.xbold }}>{counts[f.value]}</Text>
                </View>
                <Text style={{ color: on ? C.ink : C.white, fontSize: 14, fontFamily: F.semi }}>{f.label}</Text>
              </Pressable>
            );
          })}
          <View style={{ width: 14 }} />
        </ScrollView>
      </Anim>

      <Anim k="jr" delay={230}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable accessibilityRole="button" onPress={() => setFilter(todays.length ? 'today' : 'week')} style={{ flex: 1, width: 0, minWidth: 0, gap: 12, paddingTop: 16, paddingHorizontal: 12, paddingBottom: 12, backgroundColor: '#221E26', borderRadius: 26 }}>
            <View style={{ alignItems: 'center', gap: 5, paddingTop: 4, paddingBottom: 2 }}>
              <DotMatrix text={todays.length ? 'DUE' : 'NEXT'} pitch={3.6} color={C.white} dim={0.08} />
              <DotMatrix text={todays.length ? 'TODAY' : 'UP'} pitch={3.6} color={C.white} dim={0.08} />
            </View>
            <View style={{ gap: 6 }}>
              {topDue.slice(0, 3).map((t) => (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 40, paddingHorizontal: 12, borderRadius: 999, backgroundColor: isDone(t) ? '#141216' : '#2C2830' }}>
                  <Tick size={20} done={isDone(t)} label={t.title} onPress={() => tick(t)} />
                  <Text numberOfLines={1} style={{ flexShrink: 1, color: isDone(t) ? C.low : C.white, fontSize: 13, fontFamily: F.semi }}>{t.title}</Text>
                </View>
              ))}
              {!topDue.length ? <Text style={{ color: C.mid, fontSize: 13, lineHeight: 18, fontFamily: F.med, paddingHorizontal: 4 }}>Nothing due. Add an item below.</Text> : null}
            </View>
          </Pressable>
          <View style={{ flex: 1, width: 0, minWidth: 0, gap: 8 }}>
            {live && liveWords ? (
              <Pressable accessibilityRole="button" accessibilityLabel={live.line} onPress={() => router.push(tripRoutes.booking(live.eventId))} style={[bgImage('linear-gradient(120deg,#7FD0C8,#F6E27F,#F4A8CE,#C9A7F5)'), { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, minHeight: 120, padding: 16, borderRadius: 26, overflow: 'hidden', backgroundColor: '#F6E27F' }]}>
                <View style={{ gap: 5 }}>
                  <DotMatrix text={liveWords[0]!} pitch={3.4} color={C.ink} dim={0.07} />
                  <DotMatrix text={liveWords[1]!} pitch={3.4} color={C.ink} dim={0.07} />
                  <Text numberOfLines={1} style={{ color: 'rgba(11,11,13,0.62)', fontSize: 11, fontFamily: F.bold, maxWidth: 110 }}>{live.title}</Text>
                </View>
                <View style={{ position: 'absolute', top: 12, right: 14, bottom: 14, alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <Text style={{ color: 'rgba(11,11,13,0.62)', fontSize: 10, letterSpacing: 0.5, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{live.day === today ? 'LIVE' : dm(live.day).toUpperCase()}</Text>
                  <Spinner />
                </View>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => onTab('docs')} style={{ flexGrow: live ? 0 : 1, gap: 10, padding: 14, backgroundColor: C.tile, borderRadius: 26 }}>
              <PaperStack count={docs.filter((t) => !isDone(t)).length} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
                  <Ico name="file" size={14} color={C.mid} />
                </View>
                <View style={{ minWidth: 0, flexShrink: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.white, fontSize: 14, fontFamily: F.bold }}>Documents</Text>
                  <Text numberOfLines={1} style={{ color: C.mid, fontSize: 11, fontFamily: F.reg }}>{docs.length ? `${docs.filter(isDone).length} of ${docs.length} done` : 'none on the list'}</Text>
                </View>
              </View>
            </Pressable>
          </View>
        </View>
      </Anim>

      {extra.notes.length ? (
        <Anim k="jr" delay={260}>
          <View style={{ padding: 14, gap: 8, backgroundColor: C.tile, borderRadius: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Label>TO BE AWARE OF · {extra.notes.length}</Label>
              <View style={{ flexGrow: 1 }} />
              {extra.notes.length > 3 ? (
                <Pressable accessibilityRole="button" onPress={() => setAllNotes((x) => !x)} hitSlop={8}>
                  <Text style={{ color: C.mid, fontSize: 12, fontFamily: F.semi }}>{allNotes ? 'Fewer' : `All ${extra.notes.length}`}</Text>
                </Pressable>
              ) : null}
            </View>
            {(allNotes ? extra.notes : extra.notes.slice(0, 3)).map((n, i, arr) => {
              const tone = n.data.priority === 'urgent' ? C.coral : n.data.priority === 'high' ? C.amber : '#A9C4FF';
              return (
                <React.Fragment key={n.id}>
                  <Pressable accessibilityRole="button" onPress={() => open(n)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
                      <Ico name="alert" size={15} color={tone} />
                    </View>
                    <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                      <Text numberOfLines={2} style={{ color: C.white, fontSize: 14, lineHeight: 19, fontFamily: F.semi }}>{n.title}</Text>
                      {n.data.notes ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: F.reg }}>{n.data.notes.split('\n')[0]}</Text> : null}
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${n.title} handled`} onPress={() => tick(n)} hitSlop={6} style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.raised, justifyContent: 'center' }}>
                      <Text style={{ color: C.lime, fontSize: 12, fontFamily: F.semi }}>Handled</Text>
                    </Pressable>
                  </Pressable>
                  {i < arr.length - 1 ? <View style={{ height: 1, backgroundColor: C.line }} /> : null}
                </React.Fragment>
              );
            })}
          </View>
        </Anim>
      ) : null}

      {ready.bySection.length ? (
        <Anim k="jr" delay={290}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
            {ready.bySection.map((s, i) => {
              const all = items.filter((t) => (t.data.section || 'to-do') === s.section).sort((a, b) => Number(isDone(b)) - Number(isDone(a)));
              const on = section === s.section;
              return (
                <Pressable key={s.section} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => (s.section === 'packing' ? onTab('packing') : setSection(on ? null : s.section))}>
                  <Anim k="jr" delay={200 + i * 50} style={{ width: 150, gap: 10, padding: 14, backgroundColor: C.tile, borderRadius: 22, borderWidth: 1.5, borderColor: on ? C.white : 'transparent' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Text numberOfLines={1} style={{ flexShrink: 1, color: C.white, fontSize: 14, fontFamily: F.semi }}>{SECTION_LABEL[s.section]?.replace(' & gear', '') ?? s.section}</Text>
                      <Text style={{ color: C.mid, fontSize: 11, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{s.done}/{s.total}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      {all.map((t) => <View key={t.id} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 6, borderRadius: 2, backgroundColor: isDone(t) ? STRIP[s.section] ?? '#C9A7F5' : C.raised }} />)}
                    </View>
                  </Anim>
                </Pressable>
              );
            })}
            <View style={{ width: 12 }} />
          </ScrollView>
        </Anim>
      ) : null}

      {sections.map(([sec, list], gi) => {
        const all = items.filter((t) => (t.data.section || 'to-do') === sec);
        const next = all.filter((t) => !isDone(t) && t.data.dueDate && t.data.dueDate >= today)[0]?.data.dueDate;
        return (
          <React.Fragment key={sec}>
            <Anim k="jr" delay={350 + gi * 40}>
              <Head17 title={SECTION_LABEL[sec] ?? sec} sub={`${all.filter(isDone).length} of ${all.length} done${next ? ` · next ${dm(next)}` : ''}`} />
            </Anim>
            <View style={{ padding: 14, backgroundColor: C.tile, borderRadius: 24, overflow: 'hidden' }}>
              <View style={{ gap: 8 }}>
                {list.map((t, i) => <TaskRow key={t.id} t={t} people={people} onTick={() => tick(t)} onOpen={() => open(t)} last={i === list.length - 1} />)}
              </View>
            </View>
          </React.Fragment>
        );
      })}

      {nodate.map((t) => (
        <View key={t.id} style={{ height: 62, backgroundColor: C.lime, borderRadius: 22, overflow: 'hidden' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${t.title} done`} onPress={() => tick(t)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Ico name="check" size={16} color={C.ink} />
            <Text style={{ color: C.ink, fontSize: 13, fontFamily: F.xbold }}>Mark done</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => open(t)} style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 96, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, backgroundColor: C.raised, borderRadius: 22 }}>
            <Tick done={false} label={t.title} onPress={() => tick(t)} />
            <View style={{ minWidth: 0, flexShrink: 1 }}>
              <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, fontFamily: F.semi }}>{t.title}</Text>
              <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: F.reg }}>{SECTION_LABEL[t.data.section || 'to-do']?.replace(' & gear', '') ?? 'To-do'} · no date</Text>
            </View>
          </Pressable>
        </View>
      ))}

      {!sections.length && !nodate.length ? (
        <View style={{ padding: 16, backgroundColor: C.tile, borderRadius: 24 }}>
          <Text style={{ color: C.mid, fontSize: 14, lineHeight: 20, fontFamily: F.med }}>{filter || section ? 'Nothing here for that filter.' : items.length ? 'Everything on the checklist is done.' : 'No checklist yet. Add an item, or ask the copilot what this trip needs.'}</Text>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Label>ASK THE COPILOT</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
          {['What’s most urgent?', 'Packing for this route'].map((q) => (
            <Pressable key={q} accessibilityRole="button" onPress={() => router.push(tripRoutes.copilot(trip.id, q))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.raised, flexShrink: 0 }}>
              <Ico name="sparkle" size={13} color={C.lime} />
              <Text style={{ color: C.white, fontSize: 13, fontFamily: F.semi }}>{q}</Text>
            </Pressable>
          ))}
          <View style={{ width: 14 }} />
        </ScrollView>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, borderRadius: 999, boxShadow: '0 10px 26px rgba(0,0,0,0.45)' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Add an item or a note" onPress={() => setAdding(true)} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
            <Ico name="plus" size={22} color={C.ink} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Say it" onPress={say} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#3A3A42', alignItems: 'center', justifyContent: 'center' }}>
            <Ico name="mic" size={20} color={C.white} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 1 }}>
          <Text numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: F.semi }}>Add an item or a note</Text>
          <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: F.med }}>type it, or say it</Text>
        </Pressable>
      </View>
      <AddItemSheet ctx={ctx} trip={trip} visible={adding} initial={said} onClose={() => { setAdding(false); setSaid(''); }} />
    </>
  );
}

const ADD_SECTIONS: Array<{ value: string; label: string }> = [
  { value: 'to-do', label: 'To-do' },
  { value: 'documents', label: 'Documents' },
  { value: 'money', label: 'Money & gear' },
  { value: 'packing', label: 'Packing' },
  { value: 'notes', label: 'A note' },
];

function DarkInput(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={C.low} selectionColor={C.lime} {...props} style={[{ height: 52, borderRadius: 999, paddingHorizontal: 18, backgroundColor: C.raised, color: C.white, fontSize: 16, fontFamily: F.med }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null, props.style]} />;
}

function SheetButton({ title, icon, onPress }: { title: string; icon: IcoName; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ height: 50, borderRadius: 999, backgroundColor: C.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}>
      <Ico name={icon} size={17} color={C.ink} />
      <Text style={{ color: C.ink, fontSize: 16, fontFamily: F.semi }}>{title}</Text>
    </Pressable>
  );
}

/** Add an item (a Task in a section, with a day if you like) or a note. */
function AddItemSheet({ ctx, trip, visible, onClose, initial = '', section: fixed }: { ctx: LifeOSContext; trip: ObjectRecord<TripData>; visible: boolean; onClose: () => void; initial?: string; section?: string }) {
  const toast = useToast();
  const [title, setTitle] = useState(initial);
  const [section, setSection] = useState(fixed ?? 'to-do');
  const [due, setDue] = useState('');
  useEffect(() => {
    if (visible) setTitle(initial);
  }, [visible, initial]);
  const save = () => {
    const what = title.trim();
    if (!what) return;
    const okDue = /^\d{4}-\d{2}-\d{2}$/.test(due.trim()) ? due.trim() : undefined;
    const note = section === 'notes';
    const r = ctx.records.create({ object: 'task', title: what, status: 'todo', data: { priority: note ? 'high' : 'medium', tripId: trip.id, section, ...(okDue && !note ? { dueDate: okDue } : {}) } }, 'user');
    toast.show({ message: `${what} added`, icon: 'check', undo: () => ctx.records.delete(r.id) });
    setTitle('');
    setDue('');
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={fixed === 'packing' ? 'Add a thing to pack' : 'Add an item or a note'}>
      <View style={{ gap: 12 }}>
        <DarkInput value={title} onChangeText={setTitle} placeholder={fixed === 'packing' ? 'Power bank' : 'Book the airport bus'} autoFocus onSubmitEditing={save} />
        {fixed ? null : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {ADD_SECTIONS.map((s) => (
              <Pressable key={s.value} accessibilityRole="button" accessibilityState={{ selected: section === s.value }} onPress={() => setSection(s.value)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: section === s.value ? C.white : C.raised }}>
                <Text style={{ color: section === s.value ? C.ink : C.white, fontSize: 13, fontFamily: F.semi }}>{s.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {fixed || section === 'notes' ? null : <DarkInput value={due} onChangeText={setDue} placeholder={`By (YYYY-MM-DD), optional${trip.data.startDate ? `: you fly ${trip.data.startDate}` : ''}`} />}
        <SheetButton title="Add" icon="plus" onPress={save} />
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Packing                                                              */
/* ------------------------------------------------------------------ */

type PillLook = 'in' | 'suggested' | 'out' | 'away';

function PackPill({ look, title, tag, tagColor, note, sparkle, onPress }: { look: PillLook; title: string; tag?: string; tagColor?: string; note?: string; sparkle?: boolean; onPress?: () => void }) {
  const bg = look === 'in' ? C.lime : look === 'out' ? C.raised : look === 'away' ? C.tile : 'transparent';
  const fg = look === 'in' ? C.ink : look === 'away' ? C.low : C.white;
  const icon: IcoName | null = look === 'in' ? 'check' : look === 'suggested' ? 'plus' : look === 'away' ? 'x' : null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected: look === 'in', disabled: !onPress }} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: icon ? 10 : 14, paddingRight: 14, borderRadius: 999, flexShrink: 0, backgroundColor: bg, borderWidth: look === 'suggested' ? 1.5 : 0, borderColor: C.lime, borderStyle: look === 'suggested' ? 'dashed' : 'solid', opacity: look === 'away' ? 0.6 : pressed ? 0.8 : 1 })}>
      {icon ? <Ico name={icon} size={look === 'away' ? 13 : 14} color={look === 'in' ? C.ink : look === 'suggested' ? C.lime : C.low} /> : null}
      <Text style={{ color: fg, fontSize: 13, fontFamily: F.semi }}>{title}</Text>
      {note ? <Text numberOfLines={1} style={{ color: C.low, fontSize: 11, fontFamily: F.semi }}>· {note}</Text> : null}
      {tag ? <Text numberOfLines={1} style={{ color: look === 'in' ? 'rgba(11,11,13,0.62)' : tagColor ?? '#9AD0FF', fontSize: 10, fontFamily: F.xbold }}>{tag}</Text> : null}
      {sparkle ? <Ico name="sparkle" size={12} color={look === 'in' ? C.ink : C.lime} /> : null}
    </Pressable>
  );
}

function Lane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
        {children}
        <View style={{ width: 10 }} />
      </ScrollView>
    </View>
  );
}

const CLIMATE_WORD = { beach: 'BEACH', cold: 'COLD', city: 'CITY' } as const;

function suggestLine(list: PackingList): string {
  const parts = (Object.keys(list.counts) as ClothesKind[]).filter((k) => list.counts[k]).map((k) => (k === 'top' || k === 'bottom' || k === 'warm' ? `${list.counts[k]} ${KIND_WORDS[k][list.counts[k] === 1 ? 0 : 1]}` : KIND_WORDS[k][0]));
  return parts.join(', ');
}

function Packing({ ctx, trip, items }: { ctx: LifeOSContext; trip: ObjectRecord<TripData>; items: ObjectRecord<TaskLike>[] }) {
  const router = useRouter();
  const toast = useToast();
  const tick = useTick(ctx);
  const people = usePeople(ctx, trip);
  const [adding, setAdding] = useState(false);
  const d = useLive((os) => ({ list: packingList(os, trip), still: stillPacked(os, trip.id), space: clothesSpaceId(os), flights: tripFlights(os, trip.id) }), [trip.id, trip.version]);
  const { list } = d;
  const tasks = items.filter((t) => t.data.section === 'packing');
  const depart = departureDay(items, trip);
  const packedClothes = list.clothes.filter((c) => c.packedHere).map((c) => c.id);
  const packedThings = list.items.filter((i) => i.packed).map((i) => i.title);
  const inBag = list.clothes.filter((c) => c.packedHere);
  const suggested = list.clothes.filter((c) => !c.packedHere && c.suggested && c.state === 'clean');
  const notPicked = list.clothes.filter((c) => !c.packedHere && !c.suggested && c.state === 'clean');
  const away = list.clothes.filter((c) => !c.packedHere && c.state !== 'clean');
  const taskTitles = new Set(tasks.map((t) => t.title.toLowerCase()));
  const fromList = list.items.filter((i) => i.from === 'list' && !taskTitles.has(i.title.toLowerCase()));
  const fromBath = list.items.filter((i) => i.from === 'bathroom');
  const fromBrain = list.items.filter((i) => i.from === 'brain');
  const thingsTotal = tasks.length + list.items.length - (list.items.length - fromList.length - fromBath.length - fromBrain.length);
  const thingsIn = tasks.filter(isDone).length + [...fromList, ...fromBath, ...fromBrain].filter((i) => i.packed).length;
  const setBag = (clothes: string[], things: string[]) => pack(ctx, trip.id, clothes, things);
  const flipCloth = (id: string, inside: boolean) => setBag(inside ? packedClothes.filter((x) => x !== id) : [...packedClothes, id], packedThings);
  const flipThing = (title: string, inside: boolean) => setBag(packedClothes, inside ? packedThings.filter((x) => x !== title) : [...packedThings, title]);
  const over = tripPhase(trip.data) === 'back';
  const toAddClothes = suggested.map((c) => c.id);
  const toAddThings = [...fromList, ...fromBath, ...fromBrain].filter((i) => !i.packed).map((i) => i.title);
  const doPack = () => {
    const n = toAddClothes.length + toAddThings.length;
    if (!n) return;
    const undo = setBag([...packedClothes, ...toAddClothes], [...packedThings, ...toAddThings]);
    toast.show({ message: `Packed ${plural(n, 'thing')} for ${trip.data.destination || trip.title}`, icon: 'check', undo });
  };
  const unpack = () => {
    const r = backHome(ctx, trip.id);
    toast.show({ message: `${r.count} in the wash`, icon: 'check', undo: r.undo });
  };
  const flight = d.flights.find((f) => trip.data.startDate && f.data.startAt && isoOf(f.data.startAt) === trip.data.startDate);
  const leaveBy = flight?.data.startAt ? flight.data.startAt - (list.abroad ? 3.5 : 2) * 3_600_000 : null;
  const shortLine = list.short.map((s) => `${KIND_WORDS[s.kind][1]}: ${s.have ? `${s.have} clean` : 'none clean'}, ${s.want} needed`).join(' · ');
  return (
    <>
      <Anim k="jr" delay={110}>
        <View style={{ gap: 10, padding: 16, backgroundColor: C.tile, borderRadius: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ico name="sparkle" size={15} color={C.lime} />
            <Text numberOfLines={1} style={{ flexShrink: 1, color: C.lime, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: F.semi }}>LIFEOS SUGGESTS · {list.days} DAYS{list.daysGuessed ? ' (NO DATES)' : ''} · {CLIMATE_WORD[list.climate]}{list.abroad ? ', ABROAD' : ''}</Text>
          </View>
          <Text style={{ color: C.white, fontSize: 20, lineHeight: 26, letterSpacing: -0.3, fontFamily: F.bold }}>
            {suggestLine(list)}
            {list.days > 7 ? <Text style={{ color: 'rgba(245,245,247,0.5)' }}>, laundry once a week</Text> : null}
          </Text>
          {shortLine && list.clothes.length ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: RED_SOFT, borderRadius: 16 }}>
              <Ico name="alert" size={15} color={RED_TEXT} />
              <Text style={{ flexShrink: 1, color: RED_TEXT, fontSize: 13, fontFamily: F.semi }}>{shortLine}</Text>
            </View>
          ) : null}
        </View>
      </Anim>

      <Anim k="jr" delay={170}>
        <View style={{ gap: 14, padding: 16, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
          <Head17
            pad={false}
            title="Clothes"
            sub={list.clothes.length ? `${inBag.length} in the bag · ${suggested.length} suggested` : 'none in Home yet'}
            right={
              <Pressable accessibilityRole="button" onPress={() => router.push((d.space ? { pathname: '/module/[id]/[page]', params: { id: 'inventory', page: 'space', space: d.space } } : '/module/inventory/index') as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 11, borderRadius: 999, backgroundColor: C.raised }}>
                <Ico name="chevron" size={13} color={C.mid} />
                <Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: F.semi }}>Home › Clothes</Text>
              </Pressable>
            }
          />
          {inBag.length ? <Lane label={`IN THE BAG · ${inBag.length}`}>{inBag.map((c) => <PackPill key={c.id} look="in" title={c.title} onPress={() => flipCloth(c.id, true)} />)}</Lane> : null}
          {suggested.length ? <Lane label={`SUGGESTED, NOT YET IN · ${suggested.length}`}>{suggested.map((c) => <PackPill key={c.id} look="suggested" title={c.title} onPress={() => flipCloth(c.id, false)} />)}</Lane> : null}
          {notPicked.length ? <Lane label="NOT PICKED">{notPicked.map((c) => <PackPill key={c.id} look="out" title={c.title} onPress={() => flipCloth(c.id, false)} />)}</Lane> : null}
          {away.length ? <Lane label="AWAY">{away.map((c) => <PackPill key={c.id} look="away" title={c.title} note={c.state === 'wash' ? 'in the wash' : 'packed for another trip'} />)}</Lane> : null}
          {!list.clothes.length ? <Text style={{ color: C.mid, fontSize: 13, lineHeight: 18, fontFamily: F.med }}>Clothes are Assets in Home › Clothes. Add yours there and they show here, sized to the days.</Text> : null}
        </View>
      </Anim>

      <Anim k="jr" delay={230}>
        <View style={{ gap: 14, padding: 16, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
          <Head17 pad={false} title="Things" sub={`${thingsIn} of ${thingsTotal} in`} />
          <Lane label="FROM THE TRIP’S LIST">
            {tasks.map((t) => <PackPill key={t.id} look={isDone(t) ? 'in' : 'out'} title={t.title} onPress={() => tick(t)} />)}
            {fromList.map((i) => <PackPill key={i.title} look={i.packed ? 'in' : 'out'} title={i.title} onPress={() => flipThing(i.title, i.packed)} />)}
          </Lane>
          {fromBath.length ? <Lane label="FROM THE BATHROOM">{fromBath.map((i) => <PackPill key={i.title} look={i.packed ? 'in' : 'out'} title={i.title} tag="BATH" onPress={() => flipThing(i.title, i.packed)} />)}</Lane> : null}
          <Lane label={fromBrain.length ? 'FROM CLAUDE · KEPT FOR TRIPS LIKE THIS ONE' : 'ADD YOUR OWN'}>
            {fromBrain.map((i) => <PackPill key={i.title} look={i.packed ? 'in' : 'out'} title={i.title} sparkle onPress={() => flipThing(i.title, i.packed)} />)}
            <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(245,245,247,0.25)', borderStyle: 'dashed', flexShrink: 0 }}>
              <Ico name="plus" size={14} color={C.mid} />
              <Text style={{ color: C.mid, fontSize: 13, fontFamily: F.semi }}>Add a thing</Text>
            </Pressable>
          </Lane>
        </View>
      </Anim>

      {depart.length || leaveBy ? (
        <Anim k="jr" delay={290}>
          <View style={{ padding: 16, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
            <Head17 pad={false} title="Departure-day check" sub={`${trip.data.startDate ? dm(trip.data.startDate) : ''} · shared ticks`} right={people.names.length > 1 ? <Faces names={people.names} size={24} ring={C.tile} /> : null} />
            {depart.map((t) => (
              <Pressable key={t.id} accessibilityRole="button" onPress={() => tick(t)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58 }}>
                <Tick done={isDone(t)} label={t.title} onPress={() => tick(t)} />
                <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: isDone(t) ? C.low : C.white, fontSize: 15, lineHeight: 20, fontFamily: F.semi, textDecorationLine: isDone(t) ? 'line-through' : 'none' }}>{t.title}</Text>
                  {isDone(t) && t.data.completedAt ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: C.ink, fontSize: 9, lineHeight: 9, fontFamily: F.bold }}>Y</Text>
                      </View>
                      <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: F.reg }}>{tickedLine(t)}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ))}
            {leaveBy && flight ? (
              <Pressable accessibilityRole="button" onPress={() => router.push(tripRoutes.booking(flight.id))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'rgba(245,245,247,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ico name="plane" size={12} color={C.mid} />
                </View>
                <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: F.semi }}>Leave for the airport by {hhmm(leaveBy)}</Text>
                  <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: F.reg }}>{[flight.data.flightNo, `at ${hhmm(flight.data.startAt!)}`].filter(Boolean).join(' ')}</Text>
                </View>
                <DatePill label={hhmm(leaveBy)} tone="lime" />
              </Pressable>
            ) : null}
          </View>
        </Anim>
      ) : null}

      <Anim k="jr" delay={350}>
        {over && d.still ? (
          <Pressable accessibilityRole="button" onPress={unpack} style={{ height: 54, borderRadius: 999, backgroundColor: C.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ico name="bag" size={17} color={C.ink} />
            <Text style={{ color: C.ink, fontSize: 16, lineHeight: 20, fontFamily: F.semi }}>Back home: {d.still} to the wash</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !(toAddClothes.length + toAddThings.length) }} onPress={doPack} style={{ height: 54, borderRadius: 999, backgroundColor: toAddClothes.length + toAddThings.length ? C.lime : C.raised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ico name="bag" size={17} color={toAddClothes.length + toAddThings.length ? C.ink : C.mid} />
            <Text style={{ color: toAddClothes.length + toAddThings.length ? C.ink : C.mid, fontSize: 16, lineHeight: 20, fontFamily: F.semi }}>{toAddClothes.length + toAddThings.length ? 'Pack' : 'All packed'}</Text>
          </Pressable>
        )}
      </Anim>
      <AddItemSheet ctx={ctx} trip={trip} visible={adding} onClose={() => setAdding(false)} section="packing" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Docs                                                                 */
/* ------------------------------------------------------------------ */

const SHELF_ICON: Record<ShelfTile['kind'], { icon: IcoName; color: string }> = {
  passport: { icon: 'book', color: '#A9C4FF' },
  visa: { icon: 'file', color: '#FF5C47' },
  ticket: { icon: 'plane', color: C.white },
  stay: { icon: 'bed', color: '#F2C94C' },
  insurance: { icon: 'shield', color: '#5FD08A' },
  qr: { icon: 'qr', color: '#E08BC8' },
  doc: { icon: 'file', color: C.mid },
};

function dlIcon(title: string): { icon: IcoName; color: string } {
  if (/map/i.test(title)) return { icon: 'map', color: '#5FD08A' };
  if (/translat|language|japanese/i.test(title)) return { icon: 'globe', color: '#A9C4FF' };
  if (/itinerar|pdf|plan/i.test(title)) return { icon: 'file', color: '#F2C94C' };
  return { icon: 'download', color: C.lime };
}

function Docs({ ctx, trip, items }: { ctx: LifeOSContext; trip: ObjectRecord<TripData>; items: ObjectRecord<TaskLike>[] }) {
  const router = useRouter();
  const toast = useToast();
  const tick = useTick(ctx);
  const d = useLive((os) => ({ shelf: docsShelf(os, trip), papers: tripPapers(os, trip), saved: offlineSavedAt(os, trip.id) }), [trip.id, trip.version, items.length]);
  const [at, setAt] = useState(0);
  const sos = emergencyFor(trip);
  const downloads = items.filter(isDownload);
  const photos = d.papers.filter((p) => p.kind === 'Photo');
  const paper: Paper | undefined = d.papers[Math.min(at, d.papers.length - 1)];
  const call = (n: string) => Linking.openURL(`tel:${n.replace(/[^\d+]/g, '')}`).catch(() => undefined);
  const addDoc = () => router.push({ pathname: '/entity/[type]/new', params: { type: 'document', tripId: trip.id } } as never);
  const offline = async () => {
    if (await saveOfflineCopy(ctx, trip).catch(() => false)) toast.show({ message: 'Offline copy saved', icon: 'check' });
    else toast.show({ message: 'Couldn’t save the offline copy', icon: 'alert' });
  };
  const openTile = (s: ShelfTile) => {
    if (s.open.task) router.push(`/entity/task/${s.open.task}` as never);
    else if (s.open.document) router.push(`/entity/document/${s.open.document}` as never);
    else router.push(tripRoutes.bookings(trip.id));
  };
  const download = async (p: Paper) => {
    if (p.file && ctx.device?.folders?.open) {
      await ctx.device.folders.open(p.file.uri, p.file.mime).catch(() => toast.show({ message: 'Couldn’t open that file', icon: 'alert' }));
      return;
    }
    const text = [p.title, '', ...p.lines].join('\n');
    if (!(await shareText(`${p.title.replace(/[^\w-]+/g, '-').toLowerCase()}.txt`, text, 'text/plain', p.title).catch(() => false))) toast.show({ message: 'Couldn’t save that paper', icon: 'alert' });
  };
  const remove = (p: Paper) => {
    ctx.records.delete(p.id, 'user');
    toast.show({ message: `${p.title} deleted`, icon: 'check', undo: () => ctx.records.restore(p.id, 'user') });
  };
  const savedAt = d.saved ? `${dm(isoOf(d.saved))}, ${hhmm(d.saved)}` : null;
  const tiles = d.shelf;
  const rows: ShelfTile[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <>
      <Anim k="jr" delay={110}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: C.tile, borderRadius: 20 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: LIME_SOFT, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ico name="download" size={16} color={C.lime} />
          </View>
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
            <Text style={{ color: C.white, fontSize: 14, fontFamily: F.bold }}>{savedAt ? `Saved offline · ${savedAt}` : 'Not saved offline yet'}</Text>
            <Text style={{ color: C.mid, fontSize: 12, fontFamily: F.reg }}>bookings, tickets, addresses and the plan</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={offline} style={{ height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.raised, justifyContent: 'center', flexShrink: 0 }}>
            <Text style={{ color: C.white, fontSize: 13, lineHeight: 20, fontFamily: F.semi }}>{savedAt ? 'Update' : 'Save'}</Text>
          </Pressable>
        </View>
      </Anim>

      <Anim k="jr" delay={170}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable accessibilityRole="button" onPress={() => (d.papers.length ? setAt(0) : addDoc())} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 10, padding: 14, backgroundColor: C.tile, borderRadius: 26 }}>
            <PaperStack count={d.papers.length} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
                <Ico name="file" size={14} color={C.mid} />
              </View>
              <View style={{ minWidth: 0, flexShrink: 1 }}>
                <Text numberOfLines={1} style={{ color: C.white, fontSize: 14, fontFamily: F.bold }}>Your files</Text>
                <Text numberOfLines={1} style={{ color: C.mid, fontSize: 11, fontFamily: F.reg }}>tickets, stays, papers</Text>
              </View>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={addDoc} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: 136, borderRadius: 26, overflow: 'hidden', backgroundColor: '#2B1A1F' }}>
            <View style={[bgImage('linear-gradient(180deg, #5A3A3C 0%, #2B1A1F 55%, #120C0E 100%)'), { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]} />
            {[
              { w: 68, t: -19, l: '10%', c: '#F4A8CE', o: 0.56 },
              { w: 70, t: 3, l: '52%', c: '#C0607E', o: 0.74 },
              { w: 97, t: -4, l: '91%', c: '#FFD6BE', o: 0.73 },
              { w: 90, t: 49, l: '87%', c: '#F4A8CE', o: 0.46 },
              { w: 79, t: 88, l: '44%', c: '#C0607E', o: 0.4 },
              { w: 54, t: 90, l: '68%', c: '#FFD6BE', o: 0.48 },
            ].map((g, i) => (
              <View key={i} style={[bgImage(`radial-gradient(closest-side, ${g.c} 0%, ${g.c} 55%, rgba(0,0,0,0) 100%)`), { position: 'absolute', width: g.w, height: g.w, top: g.t, left: g.l as `${number}%`, borderRadius: g.w / 2, opacity: g.o, filter: `blur(${Math.round(g.w / 6)}px)` } as object]} />
            ))}
            <View style={[bgImage('linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.35) 100%)'), { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]} />
            <View style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: C.white, fontSize: 17, lineHeight: 21, fontFamily: F.bold }}>Photos of papers</Text>
              <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: F.semi }}>{photos.length ? `${photos.length} · ${photos.slice(0, 2).map((p) => p.title.toLowerCase()).join(', ')}` : 'none yet · add one'}</Text>
            </View>
          </Pressable>
        </View>
      </Anim>

      {rows.length ? (
        <Anim k="jr" delay={230}>
          <View style={{ gap: 8 }}>
            {rows.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row', gap: 8 }}>
                {row.map((s, ci) => {
                  const ic = SHELF_ICON[s.kind];
                  return (
                    <Anim key={s.key} k="jr" delay={200 + (ri * 2 + ci) * 40} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
                      <Pressable accessibilityRole="button" onPress={() => openTile(s)} style={{ gap: 10, padding: 14, backgroundColor: C.tile, borderRadius: 22 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
                            <Ico name={ic.icon} size={17} color={ic.color} />
                          </View>
                          <View style={{ flexGrow: 1 }} />
                          {s.status === 'done' ? <DatePill small tone="lime" label="Done" /> : s.status === 'due' && s.due ? <DatePill small label={`Due ${dm(s.due)}`} /> : <DatePill small tone="red" label="Pending" />}
                        </View>
                        <View>
                          <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: F.semi }}>{s.title}</Text>
                          <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: F.reg }}>{s.line}</Text>
                        </View>
                      </Pressable>
                    </Anim>
                  );
                })}
                {row.length === 1 ? <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }} /> : null}
              </View>
            ))}
          </View>
        </Anim>
      ) : null}

      <Anim k="jr" delay={290}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={addDoc} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 50, borderRadius: 999, backgroundColor: C.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ico name="plus" size={17} color={C.ink} />
            <Text style={{ color: C.ink, fontSize: 16, lineHeight: 20, fontFamily: F.semi }}>Add docs</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={offline} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 50, borderRadius: 999, backgroundColor: C.raised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ico name="download" size={17} color={C.lime} />
            <Text numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 20, fontFamily: F.semi }}>Save offline copy</Text>
          </Pressable>
        </View>
      </Anim>

      {paper ? (
        <Anim k="jr" delay={350}>
          <View style={{ gap: 12, padding: 16, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
            <Head17 pad={false} title={`${paper.title} · ${paper.source === 'event' ? (paper.kind === 'E-ticket' ? 'e-ticket' : 'confirmation') : 'paper'}`} sub={`${paper.kind} · ${Math.min(at, d.papers.length - 1) + 1} of ${d.papers.length}`} />
            <View style={{ gap: 8, height: 250, padding: 18, backgroundColor: '#F3F1EC', borderRadius: 16, overflow: 'hidden' }}>
              <Text style={{ color: C.ink, fontSize: 13, fontFamily: F.xbold }}>{paper.source === 'event' ? (paper.kind === 'E-ticket' ? 'E-ticket' : 'Booking confirmation') : paper.kind}</Text>
              <Text numberOfLines={2} style={{ color: C.ink, fontSize: 20, fontFamily: JP_SANS, fontWeight: '900' }}>{paper.title}</Text>
              {paper.lines.slice(0, 5).map((l, i) => <Text key={i} numberOfLines={1} style={{ color: i % 2 ? 'rgba(11,11,13,0.62)' : C.ink, fontSize: 12, lineHeight: 16, fontFamily: F.semi }}>{l}</Text>)}
              {['88%', '70%', '92%', '60%', '80%', '66%'].slice(0, Math.max(0, 6 - paper.lines.length)).map((w, i) => <View key={w} style={{ width: w as `${number}%`, height: 6, borderRadius: 3, backgroundColor: i % 3 ? 'rgba(11,11,13,0.16)' : 'rgba(11,11,13,0.32)' }} />)}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
                <Ico name="eyeOff" size={12} color="rgba(11,11,13,0.62)" />
                <Text style={{ color: 'rgba(11,11,13,0.62)', fontSize: 11, fontFamily: F.bold }}>{paper.reference ? 'Reference hidden from viewers' : 'No reference on this paper'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {[
                { label: 'Previous', icon: 'back' as IcoName, color: C.white, on: at > 0, go: () => setAt((x) => Math.max(0, x - 1)) },
                { label: 'Next', icon: 'chevron' as IcoName, color: C.white, on: at < d.papers.length - 1, go: () => setAt((x) => Math.min(d.papers.length - 1, x + 1)) },
              ].map((b) => (
                <Pressable key={b.label} accessibilityRole="button" accessibilityLabel={b.label} accessibilityState={{ disabled: !b.on }} disabled={!b.on} onPress={b.go} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center', opacity: b.on ? 1 : 0.4 }}>
                  <Ico name={b.icon} size={18} color={b.color} />
                </Pressable>
              ))}
              <View style={{ flexGrow: 1 }} />
              <Pressable accessibilityRole="button" accessibilityLabel="Download" onPress={() => download(paper)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
                <Ico name="download" size={18} color={C.lime} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Delete" onPress={() => remove(paper)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
                <Ico name="trash" size={18} color={RED_TEXT} />
              </Pressable>
            </View>
          </View>
        </Anim>
      ) : null}

      {downloads.length ? (
        <>
          <Anim k="jr" delay={410}>
            <Head17 title="Downloads" sub={trip.data.startDate && isoOf(Date.now()) < trip.data.startDate ? 'before you fly' : 'for the trip'} />
          </Anim>
          <Anim k="jr" delay={470}>
            <View style={{ padding: 14, backgroundColor: C.tile, borderRadius: 24, overflow: 'hidden' }}>
              <View style={{ gap: 8 }}>
                {downloads.map((t, i) => {
                  const ic = dlIcon(t.title);
                  return (
                    <React.Fragment key={t.id}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`${t.title}, ${isDone(t) ? 'done' : 'not yet'}`} onPress={() => tick(t)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 50 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
                          <Ico name={isDone(t) ? 'check' : ic.icon} size={16} color={isDone(t) ? C.lime : ic.color} />
                        </View>
                        <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, fontFamily: F.semi }}>{t.title}</Text>
                          <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: F.med }}>{[t.data.notes?.split('\n')[0], isDone(t) ? 'done' : 'not yet'].filter(Boolean).join(' · ')}</Text>
                        </View>
                        {t.data.dueDate ? <DatePill label={dm(t.data.dueDate)} /> : null}
                      </Pressable>
                      {i < downloads.length - 1 ? <View style={{ height: 1, backgroundColor: C.line }} /> : null}
                    </React.Fragment>
                  );
                })}
              </View>
            </View>
          </Anim>
        </>
      ) : null}

      {sos ? (
        <Anim k="jr" delay={530}>
          <View style={{ gap: 12, padding: 16, backgroundColor: '#FF5C47', borderRadius: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ color: C.ink, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontFamily: F.semi }}>IN AN EMERGENCY{isJapan(trip) ? ' · 緊急' : ` · ${sos.country.toUpperCase()}`}</Text>
              <View style={{ flexGrow: 1 }} />
              <Ico name="phone" size={16} color={C.ink} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { n: sos.police, what: sos.police === sos.ambulance ? 'Police, ambulance, fire' : 'Police' },
                ...(sos.police === sos.ambulance ? [] : [{ n: sos.ambulance, what: 'Ambulance and fire' }]),
              ].map((x) => (
                <Pressable key={x.what} accessibilityRole="button" accessibilityLabel={`Call ${x.what}, ${x.n}`} onPress={() => call(x.n)} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: 'rgba(11,11,13,0.14)', borderRadius: 18 }}>
                  <Text style={{ color: C.ink, fontSize: 30, lineHeight: 34, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: F.xbold }}>{x.n}</Text>
                  <Text style={{ color: 'rgba(11,11,13,0.62)', fontSize: 12, fontFamily: F.bold }}>{x.what}</Text>
                </Pressable>
              ))}
            </View>
            {sos.line ? (
              <Pressable accessibilityRole="button" onPress={() => {
                const n = sos.line?.match(/[\d-]{6,}/)?.[0];
                if (n) call(n);
              }}>
                <Text style={{ color: C.ink, fontSize: 13, fontFamily: F.bold }}>{sos.line}</Text>
              </Pressable>
            ) : null}
          </View>
        </Anim>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* On the trip page                                                     */
/* ------------------------------------------------------------------ */

/** Money and Prep side by side on the trip page: your balance and projected spend, and Ready to fly. */
export function MoneyPrepCard({ tripId }: { tripId: string }) {
  const t = useTheme();
  const router = useRouter();
  const d = useLive((os) => {
    const trip = os.records.get<TripData>(tripId);
    if (trip?.object !== 'trip') return null;
    const items = checklistOf(os, tripId).filter((x) => x.data.section !== 'packing');
    return { trip, mine: projectedOf(tripLedger(os, trip), 'me').total, net: tripBalances(os, trip).net.me ?? 0, ready: readyToFly(items), notes: notesOf(os, tripId).filter((n) => n.data.priority === 'urgent' || n.data.priority === 'high').length };
  }, [tripId]);
  if (!d) return null;
  const inr = (n: number) => money(Math.round(n), 'INR');
  const tile = { flex: 1, padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 4 } as const;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Money" onPress={() => router.push(tripRoutes.money(tripId))} style={({ pressed }) => ({ ...tile, opacity: pressed ? 0.8 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="wallet" size={16} color={C.lime} />
          <KitText variant="labelCaps" color="secondary">MONEY</KitText>
        </View>
        <KitText style={{ fontSize: 22, fontWeight: '700', color: d.net < -0.5 ? C.coral : d.net > 0.5 ? C.lime : t.c.fg.primary, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{inr(Math.abs(d.net))}</KitText>
        <KitText variant="caption" color="secondary" numberOfLines={1}>{d.net < -0.5 ? 'you owe · Settle up' : d.net > 0.5 ? 'you’re owed · Settle up' : 'all settled up'}</KitText>
        <KitText style={{ fontSize: 12, fontWeight: '600', color: d.trip.data.budget && d.mine > d.trip.data.budget ? C.coral : t.c.fg.secondary }} numberOfLines={1}>{d.trip.data.budget ? `${inr(Math.abs(d.trip.data.budget - d.mine))} ${d.mine > d.trip.data.budget ? 'over' : 'left'} of budget` : `${inr(d.mine)} projected`}</KitText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Prep" onPress={() => router.push(prepRoute(tripId) as never)} style={({ pressed }) => ({ ...tile, opacity: pressed ? 0.8 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="check" size={16} color={C.lime} />
          <KitText variant="labelCaps" color="secondary">PREP</KitText>
        </View>
        <KitText style={{ fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{Math.round(d.ready.share * 100)}%</KitText>
        <KitText variant="caption" color="secondary" numberOfLines={1}>{d.ready.total ? `${d.ready.done} of ${d.ready.total} done` : 'no checklist yet'}</KitText>
        <KitText style={{ fontSize: 12, fontWeight: '600', color: d.ready.overdue || d.notes ? C.coral : t.c.fg.secondary }} numberOfLines={1}>{d.ready.overdue ? `${d.ready.overdue} overdue` : d.notes ? plural(d.notes, 'heads-up') : 'Ready to fly'}</KitText>
      </Pressable>
    </View>
  );
}
