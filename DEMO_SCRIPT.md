# DreamPulse — Official Hackathon Demo Video Script
**Target Duration**: ~2 Minutes 20 Seconds (Comfortably under the 3:00 minute hard ceiling)  
**Total Word Count**: ~285 Words (~130–140 words/min = ~2m 10s of natural speech + 15s visual breathing room)  
**Target Venue**: Somnia × DreamDEX Event Contracts Hackathon  
**Submission Requirement**: 2–3 Minute Demo Video (Judging: Innovation 20%, Technical 25%, UX 20%, Ecosystem Impact 20%, Presentation 15%)  
**Live Application**: [https://dreampulse-ai.vercel.app](https://dreampulse-ai.vercel.app) *(or `http://localhost:5174`)*  
**Somnia Shannon Testnet**: Chain ID `50312` | BatchApprove: [`0x12c9c45fa740ce7469dacff368b08ca7edcaac26`](https://shannon-explorer.somnia.network/address/0x12c9c45fa740ce7469dacff368b08ca7edcaac26)

---

## Timed Video Storyboard (Total: ~02:25)

```
[0:00 ── 0:18] Scene 1: The Problem & Platform Solution (~18s | 31 words)
[0:18 ── 0:42] Scene 2: Non-Custodial Onboarding & BatchApprove (~24s | 39 words)
[0:42 ── 1:18] Scene 3: Pro Trade Terminal & AI Copilot (~36s | 63 words)
[1:18 ── 1:48] Scene 4: No-Code Strategy Studio & Backtester (~30s | 56 words)
[1:48 ── 2:15] Scene 5: Autonomous Multi-Agent Swarms & Sweeper (~27s | 56 words)
[2:15 ── 2:30] Scene 6: Swarm Arena & Grand Finale (~15s | 35 words)
```

---

### Scene 1: The Problem & Platform Solution (0:00 – 0:18 | ~18s)

* **Judging Focus**: Innovation & Originality (20%) | Presentation (15%)
* **Visual Action**:
  1. Start on the **Landing Page** with the procedural Three.js silk background.
  2. Smoothly click **"Enter Console"** / **"Launch Terminal"**, transitioning into the live **Overview** dashboard.

> **Voiceover (31 words)**:  
> *"On-chain prediction markets suffer from wide spreads, stale quotes, and constant approval popups. DreamPulse solves this for DreamDEX and Somnia with an autonomous, multi-agent trading ecosystem and institutional execution terminal."*

---

### Scene 2: Non-Custodial Onboarding & BatchApprove (0:18 – 0:42 | ~24s)

* **Judging Focus**: Technical Implementation (25%) | UX & Design (20%)
* **Visual Action**:
  1. Open the **Session Delegation Modal** from the top status bar.
  2. Show the configurable risk bounds ($20 single-trade and $200 daily caps).
  3. Click **"Authorize Session"** — show custom `BatchApprove.sol` + Somnia `OperatorPermissionsRegistry` integration with zero withdrawal permissions.

> **Voiceover (39 words)**:  
> *"Onboarding takes seconds. In one seamless flow, traders authorize non-custodial session delegation. Our custom BatchApprove contract authorizes all rolling prediction pools at once, while Somnia's Operator Registry enforces strict trade and volume caps with zero withdrawal privileges. Custody never leaves your wallet."*

---

### Scene 3: Pro Trade Terminal & AI Alpha Copilot (0:42 – 1:18 | ~36s)

* **Judging Focus**: Technical Implementation (25%) | UX & Design (20%) | Consumer Application Track
* **Visual Action**:
  1. Navigate to **Trade Terminal** (`#trade`).
  2. Show the **Visual Binary Settlement Chart** (dashed strike line, live spot trail, emerald UP and rose DOWN payout zones).
  3. Click **"Show book"** toggle to reveal the CLOB depth ladder, then toggle back.
  4. Point to the **AI Alpha Copilot** displaying Black-Scholes fair value and a +12.7% edge anomaly.
  5. Click **"1-Click Follow AI Trade"** -> **"Buy UP"** with 1-click session execution (audio fill chime plays, position registers in bottom drawer).

> **Voiceover (63 words)**:  
> *"The Pro Trade Terminal brings binary contracts alive. Here is our visual settlement chart with strike levels and live payout zones, toggleable to the full CLOB order book in one click.*  
> 
> *Our AI Alpha Copilot continuously computes Black-Scholes fair value. When it spots a mispricing edge, one click auto-fills the ticket and executes directly on Somnia in under one hundred milliseconds without popup interruptions."*

---

### Scene 4: No-Code Strategy Studio & Quant Backtester (1:18 – 1:48 | ~30s)

* **Judging Focus**: Innovation & Originality (20%) | AI-Powered Agents Track
* **Visual Action**:
  1. Jump to **Strategy Studio** (`#studio`). Show the visual algorithmic sentence (`WHEN -> IF -> THEN -> RISK LEASH`).
  2. Click the **Google Gemini Omnibar** chip (*"Aggressive BTC 60s Call sniper on MACD golden cross and RSI < 35"*), showing instant AST rule synthesis.
  3. Set a $50 isolated tUSDC bankroll allowance and click **Deploy Agent**.
  4. Switch to **Backtester** tab (`#backtest`), click **"Run Backtest"** against Binance historical tick data, showing Sortino ratio and drawdown curves.

> **Voiceover (56 words)**:  
> *"In Strategy Studio, anyone can build algorithmic agents with zero code. Combine fourteen indicators into natural logic sentences, or prompt dedicated Google Gemini to generate strategies from English. Each agent runs with an isolated bankroll cap.*  
> 
> *Next, test it in the Backtester: replay Binance historical ticks against simulated slippage, protocol fees, and latency before going live."*

---

### Scene 5: Autonomous Multi-Agent Swarms & Settlement Sweeper (1:48 – 2:15 | ~27s)

* **Judging Focus**: Technical Implementation (25%) | Analytics & Infrastructure Track
* **Visual Action**:
  1. Switch to **Fleet Cockpit** & **AI Swarm Feed**.
  2. Highlight the 4 agent personas: **Volt** (momentum sniper), **Oracle** (volatility arb), **Titan** (two-sided liquidity maker), and **Sweeper** (settlement daemon).
  3. Show live Groq AI thoughts streaming in real-time.
  4. Toggle the **COPY ↔ PERSONAL** mode switch.
  5. Switch to **Settlement Sweeper** (`#settlement`), click **"Batch Sweep Winning Rounds"** — show direct tUSDC transfer to the user's wallet.

> **Voiceover (56 words)**:  
> *"Behind the scenes, DreamPulse has four autonomous agents running a 100-millisecond loop: Volt snipes stale quotes, Oracle trades volatility mispricings, Titan provides two-sided liquidity, and Groq streams their live reasoning. Traders can mirror the swarm or run isolated personal configs.*  
> 
> *And our Settlement Sweeper automatically batch-redeems winning shares from finalized pools, transferring payouts directly to your wallet."*

---

### Scene 6: Swarm Arena, Proof-of-Alpha & Grand Finale (2:15 – 2:30 | ~15s)

* **Judging Focus**: Business & Ecosystem Impact (20%) | Social Prediction Track | Presentation (15%)
* **Visual Action**:
  1. Open **Swarm Arena** (`#arena`). Show dual-track leaderboards (AI Fleet vs Human Forecasters).
  2. Click **"Generate Proof-of-Alpha Card"** (`ProofOfAlphaModal`), switch theme, copy card image.
  3. Close on the verified test suite badge: **302/302 tests passing (100%)**.

> **Voiceover (35 words)**:  
> *"In the Swarm Arena, track AI and forecaster leaderboards, clone winning strategies in one click, and export Proof-of-Alpha cards.*  
> 
> *With 302 automated tests passing and custom testnet contracts, DreamPulse accelerates the future of prediction markets on Somnia."*

---

## Complete Verbatim Voiceover Script (Teleprompter View)

> *"On-chain prediction markets suffer from wide spreads, stale quotes, and constant approval popups. DreamPulse solves this for DreamDEX and Somnia with an autonomous, multi-agent trading ecosystem and institutional execution terminal.  
> 
> Onboarding takes seconds. In one seamless flow, traders authorize non-custodial session delegation. Our custom BatchApprove contract authorizes all rolling prediction pools at once, while Somnia's Operator Registry enforces strict trade and volume caps with zero withdrawal privileges. Custody never leaves your wallet.  
> 
> The Pro Trade Terminal brings binary contracts alive. Here is our visual settlement chart with strike levels and live payout zones, toggleable to the full CLOB order book in one click. Our AI Alpha Copilot continuously computes Black-Scholes fair value. When it spots a mispricing edge, one click auto-fills the ticket and executes directly on Somnia in under one hundred milliseconds without popup interruptions.  
> 
> In Strategy Studio, anyone can build algorithmic agents with zero code. Combine fourteen indicators into natural logic sentences, or prompt dedicated Google Gemini to generate strategies from English. Each agent runs with an isolated bankroll cap. Next, test it in the Backtester: replay Binance historical ticks against simulated slippage, protocol fees, and latency before going live.  
> 
> Behind the scenes, four autonomous agents run a 100-millisecond loop: Volt snipes stale quotes, Oracle trades volatility mispricings, Titan provides two-sided liquidity, and Groq streams their live reasoning. Traders can mirror the swarm or run isolated personal configs. And our Settlement Sweeper automatically batch-redeems winning shares from finalized pools, transferring payouts directly to your wallet.  
> 
> In the Swarm Arena, track AI and forecaster leaderboards, clone winning strategies in one click, and export Proof-of-Alpha cards. With 302 automated tests passing and custom testnet contracts, DreamPulse accelerates the future of prediction markets on Somnia."*

---

## Duration & Word Count Verification

| Metric | Target | Actual | Status |
| :--- | :---: | :---: | :---: |
| **Total Words** | ~250–300 words | **285 words** | Perfect |
| **Speaking Time (@ 135 wpm)** | ~2m 00s – 2m 15s | **2 minutes 07 seconds** | Optimal |
| **Visual Pauses & Transitions** | ~15–20 seconds | **~18 seconds** | Natural |
| **Total Video Runtime** | Under 3:00 (Hard limit) | **~2 minutes 25 seconds** | Safe 35s Buffer |
