import type { LifeOSContext } from '@core/registry/context';

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
    const goal = os.records.create({ object: 'goal', title: 'Save ₹10L emergency fund', data: { targetValue: 1000000, currentValue: 640000, unit: '₹', targetDate: '2027-03-31', area: 'money' }, status: 'active' });
    os.records.create({ object: 'goal', title: 'Run a half marathon', data: { targetValue: 21, currentValue: 12, unit: 'km', targetDate: '2027-02-15', area: 'health' }, status: 'active' });

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

    os.records.create({ object: 'budget', data: { category: 'food', amount: 8000, period: 'monthly' } });
    os.records.create({ object: 'budget', data: { category: 'shopping', amount: 10000, period: 'monthly' } });
    os.records.create({ object: 'budget', data: { category: 'transport', amount: 4000, period: 'monthly' } });

    os.records.create({ object: 'subscription', data: { name: 'Netflix', amount: 649, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: daysAhead(26), category: 'subscriptions', accountId: card.id }, status: 'active' });
    os.records.create({ object: 'subscription', data: { name: 'iCloud 200GB', amount: 219, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: daysAhead(3), category: 'subscriptions', accountId: card.id }, status: 'active' });
    os.records.create({ object: 'subscription', data: { name: 'Cult.fit', amount: 14000, rrule: 'FREQ=YEARLY;INTERVAL=1', nextBillingAt: daysAhead(140), category: 'health', accountId: card.id }, status: 'active' });

    const car = os.records.create({ object: 'vehicle', data: { make: 'Hyundai', model: 'Creta', year: 2022, plate: 'KA 05 MZ 1234', odometerKm: 28400, fuel: 'petrol', insuranceUntil: daysAhead(9), nextServiceKm: 30000 } });
    os.records.create({ object: 'document', title: 'Car insurance policy', data: { kind: 'insurance', issuer: 'ICICI Lombard', expiresOn: daysAhead(9), assetId: car.id } });
    os.records.create({ object: 'document', title: 'Passport', data: { kind: 'id', number: 'P•••••12', expiresOn: '2031-06-10' } });
    os.records.create({ object: 'asset', title: 'MacBook Pro 14"', data: { category: 'electronics', purchaseDate: daysAgo(400), purchasePrice: 240000, currentValue: 170000, warrantyUntil: daysAhead(330) }, status: 'owned' });

    for (const [title, freq] of [['Morning run', 'daily'], ['Read 20 pages', 'daily'], ['No sugar', 'weekdays']] as const) {
      const h = os.records.create({ object: 'habit', title, data: { frequency: freq }, status: 'active' });
      for (let i = 1; i <= 21; i++) if ((i + title.length) % 3 !== 0) os.records.create({ object: 'habit_log', data: { habitId: h.id, date: daysAgo(i) } });
    }
    for (let i = 0; i < 6; i++) os.records.create({ object: 'workout', data: { kind: i % 2 ? 'strength' : 'run', durationMin: 30 + i * 5, date: daysAgo(i * 2 + 1), distanceKm: i % 2 ? undefined : 5 + i * 0.5 } });
    for (let i = 0; i < 8; i++) os.records.create({ object: 'measurement', data: { metric: 'weight', value: 76.4 - i * 0.2, unit: 'kg', date: daysAgo(i * 3) } });

    os.records.create({ object: 'note', title: 'Japan itinerary ideas', data: { body: 'Tokyo 5 nights → Hakone 1 → Kyoto 4 → Osaka 3. Book teamLab early. Try the 7-day JR pass math vs. point-to-point.', kind: 'idea' }, });
    const meeting = os.records.create({ object: 'note', title: 'Weekly sync with Arjun', data: { body: 'Discussed plugin loading strategy. Decision: manifests stay plain objects; lazy-load screens.', kind: 'meeting', projectId: lifeos.id, personIds: [arjun.id] } });
    os.links.link(meeting.id, lifeos.id, 'project');
    os.records.create({ object: 'event', title: 'Dentist', data: { startAt: Date.now() + 2 * 86400000, location: 'Indiranagar' } });
    os.records.create({ object: 'event', title: 'Priya\'s birthday dinner', data: { startAt: Date.now() + 9 * 86400000, personIds: [priya.id] } });
    os.records.create({ object: 'item', title: 'Paracetamol', data: { quantity: 4, unit: 'strips', location: 'Medicine box', category: 'medicine', minQuantity: 2 } });
    os.records.create({ object: 'item', title: 'Coffee beans', data: { quantity: 1, unit: 'kg', location: 'Kitchen', category: 'pantry', minQuantity: 1 } });

    // Money between people (M2): a household group and an IOU.
    os.records.create({ object: 'group', data: { name: 'Flat 4B', kind: 'home', memberIds: [priya.id, arjun.id] } });
    os.records.create({ object: 'debt', status: 'open', data: { personId: arjun.id, direction: 'i_owe', amount: 450, reason: 'Movie tickets', date: daysAgo(4), kind: 'loan' } });

    // Chores (M2): routines get their cycle from their own schedule.
    os.records.create({ object: 'routine', data: { name: 'Laundry', kind: 'chore', everyN: 4, everyUnit: 'day', minutes: 20, lastDoneOn: daysAgo(5) } });
    os.records.create({ object: 'routine', data: { name: 'Water the plants', kind: 'home', everyN: 3, everyUnit: 'day', minutes: 10, lastDoneOn: daysAgo(1) } });
    os.records.create({ object: 'routine', data: { name: 'Change bedsheets', kind: 'chore', everyN: 1, everyUnit: 'week', minutes: 15, weekday: '0', lastDoneOn: daysAgo(6) } });
    os.records.create({ object: 'routine', data: { name: 'Haircut', kind: 'personal', everyN: 5, everyUnit: 'week', minutes: 45, lastDoneOn: daysAgo(30) } });
    os.records.create({ object: 'routine', data: { name: 'Clean the AC filters', kind: 'home', everyN: 3, everyUnit: 'month', minutes: 30, lastDoneOn: daysAgo(70) } });

    os.tags.apply(japan.id, 'travel');
    os.tags.apply(lifeos.id, 'side-project');
    os.tags.apply(goal.id, 'money');
    os.comments.add(japan.id, 'Priya prefers late Dec so we catch New Year in Kyoto.');
    os.reminders.create({ entityId: dad.id, title: 'Call Dad', dueAt: Date.now() + 3 * 86400000, rrule: 'FREQ=WEEKLY;INTERVAL=1' });
    os.reminders.create({ entityId: car.id, title: 'Renew car insurance', dueAt: Date.now() + 5 * 86400000 });
    os.reminders.create({ title: 'Review budgets', dueAt: Date.now() + 86400000, rrule: 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1' });

    os.automation.rules.save({ name: 'Flag big spends for review', enabled: true, trigger: { id: 'core.entity.created', config: { entityType: 'transaction' } }, conditions: [{ field: 'data.amount', op: 'gt', value: 10000 }, { field: 'data.kind', op: 'eq', value: 'expense' }], actions: [{ id: 'core.addTag', config: { tag: 'review' } }, { id: 'core.createReminder', config: { title: 'Review: {{title}} ({{data.amount}})', inDays: 1 } }] });
    os.automation.rules.save({ name: 'Log contact when a shared expense is added', enabled: true, trigger: { id: 'core.entity.created', config: { entityType: 'transaction' } }, conditions: [{ field: 'data.personIds', op: 'notNull' }], actions: [{ id: 'core.addComment', config: { body: 'Shared expense logged automatically.' } }] });

    os.settings.set('demoSeeded', true);
  });
}
