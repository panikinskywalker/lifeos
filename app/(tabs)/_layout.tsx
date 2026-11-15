import React from 'react';
import { Tabs } from 'expo-router';
import { BottomBar } from '@ui/kit';
import { TABS } from '../../src/screens/InsideBar';


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
