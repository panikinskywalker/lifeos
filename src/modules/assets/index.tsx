import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import type { EntityTypeDef } from '@core/domain/types';
import { palette } from '@ui/theme/tokens';
import { dateField, nextWeekday, startOfDay } from '@core/cycles/schedule';
import { VehicleHero } from './hero';
import { withExtras } from '@core/ai/cards';

export const ASSETS_COLOR = palette.brown;

export interface AssetData { category: string; purchaseDate?: string; purchasePrice?: number; currentValue?: number; serial?: string; warrantyUntil?: string; location?: string; notes?: string; vendorId?: string }
export const assetType: EntityTypeDef<AssetData> = {
  type: 'asset', module: 'assets', label: 'Asset', labelPlural: 'Assets', icon: 'cube.box',
  schema: z.object({ category: z.string().default('electronics'), purchaseDate: z.string().optional(), purchasePrice: z.coerce.number().optional(), currentValue: z.coerce.number().optional(), serial: z.string().optional(), warrantyUntil: z.string().optional(), location: z.string().optional(), notes: z.string().optional(), vendorId: z.string().optional() }),
  cycleTemplates: (d) => (dateField(d.warrantyUntil) ? [{ template: 'asset.warranty', name: 'Warranty ends', kind: 'fixed', nextDueAt: dateField(d.warrantyUntil), leadDays: 30 }] : []),
  fields: [
    { key: 'category', label: 'Category', type: 'select', required: true, summary: true, options: [{ value: 'electronics', label: 'Electronics' }, { value: 'furniture', label: 'Furniture' }, { value: 'appliance', label: 'Appliance' }, { value: 'jewellery', label: 'Jewellery' }, { value: 'property', label: 'Property' }, { value: 'other', label: 'Other' }] },
    { key: 'purchasePrice', label: 'Purchase price', type: 'currency' },
    { key: 'currentValue', label: 'Current value', type: 'currency' },
    { key: 'purchaseDate', label: 'Purchased on', type: 'date', section: 'Details' },
    { key: 'warrantyUntil', label: 'Warranty until', type: 'date', section: 'Details', summary: true },
    { key: 'serial', label: 'Serial / model', type: 'text', section: 'Details' },
    { key: 'location', label: 'Location', type: 'text', section: 'Details' },
    { key: 'vendorId', label: 'Vendor', type: 'relation', relationTo: 'person', relationKind: 'vendor', section: 'Details' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['category'], occurredAtField: 'purchaseDate',
  statuses: [{ value: 'owned', label: 'Owned' }, { value: 'sold', label: 'Sold', color: palette.gray }, { value: 'lost', label: 'Lost / broken', color: palette.red }],
  searchText: (d) => [d.serial, d.location, d.notes].filter(Boolean).join(' '),
};

export interface VehicleData { make: string; model?: string; year?: number; plate?: string; odometerKm?: number; fuel?: string; insuranceUntil?: string; pucUntil?: string; nextServiceKm?: number; nextServiceDate?: string; notes?: string }
type RoutineData = { name: string; kind: string; everyN: number; everyUnit: 'day' | 'week' | 'month'; minutes?: number; weekday?: string; lastDoneOn?: string; notes?: string };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Routine (chores): a cycle with no physical object — laundry, water plants, haircut. SCOPE C3. */
export const routineType: EntityTypeDef<RoutineData> = {
  type: 'routine', module: 'assets', label: 'Routine', labelPlural: 'Routines', icon: 'repeat',
  schema: z.object({ name: z.string().min(1), kind: z.string().default('chore'), everyN: z.coerce.number().int().positive().default(7), everyUnit: z.enum(['day', 'week', 'month']).default('day'), minutes: z.coerce.number().optional(), weekday: z.string().optional(), lastDoneOn: z.string().optional(), notes: z.string().optional() }),
  fields: [
    { key: 'name', label: 'Routine', type: 'text', required: true, placeholder: 'Laundry, water plants, haircut…' },
    { key: 'kind', label: 'Kind', type: 'select', defaultValue: 'chore', summary: true, options: [{ value: 'chore', label: 'Chore' }, { value: 'personal', label: 'Personal' }, { value: 'home', label: 'Home' }] },
    { key: 'everyN', label: 'Every', type: 'number', required: true, defaultValue: 7 },
    { key: 'everyUnit', label: 'Unit', type: 'select', required: true, defaultValue: 'day', options: [{ value: 'day', label: 'Days' }, { value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }] },
    { key: 'minutes', label: 'Takes about (minutes)', type: 'number' },
    { key: 'weekday', label: 'Preferred day', type: 'select', options: WEEKDAYS.map((l, i) => ({ value: String(i), label: l })) },
    { key: 'lastDoneOn', label: 'Last done', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  computeTitle: (d) => d.name,
  cycleFields: { 'routine.cycle': { lastDoneAt: 'lastDoneOn' } },
  computeSubtitle: (d) => [`every ${d.everyN === 1 ? '' : `${d.everyN} `}${d.everyUnit}${d.everyN === 1 ? '' : 's'}`, d.minutes ? `${d.minutes} min` : null, d.weekday ? `${WEEKDAYS[Number(d.weekday)]}s` : null].filter(Boolean).join(' · '),
  cycleTemplates: (d) => {
    const last = dateField(d.lastDoneOn);
    const first = d.weekday ? nextWeekday(Number(d.weekday), Date.now()) : startOfDay(Date.now()) + 9 * 3600_000;
    return [{ template: 'routine.cycle', name: d.name, kind: 'interval', everyN: d.everyN, everyUnit: d.everyUnit, lastDoneAt: last, nextDueAt: last == null ? first : null }];
  },
};

export const vehicleType: EntityTypeDef<VehicleData> = {
  type: 'vehicle', module: 'assets', label: 'Vehicle', labelPlural: 'Vehicles', icon: 'car',
  schema: z.object({ make: z.string(), model: z.string().optional(), year: z.coerce.number().optional(), plate: z.string().optional(), odometerKm: z.coerce.number().optional(), fuel: z.string().optional(), insuranceUntil: z.string().optional(), pucUntil: z.string().optional(), nextServiceKm: z.coerce.number().optional(), nextServiceDate: z.string().optional(), notes: z.string().optional() }),
  fields: [
    { key: 'make', label: 'Make', type: 'text', required: true }, { key: 'model', label: 'Model', type: 'text' }, { key: 'year', label: 'Year', type: 'number' }, { key: 'plate', label: 'Registration', type: 'text', summary: true },
    { key: 'odometerKm', label: 'Odometer (km)', type: 'number', section: 'Maintenance' }, { key: 'nextServiceKm', label: 'Next service at (km)', type: 'number', section: 'Maintenance' }, { key: 'nextServiceDate', label: 'Next service date', type: 'date', section: 'Maintenance' },
    { key: 'insuranceUntil', label: 'Insurance valid until', type: 'date', section: 'Compliance' }, { key: 'pucUntil', label: 'PUC valid until', type: 'date', section: 'Compliance' },
    { key: 'fuel', label: 'Fuel', type: 'select', section: 'Details', options: [{ value: 'petrol', label: 'Petrol' }, { value: 'diesel', label: 'Diesel' }, { value: 'ev', label: 'Electric' }, { value: 'hybrid', label: 'Hybrid' }, { value: 'cng', label: 'CNG' }] },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  computeTitle: (d) => [d.year, d.make, d.model].filter(Boolean).join(' '),
  meters: [{ meter: 'odometer', field: 'odometerKm', label: 'Odometer', unit: 'km' }],
  cycleFields: { 'vehicle.service': { nextDueAt: 'nextServiceDate', nextDueMeter: 'nextServiceKm' }, 'vehicle.insurance': { nextDueAt: 'insuranceUntil' }, 'vehicle.puc': { nextDueAt: 'pucUntil' } },
  cycleTemplates: (d) => [
    { template: 'vehicle.service', name: 'Service', kind: 'either', everyN: 6, everyUnit: 'month', meterEvery: 10000, nextDueAt: dateField(d.nextServiceDate), nextDueMeter: d.nextServiceKm ?? null, leadDays: 14 }, // unscheduled until a next service or a done is logged
    ...(dateField(d.insuranceUntil) ? [{ template: 'vehicle.insurance', name: 'Insurance renewal', kind: 'fixed' as const, everyN: 1, everyUnit: 'year' as const, nextDueAt: dateField(d.insuranceUntil), leadDays: 30 }] : []),
    ...(dateField(d.pucUntil) ? [{ template: 'vehicle.puc', name: 'PUC renewal', kind: 'fixed' as const, everyN: 6, everyUnit: 'month' as const, nextDueAt: dateField(d.pucUntil), leadDays: 7 }] : []),
  ],
  relations: [{ kind: 'vehicle', label: 'Expenses & services', to: ['transaction', 'document'], cardinality: 'many' }],
};


export const assetsModule: ModuleManifest = {
  id: 'assets', name: 'Assets', version: '1.0.0', description: 'Things you own — electronics, furniture, vehicles — with warranties, value and linked expenses.', icon: 'cube.box', color: ASSETS_COLOR,
  dependencies: ['crm'], entityTypes: [assetType, vehicleType, routineType],
  quickActions: [{ id: 'assets.add', label: 'Asset', icon: 'cube.box', route: '/entity/asset/new' }, { id: 'assets.addVehicle', label: 'Vehicle', icon: 'car', route: '/entity/vehicle/new' }],
  aiTools: [
    {
      name: 'create_routine',
      description: 'Add a chore / routine ("add a chore: vacuum every Saturday", "remind me to water the plants every 3 days"). kind chore | personal | home; weekday 0 = Sunday … 6 = Saturday.',
      input: z.object({ name: z.string(), everyN: z.number().int().positive(), everyUnit: z.enum(['day', 'week', 'month']), kind: z.enum(['chore', 'personal', 'home']).default('chore'), minutes: z.number().optional(), weekday: z.number().int().min(0).max(6).optional(), lastDoneOn: z.string().optional() }),
      run: async (input, os) => {
        const i = input as { name: string; everyN: number; everyUnit: 'day' | 'week' | 'month'; kind: string; minutes?: number; weekday?: number; lastDoneOn?: string };
        const e = os.entities.create({ type: 'routine', data: { ...i, weekday: i.weekday != null ? String(i.weekday) : undefined } }, 'assistant');
        const c = os.cycles.forEntity(e.id)[0];
        return withExtras({ created: e.title, schedule: e.subtitle, cycleId: c?.id }, { undo: () => os.entities.delete(e.id, 'user'), card: c ? { kind: 'cycle', entityId: e.id, cycleId: c.id, title: e.title, due: e.subtitle ?? '' } : { kind: 'record', entityId: e.id, type: 'routine', title: e.title, subtitle: e.subtitle } });
      },
    },
  ],
  detailSections: [{ entityType: 'vehicle', key: 'assets.vehicle', title: 'Vehicle', component: VehicleHero, order: 10, placement: 'top' }],
};
