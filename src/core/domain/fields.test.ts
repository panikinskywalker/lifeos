import { describe, expect, it } from 'vitest';
import { FIELD_TYPES, fieldType, fieldTypes, parseDateText, parseDurationText, parseMoneyText, schemaFor, type Field } from './fields';
import { createFormatters, DEFAULT_LOCALE } from '../format';

const fmt = createFormatters(() => DEFAULT_LOCALE);
const ctx = { currency: 'INR', now: Date.parse('2026-10-04T12:00:00') };
const f = (type: Field['type'], extra: Partial<Field> = {}): Field => ({ key: 'x', label: 'X', type, ...extra });

describe('field types: the closed list', () => {
  it('every type has a definition and every definition is in the list', () => {
    for (const t of FIELD_TYPES) expect(fieldType(t).type).toBe(t);
    expect(Object.keys(fieldTypes).sort()).toEqual([...FIELD_TYPES].sort());
  });

  it('parses everyday text per type', () => {
    expect(fieldType('number').parse('1,240 steps', f('number'), ctx)).toBe(1240);
    expect(parseMoneyText('₹1,240', 'INR')).toEqual({ amount: 1240, currency: 'INR' });
    expect(parseMoneyText('32k', 'INR')).toBeUndefined(); // no currency marker: not money on its own
    expect(parseMoneyText('Rs 32k', 'INR')).toEqual({ amount: 32000, currency: 'INR' });
    expect(parseMoneyText('$12.50', 'INR')).toEqual({ amount: 12.5, currency: 'USD' });
    expect(parseMoneyText('1.2 lakh rupees', 'INR')).toEqual({ amount: 120000, currency: 'INR' });
    expect(parseDateText('yesterday', ctx.now)).toBe('2026-10-03');
    expect(parseDateText('25/09/2026', ctx.now)).toBe('2026-09-25');
    expect(parseDateText('2026-03-01', ctx.now)).toBe('2026-03-01');
    expect(parseDurationText('1h 20m')).toBe(80);
    expect(parseDurationText('45 mins')).toBe(45);
    expect(fieldType('select').parse('Friend', f('select', { options: [{ value: 'friend', label: 'Friend' }] }), ctx)).toBe('friend');
    expect(fieldType('boolean').parse('done', f('boolean'), ctx)).toBe(true);
    expect(fieldType('contact').parse('+91 98765 43210', f('contact', { contactKind: 'phone' }), ctx)).toBe('+919876543210');
    expect(fieldType('contact').parse('karan@zomato.com', f('contact'), ctx)).toBe('karan@zomato.com');
    expect(fieldType('location').parse('12.97, 77.59', f('location'), ctx)).toEqual({ lat: 12.97, lng: 77.59 });
    expect(fieldType('link').parse('Karan', f('link'), ctx)).toBeUndefined(); // identity is filing's job
  });

  it('formats per type', () => {
    expect(fieldType('money').format(1240, f('money'), fmt)).toBe('₹1,240');
    expect(fieldType('money').format({ amount: 12.5, currency: 'USD' }, f('money'), fmt)).toContain('12.5');
    expect(fieldType('number').format(8000, f('number', { unit: 'steps' }), fmt)).toBe('8,000 steps');
    expect(fieldType('duration').format(80, f('duration'), fmt)).toBe('1h 20m');
    expect(fieldType('select').format('friend', f('select', { options: [{ value: 'friend', label: 'Friend' }] }), fmt)).toBe('Friend');
    expect(fieldType('meter').format(42310, f('meter', { unit: 'km' }), fmt)).toBe('42,310 km');
  });

  it('derives a zod schema from Fields and keeps unknown keys', () => {
    const schema = schemaFor([
      f('text', { key: 'name', required: true }),
      f('money', { key: 'amount' }),
      f('select', { key: 'kind', options: [{ value: 'a', label: 'A' }] }),
      f('date', { key: 'on' }),
    ]);
    expect(schema.safeParse({ name: 'Karan', amount: 100, kind: 'a', on: '2026-10-04', extra: 1 }).success).toBe(true);
    expect(schema.safeParse({ amount: 100 }).success).toBe(false); // name required
    expect(schema.safeParse({ name: 'x', kind: 'b' }).success).toBe(false); // not an option
    expect(schema.safeParse({ name: 'x', on: 'yesterday' }).success).toBe(false); // dates are stored as ISO days
  });

  it('says how each type queries', () => {
    expect(fieldType('money').query.aggregate).toContain('sum');
    expect(fieldType('date').query.buckets).toBe(true);
    expect(fieldType('link').query.ops).toContain('relatedTo');
    expect(fieldType('file').query.ops).toEqual(['isNull', 'notNull']);
  });
});
