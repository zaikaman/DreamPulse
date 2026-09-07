/**
 * Shared helpers for code-split (`React.lazy`) dynamic imports.
 *
 * Venue / demo Wi-Fi is unreliable. A transient network blip while Vite's
 * runtime fetches a lazy chunk surfaces as a rejected `import()` promise
 * (`TypeError: Failed to fetch dynamically imported module`, `ChunkLoadError`,
 * ...). Without special handling that rejection unmounts the whole React tree
 * (white screen). Retrying the import a few times transparently absorbs the
 * common single-blip case before an Error Boundary ever has to render.
 */

import React from 'react';

/** Matches Vite / webpack async-chunk network failures (transient, retryable). */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name)
      : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();
  if (/ChunkLoadError/i.test(name)) return true;
  return /failed to fetch dynamically imported module|loading chunk|loading css chunk|importing a module script failed|failed to fetch|load failed|networkerror|network error/i.test(
    message,
  );
}

export interface LazyRetryOptions {
  /** Number of extra attempts after the first failure. Defaults to 2. */
  retries?: number;
  /** Base delay (ms) between attempts; backs off linearly. Defaults to 750. */
  baseDelayMs?: number;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Retry wrapper around a dynamic `import()`. Transient chunk-load failures
 * are retried with linear back-off; anything else is rethrown immediately
 * since retrying cannot help (syntax errors, missing exports, ...).
 */
export async function retryChunkImport<T>(
  importer: () => Promise<{ default: T }>,
  retries = 2,
  baseDelayMs = 750,
): Promise<{ default: T }> {
  let attempt = 0;
  for (;;) {
    try {
      return await importer();
    } catch (error) {
      if (!isChunkLoadError(error) || attempt >= retries) {
        throw error;
      }
      attempt += 1;
      await delay(baseDelayMs * attempt);
    }
  }
}

/**
 * Wraps a dynamic `import()` so transient chunk-load failures are retried
 * before the error propagates to an Error Boundary.
 *
 * @example
 * const AnalyticsView = lazyWithRetry(() =>
 *   import('./components/dashboard/AnalyticsView.js').then((m) => ({ default: m.AnalyticsView })),
 * );
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  options?: LazyRetryOptions,
): React.LazyExoticComponent<T> {
  const retries = Math.max(0, options?.retries ?? 2);
  const baseDelayMs = Math.max(0, options?.baseDelayMs ?? 750);
  return React.lazy(() => retryChunkImport(importer, retries, baseDelayMs));
}
