import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { answerNudge, runPass, type Nudge } from '@core/brain';
import { personType, groupType } from '@modules/crm/types';
import { placeType } from '@modules/places/types';
import { accountType, transactionType, debtType } from '@modules/finance/types';
import { gamesModule, gamesBrain, applyTurfSync, turfDues, type TurfSyncPage } from './index';
import { sampleSync } from './fixtures/sampleSync';

/** Turf's candidates for the brain: a match short of players, dues outstanding. */

const modules: ModuleManifest[] = [
  { id: 'crm', name: 'People', version: '1', description: '', icon: 'x', color: '#000', objects: [personType, groupType] },
  { id: 'places', name: 'Places', version: '1', description: '', icon: 'x', color: '#000', objects: [placeType] },
  { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', objects: [accountType, transactionType, debtType] },
  gamesModule,
];
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules, registry: new Registry() });
  applyTurfSync(os, JSON.parse(JSON.stringify(sampleSync)) as TurfSyncPage);
});
afterEach(() => os.db.close());

const at = (s: string) => Date.parse(s);

describe('Turf’s candidates', () => {
  it('a match tomorrow short of players is urgent and opens the match; further out it is a heads-up; past ones are not offered', () => {
    const tomorrow = gamesBrain.candidates(os, at('2026-10-23T12:00:00+05:30')).filter((c) => c.key.startsWith('games:short'));
    expect(tomorrow.map((c) => [c.line, c.urgent, c.kind, c.shape])).toEqual([['Tomorrow at Playground Arena: 1 in of 12, 11 short', true, 'coming up', 'ask']]);
    expect(tomorrow[0]!.route).toMatch(/^\/board\/turf\/game\?game=/);
    expect(tomorrow[0]!.record).toEqual({ venue: 'Playground Arena', date: '2026-10-24', kick_off: '20:00', in: 1, expected: 12, short_by: 11 });
    const ahead = gamesBrain.candidates(os, at('2026-10-21T12:00:00+05:30')).filter((c) => c.key.startsWith('games:short'));
    expect(ahead.map((c) => c.urgent)).toEqual([false]);
    expect(ahead[0]!.key).not.toBe(tomorrow[0]!.key);
    expect(gamesBrain.candidates(os, at('2026-10-18T12:00:00+05:30')).filter((c) => c.key.startsWith('games:short'))).toEqual([]);
    expect(gamesBrain.candidates(os, at('2026-10-25T12:00:00+05:30')).filter((c) => c.key.startsWith('games:short'))).toEqual([]);
  });

  it('dues owed to you for more than three days, as Turf web counts them; Yes opens WhatsApp with Turf’s reminder', async () => {
    const now = at('2026-10-25T12:00:00+05:30');
    const owed = turfDues(os, new Date(now)).people.filter((p) => p.direction === 'owes_you');
    const dues = gamesBrain.candidates(os, now).filter((c) => c.kind === 'due');
    expect(dues.map((c) => c.title).sort()).toEqual(owed.map((p) => p.name).sort());
    expect(dues.every((c) => c.shape === 'ask' && c.yes === 'Remind' && !('phone' in c.record))).toBe(true);
    const r = await runPass(os, { pass: 'morning', model: null, now });
    const n = r.filed.find((x: Nudge) => x.kind === 'due')!;
    const out = answerNudge(os, n.id, 'yes');
    expect(out!.open).toMatch(/^(https:\/\/wa\.me\/\d+\?text=|\/board\/turf\/dues$)/);
  });
});
