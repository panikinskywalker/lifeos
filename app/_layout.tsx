import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from '@expo-google-fonts/manrope/useFonts';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { OSProvider } from '@ui/hooks/useOS';
import { ThemeProvider, useTheme } from '@ui/theme/ThemeProvider';
import { Loading, Text } from '@ui/components/primitives';
import { bootLifeOS, setNavigator } from '../src/platform/boot';
import { AppState } from 'react-native';

SplashScreen.preventAutoHideAsync().catch(() => {});

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export default function RootLayout() {
  const [os, setOS] = useState<LifeOSContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // Native builds embed these via the expo-font plugin; this also covers web and dev clients.
  const [fontsLoaded, fontError] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  const fontsReady = fontsLoaded || !!fontError;

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
    if (Platform.OS !== 'web') {
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
              <Navigator />
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
  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.background }, animation: Platform.OS === 'android' ? 'slide_from_right' : 'default' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="entity/[type]/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="entity/[type]/[id]/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="automation/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="dev/components" />
      </Stack>
    </>
  );
}
