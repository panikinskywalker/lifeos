import type { ModuleManifest } from '@core/registry/types';
import { INVENTORY_COLOR, spaceType, stockType } from './types';
import { ensureSpaces } from './stock';
import { foldItems } from './fold';
import { groceryOrderParser } from './groceries';
import { inventoryAiTools } from './aiTools';

export * from './types';
export * from './stock';
export * from './nudges';
export { foldItems } from './fold';
export { BLINKIT_APP, HOME_ORDER, HOME_STOCKED, groceryOrderParser, orderAskOf, parseBlinkitInvoice, readInvoice, stockFromInvoice, stockedNoteOf, undoStocked, type Invoice, type InvoiceLine, type OrderAsk, type StockedNote } from './groceries';

/**
 * Home (module id `inventory`; docs/MODEL.md §2 Things and layer 8, R7e):
 * Stock and Space, the fold from the old `item` Object, the Blinkit order
 * card and invoice, and Home's tools. Its companion board draws Home.
 */
export const inventoryModule: ModuleManifest = {
  id: 'inventory',
  name: 'Home',
  version: '2.0.0',
  description: 'Everything kept at home, in spaces: what to use soon, what’s running low, the shopping list.',
  icon: 'home',
  color: INVENTORY_COLOR,
  objects: [stockType, spaceType],
  aiTools: inventoryAiTools,
  filing: { parsers: [groceryOrderParser] },
  onStart: (os) => {
    // R7e, once: the seven spaces, and the old items folded into Stock.
    if (!os.settings.get<boolean>('inventory.r7e', false)) {
      foldItems(os);
      os.settings.set('inventory.r7e', true);
    } else ensureSpaces(os);
  },
};
