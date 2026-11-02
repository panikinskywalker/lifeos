import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { answerNudge, fileNudge, upkeepCandidates } from '@core/brain';
import { crmModule } from '../crm';
import { placesModule } from '../places';
import { financeModule } from '../finance';
import { inventoryModule } from '../inventory';
import { assetCandidates, assetsModule, type AssetData } from '.';

/** What Assets brings the brain (layer 8, slice 6): warranty ending, service due, its other Cycles. */

const DAY = 86_400_000;
const NOW = Date.now();
const day = (n: number) => {
  const d = new Date(NOW + n * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, placesModule, financeModule, inventoryModule, assetsModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const asset = (title: string, data: Partial<AssetData>) => os.records.create<AssetData>({ object: 'asset', title, data: data as AssetData, status: 'owned' });

describe('Assets’ candidates', () => {
  it('warranty ending is a heads-up; service by date or km is shall I? Serviced; never the plate', () => {
    asset('MacBook Air', { category: 'device', warrantyUntil: day(20) });
    asset('Daikin AC', { category: 'appliance', serviceEveryMonths: 6, nextServiceDate: day(5) });
    asset('Hyundai Creta', { category: 'vehicle', plate: 'KA 05 MZ 1234', odometerKm: 30_200, nextServiceKm: 30_000 });
    asset('Kettle', { category: 'appliance', warrantyUntil: day(200) });
    const c = assetCandidates(os, NOW);
    const by = Object.fromEntries(c.map((x) => [x.title, x]));
    expect(Object.keys(by).sort()).toEqual(['Daikin AC', 'Hyundai Creta', 'MacBook Air']);
    expect(by['MacBook Air']).toMatchObject({ kind: 'going off', shape: 'check', yes: 'Right', urgent: false });
    expect(by['MacBook Air']!.line).toMatch(/^MacBook Air: warranty ends in 20 days, on \d+ \w{3}( \d{4})?$/);
    expect(by['Daikin AC']).toMatchObject({ kind: 'due', shape: 'ask', yes: 'Serviced', line: 'Daikin AC: service due in 5 days' });
    expect(by['Hyundai Creta']).toMatchObject({ yes: 'Serviced', urgent: true, line: 'Hyundai Creta: service 200 km overdue' });
    expect(by['Hyundai Creta']!.record).toMatchObject({ thing: 'Hyundai Creta', category: 'vehicle', km_left: -200 });
    expect(JSON.stringify(c)).not.toContain('KA 05');
    expect(c.map((x) => x.line).join('\n')).not.toMatch(/[\u2014\u2013]/);
    expect(upkeepCandidates(os, NOW)).toEqual([]);
  });

  it('Serviced logs it done; a warranty heads-up changes nothing', () => {
    const ac = asset('Daikin AC', { category: 'appliance', serviceEveryMonths: 6, nextServiceDate: day(-2) });
    const mac = asset('MacBook Air', { category: 'device', warrantyUntil: day(3) });
    for (const c of assetCandidates(os, NOW)) answerNudge(os, fileNudge(os, 'assets', c, { passId: 'p', line: c.line, at: NOW }).id, 'yes');
    expect(os.cycles.forEntity(ac.id).find((x) => x.template === 'asset.service')!.lastDoneAt).not.toBeNull();
    expect(os.cycles.forEntity(mac.id).find((x) => x.template === 'asset.warranty')!.lastDoneAt).toBeNull();
  });

  it('any other Cycle on an Asset (insurance) comes as Upkeep words it, now from Assets', () => {
    const car = asset('Hyundai Creta', { category: 'vehicle' });
    os.cycles.create({ entityId: car.id, name: 'Insurance', kind: 'fixed', nextDueAt: NOW + 3 * DAY, leadDays: 14 });
    const c = assetCandidates(os, NOW);
    expect(c.map((x) => [x.title, x.yes, x.record.cycle, x.record.category])).toEqual([['Hyundai Creta', 'Done', 'Insurance', 'vehicle']]);
    expect(c[0]!.line).toMatch(/^Hyundai Creta: insurance due in 3 days$/);
  });
});
