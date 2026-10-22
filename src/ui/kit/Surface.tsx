import React, { createContext, useContext } from 'react';
import { useTheme } from '../theme/ThemeProvider';

/**
 * What a control is sitting on. Tiles, cards and rows set 'tile'. In Noir
 * (dark) a control — chip, icon button, secondary button, disc — is the raised
 * charcoal everywhere; the light theme fills with the tile colour on the
 * ground and the nested colour on a tile.
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
  const surface = useSurface();
  if (t.dark) return t.c.bg.tileRaised;
  return surface === 'tile' ? t.c.bg.tileRaised : t.c.bg.tile;
}
