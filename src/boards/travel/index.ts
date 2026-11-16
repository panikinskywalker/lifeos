import type { BoardManifest } from '@core/registry/types';
import { travelOverview } from './overview';
import { TravelHome } from './home';
import { UpcomingScreen } from './upcoming';
import { PackScreen } from './pack';
import { TripPage, TripsHere } from './trip';
import { TripForm } from './form';
import { travelTiles } from './tile';
import { PlanScreen } from './plan';
import { StopPage } from './stop';
import { ImportTripScreen } from './importTrip';
import { BookingsScreen } from './bookings';
import { BookingScreen } from './booking';
import { DayScreen } from './day';
import { MoneyScreen } from './money';
import { BillScreen } from './bill';
import { PrepScreen } from './prep';
import { StayScreen } from './jp/stay';
import { SpendScreen } from './jp/spend';
import { ReceiptScreen } from './jp/receipt';
import { PaybackScreen } from './jp/payback';
import { SearchScreen } from './jp/search';
import { CopilotScreen } from './jp/copilot';
import { ListenScreen } from './jp/listen';
import { ViewOnlyScreen } from './jp/viewonly';

/**
 * Companion board of the travel module, drawn to the NR-Travel-* artboards
 * (v3 Noir): the Travel home, all trips, packing, the Trip page (the whole
 * record page), the trip form, the Today tile, Trips here on a Place, and the
 * trip template's Plan (the line, the days, the map), a stop's page, Import a trip, Bookings, Money (Budget, Settle up, a Bill) and Prep.
 */
export const travelBoard: BoardManifest = {
  id: 'travel',
  module: 'travel',
  name: 'Travel',
  icon: 'airplane',
  color: 'cyan',
  placement: 'module',
  overview: travelOverview,
  tiles: travelTiles,
  screens: [
    { key: 'index', title: 'Travel', component: TravelHome },
    { key: 'upcoming', title: 'Upcoming', component: UpcomingScreen },
    { key: 'pack', title: 'Packing', component: PackScreen },
    { key: 'plan', title: 'Plan', component: PlanScreen },
    { key: 'import', title: 'Import a trip', component: ImportTripScreen },
    { key: 'bookings', title: 'Bookings', component: BookingsScreen },
    { key: 'booking', title: 'Booking', component: BookingScreen },
    { key: 'day', title: 'A day', component: DayScreen },
    { key: 'money', title: 'Money', component: MoneyScreen },
    { key: 'bill', title: 'Expense', component: BillScreen },
    { key: 'prep', title: 'Prep', component: PrepScreen },
    { key: 'stay', title: 'Stay', component: StayScreen },
    { key: 'spend', title: 'Log a spend', component: SpendScreen },
    { key: 'receipt', title: 'Split a receipt', component: ReceiptScreen },
    { key: 'payback', title: 'Pay back', component: PaybackScreen },
    { key: 'search', title: 'Search', component: SearchScreen },
    { key: 'copilot', title: 'Copilot', component: CopilotScreen },
    { key: 'listen', title: 'Copilot · voice', component: ListenScreen },
    { key: 'viewonly', title: 'View-only', component: ViewOnlyScreen },
  ],
  quickActions: [
    { id: 'travel.addTrip', label: 'Trip', icon: 'airplane', route: '/entity/trip/new' },
    { id: 'travel.import', label: 'Import a trip', icon: 'download', route: '/module/travel/import' },
  ],
  overrides: [
    { object: 'trip', form: TripForm, record: [{ entityType: 'trip', key: 'travel.trip', title: 'Trip', component: TripPage, order: 0, placement: 'page', fullScreen: true, ownLinks: true }] },
    { object: 'stop', record: [{ entityType: 'stop', key: 'travel.stop', title: 'Stop', component: StopPage, order: 0, placement: 'page', fullScreen: true, ownLinks: true }] },
    { object: 'place', record: [{ entityType: 'place', key: 'travel.tripsHere', title: 'Trips here', component: TripsHere, order: 40 }] },
  ],
};
