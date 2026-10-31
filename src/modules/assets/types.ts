import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';
import type { FieldOption } from '@core/domain/fields';
import { dateField, nextWeekday, startOfDay } from '@core/cycles/schedule';

/**
 * Asset (docs/MODEL.md §2 Things, Fields agreed 31 Oct with R7a): something
 * you own, vehicles and clothes included. A vehicle has odometer readings
 * that drive its service by km; clothing is kept in a Space in Home (a Link,
 * word `kept_in`: this module never imports inventory) and has a state.
 */

export const ASSETS_COLOR = 'brown';

export const ASSET_CATEGORIES: FieldOption[] = [
  { value: 'vehicle', label: 'Vehicle', icon: 'car' },
  { value: 'device', label: 'Device', icon: 'phone' },
  { value: 'appliance', label: 'Appliance', icon: 'bolt' },
  { value: 'clothing', label: 'Clothing', icon: 'shirt' },
  { value: 'furniture', label: 'Furniture', icon: 'box' },
  { value: 'jewellery', label: 'Jewellery', icon: 'sparkle' },
  { value: 'property', label: 'Property', icon: 'home' },
  { value: 'other', label: 'Other', icon: 'box' },
];

export type ClothesState = 'clean' | 'wash' | 'packed';
export const CLOTHES_STATES: Array<FieldOption & { value: ClothesState }> = [
  { value: 'clean', label: 'Clean' },
  { value: 'wash', label: 'In the wash' },
  { value: 'packed', label: 'Packed' },
];

export const FUELS: FieldOption[] = [
  { value: 'petrol', label: 'Petrol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'ev', label: 'Electric' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'cng', label: 'CNG' },
];

/** A vehicle's service when you set none: every 6 months or 10,000 km, whichever comes first. */
export const VEHICLE_SERVICE = { months: 6, km: 10_000 };

export interface AssetData {
  category: string;
  /** yyyy-MM-dd. */
  purchaseDate?: string;
  purchasePrice?: number;
  currentValue?: number;
  /** link → Organisation, word `vendor`. */
  vendorId?: string;
  /** yyyy-MM-dd; drives the Warranty cycle. */
  warrantyUntil?: string;
  serial?: string;
  /** link → Place, word `at`. */
  placeId?: string;
  /** The typed place, kept as the fallback. */
  location?: string;
  /** link → Space, word `kept_in`. */
  spaceId?: string;
  /** Clothing: clean · in the wash · packed (empty = clean). */
  state?: ClothesState;
  serviceEveryMonths?: number;
  serviceEveryKm?: number;
  nextServiceDate?: string;
  nextServiceKm?: number;
  /** Vehicle: the number plate. */
  plate?: string;
  /** Vehicle: the latest odometer reading (mirrored from the readings). */
  odometerKm?: number;
  fuel?: string;
  notes?: string;
}

export const categoryLabel = (v?: string) => ASSET_CATEGORIES.find((c) => c.value === v)?.label ?? 'Asset';
export const clothesStateOf = (d: Pick<AssetData, 'state'>): ClothesState => d.state ?? 'clean';
export const clothesStateLabel = (s: ClothesState) => CLOTHES_STATES.find((c) => c.value === s)!.label;

export const assetType: ObjectDef<AssetData> = {
  id: 'asset',
  module: 'assets',
  label: 'Asset',
  labelPlural: 'Assets',
  icon: 'cube.box',
  color: ASSETS_COLOR,
  schema: z.object({
    category: z.string().default('device'),
    purchaseDate: z.string().optional(),
    purchasePrice: z.coerce.number().optional(),
    currentValue: z.coerce.number().optional(),
    vendorId: z.string().optional(),
    warrantyUntil: z.string().optional(),
    serial: z.string().optional(),
    placeId: z.string().optional(),
    location: z.string().optional(),
    spaceId: z.string().optional(),
    state: z.enum(['clean', 'wash', 'packed']).optional(),
    serviceEveryMonths: z.coerce.number().positive().optional(),
    serviceEveryKm: z.coerce.number().positive().optional(),
    nextServiceDate: z.string().optional(),
    nextServiceKm: z.coerce.number().optional(),
    plate: z.string().optional(),
    odometerKm: z.coerce.number().optional(),
    fuel: z.string().optional(),
    notes: z.string().optional(),
  }),
  fields: [
    { key: 'category', label: 'Category', type: 'select', required: true, summary: true, default: 'device', options: ASSET_CATEGORIES },
    { key: 'purchasePrice', label: 'Price', type: 'money' },
    { key: 'currentValue', label: 'Current value', type: 'money' },
    { key: 'purchaseDate', label: 'Bought on', type: 'date' },
    { key: 'warrantyUntil', label: 'Warranty until', type: 'date', summary: true },
    { key: 'vendorId', label: 'Vendor', type: 'link', linkTo: 'org', linkWord: 'vendor' },
    { key: 'serial', label: 'Serial / model', type: 'text', section: 'Details' },
    { key: 'placeId', label: 'Where', type: 'link', linkTo: 'place', linkWord: 'at', section: 'Details' },
    { key: 'location', label: 'Where (typed)', type: 'text', section: 'Details' },
    { key: 'spaceId', label: 'Kept in', type: 'link', linkTo: 'space', linkWord: 'kept_in', section: 'Details', description: 'A space in Home; clothing goes to Clothes' },
    { key: 'state', label: 'State', type: 'select', options: CLOTHES_STATES, section: 'Clothing' },
    { key: 'serviceEveryMonths', label: 'Service every', type: 'number', unit: 'months', section: 'Service', description: 'A vehicle’s default is 6 months' },
    { key: 'serviceEveryKm', label: 'Service every (km)', type: 'number', unit: 'km', section: 'Service', description: 'Vehicles: default 10,000; whichever comes first' },
    { key: 'nextServiceDate', label: 'Next service', type: 'date', section: 'Service' },
    { key: 'nextServiceKm', label: 'Next service at', type: 'number', unit: 'km', section: 'Service' },
    { key: 'plate', label: 'Registration', type: 'text', section: 'Vehicle' },
    { key: 'odometerKm', label: 'Odometer', type: 'number', unit: 'km', section: 'Vehicle' },
    { key: 'fuel', label: 'Fuel', type: 'select', options: FUELS, section: 'Vehicle' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['category', 'spaceId', 'state'],
  occurredAtField: 'purchaseDate',
  statuses: [{ value: 'owned', label: 'Owned' }, { value: 'sold', label: 'Sold', color: 'gray' }, { value: 'lost', label: 'Lost / broken', color: 'red' }],
  links: [{ kind: 'asset', label: 'Expenses & papers', inverseLabel: 'For', to: ['transaction', 'document'], cardinality: 'many' }],
  computeSubtitle: (d) =>
    d.category === 'clothing' ? clothesStateLabel(clothesStateOf(d)) : d.category === 'vehicle' ? [d.plate, d.odometerKm != null ? `${Math.round(d.odometerKm).toLocaleString('en-IN')} km` : null].filter(Boolean).join(' · ') || 'Vehicle' : categoryLabel(d.category),
  searchText: (d) => [categoryLabel(d.category), d.category === 'vehicle' ? 'car vehicle' : null, d.serial, d.plate, d.location, d.notes].filter(Boolean).join(' '),
  meters: [{ meter: 'odometer', field: 'odometerKm', label: 'Odometer', unit: 'km' }],
  cycleFields: { 'asset.service': { nextDueAt: 'nextServiceDate', nextDueMeter: 'nextServiceKm' } },
  cycleTemplates: (d) => {
    const vehicle = d.category === 'vehicle';
    const months = d.serviceEveryMonths ?? (vehicle ? VEHICLE_SERVICE.months : undefined);
    const km = vehicle ? (d.serviceEveryKm ?? VEHICLE_SERVICE.km) : undefined;
    return [
      ...(dateField(d.warrantyUntil) ? [{ template: 'asset.warranty', name: 'Warranty ends', kind: 'fixed' as const, nextDueAt: dateField(d.warrantyUntil), leadDays: 30 }] : []),
      // Unscheduled until a next service or a done is logged.
      ...(months || km ? [{ template: 'asset.service', name: 'Service', kind: km ? (months ? ('either' as const) : ('meter' as const)) : ('interval' as const), everyN: months ?? null, everyUnit: months ? ('month' as const) : null, meterEvery: km ?? null, nextDueAt: dateField(d.nextServiceDate), nextDueMeter: d.nextServiceKm ?? null, leadDays: 14 }] : []),
    ];
  },
};

export type RoutineData = { name: string; kind: string; everyN: number; everyUnit: 'day' | 'week' | 'month'; minutes?: number; weekday?: string; lastDoneOn?: string; notes?: string };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Routine (chores): a cycle with no physical object (laundry, water plants, haircut). Becomes Habit, kind chore, in R5. */
export const routineType: ObjectDef<RoutineData> = {
  id: 'routine', module: 'assets', label: 'Routine', labelPlural: 'Routines', icon: 'repeat',
  schema: z.object({ name: z.string().min(1), kind: z.string().default('chore'), everyN: z.coerce.number().int().positive().default(7), everyUnit: z.enum(['day', 'week', 'month']).default('day'), minutes: z.coerce.number().optional(), weekday: z.string().optional(), lastDoneOn: z.string().optional(), notes: z.string().optional() }),
  fields: [
    { key: 'name', label: 'Routine', type: 'text', required: true, placeholder: 'Laundry, water plants, haircut…' },
    { key: 'kind', label: 'Kind', type: 'select', default: 'chore', summary: true, options: [{ value: 'chore', label: 'Chore' }, { value: 'personal', label: 'Personal' }, { value: 'home', label: 'Home' }] },
    { key: 'everyN', label: 'Every', type: 'number', required: true, default: 7 },
    { key: 'everyUnit', label: 'Unit', type: 'select', required: true, default: 'day', options: [{ value: 'day', label: 'Days' }, { value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }] },
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
