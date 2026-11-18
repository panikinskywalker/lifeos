import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { fileMessage } from '@core/filing/messages';
import { crmModule } from '@modules/crm';
import { placesModule } from '@modules/places';
import { financeModule } from '@modules/finance';

/** A card bill paid from another account is one transfer, whichever text comes first (Rutvij's HSBC → CRED → ICICI card, Oct 2026). */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, placesModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const at = Date.parse('2026-10-05T10:00:00');
const debit = (dt = 0) => fileMessage(os, { source: 'sms', from: 'VM-HSBCIN-S', body: 'INR 22005.39 is paid from HSBC account XXXXXX4421 to CRED Club on 05-Oct-26 with ref 512345678901. If this is not done by you, call 18002673456 to report.', receivedAt: at + dt });
const cardPaid = (dt = 0) => fileMessage(os, { source: 'sms', from: 'JM-ICICIT-S', body: 'Payment of Rs 22,005.39 has been received on your ICICI Bank Credit Card XX3007 through Bharat Bill Payment System on 05-OCT-26.', receivedAt: at + dt });
const txs = () => os.records.query<{ kind: string; amount: number; accountId?: string; toAccountId?: string }>('transaction');
const card = () => os.records.query<{ kind: string }>('account').find((a) => a.data.kind === 'credit')!;

describe('card bill paid from another account', () => {
  it('debit first, then the card says it was paid: one transfer into the card', () => {
    debit();
    cardPaid(60_000);
    expect(txs()).toHaveLength(1);
    expect(txs()[0]!.data).toMatchObject({ kind: 'transfer', amount: 22005.39, toAccountId: card().id });
  });

  it('the card first, then the debit: the same one transfer', () => {
    cardPaid();
    debit(60_000);
    expect(txs()).toHaveLength(1);
    const t = txs()[0]!.data;
    expect(t).toMatchObject({ kind: 'transfer', toAccountId: card().id });
    expect(t.accountId).not.toBe(card().id);
  });

  it('a spend of another amount stays a spend', () => {
    fileMessage(os, { source: 'sms', from: 'VM-HSBCIN-S', body: 'INR 499.68 is paid from HSBC account XXXXXX4421 to ZOMATO LTD on 05-Oct-26 with ref 512345678902. If this is not done by you, call 18002673456 to report.', receivedAt: at });
    cardPaid(60_000);
    expect(txs().map((t) => t.data.kind).sort()).toEqual(['expense', 'transfer']);
  });
});

describe('the two halves of other transfers', () => {
  const refundOut = (dt = 0) => fileMessage(os, { source: 'sms', from: 'VA-ICICIT-S', body: 'Refund of Rs 18,899.50 from ICICI Bank Credit Card XX3007 to Savings Account XX0637 has been successfully transferred.', receivedAt: at + dt });
  const savingsIn = (dt = 0) => fileMessage(os, { source: 'sms', from: 'VA-ICICIT-S', body: 'ICICI Bank Account XX637 credited:Rs. 18,899.50 on 05-Oct-26. Info CMS* CC RBI 10 H*ICICI BANK . Available Balance is Rs. 52,340.10.', receivedAt: at + dt });

  it("a card's credit balance sent to savings: one transfer, card → savings, either order", () => {
    refundOut();
    savingsIn(60_000);
    expect(txs()).toHaveLength(1);
    const t = txs()[0]!.data;
    expect(t.kind).toBe('transfer');
    expect(t.accountId).toBe(card().id);
    expect(t.toAccountId).not.toBe(card().id);
  });

  it('the other order makes the same one transfer', () => {
    savingsIn();
    refundOut(60_000);
    expect(txs()).toHaveLength(1);
    expect(txs()[0]!.data).toMatchObject({ kind: 'transfer', accountId: card().id });
  });

  it("friends' money in never joins your spend of the same amount", () => {
    fileMessage(os, { source: 'sms', from: 'JM-ICICIT-S', body: 'Dear Customer, Acct XX637 is credited with Rs 200.00 on 05-Oct-26 from PRIYA SHARMA. UPI:512345678903-ICICI Bank.', receivedAt: at });
    fileMessage(os, { source: 'sms', from: 'JD-SBIUPI-S', body: 'Dear UPI user A/C X4567 debited by 200.00 on date 05Oct26 trf to Basundi chai Refno 512345678904 If not u? call-1800111109 for other services-18001234-SBI', receivedAt: at + 60_000 });
    expect(txs().map((t) => t.data.kind).sort()).toEqual(['expense', 'income']);
  });
});

describe('balances move the right way', () => {
  it('a card payment received lowers what the card owes; the bank shows the balance its text states', async () => {
    const { accountBalance } = await import('../lib');
    cardPaid();
    fileMessage(os, { source: 'sms', from: 'VM-CBSSBI-S', body: 'Your A/C XXXXX123456 Credited INR 47,000.00 on 28/10/26 -Deposited by Cash by SELF. Avl Bal INR 52,000.00-SBI', receivedAt: at + 60_000 });
    const accounts = os.records.query<{ kind: 'bank' | 'credit'; openingBalance: number }>('account');
    const bal = (k: string) => accountBalance(os, accounts.find((a) => a.data.kind === k)! as never);
    expect(bal('credit')).toBe(22005.39);
    expect(bal('bank')).toBe(52000); // the balance the bank's own text states (Avl Bal), not one counted up from zero
  });
});

describe('a refund is filed as a refund', () => {
  it('in the category of what it refunds, marked refund, not counted as income', async () => {
    const { incomeInRange } = await import('../lib');
    fileMessage(os, { source: 'sms', from: 'VA-ICICIT-S', body: 'Adidas India Marketing Pr refund of Rs 18,899.50 credited to your ICICI Bank Credit Card XX3007 on 05-NOV-26.', receivedAt: at });
    const t = txs()[0]!.data as { kind: string; refund?: boolean; category?: string };
    expect(t).toMatchObject({ kind: 'income', refund: true, category: 'shopping' });
    expect(incomeInRange(os, '2026-11-01', '2026-11-30')).toBe(0);
  });
});

describe('balances follow the bank', () => {
  it("a text's Avl Bal becomes the account's balance; later payments add to it; an older text never overwrites it; ATM cash lands in Cash", async () => {
    const { accountBalance } = await import('../lib');
    const day = (d: string) => Date.parse(`${d}T10:00:00`);
    fileMessage(os, { source: 'sms', from: 'VM-CBSSBI-S', body: 'Your A/C XXXXX123456 Debited INR 500.00 on 01/10/26 -Transferred to Mr. PIYUSH SUNIL. Avl Balance INR 42,000.00-SBI', receivedAt: day('2026-10-01') });
    fileMessage(os, { source: 'sms', from: 'VM-CBSSBI-S', body: 'Your A/C XXXXX123456 Debited INR 300.00 on 28/09/26 -Transferred to Mr. RAVI KUMAR. Avl Balance INR 99,999.00-SBI', receivedAt: day('2026-09-28') });
    fileMessage(os, { source: 'sms', from: 'JD-SBIUPI-S', body: 'Dear UPI user A/C X3456 debited by 200.00 on date 03Oct26 trf to Basundi chai Refno 512345678904 If not u? call-1800111109 for other services-18001234-SBI', receivedAt: day('2026-10-03') });
    fileMessage(os, { source: 'sms', from: 'VM-SBIATM-S', body: 'Rs.2000 withdrawn from A/c XX3456 at ATM S1AW0123 on 04-10-26.', receivedAt: day('2026-10-04') });
    const accounts = os.records.query<{ kind: string; knownBalance?: number }>('account');
    const bank = accounts.find((a) => a.data.kind === 'bank')!;
    const cash = accounts.find((a) => a.data.kind === 'cash')!;
    expect(bank.data.knownBalance).toBe(42000);
    expect(accountBalance(os, bank as never)).toBe(42000 - 200 - 2000);
    expect(accountBalance(os, cash as never)).toBe(2000);
  });
});

describe("a card's bill", () => {
  it('lands on the card from its statement text; a payment that covers it clears it', () => {
    fileMessage(os, { source: 'sms', from: 'JX-ICICIT-S', body: 'ICICI Bank Credit Card XX3007 Statement is sent to name@gmail.com. Total of Rs 22,005.39 or minimum of Rs 14,120.00 is due by 08-OCT-26.', receivedAt: at - 3 * 86_400_000 });
    expect(card().data).toMatchObject({ statement: { total: 22005.39, min: 14120, dueOn: '2026-10-08' } });
    debit();
    cardPaid(60_000);
    expect((card().data as { statement?: unknown }).statement).toBeUndefined();
  });
});
