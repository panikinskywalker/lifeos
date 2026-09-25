import React from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import type { Entity, EntityTypeDef } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { palette } from '@ui/theme/tokens';
import { useLive } from '@ui/hooks';
import { Card, Stat } from '@ui/components/primitives';
import { dateField, nextAnnual, periodFromRRule } from '@core/cycles/schedule';

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
  cycleTemplates: (d) => [
    { template: 'vehicle.service', name: 'Service', kind: 'either', everyN: 6, everyUnit: 'month', meterEvery: 10000, nextDueAt: dateField(d.nextServiceDate), nextDueMeter: d.nextServiceKm ?? null, leadDays: 14 }, // unscheduled until a next service or a done is logged
    ...(dateField(d.insuranceUntil) ? [{ template: 'vehicle.insurance', name: 'Insurance renewal', kind: 'fixed' as const, everyN: 1, everyUnit: 'year' as const, nextDueAt: dateField(d.insuranceUntil), leadDays: 30 }] : []),
    ...(dateField(d.pucUntil) ? [{ template: 'vehicle.puc', name: 'PUC renewal', kind: 'fixed' as const, everyN: 6, everyUnit: 'month' as const, nextDueAt: dateField(d.pucUntil), leadDays: 7 }] : []),
  ],
  relations: [{ kind: 'vehicle', label: 'Expenses & services', to: ['transaction', 'document'], cardinality: 'many' }],
};

function VehicleSection({ entity, ctx }: { entity: Entity<any>; ctx: LifeOSContext }) {
  const spend = useLive((os) => os.entities.aggregate('transaction', { filter: { and: [{ field: 'relation.vehicle', op: 'relatedTo', value: entity.id }, { field: 'data.kind', op: 'eq', value: 'expense' }] } }, { sum: ['data.amount'], count: true }), [entity.id]);
  const v = entity as Entity<VehicleData>;
  const days = (d?: string) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);
  const ins = days(v.data.insuranceUntil);
  return (
    <Card style={{ flexDirection: 'row', gap: 16 }}>
      <View style={{ flex: 1 }}><Stat value={ctx.format.currency(spend['sum_data.amount'])} label={`${spend.count} expenses`} small /></View>
      {ins != null ? <View style={{ flex: 1 }}><Stat value={`${ins}`} unit="days" label="Insurance left" small color={ins < 30 ? palette.red : undefined} /></View> : null}
      {v.data.odometerKm ? <View style={{ flex: 1 }}><Stat value={ctx.format.number(v.data.odometerKm)} unit="km" label="Odometer" small /></View> : null}
    </Card>
  );
}

export const assetsModule: ModuleManifest = {
  id: 'assets', name: 'Assets', version: '1.0.0', description: 'Things you own — electronics, furniture, vehicles — with warranties, value and linked expenses.', icon: 'cube.box', color: ASSETS_COLOR,
  dependencies: ['crm'], entityTypes: [assetType, vehicleType],
  quickActions: [{ id: 'assets.add', label: 'Asset', icon: 'cube.box', route: '/entity/asset/new' }, { id: 'assets.addVehicle', label: 'Vehicle', icon: 'car', route: '/entity/vehicle/new' }],
  detailSections: [{ entityType: 'vehicle', key: 'assets.vehicle', title: 'Vehicle', component: VehicleSection, order: 10 }],
};
