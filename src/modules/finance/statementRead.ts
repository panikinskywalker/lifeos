import type { LifeOSContext } from '@core/registry/context';
import type { PhotoAsk } from '@core/brain/photo';
import { setBalance } from './lib';
import type { AccountData, InvestmentData } from './types';

/**
 * Upload a statement (docs/MODEL.md, Upload a statement): a PDF or screenshot
 * of a bank or card statement, or a fund or broker summary, read once by
 * Claude because you pressed Upload. The phone matches what was read to your
 * accounts (bank and last digits) and holdings (by name) and proposes each
 * change; nothing changes until you apply, and each change has Undo.
 */

export interface ReadAccount {
  bank: string;
  last4: string;
  kind: 'bank' | 'credit';
  balance: number;
  owed: number;
  minDue: number;
  dueOn: string;
  asOf: string;
}
export interface ReadHolding {
  name: string;
  units: number;
  value: number;
  invested: number;
  sip: number;
  sipDay: number;
}
export interface StatementRead {
  accounts: ReadAccount[];
  holdings: ReadHolding[];
}

export interface Proposal {
  id: string;
  label: string;
  detail: string;
  /** Applies it and returns its Undo. */
  apply: () => () => void;
}

const ACCOUNT = {
  type: 'object',
  additionalProperties: false,
  required: ['bank', 'last4', 'kind', 'balance', 'owed', 'minDue', 'dueOn', 'asOf'],
  properties: {
    bank: { type: 'string' },
    last4: { type: 'string' },
    kind: { type: 'string', enum: ['bank', 'credit'] },
    balance: { type: 'number' },
    owed: { type: 'number' },
    minDue: { type: 'number' },
    dueOn: { type: 'string' },
    asOf: { type: 'string' },
  },
} as const;
const HOLDING = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'units', 'value', 'invested', 'sip', 'sipDay'],
  properties: { name: { type: 'string' }, units: { type: 'number' }, value: { type: 'number' }, invested: { type: 'number' }, sip: { type: 'number' }, sipDay: { type: 'number' } },
} as const;
export const STATEMENT_SCHEMA = { type: 'object', additionalProperties: false, required: ['accounts', 'holdings'], properties: { accounts: { type: 'array', items: ACCOUNT }, holdings: { type: 'array', items: HOLDING } } } as const;

const SYSTEM = `You read a statement or a screenshot from an Indian bank, credit card, mutual fund app (CAMS, KFintech, Groww, Zerodha Coin, Kuvera) or broker. Answer with JSON only.
accounts: each bank account or credit card shown. bank: the bank's short name (SBI, ICICI, HDFC, Axis). last4: its last 4 digits, "" if not shown. kind: bank or credit. For a bank account, balance is the closing or available balance; for a card, owed is the total amount due (or outstanding), minDue the minimum due and dueOn the payment due date. asOf: the statement or screenshot date. Dates YYYY-MM-DD, "" if not shown; numbers 0 when not shown.
holdings: each fund, stock or deposit with its name as printed, units, current value, amount invested, and a monthly SIP amount and its day of the month if one is shown (0 if not).
Leave out anything you cannot read clearly. Never invent figures.`;

export function statementAsk(): Omit<PhotoAsk, 'image'> {
  return { module: 'finance', moduleName: 'Money', why: 'you pressed Upload a statement', what: 'a statement or screenshot', system: SYSTEM, prompt: 'Read this.', record: {}, schema: STATEMENT_SCHEMA as unknown as Record<string, unknown>, maxTokens: 2500 };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0);
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

/** What Claude read, kept to what makes sense. */
export function readStatement(answer: unknown): StatementRead {
  const a = (answer ?? {}) as { accounts?: unknown; holdings?: unknown };
  const accounts = (Array.isArray(a.accounts) ? a.accounts : []).map((x: Record<string, unknown>) => ({ bank: String(x.bank ?? '').trim().slice(0, 40), last4: String(x.last4 ?? '').replace(/\D/g, '').slice(-4), kind: x.kind === 'credit' ? ('credit' as const) : ('bank' as const), balance: typeof x.balance === 'number' ? Math.round(x.balance * 100) / 100 : 0, owed: num(x.owed), minDue: num(x.minDue), dueOn: date(x.dueOn), asOf: date(x.asOf) })).filter((x) => x.bank || x.last4);
  const holdings = (Array.isArray(a.holdings) ? a.holdings : []).map((x: Record<string, unknown>) => ({ name: String(x.name ?? '').trim().slice(0, 80), units: num(x.units), value: num(x.value), invested: num(x.invested), sip: num(x.sip), sipDay: Math.min(31, Math.round(num(x.sipDay))) })).filter((x) => x.name && (x.value || x.invested || x.sip));
  return { accounts, holdings };
}

/** An account's name with its last digits, once. */
const nameOf = (a: { title: string; data: AccountData }) => (a.data.last4 && !a.title.includes(a.data.last4) ? `${a.title} ••${a.data.last4}` : a.title);

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['fund', 'direct', 'growth', 'plan', 'regular', 'option', 'the', 'bank', 'ltd', 'limited'].includes(w)));
/** The holding whose name shares the most words (at least two, or all of a short one). */
function matchHolding(holdings: Array<{ id: string; title: string }>, name: string) {
  const want = words(name);
  let best: { id: string; score: number } | null = null;
  for (const h of holdings) {
    const have = words(h.title);
    const score = [...want].filter((w) => have.has(w)).length;
    if (score >= Math.min(2, want.size, have.size) && score > 0 && (!best || score > best.score)) best = { id: h.id, score };
  }
  return best?.id ?? null;
}

/** Each change the statement suggests, matched to your records. */
export function proposeChanges(os: LifeOSContext, read: StatementRead, now = Date.now()): Proposal[] {
  const money = (n: number) => os.format.currency(n);
  const accounts = os.records.query<AccountData>('account', {}, { limit: 500 });
  const out: Proposal[] = [];
  read.accounts.forEach((r, k) => {
    const bank = r.bank.toLowerCase().split(/\s+/)[0] ?? '';
    const kindOk = (a: (typeof accounts)[number]) => (a.data.kind === 'credit') === (r.kind === 'credit');
    const bankOk = (a: (typeof accounts)[number]) => !bank || `${a.title} ${a.data.institution ?? ''}`.toLowerCase().includes(bank);
    // The last digits decide: one account of that kind ending in them is the one, whatever bank was read.
    const byDigits = r.last4 ? accounts.filter((a) => kindOk(a) && a.data.last4 === r.last4) : [];
    const byBank = accounts.filter((a) => kindOk(a) && bankOk(a) && (!r.last4 || !a.data.last4));
    const found = byDigits.length === 1 ? byDigits[0]! : byDigits.find(bankOk) ?? (!r.last4 && byBank.length === 1 ? byBank[0]! : null);
    const at = r.asOf ? Date.parse(`${r.asOf}T23:59:00`) : now;
    const when = r.asOf ? ` (${r.asOf})` : '';
    if (r.kind === 'credit') {
      if (!r.owed && !r.dueOn) return;
      if (found) {
        out.push({ id: `a${k}`, label: `${nameOf(found)}: you owe ${money(r.owed)}`, detail: `was ${money(Math.max(0, -(found.data.knownBalance ?? 0)))}${r.dueOn ? ` · bill due ${r.dueOn}${r.minDue ? `, minimum ${money(r.minDue)}` : ''}` : ''}${when}`, apply: () => {
          const statement = found.data.statement;
          const before = setBalance(os, found.id, -r.owed, at);
          if (r.dueOn) os.records.update(found.id, { data: { statement: { total: r.owed, min: r.minDue || undefined, dueOn: r.dueOn, at } } }, 'user');
          return () => os.records.update(found.id, { data: { ...before, statement } }, 'user');
        } });
      } else {
        out.push({ id: `a${k}`, label: `New card: ${r.bank}${r.last4 ? ` ••${r.last4}` : ''}`, detail: `you owe ${money(r.owed)}${r.dueOn ? ` · due ${r.dueOn}` : ''}`, apply: () => {
          const a = os.records.create<AccountData>({ object: 'account', title: `${r.bank} card`, data: { kind: 'credit', institution: r.bank, last4: r.last4 || undefined, currency: 'INR', openingBalance: 0, knownBalance: -r.owed, knownOn: r.asOf || new Date(now).toISOString().slice(0, 10), knownAt: at, ...(r.dueOn ? { statement: { total: r.owed, min: r.minDue || undefined, dueOn: r.dueOn, at } } : {}) } as AccountData }, 'user');
          return () => os.records.delete(a.id, 'user');
        } });
      }
      return;
    }
    if (found) {
      out.push({ id: `a${k}`, label: `${nameOf(found)}: balance ${money(r.balance)}`, detail: `was ${typeof found.data.knownBalance === 'number' ? money(found.data.knownBalance) : 'from its payments'}${when}`, apply: () => {
        const before = setBalance(os, found.id, r.balance, at);
        return () => os.records.update(found.id, { data: before }, 'user');
      } });
    } else {
      out.push({ id: `a${k}`, label: `New account: ${r.bank}${r.last4 ? ` ••${r.last4}` : ''}`, detail: `balance ${money(r.balance)}${when}`, apply: () => {
        const a = os.records.create<AccountData>({ object: 'account', title: r.bank, data: { kind: 'bank', institution: r.bank, last4: r.last4 || undefined, currency: 'INR', openingBalance: 0, knownBalance: r.balance, knownOn: r.asOf || new Date(now).toISOString().slice(0, 10), knownAt: at } as AccountData }, 'user');
        return () => os.records.delete(a.id, 'user');
      } });
    }
  });
  const holdings = os.registry.objects.has('investment') ? os.records.query<InvestmentData>('investment', {}, { limit: 500 }) : [];
  read.holdings.forEach((h, k) => {
    const id = matchHolding(holdings, h.name);
    const found = id ? holdings.find((x) => x.id === id)! : null;
    const patch: Partial<InvestmentData> = { ...(h.value ? { currentValue: h.value } : {}), ...(h.invested ? { invested: h.invested } : {}), ...(h.units ? { units: h.units } : {}), ...(h.sip ? { sip: h.sip } : {}), ...(h.sipDay ? { sipDay: h.sipDay } : {}) };
    const bits = [h.value ? `worth ${money(h.value)}` : null, h.invested ? `${money(h.invested)} in` : null, h.sip ? `SIP ${money(h.sip)}${h.sipDay ? ` on the ${h.sipDay}` : ''}` : null].filter(Boolean).join(' · ');
    if (found) {
      out.push({ id: `h${k}`, label: `${found.title}: ${bits}`, detail: `was ${found.data.currentValue != null ? `worth ${money(found.data.currentValue)}` : `${money(found.data.invested)} in`}${found.data.sip ? `, SIP ${money(found.data.sip)}` : ''}`, apply: () => {
        // Undo names every field the patch touched, so ones that were empty go back to empty.
        const before = Object.fromEntries(Object.keys(patch).map((k) => [k, found.data[k as keyof InvestmentData]]));
        os.records.update(found.id, { data: patch }, 'user');
        return () => os.records.update(found.id, { data: before }, 'user');
      } });
    } else {
      out.push({ id: `h${k}`, label: `New holding: ${h.name}`, detail: bits, apply: () => {
        const rec = os.records.create<InvestmentData>({ object: 'investment', title: h.name, data: { instrument: 'mutual_fund', invested: h.invested || h.value, currency: 'INR', ...patch } as InvestmentData }, 'user');
        return () => os.records.delete(rec.id, 'user');
      } });
    }
  });
  return out;
}
