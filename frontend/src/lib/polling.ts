/**
 * Centralized polling utilities to prevent polling storms.
 * - Pauses when document.hidden (background tab)
 * - Provides React Query compatible staleTime defaults
 * - Single source of truth for heartbeat intervals
 */

// Recommended stale times for react-query (ms)
export const STALE_TIMES = {
  markets: 5000,
  session: 20000,
  swarm: 30000,
  sweeper: 25000,
  settled: 15000,
  allowance: 30000,
} as const;

// Returns true if polling should proceed (document visible and not throttled)
export function shouldPoll(): boolean {
  if (typeof document === 'undefined') return true;
  return !document.hidden;
}

/**
 * Creates a visibility-aware interval that automatically pauses when the tab is hidden
 * and resumes (with immediate tick) when it becomes visible.
 * Returns a cleanup function.
 */
export function createVisibilityAwareInterval(
  callback: () => void,
  intervalMs: number,
): () => void {
  let intervalId: number | null = null;

  const start = () => {
    if (intervalId != null) return;
    intervalId = window.setInterval(() => {
      if (!shouldPoll()) return;
      callback();
    }, intervalMs);
  };

  const stop = () => {
    if (intervalId != null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      // Immediate refresh on foreground to avoid stale data
      callback();
      start();
    } else {
      // Hidden: pause interval to save resources, but keep callback from firing via guard
      // We keep interval alive but guard with shouldPoll — cheaper than restart storm
    }
  };

  const onFocus = () => {
    if (shouldPoll()) callback();
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onFocus);
  start();

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onFocus);
  };
}

/**
 * React hook wrapper for visibility-aware polling.
 */
import { useEffect, useRef } from 'react';

export function useVisibilityAwareInterval(
  callback: () => void,
  intervalMs: number | null,
  enabled: boolean = true,
): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled || intervalMs == null) return;
    return createVisibilityAwareInterval(() => cbRef.current(), intervalMs);
  }, [intervalMs, enabled]);
}
