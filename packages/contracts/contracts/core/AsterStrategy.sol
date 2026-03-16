// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IPancakeRouter02.sol";
import "../interfaces/IPancakeFactory.sol";
import "../interfaces/IPancakePair.sol";
import "../interfaces/IMasterChefV2.sol";
import "../libraries/FixedPointMath.sol";

interface IWBNB {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/**
 * @title AsterStrategy
 * @notice Core strategy contract for AsterCircuit
 * @dev Implements the Resilient Compound Stacking (RCS) strategy:
 *      1. Accepts BNB deposits and swaps to asBNB (via PancakeSwap)
 *      2. Harvests yield from asBNB (appreciation)
 *      3. Compounds yield into PancakeSwap BNB-USDT LP
 *      4. Monitors Impermanent Loss and rebalances
 */
contract AsterStrategy is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using FixedPointMath for uint256;

    // ============ Constants ============

    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant PRECISION = 1e18;

    // ============ Immutables ============

    address public immutable vault;
    IERC20 public immutable asBNB;
    IPancakeRouter02 public immutable pancakeRouter;
    IPancakeFactory public immutable pancakeFactory;
    IMasterChefV2 public immutable masterChef;
    IERC20 public immutable wbnb;
    IERC20 public immutable usdt;
    IERC20 public immutable cake;

    // ============ State Variables ============

    /// @notice BNB-USDT LP pair address
    address public lpPair;
    
    /// @notice MasterChef pool ID for BNB-USDT
    uint256 public poolId;
    
    /// @notice Minimum yield to trigger compounding (0.1 BNB)
    uint256 public compoundThreshold;
    
    /// @notice Maximum acceptable impermanent loss (5% = 500 basis points)
    uint256 public ilThreshold;
    
    /// @notice Slippage tolerance (0.5% = 50 basis points)
    uint256 public slippageTolerance;
    
    /// @notice Entry price when LP was created (for IL calculation)
    uint256 public lpEntryPrice;
    
    /// @notice Total asBNB received from last harvest
    uint256 public lastHarvestedAmount;
    
    /// @notice LP position active flag
    bool public hasActiveLP;

    /// @notice Total asBNB held by the strategy (principal + yield)
    uint256 public totalAsBNBHeld;
    
    /// @notice Base asBNB deposits (cost basis) - tracks principal only
    uint256 public baseAsBNBDeposits;
    
    /// @notice Accumulated yield from asBNB appreciation
    uint256 public totalAsBNBYield;

    // ============ Structs ============

    struct LPPosition {
        uint256 lpTokens;
        uint256 entryPrice;
        uint256 bnbAmount;
        uint256 usdtAmount;
        uint256 timestamp;
    }

    LPPosition public currentPosition;

    // ============ Events ============

    event Deposited(uint256 bnbAmount, uint256 asBNBReceived);
    event Withdrawn(uint256 bnbAmount, uint256 asBNBSold);
    event Compounded(uint256 yieldHarvested, uint256 lpTokensReceived);
    event LPExited(uint256 lpTokens, uint256 bnbRecovered, uint256 usdtRecovered, string reason);
    event ILThresholdExceeded(uint256 currentIL, uint256 threshold);
    event ParametersUpdated(uint256 compoundThreshold, uint256 ilThreshold, uint256 slippageTolerance);

    // ============ Errors ============

    error OnlyVault();
    error BelowThreshold();
    error NoActiveLP();
    error SlippageExceeded();
    error InvalidPoolId();

    // ============ Constructor ============

    constructor(
        address _vault,
        address _asBNB,
        address _pancakeRouter,
        address _pancakeFactory,
        address _masterChef,
        address _wbnb,
        address _usdt,
        address _cake,
        uint256 _poolId
    ) Ownable(msg.sender) {
        vault = _vault;
        asBNB = IERC20(_asBNB);
        pancakeRouter = IPancakeRouter02(_pancakeRouter);
        pancakeFactory = IPancakeFactory(_pancakeFactory);
        masterChef = IMasterChefV2(_masterChef);
        wbnb = IERC20(_wbnb);
        usdt = IERC20(_usdt);
        cake = IERC20(_cake);
        poolId = _poolId;

        // Initialize parameters
        compoundThreshold = 0.1 ether; // 0.1 BNB
        ilThreshold = 500; // 5%
        slippageTolerance = 50; // 0.5%

        // Get LP pair address
        lpPair = pancakeFactory.getPair(_wbnb, _usdt);
        require(lpPair != address(0), "LP pair not found");

        // Verify pool ID
        require(masterChef.lpToken(_poolId) == lpPair, "Invalid pool ID");

        // Approve tokens
        asBNB.approve(address(pancakeRouter), type(uint256).max); // Approve for swap
        wbnb.approve(address(pancakeRouter), type(uint256).max);
        usdt.approve(address(pancakeRouter), type(uint256).max);
        IERC20(lpPair).approve(address(pancakeRouter), type(uint256).max);
        IERC20(lpPair).approve(address(masterChef), type(uint256).max);
    }

    // ============ Modifiers ============

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    // ============ Core Strategy Functions ============

    /**
     * @notice Deposit BNB and get asBNB via PancakeSwap
     * @dev Called by Vault for user deposits
     */
    function deposit(uint256 amount) external onlyVault {
        // Unwrap WBNB to BNB if we hold WBNB
        uint256 wbnbBalance = wbnb.balanceOf(address(this));
        if (wbnbBalance >= amount) {
            IWBNB(address(wbnb)).withdraw(amount);
        } else {
            // Assume BNB was sent to contract
            require(address(this).balance >= amount, "Insufficient BNB/WBNB");
        }
        
        // Swap BNB -> asBNB via PancakeSwap
        uint256 asBNBReceived = _swapBNBForAsBNB(amount);
        
        totalAsBNBHeld += asBNBReceived;
        baseAsBNBDeposits += asBNBReceived; // Track cost basis
        
        emit Deposited(amount, asBNBReceived);
    }



    /**
     * @notice Withdraw: Sell asBNB for BNB
     * @dev Called by Vault for user withdrawals
     */
    function withdraw(uint256 bnbAmount) external onlyVault {
        // Swap asBNB -> BNB
        uint256 asBNBToSell = _swapAsBNBForBNB(bnbAmount);
        
        // Wrap BNB to WBNB and send to vault
        IWBNB(address(wbnb)).deposit{value: bnbAmount}();
        wbnb.safeTransfer(vault, bnbAmount);
        
        // Update accounting
        if (totalAsBNBHeld >= asBNBToSell) {
            totalAsBNBHeld -= asBNBToSell;
            
            // Proportionally reduce base deposits
            if (baseAsBNBDeposits >= asBNBToSell) {
                baseAsBNBDeposits -= asBNBToSell;
            } else {
                baseAsBNBDeposits = 0;
            }
        } else {
            totalAsBNBHeld = 0;
            baseAsBNBDeposits = 0;
        }
       
        emit Withdrawn(bnbAmount, asBNBToSell);
    }

    /**
     * @notice Main compounding function - harvest and deploy to PancakeSwap
     * @dev Called by Heartbeat contract or external keeper
     */
    function compound() external nonReentrant returns (uint256 lpTokensReceived) {
        uint256 yieldHarvested = harvestAsterYield(); 
        
        if (yieldHarvested < compoundThreshold) revert BelowThreshold();

        // Swap yield (asBNB) -> BNB
        uint256 bnbAmount = _swapAsBNBForBNBInternal(yieldHarvested); 

        // Step 3: Split for LP (50/50)
        uint256 bnbForLP = bnbAmount / 2;
        uint256 bnbForSwap = bnbAmount - bnbForLP;

        // Step 4: Swap half BNB for USDT
        uint256 usdtAmount = swapBNBForUSDT(bnbForSwap);

        // Step 5: Add liquidity to PancakeSwap
        lpTokensReceived = addLiquidityToPancakeSwap(bnbForLP, usdtAmount);

        // Step 6: Stake LP tokens in MasterChef
        stakeLPTokens(lpTokensReceived);

        // Step 7: Store position data
        currentPosition = LPPosition({
            lpTokens: lpTokensReceived,
            entryPrice: getCurrentPrice(),
            bnbAmount: bnbForLP,
            usdtAmount: usdtAmount,
            timestamp: block.timestamp
        });

        hasActiveLP = true;
        lpEntryPrice = currentPosition.entryPrice;

        emit Compounded(yieldHarvested, lpTokensReceived);
    }

    /**
     * @notice Check and rebalance if IL exceeds threshold
     */
    function checkAndRebalance() external nonReentrant {
        if (!hasActiveLP) revert NoActiveLP();
        
        // First, harvest any pending CAKE rewards
        harvestLPRewards();

        // Calculate current impermanent loss
        uint256 currentIL = calculateImpermanentLoss();

        // If IL exceeds threshold, exit position
        if (currentIL > ilThreshold) {
            emit ILThresholdExceeded(currentIL, ilThreshold);
            exitLPPosition("IL threshold exceeded");
        }
    }

    // ============ Internal Functions ============

    /**
     * @notice Swap BNB for asBNB using PancakeSwap
     */
    function _swapBNBForAsBNB(uint256 bnbAmount) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = address(wbnb);
        path[1] = address(asBNB);
        
        // Get expected output (for slippage protection)
        uint256[] memory amountsOut = pancakeRouter.getAmountsOut(bnbAmount, path);
        
        // Set minimum output (slippage tolerance)
        uint256 minOutput = (amountsOut[1] * (BASIS_POINTS - slippageTolerance)) / BASIS_POINTS;
        
        // Execute swap
        uint256[] memory amounts = pancakeRouter.swapExactETHForTokens{
            value: bnbAmount
        }(
            minOutput,
            path,
            address(this),
            block.timestamp + 300
        );
        
        return amounts[1]; // Amount of asBNB received
    }

    /**
     * @notice Swap asBNB for BNB using PancakeSwap (External Wrapper)
     */
    function _swapAsBNBForBNB(uint256 bnbOutcomeDesired) internal returns (uint256) {
        // We need to sell enough asBNB to get 'bnbOutcomeDesired'
        address[] memory path = new address[](2);
        path[0] = address(asBNB);
        path[1] = address(wbnb);
        
        uint256[] memory amountsIn = pancakeRouter.getAmountsIn(bnbOutcomeDesired, path);
        uint256 asBNBToSell = amountsIn[0];
        
        // Check balance
        require(asBNB.balanceOf(address(this)) >= asBNBToSell, "Insufficient asBNB");
        
        // Swap
        pancakeRouter.swapExactTokensForETH(
            asBNBToSell,
            bnbOutcomeDesired,
            path,
            address(this),
            block.timestamp + 300
        );
        
        return asBNBToSell;
    }

    /**
     * @notice Swap exact asBNB for BNB (Internal Helper for compounding)
     */
    function _swapAsBNBForBNBInternal(uint256 asBNBAmount) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = address(asBNB);
        path[1] = address(wbnb);

        uint256[] memory amountsOut = pancakeRouter.getAmountsOut(asBNBAmount, path);
        uint256 minBNB = (amountsOut[1] * (BASIS_POINTS - slippageTolerance)) / BASIS_POINTS;
        
        uint256[] memory amounts = pancakeRouter.swapExactTokensForETH(
            asBNBAmount,
            minBNB,
            path,
            address(this),
            block.timestamp + 300
        );
        
        return amounts[1];
    }
    
    /**
     * @notice Calculate and harvest yield from asBNB appreciation
     * @return yieldAmount Amount of asBNB yield harvested
     */
    function harvestAsterYield() internal returns (uint256 yieldAmount) {
        uint256 currentAsBNBBalance = asBNB.balanceOf(address(this));
        
        // Yield = current balance - base deposits
        // (asBNB appreciates over time, so balance > deposits means yield)
        if (currentAsBNBBalance > baseAsBNBDeposits) {
            yieldAmount = currentAsBNBBalance - baseAsBNBDeposits;
            
            // Update accounting
            totalAsBNBYield += yieldAmount;
            baseAsBNBDeposits = currentAsBNBBalance; // Reset basis after harvest
        } else {
            yieldAmount = 0;
        }
        
        lastHarvestedAmount = yieldAmount;
    }

    /**
     * @notice Swap BNB for USDT via PancakeSwap
     */
    function swapBNBForUSDT(uint256 bnbAmount) internal returns (uint256 usdtAmount) {
        address[] memory path = new address[](2);
        path[0] = address(wbnb);
        path[1] = address(usdt);

        uint256[] memory amountsOut = pancakeRouter.getAmountsOut(bnbAmount, path);
        uint256 minUSDT = (amountsOut[1] * (BASIS_POINTS - slippageTolerance)) / BASIS_POINTS;

        uint256[] memory amounts = pancakeRouter.swapExactETHForTokens{value: bnbAmount}(
            minUSDT,
            path,
            address(this),
            block.timestamp + 30
        );

        usdtAmount = amounts[1];
    }

    /**
     * @notice Add liquidity to PancakeSwap BNB-USDT pool
     */
    function addLiquidityToPancakeSwap(
        uint256 bnbAmount,
        uint256 usdtAmount
    ) internal returns (uint256 lpTokens) {
        uint256 minBNB = (bnbAmount * (BASIS_POINTS - slippageTolerance)) / BASIS_POINTS;
        uint256 minUSDT = (usdtAmount * (BASIS_POINTS - slippageTolerance)) / BASIS_POINTS;

        (, , lpTokens) = pancakeRouter.addLiquidityETH{value: bnbAmount}(
            address(usdt),
            usdtAmount,
            minUSDT,
            minBNB,
            address(this),
            block.timestamp + 30
        );
    }

    /**
     * @notice Stake LP tokens in MasterChef
     */
    function stakeLPTokens(uint256 lpTokens) internal {
        masterChef.deposit(poolId, lpTokens);
    }

    /**
     * @notice Harvest CAKE rewards from MasterChef
     */
    function harvestLPRewards() internal {
        uint256 pendingRewards = masterChef.pendingCake(poolId, address(this));
        
        if (pendingRewards > 0) {
            masterChef.harvest(poolId, address(this));
        }
    }

    /**
     * @notice Exit LP position and return to AsterDEX
     */
    function exitLPPosition(string memory reason) internal {
        IMasterChefV2.UserInfo memory userInfo = masterChef.userInfo(poolId, address(this));
        uint256 stakedLP = userInfo.amount;

        if (stakedLP > 0) {
            masterChef.withdraw(poolId, stakedLP);
            
            (uint256 bnbRecovered, uint256 usdtRecovered) = removeLiquidity(stakedLP);
            
            uint256 bnbFromUSDT = swapUSDTForBNB(usdtRecovered);
            uint256 totalBNB = bnbRecovered + bnbFromUSDT;
            
            // Convert BNB back to asBNB via Swap
            uint256 asBNBReceived = _swapBNBForAsBNB(totalBNB);
            
            // Update tracking
            totalAsBNBHeld += asBNBReceived;
            
            emit LPExited(stakedLP, bnbRecovered, usdtRecovered, reason);
        }

        hasActiveLP = false;
        delete currentPosition;
    }

    /**
     * @notice Remove liquidity from PancakeSwap
     */
    function removeLiquidity(uint256 lpTokens) internal returns (uint256 bnbAmount, uint256 usdtAmount) {
        (uint112 reserve0, uint112 reserve1, ) = IPancakePair(lpPair).getReserves();
        uint256 totalSupply = IERC20(lpPair).totalSupply();
        
        uint256 token0Min = (uint256(reserve0) * lpTokens * (BASIS_POINTS - slippageTolerance)) / (totalSupply * BASIS_POINTS);
        uint256 token1Min = (uint256(reserve1) * lpTokens * (BASIS_POINTS - slippageTolerance)) / (totalSupply * BASIS_POINTS);

        (usdtAmount, bnbAmount) = pancakeRouter.removeLiquidityETH(
            address(usdt),
            lpTokens,
            token0Min,
            token1Min,
            address(this),
            block.timestamp + 30
        );
    }

    /**
     * @notice Swap USDT back to BNB
     */
    function swapUSDTForBNB(uint256 usdtAmount) internal returns (uint256 bnbAmount) {
        address[] memory path = new address[](2);
        path[0] = address(usdt);
        path[1] = address(wbnb);

        uint256[] memory amountsOut = pancakeRouter.getAmountsOut(usdtAmount, path);
        uint256 minBNB = (amountsOut[1] * (BASIS_POINTS - slippageTolerance)) / BASIS_POINTS;

        uint256[] memory amounts = pancakeRouter.swapExactTokensForETH(
            usdtAmount,
            minBNB,
            path,
            address(this),
            block.timestamp + 30
        );

        bnbAmount = amounts[1];
    }

    // ============ View Functions ============

    /**
     * @notice Calculate current impermanent loss
     */
    function calculateImpermanentLoss() public view returns (uint256 ilPercent) {
        if (!hasActiveLP) return 0;

        uint256 currentPrice = getCurrentPrice();
        uint256 entryPrice = currentPosition.entryPrice;

        if (currentPrice == 0 || entryPrice == 0) return 0;

        uint256 priceRatio = currentPrice > entryPrice 
            ? (currentPrice * PRECISION) / entryPrice
            : (entryPrice * PRECISION) / currentPrice;
            
        uint256 sqrtRatio = FixedPointMath.sqrt(priceRatio);
        uint256 numerator = 2 * sqrtRatio;
        uint256 denominator = PRECISION + priceRatio;
        
        uint256 ratio = (numerator * PRECISION) / denominator;
        
        if (ratio >= PRECISION) {
            ilPercent = ((ratio - PRECISION) * BASIS_POINTS) / PRECISION;
        } else {
            ilPercent = ((PRECISION - ratio) * BASIS_POINTS) / PRECISION;
        }
    }

    /**
     * @notice Get current BNB/USDT price from LP pool
     */
    function getCurrentPrice() public view returns (uint256 price) {
        (uint112 reserve0, uint112 reserve1, ) = IPancakePair(lpPair).getReserves();
        address token0 = IPancakePair(lpPair).token0();
        
        if (token0 == address(usdt)) {
            price = (uint256(reserve0) * PRECISION) / uint256(reserve1);
        } else {
            price = (uint256(reserve1) * PRECISION) / uint256(reserve0);
        }
    }

    /**
     * @notice Get pending CAKE rewards
     */
    function getPendingRewards() external view returns (uint256) {
        return masterChef.pendingCake(poolId, address(this));
    }

    // ============ Admin Functions ============

    function setParameters(
        uint256 _compoundThreshold,
        uint256 _ilThreshold,
        uint256 _slippageTolerance
    ) external onlyOwner {
        compoundThreshold = _compoundThreshold;
        ilThreshold = _ilThreshold;
        slippageTolerance = _slippageTolerance;
        emit ParametersUpdated(_compoundThreshold, _ilThreshold, _slippageTolerance);
    }

    function emergencyExit() external onlyOwner {
        if (hasActiveLP) {
            exitLPPosition("Emergency exit");
        }
    }

    // ============ Receive BNB ============

    receive() external payable {}
}
