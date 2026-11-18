/**
 * How a screen arrives (the trip template's moves, ADHOC 18 Nov): switching
 * sections on the trip bar crossfades (the header and the bar sit in the same
 * place on every section, so only the content seems to change); a sheet (Log
 * a spend, Split a receipt, Pay back, the copilot) rises from the bottom; the
 * search palette fades in; anything else slides in from the right.
 */

type NativeStackAnimation = 'fade' | 'slide_from_bottom' | 'slide_from_right' | 'default';

const SHEETS = new Set(['spend', 'receipt', 'payback', 'copilot', 'listen']);
const FADES = new Set(['search']);

export function screenMotion(params: Record<string, unknown> | undefined): { animation?: NativeStackAnimation; animationDuration?: number } {
  const p = params ?? {};
  if (p.via === 'tab') return { animation: 'fade', animationDuration: 200 };
  const page = typeof p.page === 'string' ? p.page : '';
  if (SHEETS.has(page)) return { animation: 'slide_from_bottom', animationDuration: 280 };
  if (FADES.has(page)) return { animation: 'fade', animationDuration: 180 };
  return {};
}
