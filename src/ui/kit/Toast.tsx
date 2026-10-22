import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

/** SCOPE.md D: undo for every destructive or agent action, 8 s. */
export const UNDO_MS = 8000;

export interface ToastOptions {
  message: string;
  icon?: IconName;
  /** Shows an Undo button; called once if tapped before the toast expires. */
  undo?: () => void | Promise<void>;
  /** Any other single action (Retry). Ignored when `undo` is set. */
  action?: { label: string; onPress: () => void };
  duration?: number;
}

interface ToastApi {
  show: (o: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

/**
 * One toast at a time, above the nav (`bottomOffset`): Noir's white pill with
 * a lime (or coral) disc. A new toast replaces the current one.
 */
export function ToastProvider({ children, bottomOffset = 0 }: { children: React.ReactNode; bottomOffset?: number }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const idRef = useRef(0);
  const hide = useCallback(() => setToast(null), []);
  // A toast may only dismiss itself, so a late fade-out never hides its replacement.
  const dismiss = useCallback((id: number) => setToast((cur) => (cur?.id === id ? null : cur)), []);
  const show = useCallback((o: ToastOptions) => {
    idRef.current += 1;
    setToast({ ...o, id: idRef.current });
    AccessibilityInfo.announceForAccessibility(o.undo ? `${o.message}. Undo available.` : o.message);
  }, []);
  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} dismiss={dismiss} bottomOffset={bottomOffset} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, dismiss, bottomOffset }: { toast: ToastOptions & { id: number }; dismiss: (id: number) => void; bottomOffset: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const used = useRef(false);
  const onDone = () => dismiss(toast.id);
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => dismiss(toast.id)), toast.duration ?? (toast.undo || toast.action ? UNDO_MS : 4000));
    return () => clearTimeout(timer);
  }, [anim, dismiss, toast]);
  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: t.layout.gutter, right: t.layout.gutter, bottom: insets.bottom + bottomOffset + 12, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingLeft: 12, paddingRight: 18, borderRadius: t.dark ? 999 : t.radius.card, backgroundColor: t.c.bg.toast, shadowColor: '#000', shadowOpacity: t.dark ? 0.4 : 0, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: t.dark ? 12 : 0 }}>
        {toast.icon ? (
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: toast.icon === 'info' || toast.icon === 'warning' ? t.c.alert.coral : t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={toast.icon} size={16} color={t.c.fg.onAccent} />
          </View>
        ) : null}
        <Text variant="tileTitle" color={t.c.fg.onToast} style={{ flex: 1, paddingVertical: 12 }} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.undo || toast.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.undo ? 'Undo' : toast.action!.label}
            hitSlop={8}
            onPress={() => {
              if (used.current) return;
              used.current = true;
              onDone();
              if (toast.undo) void toast.undo();
              else toast.action!.onPress();
            }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 8, opacity: pressed ? 0.7 : 1 })}
          >
            {toast.undo ? <Icon name="undo" size={16} color={t.dark ? t.c.fg.onToast : t.c.accent.mustard} /> : null}
            <Text variant="label" color={t.dark ? t.c.fg.onToast : t.c.accent.mustard} style={{ fontWeight: '700' }}>
              {toast.undo ? 'Undo' : toast.action!.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
