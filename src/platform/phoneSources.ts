import { PermissionsAndroid, Platform } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import * as Calendar from 'expo-calendar/legacy';
import type { LifeOSContext } from '@core/registry/context';
import { applyCallLog, resyncContacts, saveCalendarEvents, PHONE_SYNC_WINDOW, type DeviceContact } from '@core/sources/phone';
import { setSourceState, sourceState } from '@core/sources/deviceData';
import { Device } from '../../modules/lifeos-device';

/**
 * Phone connectors (M4.2b): contacts you pick, the phone's calendar, the
 * call log. Contacts never sync wholesale — only the people you imported
 * are kept up to date.
 */

const W = PHONE_SYNC_WINDOW;

export async function contactsGranted(): Promise<boolean> {
  try {
    return (await Contacts.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Your phone's contacts (for the picker), sorted by name. */
export async function loadDeviceContacts(): Promise<DeviceContact[]> {
  if (!(await Contacts.requestPermissionsAsync()).granted) return [];
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Birthday, Contacts.Fields.Company, Contacts.Fields.JobTitle],
    sort: Contacts.SortTypes.FirstName,
  });
  return data
    .filter((c) => (c.name ?? '').trim())
    .map((c) => ({
      id: String(c.id),
      name: c.name!.trim(),
      phones: (c.phoneNumbers ?? []).map((p) => p.number ?? '').filter(Boolean),
      emails: (c.emails ?? []).map((e) => e.email ?? '').filter(Boolean),
      birthday: c.birthday?.day ? { day: c.birthday.day, month: c.birthday.month ?? 0, year: c.birthday.year } : null,
      company: c.company ?? null,
      jobTitle: c.jobTitle ?? null,
    }));
}

export async function calendarGranted(): Promise<boolean> {
  try {
    return (await Calendar.getCalendarPermissionsAsync()).granted;
  } catch {
    return false;
  }
}
export async function requestCalendar(): Promise<boolean> {
  return (await Calendar.requestCalendarPermissionsAsync()).granted;
}

export async function callLogGranted(): Promise<boolean> {
  if (Platform.OS !== 'android' || !Device) return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG);
}
export async function requestCallLog(): Promise<boolean> {
  if (Platform.OS !== 'android' || !Device) return false;
  return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG)) === PermissionsAndroid.RESULTS.GRANTED;
}

async function syncCalendar(os: LifeOSContext) {
  if (!(await calendarGranted())) return;
  const cals = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).filter((c) => c.isVisible !== false);
  if (!cals.length) return;
  const now = Date.now();
  const events = await Calendar.getEventsAsync(cals.map((c) => c.id), new Date(now - W.calendarPastDays * W.day), new Date(now + W.calendarFutureDays * W.day));
  const out = [];
  for (const e of events.slice(0, 600)) {
    const attendees = await Calendar.getAttendeesForEventAsync(e.id).catch(() => []);
    out.push({ id: e.id, title: e.title, start: new Date(e.startDate).getTime(), end: e.endDate ? new Date(e.endDate).getTime() : null, allDay: e.allDay, location: e.location, notes: e.notes, attendees: attendees.map((a) => ({ name: a.name, email: a.email })) });
  }
  const r = saveCalendarEvents(os, out);
  setSourceState(os, 'calendar', { enabled: true, lastSync: now, addTotal: r.created, error: null });
}

async function syncCallLog(os: LifeOSContext) {
  if (!Device || !(await callLogGranted())) return;
  const st = sourceState(os, 'calllog');
  const since = st.lastSync ? st.lastSync - W.day : Date.now() - W.callLogDays * W.day;
  const n = applyCallLog(os, await Device.readCallLog(since, 2000));
  setSourceState(os, 'calllog', { enabled: true, lastSync: Date.now(), addTotal: n, error: null });
}

async function syncContacts(os: LifeOSContext) {
  if (!(await contactsGranted())) return;
  const linked = os.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM entities WHERE type='person' AND deleted_at IS NULL AND json_extract(data,'$.contactId') IS NOT NULL`)?.n ?? 0;
  if (!linked) return;
  const n = resyncContacts(os, await loadDeviceContacts());
  setSourceState(os, 'contacts', { enabled: true, lastSync: Date.now(), addTotal: n, error: null });
}

/** Called by the main source sync. */
export async function syncPhoneSources(os: LifeOSContext) {
  for (const [id, fn] of [['calendar', syncCalendar], ['calllog', syncCallLog], ['contacts', syncContacts]] as const) {
    try {
      await fn(os);
    } catch (e) {
      setSourceState(os, id, { error: (e as Error).message.slice(0, 200) });
    }
  }
}
