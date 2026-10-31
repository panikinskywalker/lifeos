import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { fileMessage } from '@core/filing/messages';
import { crmModule } from '../crm';
import { placesModule } from '../places';
import { financeModule } from '../finance';
import { notificationsSource } from '../finance/sources';
import {
  BLINKIT_APP,
  HOME_ORDER,
  HOME_STOCKED,
  addFromLine,
  addToList,
  buy,
  estimatedLife,
  findStock,
  goingOffCandidates,
  halfLeft,
  homeNudges,
  inventoryModule,
  isoDay,
  justCameIn,
  listText,
  orderAskOf,
  parseBlinkitInvoice,
  parseStockLine,
  productKey,
  purchases,
  runningLow,
  runningOutCandidates,
  shoppingList,
  spaceNamed,
  spaces,
  stillGood,
  stockFromInvoice,
  stockState,
  undoStock,
  undoStocked,
  useOne,
  type StockData,
} from '.';
import { inventoryAiTools } from './aiTools';

const DAY = 86_400_000;
const ago = (n: number) => Date.now() - n * DAY;
let os: LifeOSContext;

async function boot(modules: ModuleManifest[] = [crmModule, placesModule, financeModule, inventoryModule]) {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules, registry: new Registry() });
}
beforeEach(async () => boot());
afterEach(() => os.db.close());

const stock = (name: string) => findStock(os, name)!;
const tool = (name: string) => inventoryAiTools.find((t) => t.name === name)!;

describe('Stock and spaces', () => {
  it('the seven spaces are made once, Fridge and Kitchen first; Clothes holds Assets', () => {
    expect(spaces(os).map((s) => s.title)).toEqual(['Fridge', 'Kitchen', 'Freezer', 'Cabinets', 'Bathroom', 'Cleaning', 'Clothes']);
    expect(spaceNamed(os, 'clothes')!.data.holds).toBe('clothes');
  });

  it('a product is the same with sizes, case and plurals ignored', () => {
    expect(productKey('Amul Butter 100g')).toBe(productKey('amul butter'));
    expect(productKey('Eggs')).toBe(productKey('egg'));
    expect(productKey('Tomatoes 500 g')).toBe('tomato');
  });

  it('shelf lives are estimated by name; salt does not go off', () => {
    expect(estimatedLife('Mother Dairy toned milk')).toBe(3);
    expect(estimatedLife('Malai paneer')).toBe(4);
    expect(estimatedLife('Amul butter')).toBe(30);
    expect(estimatedLife('Tata salt')).toBeNull();
    expect(estimatedLife('Milk powder')).toBeNull();
  });
});

describe('several from one line', () => {
  it('reads counts, sizes and words', () => {
    expect(parseStockLine('eggs, butter, 2 milk')).toEqual([
      { name: 'Eggs', quantity: 1 },
      { name: 'Butter', quantity: 1 },
      { name: 'Milk', quantity: 2 },
    ]);
    expect(parseStockLine('a dozen eggs and paneer 200g; milk x2, 1L curd')).toEqual([
      { name: 'Eggs', quantity: 12 },
      { name: 'Paneer', quantity: 1, size: '200 g' },
      { name: 'Milk', quantity: 2 },
      { name: 'Curd', quantity: 1, size: '1 L' },
    ]);
    expect(parseStockLine('Head & Shoulders')).toEqual([{ name: 'Head & Shoulders', quantity: 1 }]);
  });

  it('each goes to the space its name suggests; a rebuy adds to the same record', () => {
    addFromLine(os, 'eggs, butter, 2 milk, surf excel, dolo 650, frozen peas, atta');
    const where = (n: string) => os.records.get(stock(n).data.spaceId!)!.title;
    expect(['Eggs', 'Butter', 'Milk', 'Surf excel', 'Dolo 650', 'Frozen peas', 'Atta'].map(where)).toEqual(['Fridge', 'Fridge', 'Fridge', 'Cleaning', 'Cabinets', 'Freezer', 'Kitchen']);
    addFromLine(os, 'milk');
    expect(os.records.query('stock').filter((s) => productKey(s.title) === 'milk')).toHaveLength(1);
    expect(stock('milk').data.quantity).toBe(3);
    expect(purchases(os, stock('milk').id)).toHaveLength(2);
  });

  it('the add_stock tool adds, and its Undo takes it all back', async () => {
    const out = (await tool('add_stock').run({ line: 'coriander, 2 curd' }, os)) as { added: string[] };
    expect(out.added).toEqual(['Coriander', 'Curd']);
    const undo = Object.getOwnPropertySymbols(out).map((s) => (out as never)[s]).find((v) => typeof v === 'function') as unknown as () => void;
    undo();
    expect(os.records.query('stock')).toHaveLength(0);
  });
});

describe('state from bought on and life', () => {
  const d = (boughtDaysAgo: number, lifeDays?: number, extra: Partial<StockData> = {}): StockData => ({ quantity: 1, boughtOn: isoDay(ago(boughtDaysAgo)), lifeDays, ...extra });

  it('fresh · use soon (last 2 days) · probably gone (past its life) · used up', () => {
    expect(stockState(d(0, 4)).state).toBe('fresh');
    expect(stockState(d(2, 4))).toMatchObject({ state: 'use soon', daysLeft: 2, estimated: true });
    expect(stockState(d(4, 4))).toMatchObject({ state: 'use soon', daysLeft: 0 });
    expect(stockState(d(5, 4)).state).toBe('probably gone');
    expect(stockState(d(1, 3, { quantity: 0 })).state).toBe('used up');
    expect(stockState(d(400)).state).toBe('fresh'); // no life: salt
  });

  it('a long life warns in its last tenth (a medicine’s last 50 days); yours is not a guess', () => {
    expect(stockState(d(460, 500, { lifeBy: 'yours' }))).toMatchObject({ state: 'use soon', estimated: false });
    expect(stockState(d(400, 500)).state).toBe('fresh');
  });

  it('still good holds for 2 days, then it is probably gone again', () => {
    const gone = d(6, 4, { checkedOn: isoDay(ago(1)) });
    expect(stockState(gone)).toMatchObject({ state: 'use soon', daysLeft: 1 });
    expect(stockState({ ...gone, checkedOn: isoDay(ago(3)) }).state).toBe('probably gone');
  });
});

describe('the rate, used up and half left', () => {
  it('a rebuy adds to what is left, unless that is probably gone or its rate nearly up', () => {
    const milk = buy(os, { name: 'Milk', at: ago(1) });
    buy(os, { name: 'Milk' });
    expect(stock('Milk').data.quantity).toBe(2);
    buy(os, { name: 'Malai paneer', at: ago(6) }); // keeps 4: probably gone
    buy(os, { name: 'Malai paneer' });
    expect(stock('Malai paneer').data.quantity).toBe(1);
    expect(milk.created).toBe(true);
  });

  it('learns how long one lasts from purchases and used up; running low near the end', () => {
    buy(os, { name: 'Amul butter', size: '100 g', at: ago(60) });
    buy(os, { name: 'Amul butter', at: ago(39) });
    const b = stock('Amul butter');
    expect(b.data.rateDays).toBe(21);
    // Used up after 21 days, bought again 18 days ago.
    useOne(os, b.id, ago(39) + 21 * DAY);
    buy(os, { name: 'Amul butter', at: ago(18) });
    const now = stock('Amul butter');
    expect(now.data.rateDays).toBe(21);
    expect(runningLow(now.data)).toEqual({ low: true, why: 'every 3 wk · 18 d', dueIn: 3 });
    expect(runningLow({ ...now.data, boughtOn: isoDay(ago(10)) }).low).toBe(false);
  });

  it('tap uses one; the last one is used up; Undo puts it back exactly', () => {
    const { id } = buy(os, { name: 'Mother Dairy toned milk', quantity: 2 });
    const one = useOne(os, id)!;
    expect(os.records.get<StockData>(id)!.data.quantity).toBe(1);
    const last = useOne(os, id)!;
    expect(os.records.get<StockData>(id)!.data).toMatchObject({ quantity: 0, usedUpOn: isoDay(Date.now()) });
    expect(stockState(os.records.get<StockData>(id)!.data).state).toBe('used up');
    undoStock(os, last);
    expect(os.records.get<StockData>(id)!.data.quantity).toBe(1);
    expect(os.records.get<StockData>(id)!.data.usedUpOn).toBeUndefined();
    expect(os.records.timeline.forEntity(id).some((e) => e.kind === 'used up')).toBe(false);
    undoStock(os, one);
    expect(os.records.get<StockData>(id)!.data.quantity).toBe(2);
  });

  it('half left halves the last one, once', () => {
    const { id } = buy(os, { name: 'Amul fresh cream' });
    expect(halfLeft(os, id)).not.toBeNull();
    expect(os.records.get<StockData>(id)!.data.quantity).toBe(0.5);
    expect(halfLeft(os, id)).toBeNull();
    expect(runningLow(os.records.get<StockData>(id)!.data)).toMatchObject({ low: true, why: 'half left' });
  });

  it('still good on paneer past its life makes it use soon again', () => {
    const { id } = buy(os, { name: 'Malai paneer', at: ago(6) });
    expect(stockState(os.records.get<StockData>(id)!.data).state).toBe('probably gone');
    stillGood(os, id);
    expect(stockState(os.records.get<StockData>(id)!.data).state).toBe('use soon');
  });
});

describe('nudge candidates (plain functions; the brain calls them later)', () => {
  beforeEach(() => {
    buy(os, { name: 'Malai paneer', at: ago(3) }); // keeps 4: use by tomorrow
    buy(os, { name: 'Spinach', at: ago(3) }); // keeps 3: use today
    buy(os, { name: 'Milk', at: ago(5) }); // keeps 3: probably gone
    const butter = buy(os, { name: 'Amul butter', at: ago(39) });
    useOne(os, butter.id, ago(19));
    buy(os, { name: 'Amul butter', at: ago(18) }); // lasts 20 d: every 3 wk · 18 d
    buy(os, { name: 'Tata salt' });
  });

  it('going off: soonest first, with the line and why', () => {
    const g = goingOffCandidates(os);
    expect(g.map((n) => n.title)).toEqual(['Milk', 'Spinach', 'Malai paneer']);
    expect(g[1]).toMatchObject({ line: expect.stringMatching(/^Spinach: bought \w+, use today$/), urgent: true });
    expect(g[2]!.line).toMatch(/use by tomorrow$/);
    expect(g[0]!.line).toMatch(/probably gone — still there\?$/);
  });

  it('running out: the butter', () => {
    expect(runningOutCandidates(os).map((n) => [n.title, n.why, n.line])).toEqual([['Amul butter', 'every 3 wk · 18 d', "Amul butter: you rebuy every 3 wk, it's been 18 days"]]);
  });

  it('two a day for Home: urgent first', () => {
    expect(homeNudges(os).map((n) => n.title)).toEqual(['Spinach', 'Malai paneer']);
  });

  it('the tools: stock_low, use_soon, whats_in(space)', async () => {
    expect(((await tool('stock_low').run({}, os)) as { things: Array<{ title: string }> }).things.map((t) => t.title)).toEqual(['Amul butter']);
    expect(((await tool('use_soon').run({}, os)) as { things: unknown[] }).things).toHaveLength(3);
    const fridge = (await tool('whats_in').run({ space: 'fridge' }, os)) as { space: string; things: Array<{ title: string; state: string }> };
    expect(fridge.space).toBe('Fridge');
    expect(fridge.things.map((t) => t.title).sort()).toEqual(['Amul butter', 'Malai paneer', 'Milk', 'Spinach']);
    expect(((await tool('whats_in').run({ space: 'Attic' }, os)) as { error: string }).error).toBe('No such space');
  });

  it('the shopping list: yours first, then suggestions; used-up things you rebuy stay on it', () => {
    addToList(os, 'Dishwasher salt');
    const milk = stock('Milk');
    useOne(os, milk.id);
    buy(os, { name: 'Milk', at: ago(4) }); // a rate of 1 day… then used up
    useOne(os, stock('Milk').id);
    const list = shoppingList(os);
    expect(list.map((e) => [e.stock.title, e.suggested])).toEqual([
      ['Dishwasher salt', false],
      ['Amul butter', true],
      ['Milk', true],
    ]);
    expect(listText(list)).toBe('Dishwasher salt\nAmul butter\nMilk');
  });
});

describe('the R7e fold: old items become Stock', () => {
  it('in place, once: location → space, expires → your life, restock-below → on the list', async () => {
    bus.clear();
    const db = createBetterSqliteAdapter(':memory:');
    const itemType = { id: 'item', module: 'inventory', label: 'Item', labelPlural: 'Items', icon: 'box', schema: z.object({}).passthrough(), fields: [] };
    const before = await createLifeOS({ db, modules: [{ id: 'inventory', name: 'Inventory', version: '1.0.0', description: '', icon: 'box', color: 'teal', objects: [itemType] }], registry: new Registry() });
    const coffee = before.records.create({ object: 'item', title: 'Coffee beans', data: { quantity: 1, unit: 'kg', location: 'Kitchen', category: 'pantry', minQuantity: 1 } });
    const pills = before.records.create({ object: 'item', title: 'Paracetamol', data: { quantity: 4, unit: 'strips', location: 'Medicine box', category: 'medicine', minQuantity: 2, expiresOn: isoDay(Date.now() + 100 * DAY) } });
    before.cycles.create({ entityId: pills.id, name: 'Use or replace', kind: 'fixed', nextDueAt: Date.now() + 100 * DAY });
    os.db.close();
    bus.clear();
    os = await createLifeOS({ db, modules: [inventoryModule], registry: new Registry() });
    const c = os.records.get<StockData>(coffee.id)!;
    const p = os.records.get<StockData>(pills.id)!;
    expect(c).toMatchObject({ object: 'stock', title: 'Coffee beans', data: { quantity: 1, size: 'kg', onList: true, source: 'you' } });
    expect(os.records.get(c.data.spaceId!)!.title).toBe('Kitchen');
    expect(os.records.get(p.data.spaceId!)!.title).toBe('Medicine box');
    expect(p.data).toMatchObject({ lifeDays: 100, lifeBy: 'yours', quantity: 4 });
    expect(p.data.onList).toBeUndefined();
    expect((p.data as unknown as Record<string, unknown>).category).toBeUndefined();
    expect(os.cycles.forEntity(p.id)).toHaveLength(0);
    expect(os.links.forEntity(p.id, 'kept_in')[0]!.other.title).toBe('Medicine box');
    expect(os.settings.get('inventory.r7e', false)).toBe(true);
  });
});

describe('groceries in: Blinkit', () => {
  const SMS = `Sent Rs.437.00\nFrom HDFC Bank A/C *1234\nTo BLINKIT\nOn ${isoDay(Date.now()).slice(8, 10)}/${isoDay(Date.now()).slice(5, 7)}/${isoDay(Date.now()).slice(2, 4)}\nRef 630412345678\nNot You? Call 18002586161`;
  const INVOICE = `Tax Invoice
Blink Commerce Private Limited
Order Id: 5208734612
Invoice Number: BCPL/2627/1184529
Invoice Date: 30-Oct-2026
Sr. no UPC Item Description MRP Discount Qty Taxable Value CGST SGST Cess Total
1 8901262010016 Amul Butter 100 g 58.00 0.00 1 49.15 4.42 4.42 0.00 58.00
2 8901262150125 Amul Taaza Toned Milk 1 L 74.00 0.00 2 140.95 3.52 3.52 0.00 148.00
3 8904004400311 Malai Paneer 200 g 90.00 5.00 1 80.95 2.02 2.02 0.00 85.00
4 Eggs 6 pcs 54.00 0.00 2 108.00 0.00 0.00 0.00 108.00
5 8901030865237 Surf Excel Matic Liquid 1 L 230.00 20.00 1 177.97 16.02 16.02 0.00 210.00
6 Colgate Strong Teeth Toothpaste 200 g 110.00 12.00 1 83.05 7.47 7.47 0.00 98.00
7 Fresh Coriander Bunch 100 g 15.00 0.00 1 15.00 0.00 0.00 0.00 15.00
8 Handling Charge 9.00 0.00 1 7.63 0.69 0.69 0.00 9.00
Invoice Value 731.00`;

  it('reads a (plausible) Blinkit invoice: lines, sizes, quantities, fees dropped', () => {
    const inv = parseBlinkitInvoice(INVOICE)!;
    expect(inv).toMatchObject({ shop: 'blinkit', orderId: '5208734612', date: '2026-10-30', total: 731 });
    expect(inv.lines.map((l) => [l.name, l.size, l.quantity, l.price])).toEqual([
      ['Amul Butter', '100 g', 1, 58],
      ['Amul Taaza Toned Milk', '1 L', 2, 148],
      ['Malai Paneer', '200 g', 1, 85],
      ['Eggs', '6 pcs', 2, 108],
      ['Surf Excel Matic Liquid', '1 L', 1, 210],
      ['Colgate Strong Teeth Toothpaste', '200 g', 1, 98],
      ['Fresh Coriander Bunch', '100 g', 1, 15],
    ]);
    expect(parseBlinkitInvoice('Zepto invoice\n1 Milk 30.00 1 30.00')).toBeNull();
  });

  it('a bank SMS naming Blinkit: finance files the payment, Home asks for the invoice, linked to it', () => {
    fileMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: SMS, receivedAt: Date.now() });
    const tx = os.records.query<{ amount: number }>('transaction')[0]!;
    expect(tx.data.amount).toBe(437);
    const card = os.filings.ofKind(HOME_ORDER)[0]!;
    expect(card).toMatchObject({ entityId: tx.id, flag: 'Share the invoice and I’ll stock the fridge' });
    expect(card.label).toMatch(/^Blinkit · ₹437 · paid /);
    // The delivery notification an hour later is the same order: one card, now "just delivered".
    fileMessage(os, { source: 'notification', from: BLINKIT_APP, title: 'Order delivered', body: 'Your order has been delivered. Enjoy!', receivedAt: Date.now() + 3_600_000 });
    const cards = os.filings.ofKind(HOME_ORDER);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.label).toBe('Blinkit · ₹437 · just delivered');
    expect(os.records.query('transaction')).toHaveLength(1);
  });

  it('the notification alone makes the card, and no payment; a refund SMS is not an order', () => {
    fileMessage(os, { source: 'notification', from: BLINKIT_APP, title: 'Delivered!', body: 'Your Blinkit order of ₹437 has been delivered', receivedAt: Date.now() });
    expect(os.filings.ofKind(HOME_ORDER).map((f) => [f.label, f.entityId])).toEqual([['Blinkit · ₹437 · just delivered', null]]);
    expect(os.records.query('transaction')).toHaveLength(0);
    fileMessage(os, { source: 'notification', from: BLINKIT_APP, title: 'Your order is on the way', body: 'Arriving in 8 minutes', receivedAt: Date.now() });
    expect(os.filings.ofKind(HOME_ORDER)).toHaveLength(1);
    fileMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Rs.58.00 refund from BLINKIT credited to HDFC Bank A/C *1234', receivedAt: Date.now() + 10 * DAY });
    expect(os.filings.ofKind(HOME_ORDER)).toHaveLength(1);
  });

  it('the shared invoice stocks Home, linked to the order; the card leaves To check; Undo takes it back', () => {
    buy(os, { name: 'Amul butter', at: ago(21) });
    fileMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: SMS, receivedAt: Date.now() });
    const tx = os.records.query('transaction')[0]!;
    const card = os.filings.ofKind(HOME_ORDER)[0]!;
    const r = stockFromInvoice(os, INVOICE, { at: Date.now() })!;
    expect(r.label).toBe('7 things from Blinkit · Fridge 5 · Cleaning 1 · Bathroom 1');
    expect(os.filings.get(card.id)!.checked).toBe(true);
    const butter = stock('Amul butter');
    expect(butter.data).toMatchObject({ quantity: 2, source: 'order', shop: 'blinkit', orderId: tx.id, price: 58, rateDays: 21 });
    expect(os.links.forEntity(butter.id, 'bought_in')[0]!.other.id).toBe(tx.id);
    expect(stock('Amul Taaza Toned Milk').data).toMatchObject({ quantity: 2, lifeDays: 3, lifeBy: 'estimated' });
    expect(justCameIn(os)).toMatchObject({ shop: 'Blinkit', orderId: tx.id, amount: 437 });
    expect(justCameIn(os)!.things).toHaveLength(7);
    const stocked = os.filings.ofKind(HOME_STOCKED)[0]!;
    undoStocked(os, stocked.id);
    expect(stock('Amul butter').data).toMatchObject({ quantity: 1, source: 'you' });
    expect(stock('Amul butter').data.orderId).toBeUndefined();
    expect(findStock(os, 'Eggs')).toBeUndefined();
    expect(os.filings.get(card.id)!.checked).toBe(false);
    expect(orderAskOf(os.filings.get(card.id)!)).toMatchObject({ shop: 'blinkit', amount: 437 });
  });

  it('the notifications source listens to Blinkit as well as the payment apps', async () => {
    let allow: string[] = [];
    (os as { device?: unknown }).device = { notifications: { access: () => true, setAllowlist: (p: string[]) => (allow = p), drain: () => [] } };
    await notificationsSource.sync(os, null, { mode: 'live' });
    expect(allow).toContain(BLINKIT_APP);
    expect(allow).toContain('com.google.android.apps.nbu.paisa.user');
  });
});
