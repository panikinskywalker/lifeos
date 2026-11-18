import type { BoardManifest } from '@core/registry/types';
import { travelOverview } from './overview';
import { TravelHome } from './home';
import { UpcomingScreen } from './upcoming';
import { PackScreen } from './pack';
import { TripPage, TripsHere } from './trip';
import { TripForm } from './form';
import { travelTiles } from './tile';
import { StopPage } from './stop';
import { ImportTripScreen } from './importTrip';
import { BookingScreen } from './booking';
import { DayScreen } from './day';
import { BillScreen } from './bill';
import { sectionRoute } from './jp/host';
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
  // Every screen but Travel home draws its own bottom (the trip bar, or none), so the app's bar stays off them.
  screens: [
    { key: 'index', title: 'Travel', component: TravelHome },
    { key: 'upcoming', title: 'Upcoming', component: UpcomingScreen, noBar: true },
    { key: 'pack', title: 'Packing', component: PackScreen, noBar: true },
    { key: 'plan', title: 'Plan', component: sectionRoute('plan'), noBar: true },
    { key: 'import', title: 'Import a trip', component: ImportTripScreen, noBar: true },
    { key: 'bookings', title: 'Bookings', component: sectionRoute('bookings'), noBar: true },
    { key: 'booking', title: 'Booking', component: BookingScreen, noBar: true },
    { key: 'day', title: 'A day', component: DayScreen, noBar: true },
    { key: 'money', title: 'Money', component: sectionRoute('money'), noBar: true },
    { key: 'bill', title: 'Expense', component: BillScreen, noBar: true },
    { key: 'prep', title: 'Prep', component: sectionRoute('prep'), noBar: true },
    { key: 'stay', title: 'Stay', component: StayScreen, noBar: true },
    { key: 'spend', title: 'Log a spend', component: SpendScreen, noBar: true },
    { key: 'receipt', title: 'Split a receipt', component: ReceiptScreen, noBar: true },
    { key: 'payback', title: 'Pay back', component: PaybackScreen, noBar: true },
    { key: 'search', title: 'Search', component: SearchScreen, noBar: true },
    { key: 'copilot', title: 'Copilot', component: CopilotScreen, noBar: true },
    { key: 'listen', title: 'Copilot · voice', component: ListenScreen, noBar: true },
    { key: 'viewonly', title: 'View-only', component: ViewOnlyScreen, noBar: true },
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
