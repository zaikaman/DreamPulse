# Implementation Plan: DreamPulse AI

**Branch**: `main` | **Date**: 2026-08-25 | **Spec**: [specs/001-dreampulse-ai/spec.md](file:///d:/DreamPulse/specs/001-dreampulse-ai/spec.md)  
**Input**: Feature specification from `/specs/001-dreampulse-ai/spec.md` and architecture directives from `IDEA.md`

---

## Summary

DreamPulse AI is an autonomous, quantitative multi-agent trading ecosystem, real-time edge radar terminal, and non-custodial copy-vault built for DreamDEX Event Contracts on Somnia Layer 1. The application consists of a high-performance React + Vite cyber-terminal deployed on Vercel, a Node.js + Express multi-agent daemon backend deployed on Heroku, Supabase PostgreSQL with real-time subscriptions for state persistence, and Google Gemini via OpenAI-compatible endpoints for high-speed agent reasoning.

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+  
**Primary Dependencies**:
- *Frontend*: React 18+, Vite 5+, `@supabase/supabase-js` v2, `lucide-react`, `canvas-confetti`, `viem`
- *Backend*: Express 4.x, `ws` / `socket.io`, `openai` (v4.x for Gemini LLM), `@supabase/supabase-js`, `viem`, `@somnia-chain/markets-sdk`, `@dreamdex-bot-kit/ec-core`, `@dreamdex-bot-kit/backtest`
**Storage**: Supabase PostgreSQL (hosted on Supabase, with Row Level Security and Realtime publication)  
**Testing**: Vitest (Unit & Quantitative Math), Supertest (Express API), Contract simulation mocks via `@dreamdex-bot-kit/backtest`  
**Target Platform**: Web Terminal (Vercel edge CDN), Agent Swarm Engine (Heroku web & worker dynos), Somnia Shannon Testnet (`50312`)  
**Project Type**: Full-Stack Decoupled Web Application & Quantitative Trading Engine (`frontend/` + `backend/`)  
**Performance Goals**: Sub-100ms pricing & spot-drift evaluation latency, 60 FPS non-blocking visual telemetry, <1s real-time WebSocket diff broadcasts  
**Constraints**: Zero-withdrawal session key invariance, strict non-custodial delegation via Somnia's `OperatorPermissionsRegistry`, quantized lot/tick math  
**Scale/Scope**: Active support for all 5m, 15m, and 1h BTC/USD and ETH/USD binary event contracts on Somnia testnet  

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution Principle | Requirement | Status / Alignment |
| :--- | :--- | :--- |
| **I. Code Quality & Type Safety** | Strict TypeScript, zero unhandled `any`, deterministic floating/fixed-point pricing math | ✅ **PASS**: Fully typed domain models in `data-model.md`, explicit rounding tolerances for $\Phi(z)$. |
| **II. Testing Standards** | Unit tests on math formulas, integration on contract calls, backtest verification | ✅ **PASS**: Vitest test suites specified for math, API, and session guardrails. |
| **III. UX Consistency** | Cyber-Terminal aesthetics, 60 FPS render, transparent AI thought telemetry | ✅ **PASS**: Monospace/display typography, depth ladders, and live telemetry defined. |
| **IV. Performance** | Sub-100ms pricing loops, non-blocking WebSocket streams, gas-efficient batch calls | ✅ **PASS**: Dedicated worker loop on Heroku, dual-stream WebSocket gateway. |
| **V. Non-Custodial Safety** | Zero-withdrawal invariant, Somnia `OperatorPermissionsRegistry` compliance | ✅ **PASS**: Explicit EIP-712 session schema and backend guardrails in `session-key.md`. |

---

## Project Structure

### Documentation (this feature)

```text
specs/001-dreampulse-ai/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Technical decisions & architecture
├── data-model.md        # Database schema, entities & TypeScript models
├── quickstart.md        # Development and deployment instructions
├── contracts/           # API, WebSocket, and Session interfaces
│   ├── rest-api.md
│   ├── websocket-events.md
│   ├── session-key.md
│   └── agent-execution.md
└── checklists/          # Quality validation checklists
    └── requirements.md
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── config/          # Environment & Supabase/Somnia clients
│   │   ├── env.ts
│   │   ├── supabase.ts
│   │   └── somnia.ts
│   ├── quantitative/    # Black-Scholes, normal CDF Φ(z), spot drift math
│   │   ├── cdf.ts
│   │   ├── pricing.ts
│   │   └── quantizer.ts
│   ├── agents/          # Multi-agent swarm implementation
│   │   ├── base-agent.ts
│   │   ├── volt-sniper.ts
│   │   ├── oracle-arb.ts
│   │   ├── titan-mm.ts
│   │   ├── sweeper.ts
│   │   └── swarm-runner.ts
│   ├── llm/             # OpenAI-compatible Gemini thought generator
│   │   ├── client.ts
│   │   └── reasoning-service.ts
│   ├── services/        # Business logic & blockchain adapters
│   │   ├── market-service.ts
│   │   ├── session-service.ts
│   │   ├── order-service.ts
│   │   └── backtest-service.ts
│   ├── api/             # Express controllers & routes
│   │   ├── routes.ts
│   │   └── middleware.ts
│   ├── websocket/       # Real-time WebSocket broadcasting gateway
│   │   └── server.ts
│   └── index.ts         # Main server entrypoint
├── tests/
│   ├── quantitative.test.ts
│   ├── session.test.ts
│   └── api.test.ts
├── Procfile             # Heroku process definition (web & worker)
├── package.json
└── tsconfig.json

frontend/
├── src/
│   ├── components/      # Cyber-terminal UI components
│   │   ├── MarketMatrix.tsx
│   │   ├── EdgeRadarHeatmap.tsx
│   │   ├── OrderBookDepth.tsx
│   │   ├── AgentThoughtFeed.tsx
│   │   ├── SessionDelegationModal.tsx
│   │   ├── SweeperControls.tsx
│   │   └── StrategyStudio.tsx
│   ├── hooks/           # Real-time WebSockets & Supabase state hooks
│   │   ├── useMarkets.ts
│   │   ├── useTelemetry.ts
│   │   ├── useSessionKey.ts
│   │   └── useAgentSwarm.ts
│   ├── services/        # API client & Somnia wallet connection
│   │   ├── api.ts
│   │   ├── supabase.ts
│   │   └── web3.ts
│   ├── types/           # Shared TypeScript interfaces
│   │   └── index.ts
│   ├── styles/          # Cyber-terminal design system & CSS tokens
│   │   └── terminal.css
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── vite.config.ts
└── tsconfig.json
```

**Structure Decision**: Decoupled Full-Stack Web Application with `frontend/` (React + Vite, deployable to Vercel) and `backend/` (Express.js + WebSocket agent swarm, deployable to Heroku).

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| :--- | :--- | :--- |
| *Separate Backend Daemon* | Continuous autonomous agent loop execution (`Volt`, `Oracle`, `Titan`, `Sweeper`) and sub-100ms WebSocket connections. | Pure frontend-only cannot trade when user browser is closed; serverless lambdas timeout and cannot hold persistent high-frequency WebSocket order books. |
| *Supabase PostgreSQL* | Relational query integrity for multi-agent trade logs, RLS for non-custodial sessions, and native Realtime subscriptions. | Plain local files or in-memory storage lack multi-user persistence and cross-dyno state synchronization. |
