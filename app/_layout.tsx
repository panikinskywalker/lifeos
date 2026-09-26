import React, { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from '@expo-google-fonts/plus-jakarta-sans/useFonts';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { OSProvider } from '@ui/hooks/useOS';
import { ToastProvider } from '@ui/kit';
import { CategoryLearnPrompt } from '../src/screens/CategoryLearnPrompt';
import { ThemeProvider, useTheme } from '@ui/theme/ThemeProvider';
import { Loading, Text } from '@ui/components/primitives';
import { bootLifeOS, setNavigator } from '../src/platform/boot';
import { notifications } from '../src/platform/notifications';
import { AppState } from 'react-native';
import { useShareIntent } from 'expo-share-intent';
import { persistAttachment } from '../src/ui/lib/files';

SplashScreen.preventAutoHideAsync().catch(() => {});

notifications()?.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export default function RootLayout() {
  const [os, setOS] = useState<LifeOSContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // Native builds embed these via the expo-font plugin; this also covers web and dev clients.
  const [fontsLoaded, fontError] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  const fontsReady = fontsLoaded || !!fontError;
  // Android share sheet (M3): "Share → LifeOS" opens Talk with the text, link or file. No-op in Expo Go.
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({ resetOnBackground: true });

  useEffect(() => {
    setNavigator((p) => router.push(p as never));
    bootLifeOS()
      .then((o) => setOS(o))
      .catch((e) => {
        console.error(e);
        setError(String(e?.message ?? e));
      });
  }, [router]);

  useEffect(() => {
    if (fontsReady && (os || error)) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady, os, error]);

  useEffect(() => {
    if (!os || !hasShareIntent) return;
    void (async () => {
      const parts = [shareIntent.text, shareIntent.webUrl].filter((x): x is string => !!x && !!x.trim());
      const text = [...new Set(parts)].join('\n');
      const file = shareIntent.files?.[0];
      const uri = file ? await persistAttachment(file.path, file.fileName ?? 'shared').catch(() => file.path) : undefined;
      router.push({ pathname: '/dump', params: { share: text, ...(file && uri ? { file: uri, fileName: file.fileName ?? 'shared file', mime: file.mimeType ?? '' } : {}) } } as never);
      resetShareIntent();
    })();
  }, [os, hasShareIntent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Foreground → run scheduler; tapping a notification → open the record.
  useEffect(() => {
    if (!os) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        bus.emit('app.foreground', { at: Date.now() });
        void os.scheduler.tick();
      }
    });
    let nsub: { remove: () => void } | null = null;
    const Notifications = notifications();
    if (Notifications) {
      nsub = Notifications.addNotificationResponseReceivedListener((r) => {
        const d = r.notification.request.content.data as { entityId?: string; entityType?: string } | undefined;
        if (d?.entityId && d.entityType) router.push(`/entity/${d.entityType}/${d.entityId}` as never);
        else router.push('/reminders' as never);
      });
      Notifications.requestPermissionsAsync().catch(() => {});
    }
    return () => {
      sub.remove();
      nsub?.remove();
    };
  }, [os, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          {error ? (
            <Loading />
          ) : !os || !fontsReady ? (
            <Loading />
          ) : (
            <OSProvider os={os}>
              <ToastProvider bottomOffset={74}>
                <Navigator />
                <CategoryLearnPrompt />
              </ToastProvider>
            </OSProvider>
          )}
          {error ? <Text style={{ padding: 24 }}>Failed to start: {error}</Text> : null}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Navigator() {
  const t = useTheme();
  // Root view colour shows during transitions and behind the keyboard; keep it on the ground.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.c.bg.ground).catch(() => {});
  }, [t.c.bg.ground]);
  // Navigator surfaces (scene backgrounds, cards) take the ground and line colours.
  const navTheme = useMemo(() => {
    const base = t.dark ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: t.c.bg.ground, card: t.c.bg.ground, border: t.c.line, text: t.c.fg.primary, primary: t.c.accent.mustard } };
  }, [t]);
  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.bg.ground }, animation: Platform.OS === 'android' ? 'slide_from_right' : 'default' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="entity/[type]/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="entity/[type]/[id]/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="automation/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="dev/components" />
        <Stack.Screen name="search" />
      </Stack>
    </NavThemeProvider>
  );
}
