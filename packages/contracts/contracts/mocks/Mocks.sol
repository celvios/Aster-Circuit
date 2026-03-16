// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces/IPancakeRouter02.sol";
import "../interfaces/IPancakeFactory.sol";
import "../interfaces/IMasterChefV2.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 10000000 * 10**18);
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
    }
}

contract MockPancakeFactory is IPancakeFactory {
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        pair = address(new MockERC20("LP Token", "LP"));
        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;
        allPairs.push(pair);
        return pair;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }
    
    function setPair(address tokenA, address tokenB, address pair) external {
        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;
    }
}

contract MockPancakeRouter is IPancakeRouter02 {
    address public factory;
    address public WETH; // Implements 'function WETH() external view returns (address)'

    constructor(address _factory, address _WETH) {
        factory = _factory;
        WETH = _WETH;
    }

    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity) {
        return (amountTokenDesired, msg.value, 1000);
    }
    
    function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        payable
        returns (uint[] memory amounts)
    {
        amounts = new uint[](path.length);
        amounts[0] = msg.value;
        amounts[path.length - 1] = msg.value; // 1:1 swap for mock
        
        // Mint return token
        MockERC20(path[path.length - 1]).mint(to, amounts[path.length - 1]);
        return amounts;
    }
    
    function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        returns (uint[] memory amounts)
    {
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountIn; // 1:1 swap
        
        // Send ETH
        payable(to).transfer(amountIn);
        return amounts;
    }
    
    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts) {
        amounts = new uint[](path.length);
        for(uint i=0; i<path.length; i++) amounts[i] = amountIn; // 1:1 price
        return amounts;
    }
    
    function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts) {
        amounts = new uint[](path.length);
        for(uint i=0; i<path.length; i++) amounts[i] = amountOut; // 1:1 price
        return amounts;
    }

    // Unused methods stubbed
    function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity) { return (0,0,0); }
    function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB) { return (0,0); }
    function removeLiquidityETH(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external returns (uint amountToken, uint amountETH) { return (liquidity, liquidity); }
    function removeLiquidityWithPermit(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external returns (uint amountA, uint amountB) { return (0,0); }
    function removeLiquidityETHWithPermit(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external returns (uint amountToken, uint amountETH) { return (0,0); }
    function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts) { return amounts; }
    function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts) { return amounts; }
    function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts) { return amounts; }
    function quote(uint amountA, uint reserveA, uint reserveB) external pure returns (uint amountB) { return 0; }
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) external pure returns (uint amountOut) { return 0; }
    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) external pure returns (uint amountIn) { return 0; }
    function removeLiquidityETHSupportingFeeOnTransferTokens(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external returns (uint amountETH) { return 0; }
    function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) external returns (uint amountETH) { return 0; }
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external {}
    function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable {}
    function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external {}
}

contract MockMasterChef is IMasterChefV2 {
    uint256 public poolLengthVal;
    mapping(uint256 => address) public lpTokens;

    function poolLength() external view returns (uint256) {
        return poolLengthVal;
    }
    
    function lpToken(uint256 pid) external view returns (address) {
        return lpTokens[pid];
    }
    
    function addPool(address _lpToken) external {
        lpTokens[poolLengthVal] = _lpToken;
        poolLengthVal++;
    }

    // Fixed: No return values
    function deposit(uint256 pid, uint256 amount) external {}
    function withdraw(uint256 pid, uint256 amount) external {}
    function harvest(uint256 pid, address to) external {}

    // Implement missing view methods
    function pendingCake(uint256 pid, address user) external view returns (uint256) { return 0; }
    function userInfo(uint256 pid, address user) external view returns (UserInfo memory) { return UserInfo(0,0,0); }
    
    function poolInfo(uint256 pid) external view returns (PoolInfo memory) {
         return PoolInfo(0, 0, 0, 0, true);
    }
    
    function updatePool(uint256 pid) external returns (PoolInfo memory) { return PoolInfo(0,0,0,0,true); }
    
    // Other methods
    function add(uint256 allocPoint, address _lpToken, bool _withUpdate, bool _regular) external {}
    function set(uint256 _pid, uint256 _allocPoint, bool _withUpdate, bool _regular) external {}
    function totalAllocPoint() external view returns (uint256) { return 0; }
    function CAKE() external view returns (IERC20) { return IERC20(address(0)); }
    function emergencyWithdraw(uint256 pid) external {}
}
