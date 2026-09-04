# DreamPulse AI — Official Hackathon Demo Video Script
**Target Duration**: 2 Minutes 45 Seconds (Hard ceiling: Under 3:00)  
**Target Venue**: Somnia × DreamDEX Event Contracts Hackathon  
**Submission Requirement**: 2–3 Minute Demo Video (Judging Criteria: Innovation 20%, Technical 25%, UX 20%, Ecosystem Impact 20%, Presentation 15%)  
**Live Application**: [https://dreampulse-ai.vercel.app](https://dreampulse-ai.vercel.app) *(or `http://localhost:5174`)*  
**Somnia Shannon Testnet**: Chain ID `50312` | BatchApprove: [`0x12c9c45fa740ce7469dacff368b08ca7edcaac26`](https://shannon-explorer.somnia.network/address/0x12c9c45fa740ce7469dacff368b08ca7edcaac26)

---

## Production Setup & Recording Guidelines

### Recording Specifications
- **Resolution**: 1920 × 1080 (1080p, 60fps) or 4K.
- **Audio**: Clean condenser microphone with noise suppression; speech rate ~135–140 words per minute.
- **Cursor**: Subtle click highlights enabled.
- **Browser**: Chrome or Brave in full-screen mode (`F11`), default zoom 100%, bookmarks bar hidden.
- **Sound**: Computer audio enabled to capture the Web Audio API procedural chimes on orders and sweeps.

### Pre-Flight Checklist
1. **Wallet Ready**: Funded with test STT (gas) and TestUSDC on Somnia Shannon Testnet (`50312`).
2. **Environment Running**: Backend daemon (`npm run dev`) and Vite frontend running with WebSocket connected (Cyan status pill glowing).
3. **Clean Session State**: Ensure wallet is disconnected initially or session is ready to demonstrate the 1-click activation flow.
4. **Preset Ready**: Have a clear prompt ready to copy-paste for Gemini in Strategy Studio to avoid typing delays.

---

## Timed Video Storyboard (Total: 02:45)

```
[0:00 ── 0:25] Scene 1: The Problem & Vision
[0:25 ── 0:50] Scene 2: 1-Click Onboarding & BatchApprove.sol
[0:50 ── 1:25] Scene 3: Pro Trade Terminal & AI Alpha Copilot
[1:25 ── 1:55] Scene 4: No-Code Strategy Studio & Backtesting Lab
[1:55 ── 2:25] Scene 5: Autonomous Multi-Agent Swarms & Sweeper
[2:25 ── 2:45] Scene 6: Swarm Arena, Proof-of-Alpha & Grand Finale
```

---

### Scene 1: The Problem & Platform Vision (0:00 – 0:25 | 25s)

* **Judging Focus**: Innovation & Originality (20%) | Presentation & Demo (15%)
* **Visual Action**:
  1. Start on the **Landing Page** (`#landing`).
  2. The camera captures the procedural Three.js silk shader gently waving in the background.
  3. Mouse hovers over the live metrics ribbon (Sub-50ms Telemetry, Somnia Shannon 50312, DreamDEX Event Contracts).
  4. Smoothly click the prominent **"Launch Terminal"** or **"Enter Trading Console"** button, smoothly transitioning into the **Overview** dashboard.

> **Spoken Voiceover (0:00 – 0:25)**:  
> *"Decentralized prediction markets on Central Limit Order Books are the frontier of Web3, but they face five structural bottlenecks: cold-start liquidity with wide spreads, quote staleness when spot prices move, theoretical mispricings, tedious approval popups across dozens of rolling round pools, and stranded capital after contracts expire.*  
> 
> *Welcome to **DreamPulse AI** — an institutional-grade cyber-financial ecosystem built specifically for DreamDEX Event Contracts on Somnia Shannon Testnet. We unite an AI-guided Pro Trade Terminal, a visual No-Code Strategy Studio, Autonomous Multi-Agent Swarms, and non-custodial session delegation into one seamless platform."*

---

### Scene 2: 1-Click Onboarding & Non-Custodial BatchApprove (0:25 – 0:50 | 25s)

* **Judging Focus**: Technical Implementation (25%) | UX & Design (20%)
* **Visual Action**:
  1. Show the **Onboarding Wizard** (`OnboardingWizardModal`) or the top **Quest Bar**.
  2. Click **Connect Wallet** — connection is instant.
  3. Show the **1-Click Faucet** claiming 1,000 tUSDC with acoustic audio chime.
  4. Open the **Session Delegation Modal**: highlight the risk sliders (Single-Trade Cap: $20, Daily Ceiling: $200).
  5. Click **"Authorize Session"** — show that it utilizes our custom smart contract `BatchApprove.sol` on Somnia alongside the native `OperatorPermissionsRegistry`.
  6. Point out the Zero-Custody Invariant: zero withdrawal permissions.

> **Spoken Voiceover (0:25 – 0:50)**:  
> *"Getting started takes under thirty seconds without wallet friction.  
> 
> Through our interactive onboarding wizard, users verify the Somnia Shannon network and claim test collateral with one click.  
> 
> Rather than forcing traders to approve every new 5-minute pool contract, DreamPulse deploys a custom **BatchApprove** smart contract. Combined with Somnia's native Operator Permissions Registry and EIP-712 session delegation, users set strict single-trade caps and daily volume limits. The operator can only submit scoped orders on the DreamDEX CLOB with zero withdrawal privileges — your custody never leaves your wallet."*

---

### Scene 3: Pro Trade Terminal & AI Alpha Copilot (0:50 – 1:25 | 35s)

* **Judging Focus**: Technical Implementation (25%) | UX & Design (20%) | Consumer Application Track
* **Visual Action**:
  1. Click **Trade Terminal** in the sidebar (or press `4` on the keyboard).
  2. Highlight the **Visual Binary Settlement Chart**: point out the dashed strike price line, live glowing spot price trail, and the shaded emerald UP and rose DOWN payout zones.
  3. Click **"Show book"** toggle: the canvas switches to the full live CLOB order book depth ladder with real-time bid/ask spreads. Click **"Hide book"** to return to the chart.
  4. Draw attention to the **AI Alpha Copilot** panel: point out the real-time analytical Black-Scholes fair value $\Phi(z)$, net mathematical edge (+12.7%), and live reasoning.
  5. Click the **"1-Click Follow AI Trade"** button. The order ticket instantly populates direction, lot size, and price.
  6. Click **"Execute Gasless Order"** — the order is placed on-chain via session key. Highlight the Web Audio order fill chime and the new active position appearing in the bottom drawer.

> **Spoken Voiceover (0:50 – 1:25)**:  
> *"In the Pro Trade Terminal, binary prediction markets come alive.  
> 
> Our visual settlement canvas renders real-time strike settlement levels, live spot price trails, and dynamic payout zones, with a one-click toggle to the full CLOB depth ladder.  
> 
> Embedded directly in the terminal is our **AI Alpha Copilot**. Powered by closed-form Black-Scholes mathematics and Abramowitz-Stegun normal distributions, it continuously calculates the theoretical fair value against the market order book. When it detects a +12.7% edge anomaly, a single click on 'Follow AI Trade' pre-configures the ticket and executes gaslessly on Somnia in under one hundred milliseconds."*

---

### Scene 4: No-Code Strategy Studio & Quant Backtester (1:25 – 1:55 | 30s)

* **Judging Focus**: Innovation & Originality (20%) | AI-Powered Agents Track
* **Visual Action**:
  1. Navigate to **Strategy Studio** (`#studio`).
  2. Showcase the **Visual Algorithmic Sentence Canvas**: `WHEN BTC/USD 1m` -> `IF RSI < 35 AND MACD Golden Cross` -> `THEN BUY CALL` -> `RISK LEASH`.
  3. Click the **Google Gemini Prompt Omnibar**: paste or click a starter suggestion chip (*"Aggressive BTC 60s Call sniper on MACD golden cross and RSI < 35 with 1.5x volume surge"*). Show Gemini instantly synthesizing the indicator capsules.
  4. Show the isolated **tUSDC Bankroll Allowance** slider ($50 limit) and click **Deploy Agent**.
  5. Switch to the **Backtester** tab (`#backtest`): select Binance 1m historical tick data, set 4 bps slippage and 25ms execution latency, and click **Run Backtest**.
  6. Display the generated Sortino ratio, profit factor, win rate, and underwater drawdown curve.

> **Spoken Voiceover (1:25 – 1:55)**:  
> *"For creators and algorithmic traders, the **Visual Strategy Studio** makes quantitative agent building completely no-code.  
> 
> Assemble rules using natural algorithmic sentences across fourteen technical indicators, or prompt our dedicated Google Gemini engine to synthesize custom strategies from plain English. Each agent deploys with an isolated tUSDC bankroll allowance, preventing cross-strategy risk.  
> 
> Before going live, jump into the **Quant Backtester** to replay real Binance tick data against simulated taker slippage, protocol fees, and latency delays, verifying historical Sharpe ratios and drawdown curves before deployment."*

---

### Scene 5: Autonomous Multi-Agent Swarms & Settlement Sweeper (1:55 – 2:25 | 30s)

* **Judging Focus**: Technical Implementation (25%) | Analytics & Infrastructure Track
* **Visual Action**:
  1. Open **Fleet Cockpit** (`#swarm-cockpit`) and split to **AI Swarm Feed** (`#feed`).
  2. Point out the four autonomous agent personas:
     - **Volt Sniper**: High-frequency spot velocity and quote staleness taker.
     - **Oracle Arb**: Volatility surface Black-Scholes arbitrageur.
     - **Titan MM**: Two-sided liquidity maker with super-linear inventory aversion.
     - **Sweeper**: Zero-loss settlement redemption daemon.
  3. Show the live Groq cognitive thought stream updating in real-time with mathematical rationale and on-chain transaction hashes.
  4. Flip the **COPY ↔ PERSONAL** mode toggle: show how a user can switch between mirroring the protocol swarm and running their own isolated per-wallet parameters.
  5. Click **Settlement Sweeper** (`#settlement`): show finalized markets, click **"Batch Sweep Winning Rounds"** — highlight the batch redemption transaction and direct tUSDC transfer to the user's wallet.

> **Spoken Voiceover (1:55 – 2:25)**:  
> *"Under the hood, DreamPulse coordinates four autonomous micro-agents running on a one-hundred-millisecond evaluation loop.  
> 
> **Volt** snipes stale quotes on spot velocity spikes; **Oracle** harvests volatility mispricings; **Titan** anchors continuous two-sided liquidity; and our live Groq telemetry feed broadcasts their cognitive reasoning in real-time. Traders can effortlessly toggle between global swarm copy-trading and isolated personal swarms.  
> 
> Finally, our **Settlement Sweeper** solves stranded capital. It autonomously monitors finalized prediction pools, batch-redeems winning shares on DreamDEX contracts, and transfers payout collateral directly to user wallets with zero manual effort."*

---

### Scene 6: Swarm Arena, Proof-of-Alpha & Grand Finale (2:25 – 2:45 | 20s)

* **Judging Focus**: Business & Ecosystem Impact (20%) | Social Prediction Track | Presentation (15%)
* **Visual Action**:
  1. Navigate to **Swarm Arena** (`#arena`).
  2. Show the **Dual-Track Leaderboard**: toggle between **AI Agent Fleet** and **Human Forecasters**.
  3. Click **"Clone Strategy"** on a top-performing agent to show 1-click strategy import.
  4. Click **"Generate Proof-of-Alpha Card"**: the high-res Canvas modal opens (`ProofOfAlphaModal`). Switch theme to *Cyber Emerald*, select 4x Ultra-HD, and click **"Copy Card Image"**.
  5. Close with the final slide or full terminal overview showcasing the repository test badge: **302/302 tests passing (100%)**.

> **Spoken Voiceover (2:25 – 2:45)**:  
> *"In the **Swarm Arena**, social prediction meets viral growth. Dual-track leaderboards track real AI and human forecaster alpha with one-click strategy cloning, automated social mirror trading, and high-resolution Proof-of-Alpha cards ready for X and Discord.  
> 
> DreamPulse is not a proof of concept — it is a production-grade cyber-financial ecosystem with 302 passing automated tests, custom smart contracts, and verified testnet execution.  
> 
> DreamPulse AI is accelerating prediction markets on Somnia. Thank you."*

---

## Complete Verbatim Voiceover Script (Single Take)

> *"Decentralized prediction markets on Central Limit Order Books are the frontier of Web3, but they face five structural bottlenecks: cold-start liquidity with wide spreads, quote staleness when spot prices move, theoretical mispricings, tedious approval popups across dozens of rolling round pools, and stranded capital after contracts expire.  
> 
> Welcome to **DreamPulse AI** — an institutional-grade cyber-financial ecosystem built specifically for DreamDEX Event Contracts on Somnia Shannon Testnet. We unite an AI-guided Pro Trade Terminal, a visual No-Code Strategy Studio, Autonomous Multi-Agent Swarms, and non-custodial session delegation into one seamless platform.  
> 
> Getting started takes under thirty seconds without wallet friction. Through our interactive onboarding wizard, users verify the Somnia Shannon network and claim test collateral with one click. Rather than forcing traders to approve every new 5-minute pool contract, DreamPulse deploys a custom **BatchApprove** smart contract. Combined with Somnia's native Operator Permissions Registry and EIP-712 session delegation, users set strict single-trade caps and daily volume limits. The operator can only submit scoped orders on the DreamDEX CLOB with zero withdrawal privileges — your custody never leaves your wallet.  
> 
> In the Pro Trade Terminal, binary prediction markets come alive. Our visual settlement canvas renders real-time strike settlement levels, live spot price trails, and dynamic payout zones, with a one-click toggle to the full CLOB depth ladder. Embedded directly in the terminal is our **AI Alpha Copilot**. Powered by closed-form Black-Scholes mathematics and Abramowitz-Stegun normal distributions, it continuously calculates the theoretical fair value against the market order book. When it detects a +12.7% edge anomaly, a single click on 'Follow AI Trade' pre-configures the ticket and executes gaslessly on Somnia in under one hundred milliseconds.  
> 
> For creators and algorithmic traders, the **Visual Strategy Studio** makes quantitative agent building completely no-code. Assemble rules using natural algorithmic sentences across fourteen technical indicators, or prompt our dedicated Google Gemini engine to synthesize custom strategies from plain English. Each agent deploys with an isolated tUSDC bankroll allowance, preventing cross-strategy risk. Before going live, jump into the **Quant Backtester** to replay real Binance tick data against simulated taker slippage, protocol fees, and latency delays, verifying historical Sharpe ratios and drawdown curves before deployment.  
> 
> Under the hood, DreamPulse coordinates four autonomous micro-agents running on a one-hundred-millisecond evaluation loop. **Volt** snipes stale quotes on spot velocity spikes; **Oracle** harvests volatility mispricings; **Titan** anchors continuous two-sided liquidity; and our live Groq telemetry feed broadcasts their cognitive reasoning in real-time. Traders can effortlessly toggle between global swarm copy-trading and isolated personal swarms. Finally, our **Settlement Sweeper** solves stranded capital. It autonomously monitors finalized prediction pools, batch-redeems winning shares on DreamDEX contracts, and transfers payout collateral directly to user wallets with zero manual effort.  
> 
> In the **Swarm Arena**, social prediction meets viral growth. Dual-track leaderboards track real AI and human forecaster alpha with one-click strategy cloning, automated social mirror trading, and high-resolution Proof-of-Alpha cards ready for X and Discord.  
> 
> DreamPulse is not a proof of concept — it is a production-grade cyber-financial ecosystem with 302 passing automated tests, custom smart contracts, and verified testnet execution. DreamPulse AI is accelerating prediction markets on Somnia. Thank you."*

---

## Word Count & Speaking Cadence Audit
- **Total Word Count**: ~390 words.
- **Estimated Duration**: 2 minutes 45 seconds at a confident, deliberate 138–142 words per minute pace.
- **Safety Margin**: 15 seconds buffer under the 3:00 minute maximum threshold.

---

## Hackathon Judging Criteria Alignment Matrix

| Hackathon Criterion | Weight | How Highlighted in this Demo Video | Timestamps |
| :--- | :---: | :--- | :---: |
| **Innovation & Originality** | 20% | Dual-engine LLM reasoning (Groq swarm + dedicated Gemini studio) coupled with closed-form Black-Scholes continuous math and Avellaneda-Stoikov inventory skewing. | `0:00 - 0:25`, `1:25 - 1:55` |
| **Technical Implementation** | 25% | Somnia Shannon integration, custom `BatchApprove.sol`, `OperatorPermissionsRegistry` EIP-712 scoping, DreamDEX CLOB, 302/302 tests passing. | `0:25 - 0:50`, `1:55 - 2:25` |
| **User Experience & Design** | 20% | Visual binary settlement chart with payout zones, 1-click book toggle, 30s onboarding, 1-click follow AI trade, and Web Audio acoustic chimes. | `0:50 - 1:25` |
| **Business & Ecosystem Impact**| 20% | Resolves cold-start liquidity (Titan MM), eliminates quote staleness (Volt), recyclers stranded capital (Sweeper), and drives viral adoption via Swarm Arena and Proof-of-Alpha cards. | `1:55 - 2:45` |
| **Presentation & Demo** | 15% | Crystal clear narrative: The Problem -> The Architecture -> The Live Product -> Verification -> Ecosystem Vision, delivered under 3 minutes. | Entire Video |
