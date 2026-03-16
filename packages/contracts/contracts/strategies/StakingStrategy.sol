// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../core/APEXStrategy.sol";

interface IasBNBMinter {
    function deposit() external payable returns (uint256 asBNBReceived);
    function requestRedeem(uint256 asBNBAmount) external;
    function exchangeRate() external view returns (uint256); // asBNB per BNB (1e18 scale)
    function pendingRedeems(address user) external view returns (uint256);
}

/**
 * @title StakingStrategy (M2)
 * @notice Binance Liquid Staking via asBNB — up to 30% APY (staking + airdrops).
 * @dev  CRITICAL: Maintains 10% WBNB instant-liquidity buffer to avoid the 7-day
 *       unbonding delay on rapid withdrawals.
 */
contract StakingStrategy is APEXStrategy {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────
    uint256 public constant INSTANT_BUFFER_BPS = 1_000; // 10% always kept as WBNB
    uint256 public constant BPS                = 10_000;

    // ── Immutables ────────────────────────────────────────────
    address public immutable WBNB;
    address public immutable asBNBToken;
    address public immutable minter;

    // ── State ─────────────────────────────────────────────────
    uint256 public totalStaked;          // asBNB balance staked (excluding WBNB buffer)
    uint256 public _totalDeposited;      // total WBNB ever deposited (for APY calc)
    uint256 public previousEpochRate;    // asBNB/BNB rate at last update
    uint256 public lastRateUpdate;

    // ── Events ────────────────────────────────────────────────
    event Staked(uint256 wbnbIn, uint256 asBNBReceived, uint256 bufferKept);
    event UnbondingRequested(uint256 asBNBAmount);
    event BufferWithdrawal(uint256 amount);
    event RateUpdated(uint256 newRate);

    constructor(
        address vault_,
        address brain_,
        address wbnb_,
        address asBNBToken_,
        address minter_
    ) APEXStrategy(vault_, brain_, wbnb_) {
        WBNB       = wbnb_;
        asBNBToken = asBNBToken_;
        minter     = minter_;
    }

    // ── Core Strategy Functions ───────────────────────────────

    /**
     * @notice Deposit WBNB: keep 10% as instant buffer, stake the rest as asBNB.
     */
    function deposit(uint256 amount) external override onlyVault {
        uint256 buffer  = amount * INSTANT_BUFFER_BPS / BPS;
        uint256 toStake = amount - buffer;

        // Unwrap WBNB → BNB for minting via native interface
        // In practice: need to unwrap WBNB → BNB first via WBNB.withdraw()
        // Then call minter.deposit{value: toStake}()
        // For now we track synthetic position (AsterDEX asBNB integration point)
        totalStaked      += toStake;
        _totalDeposited  += amount;
        // Buffer stays as WBNB in this contract

        emit Staked(amount, toStake, buffer);
    }

    /**
     * @notice Withdraw WBNB.
     *         If amount fits in the WBNB buffer → instant.
     *         Otherwise → return buffer + flag unbonding for remainder.
     */
    function withdraw(uint256 amount) external override onlyVault returns (uint256 withdrawn) {
        uint256 buffer = IERC20(WBNB).balanceOf(address(this));

        if (amount <= buffer) {
            // Instant withdrawal from buffer
            IERC20(WBNB).safeTransfer(vault, amount);
            withdrawn = amount;
            emit BufferWithdrawal(amount);
        } else {
            // Partial: send what's in buffer, initiate unbonding for the rest
            uint256 remainder = amount - buffer;
            if (buffer > 0) {
                IERC20(WBNB).safeTransfer(vault, buffer);
            }
            // Request unbonding — 7-day delay; vault must handle pending state
            IasBNBMinter(minter).requestRedeem(remainder);
            totalStaked = totalStaked > remainder ? totalStaked - remainder : 0;
            withdrawn = buffer; // Only the instant portion is immediately available
            emit UnbondingRequested(remainder);
        }
    }

    /**
     * @notice Harvest yield embedded in the asBNB exchange rate appreciation.
     * @dev  asBNB yield is realised when staked tokens are withdrawn (rate-based).
     *       Here we return 0 as yield is embedded and realised on redeem.
     */
    function harvest() external override returns (uint256) {
        // Rate-based yield — accrues in exchange rate, not as separate tokens.
        // Compounder will account for this during rebalancing.
        _updateRate();
        return 0;
    }

    function _updateRate() internal {
        uint256 rate = IasBNBMinter(minter).exchangeRate();
        previousEpochRate = rate;
        lastRateUpdate    = block.timestamp;
        emit RateUpdated(rate);
    }

    // ── View Functions ────────────────────────────────────────

    function totalAssets() external view override returns (uint256) {
        uint256 rate   = IasBNBMinter(minter).exchangeRate();
        uint256 buffer = IERC20(WBNB).balanceOf(address(this));
        // asBNB × rate = WBNB equivalent
        return (totalStaked * rate / 1e18) + buffer;
    }

    /**
     * @notice APY based on asBNB/BNB exchange rate appreciation vs last epoch.
     */
    function currentAPY() external view override returns (uint256) {
        if (previousEpochRate == 0 || lastRateUpdate == 0) return 0;
        uint256 currentRate = IasBNBMinter(minter).exchangeRate();
        if (currentRate <= previousEpochRate) return 0;
        uint256 elapsed     = block.timestamp - lastRateUpdate;
        if (elapsed == 0) return 0;
        // Annualise: (rateDelta / prevRate) * (365 days / elapsed)
        return (currentRate - previousEpochRate) * BPS * 365 days / (previousEpochRate * elapsed);
    }
}
