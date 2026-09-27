import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Icon, Text } from '@ui/kit';
import { lockPrefs, unlock } from '../platform/lock';

/**
 * App lock (M5): when on, LifeOS opens locked and locks again after you've
 * been away longer than your setting. Fingerprint / face, or the phone's PIN.
 * The app stays mounted behind an opaque cover, so nothing shows
 * in the app switcher either.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const os = useOS();
  const t = useTheme();
  const [locked, setLocked] = useState(() => lockPrefs(os).on);
  const [asking, setAsking] = useState(false);
  const leftAt = useRef<number | null>(null);
  // The fingerprint prompt itself sends the app to the background; that isn't leaving.
  const prompting = useRef(false);

  const tryUnlock = useCallback(async () => {
    if (asking) return;
    setAsking(true);
    prompting.current = true;
    const ok = await unlock();
    setAsking(false);
    // Let the return-to-foreground event from the prompt pass first.
    setTimeout(() => (prompting.current = false), 800);
    if (ok) setLocked(false);
  }, [asking]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const p = lockPrefs(os);
      if (!p.on || prompting.current) return;
      if (s === 'background' || s === 'inactive') {
        if (leftAt.current == null) leftAt.current = Date.now();
        // Cover at once so the app switcher shows nothing when it will lock on return.
        if (p.afterMin === 0) setLocked(true);
      } else if (s === 'active') {
        const away = leftAt.current != null ? Date.now() - leftAt.current : 0;
        leftAt.current = null;
        if (away > p.afterMin * 60_000) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [os]);

  useEffect(() => {
    if (locked) void tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.c.bg.ground, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <Icon name="lock" size={36} color={t.c.fg.primary} />
          <Text variant="title">LifeOS is locked</Text>
          <Button title={asking ? 'Waiting…' : 'Unlock'} icon="lock" disabled={asking} onPress={() => void tryUnlock()} />
        </View>
      ) : null}
    </View>
  );
}
