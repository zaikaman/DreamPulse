// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IOperatorRegistry {
    function setOperatorApprovalForPool(address pool, address operator, bytes4[] calldata selectors, bool approved) external;
    function setOperatorApprovalGlobal(address operator, bytes4[] calldata selectors, bool approved) external;
}

contract BatchApprove {
    function batchApprove(address token, address[] calldata pools, uint256 amount) external {
        for (uint i = 0; i < pools.length; i++) {
            IERC20(token).approve(pools[i], amount);
        }
    }
    function batchSetOperatorApprovalForPool(address registry, address[] calldata pools, address operator, bytes4[] calldata selectors) external {
        for (uint i = 0; i < pools.length; i++) {
            IOperatorRegistry(registry).setOperatorApprovalForPool(pools[i], operator, selectors, true);
        }
    }
    function batchBoth(address token, address registry, address[] calldata pools, address operator, bytes4[] calldata selectors, uint256 amount) external {
        for (uint i = 0; i < pools.length; i++) {
            IOperatorRegistry(registry).setOperatorApprovalForPool(pools[i], operator, selectors, true);
            IERC20(token).approve(pools[i], amount);
        }
    }
    // Single approve(operator) for TestUSDC — one MAX that covers all future pools via transferFrom through operator
    function approveOperator(address token, address operator, uint256 amount) external {
        IERC20(token).approve(operator, amount);
    }
    // Called by operator on user's delegated EOA to approve a *new* pool that appeared after initial batch — no user popup
    function operatorBatchForPool(address token, address registry, address pool, address operator, bytes4[] calldata selectors, uint256 amount) external {
        IOperatorRegistry(registry).setOperatorApprovalForPool(pool, operator, selectors, true);
        IERC20(token).approve(pool, amount);
    }
}
