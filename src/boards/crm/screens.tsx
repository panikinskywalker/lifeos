import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ChipRow, FilterChip, IconButton, Screen, Sheet, Text, useToast } from '@ui/kit';
import { birthdayParts, CADENCES, cadenceLabel, daysSince, peopleToCall, touchLastSpoke, type PersonData } from '@modules/crm';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { BirthdayRow, BirthdayTodayCard } from './birthday';
import { CallTrio, Chip28, Face, PeopleEmpty, shortSpan } from './parts';
import { cadenceShort, GroupRow, groupKindLabel, loadGroups, matchesPerson, PersonRow, RowCard, SearchField, SectionHead, type GroupItem } from './lists';

/**
 * People home (NR-People-Home, the crm board's index): search, the quick
 * filters, the Due strip (a lime ring = a call or birthday is due), who to
 * call or message this week, birthdays in the next 30 days, people you have
 * not spoken to in a while (set them a rhythm), and your groups with what
 * each owes. With no one yet, the empty state.
 */

const DAY = 86_400_000;
const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const tel = (p: ObjectRecord<PersonData>) => p.data.phone?.replace(/[^+\d]/g, '') || null;

/** Whole days from today to the next birthday (0 = today); null without a readable date. */
export function daysToBirthday(iso: string | undefined, now = Date.now()): number | null {
  const b = birthdayParts(iso);
  if (!b) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const next = new Date(today.getFullYear(), b.month - 1, b.day);
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / DAY);
}

/** "12 d overdue · every 2 wk" · "due today · weekly" · "in 3 d · monthly". */
function dueChip(days: number, every?: string) {
  const what = days < 0 ? `${-days} d overdue` : days === 0 ? 'due today' : `in ${days} d`;
  const tone = days < 0 ? 'coral' : days === 0 ? 'lime' : 'quiet';
  return { label: [what, cadenceShort(every)].filter(Boolean).join(' · '), tone } as const;
}

const QUICK = [
  { label: 'Family', params: { relationship: 'family', title: 'Family' } },
  { label: 'Friends', params: { relationship: 'friend', title: 'Friends' } },
  { label: 'Work', params: { relationship: 'colleague,client', title: 'Work' } },
] as const;

export function PeopleHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [stripWidth, setStripWidth] = useState(0);
  const [rhythmFor, setRhythmFor] = useState<ObjectRecord<PersonData> | null>(null);

  const data = useLive((os) => {
    const now = Date.now();
    const people = os.records.query<PersonData>('person', {}, { limit: 5000 });
    const byId = new Map(people.map((p) => [p.id, p]));
    const due = peopleToCall(os, { withinDays: 7, birthdayDays: 7, limit: 500 }, now);
    const order = new Map<string, number>();
    due.forEach((d, i) => !order.has(d.id) && order.set(d.id, i));
    // The strip: who is due first (soonest), then starred, then whoever you spoke to last.
    const strip = [...people].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity) || Number(b.starred) - Number(a.starred) || (b.data.lastContactAt ?? '').localeCompare(a.data.lastContactAt ?? '') || a.title.localeCompare(b.title));
    const calls = due
      .filter((d) => d.reason === 'keep in touch')
      .flatMap((d) => {
        const p = byId.get(d.id);
        return p ? [{ p, days: Math.round((d.dueAt - now) / DAY) }] : [];
      });
    const birthdays = people
      .flatMap((p) => {
        const days = daysToBirthday(p.data.birthday, now);
        return days != null && days <= 30 ? [{ p, days }] : [];
      })
      .sort((a, b) => a.days - b.days || a.p.title.localeCompare(b.p.title));
    // Not spoken in a while: no rhythm, and 3+ months since you last spoke (or never, but things are linked to them).
    const quiet = people
      .flatMap((p) => {
        if (p.data.contactEvery) return [];
        const since = daysSince(p.data.lastContactAt, now);
        if (since != null ? since < 91 : !os.links.forEntity(p.id).length) return [];
        return [{ p, since }];
      })
      .sort((a, b) => (b.since ?? -1) - (a.since ?? -1))
      .slice(0, 5);
    return { people, strip, ring: new Set(order.keys()), calls, birthdays, quiet, groups: loadGroups(os) };
  }, []);

  const open = (p: ObjectRecord<PersonData>) => router.push(`/entity/person/${p.id}` as never);
  const list = (params?: Record<string, string>) => router.push({ pathname: '/module/[id]/[page]', params: { id: 'crm', page: 'list', ...params } } as never);

  const logContact = (p: ObjectRecord<PersonData>) => {
    const prev = p.data.lastContactAt;
    if (!touchLastSpoke(ctx, p.id, Date.now())) {
      toast.show({ message: `Already logged today with ${first(p.title)}`, icon: 'check' });
      return;
    }
    toast.show({ message: `Logged contact with ${first(p.title)}`, icon: 'check', undo: () => void ctx.records.update<PersonData>(p.id, { data: { lastContactAt: prev } }) });
  };
  const setRhythm = (p: ObjectRecord<PersonData>, every: string) => {
    const prev = p.data.contactEvery;
    ctx.records.update<PersonData>(p.id, { data: { contactEvery: every } });
    setRhythmFor(null);
    toast.show({ message: `${first(p.title)}: ${cadenceLabel(every)?.toLowerCase() ?? 'set'}`, icon: 'check', undo: () => void ctx.records.update<PersonData>(p.id, { data: { contactEvery: prev } }) });
  };

  const n = data.people.length;
  const header = {
    title: 'People',
    subtitle: `${n} ${n === 1 ? 'person' : 'people'}${data.calls.length ? ` · ${data.calls.length} to call` : ''}`,
    right: (
      <>
        <ToCheckBell />
        <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="Add a person" onPress={() => router.push('/entity/person/new' as never)} />
      </>
    ),
  };

  if (!n) {
    return (
      <Screen {...header} contentStyle={{ gap: 24 }}>
        <PeopleEmpty title="No one here yet" line="Pick a few people from your contacts, or tell Dump about someone." primary={{ label: 'Pick contacts', onPress: () => router.push('/settings/contacts' as never) }} secondary={{ label: 'Add by hand', onPress: () => router.push('/entity/person/new' as never) }} />
      </Screen>
    );
  }

  const searching = !!q.trim();
  const results = searching ? data.people.filter((p) => matchesPerson(p, q)).sort((a, b) => a.title.localeCompare(b.title)).slice(0, 40) : [];

  // The Due strip: as many 56 faces as fit (6 apart); the last slot is "+N · All" when there are more.
  const slots = stripWidth ? Math.max(1, Math.floor((stripWidth + 6) / 62)) : 6;
  const more = data.strip.length > slots;
  const faces = data.strip.slice(0, more ? slots - 1 : slots);

  const todays = data.birthdays.filter((b) => b.days === 0);
  const coming = data.birthdays.filter((b) => b.days > 0).slice(0, 6);
  const groupLine = (g: GroupItem) => [groupKindLabel(g.group.data.kind), `${g.members.length} ${g.members.length === 1 ? 'person' : 'people'}`].filter(Boolean).join(' · ');

  return (
    <Screen {...header} contentStyle={{ gap: 24 }}>
      <SearchField value={q} onChange={setQ} />

      {searching ? null : (
        <ChipRow>
          <FilterChip label="Everyone" selected onPress={() => list()} />
          {QUICK.map((f) => <FilterChip key={f.label} label={f.label} onPress={() => list({ ...f.params })} />)}
          <FilterChip label="Groups" onPress={() => list({ view: 'groups' })} />
          <FilterChip label="Pick contacts" icon="user" onPress={() => router.push('/settings/contacts' as never)} />
        </ChipRow>
      )}

      {searching ? (
        <View style={{ gap: 10 }}>
          <SectionHead title={results.length ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}` : 'No matches'} sub={results.length ? null : `No one matches “${q.trim()}”`} />
          {results.length ? (
            <RowCard>
              {results.map((p) => <PersonRow key={p.id} person={p} onPress={() => open(p)} />)}
            </RowCard>
          ) : null}
        </View>
      ) : (
        <>
          <View style={{ gap: 10 }}>
            <SectionHead title="Due" sub="A lime ring = a call or birthday is due" action={`All ${n}`} onAction={() => list()} />
            <View onLayout={(e) => setStripWidth(Math.round(e.nativeEvent.layout.width))} style={{ flexDirection: 'row', gap: 6, overflow: 'visible' }}>
              {faces.map((p) => {
                const due = data.ring.has(p.id);
                return (
                  <Pressable key={p.id} onPress={() => open(p)} accessibilityRole="button" accessibilityLabel={due ? `${p.title}, due` : p.title} style={{ width: 56, alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 56, height: 56 }}>
                      <Face id={p.id} name={p.title} photo={p.data.photo?.uri} size={56} due={due} ground={t.c.bg.ground} />
                      {due ? <View style={{ position: 'absolute', right: -2, bottom: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: t.c.accent.mustard, borderWidth: 2, borderColor: t.c.bg.ground }} /> : null}
                    </View>
                    <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: t.c.fg.secondary }}>{first(p.title)}</Text>
                  </Pressable>
                );
              })}
              {more ? (
                <Pressable onPress={() => list()} accessibilityRole="button" accessibilityLabel={`All ${n} people`} style={{ width: 56, alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.fg.primary }}>{`+${data.strip.length - faces.length}`}</Text>
                  </View>
                  <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: t.c.fg.secondary }}>All</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {data.calls.length ? (
            <View style={{ gap: 10 }}>
              <SectionHead title="Call or message" sub={`${data.calls.length} due this week`} />
              <RowCard>
                {data.calls.slice(0, 8).map(({ p, days }) => {
                  const chip = dueChip(days, p.data.contactEvery);
                  const phone = tel(p);
                  return (
                    <Pressable key={p.id} onPress={() => open(p)} accessibilityRole="button" accessibilityLabel={`${p.title}, ${chip.label}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.75 : 1 })}>
                      <Face id={p.id} name={p.title} photo={p.data.photo?.uri} size={40} />
                      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{p.title}</Text>
                        <Chip28 label={chip.label} tone={chip.tone} />
                      </View>
                      {/* The artboard's row has two discs (Call, Log contact): a third would cut the chip. Message is on their page. */}
                      <CallTrio size={40} onCall={phone ? () => void Linking.openURL(`tel:${phone}`) : undefined} onLog={() => logContact(p)} />
                    </Pressable>
                  );
                })}
              </RowCard>
            </View>
          ) : null}

          {data.birthdays.length ? (
            <View style={{ gap: 10 }}>
              <SectionHead title="Birthdays coming up" sub="Next 30 days" />
              {todays.map(({ p }) => <BirthdayTodayCard key={p.id} person={p} ctx={ctx} />)}
              {coming.length ? (
                <RowCard>
                  {coming.map(({ p, days }) => <BirthdayRow key={p.id} person={p} days={days} ctx={ctx} />)}
                </RowCard>
              ) : null}
            </View>
          ) : null}

          {data.quiet.length ? (
            <View style={{ gap: 10 }}>
              <SectionHead title="Not spoken in a while" sub="Set a rhythm and they’ll show up above" />
              <RowCard>
                {data.quiet.map(({ p, since }) => (
                  <Pressable key={p.id} onPress={() => open(p)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, opacity: pressed ? 0.75 : 1 })}>
                    <Face id={p.id} name={p.title} photo={p.data.photo?.uri} size={40} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{p.title}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{since != null ? `Last spoke ${shortSpan(since)} ago · no rhythm` : 'Never logged · no rhythm'}</Text>
                    </View>
                    <FilterChip label="Set rhythm" onPress={() => setRhythmFor(p)} />
                  </Pressable>
                ))}
              </RowCard>
            </View>
          ) : null}

          {data.groups.length ? (
            <View style={{ gap: 10 }}>
              <SectionHead title="Groups" action={`All ${data.groups.length}`} onAction={() => list({ view: 'groups' })} />
              <RowCard>
                {data.groups.slice(0, 4).map((g) => (
                  <GroupRow key={g.group.id} item={g} line={groupLine(g)} chevron format={ctx.format.currency} onPress={() => router.push(`/entity/group/${g.group.id}` as never)} />
                ))}
              </RowCard>
            </View>
          ) : null}
        </>
      )}

      <Sheet visible={!!rhythmFor} onClose={() => setRhythmFor(null)} title={rhythmFor ? `Keep in touch with ${first(rhythmFor.title)}` : 'Keep in touch'}>
        <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>How often do you want to speak? When it’s time, they show up under Call or message.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 }}>
          {CADENCES.map((c) => (
            <FilterChip key={c.value} label={c.label} selected={rhythmFor?.data.contactEvery === c.value} onPress={() => rhythmFor && setRhythm(rhythmFor, c.value)} />
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}
