// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../core/APEXStrategy.sol";

interface IAsterDEXPro {
    function openPosition(
        address asset,
        bool isShort,
        uint256 notionalSize,
        uint256 leverage,
        uint256 margin
    ) external returns (bytes32 positionId);

    function adjustPosition(bytes32 positionId, int256 notionalDelta) external;
    function closePosition(bytes32 positionId) external returns (uint256 proceeds);
    function getPositionLTV(bytes32 positionId) external view returns (uint256 ltvBps);
    function getFundingAPY(bytes32 positionId) external view returns (uint256 apyBps);
    function getPositionValue(bytes32 positionId) external view returns (uint256 valueBps);
}

interface ILPStrategy {
    function totalAssets() external view returns (uint256);
}

/**
 * @title HedgeStrategy (M4)
 * @notice Opens a 1x delta-neutral BNB short perpetual on AsterDEX Pro
 *         to mathematically offset impermanent loss in the LP strategy (M1).
 * @dev  Hedge ratio: 80% of M1 LP notional.
 *       Auto-deleverages when LTV exceeds 70%.
 */
contract HedgeStrategy is APEXStrategy {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────
    uint256 public constant HEDGE_RATIO_BPS  = 8_000;  // 80% of M1 notional
    uint256 public constant MAX_LTV_BPS      = 7_000;  // 70% — auto-deleverage trigger
    uint256 public constant DELEVERAGE_BPS   = 2_000;  // Reduce 20% on trigger
    uint256 public constant BPS              = 10_000;

    // ── Immutables ────────────────────────────────────────────
    address public immutable WBNB;
    address public immutable USDF;          // Margin collateral
    address public immutable asterDEXPro;
    address public immutable m1Strategy;    // LPYieldStrategy — for notional sizing

    // ── State ─────────────────────────────────────────────────
    bytes32 public positionId;
    uint256 public notionalSize;    // Current BNB notional being hedged
    uint256 public marginPosted;    // USDF posted as collateral
    bool    public isOpen;

    // ── Events ────────────────────────────────────────────────
    event HedgeOpened(bytes32 positionId, uint256 notional, uint256 margin);
    event HedgeAdjusted(bytes32 positionId, int256 notionalDelta);
    event HedgeClosed(bytes32 positionId, uint256 proceeds);
    event AutoDeleveraged(bytes32 positionId, uint256 currentLTV);

    constructor(
        address vault_,
        address brain_,
        address wbnb_,
        address usdf_,
        address asterDEXPro_,
        address m1Strategy_
    ) APEXStrategy(vault_, brain_, wbnb_) {
        WBNB         = wbnb_;
        USDF         = usdf_;
        asterDEXPro  = asterDEXPro_;
        m1Strategy   = m1Strategy_;
    }

    // ── Core Strategy Functions ───────────────────────────────

    /**
     * @notice Post USDF collateral margin and open/adjust a short BNB perp.
     * @param amount Amount of USDF to use as margin.
     */
    function deposit(uint256 amount) external override onlyVault {
        IERC20(USDF).approve(asterDEXPro, 0);
        IERC20(USDF).approve(asterDEXPro, amount);

        uint256 targetNotional = ILPStrategy(m1Strategy).totalAssets() * HEDGE_RATIO_BPS / BPS;

        if (!isOpen) {
            positionId = IAsterDEXPro(asterDEXPro).openPosition(
                WBNB,
                true,           // isShort
                targetNotional,
                1e18,           // 1x leverage — pure hedge
                amount
            );
            notionalSize  = targetNotional;
            marginPosted  = amount;
            isOpen        = true;
            emit HedgeOpened(positionId, targetNotional, amount);
        } else {
            // Position already open — increase margin
            int256 notionalDelta = int256(targetNotional) - int256(notionalSize);
            IAsterDEXPro(asterDEXPro).adjustPosition(positionId, notionalDelta);
            notionalSize = targetNotional;
            marginPosted += amount;
            emit HedgeAdjusted(positionId, notionalDelta);
        }
    }

    /**
     * @notice Withdraw margin by reducing/closing the hedge.
     */
    function withdraw(uint256 amount) external override onlyVault returns (uint256 withdrawn) {
        if (!isOpen) return 0;

        // Close full position and return all proceeds if amount ≥ margin
        if (amount >= marginPosted) {
            uint256 proceeds = IAsterDEXPro(asterDEXPro).closePosition(positionId);
            IERC20(USDF).safeTransfer(vault, proceeds);
            withdrawn    = proceeds;
            isOpen       = false;
            notionalSize = 0;
            marginPosted = 0;
            emit HedgeClosed(positionId, proceeds);
        } else {
            // Partial reduction — shrink the position proportionally
            int256 reduction = int256(notionalSize * amount / marginPosted);
            IAsterDEXPro(asterDEXPro).adjustPosition(positionId, -reduction);
            notionalSize  -= uint256(reduction);
            marginPosted  -= amount;
            IERC20(USDF).safeTransfer(vault, amount);
            withdrawn = amount;
            emit HedgeAdjusted(positionId, -reduction);
        }
    }

    /**
     * @notice Harvest funding rate payments from the short position.
     */
    function harvest() external override returns (uint256 harvested) {
        // Funding income is claimed when checking/adjusting position.
        // Real integration: call AsterDEX Pro's claimFunding() if available.
        // For now: re-sync the hedge size to current M1 notional
        adjustHedge();
        checkLTV();
        return 0; // Funding rate embedded in position value
    }

    // ── Hedge Management (callable by Brain) ──────────────────

    /**
     * @notice Sync hedge notional to current M1 LP exposure.
     */
    function adjustHedge() public onlyBrain {
        if (!isOpen) return;
        uint256 targetNotional = ILPStrategy(m1Strategy).totalAssets() * HEDGE_RATIO_BPS / BPS;
        int256 delta = int256(targetNotional) - int256(notionalSize);
        if (delta == 0) return;
        IAsterDEXPro(asterDEXPro).adjustPosition(positionId, delta);
        notionalSize = targetNotional;
        emit HedgeAdjusted(positionId, delta);
    }

    /**
     * @notice Auto-deleverage: if LTV > 70%, reduce position by 20%.
     */
    function checkLTV() public {
        if (!isOpen) return;
        uint256 ltv = IAsterDEXPro(asterDEXPro).getPositionLTV(positionId);
        if (ltv > MAX_LTV_BPS) {
            uint256 reduction = notionalSize * DELEVERAGE_BPS / BPS;
            IAsterDEXPro(asterDEXPro).adjustPosition(positionId, -int256(reduction));
            notionalSize -= reduction;
            emit AutoDeleveraged(positionId, ltv);
        }
    }

    // ── View Functions ────────────────────────────────────────

    function totalAssets() external view override returns (uint256) {
        if (!isOpen) return 0;
        return marginPosted; // Conservative: margin posted as collateral
    }

    /**
     * @notice Funding APY earned/paid on the short position.
     *         Can be negative (cost of insurance) or positive when funding favors shorts.
     */
    function currentAPY() external view override returns (uint256) {
        if (!isOpen) return 0;
        return IAsterDEXPro(asterDEXPro).getFundingAPY(positionId);
    }
}
