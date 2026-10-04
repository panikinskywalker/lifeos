import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from './db/betterSqliteAdapter';
import { createLifeOS } from './lifeos';
import { Registry } from './registry/registry';
import type { LifeOSContext } from './registry/context';
import { bus } from './events/bus';
import { edgeLabel } from './graph/edges';
import { orgType, placeType } from '../modules/places/types';
import { personType } from '../modules/crm/types';
import { eventType } from '../modules/projects/types';

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [{ id: 'm', name: 'm', version: '1', description: '', icon: 'x', color: '#000', objects: [personType, placeType, orgType, eventType] }], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('life graph model (v7)', () => {
  it('links carry provenance, confidence and can be removed one by one', () => {
    const kendal = os.records.create({ type: 'person', title: 'Kendal', data: {} });
    const canada = os.records.create({ type: 'place', title: 'Canada', data: { kind: 'country' } });
    const flight = os.records.create({ type: 'event', title: 'Flight to Canada', data: { kind: 'flight', startAt: Date.parse('2026-09-08T12:00:00') } });
    const r = os.links.link(flight.id, kendal.id, 'with', {}, 'assistant', { source: 'dump', sourceId: 'd1', confidence: 0.8 });
    os.links.link(flight.id, canada.id, 'to', {}, 'assistant', { source: 'dump', sourceId: 'd1' });
    expect(os.links.get(r.id)).toMatchObject({ kind: 'with', source: 'dump', sourceId: 'd1', confidence: 0.8 });
    expect(os.records.get(flight.id)!.subtitle).toBe('Flight');
    expect(os.links.forEntity(kendal.id).map((x) => [edgeLabel(x.relation.kind, x.direction), x.other.title])).toEqual([['Was at', 'Flight to Canada']]);
    os.links.remove(r.id);
    expect(os.links.forEntity(kendal.id)).toEqual([]);
    expect(os.links.forEntity(flight.id)).toHaveLength(1);
  });

  it('dumps can be about a record; To check lists unticked writes, flagged first', () => {
    const k = os.records.create({ type: 'person', title: 'Kendal', data: {} });
    const d = os.dumps.add({ body: 'her favourite colour is pink', subjectId: k.id });
    expect(os.dumps.get(d.id)!.subjectId).toBe(k.id);
    const a = os.dumps.addExtraction({ dumpId: d.id, kind: 'person', action: 'updated', entityId: k.id, label: 'Kendal · notes', before: { notes: null } });
    const b = os.dumps.addExtraction({ dumpId: d.id, kind: 'person', entityId: k.id, label: 'Kendal', flag: 'Guessed which Kendal', confidence: 0.7 });
    expect(os.dumps.toCheck().map((x) => x.id)).toEqual([b.id, a.id]);
    expect(os.dumps.extraction(a.id)!.before).toEqual({ notes: null });
    os.dumps.setChecked(b.id);
    expect(os.dumps.toCheckCount()).toBe(1);
    // 15 days untouched → approved (the record itself was always saved).
    expect(os.dumps.autoApprove(15, Date.now() + 14 * 86_400_000)).toBe(0);
    expect(os.dumps.autoApprove(15, Date.now() + 16 * 86_400_000)).toBe(1);
    expect(os.dumps.toCheckCount()).toBe(0);
    expect(os.dumps.extraction(a.id)).toMatchObject({ checked: true, undone: false });
  });
});
