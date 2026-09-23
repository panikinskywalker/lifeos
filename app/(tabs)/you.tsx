import React from 'react';
import { Alert, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS, useSettings } from '@ui/hooks';
import { tintForModule } from '@ui/theme/moduleTint';
import { RowItem, Screen, SectionCard, Segmented, SwitchField, Text, useToast } from '@ui/kit';
import { seedDemoData } from '../../src/platform/seed';

/** You — settings, modules, agent, data. PRODUCT.md §6. */
export default function YouTab() {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const s = useSettings();
  const counts = useLive((o) => o.entities.countsByType(), []);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const modules = useLive((o) => o.modules.installed(), []).filter((m) => m.id !== 'core');
  const confirm = (title: string, body: string, fn: () => void) => (Platform.OS === 'web' ? fn() : Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: fn }]));
  const schema = os.db.get<{ v: number }>('SELECT MAX(version) v FROM _migrations')?.v;
  return (
    <Screen tab title="You">
      <SectionCard title="Appearance">
        <Segmented
          value={s.appearance}
          onChange={(v) => s.set('appearance', v)}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </SectionCard>

      <SectionCard title="Agent" flush>
        <RowItem icon="sparkle" tint="memory" title="Claude API key & model" subtitle={s.aiModel} onPress={() => router.push('/settings/ai')} />
      </SectionCard>

      <SectionCard title="Locale" flush>
        <RowItem icon="cash" title="Currency" value={s.locale.currency} valueTone="secondary" divider onPress={() => router.push('/settings/locale')} />
        <RowItem icon="calendar" title="Date format" value={s.locale.dateFormat} valueTone="secondary" onPress={() => router.push('/settings/locale')} />
      </SectionCard>

      <SectionCard>
        <SwitchField label="Haptics" hint="A light tap on buttons and toggles" value={s.hapticsEnabled} onChange={(v) => s.set('hapticsEnabled', v)} />
      </SectionCard>

      <SectionCard title="Modules" flush>
        {modules.map((m, i) => {
          const def = os.registry.modules.get(m.id);
          return <RowItem key={m.id} icon={def?.icon} tint={tintForModule(m.id)} title={def?.name ?? m.id} subtitle={os.registry.typesForModule(m.id).map((x) => x.labelPlural).join(', ') || def?.description} value={`v${m.version}`} valueTone="secondary" divider={i < modules.length - 1} />;
        })}
      </SectionCard>

      <SectionCard title="Data" flush>
        <RowItem icon="box" title="Records" value={String(total)} valueTone="secondary" divider />
        <RowItem icon="share" title="Export backup" subtitle="JSON, everything on this phone" divider onPress={() => router.push('/settings/data')} />
        <RowItem
          icon="sparkle"
          title="Load demo data"
          subtitle="Sample accounts, transactions, tasks, people, a trip"
          divider
          onPress={() =>
            confirm('Load demo data?', 'This adds sample records you can delete later.', () => {
              seedDemoData(os);
              toast.show({ message: 'Demo data added', icon: 'check' });
            })
          }
        />
        <RowItem
          icon="refresh"
          title="Rebuild search index"
          chevron={false}
          onPress={() => {
            const all = os.entities.query(null, { includeArchived: true }, { limit: 100000 });
            os.entities.search.rebuild(all, (ty) => os.registry.entityTypes.get(ty));
            toast.show({ message: `Search index rebuilt · ${all.length} records`, icon: 'check' });
          }}
        />
      </SectionCard>

      <SectionCard title="Developer" flush>
        <RowItem icon="grid" title="Component gallery" subtitle="/dev/components — every component, light and dark" onPress={() => router.push('/dev/components')} />
      </SectionCard>

      <View style={{ paddingVertical: 8 }}>
        <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
          LifeOS 0.1.0 · on this phone only · schema v{schema}
        </Text>
      </View>
    </Screen>
  );
}
