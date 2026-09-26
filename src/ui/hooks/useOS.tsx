import React, { createContext, useContext, useEffect, useReducer, useRef, useState, type DependencyList } from 'react';
import type { LifeOSContext } from '@core/registry/context';
import { bus, type EventName } from '@core/events/bus';

const OSContext = createContext<LifeOSContext | null>(null);

export function OSProvider({ os, children }: { os: LifeOSContext; children: React.ReactNode }) {
  return <OSContext.Provider value={os}>{children}</OSContext.Provider>;
}

export function useOS(): LifeOSContext {
  const os = useContext(OSContext);
  if (!os) throw new Error('useOS must be used inside <OSProvider>');
  return os;
}

const DATA_EVENTS: EventName[] = ['entity.created', 'entity.updated', 'entity.deleted', 'entity.restored', 'entity.status', 'relation.added', 'relation.removed', 'comment.added', 'attachment.added', 'reminder.created', 'reminder.completed', 'tag.applied', 'schedule.tick', 'module.installed', 'data.changed'];

/**
 * Global data version — bumps on any mutation. Screens re-read at most every
 * 300 ms: a burst (an SMS import, a filed dump, an automation) renders once,
 * and a steady trickle can't keep every mounted screen recalculating.
 */
let version = 0;
const listeners = new Set<() => void>();
for (const ev of DATA_EVENTS) bus.on(ev, () => bump());
const THROTTLE_MS = 300;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastFlush = 0;
let paused = 0;
function flush() {
  timer = null;
  lastFlush = Date.now();
  for (const l of listeners) l();
}
export function bump() {
  version++;
  if (paused || timer) return;
  const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastFlush));
  timer = setTimeout(flush, wait);
}
/** Hold screen refreshes during bulk work (an SMS history import); one refresh when it ends. */
export async function quietly<T>(work: () => Promise<T>): Promise<T> {
  paused++;
  try {
    return await work();
  } finally {
    paused--;
    if (!paused) bump();
  }
}

export function useDataVersion(): number {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => void listeners.delete(force);
  }, []);
  return version;
}

/**
 * Synchronous "live" query: runs `fn` against the local DB and re-runs on
 * every data mutation. Perfect for SQLite-on-device — reads are sub-ms.
 */
export function useLive<T>(fn: (os: LifeOSContext) => T, deps: DependencyList = []): T {
  const os = useOS();
  const v = useDataVersion();
  const ref = useRef<{ v: number; deps: DependencyList; value: T } | null>(null);
  const depsChanged = !ref.current || ref.current.v !== v || ref.current.deps.length !== deps.length || ref.current.deps.some((d, i) => d !== deps[i]);
  if (depsChanged) {
    ref.current = { v, deps, value: fn(os) };
  }
  return ref.current!.value;
}

/** Async variant for work that touches files / network. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList = []): { data: T | undefined; loading: boolean; error: Error | null; reload: () => void } {
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: Error | null }>({ data: undefined, loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then((data) => alive && setState({ data, loading: false, error: null })).catch((error) => alive && setState({ data: undefined, loading: false, error }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
