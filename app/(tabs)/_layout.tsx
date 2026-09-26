import React from 'react';
import { Tabs } from 'expo-router';
import { BottomBar, type BottomBarItem } from '@ui/kit';

/** PRODUCT v4 §4: Today · Upkeep · Dump (centre, raised; Talk is a toggle inside) · Almanac · You. */
export const TABS: BottomBarItem[] = [
  { key: 'index', label: 'Today', icon: 'sun' },
  { key: 'upkeep', label: 'Upkeep', icon: 'repeat' },
  { key: 'dump', label: 'Dump', icon: 'brain', primary: true },
  { key: 'almanac', label: 'Almanac', icon: 'library' },
  { key: 'you', label: 'You', icon: 'user-circle' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <BottomBar
          items={TABS}
          active={state.routes[state.index]?.name ?? 'index'}
          onPress={(key) => {
            const route = state.routes.find((r) => r.name === key);
            if (!route) return;
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!event.defaultPrevented && state.routes[state.index]?.name !== key) navigation.navigate(key);
          }}
        />
      )}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.key} name={tab.key} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
