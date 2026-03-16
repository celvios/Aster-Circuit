// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IAPEXVault.sol";
import "../interfaces/IAPEXStrategy.sol";
import "../interfaces/IAPEXBrain.sol";
import "../interfaces/IAsterDEXPool.sol";

contract APEXBrain is IAPEXBrain {

    // ── Constants ──────────────────────────────────────────────
    uint256 public constant MIN_REBALANCE_INTERVAL  = 3600;   // 1 hour
    uint256 public constant MIN_REBALANCE_THRESHOLD = 200;    // 2% in bps
    uint256 public constant BPS                     = 10_000;

    // ── Structs ────────────────────────────────────────────────
    struct Signals {
        uint256 apyDifferential;    // Max APY - Min APY across strategies (bps)
        uint256 volatilityIndex;    // 24h BNB price deviation from TWAP (bps)
        uint256 capitalUtilization; // % of vault capital deployed (bps)
    }

    // ── State ──────────────────────────────────────────────────
    address public vault;
    address[4] public strategies;
    address public asterDEXPool;      // For TWAP reads
    WeightVector public _currentWeights;
    uint256 public lastRebalance;

    // ── Constructor ────────────────────────────────────────────
    constructor(
        address vault_,
        address[4] memory strategies_,
        address asterDEXPool_
    ) {
        vault       = vault_;
        strategies  = strategies_;
        asterDEXPool = asterDEXPool_;
        // Default weights: balanced regime
        _currentWeights = WeightVector(2500, 3500, 2000, 2000);
    }

    function currentWeights() external view override returns (WeightVector memory) {
        return _currentWeights;
    }

    // ── Core ───────────────────────────────────────────────────

    /// @notice Permissionless rebalance. Anyone can call.
    function rebalance() external {
        require(
            block.timestamp >= lastRebalance + MIN_REBALANCE_INTERVAL,
            "APEXBrain: TooSoon"
        );

        Signals memory signals = readSignals();
        WeightVector memory newWeights = _computeWeightsInternal(signals);

        require(
            _weightDelta(_currentWeights, newWeights) >= MIN_REBALANCE_THRESHOLD,
            "APEXBrain: DeltaTooSmall"
        );

        _executeRebalance(_currentWeights, newWeights);

        emit WeightsUpdated(_currentWeights, newWeights, signals);
        _currentWeights = newWeights;
        lastRebalance  = block.timestamp;

        IAPEXVault(vault).sync();
    }

    // ── Signal Reading (all on-chain) ──────────────────────────

    function readSignals() public view returns (Signals memory) {
        return Signals({
            apyDifferential:    _readAPYDifferential(),
            volatilityIndex:    _readVolatilityIndex(),
            capitalUtilization: _readCapitalUtilization()
        });
    }

    function _readAPYDifferential() internal view returns (uint256) {
        uint256 maxAPY; 
        uint256 minAPY = type(uint256).max;
        for (uint256 i = 0; i < 4; i++) {
            uint256 apy = IAPEXStrategy(strategies[i]).currentAPY();
            if (apy > maxAPY) maxAPY = apy;
            if (apy < minAPY) minAPY = apy;
        }
        return maxAPY - minAPY;
    }

    function _readVolatilityIndex() internal view returns (uint256) {
        // Compare AsterDEX spot price vs 24h TWAP
        uint256 spot  = IAsterDEXPool(asterDEXPool).getSpotPrice();
        uint256 twap  = IAsterDEXPool(asterDEXPool).getTWAP(86400);
        uint256 delta = spot > twap ? spot - twap : twap - spot;
        if (twap == 0) return 0; // prevent div by zero
        return delta * BPS / twap;
    }

    function _readCapitalUtilization() internal view returns (uint256) {
        uint256 totalVault = IAPEXVault(vault).totalAssets();
        if (totalVault == 0) return 0;
        uint256 deployed;
        for (uint256 i = 0; i < 4; i++) {
            deployed += IAPEXStrategy(strategies[i]).totalAssets();
        }
        return deployed * BPS / totalVault;
    }

    // ── Weight Computation ─────────────────────────────────────

    function _computeWeightsInternal(Signals memory s) internal pure returns (WeightVector memory) {

        // HIGH VOLATILITY REGIME (vol > 5%)
        if (s.volatilityIndex > 500) {
            return WeightVector(1000, 5000, 3000, 1000);
        }

        // LOW VOL + HIGH APY SPREAD (spread > 3%)
        if (s.volatilityIndex <= 500 && s.apyDifferential > 300) {
            return WeightVector(4000, 2500, 1000, 2500);
        }

        // IDLE CAPITAL DETECTED (< 80% utilization)
        if (s.capitalUtilization < 8000) {
            // Force more into lending to deploy idle capital
            return WeightVector(2000, 3000, 4000, 1000);
        }

        // DEFAULT: balanced
        return WeightVector(2500, 3500, 2000, 2000);
    }
    
    function computeWeights() external view override returns (WeightVector memory) {
        Signals memory signals = readSignals();
        return _computeWeightsInternal(signals);
    }

    // ── Rebalance Execution ────────────────────────────────────

    function _executeRebalance(WeightVector memory old_, WeightVector memory new_) internal {
        uint256 total = IAPEXVault(vault).totalAssets();

        uint256[4] memory oldAlloc = [
            old_.lpYield * total / BPS,
            old_.staking * total / BPS,
            old_.lending * total / BPS,
            old_.hedge   * total / BPS
        ];
        uint256[4] memory newAlloc = [
            new_.lpYield * total / BPS,
            new_.staking * total / BPS,
            new_.lending * total / BPS,
            new_.hedge   * total / BPS
        ];

        // Step 1: withdraw from over-allocated strategies first
        for (uint256 i = 0; i < 4; i++) {
            if (oldAlloc[i] > newAlloc[i]) {
                IAPEXStrategy(strategies[i]).withdraw(oldAlloc[i] - newAlloc[i]);
            }
        }

        // Step 2: deposit into under-allocated strategies
        for (uint256 i = 0; i < 4; i++) {
            if (newAlloc[i] > oldAlloc[i]) {
                IAPEXStrategy(strategies[i]).deposit(newAlloc[i] - oldAlloc[i]);
            }
        }
    }

    function _weightDelta(WeightVector memory a, WeightVector memory b)
        internal pure returns (uint256)
    {
        uint256 delta;
        delta += a.lpYield > b.lpYield ? a.lpYield - b.lpYield : b.lpYield - a.lpYield;
        delta += a.staking > b.staking ? a.staking - b.staking : b.staking - a.staking;
        delta += a.lending > b.lending ? a.lending - b.lending : b.lending - a.lending;
        delta += a.hedge   > b.hedge   ? a.hedge   - b.hedge   : b.hedge   - a.hedge;
        return delta / 4; // average delta across modules
    }

    // ── Events ─────────────────────────────────────────────────
    event WeightsUpdated(WeightVector oldWeights, WeightVector newWeights, Signals signals);
    event RebalanceSkipped(string reason);
}
