import React from 'react';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon } from '@ui/components/primitives';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.tint,
        tabBarInactiveTintColor: t.colors.textSecondary,
        tabBarStyle: { backgroundColor: t.colors.tabBar, borderTopColor: t.colors.separator, position: Platform.OS === 'ios' ? 'absolute' : undefined },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Icon name="house.fill" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="browse" options={{ title: 'Browse', tabBarIcon: ({ color, size }) => <Icon name="square.grid.2x2" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ({ color, size }) => <Icon name="magnifyingglass" color={String(color)} size={size} /> }} />
      <Tabs.Screen name="assistant" options={{ title: 'Assistant', tabBarIcon: ({ color, size }) => <Icon name="sparkles" color={String(color)} size={size} /> }} />
    </Tabs>
  );
}
