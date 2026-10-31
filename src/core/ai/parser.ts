import type { LifeOSContext } from '../registry/context';
import { clearMatch, pickCycle, resolveCandidates } from './lifeTools';
import type { ReplyCard } from './cards';

/**
 * Parser first (SCOPE v2 B5): the everyday sentences are understood on the
 * phone — no network, no cost — and turned into the same tool calls the
 * model would make, so confirmation, cards and Undo behave identically.
 * Anything it isn't sure about (an ambiguous name, an odd phrasing) returns
 * null and goes to the model.
 */

export interface PlannedCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ParsedPlan {
  intent: string;
  /** Steps run in order; each sees the results so far and may return null to stop. */
  steps: Array<(results: unknown[]) => PlannedCall | null>;
  /** The reply once the steps ran (declined = a confirm was refused). */
  reply: (results: unknown[], declined: boolean) => string;
  /** A card to show without running a tool (e.g. "add a vehicle" → the new-vehicle form). */
  card?: ReplyCard;
}

const today = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** "6,400" / "₹6.4k" / "rs 450" → 6400 / 6400 / 450. Skips numbers that are days or km. */
export function parseAmount(text: string): number | null {
  const re = /(?:₹|rs\.?\s?|inr\s?)?(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![,.]?\d)\s*(k|lakh|l)?\b(?!\s*(?:days?|weeks?|months?|years?|km|kms|kilometres?|kilometers?|%|am|pm|th|st|nd|rd))/gi;
  for (const m of text.matchAll(re)) {
    let n = Number(m[1]!.replace(/,/g, ''));
    const unit = (m[2] ?? '').toLowerCase();
    if (unit === 'k') n *= 1000;
    if (unit === 'lakh' || unit === 'l') n *= 100000;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

const DATE_WORDS: Array<[RegExp, number]> = [[/\btoday\b/i, 0], [/\byesterday\b/i, -1], [/\bday before yesterday\b/i, -2]];
function parseDay(text: string): string | undefined {
  for (const [re, off] of DATE_WORDS) if (re.test(text)) return today(off);
  return undefined;
}

/** Strip amount, date words, "at <vendor>" and filler so what's left names the thing. */
function cleanPhrase(text: string): { phrase: string; vendor?: string } {
  let t = text.replace(/[.!?]+$/, '');
  const vendor = /\bat\s+([A-Za-z][\w&'.\- ]{1,40})$/i.exec(t.replace(/,?\s*(?:₹|rs\.?\s?)?[\d,.]+k?\b/gi, '').trim())?.[1]?.trim();
  if (vendor) t = t.replace(new RegExp(`\\bat\\s+${vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '');
  t = t
    .replace(/(?:₹|rs\.?\s?|inr\s?)?\b\d[\d,.]*\s*(?:k|lakh)?\b/gi, ' ')
    .replace(/\b(?:today|yesterday|day before yesterday|this morning|tonight|just now)\b/gi, ' ')
    .replace(/\b(?:for|on|of|at)\s*$/i, ' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { phrase: t, vendor };
}

const VERB_EVENT: Record<string, string> = { washed: 'Wash', cleaned: 'Clean', serviced: 'Service', watered: 'Water', changed: 'Change', replaced: 'Replace', renewed: 'Renew', paid: 'Payment', cut: 'Cut', trimmed: 'Trim', vacuumed: 'Vacuum' };
const TYPE_WORDS = new Set(['car', 'bike', 'scooter', 'vehicle', 'the', 'my', 'our', 'a', 'an']);

function resolveOne(os: LifeOSContext, phrase: string, types?: string[]) {
  return clearMatch(resolveCandidates(os, phrase, types));
}

const CATEGORY_WORDS: Array<[RegExp, string]> = [
  [/\b(dinner|lunch|breakfast|coffee|chai|food|meal|swiggy|zomato|restaurant|drinks?|beer|pizza|biryani)\b/i, 'food'],
  [/\b(grocer(y|ies)|bigbasket|blinkit|zepto|vegetables|milk)\b/i, 'groceries'],
  [/\b(uber|ola|cab|auto|taxi|petrol|fuel|diesel|metro|bus|train|parking|toll)\b/i, 'transport'],
  [/\b(movie|movies|netflix|concert|tickets?|game)\b/i, 'entertainment'],
  [/\b(rent)\b/i, 'housing'],
  [/\b(electricity|water bill|wifi|internet|broadband|recharge|gas bill)\b/i, 'utilities'],
  [/\b(doctor|medicine|pharmacy|hospital|clinic)\b/i, 'health'],
  [/\b(flight|hotel|airbnb|trip)\b/i, 'travel'],
  [/\b(clothes|shoes|amazon|flipkart|myntra|shopping)\b/i, 'shopping'],
  [/\b(gift)\b/i, 'gifts'],
];
const categoryOf = (t: string) => CATEGORY_WORDS.find(([re]) => re.test(t))?.[1] ?? 'other';

/** Names in "with Arjun and Priya" / "with Arjun, Priya and Dad". */
function namesAfterWith(text: string): string[] {
  const m = /\bwith\s+(.+?)(?:[,;.]?\s*(?:\b(?:\w+)\s+paid\b|$))/i.exec(text);
  if (!m) return [];
  return m[1]!.split(/\s*(?:,|\band\b|&)\s*/i).map((s) => s.trim()).filter((s) => s && !/^(me|us)$/i.test(s));
}

const TYPE_SYNONYMS: Record<string, string> = { car: 'asset', bike: 'asset', scooter: 'asset', motorcycle: 'asset', motorbike: 'asset', vehicle: 'asset', contact: 'person', friend: 'person', expense: 'transaction', chore: 'routine' };

/** "asset" / "assets" / "car" → 'asset', only for a record type that is installed. */
function typeFromWord(os: LifeOSContext, word: string): string | null {
  const w = word.trim().toLowerCase().replace(/^(?:my|the)\s+/, '');
  for (const def of os.registry.objects.values()) {
    if ([def.id, def.label, def.labelPlural].some((x) => x?.toLowerCase() === w)) return def.id;
  }
  const syn = TYPE_SYNONYMS[w.replace(/s$/, '')] ?? TYPE_SYNONYMS[w];
  return syn && os.registry.objects.has(syn) ? syn : null;
}

const r0 = <T>(results: unknown[], i = 0) => results[i] as T;

export function parseMessage(os: LifeOSContext, raw: string): ParsedPlan | null {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text || text.length > 200) return null;
  const lower = text.toLowerCase();

  // — Remember that …
  let m = /^(?:please\s+)?remember(?:\s+that)?[:,]?\s+(.{3,})$/i.exec(text);
  if (m) {
    const fact = cap(m[1]!.replace(/[.!]+$/, ''));
    return { intent: 'remember', steps: [() => ({ name: 'remember_fact', input: { text: fact } })], reply: (r) => ((r[0] as { alreadyKnown?: string })?.alreadyKnown ? 'I already knew that.' : `Noted — I’ll remember that ${fact.charAt(0).toLowerCase()}${fact.slice(1)}.`) };
  }

  // — "Add a new vehicle" / "new person" / "create a trip": nothing to fill in yet, so open the form
  m = /^(?:please\s+)?(?:add|create|make|start|new)\s+(?:a|an|another|one)?\s*(?:new\s+)?([a-z][a-z ]{1,30}?)(?:\s+(?:record|entry|form))?[.!]?$/i.exec(text);
  const newType = m && typeFromWord(os, m[1]!);
  if (newType) {
    const def = os.registry.objects.get(newType)!;
    return { intent: 'new_record', steps: [], card: { kind: 'new', type: def.id, label: def.label, icon: def.icon }, reply: () => `Here’s a new ${def.label.toLowerCase()} — fill in what you know.` };
  }

  // — Questions answered from data
  if (/^(?:who owes me|who do i owe|what do people owe me|balances?)\b/i.test(lower)) {
    return {
      intent: 'balances',
      steps: [() => ({ name: 'balances', input: {} })],
      reply: (r) => {
        const b = (r[0] as { balances?: Array<{ person: string; amount: number }> })?.balances ?? [];
        if (!b.length) return 'All square — nobody owes anybody.';
        return b.map((x) => (x.amount > 0 ? `${x.person} owes you ${money(x.amount)}` : `You owe ${x.person} ${money(-x.amount)}`)).join('. ') + '.';
      },
    };
  }
  if (/^(?:what'?s|what is|anything)\s+(?:overdue|due|coming up|pending)\b/i.test(lower)) {
    return {
      intent: 'upkeep',
      steps: [() => ({ name: 'upkeep_status', input: { limit: 8 } })],
      reply: (r) => {
        const u = r[0] as { overdue: number; items: Array<{ record: string; cycle: string; state: string; daysLeft: number | null }> };
        if (!u?.items?.length) return 'Nothing recurring is due.';
        const late = u.items.filter((i) => i.state === 'overdue');
        const soon = u.items.filter((i) => i.state !== 'overdue').slice(0, 3);
        const name = (i: { record: string; cycle: string }) => (i.record === i.cycle ? i.record : `${i.record} ${i.cycle.toLowerCase()}`);
        return [late.length ? `Overdue: ${late.map(name).join(', ')}.` : 'Nothing overdue.', soon.length ? `Next: ${soon.map((i) => `${name(i)}${i.daysLeft != null ? ` in ${i.daysLeft} d` : ''}`).join(', ')}.` : ''].filter(Boolean).join(' ');
      },
    };
  }
  m = /^what (?:did i (?:say|tell you)|do you know) about (.+?)\??$/i.exec(text);
  if (m) {
    const q = m[1]!.replace(/^(?:the|my)\s+/i, '');
    return { intent: 'recall', steps: [() => ({ name: 'recall', input: { query: q } })], reply: (r) => { const f = (r[0] as { facts?: Array<{ text: string }> })?.facts ?? []; return f.length ? f.map((x) => x.text).join('. ') + '.' : `You haven’t told me anything about ${q} yet.`; } };
  }

  // — Add a chore
  m = /^(?:add (?:a )?(?:chore|routine)[:,]?\s*|new (?:chore|routine)[:,]?\s*)(.+?)\s+every\s+(\d+\s+)?(day|days|week|weeks|month|months)(?:\s+on\s+(\w+?)s?)?$/i.exec(text) ?? /^(?:add (?:a )?(?:chore|routine)[:,]?\s*)(.+?)\s+every\s+()(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?$/i.exec(text);
  if (m) {
    const name = cap(m[1]!.trim());
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const weekdayWord = (m[4] ?? (days.includes(m[3]!.toLowerCase()) ? m[3] : ''))?.toLowerCase() ?? '';
    const weekday = days.indexOf(weekdayWord);
    const unitWord = days.includes(m[3]!.toLowerCase()) ? 'week' : m[3]!.toLowerCase().replace(/s$/, '');
    const everyN = m[2] ? Number(m[2]) : 1;
    return {
      intent: 'create_routine',
      steps: [() => ({ name: 'create_routine', input: { name, everyN, everyUnit: unitWord, ...(weekday >= 0 ? { weekday } : {}) } })],
      reply: () => `Added ${name} — every ${everyN === 1 ? '' : `${everyN} `}${unitWord}${everyN === 1 ? '' : 's'}${weekday >= 0 ? ` on ${cap(days[weekday]!)}s` : ''}.`,
    };
  }

  // — Remind me to … [tomorrow|today|in N days]
  m = /^remind me (?:to\s+)?(.+?)(?:\s+(tomorrow|today|tonight|in (\d+) (day|days|week|weeks)))?$/i.exec(text);
  if (m && !/\bevery\b/i.test(text)) {
    const what = cap(m[1]!.replace(/\b(?:at|on)\s*$/i, '').trim());
    const d = new Date();
    if (m[2]?.toLowerCase() === 'today') d.setHours(Math.max(d.getHours() + 2, 18), 0, 0, 0);
    else if (m[2]?.toLowerCase() === 'tonight') d.setHours(20, 0, 0, 0);
    else {
      const add = m[3] ? Number(m[3]) * (/week/i.test(m[4] ?? '') ? 7 : 1) : 1;
      d.setDate(d.getDate() + add);
      d.setHours(9, 0, 0, 0);
    }
    return { intent: 'remind', steps: [() => ({ name: 'create_reminder', input: { title: what, dueAt: d.toISOString() } })], reply: () => `I’ll remind you: ${what} — ${d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.` };
  }

  const amount = parseAmount(text);

  // — "X paid me back 2,600" / "got 2,600 from X"
  m = /^(.+?)\s+(?:paid|sent|transferred|gave)\s+me(?:\s+back)?\b/i.exec(text) ?? /^(?:got|received)\s+.*?\bfrom\s+(.+?)$/i.exec(text);
  if (m && amount) {
    const who = resolveOne(os, cleanPhrase(m[1]!).phrase, ['person']);
    if (!who) return null;
    return {
      intent: 'paid_back',
      steps: [
        () => ({ name: 'settle_debt', input: { personId: who.id } }),
        () => ({ name: 'create_entity', input: { type: 'transaction', data: { amount, kind: 'income', category: 'transfer', merchant: who.title, date: parseDay(text) ?? today() }, links: [{ toId: who.id, kind: 'person' }] } }),
      ],
      reply: (_r, declined) => (declined ? 'Okay — I’ve left it as it was.' : `Got it — ${who.title} paid you ${money(amount)}. You’re square.`),
    };
  }

  // — "Dinner was 3,600, split with Arjun and Priya[, Priya paid]"
  if (/\bsplit\b/i.test(text) && amount) {
    const names = namesAfterWith(text);
    if (!names.length) return null;
    const people = names.map((n) => resolveOne(os, n, ['person']));
    if (people.some((p) => !p)) return null;
    const payerName = /\b(\w+)\s+paid\b/i.exec(text)?.[1];
    const payer = payerName && !/^i$/i.test(payerName) ? resolveOne(os, payerName, ['person']) : null;
    if (payerName && !/^i$/i.test(payerName) && !payer) return null;
    const what = cap(/^([a-z][\w ]*?)\s+(?:was|for|cost|came to|=)\b/i.exec(text)?.[1]?.trim() ?? 'Shared expense');
    return {
      intent: 'split',
      steps: [
        () => ({ name: 'create_entity', input: { type: 'transaction', data: { amount, kind: 'expense', category: categoryOf(text), merchant: what, date: parseDay(text) ?? today(), personIds: people.map((p) => p!.id) } } }),
        (r) => { const tx = r0<{ id?: string }>(r); return tx?.id ? { name: 'split_transaction', input: { transactionId: tx.id, payer: payer?.id ?? 'me', method: 'equal', parts: [{ party: 'me' }, ...people.map((p) => ({ party: p!.id }))] } } : null; },
      ],
      reply: (_r, declined) => {
        if (declined) return 'Okay — nothing split.';
        const each = amount / (people.length + 1);
        return payer ? `Split ${money(amount)} ${people.length + 1} ways — you owe ${payer.title} ${money(each)}.` : `Split ${money(amount)} ${people.length + 1} ways — ${people.map((p) => p!.title.split(' ')[0]).join(' and ')} owe you ${money(each)} each.`;
      },
    };
  }

  // — "Recharged Jio 719 for 84 days"
  m = /^(?:i\s+)?(?:recharged|renewed|topped up)\s+(?:my\s+|the\s+)?(.+?)(?:\s+for\s+(\d+)\s*(day|days|month|months|year|years))?$/i.exec(text);
  if (m) {
    const { phrase } = cleanPhrase(m[1]!);
    const sub = resolveOne(os, phrase, ['subscription']);
    if (!sub) return null;
    const unit = m[3]?.toLowerCase().replace(/s$/, '');
    const rrule = m[2] ? `FREQ=${unit === 'day' ? 'DAILY' : unit === 'month' ? 'MONTHLY' : 'YEARLY'};INTERVAL=${m[2]}` : undefined;
    const steps: ParsedPlan['steps'] = [];
    if (amount || rrule) steps.push(() => ({ name: 'update_entity', input: { id: sub.id, data: { ...(amount ? { amount } : {}), ...(rrule ? { rrule } : {}) } } }));
    steps.push(() => ({ name: 'mark_cycle_done', input: { entityId: sub.id, ...(amount ? { cost: amount } : {}) } }));
    return { intent: 'recharge', steps, reply: (r, declined) => (declined ? 'Okay — left it unchanged.' : `${sub.title} renewed${amount ? ` for ${money(amount)}` : ''} — ${(r[r.length - 1] as { next?: string })?.next ?? 'rolled on'}.`) };
  }

  // — "Spent 450 on lunch at Blue Tokai" / "paid 1,200 for petrol"
  m = /^(?:i\s+)?(?:spent|paid)\s+(?:₹|rs\.?\s?)?[\d,.]+k?\s+(?:on|for)\s+(.+?)$/i.exec(text);
  if (m && amount) {
    const { phrase, vendor } = cleanPhrase(m[1]!);
    const what = cap(phrase || 'Expense');
    return {
      intent: 'expense',
      steps: [() => ({ name: 'create_entity', input: { type: 'transaction', data: { amount, kind: 'expense', category: categoryOf(`${phrase} ${vendor ?? ''}`), merchant: vendor ?? what, note: vendor ? what : undefined, date: parseDay(text) ?? today() } } })],
      reply: (_r, declined) => (declined ? 'Okay — not logged.' : `Logged ${money(amount)} on ${what.toLowerCase()}${vendor ? ` at ${vendor}` : ''}.`),
    };
  }

  // — "Did laundry" / "Did the car service today, 6,400 at Hyundai" / "Washed the white sneakers"
  m = /^(?:i\s+)?(did|done|finished|completed|washed|cleaned|serviced|watered|changed|replaced|vacuumed|trimmed)\s+(.+)$/i.exec(text) ?? /^(.+?)\s+(done|finished|completed)$/i.exec(text);
  if (m) {
    const verbFirst = !/^(done|finished|completed)$/i.test(m[2]!);
    const verb = (verbFirst ? m[1]! : m[2]!).toLowerCase();
    const { phrase, vendor } = cleanPhrase(verbFirst ? m[2]! : m[1]!);
    const who = resolveOne(os, phrase);
    if (!who) return null;
    const titleWords = new Set(who.title.toLowerCase().split(/\s+/));
    const rest = phrase.toLowerCase().split(/\s+/).filter((w) => !titleWords.has(w) && !TYPE_WORDS.has(w));
    const what = VERB_EVENT[verb] ?? (rest.length ? cap(rest.join(' ')) : '');
    const meter = /(\d[\d,]*)\s*(?:km|kms)\b/i.exec(text)?.[1];
    const cycle = what ? pickCycle(os, who.id, what) : pickCycle(os, who.id);
    if (!cycle && !what) return null;
    const date = parseDay(text);
    const base = { entityId: who.id, ...(date ? { date } : {}), ...(amount ? { cost: amount } : {}), ...(meter ? { meter: Number(meter.replace(/,/g, '')) } : {}), ...(vendor ? { note: vendor } : {}) };
    return {
      intent: 'done',
      steps: [() => (cycle && !what ? { name: 'mark_cycle_done', input: { cycleId: cycle.id, ...base, entityId: undefined } } : { name: 'log_event', input: { ...base, what: what || cycle!.name } })],
      reply: (r, declined) => {
        if (declined) return 'Okay — nothing logged.';
        const out = r[0] as { next?: string; cycleRolled?: boolean; logged?: string; done?: string };
        const label = cycle ? (cycle.name === who.title ? who.title : `${who.title} ${cycle.name.toLowerCase()}`) : `${what} on ${who.title}`;
        return `${cap(label)} done${amount ? ` · ${money(amount)} filed` : ''}${out?.next ? ` — ${out.next}.` : '.'}`;
      },
    };
  }
  return null;
}
