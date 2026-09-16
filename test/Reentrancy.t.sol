// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {CandleAuctionHouse} from "../src/CandleAuctionHouse.sol";

/// @dev Malicious bidder that re-enters `claim` (and `withdrawProceeds`) when paid.
contract ReentrantBidder {
    CandleAuctionHouse immutable house;
    uint256 auctionId;
    uint256 bidIndex;
    uint256 public reentered;
    bool public innerReverted;

    constructor(CandleAuctionHouse h) {
        house = h;
    }

    function commit(uint256 id, bytes32 c) external payable returns (uint256) {
        auctionId = id;
        bidIndex = house.commitBid{value: msg.value}(id, c);
        return bidIndex;
    }

    function reveal(uint8 tick, uint256 qty, bytes32 salt) external {
        house.revealBid(auctionId, bidIndex, tick, qty, salt);
    }

    receive() external payable {
        reentered++;
        try house.claim(auctionId, bidIndex) {}
        catch {
            innerReverted = true;
        }
    }
}

contract ReentrancyTest is BaseTest {
    // 12 --------------------------------------------------------------------
    function test_12_reentrantClaimIsBlocked() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        ReentrantBidder evil = new ReentrantBidder(house);
        vm.deal(address(evil), 100 ether);

        vm.roll(p.startBlock);
        uint256 qty = 10 * UNIT;
        bytes32 salt = keccak256("evil");
        bytes32 h = house.commitmentHash(id, address(evil), 1, qty, salt);
        uint256 deposit = costOf(id, qty, 1) + 5 ether;
        uint256 idx = evil.commit{value: deposit}(id, h);

        runRandomness(id, 1);
        evil.reveal(1, qty, salt);
        finalizeAfterReveal(id);

        uint256 houseBefore = address(house).balance;
        uint256 evilBefore = address(evil).balance;
        house.claim(id, idx);

        assertEq(evil.reentered(), 1, "receive() was called once");
        assertTrue(evil.innerReverted(), "re-entrant claim reverted");
        uint256 refund = deposit - costOf(id, qty, 0); // sole bidder → floor price
        assertEq(address(evil).balance - evilBefore, refund, "exactly one refund");
        assertEq(houseBefore - address(house).balance, refund);
        assertTrue(house.getBid(id, idx).claimed);
        vm.expectRevert(CandleAuctionHouse.AlreadyClaimed.selector);
        house.claim(id, idx);
    }
}
