import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { financeModule } from '@modules/finance';
import { placesModule } from '@modules/places';
import { comingUp, LINE_KEY, monthlyLine, pace } from './home';

/** Money home at a glance (MODEL layer 5): the pace against your line, and what is coming up before payday. */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [placesModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const NOW = new Date(2026, 10, 21, 12); // Sat 21 Nov 2026: 10 days left, today included
const spend = (amount: number, date: string, extra: Record<string, unknown> = {}) => os.records.create({ object: 'transaction', data: { amount, kind: 'expense', category: 'food', date, ...extra } });

describe('pace', () => {
  it('your usual month is the line until you set one; a day can take what is left over the days left', () => {
    spend(30000, '2026-08-10');
    spend(36000, '2026-09-10');
    spend(30000, '2026-10-10');
    spend(24000, '2026-11-05');
    spend(5000, '2026-11-25'); // after today: not yet spent
    expect(monthlyLine(os, NOW)).toEqual({ amount: 32000, yours: false });
    expect(pace(os, NOW)).toMatchObject({ line: 32000, spent: 24000, left: 8000, daysLeft: 10, perDay: 800, over: false });
    os.settings.set(LINE_KEY, 20000);
    expect(pace(os, NOW)).toMatchObject({ line: 20000, yours: true, left: -4000, perDay: 0, over: true });
  });
  it('nothing to go by, no pace', () => {
    expect(pace(os, NOW)).toBeNull();
  });
});

describe('coming up before payday', () => {
  it('card bills (late ones first), renewals and SIPs up to payday, soonest first', () => {
    os.records.create({ object: 'transaction', data: { amount: 125000, kind: 'income', category: 'salary', date: '2026-11-01' } });
    os.records.create({ object: 'account', title: 'ICICI card', data: { kind: 'credit', openingBalance: 0, statement: { total: 26046.5, dueOn: '2026-11-18', at: 0 } } });
    os.records.create({ object: 'account', title: 'Axis card', data: { kind: 'credit', openingBalance: 0, statement: { total: 12494.57, dueOn: '2026-11-27', at: 0 } } });
    os.records.create({ object: 'subscription', data: { name: 'Netflix', amount: 649, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-11-24' }, status: 'active' });
    os.records.create({ object: 'subscription', data: { name: 'Cult.fit', amount: 14000, rrule: 'FREQ=YEARLY;INTERVAL=1', nextBillingAt: '2027-04-02' }, status: 'active' });
    os.records.create({ object: 'investment', title: 'Flexi Cap', data: { instrument: 'mutual_fund', invested: 0, sip: 5000, sipDay: 28 }, status: 'active' });
    const c = comingUp(os, NOW);
    expect(c.payday).toBe('2026-12-01');
    expect(c.items.map((i) => [i.title, i.due, i.late])).toEqual([
      ['ICICI card bill', '2026-11-18', true],
      ['Netflix', '2026-11-24', false],
      ['Axis card bill', '2026-11-27', false],
      ['Flexi Cap SIP', '2026-11-28', false],
    ]);
  });
});
