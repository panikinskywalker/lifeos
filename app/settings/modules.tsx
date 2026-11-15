import React from 'react';
import { useRouter } from 'expo-router';
import { SHOW_ALL_KEY, isModuleShown, setModuleShown } from '@core/registry/shown';
import { useLive, useOS } from '@ui/hooks';
import { shortNameForModule } from '@ui/theme/moduleTint';
import { Screen, Section, SwitchField, Text } from '@ui/kit';

/** You › Modules (docs/MODEL.md, Modules shown): which modules the app shows while they are built one by one. */
export default function ModulesSettings() {
  const os = useOS();
  const router = useRouter();
  const v = useLive((o) => {
    const all = o.settings.get<boolean>(SHOW_ALL_KEY, false);
    const demo = o.settings.get<boolean>('demoSeeded', false);
    const list = [...o.registry.modules.values()].filter((m) => m.id !== 'core').map((m) => ({ id: m.id, name: shortNameForModule(m.id, m.name), on: isModuleShown(o, m.id) }));
    return { all, demo, list };
  }, []);
  return (
    <Screen title="Modules" onBack={() => router.back()}>
      <Section title="What the app shows">
        <Text variant="caption" color="secondary">
          Modules not finished yet stay out of Browse, Today, Upkeep, the brief and search. They keep collecting in the background, so nothing is lost, and a linked record still opens.
        </Text>
        {v.demo ? <Text variant="caption" color="secondary">Demo data is on, so every module is shown.</Text> : null}
        <SwitchField label="Show every module" hint="Turn on everything at once, finished or not." value={v.all || v.demo} onChange={(on) => os.settings.set(SHOW_ALL_KEY, on)} />
      </Section>
      <Section title="Modules">
        {v.list.map((m) => (
          <SwitchField key={m.id} label={m.name} value={m.on} onChange={(on) => setModuleShown(os, m.id, on)} />
        ))}
      </Section>
    </Screen>
  );
}
