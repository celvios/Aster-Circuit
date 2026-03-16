// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../core/APEXStrategy.sol";

interface IVToken {
    function mint(uint256 mintAmount) external returns (uint256);
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);
    function balanceOfUnderlying(address owner) external returns (uint256);
    function supplyRatePerBlock() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
}

interface IVenusComptroller {
    function claimVenus(address holder) external;
}

interface ISimpleRouter {
    function swapExactTokensForTokens(
        uint amountIn, uint amountOutMin,
        address[] calldata path,
        address to, uint deadline
    ) external returns (uint[] memory amounts);
    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);
}

/**
 * @title LendingStrategy (M3)
 * @notice Supplies WBNB (as USDF/USDT) to Venus Protocol for stable lending yield.
 *         Claims XVS rewards on each harvest cycle and converts to WBNB.
 */
contract LendingStrategy is APEXStrategy {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────
    uint256 public constant BLOCKS_PER_YEAR = 10_512_000; // BSC ~3s blocks
    uint256 public constant BPS             = 10_000;
    uint256 public constant SLIPPAGE_BPS    = 50;

    // ── Immutables ────────────────────────────────────────────
    address public immutable WBNB;
    address public immutable USDF;              // Stablecoin to supply
    address public immutable XVS;               // Venus reward token
    address public immutable vToken;            // vUSDT / vUSDF market
    address public immutable comptroller;       // Venus Comptroller
    address public immutable router;            // For WBNB↔USDF and XVS→WBNB swaps

    // ── State ─────────────────────────────────────────────────
    uint256 public _totalAssets;

    // ── Events ────────────────────────────────────────────────
    event Supplied(uint256 usdfMinted, uint256 wbnbIn);
    event Redeemed(uint256 usdfOut, uint256 wbnbOut);
    event XVSHarvested(uint256 xvsAmount, uint256 wbnbOut);

    constructor(
        address vault_,
        address brain_,
        address wbnb_,
        address usdf_,
        address xvs_,
        address vToken_,
        address comptroller_,
        address router_
    ) APEXStrategy(vault_, brain_, wbnb_) {
        WBNB        = wbnb_;
        USDF        = usdf_;
        XVS         = xvs_;
        vToken      = vToken_;
        comptroller = comptroller_;
        router      = router_;
    }

    // ── Core Strategy Functions ───────────────────────────────

    /**
     * @notice Swap WBNB → USDF, then supply to Venus.
     */
    function deposit(uint256 amount) external override onlyVault {
        // Swap WBNB → USDF
        IERC20(WBNB).approve(router, 0);
        IERC20(WBNB).approve(router, amount);
        address[] memory path = new address[](2);
        path[0] = WBNB;
        path[1] = USDF;
        uint256[] memory amounts = ISimpleRouter(router).swapExactTokensForTokens(
            amount, 0, path, address(this), block.timestamp + 300
        );
        uint256 usdfReceived = amounts[1];

        // Supply to Venus
        IERC20(USDF).approve(vToken, 0);
        IERC20(USDF).approve(vToken, usdfReceived);
        require(IVToken(vToken).mint(usdfReceived) == 0, "Venus: mint failed");
        _totalAssets += amount;
        emit Supplied(usdfReceived, amount);
    }

    /**
     * @notice Redeem from Venus, swap USDF → WBNB, transfer to vault.
     */
    function withdraw(uint256 amount) external override onlyVault returns (uint256 withdrawn) {
        // Calculate USDF equivalent for the requested WBNB amount
        address[] memory path = new address[](2);
        path[0] = WBNB;
        path[1] = USDF;
        uint256[] memory priceOut = ISimpleRouter(router).getAmountsOut(amount, path);
        uint256 usdfNeeded = priceOut[1];

        require(IVToken(vToken).redeemUnderlying(usdfNeeded) == 0, "Venus: redeem failed");

        // Swap USDF → WBNB
        IERC20(USDF).approve(router, 0);
        IERC20(USDF).approve(router, usdfNeeded);
        path[0] = USDF;
        path[1] = WBNB;
        uint256[] memory swapOut = ISimpleRouter(router).swapExactTokensForTokens(
            usdfNeeded, 0, path, address(this), block.timestamp + 300
        );
        withdrawn = swapOut[1];
        IERC20(WBNB).safeTransfer(vault, withdrawn);
        _totalAssets = _totalAssets > amount ? _totalAssets - amount : 0;
        emit Redeemed(usdfNeeded, withdrawn);
    }

    /**
     * @notice Claim XVS rewards, swap to WBNB, return to compounder.
     */
    function harvest() external override returns (uint256 harvested) {
        IVenusComptroller(comptroller).claimVenus(address(this));
        uint256 xvsBal = IERC20(XVS).balanceOf(address(this));
        if (xvsBal == 0) return 0;

        IERC20(XVS).approve(router, 0);
        IERC20(XVS).approve(router, xvsBal);
        address[] memory path = new address[](2);
        path[0] = XVS;
        path[1] = WBNB;
        uint256[] memory amounts = ISimpleRouter(router).swapExactTokensForTokens(
            xvsBal, 0, path, address(this), block.timestamp + 300
        );
        harvested = amounts[1];
        if (harvested > 0) IERC20(WBNB).safeTransfer(msg.sender, harvested);
        emit XVSHarvested(xvsBal, harvested);
    }

    // ── View Functions ────────────────────────────────────────

    function totalAssets() external view override returns (uint256) {
        return _totalAssets;
    }

    /**
     * @notice Venus supply APY from on-chain rate-per-block.
     */
    function currentAPY() external view override returns (uint256) {
        uint256 ratePerBlock = IVToken(vToken).supplyRatePerBlock();
        return ratePerBlock * BLOCKS_PER_YEAR * BPS / 1e18;
    }
}
