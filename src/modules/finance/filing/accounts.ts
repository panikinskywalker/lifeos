import type { LifeOSContext } from '@core/registry/context';
import { BANK_NAMES, type ParsedTxn } from './bankSms';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The account a message moved money on: by last digits (+ bank), or a new one named for it. */
export function accountFor(os: LifeOSContext, t: ParsedTxn, from: string, created: string[] = []): string | null {
  if (!os.registry.objects.has('account')) return null;
  const accounts = os.records.query<{ last4?: string; alsoLast4?: string[]; institution?: string; kind?: string }>('account', {}, { limit: 500 });
  const bankName = t.bank ? BANK_NAMES[t.bank] : null;
  if (t.last4) {
    // Its own digits, and those of copies merged into it.
    const hits = accounts.filter((a) => [a.data.last4, ...(a.data.alsoLast4 ?? [])].some((d) => d && (d.endsWith(t.last4!) || t.last4!.endsWith(d))));
    const hit = hits.find((a) => !bankName || !a.data.institution || norm(a.data.institution).includes(norm(bankName).split(' ')[0]!)) ?? hits[0];
    if (hit) return hit.id;
  }
  if (!t.last4 && !bankName) return null;
  // A debit card spends from the bank account: your one account at that bank, when there is just one.
  const debit = t.isCard && (t.debitCard || /debit/i.test(from));
  if (debit && bankName) {
    const own = accounts.filter((a) => a.data.kind === 'bank' && a.data.institution && norm(a.data.institution).includes(norm(bankName).split(' ')[0]!));
    if (own.length === 1) return own[0]!.id;
  }
  // Other card alerts are nearly always credit cards; edit if not.
  const kind = t.isCard && !debit ? 'credit' : 'bank';
  const title = `${bankName ?? 'Bank'}${t.isCard ? ' card' : ''}${t.last4 ? ` ••${t.last4}` : ''}`;
  const existing = accounts.find((a) => a.title === title);
  if (existing) return existing.id;
  const a = os.records.create({ object: 'account', title, data: { kind, institution: bankName ?? undefined, last4: t.last4 ?? undefined, currency: 'INR', openingBalance: 0 } }, 'assistant');
  created.push(a.id);
  return a.id;
}
