import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from './db/betterSqliteAdapter';
import { createLifeOS } from './lifeos';
import { Registry } from './registry/registry';
import type { LifeOSContext } from './registry/context';
import { bus } from './events/bus';
import { linkGroups, mostLinked } from './graph/read';
import { orgType, placeType } from '../modules/places/types';
import { personType } from '../modules/crm/types';
import { eventType } from '../modules/projects/types';
import { transactionType } from '../modules/finance/types';

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({
    db: createBetterSqliteAdapter(':memory:'),
    modules: [
      { id: 'crm', name: 'crm', version: '1', description: '', icon: 'x', color: '#000', objects: [personType] },
      { id: 'places', name: 'places', version: '1', description: '', icon: 'x', color: '#000', objects: [placeType, orgType] },
      { id: 'projects', name: 'projects', version: '1', description: '', icon: 'x', color: '#000', objects: [eventType] },
      { id: 'finance', name: 'finance', version: '1', description: '', icon: 'x', color: '#000', objects: [transactionType] },
    ],
    registry: new Registry(),
  });
});
afterEach(() => os.db.close());

describe('the Links card (R11)', () => {
  it('groups by link word as read from each side, with the module and dates', () => {
    const karan = os.records.create({ object: 'person', title: 'Karan', data: {} });
    const acme = os.records.create({ object: 'org', title: 'Acme', data: {} });
    const toit = os.records.create({ object: 'place', title: 'Toit', data: {} });
    const bengaluru = os.records.create({ object: 'place', title: 'Bengaluru', data: {} });
    const dinner = os.records.create({ object: 'event', title: 'Dinner', data: { startAt: Date.parse('2026-10-20T20:00:00') } });
    const lunch = os.records.create({ object: 'event', title: 'Lunch', data: { startAt: Date.parse('2026-10-25T13:00:00') } });
    os.links.link(karan.id, acme.id, 'works at');
    os.links.link(dinner.id, karan.id, 'with');
    os.links.link(lunch.id, karan.id, 'with');
    os.links.link(dinner.id, toit.id, 'at');
    os.links.link(toit.id, bengaluru.id, 'located_in');
    os.links.link(dinner.id, karan.id, 'mention');

    const g = linkGroups(os, karan.id);
    expect(g.map((x) => [x.word, x.items.map((i) => i.title)])).toEqual([
      ['Was at', ['Lunch', 'Dinner']],
      ['Works at', ['Acme']],
    ]);
    expect(g[0]!.items[0]).toMatchObject({ module: 'projects', type: 'event', direction: 'in', kind: 'with' });
    expect(g[1]!.items[0]).toMatchObject({ module: 'places', direction: 'out', fromId: karan.id, toId: acme.id });

    expect(linkGroups(os, acme.id).map((x) => x.word)).toEqual(['People here']);
    // Place declares *at* as "Been here"; a Place in a Place reads by direction.
    expect(linkGroups(os, toit.id).map((x) => x.word)).toEqual(['Been here', 'In']);
    expect(linkGroups(os, bengaluru.id).map((x) => x.word)).toEqual(['Contains']);
  });

  it('carries payments signed, and a removed Link comes back the same way round', () => {
    const karan = os.records.create({ object: 'person', title: 'Karan', data: {} });
    const pay = os.records.create({ object: 'transaction', title: 'Dinner split', data: { amount: 900, kind: 'income', date: '2026-10-21' } });
    os.links.link(pay.id, karan.id, 'payee');
    const item = linkGroups(os, karan.id)[0]!.items[0]!;
    expect(item).toMatchObject({ amount: 900, module: 'finance' });
    os.links.remove(item.linkId);
    expect(linkGroups(os, karan.id)).toEqual([]);
    os.links.link(item.fromId, item.toId, item.kind);
    expect(linkGroups(os, pay.id)[0]!.items[0]).toMatchObject({ id: karan.id, direction: 'out' });
  });

  it('lists the most linked records for Browse, mentions and deleted records left out', () => {
    const a = os.records.create({ object: 'person', title: 'Asha', data: {} });
    const b = os.records.create({ object: 'person', title: 'Bilal', data: {} });
    const c = os.records.create({ object: 'place', title: 'Cubbon Park', data: {} });
    const gone = os.records.create({ object: 'place', title: 'Gone', data: {} });
    os.links.link(a.id, b.id, 'knows');
    os.links.link(a.id, c.id, 'at');
    os.links.link(b.id, c.id, 'mention');
    os.links.link(a.id, gone.id, 'at');
    os.records.delete(gone.id);
    expect(mostLinked(os).map((r) => [r.title, r.links])).toEqual([
      ['Asha', 2],
      ['Bilal', 1],
      ['Cubbon Park', 1],
    ]);
  });
});
