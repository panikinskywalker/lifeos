import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from './tokens';
import { useSettings } from '../hooks/useSettings';

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children, override }: { children: React.ReactNode; override?: 'light' | 'dark' }) {
  const system = useColorScheme();
  const pref = useSettings((s) => s.appearance);
  const mode = override ?? (pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref);
  return <ThemeContext.Provider value={mode === 'dark' ? darkTheme : lightTheme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext) ?? lightTheme;
}

/**
 * Noir colour block ("everything goes black on colour", NR-KitComponents):
 * inside it, text and icons are ground-black at 100 / 62 / 42 %, controls are
 * a 14 % black wash and the accent is black. Light theme: unchanged.
 */
export function OnBlock({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const value = useMemo<Theme>(() => {
    if (!t.dark) return t;
    const ink = t.c.bg.ground;
    return {
      ...t,
      c: {
        ...t.c,
        bg: { ...t.c.bg, tile: '#0B0B0D24', tileRaised: '#0B0B0D24', lowest: '#0B0B0D24', dim: '#0B0B0D24', pressed: '#0B0B0D38' },
        fg: { ...t.c.fg, primary: ink, secondary: `${ink}9E`, tertiary: `${ink}6B` },
        line: '#0B0B0D24',
        ringTrack: '#0B0B0D24',
        accent: { ...t.c.accent, mustard: ink, mustardInk: t.c.fg.primary, gold: ink },
      },
    };
  }, [t]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
