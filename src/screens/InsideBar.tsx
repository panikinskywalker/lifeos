import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import { Stack, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import type { BoardManifest } from '@core/registry/types';
import { BottomBar, OnBar, type BottomBarItem } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { IconName } from '@ui/icons';

/** PRODUCT v4 §4: Today · Upkeep · Dump (centre, raised; Talk is a toggle inside) · Browse · You. */
export const TABS: BottomBarItem[] = [
  { key: 'index', label: 'Today', icon: 'sun' },
  { key: 'upkeep', label: 'Upkeep', icon: 'repeat' },
  { key: 'dump', label: 'Dump', icon: 'brain', primary: true },
  { key: 'browse', label: 'Browse', icon: 'folder' },
  { key: 'you', label: 'You', icon: 'user-circle' },
];

const ACTION = '+';

/** Hidden while the keyboard is up, so it never sits on a field. */
function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return up;
}

/**
 * The bottom bar inside a board or module (docs/MODEL.md, The bar inside a
 * board): the board's own sections with its action in the raised button when
 * it declares a bar (Turf), else the app's own bar.
 */
function InsideBar({ board, base }: { board: BoardManifest | undefined; base: string }) {
  const router = useRouter();
  const path = usePathname();
  const keyboard = useKeyboardUp();
  if (keyboard) return null;
  const page = path.slice(base.length).replace(/^\//, '').split('/')[0] || 'index';
  const bar = board?.bar;
  if (!bar) return <BottomBar items={TABS} active="" onPress={(key) => router.dismissTo((key === 'index' ? '/' : `/${key}`) as never)} />;
  const items: BottomBarItem[] = bar.tabs.map((s) => ({ key: s.screen, label: s.label, icon: s.icon as IconName }));
  if (bar.action) items.push({ key: ACTION, label: bar.action.label, icon: bar.action.icon as IconName, primary: true });
  const active = bar.tabs.find((s) => s.screen === page || s.also?.includes(page))?.screen ?? (bar.action?.screen === page ? ACTION : '');
  const href = (screen: string) => (screen === 'index' ? base : `${base}/${screen}`);
  return (
    <BottomBar
      items={items}
      active={active}
      onPress={(key) => {
        if (key === ACTION) return bar.action && router.push(href(bar.action.screen) as never);
        if (key !== page) router.replace(href(key) as never);
      }}
    />
  );
}

/** A board's or module's screens in their own stack, with the bar floating over them. */
export function BarLayout({ board, kind }: { board: (id: string) => BoardManifest | undefined; kind: 'board' | 'module' }) {
  const t = useTheme();
  const { id } = useGlobalSearchParams<{ id: string }>();
  return (
    <OnBar.Provider value>
      <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.bg.ground }, animation: Platform.OS === 'android' ? 'slide_from_right' : 'default' }} />
        <InsideBar board={board(id ?? '')} base={`/${kind}/${id ?? ''}`} />
      </View>
    </OnBar.Provider>
  );
}
