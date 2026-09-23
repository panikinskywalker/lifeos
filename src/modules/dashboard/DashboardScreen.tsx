import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Dashboard, WidgetInstance, WidgetSize } from '@core/domain/types';
import { useTheme } from '@ui/theme/ThemeProvider';
import { useLive, useOS, useSettings } from '@ui/hooks';
import { Button, Card, Chip, Icon, IconButton, Input, Screen, Text, Row, EmptyState } from '@ui/components/primitives';
import { Sheet, ActionSheet } from '@ui/components/Sheet';
import { SortableList } from '@ui/components/SortableList';

/**
 * Home: one or more dashboards, each a list of widget instances rendered in a
 * flow grid (small = half width, medium/large = full width). Edit mode is a
 * drag-to-reorder list with resize and remove, plus a gallery of every
 * widget that installed modules contribute.
 */
export function DashboardScreen() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const dashboards = useLive((o) => o.dashboards.all(), []);
  const homeId = useSettings((s) => s.homeDashboardId);
  const [activeId, setActiveId] = useState<string | null>(homeId);
  const active: Dashboard | undefined = dashboards.find((d) => d.id === activeId) ?? dashboards[0];
  const [editing, setEditing] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const [name, setName] = useState('');
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }, []);

  if (!active) return <EmptyState icon="square.grid.2x2" title="No dashboard" action="Create one" onAction={() => os.dashboards.create('Home', 'house')} />;

  const setLayout = (layout: WidgetInstance[]) => os.dashboards.setLayout(active.id, layout);

  return (
    <Screen
      title={editing ? `Edit ${active.name}` : active.name === 'Home' ? greeting : active.name}
      padded={false}
      right={
        editing ? (
          <Button title="Done" small onPress={() => setEditing(false)} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <IconButton icon="square.and.pencil" bg onPress={() => setEditing(true)} />
            <IconButton icon="ellipsis" bg onPress={() => setMenu(true)} />
          </View>
        )
      }
    >
      {dashboards.length > 1 || editing ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingBottom: 12 }}>
          {dashboards.map((d) => (
            <Chip key={d.id} label={d.name} icon={d.icon ?? undefined} selected={d.id === active.id} onPress={() => setActiveId(d.id)} />
          ))}
          {editing ? <Chip label="New" icon="plus" onPress={() => { const d = os.dashboards.create('Dashboard', 'square.grid.2x2'); setActiveId(d.id); }} /> : null}
        </ScrollView>
      ) : null}

      <View style={{ paddingHorizontal: 16 }}>
        {editing ? (
          <EditLayout dashboard={active} onChange={setLayout} onAdd={() => setGallery(true)} />
        ) : active.layout.length === 0 ? (
          <EmptyState icon="square.grid.2x2" title="Empty dashboard" body="Add widgets from any module." action="Add widgets" onAction={() => { setEditing(true); setGallery(true); }} />
        ) : (
          <WidgetGrid layout={active.layout} />
        )}
      </View>

      <WidgetGallery visible={gallery} onClose={() => setGallery(false)} onAdd={(type, size) => { os.dashboards.addWidget(active.id, { widgetType: type, size, config: {} }); }} />
      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={active.name}
        actions={[
          { label: 'Edit widgets', onPress: () => setEditing(true) },
          { label: 'Rename', onPress: () => { setName(active.name); setRename(true); } },
          { label: 'Set as home', onPress: () => useSettings.getState().set('homeDashboardId', active.id) },
          { label: 'New dashboard', onPress: () => { const d = os.dashboards.create('Dashboard', 'square.grid.2x2'); setActiveId(d.id); setEditing(true); } },
          ...(dashboards.length > 1 ? [{ label: 'Delete dashboard', destructive: true, onPress: () => { os.dashboards.remove(active.id); setActiveId(null); } }] : []),
          { label: 'Settings', onPress: () => router.push('/you') },
        ]}
      />
      <Sheet visible={rename} onClose={() => setRename(false)} title="Rename dashboard">
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Input value={name} onChangeText={setName} autoFocus />
          <Button title="Save" onPress={() => { os.dashboards.rename(active.id, name.trim() || active.name); setRename(false); }} />
        </View>
      </Sheet>
      <View style={{ height: 0, backgroundColor: t.colors.background }} />
    </Screen>
  );
}

export function WidgetGrid({ layout }: { layout: WidgetInstance[] }) {
  const os = useOS();
  // Flow: pair consecutive "small" widgets into a row.
  const rows: WidgetInstance[][] = [];
  let pending: WidgetInstance | null = null;
  for (const w of layout) {
    if (!os.registry.widgets.has(w.widgetType)) continue;
    if (w.size === 'small') {
      if (pending) {
        rows.push([pending, w]);
        pending = null;
      } else pending = w;
    } else {
      if (pending) {
        rows.push([pending]);
        pending = null;
      }
      rows.push([w]);
    }
  }
  if (pending) rows.push([pending]);
  return (
    <View style={{ gap: 12 }}>
      {rows.map((row, i) => (
        <View key={row.map((w) => w.id).join('-') + i} style={{ flexDirection: 'row', gap: 12 }}>
          {row.map((w) => (
            <View key={w.id} style={{ flex: 1, minWidth: 0 }}>
              <WidgetHost instance={w} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

class WidgetBoundary extends React.Component<{ children: React.ReactNode; name: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <Card>
          <Text variant="footnote" color="secondary">
            {this.props.name} failed to render: {this.state.error.message}
          </Text>
        </Card>
      );
    return this.props.children;
  }
}

function WidgetHost({ instance }: { instance: WidgetInstance }) {
  const os = useOS();
  const def = os.registry.widgets.get(instance.widgetType);
  if (!def) return null;
  const C = def.component;
  return (
    <WidgetBoundary name={def.name}>
      <C size={instance.size} config={instance.config} ctx={os} />
    </WidgetBoundary>
  );
}

function EditLayout({ dashboard, onChange, onAdd }: { dashboard: Dashboard; onChange: (l: WidgetInstance[]) => void; onAdd: () => void }) {
  const os = useOS();
  const t = useTheme();
  const items = dashboard.layout.filter((w) => os.registry.widgets.has(w.widgetType));
  const ROW = 64;
  const cycleSize = (w: WidgetInstance) => {
    const def = os.registry.widgets.get(w.widgetType)!;
    const i = def.sizes.indexOf(w.size);
    const next = def.sizes[(i + 1) % def.sizes.length];
    onChange(dashboard.layout.map((x) => (x.id === w.id ? { ...x, size: next } : x)));
  };
  return (
    <View style={{ gap: 12 }}>
      <Text variant="footnote" color="secondary">
        Hold and drag to reorder. Tap the size to cycle small / medium / large.
      </Text>
      <SortableList
        data={items}
        rowHeight={ROW}
        onReorder={(ids) => onChange(ids.map((id) => dashboard.layout.find((w) => w.id === id)!).filter(Boolean))}
        renderItem={(w, dragging) => {
          const def = os.registry.widgets.get(w.widgetType)!;
          const color = os.registry.modules.get(def.module)?.color ?? t.colors.tint;
          return (
            <View style={{ height: ROW - 8, backgroundColor: dragging ? t.colors.cardSecondary : t.colors.card, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 }}>
              <Icon name="line.3.horizontal.decrease" size={18} color={t.colors.textTertiary} />
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={def.icon} size={16} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="subhead" numberOfLines={1}>
                  {def.name}
                </Text>
                <Text variant="caption" color="secondary">
                  {os.registry.modules.get(def.module)?.name}
                </Text>
              </View>
              <Pressable onPress={() => cycleSize(w)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: t.colors.fillSecondary }}>
                <Text variant="caption2">{w.size.toUpperCase()}</Text>
              </Pressable>
              <IconButton icon="minus" color={t.colors.danger} onPress={() => onChange(dashboard.layout.filter((x) => x.id !== w.id))} />
            </View>
          );
        }}
      />
      <Button title="Add widget" icon="plus" variant="secondary" onPress={onAdd} />
    </View>
  );
}

export function WidgetGallery({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (type: string, size: WidgetSize) => void }) {
  const os = useOS();
  const t = useTheme();
  const byModule = new Map<string, typeof os.registry.widgets extends Map<string, infer V> ? V[] : never>();
  for (const w of os.registry.widgets.values()) {
    if (!byModule.has(w.module)) byModule.set(w.module, []);
    byModule.get(w.module)!.push(w);
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Add widget" full>
      <View style={{ paddingHorizontal: 16, gap: 16 }}>
        {[...byModule.entries()].map(([moduleId, widgets]) => {
          const m = os.registry.modules.get(moduleId);
          return (
            <View key={moduleId}>
              <Text variant="headline" color={m?.color} style={{ marginBottom: 6 }}>
                {m?.name ?? moduleId}
              </Text>
              <Card padded={false}>
                {widgets.map((w, i) => (
                  <Row key={w.type} title={w.name} subtitle={w.description ?? `${w.sizes.join(' / ')}`} icon={w.icon} iconColor={m?.color} last={i === widgets.length - 1} chevron={false} right={<IconButton icon="plus.circle.fill" color={m?.color ?? t.colors.tint} onPress={() => { onAdd(w.type, w.defaultSize); onClose(); }} />} />
                ))}
              </Card>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}
