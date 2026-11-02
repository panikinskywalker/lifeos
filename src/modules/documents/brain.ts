import { cycleAct, cycleCandidates } from '@core/brain/upkeep';
import { dayMonth, inWords, plural } from '@core/brain/words';
import { keyHash, type BrainDef, type Candidate, type Nudge } from '@core/brain/contract';
import type { LifeOSContext } from '@core/registry/context';
import { KIND_OPTIONS, type DocumentData } from './types';

/**
 * What Documents brings the brain (docs/MODEL.md layer 8, *Slices 4 and 6*):
 * *going off*, a Document's expiry inside its notice (its Renew Cycle: shall
 * I? Renewed opens it for the new date), and *coming up*, files found in your
 * folders a day or more ago that you have not looked at (Look opens Your
 * folders). What leaves: title, kind, the expiry, how many files; never a
 * file, its text or its number.
 */

const DAY = 86_400_000;
export const FOLDERS_ROUTE = '/module/documents/folders';
const kindLabel = (k: string | undefined) => KIND_OPTIONS.find((o) => o.value === k)?.label ?? 'Other';

function expiring(os: LifeOSContext, now: number): Candidate[] {
  return cycleCandidates(os, now, 'documents').flatMap((c): Candidate[] => {
    const { template } = (c.payload ?? {}) as { template?: string | null };
    const doc = c.subjectId ? os.records.get<DocumentData>(c.subjectId) : undefined;
    const days = typeof c.record.days_left === 'number' ? c.record.days_left : null;
    if (template !== 'document.expiry' || !doc || days == null) return [c];
    const at = new Date(`${doc.data.expiresOn!.slice(0, 10)}T12:00:00`).getTime();
    const line = days < 0 ? `${doc.title}: expired on ${dayMonth(at, now)}` : days === 0 ? `${doc.title}: expires today` : `${doc.title}: expires ${dayMonth(at, now)}, ${inWords(days)}`;
    return [{
      ...c,
      kind: 'going off',
      line,
      record: { title: doc.title, kind: kindLabel(doc.data.kind), expires: doc.data.expiresOn!.slice(0, 10), days_left: days },
      urgent: days <= 0 || (doc.data.kind === 'id' && days <= 7),
      yes: 'Renewed',
    }];
  });
}

/** New files in your folders, found a day or more ago and not looked at: one nudge for the lot. */
export function newFiles(os: LifeOSContext, now = Date.now()): Candidate[] {
  const fresh = os.records
    .query<DocumentData>('document', { filter: { and: [{ field: 'status', op: 'eq', value: 'new' }] } }, { limit: 500 })
    .filter((d) => d.createdAt <= now - DAY)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!fresh.length) return [];
  const names = fresh.slice(0, 3).map((d) => d.title);
  const more = fresh.length - names.length;
  return [{
    key: `documents:new:${keyHash(fresh.map((d) => d.id))}`,
    kind: 'coming up',
    shape: 'ask',
    route: FOLDERS_ROUTE,
    title: plural(fresh.length, 'new file'),
    line: `${plural(fresh.length, 'new file')} in your folders: ${names.join(', ')}${more ? ` and ${more} more` : ''}`,
    record: { new_files: fresh.length, titles: fresh.slice(0, 5).map((d) => d.title), kinds: [...new Set(fresh.map((d) => kindLabel(d.data.kind)))] },
    rank: 30,
    yes: 'Look',
  }];
}

export const documentsBrain: BrainDef = {
  candidates: (os, now) => [...expiring(os, now), ...newFiles(os, now)],
  act(os, verb, nudge: Nudge) {
    if (nudge.key.startsWith('documents:new:')) return verb === 'yes' ? { open: FOLDERS_ROUTE } : null;
    const { template } = (nudge.payload ?? {}) as { template?: string | null };
    // Renewed: the Document opens for its new expiry, which moves the Cycle on.
    if (template === 'document.expiry') return verb === 'yes' && nudge.recordId ? { open: `/entity/document/${nudge.recordId}` } : null;
    return cycleAct(os, verb, nudge);
  },
  skills: [{ name: 'Documents', body: 'An ID or passport takes weeks to renew: say how long is left in months while it is far, in days when it is near. Never ask for or repeat a document number.' }],
};
