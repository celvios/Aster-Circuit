// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title APEXMocks
 * @notice Mock contracts for APEX unit tests.
 *         Contains MockAPEXStrategy, MockAsterDEXPool, MockWBNB, MockVault.
 */

// ── MockAPEXStrategy ──────────────────────────────────────────────────────────
contract MockAPEXStrategy {
    uint256 public _totalAssets;
    uint256 public _currentAPY;
    uint256 public harvestReturn;
    address public immutable asset;
    address public vault;
    address public brain;

    constructor(address asset_, address vault_, address brain_) {
        asset = asset_;
        vault = vault_;
        brain = brain_;
        _currentAPY = 500;
    }

    function setTotalAssets(uint256 amount) external { _totalAssets = amount; }
    function setCurrentAPY(uint256 apyBps) external { _currentAPY = apyBps; }
    function setHarvestReturn(uint256 amount) external { harvestReturn = amount; }

    function deposit(uint256 amount) external { _totalAssets += amount; }
    function withdraw(uint256 amount) external returns (uint256) {
        _totalAssets = _totalAssets > amount ? _totalAssets - amount : 0;
        // Transfer tokens back to caller (vault)
        IERC20(asset).transfer(msg.sender, amount);
        return amount;
    }
    function harvest() external returns (uint256) {
        uint256 h = harvestReturn;
        harvestReturn = 0;
        // Actually transfer the harvest amount to the caller (compounder)
        if (h > 0) IERC20(asset).transfer(msg.sender, h);
        return h;
    }
    function totalAssets() external view returns (uint256) { return _totalAssets; }
    function currentAPY() external view returns (uint256) { return _currentAPY; }
}

// ── MockAsterDEXPool ──────────────────────────────────────────────────────────
contract MockAsterDEXPool {
    uint256 public spotPrice;
    uint256 public twapPrice;
    uint256 public fees24hVal;
    uint256 public totalLiquidityVal;

    constructor() {
        spotPrice         = 300e18;
        twapPrice         = 300e18;
        fees24hVal        = 1e18;
        totalLiquidityVal = 1000e18;
    }

    function setSpotPrice(uint256 price)    external { spotPrice = price; }
    function setTWAP(uint256 price)         external { twapPrice = price; }
    function setFees24h(uint256 fees)       external { fees24hVal = fees; }
    function setTotalLiquidity(uint256 liq) external { totalLiquidityVal = liq; }

    function getSpotPrice()                    external view returns (uint256) { return spotPrice; }
    function getTWAP(uint32 /*secondsAgo*/)    external view returns (uint256) { return twapPrice; }
    function fees24h()                         external view returns (uint256) { return fees24hVal; }
    function totalLiquidity()                  external view returns (uint256) { return totalLiquidityVal; }
    function collectFees(address /*r*/)        external returns (uint256, uint256) { return (0, 0); }
}

// ── MockWBNB ──────────────────────────────────────────────────────────────────
contract MockWBNB is ERC20 {
    constructor() ERC20("Wrapped BNB", "WBNB") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function deposit() external payable { _mint(msg.sender, msg.value); }
    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
    }
    receive() external payable {}
}

// ── MockVault ─────────────────────────────────────────────────────────────────
// Minimal vault stub for Brain tests: lets sync() succeed without reverting.
contract MockVault {
    uint256 public _totalAssets;

    function setTotalAssets(uint256 amount) external { _totalAssets = amount; }
    function totalAssets() external view returns (uint256) { return _totalAssets; }
    function sync() external {} // no-op — just prevents revert
}
