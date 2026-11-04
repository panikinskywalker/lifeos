import React, { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS, useSettings } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, IconBox, RowItem, RowList, Screen, Section, Segmented, Sheet, SwitchField, Text, useToast } from '@ui/kit';
import Constants from 'expo-constants';
import { isDemo, setDemoMode } from '../../src/platform/demo';
import { PROVIDER_PRESETS } from '@core/ai/providers';

const APPEARANCE = { system: 'System', light: 'Light', dark: 'Dark' } as const;

/** You (canvas 11): profile card, Setup, App — plus data and developer tools. */
export default function YouTab() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const s = useSettings();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const counts = useLive((o) => o.records.countsByType(), []);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const modules = useLive((o) => o.modules.installed(), []).filter((m) => m.id !== 'core');
  const confirm = (title: string, body: string, fn: () => void) => (Platform.OS === 'web' ? fn() : Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: fn }]));
  const demo = isDemo();
  const schema = os.db.get<{ v: number }>('SELECT MAX(version) v FROM _migrations')?.v;
  return (
    <Screen tab title="You">
      <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.tile, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="user" size={24} color={t.c.fg.primary} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="heading" style={{ fontSize: 18 }}>
            You
          </Text>
          <Text variant="caption" color="secondary">
            Personal space · {total.toLocaleString('en-IN')} records
          </Text>
        </View>
      </View>

      <Section title="Demo">
        <RowList>
          <SwitchField
            icon="sparkle"
            label="Demo data"
            hint={demo ? 'Showing sample data. Yours is safe.' : 'Sample data on every board. Yours stays apart.'}
            value={demo}
            onChange={(on) =>
              confirm(on ? 'Turn on demo data?' : 'Back to your own data?', on ? 'LifeOS restarts with fresh sample data. Your own data stays as it is, and nothing is read from the phone or sent out while this is on.' : 'LifeOS restarts with your own data. What you changed in the demo is dropped.', () =>
                setDemoMode(on, () => toast.show({ message: 'Close LifeOS fully and open it again', icon: 'info' })),
              )
            }
          />
        </RowList>
      </Section>

      <Section title="Setup">
        <RowList>
          <RowItem icon="grid" tint="tasks" title="Modules" subtitle={`${modules.length} on · ${modules.map((m) => os.registry.modules.get(m.id)?.name).filter(Boolean).slice(0, 3).join(', ')}…`} onPress={() => router.push('/browse')} />
          <RowItem icon="sparkle" iconTone="accent" title="Agent" subtitle={`On the phone · then ${s.aiChain.filter((c) => c.enabled !== false).map((c) => PROVIDER_PRESETS[c.kind].label).join(' → ') || 'no providers'}`} onPress={() => router.push('/settings/ai')} />
          <RowItem icon="signal" tint="health" title="Data sources" subtitle="Bank SMS, payment apps, screen time, Health Connect" onPress={() => router.push('/settings/sources' as never)} />
          <RowItem icon="bell" tint="tasks" title="Notifications" subtitle="Morning brief, reminders, quiet hours" onPress={() => router.push('/settings/notifications' as never)} />
          <RowItem icon="home" tint="tasks" title="Home screen" subtitle="What Today shows, and in what order" onPress={() => router.push('/settings/home' as never)} />
          <RowItem icon="tag" tint="finance" title="Categories" subtitle="Your categories, and rules by keyword or amount" onPress={() => router.push('/settings/categories' as never)} />
          <RowItem icon="cash" tint="finance" title="Currency & dates" subtitle={`${s.locale.currency} · ${s.locale.dateFormat}`} onPress={() => router.push('/settings/locale')} />
        </RowList>
      </Section>

      <Section title="App">
        <RowList>
          <RowItem icon="moon" tint="memory" title="Appearance" subtitle={APPEARANCE[s.appearance]} onPress={() => setAppearanceOpen(true)} />
          <SwitchField icon="activity" label="Haptics" hint="A light tap on buttons and toggles" value={s.hapticsEnabled} onChange={(v) => s.set('hapticsEnabled', v)} />
          {demo ? null : <RowItem icon="share" tint="health" title="Lock & backup" subtitle="Fingerprint lock, encrypted backup and restore" onPress={() => router.push('/settings/data')} />}
          <RowItem icon="info" tint="documents" title="About" subtitle={`LifeOS ${Constants.expoConfig?.version ?? ''} · on this phone only · schema v${schema}`} chevron={false} />
        </RowList>
      </Section>

      <Section title="Data">
        <RowList>
          <RowItem
            icon="refresh"
            title="Rebuild search index"
            chevron={false}
            onPress={() => {
              const all = os.records.query(null, { includeArchived: true }, { limit: 100000 });
              os.records.search.rebuild(all, (ty) => os.registry.objects.get(ty));
              toast.show({ message: `Search index rebuilt · ${all.length} records`, icon: 'check' });
            }}
          />
        </RowList>
      </Section>

      <Section title="Developer">
        <RowItem icon="grid" title="Component gallery" subtitle="Every component, light and dark" onPress={() => router.push('/dev/components')} />
      </Section>

      <Sheet visible={appearanceOpen} onClose={() => setAppearanceOpen(false)} title="Appearance">
        <Segmented value={s.appearance} onChange={(v) => s.set('appearance', v)} options={(Object.keys(APPEARANCE) as Array<keyof typeof APPEARANCE>).map((k) => ({ value: k, label: APPEARANCE[k] }))} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconBox icon="info" tone="plain" size={28} />
          <Text variant="caption" color="secondary" style={{ flex: 1 }}>
            System follows your phone’s light or dark setting.
          </Text>
        </View>
      </Sheet>
    </Screen>
  );
}
