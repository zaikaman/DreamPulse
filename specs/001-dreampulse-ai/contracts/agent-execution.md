# Multi-Agent Swarm Strategy Execution Contract: DreamPulse AI

**Agents**: `Volt` (Sniper), `Oracle` (Volatility Arb), `Titan` (Market Maker), `Sweeper` (Auto-Claimer)  

---

## 1. Agent Strategy Lifecycle Interface

Every agent in the swarm implements the `IAgentStrategy` interface:

```typescript
export interface IAgentContext {
  spotTicker: {
    symbol: string;
    price: number;
    change1m: number;
    change5m: number;
    timestamp: number;
  };
  market: Market;
  depth: OrderBookDepth;
  activeSessions: SessionGrant[];
}

export interface IAgentDecision {
  agentType: AgentType;
  action: 'TAKER_BUY' | 'TAKER_SELL' | 'LIMIT_QUOTE' | 'CANCEL_QUOTE' | 'BATCH_SWEEP' | 'HOLD';
  targetMarketId: string;
  targetOutcome?: 'YES' | 'NO';
  price?: number;
  lotSize?: number;
  confidence: number;
  rationale: string;
}

export interface IAgentStrategy {
  readonly agentType: AgentType;
  evaluate(context: IAgentContext): Promise<IAgentDecision>;
  execute(decision: IAgentDecision, session: SessionGrant): Promise<OrderExecution | SettlementSweep | null>;
}
```

---

## 2. Mathematical Quantitative Rules

### 2.1 `Volt` (Spot Staleness Sniper)
- **Trigger**: $|\Delta \text{Spot}_{t - 5s}| > \tau_{\text{drift}}$ (default $\tau = 0.20\%$).
- **Pricing Evaluation**: If spot drifted upwards, compute new fair binary win probability $\Phi(z)$.
- **Execution**: If resting Ask on YES $< \Phi(z) - \text{margin}$, fire immediate IOC taker buy.

### 2.2 `Oracle` (Volatility Surface Arbitrage)
- **Formula**:
  $$z = \frac{\ln(S / K)}{\sigma \sqrt{T}}$$
  $$\text{Fair Prob} = \Phi(z) = \frac{1}{\sqrt{2\pi}} \int_{-\infty}^{z} e^{-u^2/2} du$$
- **Execution**: If $|\text{MidPrice} - \Phi(z)| > \text{MinEdge}$, place limit/market orders in the direction of $+EV$.

### 2.3 `Titan` (Adaptive Market Maker)
- **Spread Model**: Quote bid at $\Phi(z) - \frac{\text{Spread}}{2} - \gamma \cdot \text{Inventory}$, ask at $\Phi(z) + \frac{\text{Spread}}{2} - \gamma \cdot \text{Inventory}$.
- **Execution**: Post-only two-sided limit orders, dynamically adjusting quotes when inventory shifts.

### 2.4 `Sweeper` (Auto-Claimer & Compounder)
- **Trigger**: Every 30 seconds, scan all user positions where `market.status == 'Finalized'`.
- **Execution**: Call `batchClaimPayouts([marketIds])` on Somnia contracts, transfer proceeds to user collateral balance, and optionally reallocate into active agent pool.
