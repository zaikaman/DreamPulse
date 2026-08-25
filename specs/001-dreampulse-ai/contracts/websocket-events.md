# WebSocket Real-Time Event Contracts: DreamPulse

**Endpoint**: `ws://<backend-host>/ws/telemetry` or Socket.io connection  
**Payload Format**: JSON  

---

## 1. Client Subscriptions

### 1.1 Subscribe to Markets & Heatmap
```json
{
  "action": "subscribe",
  "channel": "markets",
  "params": {
    "symbols": ["BTC/USD", "ETH/USD"]
  }
}
```

### 1.2 Subscribe to AI Agent Thought Stream
```json
{
  "action": "subscribe",
  "channel": "agent_thoughts",
  "params": {
    "agentTypes": ["Volt", "Oracle", "Titan", "Sweeper"]
  }
}
```

### 1.3 Subscribe to User Portfolio & Orders
```json
{
  "action": "subscribe",
  "channel": "user_portfolio",
  "params": {
    "userAddress": "0x9876...4321"
  }
}
```

---

## 2. Server Event Broadcasts

### 2.1 `market_tick`
- **Trigger**: Emitted every 100ms when spot price moves or order book updates.
```json
{
  "event": "market_tick",
  "timestamp": 1787405400123,
  "data": {
    "marketId": "0x1234...5678",
    "symbol": "BTC/USD",
    "spotPrice": 96540.20,
    "strikePrice": 96500.00,
    "timeLeftSeconds": 145,
    "impliedProb": 0.495,
    "fairValue": 0.582,
    "edge": 0.087,
    "hasAnomaly": true
  }
}
```

### 2.2 `depth_update`
- **Trigger**: Emitted when order book bid/ask ladders change.
```json
{
  "event": "depth_update",
  "marketId": "0x1234...5678",
  "bestBid": 0.48,
  "bestAsk": 0.51,
  "bids": [[0.48, 250], [0.46, 500]],
  "asks": [[0.51, 180], [0.53, 400]]
}
```

### 2.3 `agent_thought`
- **Trigger**: Emitted when an AI agent evaluates market state and formulates strategy rationale.
```json
{
  "event": "agent_thought",
  "timestamp": 1787405400500,
  "agent": "Volt",
  "marketId": "0x1234...5678",
  "confidence": 0.94,
  "action": "TAKER_SNIPE",
  "thought": "Detected spot price drift +0.32% against resting ask 0.46. Theoretical probability 0.72. Firing 5-lot IOC taker buy."
}
```

### 2.4 `order_filled`
- **Trigger**: Emitted when an on-chain order placement or fill completes.
```json
{
  "event": "order_filled",
  "userAddress": "0x9876...4321",
  "orderId": "d9812...",
  "marketId": "0x1234...5678",
  "outcome": "YES",
  "direction": "BUY",
  "price": 0.46,
  "lotSize": 5,
  "txHash": "0x1122...3344"
}
```

### 2.5 `sweep_completed`
- **Trigger**: Emitted when the Sweeper automatically claims payouts for finalized contracts.
```json
{
  "event": "sweep_completed",
  "userAddress": "0x9876...4321",
  "marketId": "0x1234...5678",
  "claimedAmount": "25.00 STT",
  "txHash": "0x5566...7788"
}
```
