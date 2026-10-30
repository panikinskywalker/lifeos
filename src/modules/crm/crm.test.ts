import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { DeviceBridge, LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { whoIs, phoneInUpi } from '@core/identity';
import { runSource } from '@core/filing/sources';
import { placesModule } from '@modules/places';
import { financeModule } from '@modules/finance';
import { eventType } from '@modules/projects/types';
import { payeeFor } from '@modules/finance/filing/payee';
import { crmModule, foldPeople, lastMet, peopleToCall, refreshLastSpoke, snapCadence, type GroupData, type PersonData } from '.';

let os: LifeOSContext;
const DAY = 86_400_000;
const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, placesModule, financeModule, { id: 'agenda', name: 'Agenda', version: '1', description: '', icon: 'x', color: '#000', objects: [eventType] }], registry: new Registry() });
});
afterEach(() => os.db.close());

const person = (title: string, data: Partial<PersonData> = {}) => os.records.create<PersonData>({ object: 'person', title, data });
const tool = (name: string) => crmModule.aiTools!.find((t) => t.name === name)!;

describe('Person (agreed 22 Oct)', () => {
  it('keep in touch is a cadence: any day count snaps to the nearest, and drives the Keep in touch cycle', () => {
    expect([snapCadence(14), snapCadence('20'), snapCadence(45), snapCadence(400), snapCadence(''), snapCadence(0)]).toEqual(['14', '14', '30', '365', undefined, undefined]);
    const p = person('Priya', { contactEvery: 20 as unknown as string });
    expect(p.data.contactEvery).toBe('14');
    expect(os.cycles.forEntity(p.id).find((c) => c.template === 'person.contact')).toMatchObject({ name: 'Keep in touch', everyN: 14, everyUnit: 'day' });
  });

  it('a typed company and city become Works at → Organisation and Lives in → Place; the text stays', () => {
    const zomato = os.records.create({ object: 'org', title: 'Zomato', data: { kind: 'company' } });
    const k = person('Karan', { company: 'zomato', city: 'Bengaluru' });
    const now = os.records.get<PersonData>(k.id)!.data;
    expect(now.worksAtId).toBe(zomato.id);
    expect(now.company).toBe('zomato');
    expect(os.records.get(now.livesInId!)).toMatchObject({ object: 'place', title: 'Bengaluru', data: { kind: 'city' } });
    expect(os.links.forEntity(k.id, 'works at').map((l) => l.other.id)).toEqual([zomato.id]);
    // The text changes: the link follows it.
    os.records.update<PersonData>(k.id, { data: { company: 'Swiggy' } });
    expect(os.records.get(os.records.get<PersonData>(k.id)!.data.worksAtId!)!.title).toBe('Swiggy');
  });

  it('the fold on start: old people are linked once, and the Football group becomes sport', () => {
    const g = os.records.create<GroupData>({ object: 'group', data: { name: 'Football', kind: 'friends', memberIds: [] } });
    expect(foldPeople(os).groups).toBe(1);
    expect(os.records.get<GroupData>(g.id)!.data.kind).toBe('sport');
    expect(foldPeople(os)).toEqual({ linked: 0, groups: 0 });
  });
});

describe('who a sender is (core whoIs, shared with Turf)', () => {
  it('by a UPI id on the person, a sender learned as an alias, the mobile number inside a UPI id; never an ambiguous phone', () => {
    const priya = person('Priya Sharma', { upi: 'priya.s@okicici, ps@ybl', phone: '+91 98450 12345' });
    const arjun = person('Arjun', {});
    expect(whoIs(os, { upi: 'PS@ybl' })).toMatchObject({ record: { id: priya.id }, by: 'upi' });
    os.aliases.learn('arjun.m@oksbi', arjun.id);
    expect(whoIs(os, { upi: 'arjun.m@oksbi' })).toMatchObject({ record: { id: arjun.id }, by: 'alias' });
    expect(phoneInUpi('919845012345@ybl')).toBe('9845012345');
    expect(whoIs(os, { upi: '9845012345@paytm' })).toMatchObject({ record: { id: priya.id }, by: 'phone' });
    person('Priya (old number)', { phone: '9845012345' });
    expect(whoIs(os, { phone: '09845012345' })).toBeNull();
    expect(whoIs(os, { upi: 'stranger@ybl' })).toBeNull();
  });

  it("finance's payee matching finds the person through it", () => {
    const priya = person('Priya Sharma', { phone: '9845012345' });
    const arjun = person('Arjun Mehta', {});
    os.aliases.learn('arjun.m@oksbi', arjun.id);
    expect(payeeFor(os, 'P SHARMA', '9845012345@ybl')).toMatchObject({ id: priya.id, type: 'person', confidence: 1, guess: null });
    expect(payeeFor(os, 'ARJUN', 'arjun.m@oksbi')).toMatchObject({ id: arjun.id, type: 'person', confidence: 1 });
  });
});

describe('Last spoke', () => {
  it('a payment and an Event with them move it (and tick keep in touch); a guess, a future meeting and an older date do not', () => {
    const now = Date.now();
    const p = person('Priya', { contactEvery: '14', lastContactAt: isoDay(now - 40 * DAY) });
    const tx = os.records.create({ object: 'transaction', title: 'Toit', data: { amount: 1620, kind: 'expense', date: isoDay(now - 3 * DAY), category: 'food' } });
    os.links.link(tx.id, p.id, 'person', {}, 'assistant', { confidence: 0.6 });
    expect(os.records.get<PersonData>(p.id)!.data.lastContactAt).toBe(isoDay(now - 40 * DAY));
    const tx2 = os.records.create({ object: 'transaction', title: 'Coffee', data: { amount: 300, kind: 'expense', date: isoDay(now - 2 * DAY), category: 'food' } });
    os.links.link(tx2.id, p.id, 'person', {}, 'assistant', { confidence: 1 });
    expect(os.records.get<PersonData>(p.id)!.data.lastContactAt).toBe(isoDay(now - 2 * DAY));
    expect(os.cycles.forEntity(p.id).find((c) => c.template === 'person.contact')!.lastDoneAt).toBeGreaterThan(now - 3 * DAY);
    const later = os.records.create({ object: 'event', title: 'Dinner', data: { kind: 'met', startAt: now + 5 * DAY } });
    os.links.link(later.id, p.id, 'with', {}, 'system');
    expect(os.records.get<PersonData>(p.id)!.data.lastContactAt).toBe(isoDay(now - 2 * DAY));
    // Its time passes: the next start counts it.
    expect(refreshLastSpoke(os, { only: ['event'] }, now + 6 * DAY)).toBe(1);
    expect(os.records.get<PersonData>(p.id)!.data.lastContactAt).toBe(isoDay(now + 5 * DAY));
  });
});

describe('sources declared by crm', () => {
  it('contacts and call log run through core with the device bridge', async () => {
    const now = Date.now();
    const device: DeviceBridge = {
      contacts: { access: async () => 'granted', read: async () => [{ id: 'c1', name: 'Kendal Rao', phones: ['+91 98450 12345'], emails: ['k@example.com'], photo: 'content://photo/1' }] },
      callLog: { access: async () => 'granted', read: async () => [{ number: '9845012345', at: now - DAY, seconds: 300, type: 'outgoing' }, { number: '9845012345', at: now - 60_000, seconds: 0, type: 'missed' }] },
    };
    os.device = device;
    const k = person('Kendal Rao', { contactId: 'c1' });
    expect(await runSource(os, os.registry.sources.get('contacts')!)).toBe(1);
    expect(os.records.get<PersonData>(k.id)!.data).toMatchObject({ phone: '+91 98450 12345', email: 'k@example.com', photo: { uri: 'content://photo/1' } });
    expect(await runSource(os, os.registry.sources.get('calllog')!)).toBe(1);
    expect(os.records.get<PersonData>(k.id)!.data.lastContactAt).toBe(isoDay(now - DAY));
    expect(os.records.timeline.forEntity(k.id).some((e) => e.kind === 'call' && e.title.startsWith('Called Kendal Rao'))).toBe(true);
  });
});

describe('AI tools', () => {
  it('people_to_call lists overdue keep-in-touch and birthdays soon; last_met says when and through what', async () => {
    const now = Date.now();
    const p = person('Priya Sharma', { contactEvery: '7', lastContactAt: isoDay(now - 20 * DAY) });
    const soon = new Date(now + 3 * DAY);
    person('Dad', { birthday: `1960-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}` });
    person('Arjun', {});
    const list = peopleToCall(os);
    expect(list.map((x) => [x.name, x.reason, x.late])).toEqual([['Priya Sharma', 'keep in touch', true], ['Dad', 'birthday', false]]);
    const out = (await tool('people_to_call').run({}, os)) as { people: Array<{ name: string }> };
    expect(out.people.map((x) => x.name)).toEqual(['Priya Sharma', 'Dad']);

    const ev = os.records.create({ object: 'event', title: 'Lunch at Toit', data: { kind: 'met', startAt: now - 5 * DAY } });
    os.links.link(ev.id, p.id, 'with', {}, 'system');
    const m = lastMet(os, p.id)!;
    expect(m).toMatchObject({ name: 'Priya Sharma', daysAgo: 5, keepInTouch: 'Every week', lastEvent: { title: 'Lunch at Toit' } });
    expect(await tool('last_met').run({ person: 'priya' }, os)).toMatchObject({ id: p.id, daysAgo: 5 });
    expect(await tool('who_is').run({ upi: 'nobody@ybl' }, os)).toEqual({ id: null });
  });
});

describe('People design decisions (30 Oct)', () => {
  it('a relationship you add is kept, with its own colour, and can be picked for anyone', async () => {
    const { addRelationship } = await import('./relationships');
    const field = crmModule.objects![0]!.fields.find((f) => f.key === 'relationship')!;
    const mentor = field.onCreateOption!('mentor')!;
    expect(mentor).toMatchObject({ value: 'mentor', label: 'Mentor', color: 'purple' });
    expect(field.options!.map((o) => o.value)).toContain('mentor');
    expect(addRelationship(os, 'Mentor')).toEqual(mentor);
    const p = person('Asha', { relationship: 'mentor' });
    expect(p.data.relationship).toBe('mentor');
  });

  it('a contact without a birth year is kept without one: no age, the birthday cycle still yearly', async () => {
    const { importContacts, birthdayParts, nextBirthday } = await import('.');
    importContacts(os, [{ id: 'c7', name: 'Nani', phones: [], emails: [], birthday: { day: 23, month: 9 } }]);
    const n = os.records.query<PersonData>('person').find((p) => p.title === 'Nani')!;
    expect(birthdayParts(n.data.birthday)).toEqual({ month: 10, day: 23, year: null });
    expect(nextBirthday(n.data.birthday!)!.age).toBeNull();
    expect(os.cycles.forEntity(n.id).find((c) => c.template === 'person.birthday')!.nextDueAt).toBeGreaterThan(Date.now() - DAY);
  });
});
