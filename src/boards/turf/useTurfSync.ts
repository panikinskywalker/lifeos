import { useEffect, useState } from 'react';
import type { LifeOSContext } from '@core/registry/context';
import { runSource } from '@core/filing/sources';
import { sourceState } from '@core/sources/deviceData';
import { useOS } from '@ui/hooks';
import { useToast } from '@ui/kit';

const EVERY_MS = 60_000;
/** One sync at a time, however many board screens are open. */
let inFlight = false;
const stale = (os: LifeOSContext) => Date.now() - (sourceState(os, 'turf').lastSync ?? 0) > EVERY_MS - 5_000;

/**
 * A Turf web sync through core: when a board screen opens (if the last one is
 * over a minute old), every minute while it stays open, and on pull-to-refresh.
 * Only the pull-down says what went wrong; the quiet ones leave it on the
 * source's state (You › Data sources).
 */
export function usePull() {
  const os = useOS();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pull = async (quiet = false) => {
    const src = os.registry.sources.get('turf');
    if (!src || inFlight) return;
    inFlight = true;
    if (!quiet) setBusy(true);
    try {
      if (src.available && !(await src.available(os))) {
        if (!quiet) toast.show({ message: 'Add Turf web’s address and this phone’s key first', icon: 'info' });
      } else await runSource(os, src);
    } catch (e) {
      if (!quiet) toast.show({ message: (e as Error).message, icon: 'info' });
    } finally {
      inFlight = false;
      if (!quiet) setBusy(false);
    }
  };
  useEffect(() => {
    if (stale(os)) void pull(true);
    const timer = setInterval(() => stale(os) && void pull(true), EVERY_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os]);
  return { busy, pull };
}
