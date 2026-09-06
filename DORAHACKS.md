# DreamPulse

DreamPulse is an institutional-grade cyber-financial trading ecosystem for DreamDEX Event Contracts on the Somnia Shannon Testnet. It combines a professional CLOB terminal, AI-assisted trading, no-code strategy creation, quantitative simulation, autonomous trading swarms, social prediction tools, and non-custodial session delegation in one application.

## Hackathon Links

- **Live application:** [dreampulse-ai.vercel.app](https://dreampulse-ai.vercel.app/)
- **Auditable live cockpit:** [Swarm Cockpit](https://dreampulse-ai.vercel.app/#cockpit)
- **Demo video:** [2 minutes 55 seconds on YouTube](https://youtu.be/SW0iNoZHMzw)
- **Machine-readable evidence:** [`evidence.json`](./evidence.json)
- **Repository:** [github.com/zaikaman/DreamPulse](https://github.com/zaikaman/DreamPulse)
- **Somnia Shannon explorer:** [shannon-explorer.somnia.network](https://shannon-explorer.somnia.network)

Network: Somnia Shannon Testnet, Chain ID `50312`.

## Why DreamPulse

DreamDEX-style CLOB prediction markets face recurring problems: cold-start liquidity, stale quotes, probability mispricing, repeated approvals for rolling pools, and capital stranded after settlement. DreamPulse addresses each problem directly:

| Market problem | DreamPulse solution |
| --- | --- |
| Empty books and wide spreads | Titan MM continuously posts inventory-aware two-sided liquidity. |
| Spot moves faster than quotes | Volt Sniper detects short-term spot velocity and stale CLOB prices. |
| Binary contracts are difficult to price & drift fades | Oracle Arb compares market odds with Black-Scholes fair value and realized volatility, guarded by a 3-layer quantitative defense against spot drift. |
| Every rolling pool needs approvals | `BatchApprove.sol` batches multi-pool approvals and delegation. |
| Winning positions require manual claims | Sweeper detects finalized markets, batches redemptions, and sends tUSDC directly to wallets. |

## Product

### Pro Trade Terminal

The `#trade` terminal provides live market switching, spot prices, synchronized settlement countdowns, binary settlement charts, CLOB depth, order tickets, positions, resting orders, and execution history. The AI Alpha Copilot shows theoretical fair value, market odds, mathematical edge, and structured rationale. Users can follow a recommendation with one click or place MARKET and LIMIT orders manually.

### Visual Strategy Studio

The `#studio` workflow lets users create agents without writing code:

1. Choose an asset and timeframe.
2. Combine indicator conditions with AND or OR logic.
3. Configure CALL/PUT direction, duration, MARKET or LIMIT execution, and pricing.
4. Add risk controls such as loss cooldowns, drawdown breakers, expiry buffers, take-profit locks, and position sizing.

The studio supports RSI, MACD, Stochastic, Bollinger Bands, EMA, SMA, VWAP, volume surge, ADX, ATR, CCI, Williams %R, and price drift. A dedicated Google Gemini integration converts natural-language ideas into structured strategy definitions. Each custom agent can be deployed, paused, and assigned an isolated tUSDC allowance.

### Quantitative Backtester

The backtesting lab replays Binance historical candles at 1m, 5m, 15m, and 1h resolutions. It supports canonical swarm agents and custom rule ASTs while modeling slippage, maker/taker fees, and execution latency. Results include win rate, profit factor, expectancy, Sharpe, Sortino, and drawdown curves. Verified strategies can be deployed to the protocol swarm or to an isolated personal swarm.

### Autonomous Swarms

The daemon evaluates markets on a high-frequency cadence and combines quantitative pricing, risk controls, LLM telemetry, and direct DreamDEX execution.

- **Volt Sniper:** momentum taker that reacts to short-term spot moves and stale quotes.
- **Oracle Arb:** volatility-surface arbitrageur using Black-Scholes $\Phi(d_2)$, EWMA volatility, and a 3-layer quantitative defense (horizon filter $\le 15$m, trend gating, and asymmetry margin collar).
- **Titan MM:** adaptive two-sided market maker with inventory skew and self-trade protection.
- **Sweeper:** automated market-resolution watcher and payout daemon.

Users can remain in `COPY` mode and mirror the protocol swarm under wallet-specific limits, or switch to `PERSONAL` mode for an isolated per-wallet swarm with independent parameters and inventory.

### Swarm Arena and Social Alpha

The `#arena` experience includes separate leaderboards for AI agents and human forecasters, quantitative performance metrics, trader profiles, strategy cloning, configurable social mirror trading, and Proof-of-Alpha cards for sharing verified performance.

## Technical Architecture

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Radix UI, Three.js, Web Audio API, and wallet integration.
- **Backend:** Node.js, Express, TypeScript, WebSocket telemetry gateway, risk controls, transaction queue, and autonomous daemon.
- **Database:** Supabase PostgreSQL with Realtime and row-level security.
- **Intelligence:** Groq Qwen for real-time swarm reasoning and telemetry; Google Gemini exclusively for Strategy Studio synthesis.
- **Blockchain:** Somnia Shannon EVM testnet and DreamDEX Markets SDK for market discovery, CLOB orders, cancellations, and settlements.

### Execution flow

1. Binance spot feeds provide live prices and short-term drift.
2. The math engine calculates fair probability, realized volatility, VWAP, and edge.
3. Agents apply depth sanitization, self-trade prevention, expiry guards, and risk limits.
4. Structured reasoning and execution events stream over WebSocket.
5. The operator submits scoped orders through DreamDEX on Somnia.
6. Receipts, fills, PnL, and settlement data are persisted to PostgreSQL and shown in the UI.
7. Sweeper claims finalized winning positions and transfers redeemed tUSDC directly to the appropriate wallet.

## Quantitative Foundation

DreamPulse uses deterministic, production-oriented math rather than sentiment-only signals:

- Abramowitz-Stegun normal CDF approximation for fast binary probability calculations.
- Black-Scholes-style standardized score using spot, strike, time remaining, and EWMA volatility.
- Bayesian shrinkage for realized volatility so early or sparse tick samples do not dominate.
- Depth-weighted VWAP to estimate actual taker execution cost.
- Titan reservation-price adjustments using nonlinear inventory skew.
- Short-horizon diffusion floors, confluence weighting, temporal EMA smoothing, and directional hysteresis to reduce pin-risk instability near expiry.
- 3-Layer Quantitative Defense Architecture for volatility arbitrage: confines pricing to rapid-convergence windows ($\le 15$m / 900s) to eliminate long-horizon drift breakdown, enforces multi-timeframe EMA/RSI trend gating to hard-block counter-trend fades, and doubles required margin of safety ($\ge 7.0\%$ edge, $\ge 16.0\%$ ROI) on asymmetric risk profiles.

## Non-Custodial Security

DreamPulse never takes custody of user funds. The authorization flow is:

1. The user connects a wallet and chooses single-trade and daily-volume limits.
2. `BatchApprove.sol` batches pool approvals and operator delegation in one transaction.
3. The user signs an off-chain EIP-712 `SessionGrant`.
4. The backend registers the session and enforces its limits.
5. The operator can call only scoped trading functions such as `placeOrderFor`, `cancelOrderFor`, and `reduceOrderFor`.

Withdrawal, drain, and unrestricted transfer capabilities are not granted. Collateral is used only for the exact authorized order amount, while users retain wallet ownership and can revoke sessions.

## On-Chain Deployments

| Contract | Address |
| --- | --- |
| `BatchApprove.sol` | [`0x12c9c45fa740ce7469dacff368b08ca7edcaac26`](https://shannon-explorer.somnia.network/address/0x12c9c45fa740ce7469dacff368b08ca7edcaac26) |
| `OperatorPermissionsRegistry` | [`0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`](https://shannon-explorer.somnia.network/address/0x15C7e8CE38F021c5b45d098AaD788f63090bF20A) |
| `BinaryModule` | [`0x3ecC694Cef705358864a646142ac17A90E29e388`](https://shannon-explorer.somnia.network/address/0x3ecC694Cef705358864a646142ac17A90E29e388) |
| `MarketsCore` | [`0x2802504314685D89bF6C992CA5a8e7cC78bc0294`](https://shannon-explorer.somnia.network/address/0x2802504314685D89bF6C992CA5a8e7cC78bc0294) |
| `CLOBFactory` | [`0xb2BE8EE02F96379DB75f01802384593EBa9bfF04`](https://shannon-explorer.somnia.network/address/0xb2BE8EE02F96379DB75f01802384593EBa9bfF04) |
| `BinarySettlement` | [`0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23`](https://shannon-explorer.somnia.network/address/0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23) |
| `CollateralRouter` | [`0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C`](https://shannon-explorer.somnia.network/address/0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C) |
| `OracleHub` | [`0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b`](https://shannon-explorer.somnia.network/address/0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b) |
| `TestUSDC` | [`0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E`](https://shannon-explorer.somnia.network/address/0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E) |

## Live Evidence and Hackathon Fit

The live cockpit and [`evidence.json`](./evidence.json) provide an audit trail containing execution records, transaction hashes, settlement data, and schemas verified on Somnia Shannon Testnet.

| Judging area | DreamPulse evidence |
| --- | --- |
| Innovation | One product unifies CLOB trading, AI, no-code agents, backtesting, autonomous liquidity, social prediction, and settlement. |
| Technical implementation | Direct DreamDEX SDK integration, deployed contracts, serialized nonce handling, risk guardrails, WebSocket telemetry, and 307 passing tests. |
| User experience | Institutional terminal, visual binary charts, one-click session authorization, command palette, onboarding wizard, and strategy builder. |
| Ecosystem impact | Provides liquidity, reduces stale pricing, recycles settled capital, and makes automated prediction-market strategies accessible. |
| Presentation | A focused 2:55 demo covers onboarding, terminal trading, Strategy Studio, swarms, telemetry, and settlement. |

## SDK Developer Feedback

Building DreamPulse against the Somnia Markets SDK surfaced several useful observations:

- Somnia’s fast finality and RPC performance support high-frequency on-chain loops.
- The deterministic CLOB and viem interoperability make order execution straightforward.
- Rolling markets create a multi-pool approval burden; `BatchApprove.sol` addresses it at the application layer.
- Non-matching IOC orders require careful depth checks and quantized crossing prices.
- Concurrent agents require serialized nonce management, reset handling, and exponential backoff.
- Newly created markets can appear in the indexer several seconds after on-chain activation, so DreamPulse cross-checks indexer data against direct contract reads.

## API and Telemetry

The backend exposes market data, depth, spot analytics, anomalies, session registration and revocation, order history, agent and swarm configuration, backtesting, custom agents, arena leaderboards, copy trading, and settlement summaries under `/api/v1`.

WebSocket endpoint: `/ws/telemetry`.

Important event channels include `markets`, `order_book`, `agent_thoughts`, `orders`, `order_filled`, and `sweep_completed`.

## Local Development

### Requirements

- Node.js `20+`
- npm `10+`
- Git
- Somnia, Supabase, Groq, and Gemini credentials for live integrations

### Install and configure

```bash
git clone https://github.com/zaikaman/DreamPulse.git
cd DreamPulse
npm install

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Configure the environment files with Supabase credentials, LLM API keys, Somnia RPC/WebSocket URLs, the indexer URL, and the funded operator key required by the backend. The frontend uses the backend HTTP and WebSocket URLs plus Somnia and Supabase public settings.

### Run locally

```bash
npm run dev
```

- Frontend: `http://localhost:5174`
- REST API: `http://localhost:5000/api/v1`
- WebSocket: `ws://localhost:5000/ws/telemetry`

For cloud deployment, see [`DEPLOYMENT.md`](./DEPLOYMENT.md). The reference deployment uses Vercel for the frontend, Heroku for the backend, and Supabase PostgreSQL.

## Verification

The repository includes unit and integration coverage for quantitative math, authentication, sessions, order execution, agents, backtesting, settlement, API routes, WebSockets, leaderboards, social copy trading, and lifecycle behavior.

```bash
npm test
npm run test:coverage --workspace=dreampulse-backend
npm run verify
```

The documented verification result is **307 tests passing across 22 suites**, with type checking and production builds included in `npm run verify`.

## Roadmap

- Deploy to Somnia Mainnet after launch.
- Add SOL, SOMNIA, commodities, and other event-contract volatility surfaces.
- Add cross-chain collateral bridging from Arbitrum, Base, and Ethereum.
- Create a decentralized strategy marketplace with performance-fee splits.
- Deliver a mobile PWA with biometric session signatures and push notifications.

## License and Acknowledgements

DreamPulse is released under the [MIT License](./LICENSE).

Built with [Somnia](https://somnia.network), [DreamDEX](https://dreamdex.io), [`@somnia-chain/markets-sdk`](https://www.npmjs.com/package/@somnia-chain/markets-sdk), [Groq](https://groq.com), [Google Gemini](https://ai.google.dev), [Viem](https://viem.sh), and [Supabase](https://supabase.com).

