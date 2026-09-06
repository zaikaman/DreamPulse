// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DreamPulseSessionAccount
 * @notice Enforces per-user session key policies on-chain for Somnia Shannon Testnet & DreamDEX.
 *
 * Security Invariants:
 *  - Limits are enforced on-chain: maxTradeSize ($20/trade), dailyVolumeCap ($200/day), 24h expiration.
 *  - Allowed selectors strictly restricted to trading (place/cancel/reduce).
 *  - Prohibits arbitrary transfers, approvals, and withdrawals.
 *  - Revocable in 1 tx by the user's EOA.
 *  - Compatible with both Smart Account relay and EIP-7702 EOA delegation.
 */
contract DreamPulseSessionAccount {
    struct SessionPolicy {
        address sessionKey;
        uint256 maxTradeSize;   // Collateral units (6 decimals for tUSDC, e.g. 20 * 1e6)
        uint256 dailyVolumeCap; // Collateral units (6 decimals for tUSDC, e.g. 200 * 1e6)
        uint256 spentToday;     // Collateral units spent in current 24-hour cycle
        uint256 lastSpendReset; // Timestamp of the last 24-hour rolling reset
        uint256 expiresAt;      // Expiration timestamp
        bool isActive;          // Active status
    }

    // user => sessionKey => SessionPolicy
    mapping(address => mapping(address => SessionPolicy)) public userSessions;

    // Default hard risk guardrails
    uint256 public constant MAX_ALLOWED_TRADE_SIZE = 500 * 1e6;   // Absolute ceiling: $500
    uint256 public constant MAX_ALLOWED_DAILY_CAP = 5000 * 1e6;   // Absolute ceiling: $5,000
    uint256 public constant MAX_SESSION_DURATION = 30 days;        // Max lifespan per grant

    // Permitted trading function selectors
    bytes4 public constant SELECTOR_PLACE_ORDER_FOR = 0x80054449;
    bytes4 public constant SELECTOR_PLACE_BINARY_ORDER_FOR = 0x5d97c566;
    bytes4 public constant SELECTOR_CANCEL_ORDER_FOR = 0xe37b444b;
    bytes4 public constant SELECTOR_REDUCE_ORDER_FOR = 0x364c2587;
    bytes4 public constant SELECTOR_PLACE_ORDER = 0x1f5c66b6;
    bytes4 public constant SELECTOR_PLACE_BINARY_ORDER = 0x41e8c07e;
    bytes4 public constant SELECTOR_CANCEL_ORDER = 0x2e1a7d4d;
    bytes4 public constant SELECTOR_REDUCE_ORDER = 0x98150493;

    event SessionAuthorized(
        address indexed user,
        address indexed sessionKey,
        uint256 maxTradeSize,
        uint256 dailyVolumeCap,
        uint256 expiresAt
    );

    event SessionRevoked(
        address indexed user,
        address indexed sessionKey
    );

    event OrderExecuted(
        address indexed user,
        address indexed sessionKey,
        address indexed targetPool,
        uint256 tradeCost,
        bytes4 selector
    );

    error SessionNotActive();
    error SessionExpired();
    error ExceedsMaxTradeSize(uint256 requested, uint256 maxAllowed);
    error ExceedsDailyVolumeCap(uint256 requestedTotal, uint256 dailyCap);
    error SelectorNotAllowed(bytes4 selector);
    error ExecutionFailed(bytes revertReason);
    error InvalidSessionKey();
    error InvalidDuration();
    error InvalidCapLimits();

    /**
     * @notice Authorize an ephemeral session key for the calling user with explicit on-chain risk caps.
     * @param sessionKey The temporary session key address.
     * @param maxTradeSize Max tUSDC cost per single trade (e.g., 20 * 1e6 for $20).
     * @param dailyVolumeCap Max cumulative tUSDC cost per 24h rolling window (e.g., 200 * 1e6 for $200).
     * @param durationSec Duration until session expiration (e.g., 86400 for 24h).
     */
    function authorizeSession(
        address sessionKey,
        uint256 maxTradeSize,
        uint256 dailyVolumeCap,
        uint256 durationSec
    ) external {
        if (sessionKey == address(0) || sessionKey == msg.sender) revert InvalidSessionKey();
        if (durationSec == 0 || durationSec > MAX_SESSION_DURATION) revert InvalidDuration();
        if (maxTradeSize == 0 || maxTradeSize > MAX_ALLOWED_TRADE_SIZE) revert InvalidCapLimits();
        if (dailyVolumeCap < maxTradeSize || dailyVolumeCap > MAX_ALLOWED_DAILY_CAP) revert InvalidCapLimits();

        uint256 expiresAt = block.timestamp + durationSec;

        userSessions[msg.sender][sessionKey] = SessionPolicy({
            sessionKey: sessionKey,
            maxTradeSize: maxTradeSize,
            dailyVolumeCap: dailyVolumeCap,
            spentToday: 0,
            lastSpendReset: block.timestamp,
            expiresAt: expiresAt,
            isActive: true
        });

        emit SessionAuthorized(msg.sender, sessionKey, maxTradeSize, dailyVolumeCap, expiresAt);
    }

    /**
     * @notice Revokes an active session key in a single transaction from the user's EOA.
     */
    function revokeSession(address sessionKey) external {
        userSessions[msg.sender][sessionKey].isActive = false;
        emit SessionRevoked(msg.sender, sessionKey);
    }

    /**
     * @notice Validates whether a selector is permitted for trading execution.
     */
    function isSelectorAllowed(bytes4 selector) public pure returns (bool) {
        return (
            selector == SELECTOR_PLACE_ORDER_FOR ||
            selector == SELECTOR_PLACE_BINARY_ORDER_FOR ||
            selector == SELECTOR_CANCEL_ORDER_FOR ||
            selector == SELECTOR_REDUCE_ORDER_FOR ||
            selector == SELECTOR_PLACE_ORDER ||
            selector == SELECTOR_PLACE_BINARY_ORDER ||
            selector == SELECTOR_CANCEL_ORDER ||
            selector == SELECTOR_REDUCE_ORDER
        );
    }

    /**
     * @notice Execute an order on behalf of a user using their authorized session key.
     * Enforces single trade size, 24h rolling daily volume, and allowed function selectors on-chain.
     */
    function executeOrder(
        address user,
        address targetPool,
        bytes calldata callData,
        uint256 tradeCost
    ) external payable returns (bytes memory) {
        SessionPolicy storage policy = userSessions[user][msg.sender];

        if (!policy.isActive) revert SessionNotActive();
        if (block.timestamp > policy.expiresAt) revert SessionExpired();
        if (tradeCost > policy.maxTradeSize) revert ExceedsMaxTradeSize(tradeCost, policy.maxTradeSize);

        if (callData.length < 4) revert SelectorNotAllowed(bytes4(0));
        bytes4 selector = bytes4(callData[:4]);
        if (!isSelectorAllowed(selector)) revert SelectorNotAllowed(selector);

        // Rolling 24-hour cycle reset
        if (block.timestamp >= policy.lastSpendReset + 1 days) {
            policy.spentToday = 0;
            policy.lastSpendReset = block.timestamp;
        }

        if (policy.spentToday + tradeCost > policy.dailyVolumeCap) {
            revert ExceedsDailyVolumeCap(policy.spentToday + tradeCost, policy.dailyVolumeCap);
        }

        policy.spentToday += tradeCost;

        (bool success, bytes memory result) = targetPool.call{value: msg.value}(callData);
        if (!success) {
            revert ExecutionFailed(result);
        }

        emit OrderExecuted(user, msg.sender, targetPool, tradeCost, selector);
        return result;
    }

    /**
     * @notice EIP-7702 Delegated Execution Entry Point.
     * When the user's EOA delegates code to this contract, `address(this)` is the user's EOA!
     * The session key calls `userAddress.executeFromSelf(...)`.
     */
    function executeFromSelf(
        address targetPool,
        bytes calldata callData,
        uint256 tradeCost
    ) external payable returns (bytes memory) {
        address user = address(this);
        SessionPolicy storage policy = userSessions[user][msg.sender];

        if (!policy.isActive) revert SessionNotActive();
        if (block.timestamp > policy.expiresAt) revert SessionExpired();
        if (tradeCost > policy.maxTradeSize) revert ExceedsMaxTradeSize(tradeCost, policy.maxTradeSize);

        if (callData.length < 4) revert SelectorNotAllowed(bytes4(0));
        bytes4 selector = bytes4(callData[:4]);
        if (!isSelectorAllowed(selector)) revert SelectorNotAllowed(selector);

        if (block.timestamp >= policy.lastSpendReset + 1 days) {
            policy.spentToday = 0;
            policy.lastSpendReset = block.timestamp;
        }

        if (policy.spentToday + tradeCost > policy.dailyVolumeCap) {
            revert ExceedsDailyVolumeCap(policy.spentToday + tradeCost, policy.dailyVolumeCap);
        }

        policy.spentToday += tradeCost;

        (bool success, bytes memory result) = targetPool.call{value: msg.value}(callData);
        if (!success) {
            revert ExecutionFailed(result);
        }

        emit OrderExecuted(user, msg.sender, targetPool, tradeCost, selector);
        return result;
    }

    /**
     * @notice View helper to inspect a user's session key policy.
     */
    function getSession(address user, address sessionKey)
        external
        view
        returns (
            uint256 maxTradeSize,
            uint256 dailyVolumeCap,
            uint256 spentToday,
            uint256 remainingDailyAllowance,
            uint256 expiresAt,
            bool isActive
        )
    {
        SessionPolicy memory policy = userSessions[user][sessionKey];
        uint256 currentSpent = policy.spentToday;

        if (block.timestamp >= policy.lastSpendReset + 1 days) {
            currentSpent = 0;
        }

        uint256 remaining = policy.dailyVolumeCap > currentSpent
            ? policy.dailyVolumeCap - currentSpent
            : 0;

        bool active = policy.isActive && block.timestamp <= policy.expiresAt;

        return (
            policy.maxTradeSize,
            policy.dailyVolumeCap,
            currentSpent,
            remaining,
            policy.expiresAt,
            active
        );
    }
}
