import http from 'http';
import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { requestLogger, errorHandler } from './api/middleware.js';
import { apiRouter } from './api/routes.js';
import { telemetryWsGateway } from './websocket/server.js';

const app = express();
const server = http.createServer(app);

// Global Middleware
const allowedOrigins = env.FRONTEND_ORIGIN && env.FRONTEND_ORIGIN !== '*'
  ? env.FRONTEND_ORIGIN.split(',').map((s) => s.trim().replace(/\/+$/, ''))
  : ['*'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, health checks, server-to-server)
      if (!origin || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      const normalizedOrigin = origin.replace(/\/+$/, '');
      try {
        const url = new URL(normalizedOrigin);
        const hostname = url.hostname.toLowerCase();
        if (
          allowedOrigins.includes(normalizedOrigin) ||
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === 'vercel.app' ||
          hostname.endsWith('.vercel.app')
        ) {
          return callback(null, true);
        }
      } catch {
        if (
          allowedOrigins.includes(normalizedOrigin) ||
          normalizedOrigin.endsWith('.vercel.app') ||
          normalizedOrigin.includes('localhost') ||
          normalizedOrigin.includes('127.0.0.1')
        ) {
          return callback(null, true);
        }
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'x-user-address',
      'x-wallet-address',
      'x-address',
      'x-auth-address',
      'x-auth-signature',
      'x-wallet-signature',
      'x-signature',
      'x-auth-sig',
      'x-auth-nonce',
      'x-wallet-nonce',
      'x-nonce',
      'x-auth-issued-at',
      'x-wallet-issued-at',
      'x-issued-at',
      'x-auth-timestamp',
      'x-auth-expires-at',
      'x-wallet-expires-at',
      'x-expires-at',
      'x-siwe-address',
      'x-siwe-wallet',
      'x-siwe-message',
      'x-siwe-signature',
      'x-auth-token',
      'x-operator-address',
      'x-operator-auth',
      'x-operator-auth-address',
    ],
  })
);
app.use(express.json());
app.use(requestLogger);

// Root health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'DreamPulse Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount API v1 Routes
app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

// Error Handler Middleware
app.use(errorHandler);

// Initialize WebSocket Telemetry Gateway
telemetryWsGateway.initialize(server);

if (!process.env.VITEST) {
  server.listen(env.PORT, '0.0.0.0', async () => {
    console.log(`[DreamPulse Engine] HTTP & WebSocket Server listening on port ${env.PORT}`);
    console.log(`[DreamPulse Engine] REST API: http://localhost:${env.PORT}/api/v1`);
    console.log(`[DreamPulse Engine] WebSocket Stream: ws://localhost:${env.PORT}/ws/telemetry`);

    // Probe database schema readiness
    const { checkDatabaseSchemaReady } = await import('./config/supabase.js');
    await checkDatabaseSchemaReady();

    // Restore persistent Groq key index from database
    const { initPersistentKeyIndex } = await import('./llm/client.js');
    await initPersistentKeyIndex();

    // Start Real-Time Market Telemetry & Anomaly Broadcaster
    const { startMarketEmitter } = await import('./websocket/market-emitter.js');
    startMarketEmitter(100);

    // Ensure operator wallet is funded with TestUSDC collateral
    const { ensureOperatorCollateral } = await import('./services/order-service.js');
    await ensureOperatorCollateral().catch((err) => {
      console.warn('[DreamPulse Engine] Operator collateral startup check notice:', err.message);
    });

    // Start Autonomous Multi-Agent Swarm Runner Loop (1000ms evaluation tick)
    if (env.ENABLE_SWARM_RUNNER && !env.DRY_RUN_MODE) {
      const { swarmRunner } = await import('./agents/swarm-runner.js');
      swarmRunner.start(1000);
      console.log('[DreamPulse Engine] Autonomous Multi-Agent Swarm Runner started (Active on-chain execution).');
    } else {
      console.log(
        `[DreamPulse Engine] Swarm Runner loop is DISABLED (ENABLE_SWARM_RUNNER=${env.ENABLE_SWARM_RUNNER}, DRY_RUN_MODE=${env.DRY_RUN_MODE}). Running in local API/Read-Only mode to avoid conflicts with production Heroku.`
      );
    }
  });
}

export { app, server };
export default app;
