import React from 'react';
import { Tabs } from 'expo-router';
import { BottomBar, type BottomBarItem } from '@ui/kit';

/** PRODUCT.md §6: Today · Upkeep · Talk (centre, raised) · Browse · You. */
export const TABS: BottomBarItem[] = [
  { key: 'index', label: 'Today', icon: 'home' },
  { key: 'upkeep', label: 'Upkeep', icon: 'wrench' },
  { key: 'talk', label: 'Talk', icon: 'sparkle', primary: true },
  { key: 'browse', label: 'Browse', icon: 'grid' },
  { key: 'you', label: 'You', icon: 'user' },
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
