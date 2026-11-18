import { describe, expect, it } from 'vitest';
import { urgentWhen } from './brief';

describe('the word beside an urgent line', () => {
  it('is read from the line, late first', () => {
    expect(urgentWhen('Laundry is 1 day late')).toBe('Late');
    expect(urgentWhen('Water filter overdue, due tomorrow')).toBe('Late');
    expect(urgentWhen('Leftover dal: bought yesterday, use by tomorrow')).toBe('Tomorrow');
    expect(urgentWhen('Priya’s birthday today: turns 32')).toBe('Today');
    expect(urgentWhen('Philips Trimmer from Amazon is out for delivery: the OTP is on it')).toBe('Today');
    expect(urgentWhen('Car insurance needs a look')).toBe('Soon');
  });
});

describe('what the brief shows (You › Notifications)', () => {
  it('a module switched off leaves the brief on Today and the morning notification, not To check', async () => {
    const { createBetterSqliteAdapter } = await import('../db/betterSqliteAdapter');
    const { createLifeOS } = await import('../lifeos');
    const { Registry } = await import('../registry/registry');
    const { financeModule } = await import('@modules/finance');
    const { runPass } = await import('./index');
    const { brief, setBriefShows } = await import('./brief');
    const { morningBrief } = await import('../notify/plan');
    const os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [financeModule], registry: new Registry() });
    const day = new Date().toISOString().slice(0, 10);
    os.records.create({ object: 'subscription', data: { name: 'Netflix', amount: 649, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2099-01-01', category: 'subscriptions', priceHistory: [{ amount: 499, from: '2026-01-01' }, { amount: 649, from: day }] }, status: 'active' });
    os.records.create({ object: 'transaction', data: { amount: 900, kind: 'expense', category: 'food', date: day } });
    await runPass(os, { pass: 'morning', model: null, why: 'test' });
    expect(brief(os).lines.some((l) => l.module === 'finance')).toBe(true);
    expect(morningBrief(os, Date.now()).body).toMatch(/spent this month/);
    setBriefShows(os, 'finance', false);
    expect(brief(os).lines.some((l) => l.module === 'finance')).toBe(false);
    expect(morningBrief(os, Date.now()).body).not.toMatch(/spent this month/);
    expect(os.brain.nudges.since(0).some((n) => n.module === 'finance')).toBe(true);
    setBriefShows(os, 'finance', true);
    expect(brief(os).lines.some((l) => l.module === 'finance')).toBe(true);
    os.db.close();
  });
});
