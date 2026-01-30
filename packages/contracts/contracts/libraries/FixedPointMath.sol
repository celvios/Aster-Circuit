// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FixedPointMath
 * @notice Simple fixed-point math library for IL calculation
 * @dev Provides sqrt and safe math operations
 */
library FixedPointMath {
    uint256 internal constant PRECISION = 1e18;
    
    /**
     * @notice Calculate square root using Babylonian method
     * @param x Value to calculate sqrt of (18 decimals)
     * @return result Square root with 18 decimals
     */
    function sqrt(uint256 x) internal pure returns (uint256 result) {
        if (x == 0) return 0;
        
        // Initial guess
        uint256 z = (x + 1) / 2;
        result = x;
        
        // Babylonian method (Newton's method)
        while (z < result) {
            result = z;
            z = (x / z + z) / 2;
        }
        
        // Scale to maintain precision
        result = result * 1e9; // sqrt(1e18) = 1e9
    }
    
    /**
     * @notice Multiply two fixed-point numbers
     */
    function mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256) {
        return (a * b) / denominator;
    }
}
