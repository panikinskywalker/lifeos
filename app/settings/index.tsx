import React from 'react';
import { Alert, Platform, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS, useSettings } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Card, GroupLabel, IconButton, Row, Screen, Text } from '@ui/components/primitives';
import { seedDemoData } from '../../src/platform/seed';

export default function SettingsRoute() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const s = useSettings();
  const counts = useLive((o) => o.entities.countsByType(), []);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const pending = useLive((o) => Number(o.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM changes WHERE synced_at IS NULL`)?.n ?? 0), []);
  const modules = useLive((o) => o.modules.installed(), []);
  const confirm = (title: string, body: string, fn: () => void) => (Platform.OS === 'web' ? fn() : Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', style: 'destructive', onPress: fn }]));
  return (
    <Screen title="Settings" padded={false} right={<IconButton icon="xmark" bg onPress={() => router.back()} />}>
      <GroupLabel>Appearance</GroupLabel>
      <Card padded={false} style={{ marginHorizontal: 16 }}>
        {(['system', 'light', 'dark'] as const).map((v, i) => (
          <Row key={v} title={v === 'system' ? 'Match system' : v === 'light' ? 'Light' : 'Dark'} chevron={false} last={i === 2} onPress={() => s.set('appearance', v)} right={s.appearance === v ? <Text color={t.colors.tint}>✓</Text> : null} />
        ))}
      </Card>
      <GroupLabel>Locale</GroupLabel>
      <Card padded={false} style={{ marginHorizontal: 16 }}>
        <Row title="Currency" value={s.locale.currency} onPress={() => router.push('/settings/locale')} />
        <Row title="Date format" value={s.locale.dateFormat} onPress={() => router.push('/settings/locale')} />
        <Row title="Haptics" chevron={false} last right={<Switch value={s.hapticsEnabled} onValueChange={(v) => s.set('hapticsEnabled', v)} />} />
      </Card>
      <GroupLabel>Assistant</GroupLabel>
      <Card padded={false} style={{ marginHorizontal: 16 }}>
        <Row title="Claude API key & model" subtitle={s.aiModel} icon="sparkles" iconColor={t.colors.accents.indigo} onPress={() => router.push('/settings/ai')} last />
      </Card>
      <GroupLabel>Modules</GroupLabel>
      <Card padded={false} style={{ marginHorizontal: 16 }}>
        {modules.filter((m) => m.id !== 'core').map((m, i, arr) => {
          const def = os.registry.modules.get(m.id);
          return <Row key={m.id} title={def?.name ?? m.id} subtitle={`v${m.version} · ${os.registry.typesForModule(m.id).map((x) => x.labelPlural).join(', ') || def?.description}`} icon={def?.icon} iconColor={def?.color} chevron={false} last={i === arr.length - 1} />;
        })}
      </Card>
      <GroupLabel>Data</GroupLabel>
      <Card padded={false} style={{ marginHorizontal: 16 }}>
        <Row title="Records" value={String(total)} chevron={false} />
        <Row title="Unsynced changes" subtitle="Sync backend not connected — everything stays on this device" value={String(pending)} chevron={false} />
        <Row title="Export JSON backup" icon="square.and.arrow.up" onPress={() => router.push('/settings/data')} />
        <Row title="Load demo data" subtitle="Adds sample accounts, transactions, tasks, people, a trip" icon="sparkles" onPress={() => confirm('Load demo data?', 'This adds sample records you can delete later.', () => seedDemoData(os))} />
        <Row title="Rebuild search index" icon="arrow.clockwise" chevron={false} onPress={() => { const all = os.entities.query(null, { includeArchived: true }, { limit: 100000 }); os.entities.search.rebuild(all, (ty) => os.registry.entityTypes.get(ty)); }} last />
      </Card>
      <Text variant="caption" color="tertiary" style={{ textAlign: 'center', padding: 24 }}>LifeOS 0.1.0 · local-first · schema v{os.db.get<{ v: number }>('SELECT MAX(version) v FROM _migrations')?.v}</Text>
    </Screen>
  );
}
