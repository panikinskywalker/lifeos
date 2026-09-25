import React, { createContext, useContext } from 'react';
import { useTheme } from '../theme/ThemeProvider';

/**
 * What a control is sitting on. The canvas fills controls (inputs, chips,
 * secondary buttons, icon buttons) with the tile colour on the ground, and
 * with the nested colour on a tile. Tiles, cards and rows set 'tile'.
 */
export type SurfaceKind = 'ground' | 'tile';
const SurfaceContext = createContext<SurfaceKind>('ground');

export function Surface({ kind, children }: { kind: SurfaceKind; children: React.ReactNode }) {
  return <SurfaceContext.Provider value={kind}>{children}</SurfaceContext.Provider>;
}

export function useSurface(): SurfaceKind {
  return useContext(SurfaceContext);
}

/** Fill for a control on the current surface. */
export function useControlFill(): string {
  const t = useTheme();
  return useSurface() === 'tile' ? t.c.bg.tileRaised : t.c.bg.tile;
}
