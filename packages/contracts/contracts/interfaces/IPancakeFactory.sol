// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPancakeFactory
 * @notice Interface for PancakeSwap V2 Factory
 * @dev Contract Address: 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73
 */
interface IPancakeFactory {
    /**
     * @notice Get pair address for two tokens
     * @param tokenA First token address
     * @param tokenB Second token address
     * @return pair Address of the LP pair
     */
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    
    /**
     * @notice Create new pair
     * @param tokenA First token address
     * @param tokenB Second token address
     * @return pair Address of the created pair
     */
    function createPair(address tokenA, address tokenB) external returns (address pair);
    
    /**
     * @notice Get total number of pairs
     * @return count Total pairs count
     */
    function allPairsLength() external view returns (uint256 count);
}
