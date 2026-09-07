import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import {
  classifyRejection,
  handleUnhandledRejection,
  handleUncaughtException,
  registerShutdownHook,
  executeGracefulShutdown,
  installProcessSafetyHandlers,
  getProcessSafetyMetrics,
  resetSafetyMetrics,
  clearShutdownHooks,
} from '../src/utils/process-safety.js';

describe('Process Safety & Lifecycle Management (BE-BUG-01)', () => {
  beforeEach(() => {
    resetSafetyMetrics();
    clearShutdownHooks();
  });

  describe('classifyRejection', () => {
    it('classifies Somnia testnet RPC timeouts and contract call errors correctly', () => {
      expect(classifyRejection(new Error('SomniaMarkets indexer timeout'))).toBe('SOMNIA_RPC_TIMEOUT');
      expect(classifyRejection(new Error('eth_call execution reverted'))).toBe('SOMNIA_RPC_TIMEOUT');
      expect(classifyRejection(new Error('getBinaryOrderBook failed: replacement transaction underpriced'))).toBe(
        'SOMNIA_RPC_TIMEOUT'
      );
      expect(classifyRejection(new Error('listLiveBinaryMarkets RPC timeout'))).toBe('SOMNIA_RPC_TIMEOUT');
      expect(classifyRejection('Somnia RPC node returned 504')).toBe('SOMNIA_RPC_TIMEOUT');
    });

    it('classifies Groq LLM API rate limits and key rotation failures correctly', () => {
      expect(classifyRejection(new Error('Rate limit reached for model llama-3.3-70b-versatile'))).toBe(
        'GROQ_ROTATION_FAILURE'
      );
      expect(classifyRejection(new Error('api.groq.com returned HTTP 429 Too Many Requests'))).toBe(
        'GROQ_ROTATION_FAILURE'
      );
      expect(classifyRejection(new Error('[LLM Groq Rotation] Key failed (attempt 3/3)'))).toBe(
        'GROQ_ROTATION_FAILURE'
      );
    });

    it('classifies transient Supabase 502/504 and connection drop errors correctly', () => {
      expect(classifyRejection(new Error('Supabase HTTP 502 Bad Gateway'))).toBe('SUPABASE_TRANSIENT_ERROR');
      expect(classifyRejection(new Error('504 Gateway Timeout from postgrest'))).toBe('SUPABASE_TRANSIENT_ERROR');
      expect(classifyRejection(new Error('connection terminated unexpectedly by supabase database'))).toBe(
        'SUPABASE_TRANSIENT_ERROR'
      );
    });

    it('classifies WebSocket client disconnects correctly', () => {
      expect(classifyRejection(new Error('WebSocket is not open: readyState 3 (CLOSED)'))).toBe('WEBSOCKET_DROP');
      expect(classifyRejection(new Error('ws closed abruptly'))).toBe('WEBSOCKET_DROP');
    });

    it('classifies transient low-level network I/O errors correctly', () => {
      expect(classifyRejection(new Error('connect ETIMEDOUT 185.199.108.153:443'))).toBe('NETWORK_IO_ERROR');
      expect(classifyRejection(new Error('read ECONNRESET'))).toBe('NETWORK_IO_ERROR');
      expect(classifyRejection(new Error('UND_ERR_CONNECT_TIMEOUT connection timed out'))).toBe('NETWORK_IO_ERROR');
    });

    it('classifies arbitrary unforeseen errors as GENERIC_UNHANDLED_REJECTION', () => {
      expect(classifyRejection(new Error('Unexpected calculation overflow in math library'))).toBe(
        'GENERIC_UNHANDLED_REJECTION'
      );
      expect(classifyRejection({ code: 'CUSTOM_BIZ_LOGIC_ERROR' })).toBe('GENERIC_UNHANDLED_REJECTION');
    });
  });

  describe('handleUnhandledRejection', () => {
    it('catches and tracks Somnia RPC timeout without terminating process', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const somniaError = new Error('SomniaMarkets indexer timeout after 8000ms');
      handleUnhandledRejection(somniaError, Promise.reject(somniaError).catch(() => {}));

      const metrics = getProcessSafetyMetrics();
      expect(metrics.totalUnhandledRejections).toBe(1);
      expect(metrics.rejectionsByCategory.SOMNIA_RPC_TIMEOUT).toBe(1);
      expect(metrics.lastRejection?.category).toBe('SOMNIA_RPC_TIMEOUT');
      expect(metrics.lastRejection?.message).toContain('SomniaMarkets indexer timeout');

      consoleWarnSpy.mockRestore();
    });

    it('catches and tracks Groq rotation and Supabase transient errors', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      handleUnhandledRejection(new Error('Groq rate limit reached'), Promise.resolve());
      handleUnhandledRejection(new Error('Supabase 502 Bad Gateway'), Promise.resolve());

      const metrics = getProcessSafetyMetrics();
      expect(metrics.totalUnhandledRejections).toBe(2);
      expect(metrics.rejectionsByCategory.GROQ_ROTATION_FAILURE).toBe(1);
      expect(metrics.rejectionsByCategory.SUPABASE_TRANSIENT_ERROR).toBe(1);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('handleUncaughtException', () => {
    it('gracefully handles recoverable socket and stream write errors', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const socketError = new Error('read ECONNRESET');
      (socketError as any).code = 'ECONNRESET';

      expect(() => handleUncaughtException(socketError, 'uncaughtException')).not.toThrow();

      const metrics = getProcessSafetyMetrics();
      expect(metrics.totalUncaughtExceptions).toBe(1);

      consoleWarnSpy.mockRestore();
    });

    it('traps generic synchronous exceptions in safety layer without throwing', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const err = new Error('ReferenceError: unexpected global state');
      expect(() => handleUncaughtException(err, 'uncaughtException')).not.toThrow();

      const metrics = getProcessSafetyMetrics();
      expect(metrics.totalUncaughtExceptions).toBe(1);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Graceful Shutdown Hooks', () => {
    it('executes registered shutdown hooks in priority order', async () => {
      const callOrder: string[] = [];

      registerShutdownHook('Low Priority Task', () => {
        callOrder.push('low');
      }, 1);

      registerShutdownHook('High Priority Task', () => {
        callOrder.push('high');
      }, 100);

      registerShutdownHook('Medium Priority Task', () => {
        callOrder.push('medium');
      }, 50);

      await executeGracefulShutdown('SIGTERM_TEST');

      expect(callOrder).toEqual(['high', 'medium', 'low']);
      expect(getProcessSafetyMetrics().isShuttingDown).toBe(true);
    });

    it('continues executing subsequent shutdown hooks even if one fails', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const callOrder: string[] = [];

      registerShutdownHook('Failing Task', () => {
        callOrder.push('failing');
        throw new Error('Simulated failure during shutdown');
      }, 80);

      registerShutdownHook('Succeeding Task', () => {
        callOrder.push('succeeding');
      }, 40);

      await executeGracefulShutdown('SIGINT_TEST');

      expect(callOrder).toEqual(['failing', 'succeeding']);
      consoleWarnSpy.mockRestore();
    });
  });

  describe('installProcessSafetyHandlers', () => {
    it('is idempotent and registers process safety handlers without error', () => {
      expect(() => {
        installProcessSafetyHandlers();
        installProcessSafetyHandlers();
      }).not.toThrow();
    });
  });

  describe('Health Check Telemetry Integration', () => {
    it('reports processSafety metrics in GET /api/health response', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.processSafety).toBeDefined();
      expect(typeof res.body.processSafety.totalUnhandledRejections).toBe('number');
      expect(typeof res.body.processSafety.totalUncaughtExceptions).toBe('number');
      expect(res.body.processSafety.rejectionsByCategory).toBeDefined();
      expect(typeof res.body.processSafety.rejectionsByCategory.SOMNIA_RPC_TIMEOUT).toBe('number');
    });
  });
});
