import { describe, expect, it } from 'vitest';
import { suggestCaptains, type CaptainGame } from './captains';

const night = (date: string, played: string[], extra: Partial<CaptainGame> = {}): CaptainGame => ({ date, played, ...extra });
const overall = (id: string) => ({ a: 70, b: 80, c: 60, d: 75, e: 50 })[id] ?? 60;

describe('captains, as Turf web picks them', () => {
  it('last match’s player of the match takes the armband on their side', () => {
    const r = suggestCaptains({ A: ['a', 'b'], B: ['c', 'd'] }, [night('2026-11-01', ['a', 'b', 'c', 'd'], { motmId: 'c' })], overall);
    expect(r.B).toEqual({ personId: 'c', why: 'player of the match last time' });
  });

  it('otherwise the regular who has captained least, never last time’s captain', () => {
    const history = [
      night('2026-10-01', ['a', 'b', 'c', 'd'], { captainAId: 'a' }),
      night('2026-10-08', ['a', 'b', 'c', 'd'], { captainAId: 'a', captainBId: 'c' }),
      night('2026-10-15', ['a', 'b', 'c', 'd'], { captainAId: 'b', captainBId: 'd' }),
    ];
    const r = suggestCaptains({ A: ['a', 'b'], B: ['c', 'd'] }, history, overall);
    expect(r.A?.personId).toBe('a'); // b led last time, so a, though a has led twice
    expect(r.B?.personId).toBe('c');
  });

  it('with no regulars on a side, the highest overall there; nobody on a side, nobody', () => {
    const r = suggestCaptains({ A: ['e', 'b'], B: [] }, [], overall);
    expect(r.A).toEqual({ personId: 'b', why: 'highest overall on the side' });
    expect(r.B).toBeNull();
  });
});
