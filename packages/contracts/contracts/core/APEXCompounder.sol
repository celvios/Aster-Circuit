// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IAPEXStrategy.sol";
import "../interfaces/IAPEXBrain.sol";

/**
 * @title APEXCompounder
 * @notice Permissionless compounder — anyone can call compound() to harvest
 *         all strategies and reinvest according to the Brain's optimal allocation.
 * @dev Evolved from AsterCircuit's Heartbeat.sol
 */
contract APEXCompounder is Ownable {
    using SafeERC20 for IERC20;

    // ── Constants ───────────────────────────────────────────────
    uint256 public constant MIN_COMPOUND_THRESHOLD = 1e15; // 0.001 WBNB — no dust harvests
    uint256 public constant BPS                    = 10_000;

    // ── State ───────────────────────────────────────────────────
    address public vault;
    address public brain;
    address public asset;           // WBNB
    address[4] public strategies;
    uint256 public lastCompound;
    uint256 public totalHarvestedAllTime;

    // ── Events ──────────────────────────────────────────────────
    event Compounded(uint256 totalHarvested, uint256 timestamp, uint256[4] reallocation);
    event CompoundSkipped(uint256 harvested, uint256 threshold);

    // ── Errors ──────────────────────────────────────────────────
    error BelowThreshold(uint256 amount, uint256 minimum);

    // ── Constructor ─────────────────────────────────────────────
    constructor(
        address vault_,
        address brain_,
        address asset_,
        address[4] memory strategies_
    ) Ownable(msg.sender) {
        vault       = vault_;
        brain       = brain_;
        asset       = asset_;
        strategies  = strategies_;
    }

    // ── Core ────────────────────────────────────────────────────

    /**
     * @notice Permissionless — anyone can call to trigger a compound cycle.
     * @dev  Step 1: Harvest all four modules.
     *       Step 2: Gate on minimum threshold (skip dusty harvests).
     *       Step 3: Read current optimal weights from Brain.
     *       Step 4: Re-deploy harvested assets proportionally.
     * @return totalHarvested Total WBNB harvested across all strategies.
     */
    function compound() external returns (uint256 totalHarvested) {
        // Step 1: harvest all strategy modules
        for (uint256 i = 0; i < 4; i++) {
            if (strategies[i] == address(0)) continue;
            uint256 harvested = IAPEXStrategy(strategies[i]).harvest();
            totalHarvested += harvested;
        }

        // Step 2: skip if below threshold to avoid wasting gas on dust
        if (totalHarvested < MIN_COMPOUND_THRESHOLD) {
            emit CompoundSkipped(totalHarvested, MIN_COMPOUND_THRESHOLD);
            return totalHarvested;
        }

        // Step 3: get current optimal allocation from Brain
        IAPEXBrain.WeightVector memory w = IAPEXBrain(brain).currentWeights();

        // Step 4: reinvest harvested assets according to weight vector
        uint256[4] memory alloc = [
            totalHarvested * w.lpYield  / BPS,
            totalHarvested * w.staking  / BPS,
            totalHarvested * w.lending  / BPS,
            totalHarvested * w.hedge    / BPS
        ];

        for (uint256 i = 0; i < 4; i++) {
            if (alloc[i] > 0 && strategies[i] != address(0)) {
                IERC20(asset).safeTransfer(strategies[i], alloc[i]);
                IAPEXStrategy(strategies[i]).deposit(alloc[i]);
            }
        }

        totalHarvestedAllTime += totalHarvested;
        lastCompound = block.timestamp;
        emit Compounded(totalHarvested, block.timestamp, alloc);
    }

    // ── Admin ────────────────────────────────────────────────────

    function setStrategy(uint256 index, address strategy_) external onlyOwner {
        require(index < 4, "APEX: invalid index");
        strategies[index] = strategy_;
    }

    function setBrain(address brain_) external onlyOwner { brain = brain_; }
    function setVault(address vault_) external onlyOwner { vault = vault_; }
}
