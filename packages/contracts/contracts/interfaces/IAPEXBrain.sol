// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAPEXBrain {
    struct WeightVector {
        uint256 lpYield;   // M1 (bps)
        uint256 staking;   // M2 (bps)
        uint256 lending;   // M3 (bps)
        uint256 hedge;     // M4 (bps)
        // Invariant: lpYield + staking + lending + hedge == 10000
    }

    function currentWeights() external view returns (WeightVector memory);
    function computeWeights() external view returns (WeightVector memory);
}
