// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRandomnessProvider, ICandleAuction} from "../interfaces/IRandomnessProvider.sol";

/// @notice Test-only provider: records requests, lets anyone fulfil them manually.
contract MockRandomnessProvider is IRandomnessProvider {
    address public auctionHouse;
    uint256 public nextRequestId = 1;
    mapping(uint256 => uint256) public requestToAuction; // requestId => auctionId
    mapping(uint256 => uint256) public auctionToRequest; // auctionId => requestId

    error NotAuctionHouse();
    error AlreadySet();

    function setAuctionHouse(address house) external {
        if (auctionHouse != address(0)) revert AlreadySet();
        auctionHouse = house;
    }

    function requestRandomness(uint256 auctionId) external returns (uint256 requestId) {
        if (msg.sender != auctionHouse) revert NotAuctionHouse();
        requestId = nextRequestId++;
        requestToAuction[requestId] = auctionId;
        auctionToRequest[auctionId] = requestId;
    }

    /// @notice Deliver a random word for a request (anyone, test only).
    function fulfill(uint256 requestId, uint256 randomWord) external {
        ICandleAuction(auctionHouse).onRandomness(requestToAuction[requestId], randomWord);
    }

    /// @notice Deliver a random word directly for an auction id (bypasses request bookkeeping).
    function fulfillAuction(uint256 auctionId, uint256 randomWord) external {
        ICandleAuction(auctionHouse).onRandomness(auctionId, randomWord);
    }
}
