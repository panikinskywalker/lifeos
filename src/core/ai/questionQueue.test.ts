import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import type { LLMProvider } from './provider';
import { bus } from '../events/bus';
import { answerQueued } from './questionQueue';
import { localAnswer } from './localAnswer';
import { personType } from '../../modules/crm/types';
import { eventType } from '../../modules/projects/types';
import { placeType, orgType } from '../../modules/places/types';

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [{ id: 'm', name: 'm', version: '1', description: '', icon: 'x', color: '#000', objects: [personType, eventType, placeType, orgType] }], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('questions when no model is free', () => {
  it('the phone answers from the graph: the record, its latest dated connections, notes', () => {
    const k = os.records.create({ type: 'person', title: 'Kendal', data: { notes: '• Favourite colour: pink' } });
    const canoe = os.records.create({ type: 'place', title: 'Canoe', data: { kind: 'restaurant' } });
    const dinner = os.records.create({ type: 'event', title: 'Dinner at Canoe', data: { kind: 'dinner', startAt: Date.parse('2026-09-08T12:00:00') } });
    os.links.link(dinner.id, k.id, 'with');
    os.links.link(dinner.id, canoe.id, 'at');
    const a = localAnswer(os, 'when did I last see Kendal?');
    expect(a.text).toContain('Kendal (person)');
    expect(a.text).toMatch(/Latest: Dinner at Canoe, 8 Sept 2026 \(at Canoe\)/);
    expect(a.text).toContain('• Favourite colour: pink');
    expect(a.cards[0]).toMatchObject({ kind: 'record', entityId: k.id });
    expect(localAnswer(os, 'what is the meaning of life').text).toBe('Nothing on the phone matches that yet.');
  });

  it('queued questions are answered when a model is free; limits make them wait', async () => {
    const q = os.questions.add('where does Karan work?');
    const busy: LLMProvider = { id: 'groq', complete: async () => { throw Object.assign(new Error('groq 429: tokens per day'), { status: 429, retryAfterMs: 3_600_000 }); } };
    expect(await answerQueued(os, busy)).toBe(0);
    expect(os.questions.get(q.id)!.retryAt! - Date.now()).toBeGreaterThan(3_500_000);
    expect(os.questions.due()).toEqual([]);
    os.db.run(`UPDATE queued_questions SET retry_at=? WHERE id=?`, [Date.now() - 1, q.id]);
    const ok: LLMProvider = { id: 'gemini', complete: async () => ({ content: [{ type: 'text', text: 'Karan works at Zomato.' }], stopReason: 'end_turn' }) };
    expect(await answerQueued(os, ok)).toBe(1);
    expect(os.questions.get(q.id)).toMatchObject({ status: 'answered', answer: 'Karan works at Zomato.' });
  });
});
