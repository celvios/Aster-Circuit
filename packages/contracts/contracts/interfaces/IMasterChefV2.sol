// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IMasterChefV2
 * @notice Interface for PancakeSwap MasterChef V2
 * @dev Contract Address: 0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652
 */
interface IMasterChefV2 {
    struct PoolInfo {
        uint256 accCakePerShare;
        uint256 lastRewardBlock;
        uint256 allocPoint;
        uint256 totalBoostedShare;
        bool isRegular;
    }
    
    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
        uint256 boostMultiplier;
    }
    
    /**
     * @notice Deposit LP tokens to earn CAKE
     * @param pid Pool ID
     * @param amount Amount of LP tokens to deposit
     */
    function deposit(uint256 pid, uint256 amount) external;
    
    /**
     * @notice Withdraw LP tokens
     * @param pid Pool ID
     * @param amount Amount of LP tokens to withdraw
     */
    function withdraw(uint256 pid, uint256 amount) external;
    
    /**
     * @notice Harvest CAKE rewards
     * @param pid Pool ID
     * @param to Address to send rewards to
     */
    function harvest(uint256 pid, address to) external;
    
    /**
     * @notice Emergency withdraw (forfeits rewards)
     * @param pid Pool ID
     */
    function emergencyWithdraw(uint256 pid) external;
    
    /**
     * @notice Get pending CAKE rewards
     * @param pid Pool ID
     * @param user User address
     * @return pending Pending CAKE amount
     */
    function pendingCake(uint256 pid, address user) external view returns (uint256 pending);
    
    /**
     * @notice Get pool information
     * @param pid Pool ID
     * @return info Pool information struct
     */
    function poolInfo(uint256 pid) external view returns (PoolInfo memory info);
    
    /**
     * @notice Get user information
     * @param pid Pool ID
     * @param user User address
     * @return info User information struct
     */
    function userInfo(uint256 pid, address user) external view returns (UserInfo memory info);
    
    /**
     * @notice Get total number of pools
     * @return length Total pools
     */
    function poolLength() external view returns (uint256 length);
    
    /**
     * @notice Get LP token address for a pool
     * @param pid Pool ID
     * @return lpToken LP token contract address
     */
    function lpToken(uint256 pid) external view returns (address lpToken);
}
