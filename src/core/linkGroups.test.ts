import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from './db/betterSqliteAdapter';
import { createLifeOS } from './lifeos';
import { Registry } from './registry/registry';
import type { LifeOSContext } from './registry/context';
import { bus } from './events/bus';
import { egoGraph, linkGroups, mostLinked } from './graph/read';
import { addLink, removeLink } from './links';
import { orgType, placeType } from '../modules/places/types';
import { personType } from '../modules/crm/types';
import { eventType, projectType, taskType } from '../modules/projects/types';
import { accountType, transactionType } from '../modules/finance/types';
import { habitLogType, habitType } from '../modules/habits/types';

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({
    db: createBetterSqliteAdapter(':memory:'),
    modules: [
      { id: 'crm', name: 'crm', version: '1', description: '', icon: 'x', color: '#000', objects: [personType] },
      { id: 'places', name: 'places', version: '1', description: '', icon: 'x', color: '#000', objects: [placeType, orgType] },
      { id: 'projects', name: 'projects', version: '1', description: '', icon: 'x', color: '#000', objects: [eventType, projectType, taskType] },
      { id: 'habits', name: 'habits', version: '1', description: '', icon: 'x', color: '#000', objects: [habitType, habitLogType] },
      { id: 'finance', name: 'finance', version: '1', description: '', icon: 'x', color: '#000', objects: [transactionType, accountType] },
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

    // Person's Works at Field, seen from the Organisation: its People, not "Works at" read backwards.
    expect(linkGroups(os, acme.id).map((x) => x.word)).toEqual(['People']);
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

  it('reads Field Links by the Field from the holder and by the Object from the target, naming Fields when one Object uses several', () => {
    const amex = os.records.create({ object: 'account', title: 'Amex', data: { kind: 'credit' } });
    const hdfc = os.records.create({ object: 'account', title: 'HDFC', data: { kind: 'bank' } });
    const toit = os.records.create({ object: 'transaction', title: 'Toit', data: { amount: 2600, kind: 'expense', date: '2026-10-27', accountId: amex.id } });
    const nike = os.records.create({ object: 'transaction', title: 'Nike', data: { amount: 15000, kind: 'expense', date: '2026-10-28', accountId: amex.id } });
    const pay = os.records.create({ object: 'transaction', title: 'Card payment', data: { amount: 50000, kind: 'transfer', date: '2026-10-30', accountId: hdfc.id, toAccountId: amex.id } });
    expect(linkGroups(os, amex.id).map((g) => [g.word, g.items.map((i) => i.title)])).toEqual([
      ['Transactions', ['Nike', 'Toit']],
      ['Transactions · to account', ['Card payment']],
    ]);
    expect(linkGroups(os, pay.id).map((g) => g.word)).toEqual(['Account', 'To account (transfers)']);
    // A record that joins things up says what else it points at.
    expect(linkGroups(os, amex.id)[1]!.items[0]!.context).toBe('HDFC');
    const ship = os.records.create({ object: 'project', title: 'Ship LifeOS', data: {} });
    os.records.create({ object: 'task', title: 'Test on Android', data: { projectId: ship.id } });
    expect(linkGroups(os, ship.id).map((g) => g.word)).toEqual(['Tasks']);
    void nike; void toit;
  });

  it('removing or adding a Field Link changes the Field, so it does not come back on the next edit', () => {
    const ship = os.records.create({ object: 'project', title: 'Ship LifeOS', data: {} });
    const task = os.records.create({ object: 'task', title: 'Test on Android', data: { projectId: ship.id } });
    const item = linkGroups(os, ship.id)[0]!.items[0]!;
    const undo = removeLink(os, item);
    expect((os.records.get(task.id)!.data as { projectId?: string }).projectId).toBeUndefined();
    os.records.update(task.id, { title: 'Test on the S22' });
    expect(linkGroups(os, ship.id)).toEqual([]);
    undo();
    expect(linkGroups(os, ship.id)[0]!.items.map((i) => i.title)).toEqual(['Test on the S22']);

    const priya = os.records.create({ object: 'person', title: 'Priya', data: {} });
    const undoAdd = addLink(os, task.id, priya.id, 'person');
    expect((os.records.get(task.id)!.data as { personIds?: string[] }).personIds).toEqual([priya.id]);
    expect(linkGroups(os, priya.id).map((g) => g.word)).toEqual(['Tasks']);
    undoAdd();
    expect(linkGroups(os, priya.id)).toEqual([]);
    // A word no Field has is a plain Link.
    addLink(os, task.id, priya.id, 'gift for');
    expect(linkGroups(os, task.id).find((g) => g.word === 'Gift for')?.items[0]?.title).toBe('Priya');
  });

  it('keeps hidden Objects out of the network and Most linked, and ranks by breadth', () => {
    const run = os.records.create({ object: 'habit', title: 'Morning run', data: {} });
    for (let d = 1; d <= 12; d++) os.records.create({ object: 'habit_log', title: `Check-in ${d}`, data: { habitId: run.id, date: `2026-10-${String(d).padStart(2, '0')}` } });
    const amex = os.records.create({ object: 'account', title: 'Amex', data: { kind: 'credit' } });
    for (let n = 1; n <= 9; n++) os.records.create({ object: 'transaction', title: `Spend ${n}`, data: { amount: n, kind: 'expense', date: '2026-10-01', accountId: amex.id } });
    const priya = os.records.create({ object: 'person', title: 'Priya', data: {} });
    const acme = os.records.create({ object: 'org', title: 'Acme', data: {} });
    const pune = os.records.create({ object: 'place', title: 'Pune', data: {} });
    os.records.update(priya.id, { data: { worksAtId: acme.id, livesInId: pune.id } });
    const proj = os.records.create({ object: 'project', title: 'Ship', data: {} });
    for (const t of ['A', 'B', 'C', 'D']) os.records.create({ object: 'task', title: t, data: { personIds: [priya.id], projectId: proj.id } });
    os.records.create({ object: 'event', title: 'Dinner', data: { personIds: [priya.id], startAt: Date.parse('2026-10-20T20:00:00') } });
    os.records.create({ object: 'transaction', title: 'Lunch', data: { amount: 400, kind: 'expense', date: '2026-10-02', personIds: [priya.id] } });

    const top = mostLinked(os, 3);
    expect(top[0]).toMatchObject({ title: 'Priya', links: 8, modules: 3 }) // places (Acme, Pune), projects, finance;
    expect(top.map((r) => r.title)).not.toContain('Morning run');
    // Amex has more links (9) but all payments, so breadth 5; Priya's 8 reach five kinds of record.
    expect(top.map((r) => r.title).slice(0, 2)).toEqual(['Priya', 'Amex']);
    // The habit's check-ins stay off its network (its card lists them, last); a check-in as the centre still shows its habit.
    expect(egoGraph(os, run.id).nodes).toHaveLength(1);
    expect(linkGroups(os, run.id).at(-1)!.items.every((i) => i.hidden)).toBe(true);
    const log = linkGroups(os, run.id).at(-1)!.items[0]!;
    expect(egoGraph(os, log.id).nodes.map((n) => n.title)).toEqual([log.title, 'Morning run']);
    expect(egoGraph(os, proj.id, { hops: 1 }).edges.map((e) => e.word)).toEqual(['task', 'task', 'task', 'task']);

    // Ring two: Priya first (she shares all four tasks with the Project), at most four of one Object.
    const g = egoGraph(os, proj.id);
    expect(g.nodes.filter((n) => n.hop === 2)[0]!.title).toBe('Priya');
    expect(g.nodes.filter((n) => n.hop === 2 && n.type === 'transaction').length).toBeLessThanOrEqual(4);
  });
});
