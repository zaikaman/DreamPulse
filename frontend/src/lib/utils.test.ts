import { describe, it, expect } from 'vitest';
import { cn, formatCurrency, formatNumber, formatAddress } from './utils.js';

describe('cn', () => {
  it('merges class names and resolves tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'bg-blue-500')).toBe('text-red-500 bg-blue-500');
  });

  it('handles conditional and falsy inputs', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c');
    expect(cn()).toBe('');
  });
});

describe('formatCurrency', () => {
  it('formats whole dollars without decimals by default', () => {
    expect(formatCurrency(24500)).toBe('$24,500');
  });

  it('formats with decimals when requested', () => {
    expect(formatCurrency(24500.5, 2)).toBe('$24,500.50');
  });

  it('handles zero and negative amounts', () => {
    expect(formatCurrency(0)).toBe('$0');
    expect(formatCurrency(-1234)).toBe('-$1,234');
  });
});

describe('formatNumber', () => {
  it('adds thousands separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('respects decimal places', () => {
    expect(formatNumber(1.2345, 2)).toBe('1.23');
    expect(formatNumber(1000, 2)).toBe('1,000.00');
  });
});

describe('formatAddress', () => {
  it('shortens long addresses', () => {
    expect(formatAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234...5678');
  });

  it('returns short addresses and empty input unchanged', () => {
    expect(formatAddress('0x1234')).toBe('0x1234');
    expect(formatAddress('')).toBe('');
  });
});
