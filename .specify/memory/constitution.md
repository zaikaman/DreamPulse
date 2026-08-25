<!--
SYNC IMPACT REPORT
==================
Version Change: 0.0.0 (Unratified Template) → 1.0.0 (Initial Ratification)
Modified Principles:
  - [PRINCIPLE_1_NAME] → I. Rigorous Code Quality & Type Safety
  - [PRINCIPLE_2_NAME] → II. Comprehensive Testing & Simulation Standards
  - [PRINCIPLE_3_NAME] → III. Premium, Consistent & Responsive UX
  - [PRINCIPLE_4_NAME] → IV. High-Performance & Low-Latency Execution
  - [PRINCIPLE_5_NAME] → V. Non-Custodial Safety & Protocol Compliance
Added Sections:
  - Technical Stack, Security Invariants & Quantitative Standards
  - Development Workflow, Review Process & Quality Gates
Removed Sections:
  - None (concrete specifications replaced all template placeholders)
Templates Requiring Updates:
  - .specify/templates/plan-template.md: ✅ aligned (constitution check gates reference core principles)
  - .specify/templates/spec-template.md: ✅ aligned (user scenario & testability criteria aligned)
  - .specify/templates/tasks-template.md: ✅ aligned (TDD and independent verification phases aligned)
Follow-up TODOs:
  - None (all template tokens fully resolved)
-->

# DreamPulse AI Constitution

## Core Principles

### I. Rigorous Code Quality & Type Safety
- **Strict TypeScript & Zero `any`**: All codebase modules (agents, quantitative models, smart contract integrations, and frontend interfaces) MUST be strictly typed with zero unhandled `any` types.
- **Deterministic Math & Precision Invariants**: All event contract probability, Black-Scholes/CDF calculations $\Phi(z)$, volatility pricing, and lot/tick quantization MUST use explicit precision rounding and guard against floating-point drift or `NaN`/`Infinity` propagation.
- **Modular Decoupling**: Separation of concerns is mandatory across four distinct layers: Quantitative Models, On-chain Execution/Session Management, Market Data Feeds, and Presentation/UI. No trading strategy may directly manipulate UI state, and no UI component may construct raw on-chain transaction payloads without passing through the service layer.
- **Explicit Error Handling & Resilience**: All external RPC, WebSocket, and Oracle calls MUST have defensive timeout, retry, backoff, and circuit-breaker mechanisms. Unexpected states MUST fail closed safely without executing unvalidated trades.

### II. Comprehensive Testing & Simulation Standards
- **Test-First & Contract Verification**: All critical mathematical libraries, session key permission wrappers, and order placement engines MUST have comprehensive unit tests prior to feature sign-off.
- **Multi-Layered Test Coverage**:
  - *Unit Tests*: 100% coverage on pricing formulas ($\Phi(z)$ CDF calculation, drift estimation, tick/lot size snapping, payout math).
  - *Integration Tests*: Mocked and live-testnet contract interaction tests covering Somnia `OperatorPermissionsRegistry`, DreamDEX CLOB order placement/cancellation, and automated sweeping.
  - *Backtest & Simulation Verification*: Quantitative strategies MUST run against historical or simulated order book feeds (`@dreamdex-bot-kit/backtest`) to verify expected value ($+EV$), drawdowns, and latency edge before mainnet/testnet deployment.
- **Regression Prevention**: Every bug fix MUST be accompanied by a regression test replicating the failure mode.

### III. Premium, Consistent & Responsive UX
- **Distinctive Cyber-Terminal Aesthetics**: The user interface MUST deliver a state-of-the-art, high-density financial terminal experience. Default, generic UI patterns, clichéd templates, and plain placeholder elements are strictly prohibited.
- **Real-Time Telemetry & Transparency**: The UI MUST expose live order book depth ladders, volatility discrepancy heatmaps, and continuous AI reasoning/thought streams with millisecond timestamps and verifiable tx hashes.
- **Zero Ambiguous States & Optimistic Feedback**: Financial operations (order placement, session key delegation, auto-sweep configuration) MUST display unambiguous loading, confirmed, and failure states with actionable error messages and instant rollback on failure.
- **Accessibility & Device Responsiveness**: The interface MUST maintain crisp contrast, fluid 60 FPS transitions, keyboard navigation shortcuts, and layout responsiveness across viewport sizes.

### IV. High-Performance & Low-Latency Execution
- **Sub-Second Edge Arbitrage**: The multi-agent engine (`Volt`, `Oracle`, `Titan`) MUST evaluate incoming price updates and compute fair-value discrepancy in under 100ms.
- **Multiplexed & Non-Blocking Feeds**: WebSocket streams for spot prices, CLOB order books, and Somnia chain events MUST be handled asynchronously without blocking the event loop or causing UI thread stutters.
- **Optimized On-Chain Interactions**: Transactions MUST utilize gas-efficient execution patterns, consolidated batch requests (e.g. batch-sweeping finalized binary markets), and cancel-replace atomic flows where supported.
- **Memory & Resource Efficiency**: Background agent workers and browser tabs MUST prevent memory leaks from continuous WebSocket message buffering and chart render pipelines.

### V. Non-Custodial Safety & Protocol Compliance
- **Zero-Withdrawal Invariant**: Agent operations MUST strictly operate under non-custodial delegation via Somnia's `OperatorPermissionsRegistry`. Agents MUST NEVER request, possess, or execute withdrawal or transfer privileges over user funds.
- **Bounded Risk Guardrails**: All autonomous agent execution loops MUST enforce hardcoded and user-configured risk ceilings (e.g. maximum trade size, maximum drawdown threshold, and maximum active market exposure).
- **DreamDEX Protocol Adherence**: All limit, market, and taker orders MUST strictly conform to DreamDEX Event Contract rules, contract phase life cycles (Open → Closed → Resolving → Finalized), and Prophecy Oracle settlement semantics.
- **Autonomous Sweep Integrity**: The `Sweeper` engine MUST reliably discover and claim all redeemable winnings from finalized markets without stranded capital or duplicate execution attempts.

## Technical Stack, Security Invariants & Quantitative Standards

- **Core Technologies**:
  - *Blockchain*: Somnia Shannon Testnet (Chain ID: `50312`, RPC: `https://dream-rpc.somnia.network`)
  - *Protocols & SDKs*: `@somnia-chain/markets-sdk`, `@dreamdex-bot-kit/ec-core`, `@dreamdex-bot-kit/backtest`, `viem` / `ethers`
  - *Frontend Terminal*: Modern high-performance web application (Vite / React / TypeScript) with bespoke Vanilla CSS, dynamic canvas/WebGL charts, and responsive cyber-terminal design tokens
  - *Agent Engine*: TypeScript/Node.js autonomous micro-agents with multi-threading / worker pool architecture
- **Security & Authorization Invariants**:
  - Private keys for user wallets MUST NEVER leave the client browser.
  - Session key delegation MUST only grant scoped permissions (`placeOrderFor`, `cancelOrderFor`).
  - RPC endpoints MUST include fallback providers to guard against transient network partitions.
- **Quantitative Standards**:
  - Implied probabilities and standard normal CDF approximations MUST maintain error tolerances $\epsilon < 10^{-5}$.
  - Order parameters MUST align with tick sizes and lot steps defined per market contract.

## Development Workflow, Review Process & Quality Gates

- **Direct Main Workflow & Spec-Driven Development**: All development is conducted directly on the `main` branch without feature branches. Every major feature or agent strategy begins with a formal specification (`specs/[###-feature]/spec.md`), verified implementation plan (`plan.md`), and ordered tasks (`tasks.md`).
- **Pre-Merge Quality Gates**:
  1. `npm run lint` / `tsc --noEmit`: Zero lint errors, zero type errors.
  2. `npm run test`: All unit and integration test suites pass.
  3. Constitution Check: Verification against all 5 core principles.
  4. Performance & Memory Audit: No uncollected timers, listeners, or unbounded arrays.
- **Feedback & Traceability**: Each integration milestone logs SDK improvements and developer ergonomics notes to support the hackathon developer feedback deliverable.

## Governance

This Constitution acts as the binding technical and architectural standard for DreamPulse AI. All architecture designs, code contributions, refactoring efforts, and autonomous agent implementations MUST strictly conform to these rules.

- **Amendment Process**: Any modification to core principles or security invariants requires an explicit version increment, justification documentation, and updating of all dependent templates and active specifications.
- **Versioning Policy**:
  - **MAJOR (x.0.0)**: Breaking changes to core principles, security models, or governance rules.
  - **MINOR (1.x.0)**: Addition of new principles, architectural modules, or extended testing/UX standards.
  - **PATCH (1.0.x)**: Clarifications, typo fixes, and non-breaking documentation improvements.
- **Compliance Enforcement**: Every pull request, spec review, and automated task execution MUST validate compliance against this document.

**Version**: 1.0.0 | **Ratified**: 2026-08-25 | **Last Amended**: 2026-08-25
