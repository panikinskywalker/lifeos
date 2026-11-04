import { describe, expect, it } from 'vitest';
import { urgentWhen } from './brief';

describe('the word beside an urgent line', () => {
  it('is read from the line, late first', () => {
    expect(urgentWhen('Laundry is 1 day late')).toBe('Late');
    expect(urgentWhen('Water filter overdue, due tomorrow')).toBe('Late');
    expect(urgentWhen('Leftover dal: bought yesterday, use by tomorrow')).toBe('Tomorrow');
    expect(urgentWhen('Priya’s birthday today: turns 32')).toBe('Today');
    expect(urgentWhen('Philips Trimmer from Amazon is out for delivery: the OTP is on it')).toBe('Today');
    expect(urgentWhen('Car insurance needs a look')).toBe('Soon');
  });
});
