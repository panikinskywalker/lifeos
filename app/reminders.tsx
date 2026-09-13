import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { describeRRule } from '@core/automation/recurrence';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, Chip, GroupLabel, IconButton, Input, Row, Screen, Text } from '@ui/components/primitives';
import { Sheet } from '@ui/components/Sheet';
import { DateField } from '@ui/components/fields';

export default function RemindersRoute() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const reminders = useLive((o) => o.reminders.upcoming(200), []);
  const now = Date.now();
  const overdue = reminders.filter((r) => (r.snoozedUntil ?? r.nextAt ?? r.dueAt) < now);
  const upcoming = reminders.filter((r) => (r.snoozedUntil ?? r.nextAt ?? r.dueAt) >= now);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<number | undefined>(Date.now() + 3600000);
  const [rrule, setRrule] = useState<string | null>(null);
  const list = (items: typeof reminders) => (
    <Card padded={false} style={{ marginHorizontal: 16 }}>
      {items.map((r, i) => {
        const at = r.snoozedUntil ?? r.nextAt ?? r.dueAt;
        const entity = r.entityId ? os.entities.get(r.entityId) : undefined;
        return (
          <Row
            key={r.id}
            title={r.title}
            subtitle={`${os.format.dateTime(at)} · ${describeRRule(r.rrule)}${entity ? ` · ${entity.title}` : ''}`}
            icon="bell"
            iconColor={at < now ? t.colors.danger : t.colors.accents.red}
            last={i === items.length - 1}
            chevron={false}
            onPress={entity ? () => router.push(`/entity/${entity.type}/${entity.id}`) : undefined}
            onLongPress={() => os.reminders.remove(r.id)}
            right={
              <View style={{ flexDirection: 'row' }}>
                <IconButton icon="clock" color={t.colors.textSecondary} onPress={() => os.reminders.snooze(r.id, Date.now() + 3600000)} />
                <IconButton icon="checkmark.circle" color={t.colors.success} onPress={() => os.reminders.complete(r.id)} />
              </View>
            }
          />
        );
      })}
    </Card>
  );
  return (
    <Screen title="Reminders" padded={false} right={<View style={{ flexDirection: 'row', gap: 6 }}><IconButton icon="plus" bg onPress={() => setOpen(true)} /><IconButton icon="xmark" bg onPress={() => router.back()} /></View>}>
      {overdue.length ? (<><GroupLabel>Overdue</GroupLabel>{list(overdue)}</>) : null}
      <GroupLabel>Upcoming</GroupLabel>
      {upcoming.length ? list(upcoming) : <Text color="tertiary" style={{ paddingHorizontal: 16 }}>Nothing scheduled. Tap + to add one, or add reminders from any record.</Text>}
      <Sheet visible={open} onClose={() => setOpen(false)} title="New reminder">
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Input value={title} onChangeText={setTitle} placeholder="What should I remind you about?" autoFocus />
          <DateField field={{ key: 'due', label: 'When', type: 'datetime' }} value={due} onChange={(v) => setDue(v as number | undefined)} />
          <Text variant="footnote" color="secondary">Repeat</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[[null, 'Once'], ['FREQ=DAILY;INTERVAL=1', 'Daily'], ['FREQ=WEEKLY;INTERVAL=1', 'Weekly'], ['FREQ=MONTHLY;INTERVAL=1', 'Monthly'], ['FREQ=YEARLY;INTERVAL=1', 'Yearly']].map(([v, l]) => (
              <Chip key={l} label={l!} selected={rrule === v} onPress={() => setRrule(v)} />
            ))}
          </View>
          <Button title="Save" disabled={!title.trim() || !due} onPress={() => { os.reminders.create({ title: title.trim(), dueAt: due!, rrule }); setTitle(''); setOpen(false); }} />
        </View>
      </Sheet>
    </Screen>
  );
}
