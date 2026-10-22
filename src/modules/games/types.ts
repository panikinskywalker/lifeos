import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';

/**
 * Games (docs/MODEL.md layer 2, agreed 17 Oct, plan 2 on 20 Oct): the football
 * you run in Turf web, which holds the one true copy. Every record here keeps
 * its Turf web id (Turf Ledger's, kept at the import) as `sourceKey`
 * (`turf:<table>:<id>`). Players are People and venues are Places; the
 * football detail stays in these four Objects.
 */

export const GAMES_COLOR = 'green';

export const PAYMENT_TERMS = [
  { value: 'tentative', label: 'Tentative', color: 'gray' },
  { value: 'prepaid', label: 'Prepaid', color: 'green' },
  { value: 'advance_paid', label: 'Advance paid', color: 'teal' },
  { value: 'postpaid', label: 'Pay after', color: 'orange' },
];
export const ATTENDANCE = [
  { value: 'confirmed', label: 'On time' },
  { value: 'late', label: 'Late', color: 'orange' },
  { value: 'no_show', label: 'No show', color: 'red' },
];
export const AVAILABILITY = [
  { value: 'AVL', label: 'Available', color: 'green' },
  { value: 'INJ', label: 'Injured', color: 'red' },
  { value: 'OOS', label: 'Out of station', color: 'gray' },
];
export const TEAMS = [
  { value: 'A', label: 'Team A' },
  { value: 'B', label: 'Team B' },
];

const termsEnum = z.enum(['tentative', 'prepaid', 'advance_paid', 'postpaid']);

const shortDay = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

/* ------------------------------------------------------------------ */

export interface GameData {
  date: string;
  time?: string;
  venueId?: string;
  /** The venue as Turf web names it (kept when the venue record is missing). */
  venueName: string;
  sideSize?: number;
  totalCost: number;
  expectedPlayers: number;
  paymentTerms: 'tentative' | 'prepaid' | 'advance_paid' | 'postpaid';
  advance?: number;
  frontedById?: string;
  scoreA?: number;
  scoreB?: number;
  /** Set by hand, so it no longer follows the goals. */
  scoreLocked?: boolean;
  colorA?: string;
  colorB?: string;
  captainAId?: string;
  captainBId?: string;
  motmId?: string;
  goalData?: 'complete' | 'partial' | 'inconsistent' | 'missing';
  shareSlug?: string;
  /** RSVPs by Turf web player id ("in" / "maybe" / "out"): a player can answer before they're in the lineup. */
  rsvps?: Record<string, string>;
  sourceKey?: string;
}

export const gameObject: ObjectDef<GameData> = {
  id: 'game',
  module: 'games',
  label: 'Game',
  labelPlural: 'Games',
  icon: 'target',
  color: GAMES_COLOR,
  schema: z.object({
    date: z.string(),
    time: z.string().optional(),
    venueId: z.string().optional(),
    venueName: z.string().default(''),
    sideSize: z.coerce.number().optional(),
    totalCost: z.coerce.number().default(0),
    expectedPlayers: z.coerce.number().default(0),
    paymentTerms: termsEnum.default('postpaid'),
    advance: z.coerce.number().optional(),
    frontedById: z.string().optional(),
    scoreA: z.coerce.number().optional(),
    scoreB: z.coerce.number().optional(),
    scoreLocked: z.boolean().optional(),
    colorA: z.string().optional(),
    colorB: z.string().optional(),
    captainAId: z.string().optional(),
    captainBId: z.string().optional(),
    motmId: z.string().optional(),
    goalData: z.enum(['complete', 'partial', 'inconsistent', 'missing']).optional(),
    shareSlug: z.string().optional(),
    rsvps: z.record(z.string(), z.string()).optional(),
    sourceKey: z.string().optional(),
  }),
  fields: [
    { key: 'date', label: 'Date', type: 'date', required: true, summary: true },
    { key: 'time', label: 'Kick-off', type: 'text', summary: true, placeholder: '20:00' },
    { key: 'venueId', label: 'Venue', type: 'link', linkTo: 'venue', linkWord: 'venue' },
    { key: 'sideSize', label: 'Format (a side)', type: 'number' },
    { key: 'totalCost', label: 'Turf cost', type: 'money', required: true },
    { key: 'expectedPlayers', label: 'Players planned', type: 'number' },
    { key: 'paymentTerms', label: 'Booking', type: 'select', options: PAYMENT_TERMS, section: 'Money' },
    { key: 'advance', label: 'Advance', type: 'money', section: 'Money' },
    { key: 'frontedById', label: 'Fronted by', type: 'link', linkTo: 'person', linkWord: 'fronted by', section: 'Money' },
    { key: 'scoreA', label: 'Team A goals', type: 'number', section: 'Result' },
    { key: 'scoreB', label: 'Team B goals', type: 'number', section: 'Result' },
    { key: 'motmId', label: 'Man of the match', type: 'link', linkTo: 'person', linkWord: 'man of the match', section: 'Result' },
    { key: 'captainAId', label: 'Captain, team A', type: 'link', linkTo: 'person', linkWord: 'captain', section: 'Teams' },
    { key: 'captainBId', label: 'Captain, team B', type: 'link', linkTo: 'person', linkWord: 'captain', section: 'Teams' },
    { key: 'goalData', label: 'Goal records', type: 'select', section: 'Result', options: [{ value: 'complete', label: 'Complete' }, { value: 'partial', label: 'Partial' }, { value: 'inconsistent', label: 'Inconsistent' }, { value: 'missing', label: 'Missing' }] },
  ],
  occurredAtField: 'date',
  computeTitle: (d) => [shortDay(d.date), d.venueName].filter(Boolean).join(' · ') || 'Game',
  computeSubtitle: (d, { formatCurrency }) =>
    [d.time, d.sideSize ? `${d.sideSize}-a-side` : null, d.scoreA != null && d.scoreB != null ? `${d.scoreA}–${d.scoreB}` : null, formatCurrency(d.totalCost)].filter(Boolean).join(' · '),
  searchText: (d) => d.venueName,
  indexed: ['date', 'sourceKey'],
};

/* ------------------------------------------------------------------ */

export interface AppearanceData {
  gameId: string;
  personId: string;
  /** The game's date, so lists sort and Today finds this week's without a join. */
  gameDate: string;
  share: number;
  /** The sum of its payment entries (payments, refunds, corrections); more than the share is a credit. */
  amountPaid?: number;
  paid: boolean;
  paidOn?: string;
  rsvp?: string;
  attendance: 'confirmed' | 'late' | 'no_show';
  team?: 'A' | 'B';
  position?: string;
  goals: number;
  ownGoals?: number;
  assists: number;
  saves: number;
  inGoal: boolean;
  sourceKey?: string;
}

export const appearanceObject: ObjectDef<AppearanceData> = {
  id: 'appearance',
  module: 'games',
  label: 'Appearance',
  labelPlural: 'Appearances',
  icon: 'target',
  color: GAMES_COLOR,
  schema: z.object({
    gameId: z.string().min(1),
    personId: z.string().min(1),
    gameDate: z.string(),
    share: z.coerce.number().default(0),
    amountPaid: z.coerce.number().optional(),
    paid: z.boolean().default(false),
    paidOn: z.string().optional(),
    rsvp: z.string().optional(),
    attendance: z.enum(['confirmed', 'late', 'no_show']).default('confirmed'),
    team: z.enum(['A', 'B']).optional(),
    position: z.string().optional(),
    goals: z.coerce.number().default(0),
    ownGoals: z.coerce.number().optional(),
    assists: z.coerce.number().default(0),
    saves: z.coerce.number().default(0),
    inGoal: z.boolean().default(false),
    sourceKey: z.string().optional(),
  }),
  fields: [
    { key: 'gameId', label: 'Game', type: 'link', linkTo: 'game', linkWord: 'played in', required: true },
    { key: 'personId', label: 'Player', type: 'link', linkTo: 'person', linkWord: 'player', required: true },
    { key: 'share', label: 'Share', type: 'money', summary: true },
    { key: 'amountPaid', label: 'Paid so far', type: 'money' },
    { key: 'paid', label: 'Paid', type: 'boolean', summary: true },
    { key: 'paidOn', label: 'Paid on', type: 'date' },
    { key: 'attendance', label: 'Attendance', type: 'select', options: ATTENDANCE },
    { key: 'team', label: 'Team', type: 'select', options: TEAMS, section: 'On the pitch' },
    { key: 'position', label: 'Position', type: 'text', section: 'On the pitch' },
    { key: 'goals', label: 'Goals', type: 'number', section: 'On the pitch' },
    { key: 'assists', label: 'Assists', type: 'number', section: 'On the pitch' },
    { key: 'saves', label: 'Saves', type: 'number', section: 'On the pitch' },
    { key: 'inGoal', label: 'Played in goal', type: 'boolean', section: 'On the pitch' },
  ],
  occurredAtField: 'gameDate',
  computeTitle: (d) => `Game on ${shortDay(d.gameDate)}`,
  computeSubtitle: (d, { formatCurrency }) => [formatCurrency(d.share), d.paid ? 'paid' : 'unpaid', d.goals ? `${d.goals} goal${d.goals === 1 ? '' : 's'}` : null].filter(Boolean).join(' · '),
  indexed: ['gameId', 'personId', 'paid', 'gameDate', 'sourceKey'],
};

/* ------------------------------------------------------------------ */

export interface AvailabilityPeriod {
  /** Turf web's id for the period, so a change or delete finds it. */
  id?: string;
  status: 'AVL' | 'INJ' | 'OOS';
  startsAt: string;
  endsAt?: string | null;
  note?: string | null;
}

export interface PlayerProfileData {
  personId: string;
  /** The name Turf web uses (the Person may be called something else). */
  name: string;
  position?: string;
  secondaryPosition?: string;
  comfortable?: string;
  preferredFoot?: string;
  speciality?: string;
  playingStyle?: string;
  startingLevel?: string;
  ability?: number;
  pace?: number;
  stamina?: number;
  defending?: number;
  passing?: number;
  dribbling?: number;
  shooting?: number;
  keeperWilling?: boolean;
  keeperRating?: number;
  jersey?: string;
  kitColors?: string;
  boots?: string;
  favouritePlayer?: string;
  clubs?: string;
  countries?: string;
  availabilityMode?: 'regular' | 'window_only';
  weekly?: 'all_week' | 'weekdays' | 'weekends';
  availability: 'AVL' | 'INJ' | 'OOS';
  periods?: AvailabilityPeriod[];
  /** Turf web's photo key (fetched with the same key). */
  photoPath?: string;
  shareSlug?: string;
  notes?: string;
  sourceKey?: string;
}

const rating = { type: 'number' as const, section: 'Attributes', description: '1–5' };

export const playerProfileObject: ObjectDef<PlayerProfileData> = {
  id: 'player',
  module: 'games',
  label: 'Player profile',
  labelPlural: 'Player profiles',
  icon: 'person',
  color: GAMES_COLOR,
  schema: z.object({
    personId: z.string().min(1),
    name: z.string().min(1),
    position: z.string().optional(),
    secondaryPosition: z.string().optional(),
    comfortable: z.string().optional(),
    preferredFoot: z.string().optional(),
    speciality: z.string().optional(),
    playingStyle: z.string().optional(),
    startingLevel: z.string().optional(),
    ability: z.coerce.number().optional(),
    pace: z.coerce.number().optional(),
    stamina: z.coerce.number().optional(),
    defending: z.coerce.number().optional(),
    passing: z.coerce.number().optional(),
    dribbling: z.coerce.number().optional(),
    shooting: z.coerce.number().optional(),
    keeperWilling: z.boolean().optional(),
    keeperRating: z.coerce.number().optional(),
    jersey: z.string().optional(),
    kitColors: z.string().optional(),
    boots: z.string().optional(),
    favouritePlayer: z.string().optional(),
    clubs: z.string().optional(),
    countries: z.string().optional(),
    availabilityMode: z.enum(['regular', 'window_only']).optional(),
    weekly: z.enum(['all_week', 'weekdays', 'weekends']).optional(),
    availability: z.enum(['AVL', 'INJ', 'OOS']).default('AVL'),
    periods: z.array(z.object({ id: z.string().optional(), status: z.enum(['AVL', 'INJ', 'OOS']), startsAt: z.string(), endsAt: z.string().nullable().optional(), note: z.string().nullable().optional() })).optional(),
    photoPath: z.string().optional(),
    shareSlug: z.string().optional(),
    notes: z.string().optional(),
    sourceKey: z.string().optional(),
  }),
  fields: [
    { key: 'personId', label: 'Person', type: 'link', linkTo: 'person', linkWord: 'plays as', required: true },
    { key: 'position', label: 'Position', type: 'text', summary: true },
    { key: 'secondaryPosition', label: 'Second position', type: 'text' },
    { key: 'comfortable', label: 'Also plays', type: 'text' },
    { key: 'availability', label: 'Availability', type: 'select', options: AVAILABILITY, summary: true },
    { key: 'preferredFoot', label: 'Preferred foot', type: 'text', section: 'Style' },
    { key: 'speciality', label: 'Speciality', type: 'text', section: 'Style' },
    { key: 'playingStyle', label: 'Playing style', type: 'text', section: 'Style' },
    { key: 'startingLevel', label: 'Level', type: 'select', section: 'Style', options: ['Beginner', 'Intermediate', 'Advanced', 'Expert'].map((v) => ({ value: v, label: v })) },
    { key: 'ability', label: 'Ability', type: 'number', section: 'Attributes', description: '0–99' },
    { key: 'pace', label: 'Pace', ...rating },
    { key: 'stamina', label: 'Stamina', ...rating },
    { key: 'defending', label: 'Defending', ...rating },
    { key: 'passing', label: 'Passing', ...rating },
    { key: 'dribbling', label: 'Dribbling', ...rating },
    { key: 'shooting', label: 'Shooting', ...rating },
    { key: 'keeperWilling', label: 'Will play in goal', type: 'boolean', section: 'In goal' },
    { key: 'keeperRating', label: 'Keeper rating', type: 'number', section: 'In goal', description: '0–10' },
    { key: 'jersey', label: 'Jersey number', type: 'text', section: 'Kit' },
    { key: 'kitColors', label: 'Kit colours', type: 'text', section: 'Kit' },
    { key: 'boots', label: 'Boots', type: 'text', section: 'Kit' },
    { key: 'favouritePlayer', label: 'Favourite player', type: 'text', section: 'Fan of' },
    { key: 'clubs', label: 'Clubs', type: 'text', section: 'Fan of' },
    { key: 'countries', label: 'Countries', type: 'text', section: 'Fan of' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  computeTitle: (d) => d.name,
  computeSubtitle: (d) => [d.position, AVAILABILITY.find((a) => a.value === d.availability && a.value !== 'AVL')?.label].filter(Boolean).join(' · ') || undefined,
  searchText: (d) => [d.name, d.position, d.speciality, d.clubs].filter(Boolean).join(' '),
  indexed: ['personId', 'sourceKey'],
};

/* ------------------------------------------------------------------ */

export interface VenueData {
  placeId?: string;
  name: string;
  defaultTime?: string;
  sideSize?: number;
  defaultCost?: number;
  paymentTerms: 'tentative' | 'prepaid' | 'advance_paid' | 'postpaid';
  advance?: number;
  mapsLink?: string;
  photoPath?: string;
  notes?: string;
  sourceKey?: string;
}

export const venueObject: ObjectDef<VenueData> = {
  id: 'venue',
  module: 'games',
  label: 'Venue',
  labelPlural: 'Venues',
  icon: 'location',
  color: GAMES_COLOR,
  schema: z.object({
    placeId: z.string().optional(),
    name: z.string().min(1),
    defaultTime: z.string().optional(),
    sideSize: z.coerce.number().optional(),
    defaultCost: z.coerce.number().optional(),
    paymentTerms: termsEnum.default('postpaid'),
    advance: z.coerce.number().optional(),
    mapsLink: z.string().optional(),
    photoPath: z.string().optional(),
    notes: z.string().optional(),
    sourceKey: z.string().optional(),
  }),
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'placeId', label: 'Place', type: 'link', linkTo: 'place', linkWord: 'at' },
    { key: 'defaultTime', label: 'Usual kick-off', type: 'text', summary: true },
    { key: 'sideSize', label: 'Format (a side)', type: 'number', summary: true },
    { key: 'defaultCost', label: 'Usual cost', type: 'money', summary: true },
    { key: 'paymentTerms', label: 'Booking', type: 'select', options: PAYMENT_TERMS },
    { key: 'advance', label: 'Advance', type: 'money' },
    { key: 'mapsLink', label: 'Maps link', type: 'text', section: 'Details' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  computeTitle: (d) => d.name,
  computeSubtitle: (d, { formatCurrency }) => [d.sideSize ? `${d.sideSize}-a-side` : null, d.defaultTime, d.defaultCost ? formatCurrency(d.defaultCost) : null].filter(Boolean).join(' · ') || undefined,
  searchText: (d) => [d.name, d.notes].filter(Boolean).join(' '),
  indexed: ['sourceKey'],
};

export const gamesObjects = [gameObject, appearanceObject, playerProfileObject, venueObject];
