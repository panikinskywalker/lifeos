import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from './db/betterSqliteAdapter';
import { createLifeOS } from './lifeos';
import { Registry } from './registry/registry';
import type { LifeOSContext } from './registry/context';
import { bus } from './events/bus';
import { egoGraph, linkGroups, mostLinked } from './graph/read';
import { addLink, changeLinkWord, linkInfo, removeLink } from './links';
import { orgType, placeType } from '../modules/places/types';
import { personType } from '../modules/crm/types';
import { eventType, projectType, taskType } from '../modules/projects/types';
import { accountType, transactionType } from '../modules/finance/types';
import { habitLogType, habitType } from '../modules/habits/types';
import { appearanceObject, gameObject, playerProfileObject, venueObject } from '../modules/games/types';
import { debtType } from '../modules/finance/types';

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
      { id: 'finance', name: 'finance', version: '1', description: '', icon: 'x', color: '#000', objects: [transactionType, accountType, debtType] },
      { id: 'games', name: 'games', version: '1', description: '', icon: 'x', color: '#000', objects: [gameObject, appearanceObject, playerProfileObject, venueObject] },
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
      ['with', ['Lunch', 'Dinner']],
      ['works at', ['Acme']],
    ]);
    expect(g[0]!.items[0]).toMatchObject({ module: 'projects', type: 'event', direction: 'in', kind: 'with' });
    expect(g[1]!.items[0]).toMatchObject({ module: 'places', direction: 'out', fromId: karan.id, toId: acme.id });

    // Person's Works at Field, seen from the Organisation: its People, not "Works at" read backwards.
    expect(linkGroups(os, acme.id).map((x) => x.word)).toEqual(['people']);
    // Place declares *at* as "Been here"; a Place in a Place reads by direction.
    expect(linkGroups(os, toit.id).map((x) => x.word)).toEqual(['been here', 'in']);
    expect(linkGroups(os, bengaluru.id).map((x) => x.word)).toEqual(['contains']);
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
      ['transactions', ['Nike', 'Toit']],
      ['transfers in', ['Card payment']],
    ]);
    expect(linkGroups(os, pay.id).map((g) => g.word)).toEqual(['account', 'to account']);
    // A record that joins things up says what else it points at.
    expect(linkGroups(os, amex.id)[1]!.items[0]!.context).toBe('HDFC');
    const ship = os.records.create({ object: 'project', title: 'Ship LifeOS', data: {} });
    os.records.create({ object: 'task', title: 'Test on Android', data: { projectId: ship.id } });
    expect(linkGroups(os, ship.id).map((g) => g.word)).toEqual(['tasks']);
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
    expect(linkGroups(os, priya.id).map((g) => g.word)).toEqual(['with']);
    undoAdd();
    expect(linkGroups(os, priya.id)).toEqual([]);
    // A word no Field has is a plain Link.
    addLink(os, task.id, priya.id, 'gift for');
    expect(linkGroups(os, task.id).find((g) => g.word === 'gift for')?.items[0]?.title).toBe('Priya');
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

  it('shows one thing once: a game is not also each Appearance and the Debt for a share; a Venue is its Place, a Player profile its Person', () => {
    const priya = os.records.create({ object: 'person', title: 'Priya', data: {} });
    const karan = os.records.create({ object: 'person', title: 'Karan', data: {} });
    const arena = os.records.create({ object: 'place', title: 'Playground Arena', data: {} });
    const venue = os.records.create({ object: 'venue', title: 'Playground Arena', data: { name: 'Playground Arena', placeId: arena.id } });
    os.records.create({ object: 'player', title: 'Priya', data: { personId: priya.id, name: 'Priya' } });
    const game = os.records.create({ object: 'game', title: 'Sat, 17 Oct · Playground Arena', data: { date: '2026-10-17', totalCost: 1800, venueId: venue.id, captainBId: priya.id } });
    const ap = os.records.create({ object: 'appearance', title: 'Game on Sat, 17 Oct', data: { gameId: game.id, personId: priya.id, gameDate: '2026-10-17' } });
    os.records.create({ object: 'appearance', title: 'Game on Sat, 17 Oct', data: { gameId: game.id, personId: karan.id, gameDate: '2026-10-17' } });
    const debt = os.records.create({ object: 'debt', title: 'Turf · Playground Arena · 2026-10-17', data: { personId: priya.id, direction: 'they_owe', amount: 450, date: '2026-10-17', kind: 'split' } });
    os.links.link(debt.id, ap.id, 'for');

    const words = (id: string) => linkGroups(os, id).map((g) => [g.word, g.items.map((i) => i.title)]);
    expect(words(priya.id)).toEqual([
      ['captain of', ['Sat, 17 Oct · Playground Arena']],
      ['played in', ['Sat, 17 Oct · Playground Arena']],
    ]);
    const played = linkGroups(os, priya.id).find((g) => g.word === 'played in')!.items[0]!;
    expect(played).toMatchObject({ removable: false, via: { id: ap.id, type: 'appearance' } });
    expect(played.context).toContain('Owes you ₹450'); // the Debt folded into her share
    // What you owe Priya for Karan's share (she fronted) folds into her row for that game too.
    const kap = linkGroups(os, game.id)[0]!.items.find((i) => i.title === 'Karan')!.via!;
    const owe = os.records.create({ object: 'debt', title: 'Turf · Playground Arena · 2026-10-17', data: { personId: priya.id, direction: 'i_owe', amount: 450, date: '2026-10-17', kind: 'split' } });
    os.links.link(owe.id, kap.id, 'for');
    expect(linkGroups(os, priya.id).map((g) => g.word)).toEqual(['captain of', 'played in']);
    expect(linkGroups(os, priya.id).find((g) => g.word === 'played in')!.items[0]!.context).toContain('You owe ₹450');
    expect(words(game.id)).toEqual([
      ['players', ['Karan', 'Priya']],
      ['captain', ['Priya']],
      ['venue', ['Playground Arena']],
    ]);
    expect(linkGroups(os, game.id).find((g) => g.word === 'venue')!.items[0]).toMatchObject({ type: 'place', removable: true, via: { id: venue.id } });
    expect(words(arena.id)).toEqual([['games', ['Sat, 17 Oct · Playground Arena']]]);

    const g = egoGraph(os, priya.id);
    expect(g.nodes.map((n) => `${n.hop}:${n.title}`).sort()).toEqual(['0:Priya', '1:Sat, 17 Oct · Playground Arena', '2:Karan', '2:Playground Arena']);
    expect(g.nodes.find((n) => n.title === 'Playground Arena')!.type).toBe('place');
    expect(g.edges.find((e) => [e.from, e.to].sort().join() === [priya.id, game.id].sort().join())!.word).toBe('played in');
    expect(mostLinked(os).map((r) => r.type)).not.toContain('appearance');
    expect(mostLinked(os).map((r) => r.type)).not.toContain('venue');
    expect(mostLinked(os).map((r) => r.type)).not.toContain('player');
  });

  it('says where a link came from, changes its word keeping that, and keeps a since date (L3, L5)', () => {
    const karan = os.records.create({ object: 'person', title: 'Karan', data: {} });
    const gym = os.records.create({ object: 'place', title: 'Cult Gym', data: {} });
    const d = os.dumps.add({ body: 'made a new friend today, Karan, met at the gym' });
    const l = os.links.link(karan.id, gym.id, 'at', {}, 'assistant', { source: 'dump', sourceId: d.id, confidence: 0.6 });
    expect(linkInfo(os, l.id)).toMatchObject({ confidence: 0.6, field: null, origin: { by: 'dump', quote: 'made a new friend today, Karan, met at the gym' } });
    const undo = changeLinkWord(os, l.id, 'knows');
    const now = os.links.forEntity(karan.id)[0]!.relation;
    expect(now).toMatchObject({ kind: 'knows', source: 'dump', sourceId: d.id, confidence: 0.6 });
    undo();
    expect(os.links.forEntity(karan.id).map((x) => x.relation.kind)).toEqual(['at']);

    const ship = os.records.create({ object: 'project', title: 'Ship', data: {} });
    const task = os.records.create({ object: 'task', title: 'Test', data: { projectId: ship.id } });
    const made = os.links.forEntity(task.id).find((x) => x.relation.kind === 'project')!.relation;
    expect(linkInfo(os, made.id)).toMatchObject({ field: 'Project', origin: { by: 'field' } });

    const since = Date.parse('2025-03-14T00:00:00');
    addLink(os, karan.id, ship.id, 'works_with', 'user', since);
    const hand = os.links.forEntity(karan.id).find((x) => x.relation.kind === 'works_with')!.relation;
    expect(linkInfo(os, hand.id)).toMatchObject({ since, confidence: 1, origin: { by: 'you' } });
  });
});
