import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TileDef } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Text } from '@ui/kit';
import { eventsOn, overdueTasks } from '@modules/projects';
import { ACCENT, Face, clock, dayTasks, dueWords, personsOf, ymd } from './parts';

/**
 * Projects on Today (NR-Projects-Tile): small (2 x 2) or wide (4 x 2). What's
 * due today, what's overdue, the next event. Both open the Projects home. The
 * lilac dot is the Tasks colour from Browse.
 */

const LOOK_AHEAD_DAYS = 14;

function ProjectsTodayTile({ wide }: { wide?: boolean }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const d = useLive((o) => {
    if (!o.registry.objects.has('task')) return null;
    const now = Date.now();
    const { open, done } = dayTasks(o, now);
    const next = eventsOn(o, now, LOOK_AHEAD_DAYS).filter((e) => e.start >= now).sort((a, b) => a.start - b.start)[0] ?? null;
    return { now, due: [...open, ...done].map((x) => x.title), overdue: overdueTasks(o, now).length, next };
  }, []);
  if (!d) return null;

  const n = d.due.length;
  const clear = !n && !d.overdue;
  const headline = clear ? 'All clear' : wide ? `${n} due today` : `${n} today`;
  const next = d.next;
  const isToday = next ? ymd(next.start) === ymd(d.now) : false;
  const nextTime = !next ? '' : next.allDay ? dueWords(ymd(next.start), d.now) : isToday ? (wide ? clock(os, next.start).full : clock(os, next.start).lead) : wide ? `${dueWords(ymd(next.start), d.now)} ${clock(os, next.start).full}` : dueWords(ymd(next.start), d.now);
  const nextPlace = next?.location?.split(',')[0]?.trim();
  const person = next && wide ? personsOf(os, next.id)[0] : undefined;
  const label = [`Projects: ${clear ? 'nothing due' : `${n} due today`}`, d.overdue ? `${d.overdue} overdue` : null, next ? `next ${next.title} ${nextTime}` : null].filter(Boolean).join(', ');

  const title = <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 30, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'], color: t.c.fg.primary }}>{headline}</Text>;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push('/module/projects/index' as never)} style={({ pressed }) => [{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, justifyContent: 'space-between', opacity: pressed ? 0.9 : 1 }, wide ? { minHeight: 167 } : { flex: 1, aspectRatio: 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.secondary }}>PROJECTS</Text>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT }} />
      </View>

      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            {title}
            <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', color: t.c.fg.secondary }}>{n ? d.due.join(' · ') : 'nothing due today'}</Text>
          </View>
          {d.overdue ? (
            <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.c.alert.coralFill, justifyContent: 'center', flexShrink: 0 }}>
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', fontVariant: ['tabular-nums'], color: t.c.alert.coralText }}>{`${d.overdue} overdue`}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 2 }}>
          {title}
          <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', fontVariant: ['tabular-nums'], color: d.overdue ? t.c.alert.coralText : t.c.fg.secondary }}>{d.overdue ? `${d.overdue} overdue` : clear ? 'nothing due today' : 'none overdue'}</Text>
        </View>
      )}

      {next ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? 10 : 6, minWidth: 0 }}>
          {wide ? <Icon name="calendar" size={14} color={ACCENT} /> : null}
          <Text style={{ flexShrink: 0, fontSize: wide ? 13 : 12, lineHeight: wide ? 17 : 15, fontWeight: '700', fontVariant: ['tabular-nums'], color: ACCENT }}>{nextTime}</Text>
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: wide ? 13 : 12, lineHeight: wide ? 17 : 15, fontWeight: '600', color: wide ? t.c.fg.primary : t.c.fg.secondary }}>{wide && nextPlace ? `${next.title} · ${nextPlace}` : next.title}</Text>
          {person ? <Face ctx={os} id={person.id} name={person.title} size={24} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export const projectsTiles: TileDef[] = [{ type: 'projects', board: 'projects', name: 'Projects', description: 'What’s due today, what’s overdue, the next event', icon: 'check-circle', sizes: ['small', 'medium'], defaultSize: 'small', component: ({ size }) => <ProjectsTodayTile wide={size !== 'small'} /> }];
