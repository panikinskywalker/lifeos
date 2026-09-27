import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { morningBrief, notifyPrefs, setNotifyPrefs } from '@core/notify/plan';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ChipRow, FilterChip, Screen, Section, SwitchField, Text } from '@ui/kit';

const BRIEF_TIMES = ['06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30'];
const QUIET_FROM = ['21:30', '22:00', '22:30', '23:00', '23:30', '00:00'];
const QUIET_TO = ['06:00', '06:30', '07:00', '07:30', '08:00', '08:30'];
const label = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h! < 12 ? 'am' : 'pm'}`;
};

/** You › Notifications: the morning brief, what else may notify you, and quiet hours. */
export default function NotificationSettings() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const p = useLive((o) => notifyPrefs(o), []);
  const preview = useLive((o) => morningBrief(o, Date.now()), []);
  return (
    <Screen title="Notifications" onBack={() => router.back()}>
      <Section title="Morning brief">
        <SwitchField label="Morning brief" hint="One notification each morning: sleep, today’s step goal, what’s on, how the month’s spending is going." value={p.brief.on} onChange={(on) => setNotifyPrefs(os, { brief: { ...p.brief, on } })} />
        {p.brief.on ? (
          <ChipRow>
            {BRIEF_TIMES.map((tm) => (
              <FilterChip key={tm} label={label(tm)} selected={p.brief.time === tm} onPress={() => setNotifyPrefs(os, { brief: { ...p.brief, time: tm } })} />
            ))}
          </ChipRow>
        ) : null}
        <View style={{ backgroundColor: t.c.bg.container, borderRadius: 18, padding: 14, gap: 4 }}>
          <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>If it came now</Text>
          <Text variant="label">{preview.title}</Text>
          <Text variant="caption" color="secondary">{preview.body}</Text>
        </View>
      </Section>
      <Section title="What can notify you">
        <SwitchField label="Reminders" hint="Ones you set, and ones LifeOS sets for you." value={p.reminders} onChange={(reminders) => setNotifyPrefs(os, { reminders })} />
        <SwitchField label="Upkeep" hint="Service, renewals, chores, keep-in-touch and birthdays when they come due." value={p.upkeep} onChange={(upkeep) => setNotifyPrefs(os, { upkeep })} />
      </Section>
      <Section title="Quiet hours">
        <SwitchField label="Quiet hours" hint="Nothing arrives in these hours; it waits until they end." value={p.quiet.on} onChange={(on) => setNotifyPrefs(os, { quiet: { ...p.quiet, on } })} />
        {p.quiet.on ? (
          <View style={{ gap: 10 }}>
            <Text variant="label" color="secondary">From</Text>
            <ChipRow>
              {QUIET_FROM.map((tm) => (
                <FilterChip key={tm} label={label(tm)} selected={p.quiet.from === tm} onPress={() => setNotifyPrefs(os, { quiet: { ...p.quiet, from: tm } })} />
              ))}
            </ChipRow>
            <Text variant="label" color="secondary">Until</Text>
            <ChipRow>
              {QUIET_TO.map((tm) => (
                <FilterChip key={tm} label={label(tm)} selected={p.quiet.to === tm} onPress={() => setNotifyPrefs(os, { quiet: { ...p.quiet, to: tm } })} />
              ))}
            </ChipRow>
          </View>
        ) : null}
      </Section>
    </Screen>
  );
}
