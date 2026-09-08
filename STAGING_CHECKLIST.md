# Staging Promotion Checklist (Somnia Shannon Testnet)

Automated part: `npm run staging:dry-run --workspace=dreampulse-backend`
(read-only: chain id, contract bytecode, USDC decimals, chain liveness).
It exits non-zero on any FAIL. Everything below is what automation
cannot honestly prove and must be verified by a human per deploy.

## 1. Automated gates (must all be green)
- [ ] `npm run verify` passes (typecheck + backend 400+ tests + frontend 80+ tests + prod builds)
- [ ] `staging:dry-run` reports STAGING READY (13/13)
- [ ] CI: `test-and-coverage` green, money-path coverage gate green

## 2. Operator funding (cannot be automated — needs a key holder)
- [ ] Operator wallet holds >= 0.05 STT (gas for placements, redeems, clone deploys)
  - Check: `staging:dry-run` with `OPERATOR_ADDRESS=<addr>` (warn-only probe)
- [ ] Operator TestUSDC collateral topped up for swarm master orders
- [ ] Faucet flow works from the frontend header (claim 1,000 tUSDC to a fresh wallet)

## 3. Delegation E2E on a fresh wallet (manual, ~10 min)
- [ ] Connect wallet → forced onto Somnia Shannon (50312) on wrong chain
- [ ] 1-click activation completes both steps (clone deploy + EIP-712 + backend register)
- [ ] Session modal shows ACTIVE SESSION DELEGATED with clone balance
- [ ] Mirror toggle ON passes `copyTradeEnabled: true` (covered by modal unit tests,
      confirm once live)
- [ ] Revoke with on-chain option deactivates within 1 block; backend-only revoke
      clears the session row

## 4. Money-path live fire (small amounts, testnet funds only)
- [ ] Manual terminal trade (10 tUSDC) fills and appears in order history
- [ ] Double-submit same txHash from two tabs → second rejected (replay lock)
- [ ] Let a 5m market resolve → sweeper batch claims → totals match explorer
- [ ] Daily cap: set cap 20, spend 20, next trade blocked with cap message

## 5. Pre-mainnet hardening (not required for testnet staging)
- [ ] Foundry fork tests (`anvil --fork-url <somnia-rpc>`) executing
      `claimMarketPayout` redeem + `triggerBatchSweep` against mainnet-state fork
- [ ] Load test: 50 concurrent submits, exactly-once invariant holds
- [ ] Incident drill: RPC outage → circuit breaker trips, no gas drain, clean recovery
