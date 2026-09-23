import { createFormatters, DEFAULT_LOCALE } from './format';

describe('format.currency', () => {
  const f = createFormatters(() => DEFAULT_LOCALE);
  it('drops decimals for whole amounts and keeps two otherwise', () => {
    expect(f.currency(24000)).toBe('₹24,000');
    expect(f.currency(118000)).toBe('₹1,18,000');
    expect(f.currency(719.5)).toBe('₹719.50');
    expect(f.currency(0.1 + 0.2)).toBe('₹0.30');
  });
  it('formats other currencies in the same locale', () => {
    expect(f.currency(12, 'USD')).toBe('$12');
    expect(f.currency(12.5, 'EUR')).toBe('€12.50');
  });
});
