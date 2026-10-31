import type { SourceDef } from '@core/registry/types';
import { saveCalendarEvents } from './calendar';

const DAY = 86_400_000;
/** How much of the calendar each sync reads: a month back, two ahead. */
export const CALENDAR_WINDOW = { pastDays: 30, futureDays: 60 };

/**
 * The phone's calendar (docs/MODEL.md §4; R4): declared by projects, reading
 * the phone through the device bridge (os.device.calendar), as crm's contacts
 * and call log do. A `readings` source that files its own Events.
 */
export const calendarSource: SourceDef = {
  id: 'calendar',
  label: 'Calendar',
  modules: ['projects'],
  permission: 'Calendar',
  kind: 'readings',
  available: async (os) => (await os.device?.calendar?.access()) === 'granted',
  sync: async (os) => {
    const cal = os.device?.calendar;
    if (!cal) return { filed: 0 };
    const now = Date.now();
    const r = saveCalendarEvents(os, await cal.read(now - CALENDAR_WINDOW.pastDays * DAY, now + CALENDAR_WINDOW.futureDays * DAY));
    return { filed: r.created };
  },
};
