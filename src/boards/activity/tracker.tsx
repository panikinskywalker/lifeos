import React, { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { dayMatches, removeTracker, ruleText, trackerSummary, trackers, type TrackerRule } from '@core/activity/trackers';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { monoFonts } from '@ui/theme/tokens';
import { EmptyState, Icon, IconButton, Screen, Text } from '@ui/kit';
import { ActivityGrid, faint, TrackerDisc, trackerColor } from './grid';

const MONO = monoFonts[700];

export const RULE_ICON: Record<TrackerRule['kind'], string> = { message: 'comment', payment: 'wallet', record: 'file', metric: 'activity', screen: 'signal', calendar: 'calendar', habit: 'flame' };

/**
 * One tracker (the A2 artboard): days in the last six months; this week,
 * this month and the streak (longest under it); the last 26 weeks with month
 * names, a day tappable for what made it count (which payment, message,
 * event or habit); the rules that decide a day; Edit rules; Delete tracker
 * (asks first; nothing it counted is touched).
 */
export function ActivityTracker({ params }: { params: Record<string, string> }) {
  const id = params.tracker;
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const s = useLive((o) => {
    const tr = trackers(o).find((x) => x.id === id);
    return tr ? trackerSummary(o, tr, Date.now(), 26) : null;
  }, [id]);
  const lastCounted = s?.days.filter((d) => d.value === 1).at(-1)?.day ?? s?.days.filter((d) => d.value != null).at(-1)?.day ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? lastCounted;
  const matches = useLive((o) => {
    const tr = trackers(o).find((x) => x.id === id);
    return tr && day ? dayMatches(o, tr, day) : [];
  }, [id, day]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/board/activity' as never));
  if (!s) return <Screen title="Tracker" onBack={back}><EmptyState icon="grid" line="That tracker is gone." /></Screen>;
  const color = trackerColor(s.tracker.tint);
  const edit = () => router.push(`/board/activity/edit?tracker=${s.tracker.id}` as never);
  const del = () => {
    const go = () => (removeTracker(os, s.tracker.id), back());
    if (Platform.OS === 'web') return go();
    Alert.alert(`Delete ${s.tracker.name}?`, 'Only the tracker goes; nothing it counted is touched.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };
  const caps = (text: string) => <Text style={{ fontFamily: MONO, fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: t.c.fg.tertiary, textTransform: 'uppercase' }}>{text}</Text>;
  const head = (title: string, meta?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 10, paddingHorizontal: 4 }}>
      <Text accessibilityRole="header" style={{ flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', color: t.c.fg.primary }}>{title}</Text>
      {meta ? <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{meta}</Text> : null}
    </View>
  );
  const card = (children: React.ReactNode, gap = 12) => <View style={{ padding: 16, borderRadius: 28, backgroundColor: t.c.bg.tile, gap }}>{children}</View>;
  const counted = s.days.find((d) => d.day === day)?.value === 1;
  const dayName = day ? new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  return (
    <Screen title={s.tracker.name} subtitle="Activity" onBack={back} right={<IconButton icon="edit" accessibilityLabel="Edit tracker" filled onPress={edit} />}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{s.total} days in the last 6 months</Text>
        </View>
      </View>
      {card(
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {[
            ['This week', String(s.thisWeek), null, t.c.fg.primary],
            ['This month', String(s.thisMonth), null, t.c.fg.primary],
            ['Streak', `${s.streak} d`, `longest ${s.longest} d`, s.streak ? t.c.accent.mustard : t.c.fg.primary],
          ].map(([label, value, sub, col]) => (
            <View key={label} style={{ flex: 1, gap: 2 }}>
              {caps(label!)}
              <Text style={{ fontSize: 26, lineHeight: 31, fontWeight: '700', color: col! }}>{value}</Text>
              <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>{sub ?? ' '}</Text>
            </View>
          ))}
        </View>,
      )}
      {head('Last 26 weeks', 'Monday on top')}
      {card(
        <>
          <ActivityGrid days={s.days} color={color} cell={9} gap={3} months onDay={setPicked} selected={day} accessibilityLabel={`${s.tracker.name}, last 26 weeks`} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>less</Text>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: faint(color) }} />
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
            <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>a day that counted · tap one</Text>
          </View>
        </>,
      )}
      {head('What made a day count')}
      {card(
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>{caps(`${dayName}${picked ? ' · tapped' : ''}`)}</View>
            <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: counted ? faint(color) : 'rgba(255,255,255,0.07)', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: counted ? color : t.c.fg.secondary }}>{counted ? 'counted' : 'did not count'}</Text>
            </View>
          </View>
          {matches.length ? (
            matches.map((m, i) => (
              <Pressable
                key={`${m.rule}${i}`}
                disabled={!m.recordId}
                onPress={() => {
                  const r = m.recordId ? os.records.get(m.recordId) : null;
                  if (r) router.push(`/entity/${r.object}/${r.id}` as never);
                }}
                accessibilityRole={m.recordId ? 'button' : 'text'}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, opacity: pressed ? 0.7 : 1 })}
              >
                <TrackerDisc icon={RULE_ICON[m.kind]} color={color} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: t.c.fg.primary }}>{m.title}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.tertiary }}>{m.line}</Text>
                </View>
                {m.recordId ? <Icon name="chevron-right" size={16} color={t.c.fg.tertiary} /> : null}
              </Pressable>
            ))
          ) : (
            <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>Nothing matched a rule that day.</Text>
          )}
        </>,
        8,
      )}
      {head('A day counts when any of these happen')}
      {card(
        s.tracker.rules.length ? (
          s.tracker.rules.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.08)' }}>
              <TrackerDisc icon={RULE_ICON[r.kind]} color={color} />
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>{ruleText(r, os)}</Text>
            </View>
          ))
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>No rules yet, so nothing counts.</Text>
        ),
        4,
      )}
      <Pressable onPress={edit} accessibilityRole="button" style={({ pressed }) => ({ height: 48, borderRadius: 999, backgroundColor: pressed ? t.c.bg.pressed : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 })}>
        <Icon name="edit" size={18} color={t.c.fg.primary} />
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.fg.primary }}>Edit rules</Text>
      </Pressable>
      <Pressable onPress={del} accessibilityRole="button" style={{ height: 48, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="trash" size={18} color={t.c.alert.coralText} />
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.alert.coralText }}>Delete tracker</Text>
      </Pressable>
      <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary, textAlign: 'center' }}>Deleting asks first: only the tracker goes; nothing it counted is touched.</Text>
    </Screen>
  );
}
