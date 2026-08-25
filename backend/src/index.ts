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
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Mount API v1 Routes
app.use('/api/v1', apiRouter);

// Root health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'DreamPulse Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Error Handler Middleware
app.use(errorHandler);

// Initialize WebSocket Telemetry Gateway
telemetryWsGateway.initialize(server);

if (!process.env.VITEST) {
  server.listen(env.PORT, async () => {
    console.log(`[DreamPulse Engine] HTTP & WebSocket Server listening on port ${env.PORT}`);
    console.log(`[DreamPulse Engine] REST API: http://localhost:${env.PORT}/api/v1`);
    console.log(`[DreamPulse Engine] WebSocket Stream: ws://localhost:${env.PORT}/ws/telemetry`);

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
    const { swarmRunner } = await import('./agents/swarm-runner.js');
    swarmRunner.start(1000);
  });
}

export { app, server };
export default app;
