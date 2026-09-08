# Developer Feedback Report: Somnia Shannon & DreamDEX Event Contracts

**Venue**: Somnia Shannon Testnet (Chain ID `50312`)  
**Protocols & Tooling**: `@somnia-chain/markets-sdk` (v0.28.1–v0.29.0), DreamDEX Event Contracts, Somnia Reactivity Precompile (`0x0000000000000000000000000000000000000100`), Somnia Shannon RPC & Explorer  
**Author**: DreamPulse Core Engineering Team ([DreamPulse](https://github.com/zaikaman/DreamPulse))  
**Date**: September 2026  

---

## Executive Summary

During the Somnia × DreamDEX Hackathon, our team engineered **DreamPulse**—a full-stack prediction market ecosystem combining an institutional Central Limit Order Book (CLOB) terminal, autonomous multi-agent swarms (Volt Sniper, Oracle Arb, Titan Market Maker, and Sweeper Daemon), a visual no-code strategy builder, quantitative backtester, and non-custodial Smart Trading Accounts (`DreamPulseSessionAccount` EIP-1167 clones).

Throughout intensive testing, dry-runs, and live on-chain operations on the Somnia Shannon Testnet, our autonomous swarms executed **over 1,400 orders** and generated **over 100 tUSDC in net settlement profits** (auditable in our public transaction ledger at [`/transactions.txt`](https://dreampulse-backend-2aa35c1a9af1.herokuapp.com/transactions.txt)).

This report synthesizes practical, reproducible developer feedback from our engineering team alongside verified observations from peer developers building on DreamDEX Event Contracts. Every friction point and gotcha documented below has been verified against live on-chain behavior or SDK code, accompanied by concrete recommendations for the Somnia and DreamDEX protocol maintainers.

---

## What Works Exceptionally Well

1. **Sub-Second Finality & High-Throughput EVM**: Somnia's block times and sub-second transaction confirmations provide an environment where high-frequency on-chain trading and reactive market making can operate without the multi-second lag typical of traditional L2s.
2. **Zero-Fee Execution Environment**: The absence of execution gas friction fundamentally shifts what is possible for decentralized market makers, enabling tight quote ladders and frequent order updates without draining operator capital.
3. **Deterministic CLOB Matching Engine**: Direct placement and cancellation against the order book is predictable, efficient, and aligns cleanly with institutional exchange mechanics.
4. **Clean Viem & Ethers Interoperability**: The core contracts and `@somnia-chain/markets-sdk` integrate seamlessly with standard `viem` `PublicClient` and `WalletClient` primitives, simplifying custom contract pipelines.
5. **Comprehensive Historical Market Accessibility**: Functions like `listPastBinaryMarkets` and `getMarketResolution` make backtesting, quantitative calibration, and historical resolution analysis straightforward across thousands of settled pools.
6. **Reactive Discovery Mechanisms**: SDK utilities like `watchMarkets({ discover: true })` and `watchPrice` provide a lightweight alternative to polling dozens of individual order books simultaneously.

---

## 1. On-Chain Contracts & Price Representation

### 1.1 Price Scaling Linked to Collateral Decimals
* **Observation**: In DreamDEX binary event contracts, probabilities (ranging between 0.0 and 1.0) are scaled directly to the collateral token's decimal precision ($10^{\text{decimals}}$), rather than a uniform standard such as WAD ($10^{18}$). For instance, a probability of $0.727$ is represented as `727000` on 6-decimal `tUSDC`, but as `727e15` on 18-decimal `USDso`.
* **Impact**: Developers referencing documentation sections that discuss $10^{18}$ fixed-point math inadvertently construct orders scaled by $10^{18}$. The resulting contract reverts do not flag a scale mismatch. Instead, they trigger:
  * `PostOnlyWouldCross()` on `BUY_YES` / `SELL_NO` (because a massive price crosses the entire resting book).
  * `PriceOutOfBounds()` on `SELL_YES` / `BUY_NO`.
  This misdirects debugging efforts toward book state, spreads, and post-only mechanics rather than unit scaling.
* **Recommendations**:
  * Emphasize the price scaling rule in the first code example of the developer documentation recipes: `// Price is scaled by 10 ** collateral.decimals() (e.g., 0.727 = 727,000 for tUSDC)`.
  * Add a specific custom error (e.g., `ScaleMismatch()` or `InvalidPriceScale()`) when a submitted price exceeds $1.0 \times 10^{\text{decimals}}$ by several orders of magnitude.

### 1.2 Binary Pool ABI Surface vs. Spot Functions
* **Observation**: `binaryPoolWriteAbi` exports both the spot method `placeOrder(bool isBid, ...)` and the binary method `placeBinaryOrder(uint8 kind, ...)`. Calling `placeOrder` on a binary pool reverts with `UseBinaryPlacement`. Similarly, spot-only helper methods such as `getAutoPullRequirement` and `somiPaymentPerOrder` remain visible on binary pool ABIs and revert when called.
* **Impact**: IDE autocompletion and developers accustomed to standard DEX interfaces frequently invoke `placeOrder` or `getAutoPullRequirement`, resulting in runtime reverts.
* **Recommendations**:
  * Strip spot-only function signatures from the binary pool ABI exports or partition them into distinct interfaces (e.g., `BinaryPool` vs. `SpotPool`).
  * If methods must remain in the shared ABI artifact, append a clear naming indicator such as `placeOrder_SpotOnly`.

### 1.3 ERC-6909 Approval Requirement During Settlement (`Module` vs. `Pool`)
* **Observation**: Purchasing outcome tokens does not require ERC-6909 operator approvals because minting credits the buyer directly. However, redemption (`redeem` or `mergeCompleteSet`) pulls outcome tokens through the **Binary Markets Module** rather than the individual pool contract:
  ```solidity
  outcomeToken.setOperator(binaryMarketsModule, true);
  ```
  If this operator permission is absent, redemption calls revert with `InsufficientPermission()`.
* **Impact**: Because the revert payload contains no parameters specifying which address required authorization, debugging this error often leads developers to approve the pool contract rather than the module contract.
* **Recommendations**:
  * Parameterize the revert error: `InsufficientPermission(address owner, address requiredSpender)`.
  * Explicitly feature the module operator approval requirement in the Settlement and Redemption guide code snippets.

### 1.4 Book Freezing Between Expiry and Settlement Window
* **Observation**: When a market reaches its expiry timestamp, the order book freezes during the settlement window (+300s). During this window, all cancellation functions (`cancelOrder`, `cancelOrders`, `cancelExpiredOrders`, `sweepExpiredAtLevel`) revert with `0x8afbce93`.
* **Impact**: The revert selector `0x8afbce93` decodes to an unmapped error because it originates from the underlying `OrderBook` base contract in the DEX submodule rather than the top-level contract artifact. Bot daemons attempting to clean up resting quotes get stuck in recurring revert loops until the market transitions to terminal status.
* **Recommendations**:
  * Document the expiration freeze window explicitly in the contract lifecycle documentation.
  * Export the underlying `OrderBook` base contract errors within `contractErrorsAbi` so reverts decode into human-readable messages.
  * Clarify in documentation that `BinaryMarket.voidExpired()` is callable once `expiry + settlementWindow` has passed if oracle resolution is delayed.

### 1.5 Non-Idempotent Order Cancellation
* **Observation**: Calling `cancelOrder` on an order ID that has already been completely filled or cancelled reverts with `IncorrectSender(caller, owner)` rather than executing as an idempotent no-op or returning a status indicator.
* **Impact**: In automated trading systems that manage multiple quote legs simultaneously, a single filled leg causes the entire batch cancellation transaction to revert, stranding the remaining open quotes.
* **Recommendations**:
  * Treat cancellation of an already inactive order as an idempotent no-op, or return a distinct error like `OrderNotLive(uint64 orderId)`.
  * Note in the integration gotchas that multi-order cancellations should wrap individual calls in `try/catch` handlers.

---

## 2. Somnia Tooling, RPC & Reactivity

### 2.1 Reactivity Precompile (`0x...0100`) Reverts With Empty Data
* **Observation**: Subscribing to event topics via the Somnia reactivity precompile at address `0x0000000000000000000000000000000000000100` reverts with **empty return data** (`0x`) if either:
  1. The subscribing handler contract holds less than **32 STT** on the testnet, or
  2. The handler does not respond positively to **ERC-165** checks for `ISomniaEventHandler`.
* **Impact**: Empty return data provides no indication of the underlying cause, leading developers to spend hours adjusting event topics, gas fees, or RPC configurations.
* **Recommendations**:
  * Update the precompile to return descriptive custom errors: `InsufficientSTTBalance(uint256 currentBalance, uint256 requiredBalance)` and `HandlerMissingERC165(address handler)`.
  * Document the 32 STT minimum balance requirement directly within `@somnia-chain/markets-sdk/reactivity` documentation.

### 2.2 Reactivity Callback Gas Floor & Explorer Visibility
* **Observation**: Reactivity callbacks triggered by the precompile that run out of gas fail without generating standard execution logs on the handler contract. An `onEvent` callback with a 500,000 gas limit on Shannon failed with `OUT_OF_GAS`; baseline gas measurements for simple sweep handlers often exceed 1,000,000 gas.
* **Impact**: Handlers receive no notification of the callback failure, leaving scheduled state flags permanently set.
* **Recommendations**:
  * State the recommended gas limit floor (minimum 1,200,000 gas) in the reactivity SDK documentation.
  * Provide an SDK helper method or documentation recipe for estimating callback gas using `eth_estimateGas` with `from` set to the precompile address.

### 2.3 Scheduler Millisecond Timestamp Jitter
* **Observation**: In the reactivity callback's `CallbackFired` event, the first topic represents the actual execution timestamp rather than the originally requested scheduled timestamp, reflecting a minor delay of tens of milliseconds (e.g., scheduled for `1787848245000`, fired at `1787848245060`).
* **Impact**: Handlers that use the scheduled millisecond timestamp as a storage mapping key fail to match the incoming callback topic.
* **Recommendations**:
  * Advise developers in documentation to key scheduling records by seconds or to pass an internal request identifier through `data`.

### 2.4 Foundry Verification EVM Target (`cancun` vs. `osaka`)
* **Observation**: The Shannon block explorer's contract verification API lists `osaka` as a supported EVM version. However, contracts compiled with `solc 0.8.30` targeting `osaka` fail verification with generic `Fail - Unable to verify` errors. Setting `evm_version = "cancun"` in `foundry.toml` allows identical source code to verify immediately.
* **Impact**: Developers deploying contracts via Foundry spend significant time troubleshooting compiler settings and source formatting before discovering the EVM version incompatibility.
* **Recommendations**:
  * Specify `evm_version = "cancun"` in the official Somnia Foundry deployment guide until the explorer verifier fully supports `osaka`.

### 2.5 RPC Handling of EIP-1898 Block Objects
* **Observation**: Foundry fork tests targeting Somnia Shannon RPC endpoints (`api.infra.testnet.somnia.network` and `dream-rpc.somnia.network`) fail when querying state using EIP-1898 block objects (e.g., `{"blockHash": "0x..."}`). The endpoints return RPC error code `-32602: invalid parameters`, although queries with standard hexadecimal block numbers succeed.
* **Impact**: Foundry cannot execute forked test suites natively against Shannon without an intermediate proxy rewriting block parameter formats.
* **Recommendations**:
  * Enable support for EIP-1898 `{blockHash}` and `{blockNumber}` parameter objects on public RPC nodes.

---

## 3. GraphQL Indexer & Market Discovery

### 3.1 GraphQL `MarketFields` Payload Overhead & Timeouts
* **Observation**: Standard indexer queries generated by `listLiveBinaryMarkets` query a large `MarketFields` GraphQL fragment containing perpetual exchange and funding rate fields that are unnecessary for binary event contracts. Under heavy network traffic, these queries occasionally time out with `IndexerError: fetch failed`.
* **Impact**: Client applications relying on the default market listing query experience intermittent market board loading failures.
* **Recommendations**:
  * Introduce a lightweight GraphQL query option in the SDK (e.g., `listLiveBinaryMarkets({ fields: "lean" })`) querying only the essential fields: `marketId`, `asset`, `expiry`, `tradingStart`, `intervalSec`, `strike`, `poolAddress`, `status`, and token addresses.

### 3.2 Indexer Propagation Latency on Rolling Markets
* **Observation**: When a new short-duration binary market (e.g., 60-second or 5-minute pool) is deployed on-chain, the GraphQL indexer typically indexes the market with a 5 to 15-second delay. Orders submitted immediately after indexer discovery can encounter status desynchronization between the indexer and on-chain contract state.
* **Impact**: Bot agents attempting to trade newly listed markets can submit transactions against markets that have not fully opened on-chain or miss early trading windows.
* **Recommendations**:
  * Document the recommended pattern of verifying on-chain status via `getMarketOnchain` before executing high-conviction trades.
  * Provide SDK utilities that integrate direct contract state validation into the discovery flow.

### 3.3 Trading Symbol Synthesis in Indexer Rows
* **Observation**: Indexer market objects provide structured metadata (`asset`, `expiry`, `tradingStart`) but do not include the canonical CCXT-style trading symbol strings (e.g., `BTC-0-12AUG26-1600/USDso#YES`) used by `createOrder` and order book subscriptions.
* **Impact**: Consumer applications must manually construct an in-memory mapping by joining indexer rows with `loadMarkets()` results.
* **Recommendations**:
  * Expose the formatted trading symbol directly on the indexer response row, or supply a standard SDK helper: `getTradingSymbols(marketId)`.

### 3.4 Recycled Pools & Historical Candle Scoping
* **Observation**: DreamDEX binary pool contracts are recycled across consecutive rolling prediction windows. Querying candlestick data via `getCandles` without explicit `from` and `to` timestamps returns chart candles from prior expired markets that previously occupied the same pool address.
* **Impact**: Charting interfaces display discontinuous price jumps and outdated volume bars from previous market rounds.
* **Recommendations**:
  * Enforce or default `from` and `to` parameters in `getCandles` to match the target market's `tradingStart` and `expiry` timestamps.

---

## 4. Settlement, Redemption & Capital Flow

### 4.1 Payout Vectors vs. Deprecated `winningOutcome()`
* **Observation**: Settlement v3 replaces the legacy scalar `winningOutcome()` getter with a dynamic payout vector (`payoutNumerators`). The winning outcome corresponds to the index with the maximum numerator.
* **Impact**: Integrators expecting a simple `winningOutcome` getter encounter contract reverts. Furthermore, in the event of a **voided market**, both outcome tokens settle at an equal split (e.g., 0.5 each). Attempting to determine a single "winner" in a voided market results in failure to redeem the opposite side of the position.
* **Recommendations**:
  * Update the Settlement documentation to detail `payoutNumerators` interpretation.
  * Document voided market mechanics clearly: both YES and NO tokens must be redeemed to recover collateral.

### 4.2 Redemption Claims vs. Automatic Payout Distributions
* **Observation**: Unlike automated options vaults that push proceeds upon settlement, DreamDEX positions must be explicitly claimed via `redeem`. Furthermore, `loadMarkets()` filters out finalized binary markets, making settled positions invisible to standard market loading calls.
* **Impact**: New users and bot developers frequently assume funds are automatically credited to their wallets upon market expiration, leading to perceived loss of funds.
* **Recommendations**:
  * Highlight in consumer application guides that winning positions require explicit redemption.
  * Point builders toward `listBinaryMarkets({ status: "Finalized" })` and `getClaimable` for portfolio and redemption tracking.

### 4.3 Multi-Pool Approvals & The Need for a Global Collateral Router
* **Observation**: Because each rolling prediction window deploys a separate pool contract, traders must grant token approvals to each new pool address individually. In standard wallet integrations, this produces approval fatigue and increases transaction friction.
* **How DreamPulse Mitigated This**: DreamPulse designed per-user EIP-1167 Smart Trading Accounts (`DreamPulseSessionAccountFactory`). Each user's clone acts as an isolated trading vault that handles pool approvals just-in-time and zeroes residual allowances, keeping the primary wallet safe from repeated approval requests.
* **Recommendations for Protocol Architecture**:
  * Consider deploying a canonical **Global Collateral Router** or Vault contract. Users would approve collateral once to the router, allowing factory-created event pools to pull authorized collateral seamlessly without requiring individual approvals for every rolling window.

---

## 5. Summary Matrix of Findings & Recommendations

| Area | Issue Encountered | Operational Impact | Recommended Fix / Improvement |
|---|---|---|---|
| **Price Scaling** | Probabilities scaled to collateral decimals ($10^6$ on tUSDC), not WAD ($10^{18}$). | Orders revert with misleading `PostOnlyWouldCross` or `PriceOutOfBounds`. | Add scaling note to documentation recipes and implement scale sanity check in SDK. |
| **ABI Exports** | Spot methods (`placeOrder`) exported on binary pool ABI. | Runtime revert `UseBinaryPlacement` when calling spot signature. | Segregate binary and spot ABI exports or rename spot methods. |
| **Settlement Approvals** | Outcome token redemption pulls via Module, not Pool. | Reverts with `InsufficientPermission()` without indicating required spender. | Parameterize error with spender address; highlight module approval in docs. |
| **Expiry Book Freeze** | Book freezes from expiry through settlement window (+300s). | Cancellations revert with unmapped error `0x8afbce93`. | Document freeze period; export base `OrderBook` errors in `contractErrorsAbi`. |
| **Cancellation** | Cancelling filled orders reverts with `IncorrectSender`. | Prevents batch cancellation of multi-leg quotes. | Make cancel idempotent (no-op) or introduce `OrderNotLive` error. |
| **Reactivity Precompile** | Precompile reverts with empty return data on low balance or missing ERC-165. | Difficult diagnosis; mistaken for network or topic errors. | Return descriptive custom errors; document 32 STT floor in markets SDK docs. |
| **Reactivity Gas Floor** | Callbacks running out of gas fail silently without handler logs. | Scheduled tasks fail silently with unspent state flags. | Document 1.2M gas floor; supply callback gas estimation recipe. |
| **Tooling / Verification** | Explorer fails verification for `osaka` EVM target. | Deployment verification fails with generic error. | Document `evm_version = "cancun"` in Foundry guide. |
| **RPC / Fork Testing** | Shannon RPC rejects EIP-1898 block hash parameter objects. | Foundry fork tests fail with `-32602`. | Support EIP-1898 block objects on public RPC nodes. |
| **GraphQL Indexer** | Heavy `MarketFields` fragment times out under load. | Live market board fails to load during network spikes. | Provide lean GraphQL query option for binary markets. |
| **Symbol Resolution** | Indexer rows omit CCXT-style trading symbols. | Requires manual join against `loadMarkets()`. | Include formatted symbol in indexer row or export helper. |
| **Pool Recycling** | Pools reused across windows; `getCandles` mixes historical rounds. | Discontinuous and inaccurate chart data. | Scope candle queries strictly to market `tradingStart` and `expiry`. |
| **Settlement Payouts** | Legacy `winningOutcome` removed in favor of `payoutNumerators`. | Method reverts; voided markets mishandled. | Document payout vector calculation and dual-token void redemption. |
| **Collateral Approvals** | Each rolling window requires separate pool token approval. | Frequent wallet popups and UX friction. | Deploy a canonical Global Collateral Router for unified approvals. |

---

## Conclusion

The Somnia Shannon Testnet and DreamDEX Event Contracts protocol provide a high-performance foundation for decentralized prediction markets. The sub-second block times and gasless operational model allow sophisticated algorithmic trading strategies to flourish on-chain.

Addressing the developer experience gaps, documentation clarifications, and error-handling improvements outlined in this report will substantially streamline the onboarding process for the next cohort of algorithmic traders, institutional market makers, and consumer interface builders on Somnia.

*The DreamPulse team welcomes further technical discussion or collaboration with the Somnia and DreamDEX core development teams.*
