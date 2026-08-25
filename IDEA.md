# ⚡ DreamPulse AI
### *Autonomous Multi-Agent Swarm, Real-Time Edge Radar & Non-Custodial Copy-Vault for DreamDEX Event Contracts on Somnia*

---

## 🌟 1. Executive Summary

**DreamPulse AI** is the first autonomous, quantitative multi-agent trading ecosystem and high-frequency edge terminal purpose-built for **DreamDEX Event Contracts** on **Somnia Layer 1**. 

In high-speed binary prediction markets (5-minute, 15-minute, and 1-hour BTC/ETH windows), manual human trading cannot compete: mathematical probability pricing $\Phi(z)$, volatility tracking, order book staleness, and claim cycles move too fast. 

**DreamPulse AI** bridges this gap by combining:
1. **An Autonomous AI Agent Swarm:** Specialized quantitative agents running automated strategies (Staleness Arbitrage, Volatility Surface Arbitrage, Adaptive Market Making, and Auto-Settlement).
2. **Zero-Custody Session Key Delegation:** Enabling any user to 1-click delegate execution to an AI agent swarm via Somnia's `OperatorPermissionsRegistry`—with strict zero-withdrawal guarantees.
3. **High-Frequency Visual Edge Radar:** A terminal visualising live order books, implied probability versus fair mathematical value discrepancies, and on-chain agent reasoning in real time.
4. **Autonomous Sweeper & Compounder:** Eliminates the *"winnings are claimed, not received"* problem by auto-sweeping settled contracts and reinvesting collateral.

---

## 🎯 2. The Problem & Market Opportunity

| The Challenge | Why It Hurts DreamDEX / Users | How DreamPulse AI Solves It |
| :--- | :--- | :--- |
| **Rapid 5m/15m Expiries** | Retail traders cannot manually monitor and compute probabilities for short-window contracts continuously. | **Autonomous Swarm:** 24/7 automated agents evaluate price feeds, calculate drift, and execute in milliseconds. |
| **Pricing Inefficiency & Staleness** | When underlying spot (BTC/ETH) jumps, resting CLOB quotes lag, creating temporary mispricings. | **`Volt` Sniper Agent:** Detects spot drift and fires instant IOC orders to capture risk-free mathematical edge. |
| **Locked Winnings (Friction)** | Winnings are not pushed to wallets automatically; they must be actively redeemed, stranding capital across expired markets. | **`Sweeper` Engine:** Periodically queries `listBinaryMarkets({ status: "Finalized" })` and batch-claims payouts. |
| **Custody & Security Concerns** | Users are reluctant to give private keys or full wallet custody to automated bot services. | **Somnia Session Keys:** Non-custodial operator permissions (`placeLimit`/`cancelOrder` only, no withdrawals permitted). |
| **Fragmented / Plain Interfaces** | Most prediction UIs are simple binary cards lacking depth charts, heatmaps, and quantitative telemetry. | **Cyber-Terminal UI:** Real-time order book depth, probability heatmaps, and live transparent AI reasoning streams. |

---

## 🏗️ 3. Architecture & Core Modules

```
                                    ┌──────────────────────────────────────┐
                                    │        DreamPulse Web Terminal       │
                                    │   (Live Edge Radar & Swarm Cockpit)  │
                                    └──────────────────┬───────────────────┘
                                                       │
                     ┌─────────────────────────────────┴─────────────────────────────────┐
                     ▼                                                                   ▼
       ┌───────────────────────────┐                                       ┌───────────────────────────┐
       │     AI Multi-Agent Swarm  │                                       │   Non-Custodial Vaults    │
       │   (Quantitative Engine)   │                                       │  (Session Key Delegation) │
       └─────────────┬─────────────┘                                       └─────────────┬─────────────┘
                     │                                                                   │
 ┌───────────────────┴───────────────────┐                                 ┌─────────────┴─────────────┐
 │ ⚡ Volt: Spot Staleness Sniper        │                                 │ • 1-Click Session Key     │
 │ 📐 Oracle: Volatility Surface Arb     │                                 │ • Strict Zero-Withdrawal  │
 │ 🛡️ Titan: Adaptive Market Maker       │                                 │ • Custom Risk Guardrails  │
 │ 🔄 Sweeper: Auto-Claim & Compounder   │                                 │ • Dynamic Capital Alloc   │
 └───────────────────┬───────────────────┘                                 └─────────────┬─────────────┘
                     │                                                                   │
                     └─────────────────────────────────┬─────────────────────────────────┘
                                                       ▼
                                     ┌───────────────────────────────────┐
                                     │  DreamDEX Event Contracts (CLOB)  │
                                     │   + Somnia L1 (Shannon Testnet)   │
                                     │   + Prophecy Oracle Settlement    │
                                     └───────────────────────────────────┘
```

---

### 🤖 Module 1: The Multi-Agent Swarm
* **`Volt` (The Staleness Sniper):**
  - Monitors high-speed spot tickers against DreamDEX Event Contract resting quotes.
  - If spot moves $+0.3\%$ but the resting YES ask is still priced at $0.45$ (fair is $0.75$), it executes an immediate IOC taker order to harvest the latency gap.
* **`Oracle` (The Mathematical Volatility Arb):**
  - Prices binary contracts using the standard normal cumulative distribution $\Phi(z)$ where $z = \frac{\ln(S/K)}{\sigma \sqrt{T}}$.
  - Compares model probability against the order book mid, taking high-probability positive expected-value ($+EV$) positions.
* **`Titan` (The Adaptive Market Maker):**
  - Quotes two-sided post-only limit orders around fair value.
  - Dynamically skews bids/asks based on inventory balance to maximize captured spread while mitigating adverse selection.
* **`Sweeper` (Auto-Claim & Settlement Engine):**
  - Continuously identifies finalized markets where winnings reside and batch-claims proceeds back to the vault or wallet.

---

### 🔑 Module 2: Non-Custodial Session-Key Vaults
- Users sign a one-time transaction using Somnia’s `OperatorPermissionsRegistry`.
- Grants permissions **only** to the designated agent address for `placeOrderFor` and `cancelOrderFor`.
- The agent **cannot** transfer, withdraw, or touch any other assets.
- Users can revoke access or set maximum drawdown and trade-size caps at any time.

---

### 📊 Module 3: Real-Time Edge Radar Terminal
- **Market Matrix:** Live overview of all active BTC and ETH 5m, 15m, and 1h Event Contracts on Somnia testnet.
- **Edge Radar & Discrepancy Heatmap:** Highlights mispriced contracts where market price deviates from quantitative fair value.
- **Visual Order Book Depth:** Real-time bid/ask ladders with 1-click execution.
- **AI Live Thought Stream:** Transparent feed showing real-time agent evaluations, confidence scores, and transaction receipts.

---

### 🧪 Module 4: Strategy Studio & Backtest Simulator
- Integrated with `@dreamdex-bot-kit/backtest`.
- Enables users to test custom rule sets against historical contract series before activating live agent execution.

---

## 🏆 4. Hackathon Judging Matrix Alignment

| Criteria | Weight | How DreamPulse AI Wins |
| :--- | :---: | :--- |
| **Innovation & Originality** | **20%** | Novel synthesis of autonomous AI agents, quantitative event pricing $\Phi(z)$, staleness arbitrage, and session-key non-custodial delegation. |
| **Technical Implementation** | **25%** | Deep integration with `@dreamdex-bot-kit/ec-core`, `@somnia-chain/markets-sdk`, Somnia testnet contracts, WebSocket feeds, and quantized lot/tick execution. |
| **User Experience & Design** | **20%** | Cutting-edge high-frequency trading terminal with rich animations, reactive telemetry, depth visualizers, and 1-click onboarding. |
| **Business & Ecosystem Impact**| **20%** | Directly stimulates liquidity, tightens spreads, drives transaction volume on Somnia L1, and solves the unclaimed collateral friction. |
| **Presentation & Demo** | **15%** | Polished narrative, clear demo video showing live on-chain trades, and comprehensive SDK feedback documentation. |

---

## 🛠️ 5. Technical Stack

- **Blockchain:** Somnia Shannon Testnet (`Chain ID: 50312`, RPC: `https://dream-rpc.somnia.network`)
- **Protocol:** DreamDEX Event Contracts & Prophecy Oracle
- **SDKs & Libraries:** `@somnia-chain/markets-sdk`, `@dreamdex-bot-kit/ec-core`, `viem` / `ethers`
- **Frontend / Terminal:** Modern Reactive Web Application with high-performance Vanilla CSS & TypeScript/React
- **Agent Backend:** Node.js / TypeScript quantitative engine with automated workers for strategy execution and settlement sweeps
- **Security:** Non-custodial session keys (`OperatorPermissionsRegistry`)

---

## 📋 6. Submission Deliverables

1. **Working Prototype:** Fully functional on Somnia Shannon Testnet.
2. **GitHub Repository:** Well-documented, clean codebase with modular architecture.
3. **2–3 Minute Demo Video:** Highlighting problem, live agent trading, session key delegation, and settlement sweeping.
4. **Developer Feedback Report:** A constructive feedback document for the DreamDEX SDK and docs team detailing developer ergonomics and protocol insights.
5. **Pitch Deck:** Clean presentation summarizing the vision and ecosystem impact.
