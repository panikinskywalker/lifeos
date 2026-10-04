import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import { withExtras } from '@core/ai/cards';
import { TRAVEL_COLOR, tripType, type TripData } from './types';

export { TRAVEL_COLOR, tripType, type TripData };

export const travelModule: ModuleManifest = {
  id: 'travel',
  name: 'Travel',
  version: '1.0.0',
  description: 'Trips with budgets, expenses, bookings, companions and itineraries linked together.',
  icon: 'airplane',
  color: TRAVEL_COLOR,
  dependencies: ['crm'],
  entityTypes: [tripType],
  aiTools: [
    {
      name: 'plan_trip',
      description: 'Start planning a trip ("plan Kyoto in late December with Priya, ₹2L budget"): creates the trip with dates, budget and companions, plus a to-do for each thing to book or prepare.',
      input: z.object({ destination: z.string(), startDate: z.string().optional(), endDate: z.string().optional(), budget: z.number().optional(), personIds: z.array(z.string()).optional(), purpose: z.string().optional(), todos: z.array(z.string()).optional().describe('e.g. "Book flights", "Visa", "Hotel in Gion"') }),
      run: async (input, os) => {
        const i = input as { destination: string; startDate?: string; endDate?: string; budget?: number; personIds?: string[]; purpose?: string; todos?: string[] };
        const trip = os.entities.create({ type: 'trip', data: { destination: i.destination, startDate: i.startDate, endDate: i.endDate, budget: i.budget, personIds: i.personIds, purpose: i.purpose }, status: 'planning' }, 'assistant');
        const made: string[] = [];
        if (os.registry.entityTypes.has('task')) {
          for (const t of i.todos ?? []) {
            const task = os.entities.create({ type: 'task', title: t, data: { priority: 'medium', dueDate: i.startDate }, status: 'todo' }, 'assistant');
            os.relations.link(task.id, trip.id, 'trip', {}, 'assistant');
            made.push(task.id);
          }
        }
        return withExtras({ trip: trip.title, todos: i.todos ?? [] }, { undo: () => { for (const id of made) os.entities.delete(id, 'user'); os.entities.delete(trip.id, 'user'); }, card: { kind: 'record', entityId: trip.id, type: 'trip', title: trip.title, subtitle: [i.startDate && i.endDate ? `${i.startDate} → ${i.endDate}` : null, i.budget ? os.format.currency(i.budget) : null, made.length ? `${made.length} to-dos` : null].filter(Boolean).join(' · ') } });
      },
    },
  ],
};

