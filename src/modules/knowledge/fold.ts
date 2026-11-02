import type { LifeOSContext } from '@core/registry/context';
import { resolveLink, syncMentions } from '@core/links';
import type { NoteData } from './types';

/**
 * R7f, once on first open (docs/MODEL.md layer 2, *The Second Brain*):
 * Memory folds into the Second Brain so nothing Talk knew is lost. Nothing is
 * deleted and no table changes.
 * - A fact Talk kept under a name (no record then) moves onto the record when
 *   exactly one record now has that name (its title or a learned name).
 * - A fact about a record since deleted keeps the record's name beside it, so
 *   it shows under that name, not under About you (the record id stays, so a
 *   restored record gets it back).
 * - Every Note's [[mentions]] are linked again.
 */
export function foldMemory(os: LifeOSContext): { moved: number; named: number; notes: number } {
  let moved = 0;
  let named = 0;
  for (const f of os.facts.list({ limit: 100000 })) {
    if (!f.subjectId && f.subjectKey?.startsWith('name:')) {
      const id = resolveLink(os, f.subjectKey.slice(5));
      if (id) {
        os.facts.setSubject(f.id, { subjectId: id, subjectKey: f.subjectKey });
        moved++;
      }
    } else if (f.subjectId && !os.records.get(f.subjectId) && !f.subjectKey) {
      const title = os.db.get<{ title: string }>(`SELECT title FROM records WHERE id = ?`, [f.subjectId])?.title?.trim();
      if (title) {
        os.facts.setSubject(f.id, { subjectId: f.subjectId, subjectKey: `name:${title.toLowerCase()}` });
        named++;
      }
    }
  }
  const all = os.records.query<NoteData>('note', {}, { limit: 100000 });
  for (const n of all) syncMentions(os, n, 'system');
  return { moved, named, notes: all.length };
}
