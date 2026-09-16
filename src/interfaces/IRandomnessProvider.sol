// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Source of randomness for the auction house. After a request the
/// provider calls back `ICandleAuction(auction).onRandomness(auctionId, randomWord)`.
interface IRandomnessProvider {
    function requestRandomness(uint256 auctionId) external returns (uint256 requestId);
}

interface ICandleAuction {
    function onRandomness(uint256 auctionId, uint256 randomWord) external;
}
