# Session Key & Operator Permissions Contract: DreamPulse

**Protocol**: Somnia `OperatorPermissionsRegistry`  
**Network**: Somnia Shannon Testnet (`Chain ID: 50312`)  

---

## 1. Permission Delegation Specification

To ensure non-custodial safety, DreamPulse interacts exclusively through Somnia's `OperatorPermissionsRegistry`.

### 1.1 Permitted Operations
- `placeLimitOrderFor(address delegator, bytes32 marketId, uint8 outcome, uint256 price, uint256 amount)`
- `placeMarketOrderFor(address delegator, bytes32 marketId, uint8 outcome, uint256 amount)`
- `cancelOrderFor(address delegator, bytes32 marketId, uint256 orderId)`
- `batchCancelOrdersFor(address delegator, bytes32 marketId, uint256[] orderIds)`

### 1.2 Strictly Prohibited Operations (Zero-Custody Invariants)
- `transfer(address to, uint256 amount)`: **REJECTED**
- `transferFrom(address from, address to, uint256 amount)`: **REJECTED**
- `withdraw(uint256 amount)`: **REJECTED**
- `setApprovalForAll(address operator, bool approved)`: **REJECTED**

---

## 2. EIP-712 Typed Delegation Signature Schema

Users authorize session delegation by signing an EIP-712 structured payload in their Web3 wallet:

```json
{
  "types": {
    "EIP712Domain": [
      { "name": "name", "type": "string" },
      { "name": "version", "type": "string" },
      { "name": "chainId", "type": "uint256" },
      { "name": "verifyingContract", "type": "address" }
    ],
    "SessionDelegation": [
      { "name": "delegator", "type": "address" },
      { "name": "operator", "type": "address" },
      { "name": "maxTradeSize", "type": "uint256" },
      { "name": "dailyVolumeCap", "type": "uint256" },
      { "name": "nonce", "type": "uint256" },
      { "name": "deadline", "type": "uint256" }
    ]
  },
  "primaryType": "SessionDelegation",
  "domain": {
    "name": "DreamPulse Operator Registry",
    "version": "1",
    "chainId": 50312,
    "verifyingContract": "0x5031200000000000000000000000000000000001"
  },
  "message": {
    "delegator": "0x9876...4321",
    "operator": "0xAgent...0001",
    "maxTradeSize": "10000000000000000000",
    "dailyVolumeCap": "100000000000000000000",
    "nonce": 0,
    "deadline": 1787491800
  }
}
```

---

## 3. Backend Verification & Execution Guard

Before any agent submits a transaction on behalf of a user:
1. Backend checks `sessions` table in Supabase to confirm `is_active == true` and `now() < expires_at`.
2. Verifies that cumulative volume in `orders` over the rolling 24-hour window plus the new trade does not exceed `daily_volume_cap`.
3. Verifies `order.lotSize * order.price <= session.max_trade_size`.
4. Executes the transaction via the Operator wallet address using Somnia's `OperatorPermissionsRegistry.placeOrderFor`.
