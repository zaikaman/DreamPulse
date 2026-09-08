import { describe, it, expect } from 'vitest';
import {
  UNLIMITED_AMOUNT,
  isUnlimitedAmount,
  isUnlimitedDuration,
  isUnlimitedExpiry,
  formatCapAmount,
  formatSessionTimeRemaining,
} from './sessionUtils.js';

describe('isUnlimitedAmount', () => {
  it('detects unlimited caps', () => {
    expect(isUnlimitedAmount(UNLIMITED_AMOUNT)).toBe(true);
    expect(isUnlimitedAmount(UNLIMITED_AMOUNT + 100)).toBe(true);
    expect(isUnlimitedAmount(100)).toBe(false);
  });

  it('returns false for nullish input', () => {
    expect(isUnlimitedAmount(undefined)).toBe(false);
    expect(isUnlimitedAmount(null)).toBe(false);
  });
});

describe('isUnlimitedDuration', () => {
  it('treats >= 10 years as perpetual', () => {
    expect(isUnlimitedDuration(87600)).toBe(true);
    expect(isUnlimitedDuration(876000)).toBe(true);
    expect(isUnlimitedDuration(24)).toBe(false);
    expect(isUnlimitedDuration(undefined)).toBe(false);
    expect(isUnlimitedDuration(null)).toBe(false);
  });
});

describe('isUnlimitedExpiry', () => {
  it('treats far-future expiry as unlimited', () => {
    const farFuture = new Date(Date.now() + 365 * 5 * 86400 * 1000).toISOString();
    expect(isUnlimitedExpiry(farFuture)).toBe(true);
  });

  it('treats near expiry as limited', () => {
    const soon = new Date(Date.now() + 3600 * 1000).toISOString();
    expect(isUnlimitedExpiry(soon)).toBe(false);
    expect(isUnlimitedExpiry(undefined)).toBe(false);
    expect(isUnlimitedExpiry(null)).toBe(false);
  });
});

describe('formatCapAmount', () => {
  it('returns unlimited label for uncapped amounts', () => {
    expect(formatCapAmount(UNLIMITED_AMOUNT)).toBe('Unlimited');
  });

  it('formats capped amounts with suffix', () => {
    expect(formatCapAmount(1500)).toBe('1,500 tUSDC');
    expect(formatCapAmount(1500, '')).toBe('1,500');
  });

  it('handles nullish input', () => {
    expect(formatCapAmount(undefined)).toBe('0 tUSDC');
    expect(formatCapAmount(null)).toBe('0 tUSDC');
  });
});

describe('formatSessionTimeRemaining', () => {
  it('returns empty string for missing expiry', () => {
    expect(formatSessionTimeRemaining(undefined)).toBe('');
    expect(formatSessionTimeRemaining(null)).toBe('');
  });

  it('returns Expired for past timestamps', () => {
    expect(formatSessionTimeRemaining(new Date(Date.now() - 1000).toISOString())).toBe('Expired');
  });

  it('returns Perpetual for far-future timestamps', () => {
    const farFuture = new Date(Date.now() + 365 * 5 * 86400 * 1000).toISOString();
    expect(formatSessionTimeRemaining(farFuture)).toBe('Perpetual');
  });

  it('formats days, hours, and minutes remaining', () => {
    expect(formatSessionTimeRemaining(new Date(Date.now() + 3 * 86400 * 1000 + 2 * 3600 * 1000).toISOString())).toMatch(/3d 2h/);
    expect(formatSessionTimeRemaining(new Date(Date.now() + 5 * 3600 * 1000).toISOString())).toMatch(/5h \d+m/);
    expect(formatSessionTimeRemaining(new Date(Date.now() + 90 * 1000).toISOString())).toMatch(/1m \d+s/);
  });
});
