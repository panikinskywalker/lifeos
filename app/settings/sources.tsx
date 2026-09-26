import { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { formatDistanceToNow } from 'date-fns';
import { sourceState } from '@core/sources/deviceData';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, Chip, Icon, Screen, Text, useToast } from '@ui/kit';
import { SOURCES, access, importSmsHistory, requestAccess, syncSources, type Access, type SourceId } from '../../src/platform/sources';
import { deviceAvailable } from '../../modules/lifeos-device';

/**
 * You › Data sources (M4.2): what feeds LifeOS automatically — bank SMS,
 * payment apps, screen time, Health Connect — each with its permission,
 * last sync and how much it has brought in. Turning one on asks for exactly
 * that permission (or opens the settings switch Android needs you to flip).
 */
export default function SourcesScreen() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [states, setStates] = useState<Partial<Record<SourceId, Access>>>({});
  const [busy, setBusy] = useState<SourceId | null>(null);
  const [syncing, setSyncing] = useState(false);
  const info = useLive((o) => Object.fromEntries(SOURCES.map((s) => [s.id, sourceState(o, s.id)])), []);
  const proposed = useLive((o) => o.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ingest_queue WHERE status='proposed'`)?.n ?? 0, []);

  const refresh = useCallback(async () => {
    const next: Partial<Record<SourceId, Access>> = {};
    for (const s of SOURCES) next[s.id] = await access(s.id).catch(() => 'unavailable' as const);
    setStates(next);
  }, []);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  // Coming back from Android's settings switch (notification access, usage access).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh().then(() => syncSources(os));
    });
    return () => sub.remove();
  }, [os, refresh]);

  const turnOn = async (id: SourceId) => {
    if (id === 'contacts') return router.push('/settings/contacts' as never);
    setBusy(id);
    try {
      const ok = await requestAccess(id);
      await refresh();
      if (id === 'sms' && ok) {
        toast.show({ message: 'Reading the last six months of bank SMS…', icon: 'comment' });
        const n = await importSmsHistory(os);
        if (n) router.push('/settings/sms-review' as never);
        else toast.show({ message: 'No bank transactions found in your SMS', icon: 'info' });
      } else if (ok) {
        await syncSources(os);
        toast.show({ message: 'Connected', icon: 'check' });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      title="Data sources"
      subtitle="What fills LifeOS without you typing"
      onBack={() => router.back()}
      right={
        <Button
          title={syncing ? 'Syncing…' : 'Sync all'}
          size="sm"
          icon="refresh"
          disabled={syncing}
          onPress={() => {
            setSyncing(true);
            void syncSources(os)
              .then(refresh)
              .then(() => toast.show({ message: 'Everything synced', icon: 'check' }))
              .finally(() => setSyncing(false));
          }}
        />
      }
    >
      <View style={{ gap: 14 }}>
        {!deviceAvailable ? (
          <Card icon="info" tint="documents" title="Needs the LifeOS build">
            <Text variant="body" color="secondary">
              Reading SMS, notifications, screen time and Health Connect needs the LifeOS app itself (the development build), not Expo Go. Install it once and these switch on here.
            </Text>
          </Card>
        ) : null}
        {proposed ? <Chip icon="inbox" tone="accent" label={`${proposed} transactions from your SMS history to review`} onPress={() => router.push('/settings/sms-review' as never)} /> : null}
        {SOURCES.map((s) => {
          const a = states[s.id];
          const st = info[s.id]!;
          const on = a === 'granted' && (s.id !== 'sms' || st.enabled);
          return (
            <View key={s.id} style={{ backgroundColor: t.c.bg.container, borderRadius: 24, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name={s.icon} size={18} color={on ? t.c.ok.sageText : t.c.fg.secondary} />
                <Text variant="rowTitle" style={{ flex: 1 }}>
                  {s.label}
                </Text>
                <Text variant="labelMicro" color={on ? t.c.ok.sageText : t.c.fg.secondary} style={{ textTransform: 'uppercase' }}>
                  {a === undefined ? '…' : on ? 'On' : a === 'unavailable' ? (deviceAvailable ? 'Not on this phone' : 'Needs build') : 'Off'}
                </Text>
              </View>
              <Text variant="caption" color="secondary">
                {s.line}
              </Text>
              {on ? (
                <Text variant="caption" color="secondary">
                  {st.lastSync ? `Synced ${formatDistanceToNow(st.lastSync, { addSuffix: true })}` : 'Not synced yet'} · {st.total} brought in{st.error ? ` · last error: ${st.error}` : ''}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {!on && a !== 'unavailable' ? <Button title={busy === s.id ? 'Asking…' : s.id === 'contacts' ? 'Pick contacts' : 'Turn on'} size="sm" icon="check" disabled={!!busy} onPress={() => void turnOn(s.id)} /> : null}
                {on ? <Button title="Sync now" size="sm" variant="secondary" icon="refresh" onPress={() => void syncSources(os).then(() => toast.show({ message: `${s.label} synced`, icon: 'check' }))} /> : null}
                {s.id === 'contacts' && a === 'granted' ? <Button title="Pick contacts" size="sm" variant="secondary" icon="people" onPress={() => router.push('/settings/contacts' as never)} /> : null}
                {s.id === 'sms' && on ? <Button title="Senders" size="sm" variant="secondary" icon="list" onPress={() => router.push('/settings/sms' as never)} /> : null}
                {s.id === 'health' && a === 'unavailable' && deviceAvailable ? <Chip label="Get Health Connect" icon="download" small onPress={() => void requestAccess('health')} /> : null}
              </View>
              {!on && (s.id === 'notifications' || s.id === 'usage') && a === 'needed' ? (
                <Text variant="caption" color="secondary">
                  Android opens a settings list — find LifeOS there and switch it on, then come back.
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
