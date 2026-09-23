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
 * One toast at a time on the bar colour, above the bottom bar (`bottomOffset`).
 * A new toast replaces the current one.
 */
export function ToastProvider({ children, bottomOffset = 0 }: { children: React.ReactNode; bottomOffset?: number }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const idRef = useRef(0);
  const hide = useCallback(() => setToast(null), []);
  const show = useCallback((o: ToastOptions) => {
    idRef.current += 1;
    setToast({ ...o, id: idRef.current });
    AccessibilityInfo.announceForAccessibility(o.undo ? `${o.message}. Undo available.` : o.message);
  }, []);
  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onDone={hide} bottomOffset={bottomOffset} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDone, bottomOffset }: { toast: ToastOptions; onDone: () => void; bottomOffset: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const used = useRef(false);
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(onDone), toast.duration ?? (toast.undo ? UNDO_MS : 4000));
    return () => clearTimeout(timer);
  }, [anim, onDone, toast]);
  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: t.layout.gutter, right: t.layout.gutter, bottom: insets.bottom + bottomOffset + 12, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingLeft: 16, paddingRight: 6, borderRadius: t.radius.card, backgroundColor: t.c.bg.bar }}>
        {toast.icon ? <Icon name={toast.icon} size={18} color={t.c.fg.onBarActive} /> : null}
        <Text variant="body" color={t.c.fg.onBarActive} style={{ flex: 1, paddingVertical: 12 }} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.undo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo"
            hitSlop={8}
            onPress={() => {
              if (used.current) return;
              used.current = true;
              void toast.undo?.();
              onDone();
            }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 12, borderRadius: t.radius.chip, backgroundColor: pressed ? t.c.accent.mustardInk : 'transparent' })}
          >
            <Icon name="undo" size={16} color={t.c.accent.mustard} />
            <Text variant="label" color={t.c.accent.mustard}>
              Undo
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
