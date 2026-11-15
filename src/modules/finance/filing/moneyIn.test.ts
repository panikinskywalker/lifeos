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
import { incomeInRange, spendInRange } from '../lib';
import type { TransactionData } from '../types';
import { countAsIncome, undoCountAsIncome } from './moneyIn';

/** Counting money (docs/MODEL.md, 15 Nov), from Rutvij's own texts (masked). */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, placesModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const sms = (from: string, body: string, when: string) => fileMessage(os, { source: 'sms', from, body, receivedAt: Date.parse(`${when}T10:00:00`) });
const txs = () => os.records.query<TransactionData>('transaction');
const fromFriend = (amount: string, name: string, day: string, when: string) => sms('AX-ICICIT-S', `Dear Customer, Acct XX123 is credited with Rs ${amount} on ${day} from ${name}. UPI:612345678901-ICICI Bank.`, when);

describe('counting money', () => {
  it('money in from a friend is money back, not Came in; Count as income counts it and the next one from them', () => {
    fromFriend('161.00', 'ABEL MANOJ MATH', '18-Aug-26', '2026-08-18');
    expect(txs()[0]!.data).toMatchObject({ kind: 'income', share: 0 });
    expect(incomeInRange(os, '2026-08-01', '2026-08-31')).toBe(0);
    const u = countAsIncome(os, txs()[0]!.id);
    expect(incomeInRange(os, '2026-08-01', '2026-08-31')).toBe(161);
    fromFriend('140.00', 'ABEL MANOJ MATH', '20-Aug-26', '2026-08-20');
    expect(incomeInRange(os, '2026-08-01', '2026-08-31')).toBe(301);
    undoCountAsIncome(os, u);
    expect(incomeInRange(os, '2026-08-01', '2026-08-31')).toBe(140); // the later one was filed while they counted
  });

  it('money back from a shop you paid is a refund in that category, off spending; salary stays income', () => {
    sms('AD-ICICIT-S', 'ICICI Bank Acct XX123 debited for Rs 999.00 on 02-Nov-26; MYNTRA credited. UPI:612345678902. Call 18002662 for dispute.', '2026-11-02');
    const spent = txs()[0]!;
    os.records.update(spent.id, { data: { category: 'shopping' } }, 'user');
    sms('AD-ICICIT-S', 'Dear Customer, Acct XX123 is credited with Rs 999.00 on 05-Nov-26 from MYNTRA. UPI:612345678903-ICICI Bank.', '2026-11-05');
    const back = txs().find((t) => t.id !== spent.id)!;
    expect(back.data).toMatchObject({ kind: 'income', refund: true, category: 'shopping' });
    expect(spendInRange(os, '2026-11-01', '2026-11-30')).toBe(0);
    expect(incomeInRange(os, '2026-11-01', '2026-11-30')).toBe(0);
    sms('VM-HSBCIN-S', 'Your HSBC Acc XXXXXX1234 is credited for INR 196958.00 on 29-Oct-26 by NEFT from ACME SOFTWARE PVT LTD SALARY OCT. Ref 000000000000', '2026-10-29');
    expect(incomeInRange(os, '2026-10-01', '2026-10-31')).toBe(196958);
  });

  it('a card bill paid through CRED ("…; CRED credited") is a transfer, not spending', () => {
    sms('AD-ICICIT-S', 'ICICI Bank Acct XX123 debited for Rs 8305.44 on 19-Sep-26; CRED credited. UPI:612345678904. Call 18002662 for dispute.', '2026-09-19');
    expect(txs()[0]!.data.kind).toBe('transfer');
    expect(spendInRange(os, '2026-09-01', '2026-09-30')).toBe(0);
  });
});
