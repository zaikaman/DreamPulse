import { describe, it, expect, vi } from 'vitest';
import { isChunkLoadError, retryChunkImport } from './lazy-with-retry.js';

describe('isChunkLoadError', () => {
  it('returns false for empty input', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });

  it('detects chunk load error names', () => {
    expect(isChunkLoadError({ name: 'ChunkLoadError', message: 'x' })).toBe(true);
  });

  it('detects vite dynamic-import network failures', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 42 failed'))).toBe(true);
    expect(isChunkLoadError('NetworkError when attempting to fetch resource.')).toBe(true);
  });

  it('ignores non-network errors', () => {
    expect(isChunkLoadError(new Error('SyntaxError: unexpected token'))).toBe(false);
    expect(isChunkLoadError(new Error('Cannot find module'))).toBe(false);
  });
});

describe('retryChunkImport', () => {
  it('resolves on first success', async () => {
    const importer = vi.fn().mockResolvedValue({ default: 'ok' });
    await expect(retryChunkImport(importer, 2, 0)).resolves.toEqual({ default: 'ok' });
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('retries transient chunk failures then succeeds', async () => {
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error('Loading chunk 7 failed'))
      .mockResolvedValue({ default: 'recovered' });
    await expect(retryChunkImport(importer, 2, 0)).resolves.toEqual({ default: 'recovered' });
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it('rethrows fatal errors immediately without retry', async () => {
    const importer = vi.fn().mockRejectedValue(new Error('SyntaxError: bad export'));
    await expect(retryChunkImport(importer, 2, 0)).rejects.toThrow('SyntaxError');
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('gives up after exhausting retries', async () => {
    const importer = vi.fn().mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
    await expect(retryChunkImport(importer, 1, 0)).rejects.toThrow('Failed to fetch');
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
