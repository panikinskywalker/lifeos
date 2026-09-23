import React from 'react';
import { useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { tintForModule } from '@ui/theme/moduleTint';
import { IconButton, RowItem, Screen, SectionCard } from '@ui/kit';

/** Browse — modules → types → lists → records, with counts. Search is one tap away. */
export default function BrowseTab() {
  const os = useOS();
  const router = useRouter();
  const counts = useLive((o) => o.entities.countsByType(), []);
  const modules = [...os.registry.modules.values()].filter((m) => m.id !== 'core');
  return (
    <Screen tab title="Browse" right={<IconButton icon="search" accessibilityLabel="Search" filled onPress={() => router.push('/search')} />}>
      {modules.map((m) => {
        const tint = tintForModule(m.id);
        const types = os.registry.typesForModule(m.id).filter((x) => !x.hidden);
        const hasHome = m.screens?.some((s) => s.key === 'index');
        const rows = [
          ...(hasHome ? [{ key: 'home', title: `${m.name} overview`, subtitle: m.description, icon: m.icon, go: () => router.push(`/module/${m.id}`) }] : []),
          ...(m.id === 'automation'
            ? [
                { key: 'rules', title: 'Rules', subtitle: 'Triggers, conditions, actions', icon: 'bolt', go: () => router.push('/automation') },
                { key: 'reminders', title: 'Reminders', subtitle: 'Everything scheduled', icon: 'bell', go: () => router.push('/reminders') },
              ]
            : []),
          ...types.map((ty) => ({ key: ty.type, title: ty.labelPlural, subtitle: undefined, icon: ty.icon, value: counts[ty.type] ? String(counts[ty.type]) : undefined, go: () => router.push(`/entity/${ty.type}`) })),
        ];
        if (!rows.length) return null;
        return (
          <SectionCard key={m.id} title={m.name} flush>
            {rows.map((r, i) => (
              <RowItem key={r.key} title={r.title} subtitle={r.subtitle} icon={r.icon} tint={tint} value={'value' in r ? r.value : undefined} valueTone="secondary" divider={i < rows.length - 1} onPress={r.go} />
            ))}
          </SectionCard>
        );
      })}
      <SectionCard title="System" flush>
        <RowItem title="Tags" icon="tag" onPress={() => router.push('/tag')} />
      </SectionCard>
    </Screen>
  );
}
