import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ActionSheet, Button, Icon, Segmented, Sheet, Text, TextField, useToast, type IconName } from '@ui/kit';
import { addThing, eventsOf, filterThings, happeningOn, nightsOf, onRouteSuggestions, OUTING_KINDS, setThingStatus, stopSpan, thingsAt, thingStatus, type OutingData, type OutingKind, type StopData, type ThingFilter, type ThingStatus, type TripData } from '@modules/travel';
import { datesLabel, Row, RowCard, SectionHead } from './parts';
import { amount, openUrl } from './bookings';

/**
 * Things to do and events on the route (the trip template, R7g slice 3;
 * JP-Place): a stop's things with All · Planned · Want to · Ideas · Free,
 * how busy and the quietest time, links to book and Google Maps; the events
 * and what to be aware of (closures, holidays, crowds, weather), with
 * Claude's suggestions for the stop's dates offered to add.
 */

const STATUS_WORD: Record<ThingStatus, string> = { idea: 'Idea', want: 'Want to', planned: 'Planned', done: 'Done' };
const HAPPEN_ICON: Record<string, IconName> = { festival: 'sparkle', seasonal: 'leaf', closure: 'lock', crowds: 'people', holiday: 'calendar', weather: 'snow' };
const kindIcon = (k: OutingKind) => (OUTING_KINDS.find((x) => x.value === k)?.icon ?? 'star') as IconName;
/** "quietest before 8:00", but "Quiet in winter" as it is. */
const quietWords = (q: string) => (/\b(quiet|busy|crowd|best)/i.test(q) ? q : `quietest ${q.replace(/^\w/, (c) => c.toLowerCase())}`);
const SURE_WORD: Record<string, string> = { official: 'official', past: 'past pattern', predicted: 'predicted' };

function StatusPill({ s }: { s: ThingStatus }) {
  const t = useTheme();
  const c = s === 'planned' ? ['rgba(215,245,92,0.16)', '#D7F55C'] : s === 'want' ? ['rgba(246,226,127,0.16)', '#F6E27F'] : [t.c.bg.tileRaised, t.c.fg.secondary];
  return (
    <View style={{ height: 22, paddingHorizontal: 9, borderRadius: 999, backgroundColor: c[0], justifyContent: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: c[1] }}>{STATUS_WORD[s]}</Text>
    </View>
  );
}

/** The crowd meter: five cells, lit up to how busy it gets. */
function Crowd({ n }: { n: number }) {
  return (
    <View accessibilityLabel={`How busy: ${n} of 5`} style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => <View key={i} style={{ width: 5, height: 10, borderRadius: 2, backgroundColor: i <= n ? (n >= 4 ? '#FF6B7A' : n >= 3 ? '#F6E27F' : '#5FD08A') : 'rgba(245,245,247,0.14)' }} />)}
    </View>
  );
}

/** A stop's things to do, with filters, a sheet per thing, and Add. */
export function ThingsSection({ stop, ctx, currency }: { stop: ObjectRecord<StopData>; ctx: LifeOSContext; currency: string }) {
  const router = useRouter();
  const toast = useToast();
  const t = useTheme();
  const [filter, setFilter] = useState<ThingFilter>('all');
  const [open, setOpen] = useState<ObjectRecord<OutingData> | null>(null);
  const [adding, setAdding] = useState(false);
  const all = useLive((os) => thingsAt(os, os.records.get<StopData>(stop.id) ?? stop), [stop.id]);
  const shown = filterThings(all, filter);
  const count = (f: ThingFilter) => filterThings(all, f).length;
  const set = (x: ObjectRecord<OutingData>, s: ThingStatus) => toast.show({ message: `${x.title}: ${STATUS_WORD[s].toLowerCase()}`, icon: 'check', undo: setThingStatus(ctx, x.id, s) });
  const maps = (x: ObjectRecord<OutingData>) => openUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${x.title} ${stop.title}`)}`);
  const planned = count('planned');
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Things to do" sub={`${all.length} here${planned ? ` · ${planned} planned` : ''}`} action="Add" onAction={() => setAdding(true)} />
      {all.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {(['all', 'planned', 'want', 'idea', 'free'] as ThingFilter[]).map((f) => {
            const on = f === filter;
            const label = f === 'all' ? 'All' : f === 'want' ? `Want to · ${count(f)}` : f === 'idea' ? `Ideas · ${count(f)}` : `${f === 'planned' ? 'Planned' : 'Free'} · ${count(f)}`;
            return (
              <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFilter(f)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? '#F5F5F7' : t.c.bg.tileRaised }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#0B0B0D' : t.c.fg.secondary }}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <RowCard>
        {shown.map((x) => (
          <Row
            key={x.id}
            minHeight={60}
            lines={2}
            lead={<View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}><Icon name={kindIcon(x.data.kind)} size={16} color={t.c.fg.primary} /></View>}
            title={x.title}
            sub={[OUTING_KINDS.find((k) => k.value === x.data.kind)?.label, x.data.cost === 0 ? 'Free' : x.data.cost ? `${amount(x.data.cost, currency)} each` : null, x.data.quietest ? quietWords(x.data.quietest) : null].filter(Boolean).join(' · ')}
            trailing={<View style={{ alignItems: 'flex-end', gap: 6 }}><StatusPill s={thingStatus(x)} />{x.data.crowd ? <Crowd n={x.data.crowd} /> : null}</View>}
            onPress={() => setOpen(x)}
          />
        ))}
        {!all.length ? <Text variant="caption" color="secondary" style={{ paddingVertical: 10 }}>Nothing yet. Add what you’d like to see, eat or do here.</Text> : !shown.length ? <Text variant="caption" color="secondary" style={{ paddingVertical: 10 }}>None in this filter.</Text> : null}
      </RowCard>
      <ActionSheet
        visible={!!open}
        onClose={() => setOpen(null)}
        title={open?.title}
        actions={
          open
            ? [
                ...(['planned', 'want', 'idea', 'done'] as ThingStatus[]).filter((s) => s !== thingStatus(open)).map((s) => ({ label: STATUS_WORD[s], icon: s === 'planned' ? 'check' : s === 'want' ? 'star' : s === 'done' ? 'check-circle' : 'bulb', onPress: () => set(open, s) })),
                ...(open.data.book ?? []).map((b) => ({ label: b.label, icon: 'link', onPress: () => openUrl(b.url) })),
                { label: 'Open in Google Maps', icon: 'map', onPress: () => maps(open) },
                { label: 'Open', icon: 'arrow-right', onPress: () => router.push(`/entity/outing/${open.id}` as never) },
              ]
            : []
        }
      />
      <AddThing visible={adding} onClose={() => setAdding(false)} onAdd={(title, kind) => toast.show({ message: `${title} added`, icon: 'check', undo: (() => { const x = addThing(ctx, stop.data.tripId!, title, { kind, stopId: stop.id }); return () => ctx.records.delete(x.id, 'user'); })() })} />
    </View>
  );
}

function AddThing({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (title: string, kind: OutingKind) => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<OutingKind>('see');
  const go = () => {
    if (!title.trim()) return;
    onAdd(title.trim(), kind);
    setTitle('');
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add a thing to do">
      <View style={{ gap: 14 }}>
        <TextField label="What" value={title} onChange={setTitle} placeholder="Gohei-mochi" returnKeyType="done" onSubmitEditing={go} />
        <Segmented options={OUTING_KINDS.filter((k) => k.value !== 'event').map((k) => ({ value: k.value as OutingKind, label: k.label }))} value={kind} onChange={setKind} />
        <Button title="Add" icon="plus" onPress={go} disabled={!title.trim()} />
      </View>
    </Sheet>
  );
}

function EventRow({ e, onPress }: { e: ObjectRecord<OutingData>; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Row
      minHeight={58}
      lines={2}
      lead={<View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}><Icon name={HAPPEN_ICON[e.data.happening ?? 'seasonal'] ?? 'calendar'} size={16} color={e.data.happening === 'closure' || e.data.happening === 'weather' ? '#F6E27F' : '#D7F55C'} /></View>}
      title={e.title}
      sub={[e.data.day ? datesLabel({ startDate: e.data.day, endDate: e.data.until && e.data.until !== e.data.day ? e.data.until : undefined }) : null, e.data.happening, e.data.sure ? SURE_WORD[e.data.sure] : null].filter(Boolean).join(' · ')}
      onPress={onPress}
    />
  );
}

/** On your route (trip page): the events on the trip's dates, festivals and what to be aware of. */
export function OnRouteCard({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const events = useLive((os) => {
    const trip = os.records.get<TripData>(tripId);
    return trip ? eventsOf(os, trip) : [];
  }, [tripId]);
  if (!events.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="On your route" sub={`what’s on while you’re there · ${events.length}`} action={events.length > 5 ? (all ? 'Less' : 'All') : undefined} onAction={() => setAll((x) => !x)} />
      <RowCard>{(all ? events : events.slice(0, 5)).map((e) => <EventRow key={e.id} e={e} onPress={() => router.push(`/entity/outing/${e.id}` as never)} />)}</RowCard>
    </View>
  );
}

/** A stop's events on its dates, and Claude's suggestions for them, offered to add. */
export function StopEvents({ stop, ctx }: { stop: ObjectRecord<StopData>; ctx: LifeOSContext }) {
  const router = useRouter();
  const toast = useToast();
  const d = useLive((os) => {
    const trip = stop.data.tripId ? os.records.get<TripData>(stop.data.tripId) : null;
    if (!trip) return null;
    const span = stopSpan(nightsOf(os, trip), stop.id);
    const events = eventsOf(os, trip).filter((e) => e.data.stopId === stop.id || (!e.data.stopId && span && e.data.day && e.data.day < span.to && (e.data.until ?? e.data.day) >= span.from));
    return { trip, span, events, suggested: span ? onRouteSuggestions(os, stop, span) : [] };
  }, [stop.id]);
  if (!d || (!d.events.length && !d.suggested.length)) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="On your dates" sub={d.span ? datesLabel({ startDate: d.span.from, endDate: d.span.to }) : null} />
      {d.events.length ? <RowCard>{d.events.map((e) => <EventRow key={e.id} e={e} onPress={() => router.push(`/entity/outing/${e.id}` as never)} />)}</RowCard> : null}
      {d.suggested.length ? (
        <View style={{ gap: 8, padding: 14, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(215,245,92,0.35)' }}>
          <Text variant="labelCaps" color="secondary">✦ SUGGESTED BY CLAUDE</Text>
          {d.suggested.map((s) => (
            <Row
              key={s.title}
              lines={2}
              title={s.title}
              sub={[s.day ? datesLabel({ startDate: s.day, endDate: s.until && s.until !== s.day ? s.until : undefined }) : null, s.happening, s.line].filter(Boolean).join(' · ')}
              trailing={<Button title="Add" size="sm" variant="secondary" onPress={() => { const x = addThing(ctx, d.trip.id, s.title, { kind: 'event', stopId: stop.id, day: s.day, until: s.until, happening: s.happening, sure: s.sure, notes: s.line, suggested: true }); toast.show({ message: `${s.title} added`, icon: 'check', undo: () => ctx.records.delete(x.id, 'user') }); }} />}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Happening today, on a day's page: the events covering it and the things planned for it. */
export function HappeningToday({ trip, day, stopId }: { trip: ObjectRecord<TripData>; day: string; stopId: string | null }) {
  const router = useRouter();
  const h = useLive((os) => happeningOn(os, trip, day, stopId), [trip.id, day, stopId]);
  if (!h.events.length && !h.planned.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Happening today" sub="on your route" />
      <RowCard>
        {h.events.map((e) => <EventRow key={e.id} e={e} onPress={() => router.push(`/entity/outing/${e.id}` as never)} />)}
        {h.planned.map((x) => <Row key={x.id} lines={2} title={x.title} sub={[STATUS_WORD[thingStatus(x)], x.data.notes?.split('\n')[0]].filter(Boolean).join(' · ')} trailing={<StatusPill s={thingStatus(x)} />} onPress={() => router.push(`/entity/outing/${x.id}` as never)} />)}
      </RowCard>
    </View>
  );
}
