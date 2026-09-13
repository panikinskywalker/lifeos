import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, radius, spacing, type, type Theme } from './tokens';
import { useSettings } from '../hooks/useSettings';

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const pref = useSettings((s) => s.appearance);
  const dark = pref === 'system' ? system === 'dark' : pref === 'dark';
  const value = useMemo<Theme>(() => ({ dark, colors: dark ? darkColors : lightColors, spacing, radius, type }), [dark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) return { dark: false, colors: lightColors, spacing, radius, type };
  return t;
}
