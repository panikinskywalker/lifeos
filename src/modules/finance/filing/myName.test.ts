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
import { isMyName, learnMyName, myNames, unlearnMyName } from './payee';

/** Your own name (10 Nov): money to or from the name your banks write for you is a transfer between your accounts. */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, placesModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const at = Date.parse('2026-10-28T10:00:00');
const toMe = (dt = 0) => fileMessage(os, { source: 'sms', from: 'VM-CBSSBI-S', body: 'Your A/C XXXXX123456 Debited INR 43,211.00 on 28/10/26 -Transferred to Mr. ASHA RAO KULK. Avl Balance INR 12,345.00-SBI', receivedAt: at + dt });
const toFriend = (dt = 0) => fileMessage(os, { source: 'sms', from: 'JD-SBIUPI-S', body: 'Dear UPI user A/C X4567 debited by 419.00 on date 28Oct26 trf to Mr PIYUSH SUNIL Refno 512345678901 If not u? call-1800111109 for other services-18001234-SBI', receivedAt: at + dt });
const kinds = () => os.records.query<{ kind: string; merchant?: string }>('transaction').map((t) => `${t.data.merchant}:${t.data.kind}`).sort();

describe('your name at the bank', () => {
  it('banks cut it short: the first word and the starts of the rest match', () => {
    learnMyName(os, 'ASHA RAO KULKARNI');
    expect(['ASHA RAO KULK', 'Asha Rao', 'ASHA R', 'Mr ASHA', 'asha rao kulkarni'].map((n) => isMyName(os, n))).toEqual([true, true, true, true, true]);
    expect(['RAO ASHA', 'ASHA SINGH', 'ASHANTI', '', null].map((n) => isMyName(os, n))).toEqual([false, false, false, false, false]);
  });

  it("That's me turns this and every earlier payment to the name into transfers; Undo puts them back", () => {
    toMe();
    toFriend(60_000);
    const u = learnMyName(os, 'ASHA RAO KULK');
    expect(kinds()).toEqual(['ASHA RAO KULK:transfer', 'PIYUSH SUNIL:expense']);
    unlearnMyName(os, u);
    expect(kinds()).toEqual(['ASHA RAO KULK:expense', 'PIYUSH SUNIL:expense']);
    expect(myNames(os)).toEqual([]);
  });

  it('once learned, the next one is filed as a transfer; a longer name replaces the short one', () => {
    learnMyName(os, 'ASHA RAO');
    learnMyName(os, 'ASHA RAO KULKARNI');
    expect(myNames(os)).toEqual(['asha rao kulkarni']);
    toMe();
    expect(kinds()).toEqual(['ASHA RAO KULK:transfer']);
  });
});
