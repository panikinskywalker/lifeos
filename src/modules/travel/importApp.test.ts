import { appTimeAt, seatsOpen } from './importApp';

describe('the trip app import, times and seat openings', () => {
  it('reads a time written with ≈ or about, and noon when there is none', () => {
    const h = (t: number) => new Date(t).getHours() * 60 + new Date(t).getMinutes();
    expect(h(appTimeAt('2026-12-26', '10:45'))).toBe(645);
    expect(h(appTimeAt('2026-12-26', '≈10:45'))).toBe(645);
    expect(h(appTimeAt('2026-12-26', 'about 9:05'))).toBe(545);
    expect(h(appTimeAt('2026-12-26', ''))).toBe(720);
  });
  it('finds a seat-opening day after about, from or ≈', () => {
    expect(new Date(seatsOpen('Seats open 26 Nov', '2026-12-26')!).getDate()).toBe(26);
    expect(new Date(seatsOpen('seats open about 22 Nov', '2026-12-22')!).getDate()).toBe(22);
    expect(new Date(seatsOpen('reserved seats open from 24 Nov', '2026-12-24')!).getDate()).toBe(24);
    expect(seatsOpen('no seats to book', '2026-12-24')).toBeUndefined();
  });
});
