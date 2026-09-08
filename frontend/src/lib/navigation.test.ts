import { describe, it, expect } from 'vitest';
import {
  getHashForView,
  getViewForHash,
  getProfileAddressFromHash,
  navigateToView,
} from './navigation.js';

describe('getHashForView', () => {
  it('returns canonical hashes', () => {
    expect(getHashForView('Trade Terminal')).toBe('trade');
    expect(getHashForView('Swarm Arena')).toBe('arena');
    expect(getHashForView('Landing')).toBe('');
  });
});

describe('getViewForHash', () => {
  it('returns Landing for empty or unknown hashes', () => {
    expect(getViewForHash('')).toBe('Landing');
    expect(getViewForHash('#nope-unknown-xyz')).toBe('Landing');
  });

  it('resolves canonical hashes and aliases', () => {
    expect(getViewForHash('#trade')).toBe('Trade Terminal');
    expect(getViewForHash('#terminal')).toBe('Trade Terminal');
    expect(getViewForHash('#markets')).toBe('Markets');
    expect(getViewForHash('#depth')).toBe('Markets');
    expect(getViewForHash('#arena')).toBe('Swarm Arena');
    expect(getViewForHash('#leaderboard')).toBe('Swarm Arena');
    expect(getViewForHash('#studio')).toBe('Strategy Studio');
    expect(getViewForHash('#backtest')).toBe('Backtester');
    expect(getViewForHash('#analytics')).toBe('Analytics');
    expect(getViewForHash('#settlement')).toBe('Settlement');
    expect(getViewForHash('#profile')).toBe('Trader Profile');
    expect(getViewForHash('#radar')).toBe('Edge Radar');
    expect(getViewForHash('#swarm')).toBe('AI Swarm Feed');
    expect(getViewForHash('#cockpit')).toBe('Swarm Cockpit');
  });

  it('normalizes case, leading hashes, and query strings', () => {
    expect(getViewForHash('##TRADE?foo=1')).toBe('Trade Terminal');
    expect(getViewForHash('#Markets/extra')).toBe('Markets');
  });
});

describe('getProfileAddressFromHash', () => {
  it('extracts address from profile path', () => {
    expect(getProfileAddressFromHash('#profile/0xABC123')).toBe('0xABC123');
    expect(getProfileAddressFromHash('#trader/0xDEF456')).toBe('0xDEF456');
  });

  it('extracts address from query param', () => {
    expect(getProfileAddressFromHash('#profile?address=0xQWE789')).toBe('0xQWE789');
  });

  it('returns null when no address present', () => {
    expect(getProfileAddressFromHash('')).toBeNull();
    expect(getProfileAddressFromHash('#trade')).toBeNull();
  });
});

describe('navigateToView', () => {
  it('is a no-op outside the browser', () => {
    expect(() => navigateToView('Trade Terminal')).not.toThrow();
  });
});
