// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IPancakeRouter02.sol";

/**
 * @title CircuitVault
 * @notice ERC-4626 compliant vault for AsterCircuit Yield Engine
 * @dev Accepts BNB deposits, converts to asBNB via AsterDEX for base yield
 *      All yield compounding and stacking logic is handled by the Strategy contract
 */
contract CircuitVault is ERC4626, ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ============ Immutables ============

    /// @notice AsterDEX asBNB token contract
    IERC20 public immutable asBNB;
    
    /// @notice PancakeSwap Router for swaps
    IPancakeRouter02 public immutable pancakeRouter;
    
    /// @notice WBNB address (for swap path)
    address public constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    
    // ============ State Variables ============
    
    /// @notice Strategy contract address (handles compounding)
    address public strategy;
    
    /// @notice Total asBNB deposited in AsterDEX
    uint256 public totalAsBNBDeposited;

    // ============ Events ============

    event Deposited(address indexed user, uint256 bnbAmount, uint256 shares);
    event Withdrawn(address indexed user, uint256 shares, uint256 bnbAmount);
    event StrategyUpdated(address indexed oldStrategy, address indexed newStrategy);

    // ============ Errors ============

    error ZeroAmount();
    error StrategyNotSet();
    error OnlyStrategy();

    // ============ Constructor ============

    /**
     * @notice Initialize the CircuitVault
     * @param _asBNB Address of the asBNB token
     * @param _pancakeRouter Address of PancakeSwap router
     */
    constructor(
        address _asBNB,
        address _pancakeRouter
    ) 
        ERC4626(IERC20(_asBNB)) 
        ERC20("AsterCircuit Vault", "acBNB")
        Ownable(msg.sender)
    {
        asBNB = IERC20(_asBNB);
        pancakeRouter = IPancakeRouter02(_pancakeRouter);
        
        // No approval needed here - will approve per-transaction for security
    }

    // ============ Modifiers ============

    modifier onlyStrategy() {
        if (msg.sender != strategy) revert OnlyStrategy();
        _;
    }

    // ============ Admin Functions ============

    /**
     * @notice Set the strategy contract
     * @param _strategy Address of the strategy contract
     */
    function setStrategy(address _strategy) external onlyOwner {
        emit StrategyUpdated(strategy, _strategy);
        strategy = _strategy;
    }

    /**
     * @notice Emergency pause deposits
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause deposits
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Deposit Functions ============

    /**
     * @notice Deposit BNB and receive vault shares
     * @dev Swaps BNB → asBNB via PancakeSwap
     */
    function depositBNB() external payable nonReentrant whenNotPaused returns (uint256 shares) {
        if (msg.value == 0) revert ZeroAmount();

        // Swap BNB → asBNB via PancakeSwap
        uint256 asBNBReceived = _swapBNBForAsBNB(msg.value);
        
        // Update accounting
        totalAsBNBDeposited += asBNBReceived;
        
        // Mint vault shares to user
        shares = previewDeposit(asBNBReceived);
        _mint(msg.sender, shares);

        emit Deposited(msg.sender, msg.value, shares);
    }
    
    /**
     * @notice Internal function to swap BNB for asBNB
     * @param bnbAmount Amount of BNB to swap
     * @return asBNBAmount Amount of asBNB received
     */
    function _swapBNBForAsBNB(uint256 bnbAmount) internal returns (uint256 asBNBAmount) {
        // Set up swap path: BNB (WBNB) → asBNB
        address[] memory path = new address[](2);
        path[0] = WBNB;
        path[1] = address(asBNB);
        
        // Get expected output for slippage protection
        uint256[] memory amountsOut = pancakeRouter.getAmountsOut(bnbAmount, path);
        
        // Set minimum output (0.5% slippage tolerance)
        uint256 minOutput = (amountsOut[1] * 9950) / 10000;
        
        // Execute swap
        uint256[] memory amounts = pancakeRouter.swapExactETHForTokens{value: bnbAmount}(
            minOutput,
            path,
            address(this),
            block.timestamp + 300 // 5 minute deadline
        );
        
        asBNBAmount = amounts[1];
    }

    /**
     * @notice Deposit asBNB directly and receive vault shares
     * @param assets Amount of asBNB to deposit
     * @return shares Amount of vault shares minted
     */
    function deposit(uint256 assets, address receiver) 
        public 
        override 
        nonReentrant 
        whenNotPaused 
        returns (uint256 shares) 
    {
        if (assets == 0) revert ZeroAmount();

        // Transfer asBNB from user
        asBNB.safeTransferFrom(msg.sender, address(this), assets);
        
        // Update accounting
        totalAsBNBDeposited += assets;
        
        // Mint shares
        shares = previewDeposit(assets);
        _mint(receiver, shares);

        emit Deposited(receiver, assets, shares);
    }

    // ============ Withdraw Functions ============

    /**
     * @notice Withdraw BNB by burning vault shares
     * @param shares Amount of vault shares to burn
     * @return bnbAmount Amount of BNB withdrawn
     */
    function withdrawBNB(uint256 shares) external nonReentrant returns (uint256 bnbAmount) {
        if (shares == 0) revert ZeroAmount();

        // Calculate asBNB to redeem
        uint256 asBNBAmount = previewRedeem(shares);
        
        // Burn user shares
        _burn(msg.sender, shares);
        
        // Update accounting
        totalAsBNBDeposited -= asBNBAmount;
        
        // Swap asBNB for BNB via PancakeSwap
        bnbAmount = _swapAsBNBForBNB(asBNBAmount);
        
        // Transfer BNB to user
        payable(msg.sender).transfer(bnbAmount);

        emit Withdrawn(msg.sender, shares, bnbAmount);
    }
    
    /**
     * @notice Internal function to swap asBNB for BNB
     * @param asBNBAmount Amount of asBNB to swap
     * @return bnbAmount Amount of BNB received
     */
    function _swapAsBNBForBNB(uint256 asBNBAmount) internal returns (uint256 bnbAmount) {
        // Set up swap path: asBNB → BNB (WBNB)
        address[] memory path = new address[](2);
        path[0] = address(asBNB);
        path[1] = WBNB;
        
        // Approve router to spend asBNB
        asBNB.approve(address(pancakeRouter), asBNBAmount);
        
        // Get expected output for slippage protection
        uint256[] memory amountsOut = pancakeRouter.getAmountsOut(asBNBAmount, path);
        
        // Set minimum output (0.5% slippage tolerance)
        uint256 minOutput = (amountsOut[1] * 9950) / 10000;
        
        // Execute swap
        uint256[] memory amounts = pancakeRouter.swapExactTokensForETH(
            asBNBAmount,
            minOutput,
            path,
            address(this),
            block.timestamp + 300
        );
        
        bnbAmount = amounts[1];
    }

    /**
     * @notice Withdraw asBNB by burning vault shares
     * @param shares Amount of vault shares to burn
     * @param receiver Address to receive asBNB
     * @param owner Address that owns the shares
     * @return assets Amount of asBNB withdrawn
     */
    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        if (shares == 0) revert ZeroAmount();
        
        // Check allowance if not owner
        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        // Calculate assets to return
        assets = previewRedeem(shares);
        
        // Burn shares
        _burn(owner, shares);
        
        // Update accounting
        totalAsBNBDeposited -= assets;
        
        // Transfer asBNB to receiver
        asBNB.safeTransfer(receiver, assets);

        emit Withdrawn(owner, shares, assets);
    }

    // ============ Strategy Integration ============

    /**
     * @notice Strategy calls this to request asBNB for compounding
     * @param amount Amount of asBNB to allocate to strategy
     */
    function allocateToStrategy(uint256 amount) external onlyStrategy {
        asBNB.safeTransfer(strategy, amount);
    }

    /**
     * @notice Strategy returns asBNB (from yields or rebalancing)
     * @param amount Amount of asBNB being returned
     */
    function returnFromStrategy(uint256 amount) external onlyStrategy {
        asBNB.safeTransferFrom(strategy, address(this), amount);
        totalAsBNBDeposited += amount;
    }

    // ============ View Functions ============

    /**
     * @notice Get total assets under management (asBNB)
     */
    function totalAssets() public view override returns (uint256) {
        return totalAsBNBDeposited;
    }

    /**
     * @notice Calculate current value of asBNB in BNB
     * @return bnbValue Total BNB value of vault
     */
    function totalValueInBNB() external view returns (uint256 bnbValue) {
        if (totalAsBNBDeposited == 0) return 0;
        
        address[] memory path = new address[](2);
        path[0] = address(asBNB);
        path[1] = WBNB;
        
        try pancakeRouter.getAmountsOut(totalAsBNBDeposited, path) returns (uint256[] memory amounts) {
            bnbValue = amounts[1];
        } catch {
            bnbValue = 0;
        }
    }

    /**
     * @notice Calculate user's BNB value
     * @param user Address to check
     * @return bnbValue BNB value of user's shares
     */
    function userValueInBNB(address user) external view returns (uint256 bnbValue) {
        uint256 userShares = balanceOf(user);
        if (userShares == 0) return 0;
        
        uint256 userAsBNB = previewRedeem(userShares);
        
        address[] memory path = new address[](2);
        path[0] = address(asBNB);
        path[1] = WBNB;
        
        try pancakeRouter.getAmountsOut(userAsBNB, path) returns (uint256[] memory amounts) {
            bnbValue = amounts[1];
        } catch {
            bnbValue = 0;
        }
    }

    // ============ Receive BNB ============

    receive() external payable {}
}
