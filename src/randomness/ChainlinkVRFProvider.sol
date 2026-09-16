// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {IRandomnessProvider, ICandleAuction} from "../interfaces/IRandomnessProvider.sol";

/// @notice Chainlink VRF v2.5 provider. One request per auction; the fulfilment
///         callback forwards the first random word to the auction house.
contract ChainlinkVRFProvider is IRandomnessProvider, VRFConsumerBaseV2Plus {
    address public auctionHouse;
    bytes32 public keyHash;
    uint256 public subscriptionId;
    uint32 public callbackGasLimit;
    uint16 public requestConfirmations;
    bool public payInNative;

    mapping(uint256 => uint256) public requestToAuction;
    mapping(uint256 => uint256) public auctionToRequest;

    event RandomnessRequested(uint256 indexed auctionId, uint256 indexed requestId);
    event RandomnessFulfilled(uint256 indexed auctionId, uint256 indexed requestId, uint256 randomWord);

    error NotAuctionHouse();
    error AlreadySet();
    error AlreadyRequested();

    constructor(
        address vrfCoordinator,
        bytes32 _keyHash,
        uint256 _subscriptionId,
        uint32 _callbackGasLimit,
        uint16 _requestConfirmations,
        bool _payInNative
    ) VRFConsumerBaseV2Plus(vrfCoordinator) {
        keyHash = _keyHash;
        subscriptionId = _subscriptionId;
        callbackGasLimit = _callbackGasLimit;
        requestConfirmations = _requestConfirmations;
        payInNative = _payInNative;
    }

    function setAuctionHouse(address house) external onlyOwner {
        if (auctionHouse != address(0)) revert AlreadySet();
        auctionHouse = house;
    }

    function setConfig(bytes32 _keyHash, uint256 _subscriptionId, uint32 _callbackGasLimit, uint16 _requestConfirmations, bool _payInNative)
        external
        onlyOwner
    {
        keyHash = _keyHash;
        subscriptionId = _subscriptionId;
        callbackGasLimit = _callbackGasLimit;
        requestConfirmations = _requestConfirmations;
        payInNative = _payInNative;
    }

    function requestRandomness(uint256 auctionId) external returns (uint256 requestId) {
        if (msg.sender != auctionHouse) revert NotAuctionHouse();
        if (auctionToRequest[auctionId] != 0) revert AlreadyRequested();
        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: keyHash,
                subId: subscriptionId,
                requestConfirmations: requestConfirmations,
                callbackGasLimit: callbackGasLimit,
                numWords: 1,
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: payInNative}))
            })
        );
        requestToAuction[requestId] = auctionId;
        auctionToRequest[auctionId] = requestId;
        emit RandomnessRequested(auctionId, requestId);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        uint256 auctionId = requestToAuction[requestId];
        emit RandomnessFulfilled(auctionId, requestId, randomWords[0]);
        ICandleAuction(auctionHouse).onRandomness(auctionId, randomWords[0]);
    }
}
