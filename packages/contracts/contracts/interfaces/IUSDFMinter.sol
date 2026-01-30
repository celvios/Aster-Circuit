// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IUSDFMinter
 * @notice Interface for AsterDEX USDF Yield-Bearing Stablecoin Protocol
 * @dev Contract Address: 0xdB57a53C428a9faFcbFefFB6dd80d0f427543695
 */
interface IUSDFMinter {
    /**
     * @notice Deposit USDT and receive USDF (yield-bearing stablecoin)
     * @param usdtAmount Amount of USDT to deposit
     * @return usdfAmount Amount of USDF tokens minted
     */
    function mint(uint256 usdtAmount) external returns (uint256 usdfAmount);
    
    /**
     * @notice Redeem USDF for underlying USDT
     * @param usdfAmount Amount of USDF to redeem
     * @return usdtAmount Amount of USDT received
     */
    function redeem(uint256 usdfAmount) external returns (uint256 usdtAmount);
    
    /**
     * @notice Claim weekly reward distributions
     * @return rewardAmount Amount of USDF rewards claimed
     */
    function claimRewards() external returns (uint256 rewardAmount);
    
    /**
     * @notice Check pending rewards for a user
     * @param user Address to check rewards for
     * @return amount Pending reward amount
     */
    function pendingRewards(address user) external view returns (uint256 amount);
}
