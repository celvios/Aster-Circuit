// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../core/APEXStrategy.sol";

interface IWBNB {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

/// @notice Venus vBNB market — accepts native BNB
interface IVBnb {
    function mint() external payable;
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);
    function supplyRatePerBlock() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
}

interface IVenusComptroller {
    function claimVenus(address holder) external;
}

interface IPancakeRouter {
    function swapExactTokensForTokens(
        uint amountIn, uint amountOutMin,
        address[] calldata path,
        address to, uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);
}

/**
 * @title VenusDirectLendingStrategy (M3)
 * @notice Supplies BNB to Venus vBNB market earning lending yield.
 *
 * DEPOSIT FLOW (two patterns supported):
 *   A) Brain calls vault.allocateToStrategy(2, amount)
 *        → vault pushes WBNB to this contract
 *      Then Brain calls strategy.deposit(amount)
 *        → strategy uses WBNB already in contract
 *
 *   B) Vault calls strategy.deposit(amount) directly
 *        → strategy pulls WBNB from vault via transferFrom
 *
 * AUTHORISATION: vault OR brain may call deposit/withdraw.
 */
contract VenusDirectLendingStrategy is APEXStrategy {
    using SafeERC20 for IERC20;

    uint256 public constant BLOCKS_PER_YEAR = 10_512_000;
    uint256 public constant BPS             = 10_000;

    address public immutable WBNB;
    address public immutable XVS;
    address public immutable vBNB;
    address public immutable comptroller;
    address public immutable router;

    uint256 public _totalAssets;

    event Supplied(uint256 wbnbIn, uint256 bnbDeposited);
    event Redeemed(uint256 bnbOut, uint256 wbnbReturned);
    event XVSHarvested(uint256 xvsAmount, uint256 wbnbOut);

    constructor(
        address vault_,
        address brain_,
        address wbnb_,
        address xvs_,
        address vBNB_,
        address comptroller_,
        address router_
    ) APEXStrategy(vault_, brain_, wbnb_) {
        WBNB        = wbnb_;
        XVS         = xvs_;
        vBNB        = vBNB_;
        comptroller = comptroller_;
        router      = router_;
    }

    // ── Auth ──────────────────────────────────────────────────
    // Override to allow both vault AND brain to call deposit/withdraw
    modifier onlyAuthorized() {
        require(
            msg.sender == vault || msg.sender == brain,
            "VenusLending: not vault or brain"
        );
        _;
    }

    // ── Core Strategy ─────────────────────────────────────────

    /**
     * @notice Invest WBNB into Venus.
     *
     * Pattern A (Brain flow):
     *   Brain previously called vault.allocateToStrategy → WBNB is already here.
     *   We use the contract's own balance.
     *
     * Pattern B (Vault direct):
     *   Vault calls deposit directly → we pull from vault.
     */
    function deposit(uint256 amount) external override onlyAuthorized {
        uint256 held = IERC20(WBNB).balanceOf(address(this));

        if (held < amount) {
            // Pattern B: pull the shortfall from vault
            uint256 needed = amount - held;
            IERC20(WBNB).safeTransferFrom(vault, address(this), needed);
        }

        // Unwrap WBNB → native BNB
        IWBNB(WBNB).withdraw(amount);

        // Supply native BNB to Venus vBNB
        IVBnb(vBNB).mint{value: amount}();

        _totalAssets += amount;
        emit Supplied(amount, amount);
    }

    /**
     * @notice Redeem BNB from Venus, rewrap, send to vault.
     */
    function withdraw(uint256 amount) external override onlyAuthorized returns (uint256 withdrawn) {
        uint256 redeemAmount = amount > _totalAssets ? _totalAssets : amount;

        uint256 code = IVBnb(vBNB).redeemUnderlying(redeemAmount);
        require(code == 0, "Venus: redeemUnderlying failed");

        uint256 bnbBal = address(this).balance;
        IWBNB(WBNB).deposit{value: bnbBal}();

        withdrawn = IERC20(WBNB).balanceOf(address(this));
        IERC20(WBNB).safeTransfer(vault, withdrawn);

        _totalAssets = _totalAssets > withdrawn ? _totalAssets - withdrawn : 0;
        emit Redeemed(bnbBal, withdrawn);
    }

    /**
     * @notice Claim XVS, swap to WBNB. Skips gracefully if no testnet liquidity.
     */
    function harvest() external override returns (uint256 harvested) {
        IVenusComptroller(comptroller).claimVenus(address(this));

        uint256 xvsBal = IERC20(XVS).balanceOf(address(this));
        if (xvsBal == 0) return 0;

        address[] memory path = new address[](2);
        path[0] = XVS;
        path[1] = WBNB;

        try IPancakeRouter(router).getAmountsOut(xvsBal, path) returns (uint[] memory amounts) {
            if (amounts[1] == 0) return 0;
            IERC20(XVS).approve(router, xvsBal);
            uint[] memory out = IPancakeRouter(router).swapExactTokensForTokens(
                xvsBal, 0, path, address(this), block.timestamp + 300
            );
            harvested = out[1];
        } catch {
            return 0; // no liquidity on testnet — skip, don't revert
        }

        if (harvested > 0) IERC20(WBNB).safeTransfer(msg.sender, harvested);
        emit XVSHarvested(xvsBal, harvested);
    }

    // ── Views ─────────────────────────────────────────────────

    function totalAssets() external view override returns (uint256) {
        return _totalAssets;
    }

    function currentAPY() external view override returns (uint256) {
        uint256 ratePerBlock = IVBnb(vBNB).supplyRatePerBlock();
        return (ratePerBlock * BLOCKS_PER_YEAR * BPS) / 1e18;
    }

    receive() external payable {}
}
