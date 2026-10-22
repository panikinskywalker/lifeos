import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { GroupData, PersonData } from './types';

/**
 * R2: Works at and Lives in are links, with the typed text kept as the
 * fallback (agreed 22 Oct). A person's typed company becomes a link to the
 * Organisation of that name (made when there is none), their city a link to
 * the Place; once on start for old records, and whenever the text is typed.
 */

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The record of `object` with this name (exact, then a prefix either way), or a new one of `kind`. */
function recordNamed(os: LifeOSContext, object: string, name: string, kind: string): ObjectRecord {
  const all = os.records.query<{ kind?: string }>(object, {}, { limit: 5000 });
  const n = norm(name);
  const hit = all.find((o) => norm(o.title) === n) ?? all.find((o) => n.length >= 4 && (norm(o.title).startsWith(n) || n.startsWith(norm(o.title))));
  return hit ?? os.records.create({ object, title: name.trim(), data: { kind } }, 'system');
}

/** Link a person's typed company / city. Only fills an empty link, or follows the text when it was changed. Returns whether it wrote. */
export function linkWorkAndHome(os: LifeOSContext, p: ObjectRecord<PersonData>, changed?: string[]): boolean {
  const patch: Partial<PersonData> = {};
  const moved = (k: string) => !changed || changed.includes(`data.${k}`);
  if (os.registry.objects.has('org') && p.data.company?.trim() && moved('company')) {
    const cur = p.data.worksAtId ? os.records.get(p.data.worksAtId) : null;
    if (!cur || (changed && norm(cur.title) !== norm(p.data.company))) {
      const org = recordNamed(os, 'org', p.data.company, 'company');
      if (org.id !== p.data.worksAtId) patch.worksAtId = org.id;
    }
  }
  if (os.registry.objects.has('place') && p.data.city?.trim() && moved('city')) {
    const cur = p.data.livesInId ? os.records.get(p.data.livesInId) : null;
    if (!cur || (changed && norm(cur.title) !== norm(p.data.city))) {
      const place = recordNamed(os, 'place', p.data.city, 'city');
      if (place.id !== p.data.livesInId) patch.livesInId = place.id;
    }
  }
  if (!Object.keys(patch).length) return false;
  os.records.update<PersonData>(p.id, { data: patch }, 'system');
  return true;
}

/** Once: every person's company and city linked; the Football group's kind is sport. */
export function foldPeople(os: LifeOSContext): { linked: number; groups: number } {
  let linked = 0;
  let groups = 0;
  os.db.transaction(() => {
    for (const p of os.records.query<PersonData>('person', {}, { limit: 5000 })) if (linkWorkAndHome(os, p)) linked++;
    for (const g of os.records.query<GroupData>('group', {}, { limit: 1000 })) {
      if (g.data.name.trim().toLowerCase() === 'football' && g.data.kind !== 'sport') {
        os.records.update<GroupData>(g.id, { data: { kind: 'sport' } }, 'system');
        groups++;
      }
    }
  });
  return { linked, groups };
}
