import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, EmptyState, Icon, Screen, Segmented, Sheet, Text, TextField, useToast, type IconName } from '@ui/kit';
import { toggleTask, type TaskData } from '@modules/projects';
import { checklistOf, emergencyFor, filterChecklist, isDone, notesOf, projectedOf, readyToFly, SECTION_LABEL, SECTIONS, sectionsOf, tripBalances, tripDocuments, tripLedger, type PrepFilter, type TaskLike, type TripData } from '@modules/travel';
import { datesLabel, Note, plural, Row, RowCard, routes, SectionHead } from './parts';
import { amount } from './bookings';
import { moneyRoute } from './money';

/**
 * Prep (the trip template, R7g slice 5; JP-Checklist, JP-Packing, JP-Docs):
 * Ready to fly by section, the notes to be aware of, the checklist with its
 * filters and sections (each a Task with this Trip; ticking is projects'),
 * the departure-day check, packing items, and the docs shelf with the
 * emergency card. Packing your clothes stays on Packing.
 */

export const prepRoute = (tripId: string, tab?: 'checklist' | 'packing' | 'docs') => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'prep', trip: tripId, ...(tab ? { tab } : {}) } });
const LIME = '#D7F55C';
const CORAL = '#FF6B7A';
const YELLOW = '#F6E27F';
const NOTE_TONE: Record<string, { color: string; icon: IconName; word: string }> = {
  urgent: { color: CORAL, icon: 'warning', word: 'Act now' },
  high: { color: YELLOW, icon: 'warning', word: 'Heads up' },
  medium: { color: '#8C9DFF', icon: 'info', word: 'Note' },
  low: { color: '#8C9DFF', icon: 'info', word: 'Good to know' },
};
const FILTERS: Array<{ value: PrepFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'before', label: 'Before we fly' },
  { value: 'during', label: 'On the trip' },
  { value: 'nodate', label: 'No date' },
];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Pills<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {options.map((o) => (
        <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: o.value === value }} onPress={() => onChange(o.value)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: o.value === value ? '#F5F5F7' : t.c.bg.tileRaised }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: o.value === value ? '#0B0B0D' : t.c.fg.secondary }}>{o.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Tick({ done, onPress, label }: { done: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: done }} hitSlop={10} onPress={onPress} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: done ? LIME : 'rgba(245,245,247,0.4)', backgroundColor: done ? LIME : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {done ? <Icon name="check" size={14} color="#0B0B0D" /> : null}
    </Pressable>
  );
}

export function PrepScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const [tab, setTab] = useState<'checklist' | 'packing' | 'docs'>(params.tab === 'packing' || params.tab === 'docs' ? params.tab : 'checklist');
  const trip = useLive((os) => {
    const x = os.records.get<TripData>(params.trip ?? '');
    return x?.object === 'trip' ? x : null;
  }, [params.trip]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/travel/index' as never));
  if (!trip) {
    return (
      <Screen title="Prep" onBack={back}>
        <EmptyState icon="check" tint="travel" line="That trip isn’t here any more." />
      </Screen>
    );
  }
  return (
    <Screen title="Prep" subtitle={trip.title} onBack={back} contentStyle={{ gap: 14 }}>
      <Segmented options={[{ value: 'checklist', label: 'Checklist' }, { value: 'packing', label: 'Packing' }, { value: 'docs', label: 'Docs' }]} value={tab} onChange={setTab} />
      {tab === 'checklist' ? <Checklist trip={trip} ctx={ctx} /> : tab === 'packing' ? <Packing trip={trip} ctx={ctx} /> : <Docs trip={trip} />}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Checklist                                                            */
/* ------------------------------------------------------------------ */

function useTicks(ctx: LifeOSContext) {
  const toast = useToast();
  return (task: ObjectRecord<TaskLike>) => {
    const was = task.status;
    toggleTask(ctx, task as unknown as ObjectRecord<TaskData>);
    if (was !== 'done') toast.show({ message: `${task.title} done`, icon: 'check', undo: () => void ctx.records.update(task.id, { status: was ?? 'todo', data: { completedAt: undefined } }, 'user') });
  };
}

function Checklist({ trip, ctx }: { trip: ObjectRecord<TripData>; ctx: LifeOSContext }) {
  const t = useTheme();
  const router = useRouter();
  const tick = useTicks(ctx);
  const [filter, setFilter] = useState<PrepFilter>('all');
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const d = useLive((os) => ({ items: checklistOf(os, trip.id).filter((x) => x.data.section !== 'packing'), notes: notesOf(os, trip.id) }), [trip.id]);
  const ready = readyToFly(d.items);
  const shown = filterChecklist(d.items, filter, trip);
  const groups = sectionsOf(showDone || filter !== 'all' ? shown : shown.filter((x) => !isDone(x)));
  const doneCount = d.items.filter(isDone).length;
  const departure = trip.data.startDate ? d.items.filter((x) => x.data.dueDate === trip.data.startDate) : [];
  const counts: Partial<Record<PrepFilter, number>> = { overdue: filterChecklist(d.items, 'overdue', trip).length, week: filterChecklist(d.items, 'week', trip).length };
  return (
    <View style={{ gap: 14 }}>
      <View style={{ padding: 16, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text variant="labelCaps" color="secondary">READY TO FLY</Text>
          <View style={{ flex: 1 }} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: ready.overdue ? CORAL : ready.dueToday ? YELLOW : t.c.fg.secondary }}>{ready.overdue ? `${ready.overdue} overdue` : ready.dueToday ? `${ready.dueToday} due today` : 'nothing late'}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ fontSize: 34, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{Math.round(ready.share * 100)}%</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: t.c.fg.secondary }}>{ready.done} of {ready.total} done</Text>
        </View>
        <View style={{ height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: t.c.bg.tileRaised }}>
          <View style={{ width: `${Math.round(ready.share * 100)}%`, height: 10, backgroundColor: LIME }} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {ready.bySection.map((s) => (
            <View key={s.section} style={{ width: '46%', gap: 2 }}>
              <Text style={{ fontSize: 11, color: t.c.fg.secondary }}>{SECTION_LABEL[s.section] ?? s.section}</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: s.done === s.total ? LIME : t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{s.done}/{s.total}</Text>
            </View>
          ))}
        </View>
      </View>

      {d.notes.length ? (
        <View style={{ gap: 8 }}>
          <SectionHead title="To be aware of" sub={plural(d.notes.length, 'note')} />
          {d.notes.map((n) => {
            const tone = NOTE_TONE[n.data.priority ?? 'medium']!;
            return (
              <View key={n.id} style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 22, backgroundColor: t.c.bg.tile, borderLeftWidth: 3, borderLeftColor: tone.color }}>
                <Icon name={tone.icon} size={18} color={tone.color} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: tone.color }}>{tone.word.toUpperCase()}{n.data.dueDate ? ` · BY ${datesLabel({ startDate: n.data.dueDate }).toUpperCase()}` : ''}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '600' }}>{n.title}</Text>
                  {n.data.notes ? <Text variant="caption" color="secondary">{n.data.notes}</Text> : null}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${n.title} handled`} hitSlop={8} onPress={() => tick(n)}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: LIME }}>Handled</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      <Pills options={FILTERS.map((f) => ({ value: f.value, label: counts[f.value] ? `${f.label} · ${counts[f.value]}` : f.label }))} value={filter} onChange={setFilter} />

      {groups.map((g) => (
        <View key={g.section} style={{ gap: 8 }}>
          <SectionHead title={SECTION_LABEL[g.section] ?? g.section} sub={`${g.items.filter(isDone).length}/${g.items.length}`} />
          <RowCard>
            {g.items.map((x) => {
              const late = !isDone(x) && x.data.dueDate && x.data.dueDate < today();
              return (
                <Row
                  key={x.id}
                  lead={<Tick done={isDone(x)} label={x.title} onPress={() => tick(x)} />}
                  title={x.title}
                  lines={2}
                  sub={[x.data.dueDate ? `${late ? 'was due' : 'by'} ${datesLabel({ startDate: x.data.dueDate })}` : null, x.data.notes?.split('\n')[0]].filter(Boolean).join(' · ') || null}
                  trailing={late ? <Text style={{ fontSize: 12, fontWeight: '700', color: CORAL }}>late</Text> : null}
                  onPress={() => router.push(`/entity/task/${x.id}` as never)}
                />
              );
            })}
          </RowCard>
        </View>
      ))}
      {!groups.length ? <Note icon="check">{filter === 'all' ? 'Nothing left to do. Add an item, or ask the copilot what this trip still needs.' : 'Nothing here for that filter.'}</Note> : null}
      {filter === 'all' && doneCount ? <Button title={showDone ? 'Hide done' : `Show done · ${doneCount}`} variant="ghost" onPress={() => setShowDone((x) => !x)} /> : null}

      {departure.length ? (
        <View style={{ gap: 8 }}>
          <SectionHead title="Departure day" sub={`${datesLabel({ startDate: trip.data.startDate! })} · ${departure.filter(isDone).length}/${departure.length}`} />
          <RowCard>
            {departure.map((x) => <Row key={x.id} lead={<Tick done={isDone(x)} label={x.title} onPress={() => tick(x)} />} title={x.title} minHeight={44} />)}
          </RowCard>
        </View>
      ) : null}

      <Button title="Add an item" icon="plus" onPress={() => setAdding(true)} />
      <AddItemSheet visible={adding} onClose={() => setAdding(false)} trip={trip} ctx={ctx} />
    </View>
  );
}

function AddItemSheet({ visible, onClose, trip, ctx, packing }: { visible: boolean; onClose: () => void; trip: ObjectRecord<TripData>; ctx: LifeOSContext; packing?: boolean }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [section, setSection] = useState<string>(packing ? 'packing' : 'to-do');
  const [due, setDue] = useState('');
  const save = () => {
    if (!title.trim()) return;
    const okDue = /^\d{4}-\d{2}-\d{2}$/.test(due.trim()) ? due.trim() : undefined;
    const r = ctx.records.create({ object: 'task', title: title.trim(), status: 'todo', data: { priority: 'medium', tripId: trip.id, section, ...(okDue ? { dueDate: okDue } : {}) } }, 'user');
    toast.show({ message: `${title.trim()} added`, icon: 'check', undo: () => ctx.records.delete(r.id) });
    setTitle('');
    setDue('');
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={packing ? 'Add to pack' : 'Add to the checklist'}>
      <View style={{ gap: 12 }}>
        <TextField label="What" value={title} onChange={setTitle} placeholder={packing ? 'Universal adapter' : 'Book the airport limo bus'} />
        {!packing ? <Pills options={SECTIONS.map((s) => ({ value: s as string, label: SECTION_LABEL[s] ?? s }))} value={section} onChange={setSection} /> : null}
        {!packing ? <TextField label="By (YYYY-MM-DD, optional)" value={due} onChange={setDue} placeholder={trip.data.startDate ?? ''} /> : null}
        <Button title="Add" icon="check" onPress={save} />
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Packing                                                              */
/* ------------------------------------------------------------------ */

function Packing({ trip, ctx }: { trip: ObjectRecord<TripData>; ctx: LifeOSContext }) {
  const router = useRouter();
  const tick = useTicks(ctx);
  const [adding, setAdding] = useState(false);
  const items = useLive((os) => checklistOf(os, trip.id).filter((x) => x.data.section === 'packing'), [trip.id]);
  const n = items.filter(isDone).length;
  return (
    <View style={{ gap: 14 }}>
      <Pressable accessibilityRole="button" onPress={() => router.push(routes.pack(trip.id) as never)}>
        <Note icon="bag">Your clothes and Home’s Bathroom are on Packing, sized to the days. Open it.</Note>
      </Pressable>
      <SectionHead title="To pack" sub={items.length ? `${n} of ${items.length} in the bag` : 'nothing yet'} />
      {items.length ? (
        <RowCard>
          {items.map((x) => <Row key={x.id} lead={<Tick done={isDone(x)} label={x.title} onPress={() => tick(x)} />} title={x.title} sub={x.data.notes?.split('\n')[0] ?? null} minHeight={48} />)}
        </RowCard>
      ) : (
        <Note icon="check">Adapters, the JR pass voucher, the pocket Wi-Fi: things that are not clothes go here.</Note>
      )}
      <Button title="Add to pack" icon="plus" onPress={() => setAdding(true)} />
      <AddItemSheet visible={adding} onClose={() => setAdding(false)} trip={trip} ctx={ctx} packing />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Docs                                                                 */
/* ------------------------------------------------------------------ */

function Docs({ trip }: { trip: ObjectRecord<TripData> }) {
  const t = useTheme();
  const router = useRouter();
  const d = useLive((os) => ({ docs: tripDocuments(os, trip.id), tasks: checklistOf(os, trip.id).filter((x) => x.data.section === 'documents') }), [trip.id]);
  const sos = emergencyFor(trip);
  const call = (n: string) => Linking.openURL(`tel:${n.replace(/[^\d+]/g, '')}`).catch(() => undefined);
  return (
    <View style={{ gap: 14 }}>
      {sos ? (
        <View style={{ padding: 16, borderRadius: 28, backgroundColor: 'rgba(255,107,122,0.12)', gap: 10 }}>
          <Text variant="labelCaps" style={{ color: CORAL }}>EMERGENCY · {sos.country.toUpperCase()}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={`Police ${sos.police}`} icon="phone" variant="secondary" size="sm" onPress={() => call(sos.police)} style={{ flex: 1 }} />
            <Button title={`Ambulance ${sos.ambulance}`} icon="phone" variant="secondary" size="sm" onPress={() => call(sos.ambulance)} style={{ flex: 1 }} />
          </View>
          {sos.line ? <Text variant="caption" color="secondary">{sos.line}</Text> : null}
        </View>
      ) : null}
      <SectionHead title="Papers" sub={d.docs.length ? plural(d.docs.length, 'document') : 'none linked yet'} action="Add" onAction={() => router.push({ pathname: '/entity/[type]/new', params: { type: 'document', tripId: trip.id } } as never)} />
      {d.docs.length ? (
        <RowCard>
          {d.docs.map((x) => <Row key={x.id} lead={<Icon name="file" size={18} color={LIME} />} title={x.title} sub={[x.data.kind, x.data.expiresOn ? `valid to ${datesLabel({ startDate: x.data.expiresOn })}` : null].filter(Boolean).join(' · ') || null} onPress={() => router.push(`/entity/document/${x.id}` as never)} />)}
        </RowCard>
      ) : (
        <Note icon="file">Passports, the insurance, the JR pass: link a Document to this trip to keep it here, offline.</Note>
      )}
      {d.tasks.length ? (
        <>
          <SectionHead title="Still to sort" sub={`${d.tasks.filter((x) => !isDone(x)).length} open`} />
          <RowCard>{d.tasks.map((x) => <Row key={x.id} lead={<Icon name={isDone(x) ? 'check' : 'clock'} size={18} color={isDone(x) ? LIME : t.c.fg.secondary} />} title={x.title} sub={x.data.dueDate ? `by ${datesLabel({ startDate: x.data.dueDate })}` : null} onPress={() => router.push(`/entity/task/${x.id}` as never)} />)}</RowCard>
        </>
      ) : null}
    </View>
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
  const inr = (n: number) => amount(Math.round(n), 'INR');
  const tile = { flex: 1, padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 4 } as const;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Money" onPress={() => router.push(moneyRoute(tripId) as never)} style={({ pressed }) => ({ ...tile, opacity: pressed ? 0.8 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="wallet" size={16} color={LIME} />
          <Text variant="labelCaps" color="secondary">MONEY</Text>
        </View>
        <Text style={{ fontSize: 22, fontWeight: '700', color: d.net < -0.5 ? CORAL : d.net > 0.5 ? LIME : t.c.fg.primary, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{inr(Math.abs(d.net))}</Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>{d.net < -0.5 ? 'you owe · Settle up' : d.net > 0.5 ? 'you’re owed · Settle up' : 'all settled up'}</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: d.trip.data.budget && d.mine > d.trip.data.budget ? CORAL : t.c.fg.secondary }} numberOfLines={1}>{d.trip.data.budget ? `${inr(Math.abs(d.trip.data.budget - d.mine))} ${d.mine > d.trip.data.budget ? 'over' : 'left'} of budget` : `${inr(d.mine)} projected`}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Prep" onPress={() => router.push(prepRoute(tripId) as never)} style={({ pressed }) => ({ ...tile, opacity: pressed ? 0.8 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="check" size={16} color={LIME} />
          <Text variant="labelCaps" color="secondary">PREP</Text>
        </View>
        <Text style={{ fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{Math.round(d.ready.share * 100)}%</Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>{d.ready.total ? `${d.ready.done} of ${d.ready.total} done` : 'no checklist yet'}</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: d.ready.overdue || d.notes ? CORAL : t.c.fg.secondary }} numberOfLines={1}>{d.ready.overdue ? `${d.ready.overdue} overdue` : d.notes ? plural(d.notes, 'heads-up') : 'Ready to fly'}</Text>
      </Pressable>
    </View>
  );
}
