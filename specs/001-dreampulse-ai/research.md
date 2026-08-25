# Technical Research & Architectural Decisions: DreamPulse AI

**Feature Directory**: `specs/001-dreampulse-ai`  
**Date**: 2026-08-25  
**Status**: Completed  

---

## 1. Architecture & Hosting Strategy

### Decision 1.1: Frontend Framework & Hosting
- **Decision**: **React 18+ with Vite and TypeScript**, deployed to **Vercel**.
- **Rationale**: Vite provides instant hot-module reloading and optimized production bundling for high-frequency dashboard telemetry. Vercel provides zero-configuration edge deployments, automatic preview branches, and global CDN delivery for low-latency asset serving.
- **Alternatives Considered**:
  - *Next.js (App Router)*: Evaluated, but high-frequency trading terminals require client-heavy state, direct canvas rendering, and long-lived WebSocket connections where Vite SPA architecture provides cleaner state lifecycles with less SSR overhead.

### Decision 1.2: Backend Runtime & Hosting
- **Decision**: **Node.js 20+ with Express.js and TypeScript**, deployed to **Heroku**.
- **Rationale**: Heroku provides reliable dyno process management with native support for background worker dynos (`worker: ts-node src/agents/swarm-runner.ts`) alongside web dynos (`web: node dist/index.js`), essential for continuously running autonomous agent evaluation loops (`Volt`, `Oracle`, `Titan`, `Sweeper`).
- **Alternatives Considered**:
  - *Serverless Functions (Vercel/AWS Lambda)*: Incompatible with persistent multi-agent loops and millisecond WebSocket order book subscriptions, which require continuous in-memory state and persistent sockets.

---

## 2. Database & State Persistence (Supabase)

### Decision 2.1: Supabase PostgreSQL with Real-Time Subscriptions
- **Decision**: **Supabase (PostgreSQL 15+)** using `@supabase/supabase-js` (v2.x).
- **Rationale**:
  - Provides instant relational querying for market histories, session keys, order logs, and backtest results.
  - Built-in PostgreSQL Row Level Security (RLS) guarantees user isolation for non-custodial session records and portfolio balances.
  - Native Realtime engine allows the frontend to subscribe to table changes (e.g., when the Sweeper completes a claim or an agent logs a fill).
- **Database Schema Entities**:
  - `markets`: Cached DreamDEX Event Contracts metadata, strikes, expiries, settlement state.
  - `sessions`: Non-custodial session delegation grants, operator address, risk caps, expiration.
  - `orders`: Executed agent trades, fills, transaction hashes, realized PnL.
  - `sweeps`: Finalized market claim records and auto-compound transactions.
  - `agent_logs`: Real-time AI agent reasoning logs, confidence scores, and strategy decisions.
  - `backtests`: Historical simulation configurations and performance telemetry.

---

## 3. LLM Integration (OpenAI-Compatible Gemini Client)

### Decision 3.1: OpenAI Client with Custom Gemini Base URL
- **Decision**: Use the official `openai` SDK configured with `baseURL`, `apiKey`, and `model` environment variables:
  ```typescript
  import OpenAI from 'openai';

  export const llmClient = new OpenAI({
    baseURL: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: process.env.GEMINI_API_KEY || '',
  });

  export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  ```
- **Rationale**: Standardizes LLM requests on the widely supported OpenAI SDK format while directing inferences to Google Gemini for sub-second structured market reasoning, volatility commentary, and agent thought generation.
- **Agent Prompting Strategy**:
  - Use structured JSON outputs (`response_format: { type: "json_object" }` or schema-driven tools) for quantitative evaluations.
  - Cache prompt prefixes for fast token-efficient streaming of agent decisions (`Volt`, `Oracle`, `Titan`).

---

## 4. Blockchain & Somnia DreamDEX Protocol Integration

### Decision 4.1: Somnia Testnet & Client Libraries
- **Decision**: **Somnia Shannon Testnet** (`Chain ID: 50312`, RPC: `https://dream-rpc.somnia.network`) using `viem` (v2.x) and DreamDEX SDKs (`@somnia-chain/markets-sdk`, `@dreamdex-bot-kit/ec-core`, `@dreamdex-bot-kit/backtest`).
- **Rationale**: `viem` provides high-performance, lightweight, and strictly typed EVM client interactions with native WebSocket and custom gas estimation support.
- **Non-Custodial Session Keys**:
  - Interacts with Somnia's `OperatorPermissionsRegistry` contract.
  - Grants scoped execution permission (`placeOrderFor`, `cancelOrderFor`) to the backend agent operator address.
  - Enforces zero-withdrawal and zero-transfer invariance on-chain and in backend middleware.

---

## 5. High-Frequency Telemetry & WebSocket Streaming

### Decision 5.1: Real-Time Communication Pipeline
- **Decision**: Dual-stream architecture:
  1. Direct Somnia / Binance WebSocket connections on the backend for raw spot price feeds and CLOB order book delta updates.
  2. Local WebSocket / Socket.io server on Express backend streaming enriched telemetry (calculated $\Phi(z)$ fair value, edge heatmap anomalies, agent thought streams) to the React Vite frontend at 60 FPS.
- **Rationale**: Prevents client-side network overload by aggregating raw on-chain events and calculating quantitative metrics on the backend before broadcasting optimized diffs to connected frontend clients.

---

## 6. Frontend Visual Design & UX Standards

### Decision 6.1: Cyber-Terminal Aesthetics & Impeccable Standards
- **Decision**: Bespoke high-contrast Cyber-Terminal design system using CSS custom properties, monospace quantitative typography (e.g., JetBrains Mono, Syne / Outfit for display), animated SVG/Canvas depth ladders, and glowing anomaly heatmaps.
- **Rules**:
  - Zero generic "AI slop" or purple gradient cliches.
  - Crisp financial telemetry with sub-100ms visual state updates.
  - Explicit multi-step transaction feedback and non-blocking background synchronization.
