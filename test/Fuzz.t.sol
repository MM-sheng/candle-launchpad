// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {CandleAuctionHouse} from "../src/CandleAuctionHouse.sol";

/// 15. Random bid sets → both conservation invariants always hold.
contract FuzzTest is BaseTest {
    struct BidSpec {
        uint8 tick;
        uint96 qty;
        uint8 commitOffset; // 0..100 blocks after start
        uint8 behaviour; // 0 = reveal, 1 = don't reveal, 2 = over-deposit + reveal
    }

    function testFuzz_conservation(uint256 supply, uint8 numTicks, uint256 randomWord, BidSpec[8] memory specs)
        public
    {
        supply = bound(supply, 1, 1e6 * UNIT);
        numTicks = uint8(bound(numTicks, 1, 64));

        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        p.supply = supply;
        p.numTicks = numTicks;
        p.minCutoffRatioBps = uint16(bound(randomWord, 0, 10000));
        uint256 id = create(p);

        Committed[] memory bids = new Committed[](specs.length);
        uint64 lastBlock = p.startBlock;
        for (uint256 i; i < specs.length; i++) {
            BidSpec memory s = specs[i];
            uint8 tick = uint8(bound(s.tick, 0, numTicks - 1));
            uint256 qty = bound(uint256(s.qty), 1, 2 * supply + 1);
            uint64 blk = p.startBlock + uint64(bound(s.commitOffset, 0, 100));
            if (blk < lastBlock) blk = lastBlock; // keep block numbers monotonic
            lastBlock = blk;
            vm.roll(blk);
            address bidder = newBidder(string(abi.encodePacked("f", i)));
            uint256 deposit = costOf(id, qty, tick) + (s.behaviour % 3 == 2 ? 3 ether : 0);
            if (deposit < MIN_PRICE) deposit = MIN_PRICE;
            bids[i] = commit(id, bidder, tick, qty, deposit);
        }

        runRandomness(id, randomWord);
        uint64 cutoff = house.getAuction(id).cutoffBlock;
        for (uint256 i; i < specs.length; i++) {
            if (specs[i].behaviour % 3 == 1) continue; // stays silent
            if (house.getBid(id, bids[i].index).commitBlock > cutoff) continue; // invalid, would revert
            reveal(bids[i]);
        }
        finalizeAfterReveal(id);

        Totals memory t = claimAllAndCheck(id, bids);
        assertLe(t.tokens, supply);
        assertEq(address(house).balance, 0, "house holds nothing after full settlement");
        assertEq(house.totalEscrowed(), 0);
    }

    /// Clearing over an arbitrary histogram: fills at ticks above clearing are full,
    /// Σ pro-rata fills at the margin ≤ marginSupply, and totalSold matches.
    function testFuzz_computeClearing(uint256[64] memory demand, uint8 numTicks, uint256 supply) public view {
        numTicks = uint8(bound(numTicks, 1, 64));
        supply = bound(supply, 1, type(uint128).max);
        uint256 total;
        for (uint256 i; i < 64; i++) {
            demand[i] = i < numTicks ? bound(demand[i], 0, type(uint120).max) : 0;
            total += demand[i];
        }
        (uint8 ct, uint256 ms, uint256 md, uint256 sold) = house.computeClearing(demand, numTicks, supply);
        assertLt(ct, numTicks);
        uint256 above;
        for (uint256 i = ct + 1; i < numTicks; i++) above += demand[i];
        if (total >= supply) {
            assertEq(sold, supply);
            assertEq(md, demand[ct]);
            assertEq(above + ms, supply);
            assertLe(ms, md);
        } else {
            assertEq(sold, total);
            assertEq(ct, 0);
            assertEq(ms, md);
        }
    }
}
