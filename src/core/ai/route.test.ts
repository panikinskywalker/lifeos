import { describe, expect, it } from 'vitest';
import { classifyInput } from './route';

describe('one box: ask or tell', () => {
  it('questions, with or without a question mark', () => {
    for (const q of ['when did I last see Kendal', 'Who owes me money?', 'how much did I spend on food this month', 'what did I dump about the landlord', 'did I pay rent', 'show me trips this year', 'is my car insurance due', 'Kendal’s birthday?']) expect([q, classifyInput(q)]).toEqual([q, 'ask']);
  });
  it('statements and dumps are filed', () => {
    for (const s of ['did laundry', 'met a new friend today named Kendal, her birthday is 8 Sept', 'when I was in Canada I met Kendal', 'took a flight from US to CAN with Kendal on 8 Sept', 'her fav colour is pink', 'What a day. Kendal called and we booked tickets.', 'spent 450 on lunch']) expect([s, classifyInput(s)]).toEqual([s, 'tell']);
  });
});
