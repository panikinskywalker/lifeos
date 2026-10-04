import { z } from 'zod';
import type { AiToolDef } from '@core/registry/types';
import { NodeRef, categoryValue, link, log, nameOf, resolveNode, upsertNode, type GraphSession } from '@core/graph/tools';
import { resolveCandidates } from '@core/ai/lifeTools';
import { parseAmount } from '@core/ai/parser';
import { parseDateish } from '@core/ai/createAnything';

/**
 * Finance's filing tools (R1): the tools the model gets while filing a dump,
 * bound to the filing session so every write is logged with provenance and
 * undoable. `log_spend` moved here from core's graph tools.
 */
export function financeFilingTools(s: GraphSession): AiToolDef[] {
  return [
    {
      name: 'log_spend',
      description: 'Money spent or received: amount, merchant, what it was for (a record, e.g. the Dyson just bought), who with, which card/account, date.',
      input: z.object({ amount: z.union([z.number(), z.string()]), kind: z.enum(['expense', 'income']).optional(), merchant: z.string().optional(), category: z.string().optional(), date: z.string().optional(), for: NodeRef.optional(), with: z.array(NodeRef).optional(), account: z.string().optional(), note: z.string().optional() }),
      run: async (input, os) => {
        const i = input as { amount: number | string; kind?: 'expense' | 'income'; merchant?: string; category?: string; date?: string; for?: NodeRef; with?: NodeRef[]; account?: string; note?: string };
        if (!os.registry.objects.has('transaction')) return { error: 'no finance module installed' };
        const amount = typeof i.amount === 'number' ? i.amount : parseAmount(i.amount);
        if (!amount) return { error: 'no amount' };
        const account = i.account ? resolveCandidates(os, i.account, ['account']).find((c) => c.score >= 0.8) : undefined;
        const merchant = i.merchant ?? (i.for ? nameOf(i.for) : undefined);
        const partial: Record<string, unknown> = { amount, kind: i.kind ?? 'expense', merchant, date: parseDateish(i.date ?? 'today'), accountId: account?.id, note: i.note ?? (i.account && !account ? i.account : undefined), source: 'dump' };
        if (i.category) partial.category = categoryValue(os, i.category);
        // The Object fills what the sentence left out (finance: the category from merchant and text).
        const filled = os.registry.object('transaction').enrich?.(os, partial as never, { text: i.note ?? '' }) ?? {};
        const data = { ...filled, ...partial, category: (partial.category as string | undefined) ?? (filled as { category?: string }).category ?? 'other' } as { amount: number; kind: 'expense' | 'income'; category: string; merchant?: string; date: string; accountId?: string; note?: string };
        const tx = os.records.create({ object: 'transaction', data }, 'assistant');
        log(os, s, { kind: 'transaction', action: 'created', entityId: tx.id, label: `${data.kind === 'income' ? 'Income' : 'Spent'}: ${os.format.currency(amount)}${data.merchant ? ` · ${data.merchant}` : ''}` });
        if (i.for) {
          const n = upsertNode(os, s, i.for);
          if (n) link(os, s, tx.id, n.id, 'paid_for');
        }
        for (const w of i.with ?? []) {
          const r = resolveNode(os, s, w, { type: 'person' });
          const hit = r.id ? os.records.get(r.id) : undefined;
          // "…on the HDFC card" said as "with": it's how it was paid, not who was there.
          if (hit?.object === 'account') {
            if (!data.accountId) os.records.update(tx.id, { data: { accountId: hit.id } }, 'assistant');
            continue;
          }
          const n = upsertNode(os, s, w, { type: 'person' });
          if (n) link(os, s, tx.id, n.id, 'with');
        }
        return { id: tx.id };
      },
    },
  ];
}
