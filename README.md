# DreamPulse

<p align="center">
  <img src="./assets/logo.svg" alt="DreamPulse Logo" width="240" />
</p>

<p align="center">
  <strong>The Next-Generation Cyber-Financial Trading Ecosystem on Somnia & DreamDEX Event Contracts.</strong>
  <br />
  <em>Unifying a Pro CLOB Trade Terminal with AI Alpha Copilot, a Visual No-Code Strategy Studio, Autonomous Multi-Agent Swarms, Quantitative Simulation, and Non-Custodial Session Delegation.</em>
</p>

<p align="center">
  <a href="https://shannon-explorer.somnia.network"><img src="https://img.shields.io/badge/Blockchain-Somnia%20Shannon%20(50312)-00ffcc?style=for-the-badge&logo=ethereum&logoColor=black" alt="Somnia Shannon Testnet" /></a>
  <a href="https://docs.dreamdex.io/developers/event-contracts"><img src="https://img.shields.io/badge/Protocol-DreamDEX%20Event%20Contracts-7928CA?style=for-the-badge&logo=chainlink&logoColor=white" alt="DreamDEX Protocol" /></a>
  <a href="https://dreampulse-ai.vercel.app/#cockpit"><img src="https://img.shields.io/badge/Swarm%20PnL-%3E100%20tUSDC%20%7C%20%3E1%2C000%20Fills-00e676?style=for-the-badge&logo=statuspage&logoColor=black" alt="Swarm PnL >100 tUSDC | >1,000 Fills" /></a>
  <a href="https://github.com/zaikaman/DreamPulse"><img src="https://img.shields.io/badge/Tests-302%2F302%20Passed%20(100%25)-0284c7?style=for-the-badge&logo=vitest&logoColor=white" alt="Tests 302/302 Passing" /></a>
  <a href="https://groq.com"><img src="https://img.shields.io/badge/LLM-Groq%20(Telemetry)%20%2B%20Gemini%20(Studio)-f55036?style=for-the-badge&logo=openai&logoColor=white" alt="Groq + Gemini LLM" /></a>
</p>

---

## Somnia × DreamDEX Hackathon Quick Links

* **Live Demo Web App**: [https://dreampulse-ai.vercel.app/](https://dreampulse-ai.vercel.app/) *(or local `http://localhost:5174`)*
* **Official 2:55 Demo Video**: [Watch Demo Video on YouTube (2m 55s)](https://youtu.be/SW0iNoZHMzw)
* **Auditable Live Swarm Cockpit**: [https://dreampulse-ai.vercel.app/#cockpit](https://dreampulse-ai.vercel.app/#cockpit) *(Real-time verified on-chain performance: **over 100 tUSDC in net realized profit** across **over 1,000 verified fills**)*
* **Somnia Shannon Testnet Chain ID**: `50312`
* **Custom `BatchApprove.sol` Deployment**: [`0x12c9c45fa740ce7469dacff368b08ca7edcaac26`](https://shannon-explorer.somnia.network/address/0x12c9c45fa740ce7469dacff368b08ca7edcaac26)
* **Somnia OperatorPermissionsRegistry**: [`0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`](https://shannon-explorer.somnia.network/address/0x15C7e8CE38F021c5b45d098AaD788f63090bF20A)
* **Machine-Readable Evidence Artifact**: [`evidence.json`](./evidence.json) *(Full audit trail, on-chain tx hashes, and JSON schemas)*
* **SDK & Documentation Developer Feedback Report**: [Jump to Feedback Report](#developer-feedback-report-somnia--dreamdex-sdk)
* **Automated Verification Suite**: `npm run verify` *(302/302 Unit & Integration Tests Passing, 100% Type Safety)*

---

## Table of Contents

1. [Executive Summary & Vision](#executive-summary--vision)
2. [The Core Problem & Market Opportunity](#the-core-problem--market-opportunity)
3. [The 6 Core Platform Pillars](#the-6-core-platform-pillars)
4. [Pro Trade Terminal with AI Alpha Copilot](#1-pro-trade-terminal-with-ai-alpha-copilot)
5. [Visual Strategy Studio (No-Code Agent Builder)](#2-visual-strategy-studio-no-code-agent-builder)
6. [Quantitative Backtester & Simulation Lab](#3-quantitative-backtester--simulation-lab)
7. [Autonomous Multi-Agent Swarms (Protocol & Personal)](#4-autonomous-multi-agent-swarms-protocol--personal)
8. [Autonomous Agent Personas (Volt, Oracle, Titan, Sweeper)](#autonomous-agent-personas)
9. [Swarm Arena, Strategy Leaderboards & Proof-of-Alpha](#5-swarm-arena-strategy-leaderboards--proof-of-alpha)
10. [Settlement Sweeper & Direct Payouts](#6-settlement-sweeper--direct-payouts)
11. [Mathematical & Quantitative Foundation](#mathematical--quantitative-foundation)
12. [Non-Custodial Session Delegation & BatchApprove.sol](#non-custodial-session-delegation--batchapprovesol)
13. [Institutional Design System & Minimalist UI](#institutional-design-system--minimalist-ui)
14. [Minimalist Onboarding & First-Run Activation Flow](#minimalist-onboarding--first-run-activation-flow)
15. [Smart Contracts & On-Chain Deployments](#smart-contracts--on-chain-deployments)
16. [Hackathon Judging Criteria Alignment](#hackathon-judging-criteria-alignment)
17. [Developer Feedback Report (Somnia & DreamDEX SDK)](#developer-feedback-report-somnia--dreamdex-sdk)
18. [System Architecture & Execution Workflows](#system-architecture--execution-workflows)
19. [API & WebSocket Telemetry Protocol](#api--websocket-telemetry-protocol)
20. [Local Installation & Development Guide](#local-installation--development-guide)
21. [Verification & Test Suite (302/302 Passing)](#verification--test-suite-302302-passing)
22. [2–3 Minute Demo Video Walkthrough](#23-minute-demo-video-walkthrough)
23. [Future Roadmap Beyond Hackathon](#future-roadmap-beyond-hackathon)
24. [License & Acknowledgements](#license--acknowledgements)

---

## Executive Summary & Vision

**DreamPulse** is an institutional-grade, full-stack cyber-financial platform engineered specifically for **DreamDEX Event Contracts** on the **Somnia Shannon Testnet** (Chain ID `50312`).

Built to answer the Somnia × DreamDEX Hackathon challenge across **all tracks** — consumer-facing trading applications, AI trading agents, analytics tools, social prediction products, and settlement infrastructure — DreamPulse replaces fragmented bot scripts with an end-to-end decentralized exchange ecosystem.

### Platform Architecture Overview

DreamPulse is structured into four tightly integrated operational layers:

1. **Client Application Layer (`React` · `Vite` · `TypeScript`)**
   * **Pro Trade Terminal**: CLOB order book, real-time depth ladders, interactive binary charts, and AI Alpha Copilot guidance.
   * **Visual Strategy Studio**: No-code sentence-based rule AST builder with 14 quantitative indicators, limit order execution controls, and dedicated Google Gemini strategy synthesis.
   * **Quantitative Backtester**: Binance historical spot replay, friction/slippage simulation, and Sharpe/Sortino performance modeling.
   * **Swarm Arena & Social Alpha**: Dual-track leaderboards, 1-click strategy cloning, and automated forecaster mirror trading.

2. **Intelligence & Quantitative Layer**
   * **Black-Scholes Math Engine**: High-precision Abramowitz-Stegun normal CDF $\Phi(z)$, Bayesian EWMA volatility surfaces, and dynamic fair-value calculations.
   * **Autonomous Agent Swarms**: Canonical protocol swarms alongside isolated per-wallet personal swarms (Volt Sniper, Oracle Arb, Titan MM).
   * **Settlement Sweeper**: Autonomous payout monitoring, zero-loss batch redemptions, and direct tUSDC wallet transfers.

3. **Execution & Security Infrastructure (`Node.js` · `Express` · `TypeScript`)**
   * **Risk & Concurrency Guard**: Pre-flight depth sanitization, serialized NonceManager queue, and single-trade/daily loss caps.
   * **Zero-Custody Session Gateway**: EIP-712 non-custodial session delegations via `OperatorPermissionsRegistry` with instant key revocation.
   * **WebSocket Telemetry Gateway**: Sub-50ms real-time state streaming, live LLM thought broadcasts, and system health telemetry.

4. **On-Chain Settlement Layer (`Somnia Shannon Testnet` · Chain ID `50312`)**
   * **`BatchApprove.sol`**: Custom smart contract enabling 1-click multi-pool delegation and token allowance aggregation.
   * **DreamDEX CLOB Contracts**: Rolling binary event market pools, order matching, and oracle settlement routing.
   * **Somnia Shannon EVM L1**: High-throughput EVM execution (400k+ TPS), sub-second block finality, and zero-slippage execution.

Whether you are a **manual retail trader** seeking real-time Black-Scholes edge and sub-second gasless order execution, a **no-code creator** building and backtesting custom binary agents, a **passive liquidity provider** copytrading the canonical multi-agent swarm, or an **algorithmic quant** running isolated personal swarms, DreamPulse provides a seamless, unified gateway to prediction markets.

---

## The Core Problem & Market Opportunity

Decentralized Central Limit Order Book (CLOB) prediction markets are the fastest-growing primitive in Web3, yet venues like DreamDEX encounter five severe structural hurdles:

| Challenge | Impact on Event Contracts | DreamPulse Solution |
| :--- | :--- | :--- |
| **1. Cold-Start Liquidity** | Markets open with zero bids/asks or $>15\%$ spreads, alienating organic retail traders. | **Titan MM** seeds continuous two-sided liquidity within 2.5%–4.0% spreads scaled by real-time EWMA volatility. |
| **2. Quote Staleness & Latency** | Underlying spot prices (e.g. BTC, ETH) jump violently, but resting limit orders take seconds to adjust. | **Volt Sniper** monitors 100ms spot velocity against order book VWAP to eliminate stale mispricings. |
| **3. Vol Surface Mispricing** | Retail traders price binary contracts on raw sentiment rather than continuous Black-Scholes $\Phi(d_2)$. | **Oracle Arb** computes theoretical fair value and executes when post-spread edge exceeds $\ge 3.5\%$. |
| **4. Multi-Pool Approval UX Friction** | Rolling 5m/15m/1h prediction markets create dozens of independent pool addresses, each requiring manual wallet popups. | **`BatchApprove.sol`** custom smart contract enables 1-click batch delegation across all active and rolling event pools. |
| **5. Stranded Settlement Capital** | Traders must manually track contract expirations, wait for oracles, and claim payouts, stranding capital. | **Sweeper Daemon** autonomously batch-redeems winning shares across resolved pools and recycles collateral. |

---

## The 6 Core Platform Pillars

| Platform Pillar | Core Capabilities | Key Advantages |
| :--- | :--- | :--- |
| **1. Pro Trade Terminal** | Live binary settlement chart, strike price indicators, AI Alpha Copilot, gasless session tickets. | Sub-second order execution with real-time Black-Scholes edge calculations and 1-click follow. |
| **2. Strategy Studio** | Visual sentence canvas, 14 technical indicators, limit execution drawer, dedicated Gemini copilot, isolated tUSDC allowances. | True no-code quantitative strategy creation with maker/taker controls and martingale sizing. |
| **3. Quant Backtester** | Binance 1m/5m/15m/1h historical data, configurable slippage and latency delays, Sortino and drawdown metrics. | Verified historical performance validation before deploying to personal or global swarms. |
| **4. Autonomous Swarms** | 4 specialized autonomous agents (Volt, Oracle, Titan, Sweeper), protocol vs. personal swarms, 100ms evaluation loops. | Continuous two-sided market liquidity and latency arbitrage with isolated per-wallet parameters. |
| **5. Swarm Arena & Social** | Dual-track leaderboards (AI fleet & human forecasters), 1-click strategy cloning, forecaster mirror trading. | Fully transparent on-chain performance tracking and high-resolution Proof-of-Alpha cards. |
| **6. Settlement Sweeper** | Autonomous resolution scanning, zero-loss multi-pool batch claims, direct tUSDC wallet transfers. | Eliminates stranded capital by automatically claiming and transferring resolved payouts directly to user wallets. |

---

## 1. Pro Trade Terminal with AI Alpha Copilot

The **Trade Terminal** (`#trade` / `TradeTerminalView.tsx`) provides a professional, full-bleed execution environment for binary prediction contracts on Somnia DreamDEX.

### Terminal Layout & Navigation Structure:
* **Header & Market Switcher**: Live spot ticker feeds (BTC/USD, ETH/USD) with 1m/5m price drift calculations and synchronized countdown clocks.
* **Settlement Canvas & Depth Book**: Center stage toggling seamlessly between the visual binary settlement chart and the full CLOB order book depth ladder.
* **AI Alpha Copilot**: Real-time Black-Scholes fair value estimation $\Phi(z)$, net mathematical edge, and instantaneous 1-click execution.
* **Order Ticket**: UP/DOWN conviction cards, collateral presets, and gasless session key order placement.
* **Positions & Executions Drawer**: Persistent bottom drawer displaying active positions, resting orders, and on-chain settlement receipts.

### Key Terminal Features:
* **Visual Binary Settlement Chart (`EventContractChart.tsx`)**: Real-time SVG chart displaying a dashed strike settlement price line, glowing spot price trail, shaded **UP (Emerald)** and **DOWN (Rose)** payout zones, AI Forecast projection cone overlay, interactive crosshair tooltips, and floating time-to-settlement badges.
* **Dual-View Single-Click Book Toggle (`Show book / Hide book`)**: Effortlessly switch the main canvas between the visual settlement chart and the full CLOB Order Book Depth Ladder without losing order configuration state.
* **Recently Settled Rounds Carousel (`RecentlySettledRounds.tsx`)**: Horizontal scrolling strip tracking past 5m/15m/1h round resolutions with settlement prices, localized timestamps (24h format), and UP/DOWN resolution badges.
* **AI Alpha Copilot (`TraderCockpitTicket.tsx`)**:
  * Displays real-time analytical Black-Scholes fair value $\Phi(z)$ vs market odds.
  * Highlights calculated mathematical edge ($+12.7\%$) and real-time LLM rationale.
  * **`⚡ 1-Click Follow AI Trade`**: Automatically configures direction, lot size, and limit price to match the AI recommendation in a single click.
* **Pro Binary Order Ticket**:
  * High-conviction **▲ UP** and **▼ DOWN** selection cards with dynamic win multipliers and ROC return preview.
  * Collateral presets (`25%`, `50%`, `75%`, `100%`, `MAX`) and custom input with live balance verification.
  * **Gasless Session Key Execution**: Instant order submission via `placeOrderFor` on Somnia Shannon Testnet with direct MetaMask fallback.
* **Synchronized Local Time Engine (`useMarketCountdown.ts`)**: Derives the user's browser timezone (24h format) and synchronizes live countdown timers (`03:12`) in lockstep across header, chart, and order ticket.
* **Bottom Multi-Tab Drawer (`ActivePositionsDrawer.tsx`)**: Persistent bottom drawer displaying active positions, resting limit orders, and execution history with 1-click Shannon explorer links.

---

## 2. Visual Strategy Studio (No-Code Agent Builder)

The **Visual Strategy Studio** (`#studio` / `StrategyStudioView.tsx`) enables anyone to assemble, customize, and deploy automated trading agents with zero coding required.

### Visual Algorithmic Sentence Workflow:
1. **WHEN (Market & Timeframe)**: Select asset (`BTC/USD`, `ETH/USD`) and candle resolution (`1m`, `5m`, `15m`, `1h`).
2. **IF (Trigger Conditions)**: Add multi-indicator capsules across 14 technical & quantitative indicators (e.g. `MACD 12/26 Golden Cross`, `VWAP Reclaim`, `Stochastic %K < 20`, `Volume > 1.5x`).
3. **THEN EXECUTE (Binary Action & Pricing)**: Define trade direction (`CALL` or `PUT`), duration (`60s Turbo` to `1h`), fixed lot stake, execution style (`MARKET` taker buy vs `LIMIT` resting maker post), and limit offset bps.
4. **RISK LEASH & CAPITAL MANAGEMENT**: Set consecutive loss limits, loss cooldowns, dynamic martingale sizing, take-profit target locks, daily drawdown circuit breakers, and expiry buffer guards.

### Core Studio Capabilities:
* **Interactive Sentence & Capsule Canvas**:
  * **Market & Timeframe**: Select asset (`BTC/USD`, `ETH/USD`) and candle resolution (`1m`, `5m`, `15m`, `1h`).
  * **14 Quantitative Indicator Capsules**:
    * `RSI` (Relative Strength Index overbought/oversold)
    * `MACD` (12/26/9 Fast/Slow/Signal crossovers & histogram divergence)
    * `STOCHASTIC` (%K and %D cyclical swing indicator with crossover triggers)
    * `BOLLINGER_LOWER` & `BOLLINGER_UPPER` (Configurable rolling period and standard deviation envelopes)
    * `EMA` & `SMA` (Trend moving averages with dual-period golden/death cross support)
    * `VWAP` (Volume-Weighted Average Price institutional reclaim/fade benchmark)
    * `VOLUME_SURGE` (Heavy volume breakout detector vs rolling baseline multiplier)
    * `ADX` (Average Directional Index trend strength regime filter)
    * `ATR` (Average True Range volatility expansion indicator)
    * `CCI` (Commodity Channel Index cyclical statistical deviation)
    * `WILLIAMS_R` (Williams %R ultra-responsive momentum oscillator)
    * `PRICE_DRIFT` (High-frequency spot price displacement within contract expiration window)
  * **Configurable Logic Gate**: Switch seamlessly between `ALL Must Agree (AND)` and `ANY May Trigger (OR)`.
* **Advanced Strategy Execution & Capital Controls Drawer**:
  * **Execution Mode**: `MARKET` (Immediate Taker Buy) or `LIMIT` (Resting Maker Post).
  * **Limit Pricing Models**: `Best Available Bid/Ask`, `Order Book Midpoint`, or `Basis Point Discount Offset`.
  * **Slippage & Timing Guards**: Max slippage tolerance bps and expiry safety buffer (seconds).
  * **Dynamic Position Sizing**: `1.0x (Flat)` | `1.25x (Gentle)` | `1.5x (Moderate)` | `2.0x (Martingale)` recovery sizing.
  * **Take-Profit Target Lock (%)**: Automatically locks realized gains and pauses trading when target profit is achieved.
  * **Daily Drawdown Circuit Breaker (%)**: Shuts down execution if drawdown limit is breached, preventing catastrophic tail risk.
* **Dedicated Google Gemini Prompt-to-Strategy Co-Pilot**:
  * Plain English strategy description Omnibar (e.g. *"Aggressive BTC 60s Call sniper on MACD golden cross and RSI < 35 with 1.5x volume surge"*).
  * **Exclusively Dedicated Gemini Engine**: Uses Google Gemini (`GEMINI_API_KEY`, `GEMINI_BASE_URL`, `GEMINI_MODEL`) strictly for user strategy synthesis, with zero background swarm consumption, reserving 100% of your Gemini quota for studio creation.
  * Instant pre-set suggestion chips for 1-click strategy generation.
* **Instant Ghost Radar**: Real-time heuristic performance HUD previewing estimated win rate, 24-hour trigger frequency, simulated net PnL, and profit factor.
* **Independent Agent Deployment & Isolated tUSDC Allowance**:
  * **Independent On-Chain Deployment**: Deploy each custom agent separately with dedicated execution authority, avoiding all-or-nothing swarm coupling.
  * **Granular tUSDC Bankroll Allowance**: Assign an individual maximum risk budget (e.g. `$25`, `$50`, `$100`, `$250`, `$500`, or custom tUSDC) to each agent, ensuring strict risk containment where no single strategy can drain your capital.
  * **Real-Time Allowance Depletion Meter**: Live visual progress tracking of allocated vs. spent tUSDC allowance, with remaining balance monitoring.
  * **1-Click Deploy / Pause Controls**: Toggle any agent between `DEPLOYED (Live Autotrading)` and `PAUSED (Dormant)` with single-click instant responsiveness.
  * **Inline Bankroll Modification**: Adjust an agent's tUSDC budget on the fly without needing to recreate or retune its underlying indicators.
* **Strategy Library & Starter Presets**:
  * Pre-loaded starter templates: *RSI Oversold Dip Sniper*, *Bollinger Band Exhaustion Fade*, *Fast EMA Momentum Rider*, *MACD Volume Surge Breakout*, *VWAP Trend Master*, and *Stochastic & CCI Reversal Hunter*.
  * Saved custom agents and deployed bankrolls persist to PostgreSQL via Supabase RLS with in-memory caching.

---

## 3. Quantitative Backtester & Simulation Lab

The **Quantitative Backtesting Lab** (`#backtest` / `StrategyStudio.tsx`) allows institutional-grade historical simulation of both canonical Protocol Swarm agents and user-created custom strategies:

* **Dual Simulation Architecture**:
  * **Protocol Swarm Agents**: Backtest canonical `Volt Sniper`, `Oracle Arb`, or `Titan MM` strategies under varying parameter sets.
  * **Custom User Agents**: Select any agent from your Strategy Studio library to replay its JSON rule AST bar-by-bar against real historical candlesticks.
* **Real Historical Market Data**:
  * Direct ingestion of 1m, 5m, 15m, and 1h Binance candlestick feeds across all supported trading pairs.
  * Forward-fill bar slicing prevents lookahead bias during indicator calculation (`RSI`, `EMA`, `Bollinger Bands`).
* **Realistic Execution Friction Modeling**:
  * Configurable taker slippage (in basis points, e.g. 4 bps).
  * Exchange maker/taker fee simulation (e.g. 2.5 bps).
  * Artificial network execution latency delay (e.g. 25ms–100ms).
* **Institutional Metrics Computed**:
  * **Sharpe & Sortino Ratios**: Downside risk-adjusted performance against volatility.
  * **Profit Factor & Trade Expectancy**: Total gross gains over gross losses and expected net return per fill.
  * **Win Rate & Payoff Ratio**: Win percentage and average win size over average loss size.
  * **Underwater Drawdown Curve**: Detailed visual timeline of peak-to-trough equity pullbacks.
* **Deployment Bridge**:
  * **Operators** → *Deploy to Global Swarm*: pushes verified parameters live to the canonical Protocol Swarm on Somnia Shannon.
  * **Traders** → *Deploy to My Personal Swarm*: automatically saves parameters to the user's isolated per-wallet swarm (`user_swarm_configs`), flipping the session to `PERSONAL` mode.

---

## 4. Autonomous Multi-Agent Swarms (Protocol & Personal)

DreamPulse coordinates an orchestrated **Multi-Agent Swarm** operating on a high-frequency **100ms evaluation cadence**.

> [!TIP]
> **Auditable Live Swarm Benchmark ([Inspect Live Cockpit](https://dreampulse-ai.vercel.app/#cockpit))**:
> The canonical Protocol Swarm running live on Somnia Shannon Testnet (Chain ID `50312`) has achieved:
> * **Cumulative Net Realized PnL**: **Over 100 tUSDC** in net realized profits across active binary prediction contracts.
> * **Total On-Chain Executions**: **Over 1,000 fills** across Volt, Oracle, Titan, and Sweeper payout redemptions.
> * **Real-Time Evaluation Latency**: Sub-100ms evaluation loops with an average evaluation latency of **`1ms`** (47ms tick).
> * **100% Verifiable & Non-Custodial**: View live equity curves, active resting orders, and execution streams in the [Auditable Cockpit](https://dreampulse-ai.vercel.app/#cockpit).

### Swarm Daemon Architecture & Component Flow:
* **Quantitative Math Engine**: Abramowitz-Stegun normal CDF $\Phi(z)$, Bayesian EWMA volatility surfaces, depth-weighted VWAP, and quantized tick math.
* **Cognitive Reasoning Engine**: Real-time Groq LLM telemetry broadcasting structured rationale and conviction scores for every executed trade.
* **Four Autonomous Agent Personas**: `Volt Sniper` (momentum taker), `Oracle Arb` (implied vol arb), `Titan MM` (inventory-skewed maker), and `Sweeper` (settlement daemon).
* **Risk & Circuit Breakers**: Self-trade depth sanitization, serialized NonceManager queues, and per-session single-trade / daily volume caps.
* **On-Chain Somnia Integration**: Direct non-custodial interaction with DreamDEX binary market pools, `OperatorPermissionsRegistry`, and `BatchApprove.sol`.

### Hybrid Personal Swarm: Copy-Trading vs Isolated Per-Wallet Swarms

**Traders own their strategy; custody never leaves their wallet.**

| Mode | Who trades? | How it works | On-chain invariant |
| :--- | :--- | :--- | :--- |
| **COPY (default)** | Protocol Swarm (Operator) + real-time copy-trade | New high-conviction signals on the canonical swarm are instantly replicated to every delegated wallet in `COPY` mode, under that wallet's own `maxTradeSize` / `dailyVolumeCap` guardrails. Zero custody moves — `transferFrom(user, operator)` only for the exact `price × quantity` collateral; operator pays STT gas. | Users in `COPY` never miss the swarm edge; they auto-benefit from Titan's liquidity and Volt/Oracle alphas. |
| **PERSONAL (isolated)** | Per-wallet ephemeral swarm | Once a trader customizes any Volt/Oracle/Titan slider in **My Personal Swarm** or clicks **Deploy to My Personal Swarm** from Strategy Studio, `user_swarm_configs.mode` flips to `PERSONAL`. The daemon spawns an independent evaluation loop per wallet — ephemeral `VoltSniperAgent` / `OracleArbAgent` / `TitanMMAgent` instances seeded with that wallet's parameters, with per-user rate limits (`60s` cooldown, `120s` opp dedup) and per-user inventory (`Titan` delta aggregated only from that wallet's unsettled fills). Copy-trading is **disabled** for this wallet while `PERSONAL`. | True strategy isolation: your drift thresholds (`0.05%–1.0%`), `minEdge` (`1%–12%`), `targetSpread` (`2%–8%`), `inventoryAversion` (`0.005–0.04`) and enabled flags execute independently of the Operator's policy. Revert to `COPY` with one click. |

---

## Autonomous Agent Personas

### 1. Volt (Spot Staleness Sniper)
* **Strategy**: Latency & Spot Velocity Momentum Taker.
* **Mechanism**: Ingests sub-second spot ticker price movements across underlying assets (BTC, ETH). When a rapid spot jump ($|\Delta_{\text{1m}}| \ge \text{adaptive drift threshold}$) occurs faster than market makers adjust their quotes on the DreamDEX CLOB, Volt executes an aggressive Immediate-Or-Cancel (`IOC`) taker order.
* **Risk Invariants**:
  * Expiry boundary guard: Holds execution in the final 15 seconds before expiration to prevent block-boundary mining reverts.
  * Macro trend confluence: Rejects trades if the 1-minute spike conflicts with the 5-minute macro directional trend ($\Delta_{\text{5m}}$).
  * Safe probability envelope: Limits taker buys strictly to the $[0.25, 0.68]$ range to maintain favorable risk-to-reward ratios.
  * Depth-aware VWAP execution: Calculates volume-weighted average price across multiple price levels to prevent self-slippage.

### 2. Oracle (Volatility Surface Arbitrageur)
* **Strategy**: Mathematical Implied vs. Realized Volatility Arbitrage.
* **Mechanism**: Continuously prices binary prediction event contracts using high-precision Black-Scholes standard normal cumulative distribution $\Phi(d_2)$. Compares theoretical fair value with the mid-market price on DreamDEX. When the net edge exceeds post-spread, post-fee thresholds ($\ge 3.5\%$), Oracle trades to exploit mispriced probability surface.
* **Risk Invariants**:
  * Real-time EWMA realized volatility: Ingests tick history variance with Bayesian prior shrinkage, resisting single-tick noise.
  * Time-decay theta scaling: Dynamically scales required margin of safety up to $+40\%$ in the final 5 minutes as gamma risk intensifies.
  * Gamma pin-risk lockout: Refuses execution when time remaining $< 45\text{s}$ or $> 7,200\text{s}$.
  * Minimum 8.0% Return-on-Capital hurdle ($E[\text{ROI}] \ge 8.0\%$).

### 3. Titan (Adaptive Two-Sided Market Maker)
* **Strategy**: Continuous Bid-Ask Liquidity Provision with Dynamic Inventory Skewing.
* **Mechanism**: Posts resting two-sided limit orders (`LIMIT`) symmetrically around theoretical fair value $\Phi(z)$ to capture the spread. To manage directional exposure, Titan dynamically skews reservation prices using super-linear gamma inventory aversion ($\gamma \cdot |\text{inv}|^{1.25}$) and order book depth imbalances.
* **Risk Invariants**:
  * Swarm-wide delta aggregation: Monitors open, unsettled fills across Volt, Oracle, and Titan to manage net portfolio inventory.
  * Tail spread expansion: Automatically widens spreads when event probabilities enter extreme wings ($<0.30$ or $>0.70$).
  * Self-trade protection: Active maker quotes are automatically registered in memory and subtracted from depth calculations, preventing Volt and Oracle from crossing Titan's own orders.

### 4. Sweeper (Autonomous Settlement & Direct Payouts)
* **Strategy**: Zero-Loss Capital Recycling & Batch Redemption.
* **Mechanism**: Monitors all prediction contracts transitioning from `Trading` $\rightarrow$ `Resolving` $\rightarrow$ `Finalized`. Identifies unclaimed winning outcome tokens (YES/NO) and invokes the DreamDEX settlement contracts to batch-claim payouts.
* **Risk Invariants**:
  * 100% direct wallet transfers: Claimed `tUSDC` collateral is instantly transferred directly to the user's wallet.
  * Gas-optimized batching: Aggregates multiple matured markets into single transaction calls to minimize native `STT` gas expenditure.

---

## 5. Swarm Arena, Strategy Leaderboards & Proof-of-Alpha

Fulfilling the hackathon's core vision for **Social Prediction Products**, **1-Click Strategy Cloning**, and **Viral Ecosystem Adoption**, DreamPulse introduces the **Swarm Arena** (`#arena`), **Dedicated Trader Profiles** (`#profile/:address`), and the **Proof-of-Alpha Card Studio**.

### Swarm Arena Structure & Social Ecosystem:
* **AI Agent Fleet Track**: Protocol archetypes (Volt, Oracle, Titan) alongside user-deployed custom agents ranked by net PnL, Win Rate %, Sharpe/Sortino ratios, and rule AST summaries.
* **Human Forecasters Track**: 100% genuine CLOB order flow and on-chain verified trader performance with tier badges (`APEX`, `GRANDMASTER`, `MASTER`).
* **1-Click Strategy Cloning**: Instantly import any agent's quantitative parameters into your personal swarm or visual strategy studio.
* **Autonomous Social Mirroring**: Auto-replicate high-ranked forecasters within strict non-custodial session risk bounds.
* **Proof-of-Alpha Card Studio**: Generate 2x and 4x retina Canvas verification badges for sharing on X (Twitter), Telegram, and Discord.
* **Dedicated Forecaster Profiles**: Full-page trader analytics featuring cumulative alpha curves, asset distributions, and on-chain fills history.

### 1. Dual-Track Arena & Quantitative Leaderboards
* **AI Agent Fleet Track**: Ranks autonomous algorithmic agents (such as *Volt Latency Sniper*, *Oracle Volatility Harvester*, *Titan MM*, and community-deployed custom agents) by real Net PnL, Win Rate %, Total Fills, Sharpe/Sortino Ratios, and Quantitative Rule Summaries.
* **Human Forecasters Track**: Aggregates 100% genuine manual and terminal order executions on Somnia DreamDEX CLOB event pools. Ranks forecasters with Copilot Synergy Scores, Win Streaks, Volume, and Tier Badges (`APEX`, `GRANDMASTER`, `MASTER`, `PRO`, `EMERGING`).
* **Multi-Timeframe Filtering**: Filter rankings across `24H` (active daily activity slice) and `7D` / `30D` / `ALL` (true inception performance metrics).

### 2. 1-Click Strategy Cloning & Social Mirroring
* **1-Click Strategy Cloning**: Clicking **Clone Strategy** on any agent copies its quantitative rule conditions, drift thresholds, and parameter AST directly into the user's Strategy Studio or Personal Swarm Cockpit.
* **Autonomous Social Mirror Trading & Risk Controls**: Clicking **Mirror Forecaster** opens the **Social Copy Risk & Sizing Modal** (`SocialCopyRiskModal.tsx`). Copiers can configure custom per-trade maximums (`maxTradeSize`) and 24-hour cumulative rolling volume ceilings (`dailyVolumeCap`) before confirming. Whenever the high-ranked forecaster places a trade in the Trade Terminal, DreamPulse's execution gateway automatically validates session key validity, enforces position ceilings, scales lot sizes, and executes the mirror order on Somnia Shannon with instant WebSocket fill notifications.
* **Swarm Fleet Risk & Sizing Controls (`SwarmRiskModal.tsx`)**: Easily accessible via the **Overview Session Bar** and **Personal Swarm Cockpit**, allowing users to tune drift thresholds, minimum edges, lot sizes, and spread parameters across Volt, Oracle, Titan, and Sweeper with 1-click **Save Settings** batch persistence.

### 3. Dedicated Full-Page Trader Profile (`#profile/:address`)
* **Interactive Cumulative Alpha Performance Curve**: Visualizes cumulative realized PnL trajectory across trading rounds with interactive date/delta inspection.
* **Recent On-Chain Executions Ledger**: Complete transaction history with market window badges, execution side (`BUY CALL` / `SELL NO`), stake amount, settled PnL, and direct Somnia Shannon Explorer verification links.
* **Asset Allocation & Horizon Breakdown**: Horizontal percentage allocation bars across asset pairs (`BTC/USD`, `ETH/USD`) and preferred binary expiry horizons (`1m`, `5m`, `15m`).
* **Deep-Linkable URL Architecture**: Supports canonical `#profile/0x...`, `#trader/0x...`, and `#arena` deep linking.

### 4. Proof-of-Alpha Card Studio (`ProofOfAlphaModal.tsx`)
A high-resolution graphics generator rendering 2x & 4x retina Canvas cards for social bragging on X (Twitter), Telegram, and Discord:
* **Curated Visual Themes**: *Cyber Emerald*, *Shannon Quantum*, *Apex Gold*, *Crimson Titan*, and *Dark Monochrome*.
* **Aspect Ratio & DPI Selection**: `16:9 Landscape` (Twitter cards) and `1:1 Square` (Discord/Telegram feeds) at `2x HD` or `4x Ultra-HD`.
* **Customizable Slogans & Taglines**: Live editable text input with 1-click preset badges.
* **High-Tech Cyber HUD Elements**: Toggleable isometric matrix grid, HUD corner brackets, glowing area sparkline with final apex node ring, and Somnia Shannon verification stamp.
* **1-Click Export**: Binary clipboard copy (`navigator.clipboard.write`), PNG download, and direct `Share on X` intent.

---

## 6. Settlement Sweeper & Direct Payouts

The **Settlement Sweeper** (`#settlement` / `SweeperControls.tsx`) provides zero-loss capital efficiency for prediction markets:

* **Real-Time Settlement Watcher**: Continuously monitors prediction contracts transitioning from `Trading` $\rightarrow$ `Resolving` $\rightarrow$ `Finalized`.
* **Zero-Loss Batch Redemption**: Queries claimable outcome token balances across all user and swarm positions, invoking the DreamDEX `BinarySettlement` router in single batch transactions.
* **100% Direct Wallet Transfers**: Immediately claims and transfers redeemed `tUSDC` directly to user wallets without requiring manual claims or extra gas friction.
* **Gas-Optimized STT Batching**: Bundles multiple market redemptions into one on-chain execution to minimize gas overhead on Somnia Shannon.

---

## Mathematical & Quantitative Foundation

DreamPulse adheres strictly to deterministic precision math and floating-point protection:

### 1. High-Precision Standard Normal CDF $\Phi(z)$
To guarantee sub-millisecond calculation speeds on standard Node.js/browser runtimes without external C++ bindings, DreamPulse implements the **Abramowitz & Stegun rational Chebyshev approximation** (Formula 7.1.26) for the Error Function $\text{erf}(x)$:

$$\text{erf}(x) \approx 1 - \left(a_1 t + a_2 t^2 + a_3 t^3 + a_4 t^4 + a_5 t^5\right) e^{-x^2}, \quad t = \frac{1}{1 + p x}$$

$$\Phi(z) = \frac{1}{2} \left[ 1 + \text{erf}\left(\frac{z}{\sqrt{2}}\right) \right]$$

* Maximum absolute error: $|\epsilon| < 1.5 \times 10^{-7}$.
* Guaranteed monotonic bounds: clamped between $[0.001, 0.999]$ to reflect DreamDEX CLOB probability rules.

### 2. Standardized $z$-Score ($d_2$) Formulation
For a binary prediction contract settling on whether underlying spot $S$ reaches strike price $K$ at expiry $T$:

$$z = \frac{\ln(S / K) + \left(r - \frac{1}{2}\sigma^2\right) T}{\sigma \sqrt{T}}$$

Where:
* $S$: Current spot price from live WebSocket feed.
* $K$: Market strike settlement price.
* $\sigma$: Real-time EWMA realized annualized volatility.
* $T$: Time remaining until resolution in fractional years ($T = \frac{\text{seconds}}{31{,}557{,}600}$).
* $r$: Risk-free interest rate ($r = 0.0$).

### 3. Bayesian Shrinkage EWMA Realized Volatility
Rather than relying on static volatility assumptions, DreamPulse computes sample variance of log returns over a rolling window and blends it with an asset-specific baseline prior:

$$\sigma_{\text{blended}} = w \cdot \sigma_{\text{realized}} + (1 - w) \cdot \sigma_{\text{baseline}}, \quad w = \min\left(1.0, \frac{N_{\text{ticks}}}{30}\right)$$

### 4. Reservation Price & Super-Linear Inventory Skew
Titan MM computes bid/ask quotes around fair value $\Phi(z)$ adjusted for inventory risk:

$$P_{\text{bid}} = \Phi(z) - \frac{\text{spread}}{2} - \text{sign}(\Delta) \cdot \gamma \cdot |\Delta|^{1.25}$$

$$P_{\text{ask}} = \Phi(z) + \frac{\text{spread}}{2} - \text{sign}(\Delta) \cdot \gamma \cdot |\Delta|^{1.25}$$

Where $\Delta = \text{Inventory}_{\text{YES}} - \text{Inventory}_{\text{NO}}$ and $\gamma$ is the inventory aversion parameter.

### 5. Depth-Weighted VWAP Calculation
When evaluating order book liquidity, taker agents simulate fills against the cumulative depth ladder:

$$P_{\text{VWAP}} = \frac{\sum_{i=1}^k P_i \cdot Q_i}{\sum_{i=1}^k Q_i}$$

If slippage $P_{\text{VWAP}} - P_{\text{top}} > \text{maxSlippage}$, execution is automatically aborted.

### 6. Quantitative Probability Stabilization Engine (Anti-Pin-Risk)
In ultra-short prediction contracts (5m, 15m), raw un-smoothed Black-Scholes probabilities suffer from **"Pin-Risk Cliff Degeneration"** as $T \to 0$ (the $\sigma \sqrt{T}$ denominator collapsing, turning micro-fluctuations into violent $10\% \leftrightarrow 90\%$ step-function flips). DreamPulse introduces a 4-tier quantitative stabilization engine:

1. **Short-Horizon Diffusion Regularization**: Enforces a non-zero diffusion buffer ($T_{\text{floor}} = 45\text{s}$) in $z$-score computation to prevent division by near-zero and preserve continuous, smooth probability density around the strike price.
2. **Multi-Factor Confluence Scoring**: Blends Black-Scholes theoretical probability $\Phi(z)$ ($60\%$) with a non-linear spot momentum drift sigmoid ($28\%$) and order book depth imbalance skew ($12\%$):
   $$P_{\text{confluence}} = 0.60 \cdot \Phi(z) + 0.28 \cdot \text{Sigmoid}\left(250 \cdot \Delta_{\text{1m}} + 150 \cdot \Delta_{\text{5m}}\right) + 0.12 \cdot \left(0.5 + 0.15 \cdot \text{DepthSkew}\right)$$
3. **Temporal EMA Probability Smoothing**: Filters out single-tick microstructure bid-ask bounce:
   $$P_{\text{smooth}}(t) = 0.25 \cdot P_{\text{confluence}}(t) + 0.75 \cdot P_{\text{smooth}}(t-1)$$
4. **Directional Conviction Hysteresis**: Employs an ATM deadband requiring sustained directional momentum to change AI bias, ensuring rock-solid, reliable trading recommendations.

---

## Non-Custodial Session Delegation & BatchApprove.sol

One of the largest UX hurdles in Web3 prediction markets is that **every newly deployed binary pool contract requires separate ERC-20 token approval and operator authorization**. 

DreamPulse solves this with a **two-tier non-custodial authorization architecture**.

### Non-Custodial Delegation Lifecycle:
1. **Wallet Connection & Risk Configuration**: User connects wallet and configures delegation limits (single-trade cap and cumulative daily cap).
2. **1-Click Batch Approval**: User signs a single transaction via `BatchApprove.sol`, executing `setOperatorApprovalForPool` across all active and rolling prediction pools in the `OperatorPermissionsRegistry`.
3. **EIP-712 Session Authorization**: User signs an off-chain EIP-712 typed data message (`SessionGrant`) granting non-custodial execution authority within the configured caps.
4. **Session Registration**: Frontend registers the session grant with the backend daemon via `POST /api/v1/sessions/register`.
5. **Autonomous Scoped Execution**: The swarm operator invokes `placeOrderFor` on Somnia Shannon testnet. The registry verifies scoped permissions and executes the order directly from user collateral with zero custody transfer.

### The Zero-Custody Invariant
Agents operate strictly via Somnia's `OperatorPermissionsRegistry` using scoped function selectors:
* `placeOrderFor` (`0x80054449` / `0x7f4806a6`)
* `cancelOrderFor` (`0xe37b444b` / `0x272714c6`)
* `reduceOrderFor` (`0x364c2587`)

> [!IMPORTANT]
> **Zero Withdrawal Privileges**: Withdrawal functions (`withdraw`, `transfer`, `drain`) are **cryptographically impossible** under this delegation model. Agents possess zero custody and cannot move funds outside of the DreamDEX binary pool ecosystem.

---

## Institutional Design System & Minimalist UI

The DreamPulse frontend is crafted with an ultra-refined, minimalist institutional quant design system built with React 18, TypeScript, Tailwind CSS, and custom GPU shaders:

* **Minimalist Obsidian & Slate Design System**: Calm dark aesthetic with frosted translucent panels (`.glass-card`, `.glass-panel`), bespoke HSL tokens, and Radix UI primitives.
* **Procedural Silk WebGL Shader Background**: Real-time Three.js GPU-accelerated fluid cloth simulation (`Silk.tsx`) creating smooth atmospheric depth behind the terminal.
* **Cinematic Landing Showcase**: Immersive entry portal featuring interactive live swarm telemetry, protocol architecture breakdown, and seamless Web3 wallet authentication.
* **Revamped Pro Event Contracts Trade Terminal With AI Alpha Copilot**: Full-bleed trading layout, visual binary settlement chart with strike lines and payout zones, single-click book toggle, localized 24h market countdowns, and instant session-key order execution.
* **Institutional 3-Category Sidebar**:
  * **Trading & Markets**: *Overview*, *Edge Radar (Black-Scholes mispricing)*, *Markets & Depth*, and *Trade Terminal (Pro Execution)*.
  * **Autonomous Agents & AI**: *Fleet Cockpit (Protocol & Personal Swarms)*, *Strategy Studio (Visual No-Code Builder)*, *Backtester (Simulation Lab)*, *Swarm Arena (Leaderboards & Social)*, and *AI Swarm Feed (Real-time Thought Stream)*.
  * **Portfolio & Settlement**: *Analytics (Sharpe/Sortino)* and *Settlement Sweeper (Batch Claim & Direct Payouts)*.
* **Global Command Palette (`⌘K / Ctrl+K`)**: Lightning-fast fuzzy search modal to jump between prediction markets, navigate views, and execute platform actions.
* **Procedural Web Audio Feedback**: Zero-asset synthesizer utilizing the Web Audio API to deliver millisecond-accurate acoustic feedback for order fills, opportunity alerts, and settlement sweeps.

---

## Minimalist Onboarding & First-Run Activation Flow

To ensure new users are never overwhelmed by the depth of trading modules, DreamPulse features a multi-tiered onboarding architecture designed to get traders from wallet connection to first value in under 60 seconds.

### Onboarding Layers & User Journey:
* **Layer 1: First-Connect Wizard**: 3-step modal triggered on first connection (Network Verification -> Faucet Claim -> Non-Custodial Session Delegation).
* **Layer 2: Interactive Path Selector**: Guided routing choosing between Passive Swarm Copytrading, Pro Terminal with Copilot, or Quant Studio.
* **Layer 3: Persistent Quick-Start Quest Bar**: Interactive progress tracker embedded across the terminal header (`2 / 4 Steps Completed`).

### 1. Interactive 4-Step First-Run Wizard (`OnboardingWizardModal.tsx`)
Auto-triggers on the very first wallet connection per address/device (persisted in `localStorage`):
1. **Network Verification**: Automatically verifies the connection to **Somnia Shannon Testnet** (Chain ID `50312`) and provides a 1-click network switch action.
2. **1-Click Testnet Collateral & Gas Faucet**: Immediately claims 1,000 tUSDC test collateral and verifies STT gas balance with instant acoustic chime feedback.
3. **Session Key Demystification & Delegation**: Explains non-custodial session keys (enabling sub-100ms algorithmic execution without signing MetaMask popups on every 30s contract) with 1-click authorization and customizable risk caps.
4. **Choose Your Trading Journey**: Presents 3 role-based pathways routing directly to your preferred workflow:
   * **Autonomous Swarm Copytrading (Recommended)**: Routes directly to `Fleet Cockpit` for 1-click zero-deposit copytrading.
   * **AI Alpha Copilot & Trade Terminal**: Routes directly to `Trade Terminal` for manual order execution with AI guidance.
   * **Edge Radar & Quant Studio**: Routes directly to `Edge Radar` for mathematical mispricing arbitrage and formula backtesting.

### 2. Getting Started Quests Bar (`OnboardingQuestBar.tsx`)
A sleek banner embedded at the top of the **Overview**:
* Real-time progress tracker (`2 / 4 Completed • 50%`).
* Interactive milestone pills: `Connect Wallet`, `Claim 1,000 tUSDC Faucet`, `Authorize Session Key`, and `Copytrade or Place Trade`.
* Dismissable with state persistence or expandable anytime via the **Guided Tour** trigger.

---

## Smart Contracts & On-Chain Deployments

All DreamPulse interactions execute on the **Somnia Shannon Testnet**:

| Contract / Entity | Address | Description | Explorer Link |
| :--- | :--- | :--- | :--- |
| **Somnia Shannon Chain ID** | `50312` | High-Performance EVM Layer 1 (400k+ TPS) | [Somnia Explorer](https://shannon-explorer.somnia.network) |
| **RPC Endpoint** | `https://dream-rpc.somnia.network` | Primary JSON-RPC Provider | — |
| **`BatchApprove.sol`** | `0x12c9c45fa740ce7469dacff368b08ca7edcaac26` | 1-Click Multi-Pool Approval & Delegation Helper | [View on Explorer](https://shannon-explorer.somnia.network/address/0x12c9c45fa740ce7469dacff368b08ca7edcaac26) |
| **`OperatorPermissionsRegistry`** | `0x15C7e8CE38F021c5b45d098AaD788f63090bF20A` | Somnia Native Session Delegation Registry | [View on Explorer](https://shannon-explorer.somnia.network/address/0x15C7e8CE38F021c5b45d098AaD788f63090bF20A) |
| **`BinaryModule`** | `0x3ecC694Cef705358864a646142ac17A90E29e388` | DreamDEX Core Binary Market Logic | [View on Explorer](https://shannon-explorer.somnia.network/address/0x3ecC694Cef705358864a646142ac17A90E29e388) |
| **`MarketsCore`** | `0x2802504314685D89bF6C992CA5a8e7cC78bc0294` | DreamDEX Market Management Contract | [View on Explorer](https://shannon-explorer.somnia.network/address/0x2802504314685D89bF6C992CA5a8e7cC78bc0294) |
| **`CLOBFactory`** | `0xb2BE8EE02F96379DB75f01802384593EBa9bfF04` | Central Limit Order Book Factory | [View on Explorer](https://shannon-explorer.somnia.network/address/0xb2BE8EE02F96379DB75f01802384593EBa9bfF04) |
| **`BinarySettlement`** | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` | Settlement & Direct Collateral Redemption | [View on Explorer](https://shannon-explorer.somnia.network/address/0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23) |
| **`CollateralRouter`** | `0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C` | Collateral Vault Routing | [View on Explorer](https://shannon-explorer.somnia.network/address/0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C) |
| **`OracleHub`** | `0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b` | Prophecy Oracle Settlement Engine | [View on Explorer](https://shannon-explorer.somnia.network/address/0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b) |
| **`TestUSDC` (Collateral)** | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` | Protocol Trading Currency (6 decimals) | [View on Explorer](https://shannon-explorer.somnia.network/address/0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E) |
| **Canonical Swarm Operator** | `0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf` | Swarm Executor Wallet | [View on Explorer](https://shannon-explorer.somnia.network/address/0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf) |

---

## Hackathon Judging Criteria Alignment

| Criteria & Weight | How DreamPulse Exceeds Expectations |
| :--- | :--- |
| **Innovation & Originality (20%)** | • Unifies consumer-facing trading, no-code agent creation, multi-agent swarms, quantitative simulation, and social prediction in a single cohesive platform.<br />• First implementation combining dual-engine LLM reasoning (Groq Qwen 3.8 + dedicated Google Gemini) with analytical Black-Scholes binary option mathematics.<br />• Solves the prediction market cold-start problem through automated, inventory-skewed market making. |
| **Technical Implementation (25%)** | • Deep integration with `@somnia-chain/markets-sdk` across orders, depth ladders, cancellations, and settlement redemptions.<br />• **Battle-Tested On-Chain Performance**: Swarm has processed **over 1,000 verified fills** with a sub-100ms loop and 1ms average evaluation latency on Somnia Shannon.<br />• 302/302 unit and integration tests passing with 100% type safety and zero `any` types across 22 test suites.<br />• Built custom `BatchApprove.sol` smart contract deployed on Shannon Testnet to overcome protocol-level multi-pool approval barriers.<br />• Dynamic `NonceManager` handling sub-second on-chain concurrency and automated revert circuit breakers. |
| **User Experience & Design (20%)** | • High-aesthetic, minimalist institutional quant terminal inspired by modern hedge fund platforms (obsidian glassmorphism, GPU-accelerated Three.js Silk shader, and Radix UI primitives).<br />• **Interactive CLOB Trade Terminal**: 1-click depth ladder auto-fill, Limit & Market (IOC) order placement, collateral presets, live win payout calculations, and inline AI Alpha Copilot.<br />• Global Command Palette (`⌘K / Ctrl+K`) for sub-second keyboard-driven market navigation and execution.<br />• Zero-friction onboarding via 1-click non-custodial session delegation with strict single-trade caps and daily volume guardrails.<br />• Real-time WebSocket telemetry ($<50\text{ms}$ updates), live Black-Scholes Edge Radar, and procedural Web Audio acoustic feedback. |
| **Business & Ecosystem Impact (20%)** | • **Proven Profitability & Liquidity**: Swarm has generated **over 100 tUSDC in net realized profits** and **over 1,000 fills** directly on Somnia DreamDEX markets (auditable at [`/#cockpit`](https://dreampulse-ai.vercel.app/#cockpit)).<br />• Directly solves the primary existential crisis of Event Contracts: stale quotes, wide spreads, and idle capital.<br />• Generates continuous, organic trading volume and liquidity on Somnia, showcasing its 400k+ TPS capacity.<br />• The `Sweeper` daemon guarantees that winning collateral is perpetually recycled back into active trading rather than remaining stranded.<br />• Democratizes strategy creation with no-code agent building, social leaderboards, and 1-click strategy cloning. |
| **Presentation & Demo (15%)** | • Complete technical documentation, interactive architecture flowcharts, mathematical explanations, and full API references.<br />• Clear 2–3 minute video presentation script demonstrating end-to-end user onboarding, trade terminal, strategy studio, swarm execution, live thoughts, and on-chain settlements. |

---

## Developer Feedback Report (Somnia & DreamDEX SDK)

*As requested in the official Hackathon Guidelines, the DreamPulse engineering team compiled this comprehensive developer feedback report based on building against `@somnia-chain/markets-sdk` (v0.28.1) and DreamDEX documentation on Somnia Shannon Testnet.*

### What Works Exceptionally Well
1. **High-Performance RPC & Finality**: Somnia's block times and sub-second confirmation enable real high-frequency on-chain trading loops that are impossible on standard Ethereum Layer 2s.
2. **Deterministic CLOB Matching Engine**: Order execution against resting limit orders is deterministic, fast, and gas-efficient.
3. **Clean viem/ethers Interoperability**: The `@somnia-chain/markets-sdk` integrates cleanly with standard `viem` `PublicClient` and `WalletClient` primitives.

### Critical Friction Points & Edge Cases Encountered
1. **Multi-Pool Approval Scalability**:
   * *Problem*: DreamDEX creates unique pool contract addresses for every rolling prediction window (e.g. BTC-5m, ETH-15m). Users had to approve every individual pool contract for both `TestUSDC` spending and `OperatorPermissionsRegistry` delegation.
   * *How DreamPulse Solved It*: We wrote and deployed `BatchApprove.sol` to allow 1-click batch approvals and operator delegation across dozens of active and future pool addresses in a single transaction.
   * *Recommendation for DreamDEX*: Implement a protocol-level Global Collateral Router allowance so users approve once globally for all binary pools created by `MarketCreatorFactory`.

2. **Silent Rejections on Non-Matching IOC Orders**:
   * *Problem*: When an `IOC` taker order was submitted at a price where book depth was insufficient, some calls returned `success: false` or reverted with `ImmediateOrCancelNoFill` without emitting an indexed log event, making error categorization non-trivial.
   * *How DreamPulse Solved It*: Added pre-flight order book depth checking (`assertFunded` & `sanitizeDepthForSelfTrade`) and submitted taker orders with `ORDER_TYPE.LIMIT` at quantized crossing ticks to guarantee match-or-rest behavior without reverts.

3. **Nonce Desynchronization in Concurrent Swarm Execution**:
   * *Problem*: Under high-frequency evaluations across multiple parallel agents, rapid-fire transactions triggered `nonce too low` or `replacement transaction underpriced` errors from the RPC node.
   * *How DreamPulse Solved It*: Implemented a serialized transaction queue (`executeOperatorTx`) wrapped with Viem's `nonceManager` with automated nonce resets and exponential backoff.

4. **Indexer Sync Latency on Newly Deployed Rolling Markets**:
   * *Problem*: When a new 5-minute market is listed on-chain, the GraphQL indexer sometimes experienced a 5–15 second lag before reflecting `MarketStatus.Trading`, causing premature reverts if orders were submitted immediately.
   * *How DreamPulse Solved It*: Built a dual-fallback polling service (`marketService.pollOnChainMarkets`) that cross-validates indexer responses directly against on-chain contract state via `publicClient.readContract`.

---

## System Architecture & Execution Workflows

### Real-Time Swarm Execution Lifecycle

1. **Spot Price Ingestion**: The daemon ingests live Binance spot ticker prices via sub-second WebSocket feeds (e.g., BTC/USD).
2. **Quantitative Pricing & Drift Analysis**: The math engine computes Black-Scholes theoretical fair value $\Phi(z)$, Bayesian EWMA realized volatility, and 1m/5m price drift.
3. **Trigger Evaluation & Edge Filtering**: If Volt Sniper or Oracle Arb identifies mispricing exceeding the required net margin of safety:
   * **Depth Sanitization**: The risk guard strips resting Titan quotes to prevent self-trading.
   * **Cognitive Reasoning**: The LLM engine records a structured thought log with confidence metrics and market rationale.
   * **WebSocket Broadcast**: Telemetry is streamed in real time to connected web clients.
   * **On-Chain Placement**: The operator invokes `placeOrderFor` on the Somnia DreamDEX CLOB.
   * **Receipt Confirmation**: The transaction receipt is confirmed on-chain and broadcast to the user terminal.
4. **Autonomous Resolution & Settlement**: When a contract transitions to `Finalized`, the Sweeper daemon detects unclaimed winning shares, calls `claimMarketPayout` via the settlement router, and directly transfers tUSDC to user wallets.

### End-to-End Committed Execution Proof Trail (Database & On-Chain Audit)

The platform supports two distinct execution modalities on Somnia Shannon Testnet: **Autonomous Swarm Execution (LIMIT / NormalOrder Quoting)** and **Interactive Pro Trade Terminal (Resting LIMIT Maker & Depth Autofill)**. 

Both complete workflows — including winning contract resolution and automated settlement payout transfers — are recorded in the PostgreSQL database and verified on Somnia block explorer. A dedicated machine-readable audit trail is provided in [`evidence.json`](./evidence.json):

```mermaid
sequenceDiagram
    autonumber
    actor Swarm as Protocol Swarm / Operator (0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf)
    participant Engine as Titan Market Maker
    participant Viem as Somnia Operator Daemon
    participant Chain as Somnia DreamDEX CLOB
    participant Sweeper as Settlement Sweeper
    participant DB as Supabase PostgreSQL

    Note over Swarm,DB: Path A: Autonomous Swarm Execution (LIMIT Order & Winning Settlement Sweep)
    Engine->>Engine: 1. Mean-Reversion Edge Calculated within Volatility Band
    Engine->>Viem: Formulate LIMIT Order (BTC/USD 5m, 2 lots @ 0.481 = 0.962 tUSDC)
    
    Viem->>Chain: 2. Invoke placeOrder(Pool, Side: BUY YES, Price: 0.481, Type: LIMIT)
    Chain-->>Viem: Confirmed Order Placement Receipt (Tx: 0x8afc4dbfb7dd19b4315d6e2e7adacfc9b45338e72d25ab113c8ee2a0aa7270fd)
    Viem->>DB: Persist Order Record (id: bb03a77b-65cd-4781-9f02-f43a2019fce3, status: FILLED)
    
    Note over Chain: 3. Market Expiration & Resolution (Outcome: YES Won)
    Sweeper->>Chain: Claim Payout from BinarySettlement (414b1f4f-..., Amount: 2.000 tUSDC)
    Chain-->>Sweeper: Payout Redeemed on-chain (Tx: 0xa8afe72e8cad7bfca6ae095c586446c5a7e43337586536d85e1b41bd155a06be)
    Sweeper->>DB: Update Settlement (is_settled: true, pnl: +1.04 tUSDC)
    DB->>Swarm: 4. Telemetry Broadcast: Equity Curve incremented by +1.04 tUSDC
```

#### Verifiable Execution Metadata & Database Audit Log

Full JSON schema and verifiable snapshots are available in [`evidence.json`](./evidence.json).

##### Path A: Autonomous Swarm Execution (LIMIT Order & Settlement Redemption)

| Lifecycle Phase | Component & Entity | Verified Record & On-Chain Reference |
| :--- | :--- | :--- |
| **1. Swarm Strategy & Analysis** | Titan Mean Reversion Engine | **Operator**: `0x93e300607c363E7D7a47e50f5c9fDf1723e859Cf` (Protocol Swarm Operator)<br />**Strategy**: Bollinger Mean-Reversion & Volatility Band Market Making<br />**Target Market ID**: `BTC/USD 5m` (`0x00000000000000000000000000000000000000000000000000000000000103cd` — DreamDEX `bytes32` market ID #66,509)<br />**Rationale**: Analytical mean-reversion quote placed within theoretical volatility band. |
| **2. On-Chain Order Placement** | Somnia DreamDEX Execution | **Order ID**: `bb03a77b-65cd-4781-9f02-f43a2019fce3`<br />**Execution**: `BUY YES` (**LIMIT order**), `2` lots @ `0.481` price (`0.962` tUSDC total cost)<br />**Order Placement Tx Hash**: [`0x8afc4dbfb7dd19b4315d6e2e7adacfc9b45338e72d25ab113c8ee2a0aa7270fd`](https://shannon-explorer.somnia.network/tx/0x8afc4dbfb7dd19b4315d6e2e7adacfc9b45338e72d25ab113c8ee2a0aa7270fd)<br />**Status**: `FILLED` on-chain matching engine. |
| **3. Settlement Redemption** | Sweeper & Payout Daemon | **Resolution**: Market matured and finalized to `YES` (**In-The-Money Win**).<br />**Sweep ID**: `414b1f4f-ea71-4bf0-a40c-3fe48afcd8df`<br />**Settlement Claim Tx Hash**: [`0xa8afe72e8cad7bfca6ae095c586446c5a7e43337586536d85e1b41bd155a06be`](https://shannon-explorer.somnia.network/tx/0xa8afe72e8cad7bfca6ae095c586446c5a7e43337586536d85e1b41bd155a06be)<br />**Realized Net PnL**: `+1.04` tUSDC (`2.000` tUSDC returned, `is_settled: true`, `settled_at: 2026-09-01T16:00:15.505Z`). |
| **4. UI & Portfolio Impact** | Real-Time WebSocket Telemetry | **Frontend Feedback**: Live sound chime & notification, Portfolio equity curve stepped up by `+$1.04`, Forecaster APEX leaderboard score and win rate incremented in Swarm Arena. |

##### Path B: Interactive Pro Trade Terminal Execution (Resting LIMIT Maker & Settlement Redemption)

| Lifecycle Phase | Component & Entity | Verified Record & On-Chain Reference |
| :--- | :--- | :--- |
| **1. Session Delegation & Intent** | Pro CLOB Terminal UI | **User**: `0x46cC04De981E603958e4612f877D72427c5b6544`<br />**Session ID**: `6e72fe0c-1e91-4a0b-96d4-03ccaedf7d67` (Delegation Tx: [`0xab219108...`](https://shannon-explorer.somnia.network/tx/0xab2191086f101982e592e0fdd935f9a340db890b138f444cb2f99228a228d4aa))<br />**Target Market ID**: `BTC/USD 5m` (`0x0000000000000000000000000000000000000000000000000000000000010534` — Market ID #66,868)<br />**Action**: 1-click depth ladder selection with custom lots preset ($10 collateral allocation). |
| **2. On-Chain Order Placement** | Somnia DreamDEX Execution | **Order ID**: `ca752b99-2a07-45f4-9d4c-ddfee75264b1`<br />**Execution**: `BUY NO` (**Resting LIMIT maker order**), `11` lots @ `0.87` price (`9.57` tUSDC total cost)<br />**Order Placement Tx Hash**: [`0x898903e346f926fe533d1eab18bc5c9522f6043054c2702650f470de43a1fcd8`](https://shannon-explorer.somnia.network/tx/0x898903e346f926fe533d1eab18bc5c9522f6043054c2702650f470de43a1fcd8)<br />**Status**: `FILLED` on matching engine. |
| **3. Settlement Redemption** | Sweeper & Payout Daemon | **Resolution**: Market matured and finalized to `NO` (**In-The-Money Win**).<br />**Sweep ID**: `ad8ada64-ef98-4ab1-b001-b2e9de5b0c4c`<br />**Settlement Claim Tx Hash**: [`0x72c6030f25d1e147dad98393018dd80e66fc7747c04d55f21ce6c3d2e0ce19fc`](https://shannon-explorer.somnia.network/tx/0x72c6030f25d1e147dad98393018dd80e66fc7747c04d55f21ce6c3d2e0ce19fc)<br />**Realized Net PnL**: `+1.43` tUSDC (`11.000` tUSDC returned, `is_settled: true`, `settled_at: 2026-09-01T17:15:17.275Z`). |
| **4. UI & Portfolio Impact** | Real-Time Telemetry & Toast | **UI Feedback**: Resting book depth updated on WebSocket channel, fill confirmed via toast, settlement payout credited to user equity curve. |
---

## API & WebSocket Telemetry Protocol

The DreamPulse backend daemon exposes a comprehensive REST and WebSocket gateway:

### REST API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/markets` | Returns all active prediction contracts with strike, window, status, and implied odds. |
| `GET` | `/api/v1/markets/:id/depth` | Returns live sanitized CLOB bid/ask ladders with lot sizes and price ticks. |
| `GET` | `/api/v1/markets/spot` | Returns sub-second spot ticker prices, 1m/5m drifts, and EWMA realized volatility. |
| `GET` | `/api/v1/markets/anomalies` | Returns identified pricing anomalies where market price deviates from Black-Scholes $\Phi(z)$. |
| `POST` | `/api/v1/sessions/register` | Registers a non-custodial session delegation with EIP-712 signature and risk caps. |
| `GET` | `/api/v1/sessions/:userAddress` | Retrieves the active session, spent volume, and allowance readiness for a user. |
| `POST` | `/api/v1/sessions/:id/revoke` | Instantly revokes an active trading session. |
| `GET` | `/api/v1/agents/status` | Returns operational status, latencies, trade counts, and PnL across all 4 agents (Protocol Swarm). |
| `POST` | `/api/v1/agents/toggle` | Administrative endpoint (Operator only) to enable/disable specific agents on the Protocol Swarm. |
| `GET` | `/api/v1/swarm/my-config?userAddress={address}` | Retrieves the caller's `PersonalSwarmConfig` (`mode COPY\|PERSONAL`, per-agent toggles & params). |
| `PUT` | `/api/v1/swarm/my-config` | Upserts the caller's personal swarm config — saving any agent param auto-flips `mode` to `PERSONAL`. |
| `POST` | `/api/v1/swarm/mode` | Explicitly switches `{ userAddress, mode: COPY\|PERSONAL }` (PERSONAL ⇒ isolated swarm, COPY ⇒ mirror). |
| `POST` | `/api/v1/swarm/toggle` | Toggles a single personal agent `{ userAddress, agentType, enabled }`. |
| `POST` | `/api/v1/swarm/config` | Updates a single personal agent's params `{ userAddress, agentType, config }` (validated ranges). |
| `GET` | `/api/v1/swarm/my-status?userAddress={address}` | Returns per-wallet isolated PnL / fills / sweeper attribution + `isCopyMode` flag. |
| `POST` | `/api/v1/swarm/reset` | Resets the caller's swarm back to `COPY` (mirroring the Protocol Swarm, disables isolation). |
| `GET` | `/api/v1/orders` | Paginated query of order history with filtering by agent, outcome, status, and scope. |
| `GET` | `/api/v1/sweeper/summary` | Returns claimable unclaimed balances, all-time claimed amounts, and active settlements. |
| `POST` | `/api/v1/backtest/run` | Executes quantitative historical backtest with custom strategy and friction parameters. |
| `GET` | `/api/v1/agents/custom` | Retrieves custom user strategies and starter templates from PostgreSQL. |
| `POST` | `/api/v1/agents/custom` | Saves a new custom binary options agent with JSON rule AST conditions and risk leash. |
| `GET` | `/api/v1/agents/custom/:id` | Retrieves a specific custom agent definition. |
| `PUT` | `/api/v1/agents/custom/:id` | Updates parameters, rules, or state of a custom agent. |
| `DELETE` | `/api/v1/agents/custom/:id` | Deletes a custom agent from database and cache. |
| `POST` | `/api/v1/agents/generate` | Generates a structured strategy specification from natural language using dedicated Gemini API. |
| `POST` | `/api/v1/agents/custom/:id/deploy` | Deploys an individual custom agent for autonomous execution with dedicated tUSDC allowance. |
| `POST` | `/api/v1/agents/custom/:id/pause` | Pauses an active custom agent's autonomous trading loop. |
| `POST` | `/api/v1/agents/custom/:id/allowance` | Sets or updates the maximum allocated tUSDC bankroll allowance for an agent. |
| `GET` | `/api/v1/arena/leaderboard/agents` | Returns ranked AI agent fleet with PnL, Win Rate, Sharpe, and Rule AST summaries. |
| `GET` | `/api/v1/arena/leaderboard/traders` | Returns ranked Human Forecasters aggregating 100% genuine CLOB orders. |
| `GET` | `/api/v1/arena/trader/:address/profile` | Retrieves detailed forecaster profile with equity curve, asset allocation, and fill history. |
| `POST` | `/api/v1/arena/agent/:id/clone` | Clones an agent strategy directly into the user's custom strategy library. |
| `POST` | `/api/v1/arena/copytrade/toggle` | Toggles autonomous social mirror trading for a target forecaster. |
| `GET` | `/api/v1/arena/copytrade/status` | Queries whether caller is mirroring a specific forecaster address. |
| `GET` | `/api/v1/arena/copytrade/following` | Retrieves all forecaster addresses currently mirrored by caller. |
| `GET` | `/api/v1/arena/stats` | Global arena statistics including aggregate volume, community alpha, and active swarms. |
| `GET` | `/api/health` | Service health status, uptime, and database connectivity. |

### Real-Time WebSocket Telemetry (`/ws/telemetry`)

Clients connect via WebSocket to receive multiplexed streaming events:
* `markets` — Real-time spot price updates and contract window status transitions.
* `order_book` — Instantaneous CLOB depth ladder shifts on fill or cancel.
* `agent_thoughts` — Live structured thought feed from Groq and Gemini cognitive engines.
* `orders` & `order_filled` — Execution events with transaction hash, fill size, and realized PnL.
* `sweep_completed` — Payout redemption confirmations and recycled collateral events.

---

## Local Installation & Development Guide

### Prerequisites
* **Node.js**: `v20.0.0` or higher
* **npm**: `v10.0.0` or higher
* **Git**

### 1. Clone Repository & Install Dependencies
```bash
git clone https://github.com/zaikaman/DreamPulse.git
cd DreamPulse

# Install workspace root dependencies (both frontend and backend)
npm install
```

### 2. Configure Environment Variables

**Backend Configuration (`backend/.env`):**
```bash
cp backend/.env.example backend/.env
```
Edit `backend/.env` with your credentials:
```env
PORT=5000
NODE_ENV=development
OPERATOR_ADMIN_SECRET=your-secure-admin-secret

# Supabase (PostgreSQL & Realtime)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# LLM Cognitive Engines
# 1. Groq Multi-Key Pool (Exclusively for Real-Time Swarm Telemetry & Reasoning)
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=qwen/qwen3.8-27b
GROQ_API_KEY=gsk_your_groq_key_1
GROQ_API_KEY_2=gsk_your_groq_key_2

# 2. Google Gemini (Exclusively for Strategy Studio Builder)
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

# Somnia Shannon Testnet
SOMNIA_RPC_URL=https://dream-rpc.somnia.network
SOMNIA_WS_URL=wss://api.infra.testnet.somnia.network/ws
INDEXER_URL=https://dev.smk.somnia.host/v1/graphql
OPERATOR_PRIVATE_KEY=0x...your_funded_shannon_testnet_private_key
```

**Frontend Configuration (`frontend/.env`):**
```bash
cp frontend/.env.example frontend/.env
```
```env
VITE_BACKEND_HTTP_URL=http://localhost:5000/api/v1
VITE_BACKEND_WS_URL=ws://localhost:5000/ws/telemetry
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SOMNIA_CHAIN_ID=50312
VITE_SOMNIA_RPC_URL=https://dream-rpc.somnia.network
VITE_SOMNIA_EXPLORER_URL=https://shannon-explorer.somnia.network
```

### 3. Launch Local Development Environment
Run both backend daemon and frontend Vite server concurrently:
```bash
npm run dev
```
* **Frontend Web App**: `http://localhost:5174`
* **Backend REST Gateway**: `http://localhost:5000/api/v1`
* **WebSocket Stream**: `ws://localhost:5000/ws/telemetry`

### 4. Production Cloud Deployment (Vercel & Heroku)
For step-by-step instructions on deploying the **Frontend to Vercel** and the **Backend to Heroku**, refer to the dedicated [Production Deployment Guide](./DEPLOYMENT.md).

---

## Verification & Test Suite (302/302 Passing)

DreamPulse enforces strict production-grade quality invariants through a **three-tier verification architecture** that clearly separates **Tested Locally (Unit/Integration)**, **Simulated Quantitative Lab (Historical Backtests & Synthetic Models)**, and **Verified Live (On-Chain Testnet & Production Cloud)**.

```bash
# Run complete test suite across the workspace (Local/CI Unit & Integration)
npm test

# Run backend test suite with V8 coverage table
npm run test:coverage --workspace=dreampulse-backend

# Run full project verification (typecheck + tests + production build)
npm run verify
```

### Verification & Execution Taxonomy

| Verification Tier | Execution Environment | What Is Verified & Invariant Boundaries |
| :--- | :--- | :--- |
| 🟢 **Verified Live** | **Somnia Shannon Testnet & Production Cloud** | • **Live Smart Contracts**: Direct interaction with deployed `BatchApprove.sol` (`0x12c9c45fa740ce7469dacff368b08ca7edcaac26`), `OperatorPermissionsRegistry` (`0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`), `BinaryModule`, `CLOBFactory`, and `TestUSDC`.<br />• **On-Chain Transactions**: Order placement (`placeOrderFor`), batch approvals, cancellation, and settlement redemptions confirmed via live JSON-RPC with receipts on Somnia Explorer.<br />• **Cloud Infrastructure**: Live Vercel frontend, Heroku backend daemon, Supabase PostgreSQL with RLS, and real-time sub-50ms WebSocket telemetry. |
| 🟡 **Simulated Lab** | **Historical Backtester & Synthetic Surfaces** | • **Historical Quantitative Backtesting**: High-resolution Binance 1s/1m historical tick replay with parameterized market frictions (4 bps slippage, protocol fees, 25ms execution latency).<br />• **Option Pricing Surfaces**: Black-Scholes binary CDF $\Phi(z)$ and EWMA volatility modeled against simulated price trajectories.<br />• **Chaos & Circuit Breakers**: Upstream RPC latency spikes, network partition retries, and indexer sync delays. |
| 🔵 **Tested Locally** | **Automated Vitest Suite (Deterministic Mocks)** | • **Mathematical Invariants**: Closed-form Abramowitz-Stegun CDF polynomial approximation, Avellaneda-Stoikov inventory skew, Sharpe/Sortino ratios, integer quantization to 6-decimal micro-tUSDC.<br />• **Cryptographic & Non-Custodial Boundaries**: EIP-712 typed data hashing and signature recovery, session nonce tracking, single-trade risk ceilings ($20), and daily volume caps ($200) verified without consuming testnet gas.<br />• **Resilience & Fallback Paths**: Controlled mock injection verifying that if Groq API keys return HTTP 401 or exhaust quotas, the cognitive engine falls back to deterministic quantitative math logs; and if GraphQL indexers lag, the backend polls direct on-chain contract state. |

---

### Comprehensive Test Suite Breakdown (302 Tests Across 22 Suites)

| Test File | Tests | Verification Tier | Coverage & Verified Invariants |
| :--- | :---: | :---: | :--- |
| [`tests/quantitative.test.ts`](file:///d:/DreamPulse/backend/tests/quantitative.test.ts) | **34** | 🔵 Local Unit | Abramowitz-Stegun normal CDF $\Phi(z)$, Standardized $z$-Score ($d_2$), Bayesian EWMA realized volatility, inventory-skewed reservation prices, depth VWAP, integer quantization arithmetic, and net EV edge filtering. |
| [`tests/api.test.ts`](file:///d:/DreamPulse/backend/tests/api.test.ts) | **34** | 🔵 Local Integration | Express REST API health, market lists, order book depth ladders, anomaly feeds, telemetry stream endpoints, session management routes, order execution logs, copy-trade toggle, custom swarms, and sweeper trigger. |
| [`tests/auth-middleware.test.ts`](file:///d:/DreamPulse/backend/tests/auth-middleware.test.ts) | **26** | 🔵 Local Unit | EIP-712 auth signatures, Supabase JWT minting, verification, tamper detection, cookie parsing, SIWE, wallet verification, and route guard middleware. |
| [`tests/order-service.test.ts`](file:///d:/DreamPulse/backend/tests/order-service.test.ts) | **25** | 🟢 Live / Local | User manual orders, autonomous agent executions, resting limit order lifecycle (PENDING, PARTIALLY_FILLED, CANCELLED, EXPIRED), partial fill accounting, direct user on-chain tx receipt verification, VOID/YES/NO market settlements, pagination, and PnL reconciliation. |
| [`tests/agents.test.ts`](file:///d:/DreamPulse/backend/tests/agents.test.ts) | **20** | 🔵 Local Unit | Volt spot staleness sniper momentum triggers, Oracle volatility surface arb logic, Titan two-sided market maker quotes, inventory aversion bounds, self-trade prevention depth filtering, and multi-agent swarm runner execution. |
| [`tests/session.test.ts`](file:///d:/DreamPulse/backend/tests/session.test.ts) | **19** | 🔵 Local Unit | Non-custodial session registration, sequential nonce tracking, EIP-712 typed signature verification, single trade size caps ($20 limit), cumulative daily volume caps ($200 limit), session revocation, multi-wallet isolation, 24h rolling cap enforcement, and copy-trade target filtering. |
| [`tests/config-bootstrap.test.ts`](file:///d:/DreamPulse/backend/tests/config-bootstrap.test.ts) | **18** | 🟢 Live / Local | HttpOnly cookies, Somnia network client, automatic retry via executeOperatorTx, nonce desync recovery, Supabase credentials, and operator ABI selectors. |
| [`tests/leaderboard.test.ts`](file:///d:/DreamPulse/backend/tests/leaderboard.test.ts) | **15** | 🔵 Local Unit | Dual-track Swarm Arena rankings, Sharpe/Sortino ratios, APEX tier badges, 100% real human forecaster order aggregation, Copilot synergy, detailed trader profile generation, 1-click strategy cloning, and global arena stats. |
| [`tests/settlement.test.ts`](file:///d:/DreamPulse/backend/tests/settlement.test.ts) | **14** | 🟢 Live / Local | Matured market resolution detection, automated winning share redemptions via Sweeper daemon, direct tUSDC wallet payouts, multi-market batch claim aggregation, indexer and on-chain fallback discovery, and failed sweep accounting. |
| [`tests/analytics-anomaly.test.ts`](file:///d:/DreamPulse/backend/tests/analytics-anomaly.test.ts) | **13** | 🔵 Local Unit | Black-Scholes edge anomaly detector, severity classifications, multi-range PnL analytics, Sharpe ratios, balance history, and equity curve generation. |
| [`tests/price-feed-operator.test.ts`](file:///d:/DreamPulse/backend/tests/price-feed-operator.test.ts) | **12** | 🟢 Live / Local | Real-time spot price feeds, realized volatility, staleness detection, personal swarm configurations, and on-chain operator permissions. |
| [`tests/custom-evaluator-runner.test.ts`](file:///d:/DreamPulse/backend/tests/custom-evaluator-runner.test.ts) | **12** | 🔵 Local Unit | 14 quantitative indicators (RSI, MACD, Stochastic, Bollinger, EMA, SMA, VWAP, Volume Surge, ADX, ATR, CCI, Williams %R, Drift), limit order pricing, take-profit locks, daily drawdown circuit breakers, and background runner loop. |
| [`tests/backtest.test.ts`](file:///d:/DreamPulse/backend/tests/backtest.test.ts) | **10** | 🟡 Simulated Lab | Historical backtesting engine against Binance tick data, Sortino ratio, Profit Factor, Max Drawdown underwater curve computations, fee and slippage simulations. |
| [`tests/market-service.test.ts`](file:///d:/DreamPulse/backend/tests/market-service.test.ts) | **9** | 🟢 Live / Local | Somnia on-chain CLOB order book polling, GraphQL indexer query parsing, anomaly detection (spread/staleness/mispricing), Binance spot ticker ingestion, and fallback market generation. |
| [`tests/websocket.test.ts`](file:///d:/DreamPulse/backend/tests/websocket.test.ts) | **8** | 🔵 Local Integration | Telemetry WebSocket gateway, batched ticks (50ms rate), depth ladders, agent thoughts, PnL updates, and high-frequency market emitter. |
| [`tests/llm.test.ts`](file:///d:/DreamPulse/backend/tests/llm.test.ts) | **7** | 🔵 Local Integration | Groq Qwen 3.8 multi-key round-robin rotation, persistent key index, structured reasoning thoughts with deterministic quantitative fallback, and exclusive Google Gemini Strategy Studio isolation. |
| [`tests/social-copy.test.ts`](file:///d:/DreamPulse/backend/tests/social-copy.test.ts) | **6** | 🔵 Local Unit | Autonomous forecaster social mirror trading, active target tracking, real-time trade fanout to copiers, per-forecaster `maxTradeSize` position clamping, 24h rolling `dailyVolumeCap` reset & enforcement, and spend tracking serialization. |
| [`tests/custom-agent.test.ts`](file:///d:/DreamPulse/backend/tests/custom-agent.test.ts) | **5** | 🔵 Local Unit | Custom agent lifecycle (creation, deployment, pauses, settlements), starter template loading, and dedicated tUSDC allowance depletion tracking. |
| [`tests/navigation.test.ts`](file:///d:/DreamPulse/backend/tests/navigation.test.ts) | **5** | 🔵 Local Unit | Universal URL hash routing, deep-link profile parsing, and tab navigation state persistence. |
| [`tests/bootstrap-lifecycle.test.ts`](file:///d:/DreamPulse/backend/tests/bootstrap-lifecycle.test.ts) | **5** | 🔵 Local Integration | Express server lifecycle, CORS origin filters, requestLogger, and root health check. |
| [`tests/base-agent.test.ts`](file:///d:/DreamPulse/backend/tests/base-agent.test.ts) | **3** | 🔵 Local Unit | `BaseAgent` abstract class lifecycle, risk validation limits (single trade cap, cumulative daily cap, expiration check), and thought log events. |
| [`tests/setup.test.ts`](file:///d:/DreamPulse/backend/tests/setup.test.ts) | **2** | 🟢 Live / Local | Environment configuration sanity check, Somnia Shannon network (Chain ID `50312`), and contract constants validation. |
| **Total** | **302** | **All 3 Tiers** | **100% Passing across 22 test suites with zero failures and zero `any` types** |

### Test Suite Execution Output
```
 RUN  v3.2.7 D:/DreamPulse/backend

 ✓ tests/auth-middleware.test.ts (26 tests)
 ✓ tests/quantitative.test.ts (34 tests)
 ✓ tests/price-feed-operator.test.ts (12 tests)
 ✓ tests/backtest.test.ts (10 tests)
 ✓ tests/bootstrap-lifecycle.test.ts (5 tests)
 ✓ tests/base-agent.test.ts (3 tests)
 ✓ tests/custom-agent.test.ts (5 tests)
 ✓ tests/navigation.test.ts (5 tests)
 ✓ tests/websocket.test.ts (8 tests)
 ✓ tests/settlement.test.ts (14 tests)
 ✓ tests/analytics-anomaly.test.ts (13 tests)
 ✓ tests/custom-evaluator-runner.test.ts (12 tests)
 ✓ tests/setup.test.ts (2 tests)
 ✓ tests/market-service.test.ts (9 tests)
 ✓ tests/leaderboard.test.ts (15 tests)
 ✓ tests/agents.test.ts (20 tests)
 ✓ tests/config-bootstrap.test.ts (18 tests)
 ✓ tests/api.test.ts (34 tests)
 ✓ tests/llm.test.ts (7 tests)
 ✓ tests/order-service.test.ts (25 tests)
 ✓ tests/social-copy.test.ts (6 tests)
 ✓ tests/session.test.ts (19 tests)

 Test Files  22 passed (22)
      Tests  302 passed (302)
   Duration  26.12s
```
---

## 2–3 Minute Demo Video Walkthrough

<p align="center">
  <a href="https://youtu.be/SW0iNoZHMzw">
    <img src="https://img.shields.io/badge/YouTube-Watch%20Demo%20Video%20(2m%2055s)-red?style=for-the-badge&logo=youtube&logoColor=white" alt="Watch Demo Video" />
  </a>
</p>

* **Direct Video URL**: [https://youtu.be/SW0iNoZHMzw](https://youtu.be/SW0iNoZHMzw)
* **Duration**: ~2 Minutes 55 Seconds (strictly within the hackathon's 2–3 minute requirement)
* **Demonstrated Capabilities**:
  1. **Non-Custodial Session Delegation**: 1-click batch authorization across rolling pools via `BatchApprove.sol` & `OperatorPermissionsRegistry` with zero custody transfer.
  2. **Pro CLOB Trade Terminal & AI Alpha Copilot**: Visual binary settlement chart, strike price lines, Black-Scholes mathematical edge detection, and 1-click execution.
  3. **Visual Strategy Studio & Quantitative Backtester**: No-code sentence rule AST builder with 14 indicators, dedicated Google Gemini copilot, and Binance historical backtesting.
  4. **Autonomous Multi-Agent Swarms & Sweeper**: Protocol vs. Personal Swarms (`Volt`, `Oracle`, `Titan`), real-time sub-50ms WebSocket telemetry, and zero-loss automated payout sweeping.
  5. **Swarm Arena & Social Alpha**: Dual-track leaderboards, 1-click strategy cloning, and Proof-of-Alpha cards.

---

## Future Roadmap Beyond Hackathon

1. **Mainnet Somnia Deployment**: Transition all contracts from Shannon Testnet to Somnia Mainnet upon launch.
2. **Multi-Asset Volatility Surfaces**: Expand beyond BTC/USD and ETH/USD to SOL, SOMNIA, and commodity event contracts.
3. **Cross-Chain Collateral Bridging**: Seamless 1-click deposits from Arbitrum, Base, and Ethereum into Somnia Shannon tUSDC.
4. **Decentralized Strategy Marketplace**: Allow strategy creators to tokenize and monetize their custom agents with performance fee revenue splits.
5. **Mobile Progressive Web App (PWA)**: Full tactile mobile trade terminal with biometric session signatures and push notification alerts.

---

## License & Acknowledgements

* **License**: MIT License — see [LICENSE](LICENSE) for details.
* **Built With**:
  * [Somnia Network](https://somnia.network) — Ultra-High Performance Layer 1 (Chain ID `50312`)
  * [DreamDEX](https://dreamdex.io) — Next-Generation Prediction Market CLOB Protocol
  * [@somnia-chain/markets-sdk](https://www.npmjs.com/package/@somnia-chain/markets-sdk)
  * [Groq Cloud](https://groq.com) & [Google DeepMind Gemini](https://ai.google.dev)
  * [Viem](https://viem.sh) & [Supabase](https://supabase.com)

---

<p align="center">
  <strong>Built with passion for the Somnia × DreamDEX Event Contracts Hackathon (Aug 25 – Sep 8).</strong>
  <br />
  <em>Accelerating the future of decentralized prediction markets with autonomous intelligence.</em>
</p>
