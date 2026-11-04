import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectDef } from '@core/domain/types';
import { bus } from '@core/events/bus';
import { dateField } from '@core/cycles/schedule';
import { fieldShown } from '@core/domain/fields';
import { logDone, upkeep } from '@core/cycles/upkeep';
import { clearMatch, resolveCandidates } from '@core/ai/lifeTools';
import { crmModule } from '../crm';
import { placesModule } from '../places';
import { financeModule } from '../finance';
import { inventoryModule, spaceNamed } from '../inventory';
import { assetType, assetsAiTools, assetsModule, clothes, clothesByState, dueForService, foldClothes, foldVehicles, nextClothesState, services, setClothesState, underWarranty, type AssetData } from '.';

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
let os: LifeOSContext;

beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, placesModule, financeModule, inventoryModule, assetsModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const tool = (name: string) => assetsAiTools.find((t) => t.name === name)!;
const asset = (title: string, data: Partial<AssetData>, status = 'owned') => os.records.create<AssetData>({ object: 'asset', title, data: data as AssetData, status });
const clothesSpace = () => spaceNamed(os, 'Clothes')!;

/** The retired Object as it was shipped, enough to make old records. */
const oldVehicle: ObjectDef = {
  id: 'vehicle', module: 'assets', label: 'Vehicle', labelPlural: 'Vehicles', icon: 'car',
  schema: z.object({ make: z.string(), model: z.string().optional(), year: z.coerce.number().optional(), plate: z.string().optional(), odometerKm: z.coerce.number().optional(), insuranceUntil: z.string().optional(), nextServiceKm: z.coerce.number().optional() }),
  fields: [{ key: 'make', label: 'Make', type: 'text' }],
  computeTitle: (d) => [d.year, d.make, d.model].filter(Boolean).join(' '),
  meters: [{ meter: 'odometer', field: 'odometerKm', label: 'Odometer', unit: 'km' }],
  cycleTemplates: (d) => [
    { template: 'vehicle.service', name: 'Service', kind: 'either', everyN: 6, everyUnit: 'month', meterEvery: 10000, nextDueMeter: (d.nextServiceKm as number) ?? null, leadDays: 14 },
    ...(dateField(d.insuranceUntil) ? [{ template: 'vehicle.insurance', name: 'Insurance renewal', kind: 'fixed' as const, everyN: 1, everyUnit: 'year' as const, nextDueAt: dateField(d.insuranceUntil), leadDays: 30 }] : []),
  ],
};

describe('the R7a fold', () => {
  it('a vehicle becomes an Asset in place: readings, service cycle, insurance and its spends kept', () => {
    os.registry.objects.set('vehicle', oldVehicle);
    const car = os.records.create({ object: 'vehicle', data: { make: 'Hyundai', model: 'Creta', year: 2022, plate: 'KA 05 MZ 1234', odometerKm: 28400, insuranceUntil: iso(Date.now() + 9 * DAY), nextServiceKm: 30000 } });
    const tx = os.records.create({ object: 'transaction', data: { amount: 6400, kind: 'expense', category: 'transport', merchant: 'Hyundai', date: iso(Date.now()) } });
    os.links.link(tx.id, car.id, 'vehicle');
    const service = os.cycles.forEntity(car.id).find((c) => c.template === 'vehicle.service')!;
    os.registry.objects.delete('vehicle');

    expect(foldVehicles(os)).toBe(1);
    const a = os.records.get<AssetData>(car.id)!;
    expect(a).toMatchObject({ object: 'asset', title: '2022 Hyundai Creta', status: 'owned', data: { category: 'vehicle', plate: 'KA 05 MZ 1234', odometerKm: 28400, nextServiceKm: 30000 } });
    expect(a.data).not.toHaveProperty('make');
    const cycles = os.cycles.forEntity(car.id);
    expect(cycles.filter((c) => c.template === 'asset.service').map((c) => c.id)).toEqual([service.id]);
    expect(cycles.some((c) => c.template === 'vehicle.insurance')).toBe(true);
    expect(os.cycles.latestMeter(car.id)).toBe(28400);
    expect(os.links.targets(tx.id, 'asset')).toEqual([car.id]);
    expect(services(os)[0]).toMatchObject({ id: car.id, kmLeft: 1600 });
  });

  it('electronics becomes device; folding twice changes nothing', () => {
    const mac = asset('MacBook Pro 14"', { category: 'electronics' });
    foldVehicles(os);
    expect(os.records.get<AssetData>(mac.id)!.data.category).toBe('device');
    expect(foldVehicles(os)).toBe(0);
  });

  it('Stock R7e filed in Clothes becomes clothing, clean, still kept in Clothes', () => {
    const shirt = os.records.create({ object: 'stock', title: 'Blue linen shirt', data: { quantity: 1, spaceId: clothesSpace().id } });
    const butter = os.records.create({ object: 'stock', title: 'Amul butter', data: { quantity: 1, spaceId: spaceNamed(os, 'Fridge')!.id } });
    expect(foldClothes(os)).toBe(1);
    expect(os.records.get<AssetData>(shirt.id)).toMatchObject({ object: 'asset', status: 'owned', data: { category: 'clothing', state: 'clean', spaceId: clothesSpace().id } });
    expect(os.links.forEntity(shirt.id, 'kept_in')[0]!.other.title).toBe('Clothes');
    expect(os.records.get(butter.id)!.object).toBe('stock');
  });

  it('the clothes fold waits for Home’s spaces', async () => {
    os.db.close();
    bus.clear();
    os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, placesModule, financeModule, assetsModule], registry: new Registry() });
    expect(foldClothes(os)).toBeNull();
    expect(os.settings.get('assets.r7a.clothes', false)).toBe(false);
  });
});

describe('warranty and service', () => {
  it('under warranty: running ones, soonest end first; ended and sold ones left out', () => {
    asset('MacBook', { category: 'device', warrantyUntil: iso(Date.now() + 330 * DAY) });
    asset('Fridge', { category: 'appliance', warrantyUntil: iso(Date.now() + 20 * DAY) });
    asset('Old phone', { category: 'device', warrantyUntil: iso(Date.now() - 2 * DAY) });
    asset('Sold TV', { category: 'device', warrantyUntil: iso(Date.now() + 50 * DAY) }, 'sold');
    expect(underWarranty(os).map((r) => [r.title, r.daysLeft])).toEqual([['Fridge', 20], ['MacBook', 330]]);
    expect(underWarranty(os, Date.now(), 30).map((r) => r.title)).toEqual(['Fridge']);
    const fridge = os.records.query('asset').find((a) => a.title === 'Fridge')!;
    expect(os.cycles.forEntity(fridge.id).find((c) => c.template === 'asset.warranty')).toMatchObject({ kind: 'fixed', leadDays: 30 });
  });

  it('a vehicle is serviced every 6 months or 10,000 km by default; km come from the readings', () => {
    const car = asset('Hyundai Creta', { category: 'vehicle', odometerKm: 29_000, nextServiceKm: 30_000 });
    const c = os.cycles.forEntity(car.id).find((x) => x.template === 'asset.service')!;
    expect(c).toMatchObject({ kind: 'either', everyN: 6, everyUnit: 'month', meterEvery: 10_000, meter: 'odometer', nextDueMeter: 30_000 });
    expect(dueForService(os).map((r) => [r.title, r.kmLeft])).toEqual([['Hyundai Creta', 1000]]);
    os.cycles.logMeter(car.id, 29_500);
    expect(os.records.get<AssetData>(car.id)!.data.odometerKm).toBe(29_500);
    expect(dueForService(os)[0]!.kmLeft).toBe(500);
    logDone(os, c.id, { meter: 29_500 });
    expect(os.cycles.get(c.id)!.nextDueMeter).toBe(39_500);
    expect(os.records.get<AssetData>(car.id)!.data.nextServiceKm).toBe(39_500);
    expect(dueForService(os)).toEqual([]);
  });

  it('anything can have a service by months (the AC); without one, no service cycle', () => {
    const ac = asset('Bedroom AC', { category: 'appliance', serviceEveryMonths: 6, nextServiceDate: iso(Date.now() + 10 * DAY) });
    const tv = asset('TV', { category: 'device' });
    expect(os.cycles.forEntity(ac.id).find((x) => x.template === 'asset.service')).toMatchObject({ kind: 'interval', everyN: 6, everyUnit: 'month', meter: null });
    expect(os.cycles.forEntity(tv.id)).toEqual([]);
    expect(dueForService(os).map((r) => [r.title, r.daysLeft])).toEqual([['Bedroom AC', 10]]);
    expect(dueForService(os, Date.now(), 7)).toEqual([]);
  });

  it('"the car" is the vehicle Asset; Upkeep’s Vehicles chip shows it; its service spend is transport', () => {
    asset('MacBook', { category: 'device' });
    const car = asset('Hyundai Creta', { category: 'vehicle', nextServiceKm: 30_000 });
    expect(clearMatch(resolveCandidates(os, 'the car'))?.id).toBe(car.id);
    expect(upkeep(os, 'Vehicles').items.map((i) => i.entity.id)).toEqual([car.id]);
    const c = os.cycles.forEntity(car.id).find((x) => x.template === 'asset.service')!;
    const done = logDone(os, c.id, { cost: 6400, asExpense: true });
    expect(os.records.get<{ category: string }>(done.transactionId!)!.data.category).toBe('transport');
    expect(os.links.targets(done.transactionId!, 'asset')).toEqual([car.id]);
  });
});

describe('the form', () => {
  it('shows only the chosen category’s Fields', () => {
    const shown = (category: string) => assetType.fields.filter((f) => fieldShown(f, { category })).map((f) => f.key);
    expect(shown('clothing')).toEqual(expect.arrayContaining(['state', 'spaceId']));
    expect(shown('clothing').some((k) => ['plate', 'odometerKm', 'serviceEveryMonths', 'warrantyUntil'].includes(k))).toBe(false);
    expect(shown('vehicle')).toEqual(expect.arrayContaining(['plate', 'odometerKm', 'fuel', 'serviceEveryKm', 'nextServiceKm', 'warrantyUntil']));
    expect(shown('appliance')).toEqual(expect.arrayContaining(['serviceEveryMonths', 'warrantyUntil']));
    expect(shown('appliance').some((k) => ['plate', 'serviceEveryKm', 'state'].includes(k))).toBe(false);
  });
});

describe('clothes', () => {
  it('kept in a space by Link; by state; a tap cycles clean → in the wash → clean, packed comes back in the wash', () => {
    const sp = clothesSpace();
    const shirt = asset('Blue linen shirt', { category: 'clothing', spaceId: sp.id });
    const jeans = asset('Black jeans', { category: 'clothing', spaceId: sp.id, state: 'wash' });
    asset('Turf kit', { category: 'clothing', spaceId: sp.id, state: 'packed' });
    expect(os.links.forEntity(shirt.id, 'kept_in')[0]!.other.id).toBe(sp.id);
    expect(os.records.get(shirt.id)!.subtitle).toBe('Clean');
    const by = clothesByState(os, sp.id);
    expect([by.clean, by.wash, by.packed].map((l) => l.map((a) => a.title))).toEqual([['Blue linen shirt'], ['Black jeans'], ['Turf kit']]);
    expect([nextClothesState('clean'), nextClothesState('wash'), nextClothesState('packed')]).toEqual(['wash', 'clean', 'wash']);
    const undo = setClothesState(os, shirt.id, 'wash');
    expect(os.records.get<AssetData>(shirt.id)!.data.state).toBe('wash');
    undo();
    expect(os.records.get<AssetData>(shirt.id)!.data.state).toBeUndefined();
    expect(os.records.get<AssetData>(jeans.id)!.subtitle).toBe('In the wash');
  });

  it('clothing kept nowhere shows in the first clothes space; other spaces show only their own', () => {
    const sp = clothesSpace();
    const other = os.records.create({ object: 'space', title: 'Guest room', data: { holds: 'clothes', order: 9 } });
    asset('Kurta', { category: 'clothing' });
    asset('Blazer', { category: 'clothing', spaceId: other.id });
    asset('Laptop', { category: 'device', spaceId: sp.id });
    expect(clothes(os, sp.id).map((a) => a.title)).toEqual(['Kurta']);
    expect(clothes(os, other.id).map((a) => a.title)).toEqual(['Blazer']);
    expect(clothes(os).map((a) => a.title)).toEqual(['Blazer', 'Kurta']);
  });
});

describe('tools', () => {
  it('under_warranty, due_for_service and clothes answer from data', async () => {
    asset('Fridge', { category: 'appliance', warrantyUntil: iso(Date.now() + 20 * DAY) });
    asset('Hyundai Creta', { category: 'vehicle', odometerKm: 30_200, nextServiceKm: 30_000 });
    asset('Blue linen shirt', { category: 'clothing', spaceId: clothesSpace().id, state: 'wash' });
    asset('Black jeans', { category: 'clothing', spaceId: clothesSpace().id });
    const w = (await tool('under_warranty').run({}, os)) as { assets: Array<{ title: string; daysLeft: number }> };
    expect(w.assets).toEqual([expect.objectContaining({ title: 'Fridge', daysLeft: 20 })]);
    const s = (await tool('due_for_service').run({}, os)) as { assets: Array<{ title: string; late: boolean; when: string }> };
    expect(s.assets).toEqual([expect.objectContaining({ title: 'Hyundai Creta', late: true, when: '200 km past' })]);
    const c = (await tool('clothes').run({}, os)) as Record<string, Array<{ title: string }>>;
    expect(c).toMatchObject({ clean: [{ title: 'Black jeans' }], wash: [{ title: 'Blue linen shirt' }], packed: [] });
    expect(await tool('clothes').run({ state: 'wash', space: 'clothes' }, os)).toMatchObject({ wash: [expect.objectContaining({ title: 'Blue linen shirt' })] });
    expect(await tool('clothes').run({ space: 'Attic' }, os)).toMatchObject({ error: expect.stringContaining('Attic') });
  });
});
