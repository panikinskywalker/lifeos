import { cycleAct, cycleCandidates } from '@core/brain/upkeep';
import { dayMonth, dueWords, inWords } from '@core/brain/words';
import type { BrainDef, Candidate, Nudge } from '@core/brain/contract';
import type { LifeOSContext } from '@core/registry/context';
import type { AssetData } from './types';

/**
 * What Assets brings the brain (docs/MODEL.md layer 8, *Slices 4 and 6*): its
 * Cycles in its own words. A warranty ending inside 30 days (going off, is
 * this right?: a heads-up while a fault can still be claimed), a service due
 * by date or km, or late (shall I? Serviced logs it), and any other Cycle on
 * an Asset or a Routine as Upkeep words it (Done). What leaves: the thing, its
 * category, the Cycle, days and km left; never a serial or a registration.
 */

const km = (n: number) => `${Math.round(n).toLocaleString('en-IN')} km`;

export function assetCandidates(os: LifeOSContext, now = Date.now()): Candidate[] {
  return cycleCandidates(os, now, 'assets').map((c): Candidate => {
    const { template } = (c.payload ?? {}) as { template?: string | null };
    const a = c.subjectId ? os.records.get<AssetData>(c.subjectId) : undefined;
    if (!a || a.object !== 'asset') return c;
    const days = typeof c.record.days_left === 'number' ? c.record.days_left : null;
    const kmLeft = typeof c.record.km_left === 'number' ? c.record.km_left : null;
    const record = { ...c.record, category: a.data.category ?? null };
    if (template === 'asset.warranty' && days != null) {
      const at = new Date(`${a.data.warrantyUntil!.slice(0, 10)}T12:00:00`).getTime();
      const line = days < 0 ? `${a.title}: warranty ended on ${dayMonth(at, now)}` : days === 0 ? `${a.title}: warranty ends today` : `${a.title}: warranty ends ${inWords(days)}, on ${dayMonth(at, now)}`;
      return { ...c, kind: 'going off', shape: 'check', line, record, urgent: days === 0, yes: 'Right' };
    }
    if (template === 'asset.service') {
      const late = (days != null && days < 0) || (kmLeft != null && kmLeft <= 0);
      const parts = [days != null && days >= 0 ? (days === 0 ? 'today' : inWords(days)) : null, kmLeft != null && kmLeft > 0 ? km(kmLeft) : null].filter(Boolean);
      const line = late ? `${a.title}: service ${kmLeft != null && kmLeft <= 0 ? `${km(-kmLeft)} overdue` : dueWords(days!, now)}` : `${a.title}: service due ${parts.join(' or ')}`;
      return { ...c, line, record, yes: 'Serviced' };
    }
    return { ...c, record };
  });
}

export const assetsBrain: BrainDef = {
  candidates: assetCandidates,
  act(os, verb, nudge: Nudge) {
    // A warranty is a heads-up; the rest are logged done, as in Upkeep.
    if (nudge.shape === 'check') return null;
    return cycleAct(os, verb, nudge);
  },
  skills: [{ name: 'Assets', body: 'A warranty ending is worth a word only while a fault can still be claimed: say when it ends. A service says by date or by km, whichever comes first. Never suggest a garage or a price.' }],
};
