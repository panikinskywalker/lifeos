/**
 * How a screen arrives (the trip template's moves, 18 Nov): a sheet (Log a
 * spend, Split a receipt, Pay back, the copilot) rises from the bottom; the
 * search palette fades in; anything else slides in from the right. The trip's
 * own sections are not screens at all: they are tabs inside one (jp/host.tsx).
 */

type NativeStackAnimation = 'fade' | 'slide_from_bottom' | 'slide_from_right' | 'default';

const SHEETS = new Set(['spend', 'receipt', 'payback', 'copilot', 'listen']);
const FADES = new Set(['search']);

export function screenMotion(params: Record<string, unknown> | undefined): { animation?: NativeStackAnimation; animationDuration?: number } {
  const p = params ?? {};
  const page = typeof p.page === 'string' ? p.page : '';
  if (SHEETS.has(page)) return { animation: 'slide_from_bottom', animationDuration: 280 };
  if (FADES.has(page)) return { animation: 'fade', animationDuration: 180 };
  return {};
}
