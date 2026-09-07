/**
 * Process Safety & Lifecycle Management Module (BE-BUG-01 Fix)
 *
 * In Node 16+, unhandled promise rejections terminate the Node process immediately with code 1.
 * This module installs enterprise-grade process-level safety handlers to:
 * 1. Catch and classify unhandled promise rejections (Somnia testnet RPC timeouts, Groq rotation errors, Supabase 502/504).
 * 2. Log structured, high-resolution diagnostic telemetry while preventing daemon crash.
 * 3. Handle uncaught exceptions with discrimination between recoverable socket/stream errors and fatal corruptions.
 * 4. Manage clean, graceful shutdown hooks on SIGTERM/SIGINT (stopping swarm runners, flushing WS frames, closing HTTP sockets).
 */

export type RejectionCategory =
  | 'SOMNIA_RPC_TIMEOUT'
  | 'GROQ_ROTATION_FAILURE'
  | 'SUPABASE_TRANSIENT_ERROR'
  | 'WEBSOCKET_DROP'
  | 'NETWORK_IO_ERROR'
  | 'GENERIC_UNHANDLED_REJECTION';

export interface ProcessSafetyMetrics {
  totalUnhandledRejections: number;
  totalUncaughtExceptions: number;
  rejectionsByCategory: Record<RejectionCategory, number>;
  lastRejection?: {
    category: RejectionCategory;
    message: string;
    stack?: string;
    timestamp: string;
  };
  isShuttingDown: boolean;
}

export type ShutdownHook = () => Promise<void> | void;

interface RegisteredShutdownHook {
  name: string;
  priority: number; // Higher numbers run first
  handler: ShutdownHook;
}

// In-memory safety metrics
const safetyMetrics: ProcessSafetyMetrics = {
  totalUnhandledRejections: 0,
  totalUncaughtExceptions: 0,
  rejectionsByCategory: {
    SOMNIA_RPC_TIMEOUT: 0,
    GROQ_ROTATION_FAILURE: 0,
    SUPABASE_TRANSIENT_ERROR: 0,
    WEBSOCKET_DROP: 0,
    NETWORK_IO_ERROR: 0,
    GENERIC_UNHANDLED_REJECTION: 0,
  },
  isShuttingDown: false,
};

const shutdownHooks: RegisteredShutdownHook[] = [];
let handlersInstalled = false;

/**
 * Classifies an unhandled rejection reason into an operational category.
 */
export function classifyRejection(reason: unknown): RejectionCategory {
  const message = (
    reason instanceof Error
      ? `${reason.name} ${reason.message} ${reason.stack || ''}`
      : typeof reason === 'object' && reason !== null
        ? JSON.stringify(reason)
        : String(reason)
  ).toLowerCase();

  // 1. Somnia Testnet RPC / Smart Contract / Indexer timeouts & network errors
  if (
    message.includes('somniamarkets') ||
    message.includes('somnia') ||
    message.includes('indexer timeout') ||
    message.includes('eth_call') ||
    message.includes('eth_estimategas') ||
    message.includes('eth_sendrawtransaction') ||
    message.includes('getmarketonchain') ||
    message.includes('getbinaryorderbook') ||
    message.includes('listbinarymarkets') ||
    message.includes('listlivebinarymarkets') ||
    message.includes('call revert') ||
    message.includes('execution reverted') ||
    message.includes('nonce too low') ||
    message.includes('replacement transaction underpriced')
  ) {
    return 'SOMNIA_RPC_TIMEOUT';
  }

  // 2. Groq LLM API rate limits, rotation failures, provider 429/500/503
  if (
    message.includes('groq') ||
    message.includes('api.groq.com') ||
    message.includes('rate limit reached') ||
    message.includes('model_rate_limit') ||
    message.includes('llm groq rotation') ||
    message.includes('groq key rotation')
  ) {
    return 'GROQ_ROTATION_FAILURE';
  }

  // 3. Supabase transient HTTP 502/503/504, connection drops, postgres timeouts
  if (
    message.includes('supabase') ||
    message.includes('postgrest') ||
    message.includes('pgrst') ||
    message.includes('502 bad gateway') ||
    message.includes('503 service unavailable') ||
    message.includes('504 gateway timeout') ||
    message.includes('connection terminated unexpectedly') ||
    message.includes('relation "orders" does not exist') ||
    (message.includes('fetch failed') && message.includes('supabase.co'))
  ) {
    return 'SUPABASE_TRANSIENT_ERROR';
  }

  // 4. WebSocket drop / socket disconnects
  if (
    message.includes('websocket is not open') ||
    message.includes('readystate 3') ||
    message.includes('readystate 2') ||
    message.includes('ws closed') ||
    message.includes('cannot call write after a stream was destroyed')
  ) {
    return 'WEBSOCKET_DROP';
  }

  // 5. General network I/O errors (transient TCP resets, DNS, timeouts)
  if (
    message.includes('etimedout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('und_err_connect_timeout') ||
    message.includes('und_err_socket') ||
    message.includes('und_err_headers_timeout') ||
    message.includes('enotfound') ||
    message.includes('eai_again') ||
    message.includes('fetch failed')
  ) {
    return 'NETWORK_IO_ERROR';
  }

  return 'GENERIC_UNHANDLED_REJECTION';
}

/**
 * Primary unhandled promise rejection handler.
 * Logs the error with full diagnostic context and updates safety metrics.
 * Critically, attaching this listener prevents Node 16+ from silently terminating the process.
 */
export function handleUnhandledRejection(reason: unknown, _promise?: Promise<unknown>): void {
  const category = classifyRejection(reason);
  const now = new Date().toISOString();

  safetyMetrics.totalUnhandledRejections += 1;
  safetyMetrics.rejectionsByCategory[category] = (safetyMetrics.rejectionsByCategory[category] || 0) + 1;

  const errMsg = reason instanceof Error ? reason.message : String(reason);
  const errStack = reason instanceof Error ? reason.stack : undefined;

  safetyMetrics.lastRejection = {
    category,
    message: errMsg,
    stack: errStack,
    timestamp: now,
  };

  // Structured diagnostic logger
  console.warn(
    `[ProcessSafety] Intercepted unhandled promise rejection [Category: ${category}] at ${now}:\n` +
      `  Message: ${errMsg}\n` +
      (errStack ? `  Stack: ${errStack.split('\n').slice(0, 4).join('\n')}\n` : '') +
      `  Promise: [object Promise]\n` +
      `  Action: Daemon state preserved. Continuing execution without termination.`
  );
}

/**
 * Catches uncaught synchronous exceptions.
 * Differentiates recoverable socket/stream write errors from fatal corruption.
 */
export function handleUncaughtException(error: Error, origin: string): void {
  const now = new Date().toISOString();
  safetyMetrics.totalUncaughtExceptions += 1;

  const message = error.message || String(error);
  const code = (error as any).code;

  // Check if this is a recoverable socket/stream error (e.g. client aborted mid-response)
  const isRecoverableSocket =
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    message.includes('ECONNRESET') ||
    message.includes('EPIPE') ||
    message.includes('write after end');

  if (isRecoverableSocket) {
    console.warn(
      `[ProcessSafety] Intercepted recoverable uncaught socket/stream exception (${code || 'NO_CODE'}) at ${now}:\n` +
        `  Origin: ${origin}\n` +
        `  Message: ${message}\n` +
        `  Action: Discarded dead client stream. Daemon process running stably.`
    );
    return;
  }

  console.error(
    `[ProcessSafety] CRITICAL: Uncaught synchronous exception at ${now}:\n` +
      `  Origin: ${origin}\n` +
      `  Error: ${error.name}: ${message}\n` +
      `  Stack: ${error.stack || 'No stack trace'}\n` +
      `  Action: Trapped in process safety layer to maintain live service availability.`
  );
}

/**
 * Registers a graceful shutdown hook to be invoked when the process receives SIGTERM or SIGINT.
 */
export function registerShutdownHook(name: string, handler: ShutdownHook, priority = 10): void {
  shutdownHooks.push({ name, handler, priority });
  // Sort descending by priority so high-priority tasks run first
  shutdownHooks.sort((a, b) => b.priority - a.priority);
}

/**
 * Executes all registered graceful shutdown hooks in order of priority.
 */
export async function executeGracefulShutdown(signal: string): Promise<void> {
  if (safetyMetrics.isShuttingDown) return;
  safetyMetrics.isShuttingDown = true;

  console.log(`[ProcessSafety] Received ${signal}. Executing graceful shutdown sequence (${shutdownHooks.length} tasks)...`);

  for (const hook of shutdownHooks) {
    try {
      console.log(`[ProcessSafety] Running shutdown hook: ${hook.name}...`);
      await Promise.resolve(hook.handler());
      console.log(`[ProcessSafety] Hook ${hook.name} completed.`);
    } catch (err: any) {
      console.warn(`[ProcessSafety] Shutdown hook "${hook.name}" encountered an error:`, err?.message || err);
    }
  }

  console.log(`[ProcessSafety] Graceful shutdown sequence completed. Exiting cleanly.`);
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    process.exit(0);
  }
}

/**
 * Installs global process-level safety handlers.
 * Safe to call multiple times (idempotent).
 */
export function installProcessSafetyHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  process.on('unhandledRejection', handleUnhandledRejection);
  process.on('uncaughtException', handleUncaughtException);

  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    process.once('SIGTERM', () => void executeGracefulShutdown('SIGTERM'));
    process.once('SIGINT', () => void executeGracefulShutdown('SIGINT'));
  }

  console.log('[ProcessSafety] Enterprise process safety & unhandled rejection interceptors installed.');
}

/**
 * Retrieves current process safety metrics for monitoring and diagnostics.
 */
export function getProcessSafetyMetrics(): ProcessSafetyMetrics {
  return {
    ...safetyMetrics,
    rejectionsByCategory: { ...safetyMetrics.rejectionsByCategory },
    lastRejection: safetyMetrics.lastRejection ? { ...safetyMetrics.lastRejection } : undefined,
  };
}

/**
 * Clears registered shutdown hooks (primarily for testing isolation).
 */
export function clearShutdownHooks(): void {
  shutdownHooks.length = 0;
}

/**
 * Resets safety metrics (useful for testing).
 */
export function resetSafetyMetrics(): void {
  safetyMetrics.totalUnhandledRejections = 0;
  safetyMetrics.totalUncaughtExceptions = 0;
  for (const key of Object.keys(safetyMetrics.rejectionsByCategory) as RejectionCategory[]) {
    safetyMetrics.rejectionsByCategory[key] = 0;
  }
  safetyMetrics.lastRejection = undefined;
  safetyMetrics.isShuttingDown = false;
}

