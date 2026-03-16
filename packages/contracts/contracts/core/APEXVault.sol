// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IAPEXStrategy.sol";
import "../interfaces/IAPEXBrain.sol";

/**
 * @title APEXVault
 * @notice ERC-4626 multi-strategy vault for the APEX Autonomous Yield Engine
 * @dev Aggregates TVL across 4 parallel strategy modules (M1-M4).
 *      Capital allocation is governed by APEXBrain.
 */
contract APEXVault is ERC4626, ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ── Constants ───────────────────────────────────────────────
    uint256 public constant EXIT_FEE_BPS = 10;     // 0.1%
    uint256 public constant MIN_DEPOSIT  = 1e16;   // 0.01 WBNB
    uint256 public constant BPS          = 10_000;

    // ── State ───────────────────────────────────────────────────
    address public brain;
    address public treasury;
    address public compounder;
    address[4] public strategies;   // [M1, M2, M3, M4]

    // ── Events ──────────────────────────────────────────────────
    event Synced(uint256 totalAssets, uint256 timestamp);
    event TreasuryUpdated(address newTreasury);
    event StrategyUpdated(uint256 index, address newStrategy);
    event BrainUpdated(address newBrain);
    event CompounderUpdated(address newCompounder);

    // ── Errors ───────────────────────────────────────────────────
    error NotBrain();
    error BelowMinDeposit(uint256 amount, uint256 minimum);
    error ZeroAmount();
    error InvalidIndex();

    // ── Constructor ─────────────────────────────────────────────
    /**
     * @param asset_       WBNB address (the underlying token)
     * @param brain_       APEXBrain address
     * @param treasury_    Fee recipient address
     * @param strategies_  Array of 4 strategy module addresses [M1,M2,M3,M4]
     * @param compounder_  APEXCompounder address
     */
    constructor(
        address asset_,
        address brain_,
        address treasury_,
        address[4] memory strategies_,
        address compounder_
    )
        ERC4626(IERC20(asset_))
        ERC20("APEX Vault", "APEX-LP")
        Ownable(msg.sender)
    {
        brain      = brain_;
        treasury   = treasury_;
        strategies = strategies_;
        compounder = compounder_;
    }

    // ── ERC-4626 Overrides ──────────────────────────────────────

    /**
     * @notice Aggregate total assets across all 4 strategies + idle vault balance
     */
    function totalAssets() public view override returns (uint256 total) {
        for (uint256 i = 0; i < 4; i++) {
            if (strategies[i] != address(0)) {
                total += IAPEXStrategy(strategies[i]).totalAssets();
            }
        }
        total += IERC20(asset()).balanceOf(address(this));
    }

    /**
     * @notice Deposit WBNB — enforces minimum deposit guard
     */
    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        if (assets < MIN_DEPOSIT) revert BelowMinDeposit(assets, MIN_DEPOSIT);
        shares = super.deposit(assets, receiver);
    }

    /**
     * @notice Withdraw WBNB — deducts 0.1% exit fee, sent to treasury
     */
    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        if (assets == 0) revert ZeroAmount();
        uint256 fee     = assets * EXIT_FEE_BPS / BPS;
        uint256 netAssets = assets - fee;

        // Pull full assets, transfer fee to treasury
        shares = super.withdraw(assets, address(this), owner);
        IERC20(asset()).safeTransfer(treasury, fee);
        IERC20(asset()).safeTransfer(receiver, netAssets);
    }

    /**
     * @notice Redeem shares — deducts 0.1% exit fee on assets, sent to treasury
     */
    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        if (shares == 0) revert ZeroAmount();
        assets = super.redeem(shares, address(this), owner);

        uint256 fee    = assets * EXIT_FEE_BPS / BPS;
        uint256 netOut = assets - fee;
        IERC20(asset()).safeTransfer(treasury, fee);
        IERC20(asset()).safeTransfer(receiver, netOut);
    }

    // ── APEX-Specific ───────────────────────────────────────────

    /**
     * @notice Called by the Brain after rebalancing — syncs internal accounting
     */
    function sync() external {
        if (msg.sender != brain) revert NotBrain();
        emit Synced(totalAssets(), block.timestamp);
    }

    /**
     * @notice Price per share in WBNB (1e18 = 1:1 parity)
     */
    function pricePerShare() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 1e18;
        return totalAssets() * 1e18 / supply;
    }

    /**
     * @notice Compute the weighted-average APY across all active strategies
     * @return blended APY in bps (e.g. 1200 = 12.00%)
     */
    function blendedAPY() external view returns (uint256) {
        IAPEXBrain.WeightVector memory w = IAPEXBrain(brain).currentWeights();
        uint256[4] memory apys;
        for (uint256 i = 0; i < 4; i++) {
            if (strategies[i] != address(0)) {
                apys[i] = IAPEXStrategy(strategies[i]).currentAPY();
            }
        }
        uint256[4] memory weights = [w.lpYield, w.staking, w.lending, w.hedge];
        uint256 blended;
        for (uint256 i = 0; i < 4; i++) {
            blended += apys[i] * weights[i];
        }
        return blended / BPS;
    }

    /**
     * @notice Allow vault to push WBNB into a strategy (called by compounder)
     */
    function allocateToStrategy(uint256 strategyIndex, uint256 amount) external {
        require(msg.sender == compounder || msg.sender == brain, "APEX: not authorized");
        require(strategyIndex < 4, "APEX: invalid index");
        IERC20(asset()).safeTransfer(strategies[strategyIndex], amount);
    }

    // ── Admin ────────────────────────────────────────────────────

    function setStrategy(uint256 index, address strategy_) external onlyOwner {
        if (index >= 4) revert InvalidIndex();
        strategies[index] = strategy_;
        emit StrategyUpdated(index, strategy_);
    }

    function setBrain(address brain_) external onlyOwner {
        brain = brain_;
        emit BrainUpdated(brain_);
    }

    function setCompounder(address compounder_) external onlyOwner {
        compounder = compounder_;
        emit CompounderUpdated(compounder_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Receive ETH ──────────────────────────────────────────────
    receive() external payable {}
}
