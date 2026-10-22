import type { SourceDef } from '@core/registry/types';
import { sourceState } from '@core/sources/deviceData';
import { applyCallLog, resyncContacts } from './contacts';

/**
 * The sources that feed People (docs/MODEL.md §4; R2). Each reads the phone
 * through the device bridge (os.device.contacts / callLog), never platform
 * code. Both are `readings` sources that file their own records and report
 * the count.
 */

const DAY = 86_400_000;
/** A first call-log sync looks this far back. */
export const CALL_LOG_DAYS = 30;

/** Contacts: only the people you picked are kept up to date; the picker (You › Data sources › Contacts) adds them. */
export const contactsSource: SourceDef = {
  id: 'contacts',
  label: 'Contacts',
  modules: ['crm'],
  permission: 'Contacts',
  kind: 'readings',
  available: async (os) => (await os.device?.contacts?.access()) === 'granted',
  sync: async (os) => {
    const c = os.device?.contacts;
    const linked = os.records.query<{ contactId?: string }>('person', {}, { limit: 5000 }).some((p) => p.data.contactId);
    if (!c || !linked) return { filed: 0 };
    return { filed: resyncContacts(os, await c.read()) };
  },
};

/** Call log: calls with people in LifeOS move their last spoke. */
export const callLogSource: SourceDef = {
  id: 'calllog',
  label: 'Call log',
  modules: ['crm'],
  permission: 'Call log',
  kind: 'readings',
  available: async (os) => (await os.device?.callLog?.access()) === 'granted',
  sync: async (os) => {
    const log = os.device?.callLog;
    if (!log) return { filed: 0 };
    const last = sourceState(os, 'calllog').lastSync;
    const since = last ? last - DAY : Date.now() - CALL_LOG_DAYS * DAY;
    return { filed: applyCallLog(os, await log.read(since, 2000)) };
  },
};

export const crmSources: SourceDef[] = [contactsSource, callLogSource];
