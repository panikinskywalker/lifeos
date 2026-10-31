import { PermissionsAndroid, Platform } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import * as Calendar from 'expo-calendar/legacy';
import type { Access, CalendarEvent, CallEntry, DeviceContact } from '@core/registry/context';
import { Device } from '../../modules/lifeos-device';

/**
 * Phone connectors (M4.2b): contacts you pick, the phone's calendar, the
 * call log. Contacts never sync wholesale: only the people you imported
 * are kept up to date. Contacts and the call log are crm's sources (R2), the
 * calendar is projects' (R4): platform only hands the phone to them through
 * the device bridge.
 */

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
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Birthday, Contacts.Fields.Company, Contacts.Fields.JobTitle, Contacts.Fields.Image],
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
      photo: c.imageAvailable && c.image?.uri ? c.image.uri : null,
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

/** The phone's calendars as projects' calendar source reads them (os.device; R4). */
export const calendarBridge = {
  access: async (): Promise<Access> => ((await calendarGranted()) ? 'granted' : 'needed'),
  read: async (from: number, to: number): Promise<CalendarEvent[]> => {
    if (!(await calendarGranted())) return [];
    const cals = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).filter((c) => c.isVisible !== false);
    if (!cals.length) return [];
    const events = await Calendar.getEventsAsync(cals.map((c) => c.id), new Date(from), new Date(to));
    const calName = new Map(cals.map((c) => [c.id, [c.title, c.source?.name && c.source.name !== c.title ? c.source.name : null].filter(Boolean).join(' · ')]));
    const out: CalendarEvent[] = [];
    for (const e of events.slice(0, 600)) {
      const attendees = await Calendar.getAttendeesForEventAsync(e.id).catch(() => []);
      out.push({ id: e.id, title: e.title, start: new Date(e.startDate).getTime(), end: e.endDate ? new Date(e.endDate).getTime() : null, allDay: e.allDay, location: e.location, notes: e.notes, attendees: attendees.map((a) => ({ name: a.name, email: a.email })), calendars: calName.get(e.calendarId) ? [calName.get(e.calendarId)!] : [] });
    }
    return out;
  },
};

/** The phone's contacts and call log as crm's sources read them (os.device; R2). */
export const contactsBridge = {
  access: async (): Promise<Access> => ((await contactsGranted()) ? 'granted' : 'needed'),
  read: loadDeviceContacts,
};
export const callLogBridge = {
  access: async (): Promise<Access> => (Platform.OS !== 'android' || !Device ? 'unavailable' : (await callLogGranted()) ? 'granted' : 'needed'),
  read: async (since: number, limit: number): Promise<CallEntry[]> => (Device && (await callLogGranted()) ? ((await Device.readCallLog(since, limit)) as CallEntry[]) : []),
};
