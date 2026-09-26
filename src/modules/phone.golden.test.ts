import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { applyCallLog, importContacts, personForContact, resyncContacts, saveCalendarEvents } from '@core/sources/phone';
import { personType, groupType } from './crm/types';
import { eventType } from './projects/types';

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [{ id: 'crm', name: 'People', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [personType, groupType, eventType] }], registry: new Registry() });
});
afterEach(() => os.db.close());

const kendalContact = { id: 'c1', name: 'Kendal Rao', phones: ['+91 98450 12345'], emails: ['kendal@example.com'], birthday: { day: 8, month: 8 }, company: 'Zomato', jobTitle: 'Designer' };

describe('contacts you pick', () => {
  it('a new contact → a person with phone, email, birthday, company; an existing person is filled in, never overwritten', () => {
    expect(importContacts(os, [kendalContact])).toEqual({ created: 1, updated: 0 });
    const k = os.entities.query('person')[0]!;
    expect(k).toMatchObject({ title: 'Kendal Rao', data: { phone: '+91 98450 12345', email: 'kendal@example.com', company: 'Zomato', role: 'Designer', contactId: 'c1' } });
    expect((k.data as { birthday: string }).birthday).toMatch(/-09-08$/);
    expect(os.cycles.forEntity(k.id).map((c) => c.name)).toContain('Birthday');
    // Already there (said in a dump): matched by name, gaps filled, your company kept.
    const karan = os.entities.create({ type: 'person', title: 'Karan', data: { company: 'Swiggy' } });
    expect(importContacts(os, [{ id: 'c2', name: 'Karan', phones: ['09845000000'], emails: [], company: 'Zomato' }])).toEqual({ created: 0, updated: 1 });
    expect(os.entities.get(karan.id)!.data).toMatchObject({ company: 'Swiggy', phone: '09845000000', contactId: 'c2' });
    expect(personForContact(os, { id: 'zz', name: 'Someone', phones: ['9845000000'], emails: [] })).toBe(karan.id);
    expect(os.dumps.toCheck().map((x) => x.source)).toEqual(['contacts', 'contacts']);
  });

  it('re-sync fills what an imported contact gained, and nothing for people you never imported', () => {
    importContacts(os, [{ id: 'c1', name: 'Kendal Rao', phones: [], emails: [] }]);
    os.entities.create({ type: 'person', title: 'Asha', data: {} });
    expect(resyncContacts(os, [{ ...kendalContact }, { id: 'c9', name: 'Asha', phones: ['1'], emails: [] }])).toBe(1);
    expect(os.entities.query('person').find((p) => p.title === 'Asha')!.data).toEqual({});
  });
});

describe('calendar and call log', () => {
  it('calendar events are saved once, updated in place, linked to people already in LifeOS', () => {
    importContacts(os, [kendalContact]);
    const ev = { id: 'e1', title: 'Dinner', start: Date.parse('2026-09-28T20:00:00'), location: 'Toit', attendees: [{ email: 'KENDAL@example.com' }, { name: 'Stranger' }] };
    expect(saveCalendarEvents(os, [ev])).toEqual({ created: 1, updated: 0, merged: 0 });
    expect(saveCalendarEvents(os, [{ ...ev, location: 'Toit, Indiranagar' }])).toEqual({ created: 0, updated: 1, merged: 0 });
    const [e] = os.entities.query('event');
    expect(e).toMatchObject({ title: 'Dinner', data: { location: 'Toit, Indiranagar', source: 'calendar' } });
    expect(os.relations.forEntity(e!.id).map((r) => r.other.title)).toEqual(['Kendal Rao']);
    expect(os.entities.query('person')).toHaveLength(1);
  });

  it('the same event in 4 calendars (4 accounts) is one event; duplicates already synced are merged', () => {
    importContacts(os, [kendalContact]);
    const start = Date.parse('2026-09-28T20:00:00');
    const copies = ['personal', 'work', 'family', 'shared'].map((acc, i) => ({ id: `${acc}-1`, title: i % 2 ? 'Dinner  with Kendal' : 'dinner with kendal', start, end: start + 7_200_000, attendees: i === 3 ? [{ email: 'kendal@example.com' }] : [] }));
    expect(saveCalendarEvents(os, copies)).toMatchObject({ created: 1 });
    const [e] = os.entities.query('event');
    expect(os.relations.forEntity(e!.id).map((r) => r.other.title)).toEqual(['Kendal Rao']);
    // Duplicates from before this fix (one per calendar, old keys) are merged on the next sync.
    for (const i of [1, 2, 3]) os.entities.create({ type: 'event', title: 'Standup', data: { kind: 'event', startAt: start + 86_400_000, endAt: start + 86_400_000 + 900_000, source: 'calendar', sourceKey: `cal:old-${i}` } });
    expect(saveCalendarEvents(os, [])).toMatchObject({ merged: 2 });
    expect(os.entities.query('event').filter((x) => x.title === 'Standup')).toHaveLength(1);
  });

  it('a call moves last contact (missed calls and strangers don\'t)', () => {
    importContacts(os, [kendalContact]);
    const k = os.entities.query('person')[0]!;
    const n = applyCallLog(os, [
      { number: '9845012345', at: Date.parse('2026-09-20T10:00:00'), seconds: 300, type: 'outgoing' },
      { number: '+919845012345', at: Date.parse('2026-09-25T10:00:00'), seconds: 0, type: 'missed' },
      { number: '9000000000', at: Date.parse('2026-09-25T10:00:00'), seconds: 60, type: 'incoming' },
    ]);
    expect(n).toBe(1);
    expect(os.entities.get(k.id)!.data).toMatchObject({ lastContactAt: '2026-09-20' });
    expect(os.entities.timeline.forEntity(k.id).some((t) => t.title === 'Called Kendal Rao · 5 min')).toBe(true);
    expect(applyCallLog(os, [{ number: '9845012345', at: Date.parse('2026-09-20T10:00:00'), seconds: 300, type: 'outgoing' }])).toBe(0);
  });
});
