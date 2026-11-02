import { setCategoryTarget } from '@modules/finance/categories';
import { applyTurfSync } from '@modules/games';
import { sampleSync } from '@modules/games/fixtures/sampleSync';
import type { LifeOSContext } from '@core/registry/context';
import { fileMessage } from '@core/filing/messages';
import { BLINKIT_APP, buy, ensureSpaces, halfLeft, setLife, spaceNamed, useOne } from '@modules/inventory';
import { saveHealthDays } from '@modules/health';
import { saveUsageDays } from '@core/sources/deviceData';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
const daysAhead = (n: number) => daysAgo(-n);

/** Realistic, interconnected sample data so every widget and link has something to show. */
export function seedDemoData(os: LifeOSContext) {
  if (os.settings.get('demoSeeded', false)) return;
  os.db.transaction(() => {
    const hdfc = os.records.create({ object: 'account', title: 'HDFC Savings', data: { kind: 'bank', openingBalance: 182000, institution: 'HDFC Bank', last4: '4421', includeInNetWorth: true } });
    const card = os.records.create({ object: 'account', title: 'Amex Platinum', data: { kind: 'credit', openingBalance: 0, institution: 'American Express', creditLimit: 300000, includeInNetWorth: true } });
    const cash = os.records.create({ object: 'account', title: 'Cash', data: { kind: 'cash', openingBalance: 4000, includeInNetWorth: true } });
    os.records.create({ object: 'account', title: 'Zerodha', data: { kind: 'investment', openingBalance: 640000, institution: 'Zerodha', includeInNetWorth: true } });

    const priya = os.records.create({ object: 'person', title: 'Priya Sharma', data: { relationship: 'friend', city: 'Bengaluru', contactEvery: 14, lastContactAt: daysAgo(20), birthday: '1994-11-02' } });
    const dad = os.records.create({ object: 'person', title: 'Dad', data: { relationship: 'family', contactEvery: 7, lastContactAt: daysAgo(3) } });
    const arjun = os.records.create({ object: 'person', title: 'Arjun Mehta', data: { relationship: 'colleague', company: 'UnifyApps', role: 'Engineering', contactEvery: 30 } });
    const landlord = os.records.create({ object: 'person', title: 'Mr. Rao (landlord)', data: { relationship: 'vendor', phone: '+91 98450 00000' } });

    const japan = os.records.create({ object: 'trip', data: { destination: 'Japan', startDate: '2026-12-20', endDate: '2027-01-04', budget: 350000, purpose: 'leisure', currency: 'JPY', personIds: [priya.id] }, status: 'planning' });
    const goa = os.records.create({ object: 'trip', data: { destination: 'Goa', startDate: daysAgo(40), endDate: daysAgo(36), budget: 30000, purpose: 'leisure' }, status: 'done' });

    const lifeos = os.records.create({ object: 'project', title: 'Build LifeOS', data: { description: 'A personal operating system replacing a dozen apps.', dueDate: daysAhead(60), area: 'side' }, status: 'active' });
    const home = os.records.create({ object: 'project', title: 'Home renovation', data: { dueDate: daysAhead(120), area: 'home' }, status: 'planning' });
    const goal = os.records.create({ object: 'project', title: 'Save ₹10L emergency fund', data: { description: '₹10,00,000 put by for six months of expenses.', dueDate: '2027-03-31', area: 'personal' }, status: 'active' });
    os.records.create({ object: 'project', title: 'Run a half marathon', data: { description: '21 km, under 2 h 15 min.', dueDate: '2027-02-15', area: 'personal' }, status: 'active' });

    const tasks: Array<[string, string, string | undefined, string, string?]> = [
      ['Ship finance module', 'doing', daysAgo(0), 'high', lifeos.id],
      ['Write plugin API docs', 'todo', daysAhead(2), 'medium', lifeos.id],
      ['Test on Android', 'todo', daysAhead(1), 'high', lifeos.id],
      ['Get 3 contractor quotes', 'todo', daysAhead(10), 'medium', home.id],
      ['Renew car insurance', 'todo', daysAhead(5), 'urgent'],
      ['Call Priya', 'todo', daysAgo(1), 'medium'],
      ['Book JR Pass', 'todo', daysAhead(30), 'medium'],
      ['Set up sync server spike', 'done', daysAgo(3), 'low', lifeos.id],
    ];
    for (const [title, status, due, priority, projectId] of tasks) os.records.create({ object: 'task', title, status, data: { priority, dueDate: due, projectId } });

    const txns: Array<[number, string, string, string, string, string?, string?]> = [
      [125000, 'income', 'salary', 'UnifyApps salary', daysAgo(12), hdfc.id],
      [32000, 'expense', 'housing', 'Rent', daysAgo(11), hdfc.id],
      [1899, 'expense', 'utilities', 'Airtel fiber', daysAgo(10), card.id],
      [450, 'expense', 'food', 'Blue Tokai', daysAgo(9), card.id],
      [3200, 'expense', 'groceries', 'BigBasket', daysAgo(8), card.id],
      [1200, 'expense', 'transport', 'Petrol', daysAgo(7), card.id],
      [2600, 'expense', 'food', 'Toit with Priya', daysAgo(6), card.id, priya.id],
      [15000, 'expense', 'shopping', 'Nike', daysAgo(5), card.id],
      [649, 'expense', 'subscriptions', 'Netflix', daysAgo(4), card.id],
      [800, 'expense', 'health', 'Pharmacy', daysAgo(3), cash.id],
      [18000, 'expense', 'travel', 'JAL flight deposit', daysAgo(2), card.id],
      [560, 'expense', 'food', 'Lunch', daysAgo(1), cash.id],
      [24000, 'expense', 'travel', 'Taj Goa', daysAgo(38), card.id],
      [4200, 'expense', 'food', 'Goa dinners', daysAgo(37), cash.id],
      [118000, 'income', 'salary', 'UnifyApps salary', daysAgo(42), hdfc.id],
      [32000, 'expense', 'housing', 'Rent', daysAgo(41), hdfc.id],
      [9800, 'expense', 'shopping', 'Amazon', daysAgo(30), card.id],
      [2300, 'expense', 'entertainment', 'PVR', daysAgo(25), card.id],
    ];
    for (const [amount, kind, category, merchant, date, accountId, personId] of txns) {
      const tx = os.records.create({ object: 'transaction', data: { amount, kind, category, merchant, date, accountId, personIds: personId ? [personId] : undefined, tripId: merchant.includes('Goa') ? goa.id : merchant.includes('JAL') ? japan.id : undefined } });
      if (merchant === 'Rent') os.links.link(tx.id, landlord.id, 'person');
    }
    os.records.create({ object: 'transaction', data: { amount: 50000, kind: 'transfer', category: 'transfer', merchant: 'Card payment', date: daysAgo(6), accountId: hdfc.id, toAccountId: card.id } });

    setCategoryTarget(os, 'food', 8000);
    setCategoryTarget(os, 'shopping', 10000);
    setCategoryTarget(os, 'transport', 4000);

    os.records.create({ object: 'subscription', data: { name: 'Netflix', amount: 649, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: daysAhead(26), category: 'subscriptions', accountId: card.id }, status: 'active' });
    os.records.create({ object: 'subscription', data: { name: 'iCloud 200GB', amount: 219, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: daysAhead(3), category: 'subscriptions', accountId: card.id }, status: 'active' });
    os.records.create({ object: 'subscription', data: { name: 'Cult.fit', amount: 14000, rrule: 'FREQ=YEARLY;INTERVAL=1', nextBillingAt: daysAhead(140), category: 'health', accountId: card.id }, status: 'active' });

    const car = os.records.create({ object: 'asset', title: '2022 Hyundai Creta', data: { category: 'vehicle', purchaseDate: '2022-03-12', purchasePrice: 1450000, plate: 'KA 05 MZ 1234', odometerKm: 28400, fuel: 'petrol', nextServiceKm: 30000 }, status: 'owned' });
    os.cycles.create({ entityId: car.id, name: 'Insurance renewal', kind: 'fixed', everyN: 1, everyUnit: 'year', nextDueAt: new Date(`${daysAhead(9)}T09:00:00`).getTime(), leadDays: 30 }, 'system');
    os.records.create({ object: 'document', title: 'Car insurance policy', data: { kind: 'insurance', issuer: 'ICICI Lombard', expiresOn: daysAhead(9), assetId: car.id } });
    os.records.create({ object: 'document', title: 'Passport', data: { kind: 'id', number: 'P•••••12', expiresOn: '2031-06-10' } });
    os.records.create({ object: 'asset', title: 'MacBook Pro 14"', data: { category: 'device', purchaseDate: daysAgo(400), purchasePrice: 240000, currentValue: 170000, warrantyUntil: daysAhead(330) }, status: 'owned' });

    for (const [title, freq] of [['Morning run', 'daily'], ['Read 20 pages', 'daily'], ['No sugar', 'weekdays']] as const) {
      const h = os.records.create({ object: 'habit', title, data: { frequency: freq }, status: 'active' });
      for (let i = 1; i <= 21; i++) if ((i + title.length) % 3 !== 0) os.records.create({ object: 'habit_log', data: { habitId: h.id, date: daysAgo(i) } });
    }
    for (let i = 0; i < 6; i++) os.records.create({ object: 'workout', data: { kind: i % 2 ? 'strength' : 'run', durationMin: 30 + i * 5, date: daysAgo(i * 2 + 1), distanceKm: i % 2 ? undefined : 5 + i * 0.5 } });
    for (let i = 0; i < 8; i++) os.records.create({ object: 'measurement', data: { metric: 'weight', value: 76.4 - i * 0.2, unit: 'kg', date: daysAgo(i * 3) } });
    // Body (R6): five weeks as Health Connect and Usage access would bring them in.
    saveHealthDays(os, Array.from({ length: 35 }, (_, i) => {
      const woke = new Date();
      woke.setDate(woke.getDate() - i);
      woke.setHours(7, (i * 7) % 50, 0, 0);
      const sleepMin = 390 + ((i * 37) % 90);
      return { day: daysAgo(i), steps: i ? 5200 + ((i * 1733) % 6400) : 3100, sleepMin, sleepStart: woke.getTime() - sleepMin * 60_000, sleepEnd: woke.getTime(), restingHr: 58 + (i % 5), heartRateAvg: 72 + ((i * 3) % 9) };
    }));
    saveUsageDays(os, Array.from({ length: 21 }, (_, i) => ({ day: daysAgo(i), totalMs: (i ? 3.2 + ((i * 0.7) % 2.4) : 1.6) * 3_600_000, pickups: 60 + ((i * 11) % 40), apps: [{ package: 'com.whatsapp', label: 'WhatsApp', ms: 3_000_000 }, { package: 'com.instagram.android', label: 'Instagram', ms: 2_400_000 }, { package: 'com.google.android.youtube', label: 'YouTube', ms: 1_800_000 }] })));

    os.records.create({ object: 'note', title: 'Japan itinerary ideas', data: { body: 'Tokyo 5 nights → Hakone 1 → Kyoto 4 → Osaka 3. Book teamLab early. Try the 7-day JR pass math vs. point-to-point.', kind: 'idea' }, });
    const meeting = os.records.create({ object: 'note', title: 'Weekly sync with Arjun', data: { body: 'Discussed plugin loading strategy. Decision: manifests stay plain objects; lazy-load screens.', kind: 'meeting', projectId: lifeos.id, personIds: [arjun.id] } });
    os.links.link(meeting.id, lifeos.id, 'project');
    // Places (R3): a city in its country, areas in the city, places in the areas; events at them.
    const india = os.records.create({ object: 'place', title: 'India', data: { kind: 'country' } });
    const blr = os.records.create({ object: 'place', title: 'Bengaluru', data: { kind: 'city', parentId: india.id } });
    const indira = os.records.create({ object: 'place', title: 'Indiranagar', data: { kind: 'area', parentId: blr.id, coordinates: { lat: 12.9719, lng: 77.6412 } } });
    const kora = os.records.create({ object: 'place', title: 'Koramangala', data: { kind: 'area', parentId: blr.id } });
    os.records.create({ object: 'place', title: 'Home', data: { kind: 'home', parentId: kora.id, coordinates: { lat: 12.9352, lng: 77.6245 } } });
    const toit = os.records.create({ object: 'place', title: 'Toit', data: { kind: 'restaurant', parentId: indira.id, address: '298, 100 Feet Rd, Indiranagar', coordinates: { lat: 12.9791, lng: 77.6408 } } });
    const tokai = os.records.create({ object: 'place', title: 'Blue Tokai, Indiranagar', data: { kind: 'restaurant', parentId: indira.id, address: '12th Main, HAL 2nd Stage', coordinates: { lat: 12.9698, lng: 77.6387 } } });
    os.records.create({ object: 'place', title: 'Dome Turf', data: { kind: 'venue', parentId: kora.id, coordinates: { lat: 12.9279, lng: 77.6271 } } });
    os.records.create({ object: 'org', title: 'Toit Brewpub', data: { kind: 'restaurant', placeId: toit.id, website: 'https://toit.in' } });
    for (const [d, title, at] of [[3, 'Beers with Arjun', toit], [12, 'Coffee with Priya', tokai], [19, 'Dinner at Toit', toit], [26, 'Work from Blue Tokai', tokai]] as const) {
      const e = os.records.create({ object: 'event', title, data: { kind: 'met', startAt: Date.now() - d * 86400000 } });
      os.links.link(e.id, at.id, 'at');
    }
    os.records.create({ object: 'event', title: 'Dentist', data: { startAt: Date.now() + 2 * 86400000, location: 'Indiranagar' } });
    os.records.create({ object: 'event', title: 'Priya\'s birthday dinner', data: { startAt: Date.now() + 9 * 86400000, personIds: [priya.id] } });
    seedHome(os);

    // Money between people (M2): a household group and an IOU.
    os.records.create({ object: 'group', data: { name: 'Flat 4B', kind: 'home', memberIds: [priya.id, arjun.id] } });
    os.records.create({ object: 'debt', status: 'open', data: { personId: arjun.id, direction: 'i_owe', amount: 450, reason: 'Movie tickets', date: daysAgo(4), kind: 'loan' } });

    // Chores (M2): routines get their cycle from their own schedule.
    os.records.create({ object: 'routine', data: { name: 'Laundry', kind: 'chore', everyN: 4, everyUnit: 'day', minutes: 20, lastDoneOn: daysAgo(5) } });
    os.records.create({ object: 'routine', data: { name: 'Water the plants', kind: 'home', everyN: 3, everyUnit: 'day', minutes: 10, lastDoneOn: daysAgo(1) } });
    os.records.create({ object: 'routine', data: { name: 'Change bedsheets', kind: 'chore', everyN: 1, everyUnit: 'week', minutes: 15, weekday: '0', lastDoneOn: daysAgo(6) } });
    os.records.create({ object: 'routine', data: { name: 'Haircut', kind: 'personal', everyN: 5, everyUnit: 'week', minutes: 45, lastDoneOn: daysAgo(30) } });
    os.records.create({ object: 'routine', data: { name: 'Clean the AC filters', kind: 'home', everyN: 3, everyUnit: 'month', minutes: 30, lastDoneOn: daysAgo(70) } });

    // Deliveries (R7b): one arriving today with its OTP, one on the way.
    if (os.registry.objects.has('delivery')) {
      os.records.create({ object: 'delivery', data: { shop: 'Amazon', item: 'Philips Trimmer BT3221', carrier: 'Delhivery', tracking: '4823106745121', orderId: '403-5512345-1234567', status: 'out_for_delivery', expectedDate: daysAgo(0), otp: '739204', otpAt: Date.now() - 3_600_000, trackingUrl: 'https://amzn.in/d/7Gx2' } });
      os.records.create({ object: 'delivery', data: { shop: 'Flipkart', item: 'Nike Revolution 6', carrier: 'Ekart', orderId: 'OD128765432109876', status: 'shipped', expectedDate: daysAhead(2) } });
    }
    os.tags.apply(japan.id, 'travel');
    os.tags.apply(lifeos.id, 'side-project');
    os.tags.apply(goal.id, 'money');
    os.facts.add({ text: 'Priya prefers late Dec so we catch New Year in Kyoto.', subjectId: japan.id, source: 'user' });
    os.reminders.create({ entityId: dad.id, title: 'Call Dad', dueAt: Date.now() + 3 * 86400000, rrule: 'FREQ=WEEKLY;INTERVAL=1' });
    os.reminders.create({ entityId: car.id, title: 'Renew car insurance', dueAt: Date.now() + 5 * 86400000 });
    os.reminders.create({ title: 'Review budgets', dueAt: Date.now() + 86400000, rrule: 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1' });

    os.automation.rules.save({ name: 'Flag big spends for review', enabled: true, trigger: { id: 'core.entity.created', config: { entityType: 'transaction' } }, conditions: [{ field: 'data.amount', op: 'gt', value: 10000 }, { field: 'data.kind', op: 'eq', value: 'expense' }], actions: [{ id: 'core.addTag', config: { tag: 'review' } }, { id: 'core.createReminder', config: { title: 'Review: {{title}} ({{data.amount}})', inDays: 1 } }] });
    os.automation.rules.save({ name: 'Month close', enabled: true, trigger: { id: 'core.manual', config: { phrase: 'month close' } }, conditions: [], steps: [{ action: 'projects.createTask', config: { title: 'Pay the credit card bill', inDays: 2, priority: 'high' } }, { action: 'core.askModel', config: { prompt: 'In one short line, cheer me on for closing the month; mention the task "{{steps.s1.title}}".', maxTokens: 80, fallback: 'Month closed. {{steps.s1.title}} is on your list.' } }, { action: 'core.notify', config: { title: 'Month closed', body: '{{steps.s2.text}}' } }] });
    os.automation.rules.save({ name: 'Log contact when a shared expense is added', enabled: true, trigger: { id: 'core.entity.created', config: { entityType: 'transaction' } }, conditions: [{ field: 'data.personIds', op: 'notNull' }], actions: [{ id: 'core.addComment', config: { body: 'Shared expense logged automatically.' } }] });

    os.settings.set('demoSeeded', true);
  });
  // The Turf board's sample: a recorded Turf web sync page (made-up players), with you as Rutvij.
  if (os.registry.objects.has('game')) {
    applyTurfSync(os, sampleSync);
  }
}

/** Home (R7e): docs/design/HOME-BRIEF.md's fridge, kitchen and the rest; the butter's and the shampoo's rates; today's Blinkit order and its card. */
function seedHome(os: LifeOSContext) {
  ensureSpaces(os);
  const DAY = 86_400_000;
  const ago = (d: number, hour = 19) => {
    const t = new Date(Date.now() - d * DAY);
    t.setHours(hour, 40, 0, 0);
    return Math.min(t.getTime(), Date.now() - 60_000);
  };
  const blinkit = { source: 'order' as const, shop: 'blinkit' };
  const zepto = { source: 'order' as const, shop: 'zepto' };
  // Rates: butter lasts about 3 weeks, the shampoo a month.
  const butter = buy(os, { name: 'Amul butter', size: '100 g', at: ago(39), ...zepto });
  useOne(os, butter.id, ago(19));
  buy(os, { name: 'Amul butter', size: '100 g', at: ago(18), price: 58, ...blinkit });
  const hs = buy(os, { name: 'Head & Shoulders', size: '340 ml', at: ago(64), ...zepto });
  useOne(os, hs.id, ago(33));
  buy(os, { name: 'Head & Shoulders', size: '340 ml', at: ago(32), price: 389, ...zepto });
  // Fridge.
  buy(os, { name: 'Malai paneer', size: '200 g', at: ago(3), price: 90, ...zepto });
  buy(os, { name: 'Eggs', quantity: 12, at: ago(4), price: 96, ...zepto });
  buy(os, { name: 'Spinach', at: ago(2), price: 30, ...zepto });
  const cream = buy(os, { name: 'Amul fresh cream', size: '250 ml', at: ago(2), price: 69, ...zepto });
  halfLeft(os, cream.id);
  buy(os, { name: 'Leftover dal', at: ago(1, 21), spaceId: spaceNamed(os, 'Fridge')?.id });
  // Freezer, Kitchen, Cabinets, Bathroom, Cleaning.
  buy(os, { name: 'Frozen peas', size: '500 g', at: ago(20), ...zepto });
  buy(os, { name: 'McCain fries', size: '420 g', at: ago(20), ...zepto });
  buy(os, { name: 'Aashirvaad atta', size: '5 kg', at: ago(30), ...zepto });
  buy(os, { name: 'Basmati rice', size: '1 kg', at: ago(40) });
  buy(os, { name: 'Toor dal', size: '1 kg', at: ago(25) });
  buy(os, { name: 'Tata salt', size: '1 kg', at: ago(60) });
  const dolo = buy(os, { name: 'Dolo 650', size: 'strip of 15', at: ago(10) });
  setLife(os, dolo.id, 150);
  buy(os, { name: 'ORS', quantity: 4, at: ago(10) });
  buy(os, { name: 'Band-aids', at: ago(50) });
  buy(os, { name: 'Colgate', size: '200 g', at: ago(12) });
  buy(os, { name: 'Surf Excel Matic', size: '2 kg', at: ago(26), ...zepto });
  buy(os, { name: 'Vim bar', at: ago(26), ...zepto });
  buy(os, { name: 'Garbage bags', at: ago(26), ...zepto });
  // Today's Blinkit order (₹437), and its card in To check.
  for (const [name, size, quantity, price] of [['Mother Dairy toned milk', '1 L', 2, 148], ['Curd', '400 g', 1, 70], ['Coriander', undefined, 1, 15], ['Maggi', '70 g', 4, 56], ['Dettol handwash', '200 ml', 1, 99], ['Bread', '400 g', 1, 49]] as const) {
    buy(os, { name, size, quantity, price, at: ago(0, 18), ...blinkit });
  }
  fileMessage(os, { source: 'notification', from: BLINKIT_APP, title: 'Order delivered', body: 'Your Blinkit order of ₹437 has been delivered. Enjoy!', receivedAt: ago(0, 18) });
  // Clothes are Assets (R7a), kept in Clothes: 6 shirts (2 in the wash), 3 jeans, the Turf kit packed for Thursday.
  const clothes = spaceNamed(os, 'Clothes')?.id;
  if (clothes && os.registry.objects.has('asset')) {
    for (const [title, state] of [['White oxford shirt', 'clean'], ['Blue linen shirt', 'wash'], ['Black polo', 'clean'], ['Checked flannel shirt', 'clean'], ['Grey tee', 'wash'], ['Olive kurta', 'clean'], ['Dark blue jeans', 'clean'], ['Black jeans', 'clean'], ['Light jeans', 'wash'], ['Turf kit', 'packed'], ['The bibs', 'packed']] as const) {
      os.records.create({ object: 'asset', title, data: { category: 'clothing', spaceId: clothes, state }, status: 'owned' });
    }
  }
}
