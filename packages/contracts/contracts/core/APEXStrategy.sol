// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract APEXStrategy {

    address public immutable vault;
    address public immutable brain;
    address public immutable asset;   // WBNB

    constructor(address vault_, address brain_, address asset_) {
        vault = vault_;
        brain = brain_;
        asset = asset_;
    }

    /// @notice Deploy assets into this strategy
    function deposit(uint256 amount) external virtual onlyVault {}

    /// @notice Withdraw assets from this strategy back to vault
    function withdraw(uint256 amount) external virtual onlyVault returns (uint256) {}

    /// @notice Harvest all pending rewards — return harvested amount
    function harvest() external virtual returns (uint256) {}

    /// @notice Total assets currently in this strategy (including unrealised yield)
    function totalAssets() external view virtual returns (uint256) {}

    /// @notice Current APY of this strategy in bps (e.g. 1200 = 12.00%)
    function currentAPY() external view virtual returns (uint256) {}

    modifier onlyVault() {
        require(msg.sender == vault, "APEX: not vault");
        _;
    }

    modifier onlyBrain() {
        require(msg.sender == brain, "APEX: not brain");
        _;
    }
}
