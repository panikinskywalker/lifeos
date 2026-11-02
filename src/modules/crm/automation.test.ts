import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule, type PersonData } from '.';
import { dueToContact } from './automation';

/** The Contact nudge template (R10): who's due, Continue only if, Ask Claude with its fallback, notify. */

const DAY = 86_400_000;
const iso = (at: number) => new Date(at - new Date(at).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
let os: LifeOSContext;
let sent: Array<{ title: string; body?: string }>;
beforeEach(async () => {
  bus.clear();
  sent = [];
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule], registry: new Registry(), notify: async (n) => (sent.push({ title: n.title, body: n.body }), null) });
});
afterEach(() => os.db.close());

const fromTemplate = () => {
  const t = os.automation.templates().find((x) => x.id === 'crm.contactNudge')!;
  return os.automation.rules.save({ name: t.name, enabled: true, trigger: { id: 'core.manual', config: {} }, conditions: t.conditions, steps: t.steps });
};

describe('Contact nudge', () => {
  it('drafts a line for the longest overdue person, in the fallback words without a key', async () => {
    os.records.create<PersonData>({ object: 'person', title: 'Kunal Mehta', data: { contactEvery: '7', lastContactAt: iso(Date.now() - 20 * DAY) } });
    os.records.create<PersonData>({ object: 'person', title: 'Dad Sharma', data: { contactEvery: '7', lastContactAt: iso(Date.now() - 9 * DAY) } });
    expect(dueToContact(os).map((d) => d.person.title)).toEqual(['Kunal Mehta', 'Dad Sharma']);
    const run = await os.automation.runManual(fromTemplate());
    expect(run.status).toBe('ok');
    expect(run.steps.map((s) => s.status)).toEqual(['done', 'done', 'done', 'done']);
    expect(sent).toEqual([{ title: 'Catch up with Kunal', body: 'Hey Kunal, it’s been a while! How are you?' }]);
  });

  it('with Claude, sends the name and the days only, and uses its line', async () => {
    const asked: string[] = [];
    os.automation.modelProvider = async () => ({ id: 'claude', model: 'claude-haiku-5-5', complete: async ({ user }) => (asked.push(user), { text: 'Kunal! Long time, still on for chai?', usage: { input: 40, output: 12, cacheRead: 0, cacheWrite: 0 } }) });
    os.records.create<PersonData>({ object: 'person', title: 'Kunal Mehta', data: { contactEvery: '7', lastContactAt: iso(Date.now() - 20 * DAY), phone: '+91 98200 00001' } });
    await os.automation.runManual(fromTemplate());
    expect(asked[0]).toMatch(/to Kunal, whom I last spoke to 20 days ago/);
    expect(asked[0]).not.toMatch(/98200/);
    expect(sent[0]!.body).toBe('Kunal! Long time, still on for chai?');
  });

  it('no one due: the run stops quietly, nothing sent', async () => {
    const run = await os.automation.runManual(fromTemplate());
    expect(run.steps.map((s) => s.status)).toEqual(['done', 'stopped']);
    expect(sent).toHaveLength(0);
  });
});
