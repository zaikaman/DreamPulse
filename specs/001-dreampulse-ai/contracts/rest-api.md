# REST API Contract Specification: DreamPulse AI

**Base URL**: `/api/v1`  
**Protocol**: HTTP/1.1 JSON  

---

## 1. Markets & Edge Radar

### `GET /api/v1/markets`
- **Description**: Retrieves all active, resolving, and finalized binary event contracts with computed $\Phi(z)$ fair-value probabilities and edge metrics.
- **Query Parameters**:
  - `status` (optional): `Open | Closed | Resolving | Finalized`
  - `symbol` (optional): `BTC/USD | ETH/USD`
  - `window` (optional): `5m | 15m | 1h`
- **Response**: `200 OK`
```json
{
  "success": true,
  "count": 4,
  "data": [
    {
      "id": "0x1234...5678",
      "symbol": "BTC/USD",
      "strikePrice": 96500.00,
      "windowDuration": "5m",
      "status": "Open",
      "bestBidYes": 0.48,
      "bestAskYes": 0.51,
      "bestBidNo": 0.49,
      "bestAskNo": 0.52,
      "impliedProbYes": 0.495,
      "fairValueYes": 0.582,
      "edgePercentage": 0.087,
      "openTimestamp": "2026-08-25T13:30:00Z",
      "closeTimestamp": "2026-08-25T13:35:00Z"
    }
  ]
}
```

### `GET /api/v1/markets/:id/depth`
- **Description**: Returns detailed order book depth levels (bid/ask quantities and prices) for a specific contract.
- **Response**: `200 OK`
```json
{
  "success": true,
  "marketId": "0x1234...5678",
  "depth": {
    "yesBids": [
      { "price": 0.48, "quantity": 250, "total": 120.0 },
      { "price": 0.46, "quantity": 500, "total": 230.0 }
    ],
    "yesAsks": [
      { "price": 0.51, "quantity": 180, "total": 91.8 },
      { "price": 0.53, "quantity": 400, "total": 212.0 }
    ]
  }
}
```

---

## 2. Non-Custodial Session Keys & Delegation

### `POST /api/v1/sessions/register`
- **Description**: Registers a signed non-custodial session grant from a user wallet.
- **Request Body**:
```json
{
  "userAddress": "0x9876...4321",
  "operatorAddress": "0xAgent...0001",
  "maxTradeSize": 10.0,
  "dailyVolumeCap": 100.0,
  "expiresAt": "2026-08-26T13:30:00Z",
  "signature": "0xabc...def"
}
```
- **Response**: `201 Created`
```json
{
  "success": true,
  "session": {
    "id": "7b8d46a8-20a2-4a57-b08e-0cfda1e695d7",
    "userAddress": "0x9876...4321",
    "operatorAddress": "0xAgent...0001",
    "isActive": true,
    "expiresAt": "2026-08-26T13:30:00Z"
  }
}
```

### `POST /api/v1/sessions/:id/revoke`
- **Description**: Marks session as revoked and stops all autonomous agent execution for that wallet.
- **Response**: `200 OK`
```json
{
  "success": true,
  "message": "Session successfully revoked"
}
```

---

## 3. Swarm Agent Management

### `GET /api/v1/agents/status`
- **Description**: Returns live runtime status, active targets, and telemetry for all swarm agents (`Volt`, `Oracle`, `Titan`, `Sweeper`).
- **Response**: `200 OK`
```json
{
  "success": true,
  "agents": {
    "volt": { "status": "ACTIVE", "evalLatencyMs": 42, "tradesToday": 18, "pnl": "+24.50 STT" },
    "oracle": { "status": "ACTIVE", "evalLatencyMs": 68, "tradesToday": 12, "pnl": "+19.80 STT" },
    "titan": { "status": "ACTIVE", "activeQuotes": 6, "spreadCaptured": "+8.20 STT" },
    "sweeper": { "status": "ACTIVE", "lastSweep": "2026-08-25T13:28:10Z", "totalClaimed": "145.00 STT" }
  }
}
```

### `GET /api/v1/agents/logs`
- **Description**: Returns chronological AI thought stream and reasoning logs.
- **Query Parameters**: `limit=50&agentType=Volt`
- **Response**: `200 OK`
```json
{
  "success": true,
  "logs": [
    {
      "id": "e0b94...",
      "agentType": "Volt",
      "triggerEvent": "SPOT_DRIFT",
      "confidence": 0.94,
      "actionTaken": "TAKER_SNIPE",
      "reasoningText": "BTC spot drifted +0.32% in 3s. Resting YES ask on 5m contract priced at 0.46 vs fair 0.72. Executed 5 lot IOC order.",
      "createdAt": "2026-08-25T13:29:45Z"
    }
  ]
}
```

---

## 4. Sweeper & Backtest Simulation

### `POST /api/v1/sweeper/trigger`
- **Description**: Manually or programmatically triggers an immediate sweep of all finalized markets for a user address.
- **Request Body**: `{ "userAddress": "0x9876...4321" }`
- **Response**: `200 OK`
```json
{
  "success": true,
  "claimedMarketsCount": 2,
  "totalClaimedAmount": "40.00 STT",
  "txHash": "0x3344...8899"
}
```

### `POST /api/v1/backtest/run`
- **Description**: Executes a historical simulation of an agent strategy configuration.
- **Request Body**:
```json
{
  "agentType": "Volt",
  "symbol": "BTC/USD",
  "startDate": "2026-08-24T00:00:00Z",
  "endDate": "2026-08-25T00:00:00Z",
  "initialCapital": 1000.0,
  "strategyConfig": {
    "driftThreshold": 0.0025,
    "maxSlippage": 0.01,
    "lotSize": 10
  }
}
```
- **Response**: `200 OK`
```json
{
  "success": true,
  "result": {
    "totalTrades": 64,
    "winRate": 76.56,
    "netPnl": 348.20,
    "maxDrawdown": 4.12,
    "sharpeRatio": 2.84
  }
}
```
