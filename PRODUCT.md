# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

DreamPulse serves two primary user archetypes operating on Somnia Shannon Testnet:

1. **Institutional & Quantitative Traders / Liquidity Providers**:
   - **Situation**: Operating in high-volatility, fast-decaying binary prediction markets (1m, 5m, and 15m horizons on BTC and ETH).
   - **Jobs to be Done**: Continuously scan decentralized CLOB order books for mispricings against continuous Black-Scholes normal distributions $\Phi(z)$, execute latency-arbitrage sniper orders when spot prices jump before binary limit quotes adjust, provide automated two-sided market making with inventory skewing, and simulate custom quantitative parameters in a historical backtesting sandbox.

2. **Retail Prediction Traders & Web3 DeFi Participants**:
   - **Situation**: Wanting exposure to automated prediction market strategies without sitting at the screen 24/7, calculating math models, or manually signing endless approvals for dozens of rolling round contracts.
   - **Jobs to be Done**: Activate a dedicated, non-custodial Smart Trading Wallet (EIP-1167 clone) with isolated collateral, delegate execution to personal or global copy-trading swarms via ephemeral session keys with strict on-chain single-trade ($500 ceiling) and daily volume ($5,000 ceiling) caps, monitor real-time AI reasoning feeds explaining trade decisions in plain English, and autonomously claim winning payouts from expired pools directly back to their trading wallet with owner-pinned withdrawals and zero stranded capital.

## Product Purpose

DreamPulse is an institutional-grade, decentralized autonomous trading swarm and cyber-financial terminal built for **DreamDEX Central Limit Order Book (CLOB) Event Contracts** on **Somnia Shannon Testnet** (Chain ID `50312`).

It eliminates the structural hurdles of decentralized prediction markets — wide cold-start spreads, stale quote latency, theoretical volatility mispricing, primary wallet risk from operator approvals, and stranded payout capital — by orchestrating four specialized micro-agents:
- **Volt**: Latency drift & spot velocity momentum sniper (IOC taker).
- **Oracle**: Volatility surface arbitrageur exploiting divergences between CLOB implied probability and Black-Scholes fair value $\Phi(z)$.
- **Titan**: Adaptive two-sided market maker anchoring bids/asks around fair value with dynamic inventory aversion ($\gamma \cdot |\text{inv}|^{1.25}$) and self-trade depth sanitization.
- **Sweeper**: Autonomous settlement daemon continuously sweeping finalized rounds, batch-redeeming winning shares on-chain, and transferring payouts directly to smart trading accounts.

Success means providing sub-second mathematical market efficiency, seamless non-custodial automated execution, and complete real-time transparency through cognitive reasoning streams.

## Positioning

Unlike conventional monolithic trading bots or static prediction market frontends, DreamPulse provides a cohesive cyber-financial suite:

1. **Coordinated 4-Agent Micro-Architecture**: Four decoupled personas executing on a 100ms evaluation loop rather than a single generalized script.
2. **Separate Smart Trading Wallet (Clone) Architecture**: Instead of exposing primary user wallets through operator trust models, each user receives a dedicated EIP-1167 smart trading account clone deployed via CREATE2. The clone trades as itself, while ephemeral session keys are restricted by on-chain single-trade caps, 24h rolling volume limits, and strict selector whitelists. Withdrawals are cryptographically pinned to the owner's personal address with zero operator custody.
3. **Decoupled Execution Modes**: Full flexibility between **Global Swarm Copy-Trading** (passively mirroring institutional swarm execution) and **Isolated Personal Swarms** (custom parameterized per-wallet thresholds for drift, edge, target spread, lot sizes, and strategy forking).
4. **Cognitive LLM Telemetry**: Dual-tier AI thought streaming (Groq Qwen 3.8 with Gemini fallback) articulating mathematical logic, volatility regime detection, and order decisions in real-time.
5. **Integrated Backtesting Studio**: Full quantitative backtester (Strategy Studio) allowing historical simulation across custom date ranges, assets, and execution friction models with direct "Deploy to Swarm" functionality.

## Operating Context

### Surfaces & View Navigation

- **Landing View (`CinematicHero`)**: Immersive cyber-financial hero introducing the autonomous swarm architecture, live aggregate statistics, interactive architecture diagrams, and instant launch CTAs.
- **Overview View (`OverviewView`)**:
  - **Onboarding Quest Bar (`OnboardingQuestBar`)**: 4-step progressive activation flow (Connect Wallet $\rightarrow$ Claim Test Collateral Faucet $\rightarrow$ Activate Smart Trading Account / Copy-Trading $\rightarrow$ Execute First Trade).
  - **Session Status Bar (`SessionStatusBar`)**: Instant visibility into non-custodial Smart Trading Wallet status, 24H budget progress meter, execution mode badge (Autonomous Swarm Mirror vs Manual), countdown to session expiry, faucet claim button, Risk Limits modal trigger, and Trading Wallet deposit/withdraw trigger.
  - **Dual-Perspective KPI Grid (`StatCardsGrid`)**: Interactive perspective switcher between **Trader Workspace** (Smart Trading Wallet Balance, Connected EOA Balance, STT Gas, Session PnL, Win Rate, Open Positions) and **Swarm Perspective** (24h Aggregate Swarm PnL, Total Fills, Active Markets, Sub-Second Shannon Latency, Sweeper Claims).
  - **Top Arbitrage Opportunities Table**: High-priority anomaly scanner displaying Asset & Strike, Expiry, Implied Prob, Fair Value $\Phi(z)$, Edge Delta ($>3\%$ highlighted), dynamic Action badges (`BUY YES` / `BUY NO`), and 1-click CLOB inspection.
  - **Split Telemetry Panels**: Left side **Active Prediction Catalog** (quick market switcher with probability distributions); Right side **Live Swarm Intelligence** (streaming thoughts with pause-on-hover capability).
- **Edge Radar View (`EdgeRadarView` & `EdgeRadarHeatmap`)**:
  - **Full-Width $\Phi(z)$ Mispricing Matrix**: Real-time 2D matrix crossing all supported assets (BTC, ETH) against expiration horizons (1m, 5m, 15m), color-coded by alpha direction (green for YES, rose for NO, yellow glow for $\ge 3\%$ anomalies).
  - **Mathematical Inspector Card**: Deep-dive analytics on the active contract comparing CLOB implied mid probability, Black-Scholes theoretical normal distribution, edge spread, and direct 1-click execution routing.
- **Markets & Depth Explorer (`MarketsExplorerView` & `MarketsDepthView` & `MarketMatrix`)**:
  - Filterable catalog of all active and upcoming Somnia Event Contract pools (filter by Asset, Horizon, Edge Anomaly, or Expiry).
  - High-precision CLOB Order Book Depth visualization with bid/ask ladders, spread indicators, and cumulative volume depth.
- **Trade Terminal View (`TradeTerminalView` & `TraderCockpitTicket`)**:
  - Professional trading workstation with quick-switch asset dropdown, live spot price feeds, 24h deltas, and expiration countdowns.
  - **Event Contract Probability Chart (`EventContractChart`)**: Interactive chart rendering probability evolution, strike reference lines, and live market ticks.
  - **CLOB Depth Ladder (`OrderBookDepth`)**: Interactive ladder with click-to-prefill ticket integration.
  - **Trader Cockpit Ticket (`TraderCockpitTicket`)**: Dual-mode order ticket (BUY YES / BUY NO, Limit or IOC Taker), sizing mode toggle (collateral budget vs discrete contracts), unspent collateral helper banner (Snap exact cost or +1 Share), leverage/payout calculator, estimated ROI calculations, and non-custodial Smart Trading Wallet execution.
  - **Active Positions Drawer & Recently Settled Rounds**: Real-time tracking of open outcome shares, entry prices, live marks, unrealized PnL, and historical round resolutions.
- **AI Swarm Feed View (`SwarmFeedView` & `AgentThoughtFeed`)**:
  - Continuous chronological telemetry feed of agent reasoning logs with agent filtering (Volt, Oracle, Titan, Sweeper), text search, freeze/pause controls, and raw telemetry JSON inspection modal.
- **Swarm Cockpit View (`SwarmCockpitView` & `AgentSwarmCockpit` & `PersonalSwarmCockpit`)**:
  - **Institutional Swarm Cockpit**: System health metrics, agent status indicators, execution velocity, Sharpe ratio, win rate, 24h PnL contribution, and active open orders.
  - **Personal Swarm Cockpit**: Granular per-agent parameterization (Drift Threshold, Min Edge, Lot Size, Target Spread, Inventory Aversion), Copy-Trading master toggle, and single-click "Fork to Studio" button.
- **Analytics View (`AnalyticsView`)**:
  - Performance analytics suite with dual Equity Curve visualizer (User vs Swarm Benchmark), Daily PnL distribution bar chart, Agent Contribution breakdown, Win/Loss ratios, and paginated trade audit ledger with search and CSV export.
- **Strategy Studio View (`StrategyStudio`)**:
  - Institutional backtesting environment supporting historical data simulation across custom windows (24h to 30d), timeframe selection (1m to 1h), slippage and fee friction models, equity curve generation, maximum drawdown metrics, profit factor calculation, and 1-click "Deploy to Swarm" sync.
- **Settlement & Sweeper View (`SweeperControls`)**:
  - Dedicated on-chain settlement dashboard displaying claimable winning outcome shares across finalized prediction pools, auto-sweep daemon configuration, one-click manual batch redemption, and collateral reinvestment stats.
- **Global Auxiliary Modals & Keyboard Controls**:
  - **Trading Wallet Modal (`TradingWalletModal`)**: Dedicated modal for deposits (Main Wallet $\rightarrow$ Smart Trading Account) and withdrawals (Smart Trading Account $\rightarrow$ Main Wallet) with live balance sync, percentage presets, and transparent 1 tUSDC protocol fee / minimum threshold notice.
  - **Risk Management Modal (`RiskManagementModal`)**: Decoupled modal allowing traders to independently configure single-trade ceilings and 24h cumulative volume caps (or toggle unlimited allowances).
  - **Session Delegation Modal (`SessionDelegationModal`)**: 1-click on-chain Smart Trading Account activation with CREATE2 clone prediction, ephemeral session key authorization, and swarm copy-trading toggle.
  - **Onboarding Wizard Modal (`OnboardingWizardModal`)**: Multi-step interactive guided tour through wallet connection, faucet claiming, smart account activation, and terminal execution.
  - **Command Palette (`CommandDialog`)**: Global `Cmd+K` / `Ctrl+K` quick switcher across all pages, markets, and quick actions.
  - **Procedural Sound Engine (`soundEngine`)**: Web Audio API synthesized sound cues on trade execution, session activation, faucet claim, and settlement sweeps.

## Capabilities and Constraints

- **Autonomous Background Swarm**: Node.js/TypeScript engine running a 100ms evaluation loop against Binance WebSocket spot tickers and Somnia Markets SDK on-chain order books.
- **Mathematical Invariants**:
  - Continuous Black-Scholes standard normal cumulative distribution $\Phi(d_2)$ pricing using Abramowitz-Stegun polynomial approximation ($|\epsilon| < 7.5 \times 10^{-8}$).
  - EWMA realized volatility with Bayesian prior shrinkage.
  - Avellaneda-Stoikov inventory reservation pricing with super-linear gamma penalty ($\gamma \cdot |\text{inv}|^{1.25}$).
- **Risk Invariants**:
  - Expiry boundary lockout: Halts taker order submission within 15 seconds of pool expiration.
  - Gamma pin-risk lockout: Suppresses new quotes when expiration $< 45\text{s}$ or $> 7,200\text{s}$.
  - Swarm self-trade depth sanitization: Dynamically excludes own maker orders from liquidity evaluation.
  - Per-clone on-chain risk guardrails: Maximum single trade size ceiling ($500 tUSDC), 24h rolling volume cap ($5,000 tUSDC), 30-day max duration, and strict selector whitelist enforced on-chain by `DreamPulseSessionAccount`.
  - Zero-Custody Owner-Pinned Withdrawals: Funds can only exit to the owner's personal address; minimum withdrawal is 1 tUSDC with 1 tUSDC protocol fee.
- **Strict UI Code Standards**:
  - **Zero Raw Emojis**: Strictly all UI icons are imported from `@heroicons/react`.
  - **Reference Folder Isolation**: `dreamdex-bot-kit` is strictly read-only reference material; runtime code uses `@somnia-chain/markets-sdk`.
  - **Monospace Tabular Numerics**: All prices, odds, edges, timestamps, and balances use `tabular-nums` formatting to prevent jitter during real-time updates.

## Brand Commitments

- **Name**: DreamPulse
- **Identity & Aesthetics**: Dark institutional cyber-financial terminal — high-density information architecture, sleek glassmorphic surfaces, subtle grid backdrops, and focused visual hierarchy.
- **Color Tokens**:
  - Core Background: Deep slate/zinc `#09090b` and `#12141a`
  - Border Accents: `rgba(255, 255, 255, 0.08)` to `rgba(255, 255, 255, 0.16)`
  - Primary Telemetry & Success: Luminous Cyan `#00ffcc` and Emerald `#00e676` / `#34d399`
  - DreamDEX Protocol Purple: `#7928ca` / `#a78bfa`
  - Amber / Volt Accent: `#f59e0b` / `#fbbf24`
  - Negative Delta / Danger: Rose `#f43f5e` / `#ff3366`
- **Voice & Tone**: High-precision, quantitative, objective, institutional, transparent.

## Evidence on Hand

- **Production Smart Contracts**: Dedicated per-user smart trading account factory (`DreamPulseSessionAccountFactory` at `0x94dd9c8b9a5684ab026480737fac911824ac995d` and implementation `DreamPulseSessionAccount` at `0x92673153f231d87e2adb8b61321260dacf138858`) alongside official Somnia & DreamDEX contracts (`OperatorPermissionsRegistry`, `BinaryModule`, `CLOBFactory`, `MarketsCore`, `BinarySettlement`, `TestUSDC`).
- **Complete Test Suite**: 520/520 tests passing (100%) — 428 backend across 36 suites plus 92 frontend across 10 suites — covering quant algorithms, smart account clone lifecycle, contract interactions, risk controls, adversarial money-path guards, concurrency races, custom limit and advanced trigger orders, and frontend spend-approval flows, with CI coverage gates.
- **Live WebSocket Gateway**: Full bidirectional telemetry server broadcasting real-time spot ticks, CLOB order books, trade fills, and AI thought logs.

## Product Principles

1. **Non-Custodial First & Verifiable Security**: Users never forfeit custody of their funds. Trading accounts are user-owned EIP-1167 clones with strictly scoped ephemeral session keys, on-chain risk policies, and owner-pinned withdrawals.
2. **Transparent Mathematical Autonomy**: All automated trading decisions are rooted in mathematical formulas ($\Phi(z)$, EWMA, Avellaneda-Stoikov) and explained through real-time cognitive thought streams.
3. **Frictionless Capital Velocity**: Smart trading account isolation and automated settlement sweeping eliminate manual multi-step transactions and eliminate stranded capital.
4. **Institutional Density without Clutter**: High-frequency data, order book ladders, heatmaps, and analytics are presented with clear visual hierarchy, monospace tabular alignment, and zero decorative distractions.

## Accessibility & Inclusion

- WCAG AA compliant contrast ratios across dark mode surfaces and status indicators.
- Standardized tabular figures (`font-variant-numeric: tabular-nums`) for jitter-free real-time financial updates.
- Full keyboard shortcut navigation (1-6 tab navigation, `S` sweep, `Cmd+K` command palette, `Cmd+B` sidebar toggle).
- Accessible modal dialogs with focus trapping and ARIA labeling.
