// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAsterDEXPool {
    function getSpotPrice() external view returns (uint256);
    function getTWAP(uint32 secondsAgo) external view returns (uint256);
    function fees24h() external view returns (uint256);
    function totalLiquidity() external view returns (uint256);
}
