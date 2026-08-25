# Feature Specification: DreamPulse

**Feature Directory**: `specs/001-dreampulse-ai`  
**Created**: 2026-08-25  
**Status**: Draft  
**Input**: User description from `IDEA.md`: "Autonomous Multi-Agent Swarm, Real-Time Edge Radar & Non-Custodial Copy-Vault for DreamDEX Event Contracts on Somnia"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Real-Time Market Edge Radar & Live Cyber-Terminal (Priority: P1)

Traders and liquidity providers need a high-frequency visual command center to monitor all active binary prediction markets (5-minute, 15-minute, and 1-hour BTC/ETH windows), identify pricing discrepancies where market implied probability deviates from fair mathematical value, view live depth ladders, and inspect real-time AI reasoning feeds.

**Why this priority**: Without visual market transparency and discrepancy detection, users cannot identify profitable opportunities or trust automated agent decision-making. This delivers immediate standalone analytical value even before automated trading is enabled.

**Independent Test**: Can be verified by loading the terminal, observing live streaming contract matrices across BTC/ETH expiries, viewing animated depth charts, and inspecting real-time AI thought stream telemetry without requiring wallet authorization.

**Acceptance Scenarios**:
1. **Given** an active 5-minute BTC prediction market with an active order book, **When** the trader opens the Market Matrix, **Then** the terminal displays real-time bid/ask prices, implied win probability, calculated fair-value benchmark, and the calculated pricing spread/edge percentage.
2. **Given** spot prices shift rapidly creating a divergence between underlying spot drift and resting order book quotes, **When** the deviation exceeds the threshold, **Then** the Edge Radar highlights the contract in the Discrepancy Heatmap with an visual alert indicator.
3. **Given** the active agent engine is analyzing contracts, **When** an evaluation cycle runs, **Then** the AI Live Thought Stream renders sequential reasoning logs with timestamps, confidence scores, and action rationale.

---

### User Story 2 - Non-Custodial Session-Key Delegation & Safety Guardrails (Priority: P1)

Users want to authorize automated AI agents to execute trades on their behalf without transferring funds into a centralized pool or granting full wallet custody or withdrawal permissions.

**Why this priority**: Trust and custody security are paramount in decentralized finance. Non-custodial session delegation ensures user funds remain strictly in the user's custody with zero risk of unauthorized withdrawal or draining.

**Independent Test**: Can be verified by connecting a wallet, granting scoped session permissions with defined risk parameters (maximum single trade limit, daily volume cap, and expiration timestamp), and confirming that withdrawal actions by the agent are mathematically and permissionally impossible.

**Acceptance Scenarios**:
1. **Given** a connected wallet with collateral balance, **When** the user clicks "Activate Session Key" and configures risk limits (e.g., max 10 STT per trade, max 50 STT daily cap), **Then** a scoped delegation approval is generated restricting actions strictly to order placement and cancellation.
2. **Given** an active delegation session, **When** an agent attempts an action outside the authorized permission scope (such as fund withdrawal or transfer), **Then** the permission registry rejects the action immediately.
3. **Given** an active session, **When** the user clicks "Revoke Delegation", **Then** the session is immediately terminated, stopping all automated agent trading for that wallet.

---

### User Story 3 - Autonomous Multi-Agent Swarm Strategy Execution (Priority: P2)

Users and liquidity providers want to assign dedicated AI agents (`Volt` for spot staleness sniping, `Oracle` for volatility surface arbitrage, and `Titan` for adaptive two-sided market making) to automatically capture market inefficiencies 24/7.

**Why this priority**: Binary prediction markets expire rapidly (5m/15m/1h) and manual human execution cannot keep pace with spot drift and resting order latency. Swarm automation turns passive users into continuous market participants.

**Independent Test**: Can be verified by enabling a specific agent strategy (e.g., `Volt` sniper), simulating or triggering a spot price movement, and observing the agent automatically place an immediate taker order against a stale resting quote, logging the transaction receipt to the user's dashboard.

**Acceptance Scenarios**:
1. **Given** the `Volt` Sniper agent is active and spot price moves $+0.3\%$, **When** resting YES contracts remain underpriced relative to spot drift, **Then** `Volt` submits an immediate fill-or-kill order to capture the mispricing within user risk limits.
2. **Given** the `Oracle` Volatility Arb agent is active, **When** cumulative distribution probability $\Phi(z)$ indicates positive expected value ($+EV > 5\%$) relative to market price, **Then** `Oracle` places an entry order sized according to the configured risk allocation.
3. **Given** the `Titan` Market Maker agent is active on an open market, **When** order book spreads widen, **Then** `Titan` posts two-sided limit orders around fair value, dynamically skewing quotes if inventory becomes unbalanced.

---

### User Story 4 - Autonomous Settlement Sweeper & Compounder (Priority: P2)

Users want an automated background service that scans finalized markets, identifies uncollected payout proceeds, and automatically redeems winnings back into their usable balance without requiring manual claims.

**Why this priority**: Binary prediction markets require winners to manually claim payouts after resolution. Without an auto-sweeper, user capital becomes fragmented and locked across dozens of expired markets, severely degrading trading velocity.

**Independent Test**: Can be verified by holding winning positions in an expiring market, allowing the contract to finalize, and observing the sweeper automatically detect and claim the payout, updating the user's available balance and displaying a settlement claim notification.

**Acceptance Scenarios**:
1. **Given** a user has winning positions in one or more finalized markets, **When** the Sweeper engine runs its scheduled cycle, **Then** it identifies all unclaimed contracts and executes a batch settlement claim.
2. **Given** winnings are successfully claimed, **When** auto-compounding is enabled by the user, **Then** the redeemed capital is automatically returned to the active trading allocation.
3. **Given** a market resolves as a loss or void/refund, **When** the sweeper inspects the contract, **Then** it processes any available refunds and accurately updates the PnL history without throwing errors.

---

### User Story 5 - Strategy Studio & Historical Backtesting Simulator (Priority: P3)

Quantitative traders want to test custom rule sets and risk parameters against historical prediction market contract series before activating live agent capital.

**Why this priority**: Allows advanced users to validate mathematical edge, calculate Sharpe ratio, analyze drawdowns, and fine-tune trigger thresholds with zero financial risk.

**Independent Test**: Can be verified by choosing an asset (BTC/ETH), selecting a historical time range, configuring strategy parameters (drift threshold, take-profit spread), running the backtest, and viewing generated performance metrics (win rate, total PnL, max drawdown, and trade log).

**Acceptance Scenarios**:
1. **Given** historical contract data for 5-minute BTC markets, **When** the user configures a `Volt` sniper strategy with a $0.2\%$ drift threshold and runs the simulation, **Then** the system outputs a complete performance report including total trades, win rate, PnL curve, and execution slippage analysis.
2. **Given** backtest results indicate positive performance, **When** the user clicks "Deploy Strategy", **Then** the configured parameters are loaded directly into the live agent cockpit.

---

### Edge Cases

- **Oracle Delay / Delayed Settlement**: If the resolution oracle takes longer than expected to publish the final settlement price, the terminal must clearly flag the contract as "Awaiting Resolution" without freezing active agent threads.
- **Extreme Market Volatility / Circuit Breakers**: When spot prices swing by more than a configured emergency volatility threshold within a 5-second window, agents must pause market making to prevent adverse selection cascades.
- **Partial Fills & Immediate-or-Cancel Fills**: When a sniper order is partially filled due to competing taker transactions, the agent must update position accounting accurately and cancel any unfilled remainder.
- **Session Expiration During Active Quotes**: If a user's session key reaches its predefined expiration time while resting limit orders are open, the system must notify the user and gracefully cancel or freeze open agent orders.
- **Network RPC Partition / Disconnections**: If the connection to the blockchain node or WebSocket stream is interrupted, the terminal must display a prominent degraded-connection status indicator, pause automated order submissions, and automatically reconnect with exponential backoff.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a real-time Market Matrix displaying active 5-minute, 15-minute, and 1-hour prediction contracts for BTC and ETH.
- **FR-002**: System MUST compute and display real-time theoretical fair-value probability $\Phi(z)$ alongside market-implied probability for all active contracts.
- **FR-003**: System MUST provide an Edge Radar discrepancy visualizer that highlights contracts where pricing deviation exceeds user-defined thresholds.
- **FR-004**: System MUST display visual order book depth charts with aggregated bid and ask quantities across all active price ticks.
- **FR-005**: System MUST stream real-time AI Agent reasoning logs with human-readable explanations, timestamps, and confidence scores.
- **FR-006**: System MUST support non-custodial session key creation through scoped permissions allowing order placement and cancellation while strictly prohibiting asset withdrawal or external transfers.
- **FR-007**: System MUST allow users to define risk guardrails per session, including maximum trade size, maximum total daily volume, and session expiration duration.
- **FR-008**: System MUST provide 1-click immediate session revocation to instantly cancel agent permissions and halt automated actions.
- **FR-009**: System MUST support autonomous execution for the `Volt` Spot Staleness Sniper agent to capitalize on rapid spot price drift against lagging order books.
- **FR-010**: System MUST support autonomous execution for the `Oracle` Volatility Surface Arbitrage agent to trade positive expected value ($+EV$) probability mispricings.
- **FR-011**: System MUST support autonomous execution for the `Titan` Adaptive Market Maker agent to post two-sided quotes with inventory-aware spread skewing.
- **FR-012**: System MUST provide an automated `Sweeper` engine that discovers finalized markets with claimable balances and executes batch payout redemptions.
- **FR-013**: System MUST maintain transparent portfolio analytics tracking total portfolio value, realized PnL, win rate, active open orders, and historical claim logs.
- **FR-014**: System MUST include a Strategy Backtester allowing users to test strategy rules against historical market data with quantitative performance metrics.
- **FR-015**: System MUST present a responsive, low-latency cyber-terminal UI optimized for 60 FPS rendering with zero layout jitter.

---

### Key Entities *(include if feature involves data)*

- **Market / Event Contract**: Represents a binary prediction market instance (Asset: BTC/ETH, Expiry Window: 5m/15m/1h, Strike Price, Status: Open/Closed/Resolving/Finalized, Settlement Price, Winning Outcome).
- **Order Book State**: Snapshot and real-time delta of resting bids and asks (Tick Prices, Quantized Lot Sizes, Implied Probabilities, Fair Value Reference).
- **Agent Persona & Configuration**: Strategy profile (`Volt`, `Oracle`, `Titan`, `Sweeper`, Enabled State, Target Markets, Min Edge Threshold, Max Sizing, Inventory Targets).
- **Session Delegation Grant**: Scoped authorization record (Delegator Address, Operator Address, Allowed Actions: Place/Cancel, Max Value Per Trade, Daily Cap, Expiration Timestamp, Active Status).
- **Order & Trade Execution**: Order instance (Order ID, Market ID, Outcome: YES/NO, Direction: Buy/Sell, Order Type: Limit/IOC/Post-Only, Price, Quantity, Execution Status, Fill Timestamp, Transaction Hash).
- **Settlement Claim**: Record of redeemed payout (Claim ID, Market ID, Outcome, Claimable Amount, Payout Token, Timestamp, Claim Transaction Hash).
- **Backtest Scenario**: Simulation setup and outcome (Asset, Historical Period, Strategy Rules, Total Simulated Trades, Net Return, Max Drawdown, Win Rate, Sharpe Ratio).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Traders can view and interact with real-time market matrices and depth ladders with visual state updates under 150 milliseconds.
- **SC-002**: Users can complete non-custodial session delegation onboarding and start an automated agent swarm in fewer than 3 clicks and under 30 seconds.
- **SC-003**: 100% of agent transactions operate within scoped session permissions with zero capability for unauthorized fund transfers or withdrawals.
- **SC-004**: The automated Sweeper successfully discovers and initiates batch settlement claims for 100% of finalized winning contracts without manual user intervention.
- **SC-005**: The `Volt` sniper agent detects spot-orderbook divergence and submits execution payloads within 100 milliseconds of price drift emergence.
- **SC-006**: Backtest simulator completes a full 24-hour historical contract series evaluation in under 3 seconds with comprehensive quantitative reporting.

---

## Assumptions

- Target users have an EVM-compatible Web3 wallet (e.g., MetaMask, Rabby, OKX) and access to Somnia Shannon Testnet.
- Underlying spot price tickers for BTC and ETH are accessible via low-latency websocket/oracle feeds.
- Market contracts follow the standard DreamDEX Event Contracts protocol specifications on Somnia.
- Session key delegation leverages Somnia's `OperatorPermissionsRegistry` for non-custodial access control.
- All trade sizes, ticks, and strike prices adhere to protocol-quantized increments.
