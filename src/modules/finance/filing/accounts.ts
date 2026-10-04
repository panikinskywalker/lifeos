import type { LifeOSContext } from '@core/registry/context';
import { BANK_NAMES, type ParsedTxn } from './bankSms';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The account a message moved money on: by last digits (+ bank), or a new one named for it. */
export function accountFor(os: LifeOSContext, t: ParsedTxn, from: string, created: string[] = []): string | null {
  if (!os.registry.objects.has('account')) return null;
  const accounts = os.records.query<{ last4?: string; institution?: string; kind?: string }>('account', {}, { limit: 500 });
  const bankName = t.bank ? BANK_NAMES[t.bank] : null;
  if (t.last4) {
    const hits = accounts.filter((a) => a.data.last4 && (a.data.last4.endsWith(t.last4!) || t.last4!.endsWith(a.data.last4)));
    const hit = hits.find((a) => !bankName || !a.data.institution || norm(a.data.institution).includes(norm(bankName).split(' ')[0]!)) ?? hits[0];
    if (hit) return hit.id;
  }
  if (!t.last4 && !bankName) return null;
  // Card alerts are nearly always credit cards (debit-card spends read as the bank account); edit if not.
  const kind = t.isCard && !/debit/i.test(from) ? 'credit' : 'bank';
  const title = `${bankName ?? 'Bank'}${t.isCard ? ' card' : ''}${t.last4 ? ` ••${t.last4}` : ''}`;
  const existing = accounts.find((a) => a.title === title);
  if (existing) return existing.id;
  const a = os.records.create({ object: 'account', title, data: { kind, institution: bankName ?? undefined, last4: t.last4 ?? undefined, currency: 'INR', openingBalance: 0 } }, 'assistant');
  created.push(a.id);
  return a.id;
}
