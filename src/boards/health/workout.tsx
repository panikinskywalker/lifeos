import React, { useState, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { linkGroups } from '@core/graph/read';
import { backlinks } from '@core/links';
import { WORKOUT_KINDS, type WorkoutData } from '@modules/health';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { tintForModule } from '@ui/theme/moduleTint';
import { Icon, IconButton, Text, useToast } from '@ui/kit';
import { Caps, Disc, Group, Hairline, Head, PillAction, Row, SecHead, WideButton, kindIcon, originIcon } from './parts';
import { clock, dayWords, longDay, originOf } from './data';

/**
 * A workout's whole page (NR-Health-Workout): the duration large with what
 * it measured and where it came from, then Details, Links, Facts, Timeline,
 * Tags and the "Tell me about" bar. Reminders, attachments, Dumps and
 * mentions show when it has any.
 */

const INTENSITY: Record<string, string> = { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' };

export function WorkoutPage({ entity, ctx: os, controls, say }: { entity: ObjectRecord<WorkoutData>; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const w = entity.data;
  const [allTimeline, setAllTimeline] = useState(false);
  const view = useLive((o) => {
    const groups = linkGroups(o, entity.id).map((g) => ({
      word: g.word,
      items: g.items.map((i) => ({
        ...i,
        workoutsHere: i.type === 'place' ? o.links.forEntity(i.id).filter((l) => l.other.object === 'workout').length : 0,
        label: o.registry.objects.get(i.type)?.label ?? i.type,
        icon: o.registry.objects.get(i.type)?.icon ?? 'link',
      })),
    }));
    return {
      groups,
      facts: o.facts.list({ subjectId: entity.id, limit: 50 }),
      events: o.records.timeline.forEntity(entity.id, 60),
      tags: o.tags.forEntity(entity.id),
      origin: originOf(o, entity.id, w.source),
      dumps: o.dumps.forEntity(entity.id),
      reminders: o.reminders.forEntity(entity.id).filter((r) => !r.doneAt),
      attachments: o.attachments.forEntity(entity.id).filter((a) => a.kind !== 'cover'),
      mentions: backlinks(o, entity.id),
    };
  }, [entity.id, w.source]);

  const open = (to: string) => () => router.push(to as never);
  const placeName = view.groups.flatMap((g) => g.items).find((i) => i.type === 'place')?.title;
  const kindName = WORKOUT_KINDS.find((k) => k.value === w.kind)?.label ?? 'Other';
  const heroStats = [
    w.distanceKm ? { value: `${w.distanceKm} km`, label: 'distance' } : null,
    w.calories ? { value: String(w.calories), label: 'calories' } : null,
    w.intensity ? { value: INTENSITY[w.intensity] ?? w.intensity, label: 'intensity' } : null,
  ].filter((x) => x != null);
  const o = originIcon(t, view.origin);
  const originChip = view.origin.kind === 'source' ? 'Health Connect' : view.origin.kind === 'dump' ? 'From a Dump' : 'Added by you';
  const originLine = view.origin.kind === 'source' ? `read ${clock(entity.createdAt)}` : view.origin.kind === 'dump' ? `“${view.origin.said}”` : null;
  const removeLink = (linkId: string, fromId: string, toId: string, kind: string, title: string) => {
    os.links.remove(linkId);
    toast.show({ message: `Removed the link to ${title}`, icon: 'link', undo: () => void os.links.link(fromId, toId, kind) });
  };
  const timeline = allTimeline ? view.events : view.events.slice(0, 3);

  return (
    <View style={{ paddingHorizontal: t.layout.gutter, paddingTop: insets.top + 16, gap: 24 }}>
      <Head
        dot
        sub={`Workout · ${dayWords(w.date)}`}
        title={entity.title}
        onBack={controls?.back}
        right={<><PillAction label="Edit" onPress={() => controls?.edit()} /><IconButton icon="more" filled accessibilityLabel="More" onPress={() => controls?.more()} /></>}
      />

      <View style={{ paddingVertical: 20, paddingHorizontal: 18, borderRadius: t.radius.tile, backgroundColor: t.c.bg.tile, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={kindIcon(w.kind)} size={26} color={t.c.accent.mustardInk} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={{ fontSize: 40, lineHeight: 41, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'] }}>{w.durationMin}</Text>
              <Text color="secondary" style={{ fontSize: 15, lineHeight: 19, fontWeight: '600' }}>min</Text>
            </View>
            <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{[dayWords(w.date), placeName].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
        {heroStats.length ? (
          <View style={{ flexDirection: 'row', gap: 14 }}>
            {heroStats.map(({ value, label }, i) => (
              <View key={label} style={[{ flex: 1, gap: 2, minWidth: 0 }, i ? { paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: t.c.line } : null]}>
                <Text variant="metric" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{value}</Text>
                <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500' }}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 9, paddingRight: 12, borderRadius: 15, backgroundColor: t.c.bg.tileRaised }}>
            <Icon name={o.icon} size={14} color={o.color} />
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{originChip}</Text>
          </View>
          {originLine ? <Text variant="caption" color="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>{originLine}</Text> : null}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <SecHead title="Details" action="Edit" onAction={() => controls?.edit()} />
        <View style={{ paddingVertical: 4, paddingHorizontal: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile }}>
          <Detail label="Type" first>
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 9, paddingRight: 12, borderRadius: 15, backgroundColor: t.c.bg.tileRaised }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.c.accent.mustard }} />
              <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{kindName}</Text>
            </View>
          </Detail>
          <Detail label="Duration" value={`${w.durationMin} min`} />
          <Detail label="Date" value={longDay(w.date)} />
          {w.startAt ? <Detail label="Started" value={clock(w.startAt)} /> : null}
          {w.distanceKm ? <Detail label="Distance" value={`${w.distanceKm} km`} /> : null}
          {w.calories ? <Detail label="Calories" value={String(w.calories)} /> : null}
          {w.notes ? (
            <Detail label="Notes">
              <Text selectable style={{ fontSize: 15, lineHeight: 21, fontWeight: '500' }}>{w.notes}</Text>
            </Detail>
          ) : null}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <SecHead title="Links" action="Open Links" onAction={open(`/links/${entity.id}`)} />
        <View style={{ padding: 14, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, gap: 8 }}>
          {view.groups.length ? null : <Text variant="caption" color="secondary" style={{ paddingHorizontal: 2 }}>Nothing linked yet. Link a place, a person or a trip.</Text>}
          {view.groups.map((g, gi) => (
            <React.Fragment key={g.word}>
              {gi ? <Hairline /> : null}
              <View style={{ paddingHorizontal: 2, paddingTop: gi ? 4 : 2 }}>
                <Caps>{g.word.toUpperCase()}</Caps>
              </View>
              {g.items.map((i) => (
                <Row
                  key={i.linkId}
                  minHeight={52}
                  lead={i.type === 'person' ? <Initial name={i.title} /> : <Disc icon={i.icon} color={t.tints[tintForModule(i.module ?? undefined)].ink} />}
                  title={i.title}
                  sub={i.workoutsHere ? `${i.label} · ${i.workoutsHere} ${i.workoutsHere === 1 ? 'workout' : 'workouts'} here` : i.label}
                  right={<Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />}
                  onPress={open(`/entity/${i.type}/${i.id}`)}
                  onLongPress={() => removeLink(i.linkId, i.fromId, i.toId, i.kind, i.title)}
                />
              ))}
            </React.Fragment>
          ))}
          <View style={{ marginTop: 4 }}>
            <WideButton title="Link" icon="plus" onPress={() => controls?.link()} />
          </View>
        </View>
      </View>

      {view.facts.length ? (
        <View style={{ gap: 10 }}>
          <SecHead title="Facts" action={String(view.facts.length)} />
          {view.facts.map((f) => (
            <Pressable key={f.id} accessibilityHint="Long-press to forget" onLongPress={() => os.facts.forget(f.id)} style={{ padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, gap: 6 }}>
              <Text selectable style={{ fontSize: 15, lineHeight: 21, fontWeight: '500' }}>{f.text.replace(/\[\[|\]\]/g, '')}</Text>
              <Text color="tertiary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{`${f.source === 'dump' ? 'From a Dump' : f.source === 'user' ? 'From you' : 'Noted'} · ${dayName(f.statedAt)} ${clock(f.statedAt)}`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {view.events.length ? (
        <View style={{ gap: 10 }}>
          <SecHead title="Timeline" action={view.events.length > 3 ? (allTimeline ? 'Less' : `All ${view.events.length}`) : undefined} onAction={() => setAllTimeline((a) => !a)} />
          <View style={{ gap: 18, paddingVertical: 4 }}>
            <View pointerEvents="none" style={{ position: 'absolute', left: 17, top: 22, bottom: 22, width: 2, borderRadius: 1, backgroundColor: t.c.rail }} />
            {timeline.map((e) => {
              const created = e.kind === 'created';
              const fromHc = created && view.origin.kind === 'source';
              return (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                  <View style={{ width: 44, height: 44, margin: -4, borderRadius: 22, borderWidth: 4, borderColor: t.c.bg.ground, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={fromHc ? 'phone' : created ? 'plus' : e.kind === 'relation' ? 'link' : 'edit'} size={16} color={t.c.accent.mustard} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: 7 }}>
                    <Text variant="rowTitle" numberOfLines={2}>{fromHc ? 'Read from Health Connect' : e.title}</Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>{fromHc ? 'Created' : e.actor === 'assistant' ? 'Filing' : e.actor === 'automation' ? 'Automation' : e.actor === 'system' ? 'Health Connect' : 'By you'}</Text>
                  </View>
                  <Text variant="mono" color="tertiary" style={{ fontSize: 12, lineHeight: 16, letterSpacing: 0, paddingTop: 10 }}>{`${dayName(e.occurredAt)} ${timeOf(e.occurredAt)}`}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <View style={{ paddingTop: 4, paddingHorizontal: 4 }}>
          <Text variant="heading">Tags</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {view.tags.map((tg) => (
            <Pressable key={tg.id} accessibilityRole="button" accessibilityLabel={`Tag ${tg.name}`} hitSlop={6} onPress={open(`/tag/${encodeURIComponent(tg.name)}`)} style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{`#${tg.name}`}</Text>
            </Pressable>
          ))}
          <IconButton icon="plus" size={32} filled accessibilityLabel="Add tag" onPress={() => controls?.tags()} />
        </View>
      </View>

      {view.reminders.length ? (
        <Extra title="Reminders">
          {view.reminders.map((r) => <Row key={r.id} lead={<Disc icon="bell" color={t.c.accent.mustard} />} title={r.title} sub={os.format.dateTime(r.snoozedUntil ?? r.nextAt ?? r.dueAt)} />)}
        </Extra>
      ) : null}
      {view.attachments.length ? (
        <Extra title="Attachments">
          {view.attachments.map((a) => <Row key={a.id} lead={<Disc icon="file" />} title={a.name} onPress={() => void Linking.openURL(a.uri).catch(() => {})} onLongPress={() => os.attachments.remove(a.id)} />)}
        </Extra>
      ) : null}
      {view.dumps.length ? (
        <Extra title="Dumps">
          {view.dumps.slice(0, 8).map((d) => <Row key={d.id} lead={<Disc icon="brain" color={t.c.accent.mustard} />} title={d.body.trim().split('\n')[0]!} onPress={open(`/dump/${d.id}`)} />)}
        </Extra>
      ) : null}
      {view.mentions.length ? (
        <Extra title="Mentioned in">
          {view.mentions.map((n) => <Row key={n.id} lead={<Disc icon="file" />} title={n.title} onPress={open(`/entity/${n.object}/${n.id}`)} />)}
        </Extra>
      ) : null}

      {say}
    </View>
  );
}

const dayName = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short' });
const timeOf = (ms: number) => clock(ms).replace(/\s?[ap]m$/, '');

function Extra({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <SecHead title={title} />
      <Group>{children}</Group>
    </View>
  );
}

function Detail({ label, value, children, first }: { label: string; value?: string; children?: ReactNode; first?: boolean }) {
  const t = useTheme();
  return (
    <View style={[{ gap: 2, minHeight: 56, justifyContent: 'center', paddingVertical: children && !first ? 10 : 0 }, first ? null : { borderTopWidth: 1, borderTopColor: t.c.line }]}>
      <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500' }}>{label}</Text>
      {value != null ? <Text variant="rowTitle" style={{ fontVariant: ['tabular-nums'] }}>{value}</Text> : children}
    </View>
  );
}

/** A person's 40 disc with their initial. */
function Initial({ name }: { name: string }) {
  const t = useTheme();
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.tints.travel.ink, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: t.c.fg.onAccent }}>{name.trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}
