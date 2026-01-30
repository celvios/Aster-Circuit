// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IStrategy
 * @notice Interface for strategy contract automation
 */
interface IStrategy {
    function compound() external returns (uint256);
    function checkAndRebalance() external;
    function getPendingRewards() external view returns (uint256);
}

/**
 * @title Heartbeat
 * @notice Permissionless automation contract for AsterCircuit
 * @dev Anyone can call beat() to trigger strategy cycles and earn rewards
 *      This ensures the system runs autonomously without centralized infrastructure
 */
contract Heartbeat is ReentrancyGuard, Ownable {

    // ============ State Variables ============

    /// @notice Strategy contract to automate
    IStrategy public strategy;
    
    /// @notice Minimum time between heartbeats (1 hour)
    uint256 public beatInterval;
    
    /// @notice Timestamp of last beat
    uint256 public lastBeat;
    
    /// @notice Reward for caller in basis points (0.1% = 10 bps)
    uint256 public callerRewardBps;
    
    /// @notice Total beats executed
    uint256 public totalBeats;
    
    /// @notice Total rewards distributed to callers
    uint256 public totalRewardsDistributed;

    // ============ Constants ============

    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MIN_BEAT_INTERVAL = 30 minutes;
    uint256 public constant MAX_BEAT_INTERVAL = 24 hours;
    uint256 public constant MAX_CALLER_REWARD_BPS = 100; // Max 1%

    // ============ Events ============

    event Beat(
        address indexed caller,
        uint256 indexed beatNumber,
        uint256 reward,
        uint256 timestamp
    );
    event StrategyUpdated(address indexed oldStrategy, address indexed newStrategy);
    event ParametersUpdated(uint256 beatInterval, uint256 callerRewardBps);

    // ============ Errors ============

    error TooSoon(uint256 timeRemaining);
    error StrategyNotSet();
    error InvalidInterval();
    error InvalidRewardBps();

    // ============ Constructor ============

    constructor(
        address _strategy,
        uint256 _beatInterval,
        uint256 _callerRewardBps
    ) Ownable(msg.sender) {
        if (_strategy == address(0)) revert StrategyNotSet();
        if (_beatInterval < MIN_BEAT_INTERVAL || _beatInterval > MAX_BEAT_INTERVAL) revert InvalidInterval();
        if (_callerRewardBps > MAX_CALLER_REWARD_BPS) revert InvalidRewardBps();

        strategy = IStrategy(_strategy);
        beatInterval = _beatInterval;
        callerRewardBps = _callerRewardBps;
        lastBeat = block.timestamp;
    }

    // ============ Core Functions ============

    /**
     * @notice Main heartbeat function - anyone can call
     * @dev Triggers strategy execution and rewards the caller
     * @return reward Amount of reward paid to caller
     */
    function beat() external nonReentrant returns (uint256 reward) {
        // Check if enough time has passed
        uint256 timeSinceLastBeat = block.timestamp - lastBeat;
        if (timeSinceLastBeat < beatInterval) {
            revert TooSoon(beatInterval - timeSinceLastBeat);
        }

        // Execute strategy cycle
        try strategy.checkAndRebalance() {
            // Rebalancing succeeded
        } catch {
            // If rebalancing fails, try compound
            try strategy.compound() {
                // Compound succeeded
            } catch {
                // If both fail, still update lastBeat but don't pay reward
                lastBeat = block.timestamp;
                totalBeats++;
                emit Beat(msg.sender, totalBeats, 0, block.timestamp);
                return 0;
            }
        }

        // Calculate caller reward
        reward = calculateCallerReward();

        // Update state
        lastBeat = block.timestamp;
        totalBeats++;
        totalRewardsDistributed += reward;

        // Pay reward to caller
        if (reward > 0) {
            payable(msg.sender).transfer(reward);
        }

        emit Beat(msg.sender, totalBeats, reward, block.timestamp);
    }

    /**
     * @notice Calculate reward for the caller
     * @dev Reward is based on gas cost + fixed percentage of pending rewards
     * @return reward Reward amount in BNB
     */
    function calculateCallerReward() internal view returns (uint256 reward) {
        // Get pending rewards from strategy
        uint256 pendingRewards = strategy.getPendingRewards();
        
        // Calculate reward as percentage of pending rewards
        reward = (pendingRewards * callerRewardBps) / BASIS_POINTS;
        
        // Cap reward at contract balance
        uint256 contractBalance = address(this).balance;
        if (reward > contractBalance) {
            reward = contractBalance;
        }
    }

    // ============ View Functions ============

    /**
     * @notice Check if beat can be called
     * @return canBeat True if beat() can be called
     * @return timeRemaining Time until next beat (0 if can beat now)
     */
    function canBeatNow() external view returns (bool canBeat, uint256 timeRemaining) {
        uint256 timeSinceLastBeat = block.timestamp - lastBeat;
        
        if (timeSinceLastBeat >= beatInterval) {
            canBeat = true;
            timeRemaining = 0;
        } else {
            canBeat = false;
            timeRemaining = beatInterval - timeSinceLastBeat;
        }
    }

    /**
     * @notice Preview the reward for calling beat()
     * @return reward Estimated reward amount
     */
    function previewBeatReward() external view returns (uint256 reward) {
        uint256 pendingRewards = strategy.getPendingRewards();
        reward = (pendingRewards * callerRewardBps) / BASIS_POINTS;
        
        uint256 contractBalance = address(this).balance;
        if (reward > contractBalance) {
            reward = contractBalance;
        }
    }

    /**
     * @notice Get time until next beat
     * @return secondsRemaining Seconds until next beat can be called
     */
    function timeUntilNextBeat() external view returns (uint256 secondsRemaining) {
        uint256 timeSinceLastBeat = block.timestamp - lastBeat;
        
        if (timeSinceLastBeat >= beatInterval) {
            return 0;
        }
        
        secondsRemaining = beatInterval - timeSinceLastBeat;
    }

    /**
     * @notice Get heartbeat statistics
     */
    function getStats() external view returns (
        uint256 _totalBeats,
        uint256 _lastBeat,
        uint256 _totalRewardsDistributed,
        uint256 _contractBalance
    ) {
        _totalBeats = totalBeats;
        _lastBeat = lastBeat;
        _totalRewardsDistributed = totalRewardsDistributed;
        _contractBalance = address(this).balance;
    }

    // ============ Admin Functions ============

    /**
     * @notice Update strategy contract
     * @param _strategy New strategy address
     */
    function setStrategy(address _strategy) external onlyOwner {
        if (_strategy == address(0)) revert StrategyNotSet();
        
        address oldStrategy = address(strategy);
        strategy = IStrategy(_strategy);
        
        emit StrategyUpdated(oldStrategy, _strategy);
    }

    /**
     * @notice Update heartbeat parameters
     * @param _beatInterval New beat interval
     * @param _callerRewardBps New caller reward in bps
     */
    function setParameters(
        uint256 _beatInterval,
        uint256 _callerRewardBps
    ) external onlyOwner {
        if (_beatInterval < MIN_BEAT_INTERVAL || _beatInterval > MAX_BEAT_INTERVAL) revert InvalidInterval();
        if (_callerRewardBps > MAX_CALLER_REWARD_BPS) revert InvalidRewardBps();

        beatInterval = _beatInterval;
        callerRewardBps = _callerRewardBps;

        emit ParametersUpdated(_beatInterval, _callerRewardBps);
    }

    /**
     * @notice Fund the heartbeat contract to pay rewards
     */
    function fund() external payable {
        // Anyone can fund the contract
    }

    /**
     * @notice Emergency withdraw
     */
    function emergencyWithdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // ============ Receive BNB ============

    receive() external payable {}
}
