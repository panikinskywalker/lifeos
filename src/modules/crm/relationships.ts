import type { LifeOSContext } from '@core/registry/context';
import type { FieldOption } from '@core/domain/types';
import { bus } from '@core/events/bus';
import { personType } from './types';

/**
 * Relationships you add (decided 30 Oct): the seven stay as defaults; "New…"
 * in the form adds one you can reuse (Mentor, Neighbour), with its own colour.
 * Kept in settings and merged into Person's Relationship options, like
 * finance's own categories, so every picker, chip and filter sees them.
 */

export interface CustomRelationship {
  value: string;
  label: string;
  color: string;
}

const KEY = 'crm.relationships';
const field = personType.fields.find((f) => f.key === 'relationship')!;
export const BUILTIN_RELATIONSHIPS: FieldOption[] = field.options!.slice();
/** Colours offered to a new relationship, in turn (the seven defaults use red … gray). */
export const RELATIONSHIP_COLORS = ['purple', 'teal', 'yellow', 'green', 'mint', 'cyan', 'brown'];

let current: LifeOSContext | null = null;

export function customRelationships(os: LifeOSContext): CustomRelationship[] {
  return os.settings.get<CustomRelationship[]>(KEY, []);
}

/** Put your relationships after the seven, in the Field's own options array. */
export function applyRelationships(os: LifeOSContext) {
  current = os;
  field.options!.splice(0, field.options!.length, ...BUILTIN_RELATIONSHIPS, ...customRelationships(os));
  field.onCreateOption = (label: string) => (current ? addRelationship(current, label) : null);
}

const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 32);

/** Add (or find) a relationship by its label; returns its option. */
export function addRelationship(os: LifeOSContext, label: string, color?: string): FieldOption | null {
  const name = label.trim().replace(/\s+/g, ' ');
  if (!name) return null;
  const all = [...BUILTIN_RELATIONSHIPS, ...customRelationships(os)];
  const same = all.find((o) => o.label.toLowerCase() === name.toLowerCase() || o.value === slug(name));
  if (same) return same;
  const custom = customRelationships(os);
  const next: CustomRelationship = { value: slug(name) || `rel_${custom.length + 1}`, label: name[0]!.toUpperCase() + name.slice(1), color: color ?? RELATIONSHIP_COLORS[custom.length % RELATIONSHIP_COLORS.length]! };
  os.settings.set(KEY, [...custom, next]);
  applyRelationships(os);
  bus.emit('data.changed', { table: 'settings', id: KEY });
  return next;
}

/** Rename or recolour one you added (You › People › Relationships). */
export function updateRelationship(os: LifeOSContext, value: string, patch: { label?: string; color?: string }): void {
  os.settings.set(KEY, customRelationships(os).map((r) => (r.value === value ? { ...r, ...patch } : r)));
  applyRelationships(os);
  bus.emit('data.changed', { table: 'settings', id: KEY });
}
