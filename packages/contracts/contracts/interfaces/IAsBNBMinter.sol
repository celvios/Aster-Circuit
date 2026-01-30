// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAsBNBMinter
 * @notice Interface for AsterDEX asBNB Liquid Staking Protocol
 * @dev Contract Address: 0x2F31ab8950c50080E77999fa456372f276952fD8
 */
interface IAsBNBMinter {
    /**
     * @notice Deposit BNB and receive asBNB (liquid staking tokens)
     * @dev Exchange rate appreciates over time due to staking rewards
     * @return shares Amount of asBNB tokens minted
     */
    function mint() external payable returns (uint256 shares);
    
    /**
     * @notice Redeem asBNB for underlying BNB + accrued rewards
     * @param shares Amount of asBNB to redeem
     * @return amount Amount of BNB received
     */
    function redeem(uint256 shares) external returns (uint256 amount);
    
    /**
     * @notice Get current exchange rate (asBNB to BNB)
     * @return rate Current exchange rate with 18 decimals
     */
    function exchangeRate() external view returns (uint256 rate);
    
    /**
     * @notice Calculate how much asBNB you'll receive for a BNB amount
     * @param bnbAmount Amount of BNB to deposit
     * @return shares Estimated asBNB tokens to receive
     */
    function previewMint(uint256 bnbAmount) external view returns (uint256 shares);
    
    /**
     * @notice Calculate how much BNB you'll receive for an asBNB amount
     * @param shares Amount of asBNB to redeem
     * @return bnbAmount Estimated BNB to receive
     */
    function previewRedeem(uint256 shares) external view returns (uint256 bnbAmount);
}
