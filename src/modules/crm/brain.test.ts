import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { answerNudge, runPass, type BrainModel } from '@core/brain';
import { birthdayIso, crmBrain, crmModule, giftIdeasKey, wishKey, type PersonData } from '.';

/** People's candidates for the brain: keep in touch, birthdays, and the gift ideas and wish that fill the board's slots. */

const DAY = 86_400_000;
const NOW = Date.now();
const iso = (at: number) => new Date(at - new Date(at).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const inDays = (n: number) => {
  const d = new Date(NOW + n * DAY);
  return birthdayIso(d.getMonth() + 1, d.getDate(), 1996);
};
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const person = (title: string, data: Partial<PersonData> = {}) => os.records.create<PersonData>({ object: 'person', title, data });

describe('People’s candidates', () => {
  it('keep in touch: due or late, how long since you spoke; never their number', () => {
    person('Dad Sharma', { relationship: 'family', contactEvery: '7', lastContactAt: iso(NOW - 10 * DAY), phone: '+91 98200 00001' });
    person('Fresh Friend', { contactEvery: '30', lastContactAt: iso(NOW - 2 * DAY) });
    const c = crmBrain.candidates(os, NOW);
    expect(c.map((x) => [x.title, x.kind, x.shape, x.line, x.yes])).toEqual([['Dad Sharma', 'due', 'ask', 'Dad: 10 days since you spoke', 'Call']]);
    expect(JSON.stringify(c[0]!.record)).not.toContain('98200');
  });

  it('birthdays within a week: today is urgent, with the age and their likes', () => {
    person('Karan Shah', { birthday: inDays(0), likes: 'filter coffee, RCB', phone: '+919820000003' });
    person('Priya Rao', { birthday: inDays(5) });
    person('Far Off', { birthday: inDays(30) });
    const c = crmBrain.candidates(os, NOW).filter((x) => x.kind === 'coming up').sort((a, b) => a.rank! - b.rank!);
    expect(c.map((x) => [x.title, x.line, !!x.urgent, x.yes])).toEqual([
      ['Karan Shah', 'Karan’s birthday today: turns 30', true, 'Send wish'],
      ['Priya Rao', 'Priya’s birthday in 5 days: turns 30', false, 'Open'],
    ]);
    expect(c[0]!.record).toMatchObject({ likes: ['filter coffee', 'RCB'], turns: 30 });
  });

  it('asks: gift ideas from their likes (new likes, new key), the wish only on the day or the day before', () => {
    const k = person('Karan Shah', { birthday: inDays(1), likes: 'filter coffee, RCB' });
    person('Priya Rao', { birthday: inDays(10), likes: 'pottery' });
    person('No Likes', { birthday: inDays(3) });
    const asks = crmBrain.asks!(os, NOW).sort((a, b) => a.slot.localeCompare(b.slot));
    expect(asks.map((a) => [a.slot, !!a.list, !!a.brief])).toEqual([
      ['gift ideas for Karan', true, false],
      ['gift ideas for Priya', true, false],
      ['wish for Karan', false, false],
    ]);
    expect(asks[0]!.key).toBe(giftIdeasKey(k));
    expect(asks[2]!.key).toBe(wishKey(k, NOW));
    const before = giftIdeasKey(k);
    os.records.update<PersonData>(k.id, { data: { likes: 'filter coffee, RCB, pottery' } });
    expect(giftIdeasKey(os.records.get<PersonData>(k.id)!)).not.toBe(before);
  });

  it('a pass fills the slots the board reads, and Yes opens WhatsApp with the wish', async () => {
    const k = person('Karan Shah', { birthday: inDays(0), likes: 'filter coffee', phone: '+91 98200 00003' });
    const model: BrainModel = {
      id: 'claude',
      model: 'claude-opus-5-5',
      complete: async ({ user }) => {
        const u = JSON.parse(user);
        return {
          text: JSON.stringify({
            nudges: u.nudges.map((n: { id: string }) => ({ id: n.id, keep: true, line: 'Karan turns 30 today' })),
            fills: u.asks.map((a: { id: string; list: boolean }) => (a.list ? { id: a.id, text: '', items: ['A Hario V60', 'Blue Tokai beans'] } : { id: a.id, text: 'Happy 30th, Karan!', items: [] })),
            remember: [],
            skills: [],
          }),
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        };
      },
    };
    const r = await runPass(os, { pass: 'morning', model, now: NOW });
    expect(os.brain.learned.get(giftIdeasKey(k)!)).toEqual(['A Hario V60', 'Blue Tokai beans']);
    expect(os.brain.learned.get(wishKey(k, NOW)!)).toBe('Happy 30th, Karan!');
    const n = r.filed.find((x) => x.kind === 'coming up')!;
    expect(answerNudge(os, n.id, 'yes')).toEqual({ open: `https://wa.me/919820000003?text=${encodeURIComponent('Happy 30th, Karan!')}` });
  });
});
