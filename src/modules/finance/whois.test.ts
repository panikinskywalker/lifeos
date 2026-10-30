import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { fileMessage } from '@core/filing/messages';
import { whoIs } from '@core/identity';
import { crmModule } from '@modules/crm';
import { placesModule } from '@modules/places';
import { financeModule } from '@modules/finance';
import { PAYEE_WHO, answerWhoIs, keepWhoAsOrg, whoAskOf } from './filing/payee';

/** Who is this? (R2, NR-People-WhoIs): a payment from a UPI ID nobody has, under a person's name, is asked once in To check. */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, placesModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const at = Date.parse('2026-09-19T10:00:00');
const fromPriya = (amount: number, dt = 0) => fileMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: `Credit Alert!\nRs.${amount}.00 credited to HDFC Bank A/c XX1234 on 19-09-26 from VPA priya.s@okicici (UPI 4269123${dt}5679)`, receivedAt: at + dt });
const txs = () => os.records.query<{ amount: number }>('transaction');
const asks = () => os.filings.toCheck().filter((f) => f.kind === PAYEE_WHO);
const payeeOf = (txId: string) => os.links.forEntity(txId).find((r) => r.direction === 'out' && (r.relation.kind === 'person' || r.relation.kind === 'payee'));

describe('Who is this?', () => {
  it('asks once about a new sender, then "This" moves the payments to the person and remembers the UPI ID', () => {
    fromPriya(147);
    const [ask] = asks();
    expect(ask).toMatchObject({ label: 'Who is priya.s@okicici?', entityId: txs()[0]!.id, action: 'logged' });
    expect(whoAskOf(ask!)).toMatchObject({ vpa: 'priya.s@okicici', said: 'priya s' });
    // The stand-in payee is asked about, not listed as "Payee: …" too.
    expect(os.filings.toCheck().some((f) => f.label.startsWith('Payee:'))).toBe(false);
    // A second payment before you answer joins the same stand-in, without asking again.
    fromPriya(200, 86_400_000);
    expect(asks()).toHaveLength(1);
    const priya = os.records.create({ object: 'person', title: 'Priya Sharma', data: {} });
    answerWhoIs(os, ask!.id, priya.id);
    for (const t of txs()) expect(payeeOf(t.id)).toMatchObject({ other: { id: priya.id }, relation: { kind: 'person', confidence: 1 } });
    expect(os.records.get<{ upi?: string }>(priya.id)!.data.upi).toBe('priya.s@okicici');
    expect(os.records.query('org')).toHaveLength(0);
    expect(asks()).toHaveLength(0);
    // Every payment after is theirs, with no question.
    fromPriya(90, 2 * 86_400_000);
    expect(payeeOf(txs().find((t) => t.data.amount === 90)!.id)).toMatchObject({ other: { id: priya.id } });
    expect(asks()).toHaveLength(0);
  });

  it('"It’s a shop or company" keeps it an Organisation, known by the UPI ID from then on', () => {
    fromPriya(147);
    const orgId = keepWhoAsOrg(os, asks()[0]!.id)!;
    expect(os.records.get(orgId)).toMatchObject({ object: 'org', data: { kind: 'shop', upi: 'priya.s@okicici' } });
    expect(whoIs(os, { upi: 'priya.s@okicici' })).toMatchObject({ record: { id: orgId } });
    expect(asks()).toHaveLength(0);
  });

  it('a known UPI ID, a business name or a name match is not asked', () => {
    os.records.create({ object: 'person', title: 'Arjun Mehta', data: { upi: 'priya.s@okicici' } });
    fromPriya(147);
    fileMessage(os, { source: 'sms', from: 'VM-KOTAKB', body: 'Sent Rs.180.00 from Kotak Bank AC X2345 to sharma.stores@ybl on 26-09-26.UPI Ref 426912345684. Not you, https://kotak.com/KBANKT/Fraud', receivedAt: at + 5000 });
    // A name close to someone in People is a guess on the payment (Yes / Not them), not a question.
    os.records.create({ object: 'person', title: 'Rohan Iyer', data: {} });
    fileMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Credit Alert!\nRs.300.00 credited to HDFC Bank A/c XX1234 on 19-09-26 from VPA rohan.i@oksbi (UPI 426912345688)', receivedAt: at + 9000 });
    expect(asks()).toHaveLength(0);
    expect(os.filings.toCheck().find((f) => f.kind === 'transaction' && f.flag?.startsWith('We think'))?.flag).toBe('We think “rohan i” is Rohan Iyer');
  });
});
