import React, { createContext, useContext } from 'react';
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
