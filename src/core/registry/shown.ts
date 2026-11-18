import type { LifeOSContext } from './context';

/**
 * Which modules the app shows (docs/MODEL.md, Modules shown, 15 Nov): while
 * modules are built one by one, only the ones finished (Money and Turf) are
 * shown; the rest are hidden from Browse, Today, Upkeep, the brief and search,
 * but keep running, so nothing they collect is lost and a linked record still
 * opens. "Show every module" (You › Modules) and demo data show them all.
 */

export const SHOWN_KEY = 'app.shownModules';
export const SHOW_ALL_KEY = 'app.showAllModules';
export const DEFAULT_SHOWN = ['finance', 'games'];

/** The modules shown, or null when every module is (show all, demo data, or no list set: the app sets one at start). */
export function shownModules(os: LifeOSContext): Set<string> | null {
  if (os.settings.get<boolean>(SHOW_ALL_KEY, false) || os.settings.get<boolean>('demoSeeded', false)) return null;
  const list = os.settings.get<string[] | null>(SHOWN_KEY, null);
  return list ? new Set(list) : null;
}

/** First start on a real phone: show Money and Turf only (the app calls this; tests and demo show everything). */
export function startShownModules(os: LifeOSContext): void {
  if (os.settings.get<string[] | null>(SHOWN_KEY, null) === null) os.settings.set(SHOWN_KEY, DEFAULT_SHOWN);
}

/** Core's own Objects (routines, events…) and anything not from a module are always shown. */
export function isModuleShown(os: LifeOSContext, moduleId: string | null | undefined): boolean {
  if (!moduleId || moduleId === 'core' || !os.registry.modules.has(moduleId)) return true;
  const s = shownModules(os);
  return !s || s.has(moduleId);
}

/** A board: the bar's (Today, Upkeep) always; a module's companion with its module; a cross-module board with the module it is shown with. */
export function isBoardShown(os: LifeOSContext, boardId: string | null | undefined): boolean {
  const b = boardId ? os.registry.boards.get(boardId) : undefined;
  if (!b || b.placement === 'bar') return true;
  const mod = b.module ?? b.shownWith;
  return mod ? isModuleShown(os, mod) : shownModules(os) === null;
}

export function setModuleShown(os: LifeOSContext, moduleId: string, on: boolean): void {
  const s = new Set(os.settings.get<string[] | null>(SHOWN_KEY, null) ?? [...os.registry.modules.keys()].filter((id) => id !== 'core'));
  if (on) s.add(moduleId);
  else s.delete(moduleId);
  os.settings.set(SHOWN_KEY, [...s]);
}
