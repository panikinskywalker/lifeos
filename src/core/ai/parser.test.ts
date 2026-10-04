import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import { bus } from '../events/bus';
import { parseAmount, parseMessage } from './parser';

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [], registry: new Registry() });
});
afterEach(() => os.db.close());
const first = (t: string) => parseMessage(os, t)?.steps[0]!([]);

describe('parser', () => {
  it('reads Indian amounts and ignores days, km and times', () => {
    expect(parseAmount('6,400 at Hyundai')).toBe(6400);
    expect(parseAmount('₹1,25,000 salary')).toBe(125000);
    expect(parseAmount('rs 450')).toBe(450);
    expect(parseAmount('2.5k on shoes')).toBe(2500);
    expect(parseAmount('for 84 days')).toBeNull();
    expect(parseAmount('at 34,200 km')).toBeNull();
    expect(parseAmount('recharged Jio 719 for 84 days')).toBe(719);
  });

  it('chores, reminders, spending and memory become tool calls', () => {
    expect(first('Add a chore: vacuum every Saturday')).toEqual({ name: 'create_routine', input: { name: 'Vacuum', everyN: 1, everyUnit: 'week', weekday: 6 } });
    expect(first('add chore water the plants every 3 days')).toEqual({ name: 'create_routine', input: { name: 'Water the plants', everyN: 3, everyUnit: 'day' } });
    expect(first('remind me to call the plumber tomorrow')).toMatchObject({ name: 'create_reminder', input: { title: 'Call the plumber' } });
    expect(first('Spent 450 on lunch at Blue Tokai')).toMatchObject({ name: 'create_entity', input: { type: 'transaction', data: { amount: 450, kind: 'expense', category: 'food', merchant: 'Blue Tokai', note: 'Lunch' } } });
    expect(first('paid 1,200 for petrol')).toMatchObject({ input: { data: { amount: 1200, category: 'transport' } } });
    expect(first('remember that Dad hates surprises')).toEqual({ name: 'remember_fact', input: { text: 'Dad hates surprises' } });
  });

  it('"add a new vehicle" opens the form, no model call', async () => {
    const { vehicleType } = await import('../../modules/assets/types');
    os.registry.objects.set('vehicle', vehicleType as never);
    for (const t of ['add a new vehicle', 'Add vehicle', 'new car', 'create a vehicle.']) expect(parseMessage(os, t)).toMatchObject({ intent: 'new_record', steps: [], card: { kind: 'new', type: 'vehicle' } });
    expect(parseMessage(os, 'add a new spaceship')).toBeNull();
  });

  it('hands anything unsure to the model', () => {
    expect(parseMessage(os, 'how should I plan my finances for next year?')).toBeNull();
    expect(parseMessage(os, 'did the thing')).toBeNull(); // nothing called "thing"
    expect(parseMessage(os, 'split it with Zed')).toBeNull(); // no amount, unknown person
  });
});
