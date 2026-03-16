// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../core/APEXStrategy.sol";

// Minimal interface for AsterDEX Router
interface IAsterDEXRouter {
    function addLiquidity(
        address tokenA, address tokenB,
        uint amountADesired, uint amountBDesired,
        uint amountAMin, uint amountBMin,
        address to, uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);

    function removeLiquidity(
        address tokenA, address tokenB,
        uint liquidity,
        uint amountAMin, uint amountBMin,
        address to, uint deadline
    ) external returns (uint amountA, uint amountB);

    function swapExactTokensForTokens(
        uint amountIn, uint amountOutMin,
        address[] calldata path,
        address to, uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);
}

interface IAsterDEXPoolInfo {
    function fees24h() external view returns (uint256);
    function totalLiquidity() external view returns (uint256);
    function collectFees(address recipient) external returns (uint256 feeToken0, uint256 feeToken1);
}

/**
 * @title LPYieldStrategy (M1)
 * @notice AsterDEX BNB/USDF LP yield strategy — primary allocation module.
 * @dev  Inherits APEXStrategy — Brain/Vault control all deposit/withdraw calls.
 *       AsterDEX is the primary AMM; PancakeSwap may be used as a fallback.
 */
contract LPYieldStrategy is APEXStrategy {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────
    uint256 public constant SLIPPAGE_BPS = 50;       // 0.5% max slippage
    uint256 public constant BPS          = 10_000;
    uint256 public constant BLOCKS_PER_YEAR = 10_512_000;

    // ── Immutables ────────────────────────────────────────────
    address public immutable WBNB;
    address public immutable USDF;
    address public immutable asterDEXRouter;
    address public immutable asterDEXPool;   // BNB/USDF pool — for fee reads
    address public immutable lpToken;        // BNB/USDF LP token

    // ── State ─────────────────────────────────────────────────
    uint256 public totalLPHeld;     // LP tokens staked/held by this strategy
    uint256 public _totalAssets;    // WBNB-denominated TVL in this module

    // ── Events ────────────────────────────────────────────────
    event LiquidityAdded(uint256 wbnbIn, uint256 usdfIn, uint256 lpReceived);
    event LiquidityRemoved(uint256 lpBurned, uint256 wbnbOut, uint256 usdfOut);
    event FeesHarvested(uint256 wbnbEquivalent);

    constructor(
        address vault_,
        address brain_,
        address wbnb_,
        address usdf_,
        address asterDEXRouter_,
        address asterDEXPool_,
        address lpToken_
    ) APEXStrategy(vault_, brain_, wbnb_) {
        WBNB           = wbnb_;
        USDF           = usdf_;
        asterDEXRouter = asterDEXRouter_;
        asterDEXPool   = asterDEXPool_;
        lpToken        = lpToken_;
    }

    // ── Core Strategy Functions ───────────────────────────────

    /**
     * @notice Deposit WBNB: split 50/50, swap half to USDF, provide liquidity.
     * @dev  Called by vault or brain. Token must be pre-transferred.
     */
    function deposit(uint256 amount) external override onlyVault {
        // Swap 50% of WBNB → USDF
        uint256 half = amount / 2;
        IERC20(WBNB).approve(asterDEXRouter, 0);
        IERC20(WBNB).approve(asterDEXRouter, amount);

        address[] memory path = new address[](2);
        path[0] = WBNB;
        path[1] = USDF;
        uint256[] memory amountsOut = IAsterDEXRouter(asterDEXRouter).getAmountsOut(half, path);
        uint256 minUsdf = amountsOut[1] * (BPS - SLIPPAGE_BPS) / BPS;

        uint256[] memory swapped = IAsterDEXRouter(asterDEXRouter).swapExactTokensForTokens(
            half, minUsdf, path, address(this), block.timestamp + 300
        );
        uint256 usdfReceived = swapped[1];

        // Add liquidity: WBNB + USDF → LP tokens
        IERC20(USDF).approve(asterDEXRouter, 0);
        IERC20(USDF).approve(asterDEXRouter, usdfReceived);
        (, , uint256 lpReceived) = IAsterDEXRouter(asterDEXRouter).addLiquidity(
            WBNB, USDF,
            half, usdfReceived,
            half * (BPS - SLIPPAGE_BPS) / BPS,
            usdfReceived * (BPS - SLIPPAGE_BPS) / BPS,
            address(this), block.timestamp + 300
        );

        totalLPHeld  += lpReceived;
        _totalAssets += amount;
        emit LiquidityAdded(half, usdfReceived, lpReceived);
    }

    /**
     * @notice Withdraw WBNB: remove proportional LP, swap USDF back to WBNB.
     */
    function withdraw(uint256 amount) external override onlyVault returns (uint256 withdrawn) {
        uint256 lpToRemove = totalLPHeld * amount / _totalAssets;

        IERC20(lpToken).approve(asterDEXRouter, 0);
        IERC20(lpToken).approve(asterDEXRouter, lpToRemove);
        (uint256 wbnbOut, uint256 usdfOut) = IAsterDEXRouter(asterDEXRouter).removeLiquidity(
            WBNB, USDF,
            lpToRemove,
            0, 0,
            address(this), block.timestamp + 300
        );

        // Swap USDF → WBNB
        if (usdfOut > 0) {
            IERC20(USDF).approve(asterDEXRouter, 0);
            IERC20(USDF).approve(asterDEXRouter, usdfOut);
            address[] memory path = new address[](2);
            path[0] = USDF;
            path[1] = WBNB;
            uint256[] memory amounts = IAsterDEXRouter(asterDEXRouter).swapExactTokensForTokens(
                usdfOut, 0, path, address(this), block.timestamp + 300
            );
            wbnbOut += amounts[1];
        }

        IERC20(WBNB).safeTransfer(vault, wbnbOut);
        totalLPHeld  -= lpToRemove;
        _totalAssets  = _totalAssets > amount ? _totalAssets - amount : 0;
        withdrawn = wbnbOut;
        emit LiquidityRemoved(lpToRemove, wbnbOut, usdfOut);
    }

    /**
     * @notice Collect LP fees from AsterDEX pool and return WBNB to compounder.
     */
    function harvest() external override returns (uint256 harvested) {
        (uint256 fee0, uint256 fee1) = IAsterDEXPoolInfo(asterDEXPool).collectFees(address(this));

        // Swap any USDF fees → WBNB
        if (fee1 > 0) {
            IERC20(USDF).approve(asterDEXRouter, 0);
            IERC20(USDF).approve(asterDEXRouter, fee1);
            address[] memory path = new address[](2);
            path[0] = USDF;
            path[1] = WBNB;
            uint256[] memory amounts = IAsterDEXRouter(asterDEXRouter).swapExactTokensForTokens(
                fee1, 0, path, address(this), block.timestamp + 300
            );
            fee0 += amounts[1];
        }

        harvested = fee0;
        if (harvested > 0) IERC20(WBNB).safeTransfer(msg.sender, harvested);
        emit FeesHarvested(harvested);
    }

    // ── View Functions ────────────────────────────────────────

    function totalAssets() external view override returns (uint256) {
        return _totalAssets;
    }

    /**
     * @notice APY = annualised fee yield relative to total liquidity.
     *         fee24h * 365 / totalLiquidity — fully on-chain.
     */
    function currentAPY() external view override returns (uint256) {
        uint256 fee24h = IAsterDEXPoolInfo(asterDEXPool).fees24h();
        uint256 tvl    = IAsterDEXPoolInfo(asterDEXPool).totalLiquidity();
        if (tvl == 0) return 0;
        return fee24h * 365 * BPS / tvl;
    }
}
