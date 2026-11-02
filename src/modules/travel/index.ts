import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import type { ObjectRecord } from '@core/domain/types';
import { withExtras } from '@core/ai/cards';
import { bus } from '@core/events/bus';
import { TRAVEL_COLOR, tripType, type TripData } from './types';
import { travelParsers } from './filing/parser';
import { linkTripPlace, nextTrip, trips, tripSpend } from './trips';
import { travelBrain } from './brain';

export * from './types';
export * from './trips';
export * from './packing';
export { travelBrain, AIRLINE_SITES } from './brain';
export { parseFlight, parseStay, type ParsedFlight, type ParsedStay } from './filing/bookings';

/**
 * Travel (docs/MODEL.md layer 2 *Trip's Fields*, R7d): trips with their
 * spend against the budget, flights and stays from booking mail, the packing
 * list, and the brain's *coming up* (pack, check in, before you go).
 */
export const travelModule: ModuleManifest = {
  id: 'travel',
  name: 'Travel',
  version: '2.0.0',
  description: 'Trips with their spend against the budget, flights and stays from booking mail, and what to pack.',
  icon: 'airplane',
  color: TRAVEL_COLOR,
  dependencies: ['crm'],
  objects: [tripType],
  filing: { parsers: travelParsers },
  brain: travelBrain,
  onStart: (os) => {
    // R7d, once: every trip's destination becomes its Place.
    if (!os.settings.get<boolean>('travel.foldedR7d', false) && os.registry.objects.has('place')) {
      for (const t of trips(os)) linkTripPlace(os, t);
      os.settings.set('travel.foldedR7d', true);
    }
    // A trip saved without a Place gets the one its destination names.
    bus.on('entity.created', ({ entity }) => {
      if (entity.object === 'trip') linkTripPlace(os, entity as unknown as ObjectRecord<TripData>);
    });
    bus.on('entity.updated', ({ entity, changed }) => {
      if (entity.object === 'trip' && (changed.includes('data.destination') || changed.includes('data.placeId'))) linkTripPlace(os, entity as unknown as ObjectRecord<TripData>);
    });
  },
  aiTools: [
    {
      name: 'plan_trip',
      description: 'Start planning a trip ("plan Kyoto in late December with Priya, ₹2L budget"): creates the trip with dates, budget and companions, plus a to-do for each thing to book or prepare.',
      input: z.object({ destination: z.string(), startDate: z.string().optional(), endDate: z.string().optional(), budget: z.number().optional(), personIds: z.array(z.string()).optional(), purpose: z.string().optional(), todos: z.array(z.string()).optional().describe('e.g. "Book flights", "Visa", "Hotel in Gion"') }),
      run: async (input, os) => {
        const i = input as { destination: string; startDate?: string; endDate?: string; budget?: number; personIds?: string[]; purpose?: string; todos?: string[] };
        const trip = os.records.create({ object: 'trip', data: { destination: i.destination, startDate: i.startDate, endDate: i.endDate, budget: i.budget, personIds: i.personIds, purpose: i.purpose }, status: 'planning' }, 'assistant');
        const made: string[] = [];
        if (os.registry.objects.has('task')) {
          for (const t of i.todos ?? []) {
            const task = os.records.create({ object: 'task', title: t, data: { priority: 'medium', dueDate: i.startDate }, status: 'todo' }, 'assistant');
            os.links.link(task.id, trip.id, 'trip', {}, 'assistant');
            made.push(task.id);
          }
        }
        return withExtras({ trip: trip.title, todos: i.todos ?? [] }, { undo: () => { for (const id of made) os.records.delete(id, 'user'); os.records.delete(trip.id, 'user'); }, card: { kind: 'record', entityId: trip.id, type: 'trip', title: trip.title, subtitle: [i.startDate && i.endDate ? `${i.startDate} → ${i.endDate}` : null, i.budget ? os.format.currency(i.budget) : null, made.length ? `${made.length} to-dos` : null].filter(Boolean).join(' · ') } });
      },
    },
    {
      name: 'trip_spend',
      description: 'What a trip cost against its budget ("how much did Goa cost?", "am I over budget for Kyoto?"): spent, budget, left, per day, by category. Without a name, the trip you are on or the next one.',
      input: z.object({ trip: z.string().optional().describe('the destination or trip name') }),
      run: async (input, os) => {
        const name = (input as { trip?: string }).trip?.toLowerCase().trim();
        const all = trips(os);
        const t = name ? ([...all].reverse().find((x) => x.title.toLowerCase().includes(name) || x.data.destination.toLowerCase().includes(name)) ?? null) : nextTrip(os) ?? all[all.length - 1] ?? null;
        if (!t) return { found: false };
        const s = tripSpend(os, t);
        return { trip: t.title, starts: t.data.startDate ?? null, ends: t.data.endDate ?? null, spent: s.spent, budget: s.budget, left: s.left, over: s.over, per_day: s.perDay, expenses: s.count, by_category: s.byCategory };
      },
    },
  ],
};
