// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC6909Minimal {
    function isOperator(address owner, address spender) external view returns (bool);
    function setOperator(address spender, bool approved) external returns (bool);
}

interface IBinaryModuleMinimal {
    function redeem(uint32 operatorId, bytes32 venueId, bytes32 marketId, uint8 outcomeIdx, uint256 amount) external;
}

/**
 * @title DreamPulseSessionAccount
 * @notice Per-user non-custodial trading smart account (deployed as an
 * EIP-1167 clone per user by DreamPulseSessionAccountFactory) for Somnia
 * Shannon Testnet & DreamDEX event contracts.
 *
 * Production model:
 *  - The user makes ONE permanent ERC20 approval (user -> clone). It covers
 *    every current and future pool: pools rotate per market and can never be
 *    pre-approved individually.
 *  - The clone trades AS ITSELF (self-send placeBinaryOrder / cancelOrder /
 *    reduceOrder). No OperatorPermissionsRegistry grant is needed anywhere,
 *    and no EOA ever holds user funds.
 *  - The backend holds only weak ephemeral session keys. Each key enforces
 *    maxTradeSize ($500 ceiling), a 24h rolling dailyVolumeCap ($5k ceiling)
 *    and expiry (30d ceiling) ON-CHAIN, plus a strict trading-selector
 *    allowlist.
 *  - Withdrawals are owner-only AND pinned to the owner address: even a
 *    compromised session key or a phished owner signature on this contract
 *    cannot move funds anywhere except back to the owner's own wallet.
 *    There is deliberately NO session-key withdrawal path.
 *  - Escrow accounting needs no bookkeeping: pulls flow user -> clone ->
 *    pool, fills auto-deliver back to the clone (it is the order owner), so
 *    withdrawing the clone's full token balance is always safe. Funds locked
 *    on the CLOB simply are not in the clone balance and are withdrawable
 *    after they auto-deliver back (cancel/expiry/fill).
 *  - Every external call target is allowlisted on-chain (SEC-03): `executeOrder`
 *    only forwards to pools approved by the canonical BinarySettlement registry
 *    (`isPoolApproved`) or explicitly allowlisted by the owner, and
 *    `redeemWinnings` only talks to the pinned `trustedModule`. A compromised
 *    session key therefore cannot redirect approvals or token-operator grants
 *    to an attacker contract.
 *  - `executeOrder`, `redeemWinnings` and `withdraw` are reentrancy-guarded:
 *    a malicious pool cannot re-enter the clone mid-trade to double-spend
 *    session caps or drain funds.
 */
contract DreamPulseSessionAccount {
    // Minimal reentrancy guard (self-contained: this file compiles with plain
    // solc standard-JSON and cannot import OpenZeppelin). State starts at 0
    // for already-deployed clones, which is treated as NOT_ENTERED.
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    struct SessionPolicy {
        uint256 maxTradeSize;   // Collateral units (6 decimals for tUSDC)
        uint256 dailyVolumeCap; // Collateral units per 24h rolling window
        uint256 spentToday;
        uint256 lastSpendReset;
        uint256 expiresAt;
        bool isActive;
    }

    address public owner;
    address public collateral;
    address public feeRecipient;
    bool private initialized;

    // SEC-03 pool allowlist. `poolRegistry` is the canonical DreamDEX
    // BinarySettlement contract exposing `isPoolApproved(address) -> bool`.
    // `authorizedPools` is an owner-curated emergency/extension allowlist
    // (covers pre-registry clones while `poolRegistry` is unset, and any
    // future pool type the registry does not track). Either source passing
    // authorizes the pool; when `poolRegistry` is set, a pool it does NOT
    // approve is rejected even if it speaks the pool ABI (an attacker
    // contract can fake view functions but cannot fake registry approval).
    address public poolRegistry;
    // Canonical BinaryModule for `redeemWinnings`. Zero = legacy permissive
    // mode (pre-migration clones); once set, only that module is callable.
    address public trustedModule;
    mapping(address => bool) public authorizedPools;

    // Reentrancy status. Appended after all pre-existing storage so deployed
    // EIP-1167 clones keep their layout (their slot reads 0 = NOT_ENTERED).
    uint256 private _reentrancyStatus;

    // sessionKey => SessionPolicy
    mapping(address => SessionPolicy) public sessionPolicies;

    uint256 public constant MAX_ALLOWED_TRADE_SIZE = 500 * 1e6;
    uint256 public constant MAX_ALLOWED_DAILY_CAP = 5000 * 1e6;
    uint256 public constant MAX_SESSION_DURATION = 30 days;

    // Minimum withdrawal amount: 1 tUSDC (6 decimals)
    uint256 public constant MIN_WITHDRAWAL_AMOUNT = 1 * 1e6;
    // Protocol withdrawal fee: 1 tUSDC (6 decimals)
    uint256 public constant WITHDRAWAL_FEE = 1 * 1e6;

    // Self-send trading selectors (the clone IS the order owner).
    bytes4 public constant SELECTOR_PLACE_BINARY_ORDER = 0x718c2d4d;
    bytes4 public constant SELECTOR_CANCEL_ORDER = 0xdbc91396;
    bytes4 public constant SELECTOR_REDUCE_ORDER = 0x33407b60;
    bytes4 public constant SELECTOR_PLACE_BINARY_ORDER_FOR = 0x5d97c566;
    bytes4 public constant SELECTOR_CANCEL_ORDER_FOR = 0xe37b444b;
    bytes4 public constant SELECTOR_REDUCE_ORDER_FOR = 0x364c2587;
    bytes4 public constant SELECTOR_PLACE_ORDER = 0x1f5c66b6;
    bytes4 public constant SELECTOR_PLACE_ORDER_FOR = 0x80054449;
    bytes4 public constant SELECTOR_PLACE_BINARY_ORDER_LEGACY = 0x41e8c07e;
    bytes4 public constant SELECTOR_CANCEL_ORDER_LEGACY = 0x2e1a7d4d;
    bytes4 public constant SELECTOR_REDUCE_ORDER_LEGACY = 0x98150493;

    event SessionAuthorized(
        address indexed user,
        address indexed sessionKey,
        uint256 maxTradeSize,
        uint256 dailyVolumeCap,
        uint256 expiresAt
    );
    event SessionRevoked(address indexed user, address indexed sessionKey);
    event OrderExecuted(
        address indexed user,
        address indexed sessionKey,
        address indexed targetPool,
        uint256 tradeCost,
        bytes4 selector
    );
    event WinningsRedeemed(
        address indexed user,
        bytes32 indexed marketId,
        uint256 amount,
        address indexed caller
    );
    event Withdrawn(address indexed user, address indexed token, uint256 amount, uint256 fee);
    event PoolRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event TrustedModuleUpdated(address indexed oldModule, address indexed newModule);
    event PoolAuthorizationUpdated(address indexed pool, bool allowed);

    error NotOwner();
    error AlreadyInitialized();
    error SessionNotActive();
    error SessionExpired();
    error ExceedsMaxTradeSize(uint256 requested, uint256 maxAllowed);
    error ExceedsDailyVolumeCap(uint256 requestedTotal, uint256 dailyCap);
    error SelectorNotAllowed(bytes4 selector);
    error ExecutionFailed(bytes revertReason);
    error InvalidSessionKey();
    error InvalidDuration();
    error InvalidCapLimits();
    error TransferFailed();
    error InvalidRecipient();
    error WithdrawalTooSmall(uint256 amount, uint256 minRequired);
    error InvalidPool(address pool);
    error InvalidModule(address module);
    error ReentrantCall();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_reentrancyStatus == _ENTERED) revert ReentrantCall();
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    /**
     * @notice One-time initializer, called atomically by the factory in the
     * same transaction as deployment.
     * @dev 3-arg overload kept for backward compatibility (registry/module
     * left unset; the owner must call setPoolRegistry/setTrustedModule to
     * enable SEC-03 enforcement on such clones).
     */
    function init(address _owner, address _collateral, address _feeRecipient) external {
        init(_owner, _collateral, _feeRecipient, address(0), address(0));
    }

    /**
     * @notice One-time initializer with SEC-03 pool-registry pinning.
     * The factory passes its canonical `poolRegistry` (BinarySettlement) and
     * `trustedModule` (BinaryModule) so new clones are protected from birth.
     */
    function init(
        address _owner,
        address _collateral,
        address _feeRecipient,
        address _poolRegistry,
        address _trustedModule
    ) public {
        if (initialized) revert AlreadyInitialized();
        if (_owner == address(0) || _collateral == address(0)) revert InvalidSessionKey();
        initialized = true;
        owner = _owner;
        collateral = _collateral;
        feeRecipient = _feeRecipient;
        poolRegistry = _poolRegistry;
        trustedModule = _trustedModule;
    }

    /**
     * @notice Pin or rotate the canonical pool registry (BinarySettlement).
     * Owner-only. Pass address(0) to fall back to explicit-allowlist mode.
     */
    function setPoolRegistry(address _registry) external onlyOwner {
        if (_registry != address(0) && _registry.code.length == 0) revert InvalidPool(_registry);
        emit PoolRegistryUpdated(poolRegistry, _registry);
        poolRegistry = _registry;
    }

    /**
     * @notice Pin or rotate the canonical redeem module (BinaryModule).
     * Owner-only. While unset (address(0)), any module is accepted for
     * backward compatibility with pre-migration clones.
     */
    function setTrustedModule(address _module) external onlyOwner {
        if (_module != address(0) && _module.code.length == 0) revert InvalidModule(_module);
        emit TrustedModuleUpdated(trustedModule, _module);
        trustedModule = _module;
    }

    /**
     * @notice Explicitly allowlist or delist a pool contract. Owner-only.
     * EOAs and the zero address can never be allowlisted: approving an EOA
     * would let its key holder pull clone funds via transferFrom.
     */
    function setPoolAuthorization(address pool, bool allowed) external onlyOwner {
        if (pool.code.length == 0) revert InvalidPool(pool);
        authorizedPools[pool] = allowed;
        emit PoolAuthorizationUpdated(pool, allowed);
    }

    /**
     * @notice Returns true when `pool` may receive trades from this clone:
     * explicitly allowlisted by the owner, or approved by the canonical
     * on-chain registry. Fail-closed: unknown registries, reverted
     * staticcalls and malformed returndata all yield false.
     */
    function isPoolAuthorized(address pool) public view returns (bool) {
        if (pool == address(0)) return false;
        if (authorizedPools[pool]) return true;
        address registry = poolRegistry;
        if (registry == address(0)) return false;
        (bool ok, bytes memory ret) = registry.staticcall(
            abi.encodeWithSignature("isPoolApproved(address)", pool)
        );
        if (!ok || ret.length < 32) return false;
        return abi.decode(ret, (bool));
    }

    /**
     * @notice Authorize an ephemeral session key with explicit on-chain risk caps.
     */
    function authorizeSession(
        address sessionKey,
        uint256 maxTradeSize,
        uint256 dailyVolumeCap,
        uint256 durationSec
    ) external onlyOwner {
        if (sessionKey == address(0) || sessionKey == owner) revert InvalidSessionKey();
        if (durationSec == 0 || durationSec > MAX_SESSION_DURATION) revert InvalidDuration();
        if (maxTradeSize == 0 || maxTradeSize > MAX_ALLOWED_TRADE_SIZE) revert InvalidCapLimits();
        if (dailyVolumeCap < maxTradeSize || dailyVolumeCap > MAX_ALLOWED_DAILY_CAP) revert InvalidCapLimits();

        uint256 expiresAt = block.timestamp + durationSec;
        sessionPolicies[sessionKey] = SessionPolicy({
            maxTradeSize: maxTradeSize,
            dailyVolumeCap: dailyVolumeCap,
            spentToday: 0,
            lastSpendReset: block.timestamp,
            expiresAt: expiresAt,
            isActive: true
        });

        emit SessionAuthorized(owner, sessionKey, maxTradeSize, dailyVolumeCap, expiresAt);
    }

    /**
     * @notice Revoke a session key in one transaction from the owner's wallet.
     */
    function revokeSession(address sessionKey) external onlyOwner {
        sessionPolicies[sessionKey].isActive = false;
        emit SessionRevoked(owner, sessionKey);
    }

    function isSelectorAllowed(bytes4 selector) public pure returns (bool) {
        return (
            selector == SELECTOR_PLACE_BINARY_ORDER ||
            selector == SELECTOR_CANCEL_ORDER ||
            selector == SELECTOR_REDUCE_ORDER ||
            selector == SELECTOR_PLACE_BINARY_ORDER_FOR ||
            selector == SELECTOR_CANCEL_ORDER_FOR ||
            selector == SELECTOR_REDUCE_ORDER_FOR ||
            selector == SELECTOR_PLACE_ORDER ||
            selector == SELECTOR_PLACE_ORDER_FOR ||
            selector == SELECTOR_PLACE_BINARY_ORDER_LEGACY ||
            selector == SELECTOR_CANCEL_ORDER_LEGACY ||
            selector == SELECTOR_REDUCE_ORDER_LEGACY
        );
    }

    /**
     * @notice Execute a self-send trading call as the clone (the order owner).
     * Draws from existing clone balance first (compounding winnings), pulls any
     * shortfall from the owner via the one-time clone approval, tops up the
     * pool allowance for exactly this trade, forwards the call, then zeroes
     * the residual pool allowance so no standing approval remains.
     * @dev SEC-03: `targetPool` must be authorized (registry-approved or
     * owner-allowlisted) BEFORE any approval is granted: a compromised
     * session key cannot point the clone at an attacker contract to siphon
     * `tradeCost` via the just-granted allowance. Reentrancy-guarded so a
     * malicious pool cannot re-enter mid-trade.
     */
    function executeOrder(
        address targetPool,
        bytes calldata callData,
        uint256 tradeCost
    ) external payable nonReentrant returns (bytes memory) {
        SessionPolicy storage policy = sessionPolicies[msg.sender];

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

        // SEC-03: validate the pool BEFORE pulling funds or granting the
        // per-trade approval. Caps are enforced first so existing
        // over-cap/expired/selector reverts keep their behavior.
        if (!isPoolAuthorized(targetPool)) revert InvalidPool(targetPool);

        if (tradeCost > 0) {
            uint256 currentBal = IERC20Minimal(collateral).balanceOf(address(this));
            if (currentBal < tradeCost) {
                uint256 needed = tradeCost - currentBal;
                if (!IERC20Minimal(collateral).transferFrom(owner, address(this), needed)) revert TransferFailed();
            }
            _approveExact(targetPool, tradeCost);
        }

        (bool success, bytes memory result) = targetPool.call{value: msg.value}(callData);
        if (!success) revert ExecutionFailed(result);

        // Zero any residual pool allowance: pools only ever hold an allowance
        // for the duration of this call.
        _approveZero(targetPool);

        emit OrderExecuted(owner, msg.sender, targetPool, tradeCost, selector);
        return result;
    }

    /**
     * @notice Redeem the clone's winning outcome tokens to its own balance.
     * Permissionless by design: the payout can only land in the clone, which
     * only the owner can withdraw from — anyone (e.g. the backend sweeper)
     * may trigger it, nobody can steal through it.
     * @dev SEC-03: `module` is pinned to `trustedModule` once set. Without
     * the pin, this permissionless entry point would let anyone grant an
     * attacker contract ERC-6909 operator rights over the clone's outcome
     * tokens via the setOperator call below.
     */
    function redeemWinnings(
        address module,
        address outcomeToken,
        bytes32 marketId,
        uint8 outcomeIdx,
        uint256 amount
    ) external nonReentrant {
        if (trustedModule != address(0) && module != trustedModule) revert InvalidModule(module);
        if (!IERC6909Minimal(outcomeToken).isOperator(address(this), module)) {
            IERC6909Minimal(outcomeToken).setOperator(module, true);
        }
        IBinaryModuleMinimal(module).redeem(0, bytes32(0), marketId, outcomeIdx, amount);
        emit WinningsRedeemed(owner, marketId, amount, msg.sender);
    }

    /**
     * @notice Withdraw tokens to the owner. Owner-only and pinned to the
     * owner address: funds can never exit to anywhere else through this
     * contract, even with a compromised session key.
     * Enforces minimum 1 tUSDC withdrawal and deducts 1 tUSDC withdrawal fee for collateral.
     */
    function withdraw(address token, uint256 amount) external onlyOwner nonReentrant {
        if (token == collateral) {
            if (amount < MIN_WITHDRAWAL_AMOUNT) revert WithdrawalTooSmall(amount, MIN_WITHDRAWAL_AMOUNT);
            uint256 fee = WITHDRAWAL_FEE;
            uint256 netAmount = amount > fee ? amount - fee : 0;
            if (feeRecipient != address(0) && fee > 0) {
                if (!IERC20Minimal(token).transfer(feeRecipient, fee)) revert TransferFailed();
            }
            if (netAmount > 0) {
                if (!IERC20Minimal(token).transfer(owner, netAmount)) revert TransferFailed();
            }
            emit Withdrawn(owner, token, amount, fee);
        } else {
            if (!IERC20Minimal(token).transfer(owner, amount)) revert TransferFailed();
            emit Withdrawn(owner, token, amount, 0);
        }
    }

    /**
     * @notice Withdraw native STT (e.g. leftover gas sponsorship) to the owner.
     */
    function withdrawNative() external onlyOwner nonReentrant {
        uint256 bal = address(this).balance;
        (bool ok, ) = payable(owner).call{value: bal}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(owner, address(0), bal, 0);
    }

    function getSession(address sessionKey)
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
        SessionPolicy memory policy = sessionPolicies[sessionKey];
        uint256 currentSpent = policy.spentToday;
        if (block.timestamp >= policy.lastSpendReset + 1 days) {
            currentSpent = 0;
        }
        uint256 remaining = policy.dailyVolumeCap > currentSpent
            ? policy.dailyVolumeCap - currentSpent
            : 0;
        bool active = policy.isActive && block.timestamp <= policy.expiresAt;
        return (policy.maxTradeSize, policy.dailyVolumeCap, currentSpent, remaining, policy.expiresAt, active);
    }

    function _approveExact(address spender, uint256 amount) internal {
        uint256 cur = IERC20Minimal(collateral).allowance(address(this), spender);
        if (cur < amount) {
            if (cur > 0) {
                IERC20Minimal(collateral).approve(spender, 0);
            }
            if (!IERC20Minimal(collateral).approve(spender, amount)) revert TransferFailed();
        }
    }

    function _approveZero(address spender) internal {
        uint256 cur = IERC20Minimal(collateral).allowance(address(this), spender);
        if (cur > 0) {
            IERC20Minimal(collateral).approve(spender, 0);
        }
    }
}

/**
 * @title DreamPulseSessionAccountFactory
 * @notice Deploys one EIP-1167 minimal-proxy trading account per user with
 * CREATE2. Anyone (e.g. the backend operator sponsoring testnet gas) may
 * deploy for a user: init() pins the owner atomically in the same call, so a
 * deployer can never claim someone else's account.
 * Per-user nonces make each deployment salt unique, so a squatted address
 * can never brick a user — they simply deploy again at the next nonce.
 */
contract DreamPulseSessionAccountFactory {
    address public immutable implementation;
    address public feeRecipient;
    address public owner;
    // Canonical SEC-03 trust anchors forwarded to every new clone at deploy
    // time: BinarySettlement registry (`isPoolApproved`) and BinaryModule.
    // Zero until the factory owner configures them; clones deployed while
    // zero fall back to owner-allowlist mode until migrated.
    address public poolRegistry;
    address public trustedModule;

    // user => clone
    mapping(address => address) public accounts;
    // user => deployments so far (salt nonce)
    mapping(address => uint256) public userNonces;

    event AccountDeployed(address indexed user, address indexed account, uint256 nonce);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event PoolRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event TrustedModuleUpdated(address indexed oldModule, address indexed newModule);

    error DeploymentFailed();
    error NotOwner();
    error InvalidAddress();

    constructor(address _implementation, address _feeRecipient) {
        implementation = _implementation;
        feeRecipient = _feeRecipient;
        owner = msg.sender;
    }

    function setFeeRecipient(address _newFeeRecipient) external {
        if (msg.sender != owner) revert NotOwner();
        emit FeeRecipientUpdated(feeRecipient, _newFeeRecipient);
        feeRecipient = _newFeeRecipient;
    }

    /**
     * @notice Set the canonical pool registry forwarded to new clones.
     * Must be a contract (the BinarySettlement `isPoolApproved` registry).
     */
    function setPoolRegistry(address _registry) external {
        if (msg.sender != owner) revert NotOwner();
        if (_registry != address(0) && _registry.code.length == 0) revert InvalidAddress();
        emit PoolRegistryUpdated(poolRegistry, _registry);
        poolRegistry = _registry;
    }

    /**
     * @notice Set the canonical redeem module forwarded to new clones.
     * Must be a contract (the BinaryModule).
     */
    function setTrustedModule(address _module) external {
        if (msg.sender != owner) revert NotOwner();
        if (_module != address(0) && _module.code.length == 0) revert InvalidAddress();
        emit TrustedModuleUpdated(trustedModule, _module);
        trustedModule = _module;
    }

    function _proxyInitCode() internal view returns (bytes memory) {
        // Canonical EIP-1167 minimal proxy init code with the implementation
        // inlined as raw 20 bytes (NOT left-padded to 32).
        return abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            bytes20(uint160(implementation)),
            hex"5af43d82803e903d91602b57fd5bf3"
        );
    }

    function _saltFor(address user, uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(user, nonce));
    }

    /**
     * @notice Deploy the user's next account and init it to `user` with
     * `collateral` atomically. Squatted addresses (pre-deployed by someone
     * else at a predicted salt) are skipped automatically: a failed create2
     * or a failed owner-pinned init advances to the next nonce, so a user
     * can never be bricked.
     */
    function deployFor(address user, address collateral) external returns (address account) {
        bytes memory initCode = _proxyInitCode();
        for (uint256 i = 0; i < 5; i++) {
            uint256 nonce = userNonces[user];
            bytes32 salt = _saltFor(user, nonce);
            assembly {
                account := create2(0, add(initCode, 0x20), mload(initCode), salt)
            }
            userNonces[user] = nonce + 1;
            if (account == address(0)) continue;
            try DreamPulseSessionAccount(account).init(user, collateral, feeRecipient, poolRegistry, trustedModule) {} catch {
                continue;
            }
            // Reaching here with a foreign owner means a squatted,
            // attacker-initialized clone: skip it rather than mis-record.
            if (DreamPulseSessionAccount(account).owner() != user) continue;
            accounts[user] = account;
            emit AccountDeployed(user, account, nonce);
            return account;
        }
        revert DeploymentFailed();
    }

    /**
     * @notice Predict the address of a user's NEXT undeployed account.
     */
    function predictFor(address user) external view returns (address predicted) {
        bytes32 salt = _saltFor(user, userNonces[user]);
        bytes32 initCodeHash = keccak256(_proxyInitCode());
        predicted = address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash))))
        );
    }
}
