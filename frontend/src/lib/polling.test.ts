import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STALE_TIMES, shouldPoll, createVisibilityAwareInterval } from './polling.js';

describe('STALE_TIMES', () => {
  it('defines sane react-query defaults', () => {
    expect(STALE_TIMES.markets).toBe(5000);
    expect(STALE_TIMES.session).toBe(20000);
    expect(STALE_TIMES.swarm).toBe(30000);
    expect(STALE_TIMES.markets).toBeLessThan(STALE_TIMES.session);
  });
});

describe('shouldPoll', () => {
  it('pauses when the tab is hidden', () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    expect(shouldPoll()).toBe(false);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    expect(shouldPoll()).toBe(true);
  });
});

describe('createVisibilityAwareInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires callback on interval ticks while visible', () => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    const cb = vi.fn();
    const cleanup = createVisibilityAwareInterval(cb, 1000);

    vi.advanceTimersByTime(3000);
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(3);

    cleanup();
    const callsAfterCleanup = cb.mock.calls.length;
    vi.advanceTimersByTime(2000);
    expect(cb.mock.calls.length).toBe(callsAfterCleanup);
  });

  it('skips ticks while the tab is hidden', () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const cb = vi.fn();
    const cleanup = createVisibilityAwareInterval(cb, 1000);

    vi.advanceTimersByTime(3000);
    expect(cb).not.toHaveBeenCalled();
    cleanup();
  });
});
