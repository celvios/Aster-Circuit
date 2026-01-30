// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IPancakePair
 * @notice Interface for PancakeSwap V2 LP Pair
 */
interface IPancakePair is IERC20 {
    /**
     * @notice Get first token in the pair
     */
    function token0() external view returns (address);
    
    /**
     * @notice Get second token in the pair
     */
    function token1() external view returns (address);
    
    /**
     * @notice Get current reserves
     * @return reserve0 Reserve of token0
     * @return reserve1 Reserve of token1
     * @return blockTimestampLast Last update timestamp
     */
    function getReserves() external view returns (
        uint112 reserve0,
        uint112 reserve1,
        uint32 blockTimestampLast
    );
    
    /**
     * @notice Price cumulative for token0 (for TWAP oracles)
     */
    function price0CumulativeLast() external view returns (uint256);
    
    /**
     * @notice Price cumulative for token1 (for TWAP oracles)
     */
    function price1CumulativeLast() external view returns (uint256);
}
