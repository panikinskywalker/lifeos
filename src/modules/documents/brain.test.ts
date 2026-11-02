import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { answerNudge, fileNudge, upkeepCandidates } from '@core/brain';
import { crmModule } from '../crm';
import { travelModule } from '../travel';
import { assetsModule } from '../assets';
import { documentsBrain, documentsModule, newFiles, FOLDERS_ROUTE } from '.';

/** What Documents brings the brain (layer 8, slice 6): expiring, and new files not looked at. */

const DAY = 86_400_000;
const NOW = Date.now();
const day = (n: number) => {
  const d = new Date(NOW + n * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, travelModule, assetsModule, documentsModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const doc = (title: string, kind: string, expiresOn?: string, status = 'filed') => os.records.create({ object: 'document', title, status, data: { kind, expiresOn, number: 'Z1234567' } });

describe('Documents’ candidates', () => {
  it('expiring inside its notice (180 days for an ID, 30 else), in months while far; never the number', () => {
    doc('Passport', 'id', day(100));
    doc('Car insurance', 'insurance', day(12));
    doc('Lease', 'contract', day(60)); // outside 30 days
    const c = documentsBrain.candidates(os, NOW);
    expect(c.map((x) => [x.title, x.kind, x.shape, x.yes, !!x.urgent])).toEqual([
      ['Car insurance', 'going off', 'ask', 'Renewed', false],
      ['Passport', 'going off', 'ask', 'Renewed', false],
    ]);
    expect(c[0]!.line).toMatch(/^Car insurance: expires \d+ \w{3}( \d{4})?, in 12 days$/);
    expect(c[1]!.line).toMatch(/, in 3 months$/);
    expect(c[1]!.record).toEqual({ title: 'Passport', kind: 'ID / Passport', expires: day(100), days_left: 100 });
    expect(JSON.stringify(c)).not.toContain('Z1234567');
    expect(upkeepCandidates(os, NOW)).toEqual([]);
  });

  it('urgent when expired, or an ID inside a week; Renewed opens it for the new date', () => {
    doc('PUC', 'certificate', day(-3));
    doc('Aadhaar', 'id', day(5));
    const c = documentsBrain.candidates(os, NOW);
    expect(c.map((x) => [x.title, x.urgent])).toEqual([['PUC', true], ['Aadhaar', true]]);
    expect(c[0]!.line).toMatch(/^PUC: expired on \d+ \w{3}/);
    const n = fileNudge(os, 'documents', c[1]!, { passId: 'p', line: c[1]!.line, at: NOW });
    expect(answerNudge(os, n.id, 'yes')).toEqual({ open: `/entity/document/${c[1]!.subjectId}` });
  });

  it('new files a day after they were found, still new: one nudge for the lot, Look opens Your folders', () => {
    for (const t of ['Lease 2026', 'Payslip Oct', 'Scan 0042', 'Rent receipt']) doc(t, 'other', undefined, 'new');
    doc('Filed one', 'tax');
    expect(newFiles(os, NOW)).toEqual([]);
    const [c] = newFiles(os, NOW + DAY + 1000);
    expect(c).toMatchObject({ kind: 'coming up', shape: 'ask', route: FOLDERS_ROUTE, yes: 'Look', title: '4 new files' });
    expect(c!.line).toMatch(/^4 new files in your folders: [^,]+, [^,]+, [^,]+ and 1 more$/);
    expect(c!.record).toMatchObject({ new_files: 4, kinds: ['Other'] });
    const n = fileNudge(os, 'documents', c!, { passId: 'p', line: c!.line, at: NOW });
    expect(answerNudge(os, n.id, 'yes')).toEqual({ open: FOLDERS_ROUTE });
    // A new file joins: a new key, so it can come again.
    doc('Another', 'other', undefined, 'new');
    expect(newFiles(os, NOW + 2 * DAY)[0]!.key).not.toBe(c!.key);
  });
});
