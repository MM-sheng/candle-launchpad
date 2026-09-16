// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {CandleAuctionHouse} from "../src/CandleAuctionHouse.sol";
import {MockRandomnessProvider} from "../src/randomness/MockRandomnessProvider.sol";
import {FeeOnTransferERC20} from "./mocks/MockERC20.sol";

contract CandleAuctionHouseTest is BaseTest {
    address alice;
    address bob;
    address carol;

    function setUp() public override {
        super.setUp();
        alice = newBidder("alice");
        bob = newBidder("bob");
        carol = newBidder("carol");
    }

    // 1 ---------------------------------------------------------------------
    function test_01_happyPath_withConservation() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        assertEq(token.balanceOf(address(house)), SUPPLY);

        vm.roll(p.startBlock);
        Committed[] memory bids = new Committed[](3);
        // alice 500 @4 (over-deposits to hide size), bob 400 @2, carol 300 @2 (margin)
        bids[0] = commit(id, alice, 4, 500 * UNIT, costOf(id, 500 * UNIT, 4) + 1 ether);
        vm.roll(block.number + 5);
        bids[1] = commit(id, bob, 2, 400 * UNIT, costOf(id, 400 * UNIT, 2));
        vm.roll(block.number + 5);
        bids[2] = commit(id, carol, 2, 300 * UNIT, costOf(id, 300 * UNIT, 2));

        runRandomness(id, 12345);
        CandleAuctionHouse.Auction memory a = house.getAuction(id);
        assertEq(uint8(a.state), uint8(CandleAuctionHouse.State.Revealing));
        uint256 lo = p.startBlock + 50;
        assertGe(a.cutoffBlock, lo);
        assertLe(a.cutoffBlock, p.endBlock);

        for (uint256 i; i < 3; i++) reveal(bids[i]);
        uint256[64] memory d = house.getDemand(id);
        assertEq(d[4], 500 * UNIT);
        assertEq(d[2], 700 * UNIT);

        finalizeAfterReveal(id);
        a = house.getAuction(id);
        assertEq(uint8(a.state), uint8(CandleAuctionHouse.State.Finalized));
        assertEq(a.clearingTick, 2);
        assertEq(a.marginSupply, 500 * UNIT);
        assertEq(a.marginDemand, 700 * UNIT);

        Totals memory t = claimAllAndCheck(id, bids);
        assertEq(token.balanceOf(alice), 500 * UNIT);
        uint256 bobFill = 400 * UNIT * (500 * UNIT) / (700 * UNIT);
        uint256 carolFill = 300 * UNIT * (500 * UNIT) / (700 * UNIT);
        assertEq(token.balanceOf(bob), bobFill);
        assertEq(token.balanceOf(carol), carolFill);
        assertLe(t.tokens, SUPPLY);
        uint256 p2 = price(id, 2);
        assertEq(t.issuerNative, house.cost(id, 500 * UNIT, p2) + house.cost(id, bobFill, p2) + house.cost(id, carolFill, p2));
    }

    // 2 ---------------------------------------------------------------------
    function test_02_bidAfterCutoff_refundOnly() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        p.minCutoffRatioBps = 0;
        uint256 id = create(p);
        vm.roll(p.startBlock);
        Committed memory early = commit(id, alice, 1, 10 * UNIT, costOf(id, 10 * UNIT, 1));
        vm.roll(p.startBlock + 90);
        Committed memory late = commit(id, bob, 1, 10 * UNIT, costOf(id, 10 * UNIT, 1));

        runRandomness(id, 20); // ratio 0 → cutoff = start + 20
        assertEq(house.getAuction(id).cutoffBlock, p.startBlock + 20);

        vm.prank(bob);
        vm.expectRevert(CandleAuctionHouse.BidAfterCutoff.selector);
        house.revealBid(id, late.index, 1, 10 * UNIT, late.salt);
        reveal(early);

        // invalid bid refundable immediately, in full
        uint256 nb = bob.balance;
        house.claim(id, late.index);
        assertEq(bob.balance - nb, late.deposit);
        noteClaimed(id, late.deposit, 0);
        // valid bid not claimable before finalize
        vm.expectRevert(CandleAuctionHouse.NotClaimable.selector);
        house.claim(id, early.index);

        finalizeAfterReveal(id);
        Committed[] memory bids = new Committed[](2);
        bids[0] = early;
        bids[1] = late;
        claimAllAndCheck(id, bids);
    }

    // 3 ---------------------------------------------------------------------
    function test_03_wrongHashRejected() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        vm.roll(p.startBlock);
        Committed memory b = commit(id, alice, 3, 10 * UNIT, costOf(id, 10 * UNIT, 3));
        runRandomness(id, 7);
        vm.startPrank(alice);
        vm.expectRevert(CandleAuctionHouse.CommitmentMismatch.selector);
        house.revealBid(id, b.index, 3, 11 * UNIT, b.salt);
        vm.expectRevert(CandleAuctionHouse.CommitmentMismatch.selector);
        house.revealBid(id, b.index, 2, 10 * UNIT, b.salt);
        vm.expectRevert(CandleAuctionHouse.CommitmentMismatch.selector);
        house.revealBid(id, b.index, 3, 10 * UNIT, bytes32(0));
        house.revealBid(id, b.index, 3, 10 * UNIT, b.salt);
        vm.expectRevert(CandleAuctionHouse.AlreadyRevealed.selector);
        house.revealBid(id, b.index, 3, 10 * UNIT, b.salt);
        vm.stopPrank();
        // someone else cannot reveal alice's bid
        vm.prank(bob);
        vm.expectRevert(CandleAuctionHouse.Unauthorized.selector);
        house.revealBid(id, b.index, 3, 10 * UNIT, b.salt);
    }

    // 4 ---------------------------------------------------------------------
    function test_04_insufficientDepositRejected() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        vm.roll(p.startBlock);
        Committed memory b = commit(id, alice, 3, 10 * UNIT, costOf(id, 10 * UNIT, 3) - 1);
        runRandomness(id, 7);
        vm.prank(alice);
        vm.expectRevert(CandleAuctionHouse.InsufficientDeposit.selector);
        house.revealBid(id, b.index, 3, 10 * UNIT, b.salt);
    }

    // 5 ---------------------------------------------------------------------
    function test_05_unrevealedPenalty() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        vm.roll(p.startBlock);
        uint256 dep = 2 ether;
        Committed memory silent = commit(id, alice, 3, 10 * UNIT, dep);
        Committed memory loud = commit(id, bob, 3, 10 * UNIT, costOf(id, 10 * UNIT, 3));
        runRandomness(id, 1);
        reveal(loud);
        finalizeAfterReveal(id);

        uint256 nb = alice.balance;
        house.claim(id, silent.index);
        uint256 penalty = dep * 1000 / 10000;
        assertEq(alice.balance - nb, dep - penalty);
        assertEq(token.balanceOf(alice), 0);
        assertEq(house.getAuction(id).penaltiesClaimed, penalty);
        noteClaimed(id, dep - penalty, 0);

        Committed[] memory bids = new Committed[](2);
        bids[0] = silent;
        bids[1] = loud;
        Totals memory t = claimAllAndCheck(id, bids);
        assertEq(t.issuerNative, penalty + costOf(id, 10 * UNIT, 0)); // undersubscribed → floor price
    }

    // 6 ---------------------------------------------------------------------
    function test_06_undersubscribed_floorPrice() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        vm.roll(p.startBlock);
        Committed[] memory bids = new Committed[](2);
        bids[0] = commit(id, alice, 5, 100 * UNIT, costOf(id, 100 * UNIT, 5));
        bids[1] = commit(id, bob, 0, 200 * UNIT, costOf(id, 200 * UNIT, 0));
        runRandomness(id, 3);
        reveal(bids[0]);
        reveal(bids[1]);
        finalizeAfterReveal(id);
        CandleAuctionHouse.Auction memory a = house.getAuction(id);
        assertEq(a.clearingTick, 0);
        assertEq(a.totalSold, 300 * UNIT);

        Totals memory t = claimAllAndCheck(id, bids);
        assertEq(token.balanceOf(alice), 100 * UNIT);
        assertEq(token.balanceOf(bob), 200 * UNIT);
        assertEq(t.issuerTokens, 700 * UNIT);
        assertEq(t.issuerNative, costOf(id, 300 * UNIT, 0)); // alice pays floor, not her bid
    }

    // 7 ---------------------------------------------------------------------
    function test_07_marginProRata_neverOverAllocates() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        p.supply = 1_000_001; // awkward base units
        uint256 id = create(p);
        vm.roll(p.startBlock);
        uint256[5] memory qs = [uint256(333_337), 123_457, 999_983, 7, 500_001];
        Committed[] memory bids = new Committed[](5);
        for (uint256 i; i < 5; i++) {
            address w = newBidder(string(abi.encodePacked("w", i)));
            uint256 dep = costOf(id, qs[i], 2) + 1;
            if (dep < MIN_PRICE) dep = MIN_PRICE;
            bids[i] = commit(id, w, 2, qs[i], dep);
        }
        runRandomness(id, 99);
        for (uint256 i; i < 5; i++) reveal(bids[i]);
        finalizeAfterReveal(id);
        Totals memory t = claimAllAndCheck(id, bids);
        assertLe(t.tokens, p.supply, "no over-allocation");
        assertGe(t.tokens, p.supply - 5, "dust bounded by bid count");
        assertEq(t.issuerTokens, p.supply - t.tokens);
    }

    // 8 ---------------------------------------------------------------------
    function test_08_doubleClaimRejected() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        vm.roll(p.startBlock);
        Committed memory b = commit(id, alice, 1, 5 * UNIT, costOf(id, 5 * UNIT, 1));
        runRandomness(id, 1);
        reveal(b);
        finalizeAfterReveal(id);
        house.claim(id, b.index);
        vm.expectRevert(CandleAuctionHouse.AlreadyClaimed.selector);
        house.claim(id, b.index);
    }

    // 9 ---------------------------------------------------------------------
    function test_09_stateMachine() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);

        // before start
        vm.prank(alice);
        vm.expectRevert(CandleAuctionHouse.CommitWindowClosed.selector);
        house.commitBid{value: 1 ether}(id, bytes32(0));
        vm.expectRevert(CandleAuctionHouse.InvalidState.selector);
        house.finalize(id);
        vm.expectRevert(CandleAuctionHouse.RandomnessTimeoutNotElapsed.selector);
        house.settleFallback(id);
        vm.expectRevert(CandleAuctionHouse.CommitWindowNotEnded.selector);
        house.requestRandomness(id);

        vm.roll(p.startBlock);
        Committed memory b = commit(id, alice, 1, UNIT, 1 ether);
        vm.expectRevert(CandleAuctionHouse.InvalidState.selector);
        house.finalize(id);
        vm.prank(alice);
        vm.expectRevert(CandleAuctionHouse.InvalidState.selector);
        house.revealBid(id, b.index, 1, UNIT, b.salt);
        vm.prank(issuer);
        vm.expectRevert(CandleAuctionHouse.AlreadyStarted.selector);
        house.cancelAuction(id);
        vm.expectRevert(CandleAuctionHouse.CommitWindowNotEnded.selector);
        house.requestRandomness(id);
        // provider cannot push randomness before a request
        vm.expectRevert(CandleAuctionHouse.RandomnessAlreadySet.selector);
        rng.fulfillAuction(id, 1);

        vm.roll(p.endBlock + 1);
        vm.prank(alice);
        vm.expectRevert(CandleAuctionHouse.CommitWindowClosed.selector);
        house.commitBid{value: 1 ether}(id, bytes32(0));
        vm.expectRevert(CandleAuctionHouse.RandomnessTimeoutNotElapsed.selector);
        house.settleFallback(id);

        // fallback path
        vm.roll(p.endBlock + p.randomnessTimeoutBlocks + 1);
        house.settleFallback(id);
        CandleAuctionHouse.Auction memory a = house.getAuction(id);
        assertEq(a.cutoffBlock, p.endBlock);
        vm.expectRevert(CandleAuctionHouse.InvalidState.selector);
        house.requestRandomness(id);
        vm.expectRevert(CandleAuctionHouse.InvalidState.selector);
        house.settleFallback(id);
        vm.expectRevert(CandleAuctionHouse.RevealPeriodNotEnded.selector);
        house.finalize(id);
        reveal(b);
        vm.roll(a.revealEndBlock + 1);
        vm.prank(alice);
        vm.expectRevert(CandleAuctionHouse.RevealPeriodOver.selector);
        house.revealBid(id, b.index, 1, UNIT, b.salt);
        house.finalize(id);
        vm.expectRevert(CandleAuctionHouse.InvalidState.selector);
        house.finalize(id);
        vm.prank(alice);
        vm.expectRevert(CandleAuctionHouse.Unauthorized.selector);
        house.withdrawProceeds(id);

        Committed[] memory bids = new Committed[](1);
        bids[0] = b;
        claimAllAndCheck(id, bids);
    }

    function test_09b_cancelBeforeStart() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        vm.prank(alice);
        vm.expectRevert(CandleAuctionHouse.Unauthorized.selector);
        house.cancelAuction(id);
        uint256 before = token.balanceOf(issuer);
        vm.startPrank(issuer);
        house.cancelAuction(id);
        house.withdrawProceeds(id);
        vm.stopPrank();
        assertEq(token.balanceOf(issuer) - before, SUPPLY);
    }

    function test_09c_minRaiseNotMet_cancelled_fullRefunds() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        p.minRaise = 100 ether;
        uint256 id = create(p);
        vm.roll(p.startBlock);
        Committed[] memory bids = new Committed[](2);
        bids[0] = commit(id, alice, 1, 5 * UNIT, costOf(id, 5 * UNIT, 1));
        bids[1] = commit(id, bob, 1, 5 * UNIT, 1 ether); // never reveals
        runRandomness(id, 1);
        reveal(bids[0]);
        finalizeAfterReveal(id);
        assertEq(uint8(house.getAuction(id).state), uint8(CandleAuctionHouse.State.Cancelled));
        Totals memory t = claimAllAndCheck(id, bids);
        assertEq(t.issuerNative, 0);
        assertEq(t.tokens, 0);
        assertEq(t.issuerTokens, SUPPLY);
        assertEq(t.refunds, bids[0].deposit + bids[1].deposit);
    }

    function test_09d_nobodyReveals_cancelled_noPenalty() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        vm.roll(p.startBlock);
        Committed[] memory bids = new Committed[](1);
        bids[0] = commit(id, alice, 1, 5 * UNIT, 1 ether);
        runRandomness(id, 1);
        finalizeAfterReveal(id);
        assertEq(uint8(house.getAuction(id).state), uint8(CandleAuctionHouse.State.Cancelled));
        Totals memory t = claimAllAndCheck(id, bids);
        assertEq(t.refunds, 1 ether);
    }

    // 10 --------------------------------------------------------------------
    function test_10_cutoffDistribution() public {
        uint16[3] memory ratios = [uint16(0), 5000, 10000];
        uint64 len = 100;
        for (uint256 r; r < 3; r++) {
            for (uint256 i; i < 25; i++) {
                CandleAuctionHouse.AuctionParams memory p = defaultParams();
                p.minCutoffRatioBps = ratios[r];
                p.endBlock = p.startBlock + len;
                uint256 id = create(p);
                uint256 word = uint256(keccak256(abi.encode(r, i)));
                runRandomness(id, word);
                uint64 c = house.getAuction(id).cutoffBlock;
                uint256 lo = p.startBlock + (uint256(len) * ratios[r] + 9999) / 10000;
                assertGe(c, lo);
                assertLe(c, p.endBlock);
                if (ratios[r] == 10000) assertEq(c, p.endBlock);
                vm.roll(1000); // reset for next auction params
            }
        }
    }

    // 11 --------------------------------------------------------------------
    function test_11_extremes() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        p.numTicks = 64;
        p.supply = 1_000_000 * UNIT;
        uint256 id = create(p);
        vm.roll(p.startBlock);
        address whale = newBidder("whale");
        vm.deal(whale, 1e9 ether);
        uint256 huge = 5_000_000 * UNIT;
        Committed[] memory bids = new Committed[](3);
        bids[0] = commit(id, whale, 63, huge, costOf(id, huge, 63));
        bids[1] = commit(id, alice, 10, 0, 1 ether); // zero qty
        bids[2] = commit(id, bob, 64, UNIT, 1 ether); // tick out of range
        runRandomness(id, 5);
        reveal(bids[0]);
        vm.prank(alice);
        vm.expectRevert(CandleAuctionHouse.ZeroQuantity.selector);
        house.revealBid(id, bids[1].index, 10, 0, bids[1].salt);
        vm.prank(bob);
        vm.expectRevert(CandleAuctionHouse.InvalidTick.selector);
        house.revealBid(id, bids[2].index, 64, UNIT, bids[2].salt);
        finalizeAfterReveal(id);
        assertEq(house.getAuction(id).clearingTick, 63);
        Totals memory t = claimAllAndCheck(id, bids);
        assertEq(token.balanceOf(whale), 1_000_000 * UNIT);
        assertEq(t.issuerNative, costOf(id, 1_000_000 * UNIT, 63) + 2 * (1 ether * 1000 / 10000));
    }

    function test_paramsValidation() public {
        CandleAuctionHouse.AuctionParams memory p;
        vm.startPrank(issuer);
        p = defaultParams();
        p.numTicks = 65;
        vm.expectRevert(CandleAuctionHouse.InvalidParams.selector);
        house.createAuction(p);
        p = defaultParams();
        p.numTicks = 0;
        vm.expectRevert(CandleAuctionHouse.InvalidParams.selector);
        house.createAuction(p);
        p = defaultParams();
        p.supply = 0;
        vm.expectRevert(CandleAuctionHouse.InvalidParams.selector);
        house.createAuction(p);
        p = defaultParams();
        p.endBlock = p.startBlock - 1;
        vm.expectRevert(CandleAuctionHouse.InvalidParams.selector);
        house.createAuction(p);
        p = defaultParams();
        p.unrevealedPenaltyBps = 10001;
        vm.expectRevert(CandleAuctionHouse.InvalidParams.selector);
        house.createAuction(p);
        p = defaultParams();
        p.startBlock = uint64(block.number - 1);
        vm.expectRevert(CandleAuctionHouse.InvalidParams.selector);
        house.createAuction(p);
        vm.stopPrank();
    }

    // 13 --------------------------------------------------------------------
    function test_13_feeOnTransferTokenRejected() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20();
        fee.mint(issuer, 1e6 * UNIT);
        vm.startPrank(issuer);
        fee.approve(address(house), type(uint256).max);
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        p.token = fee;
        vm.expectRevert(CandleAuctionHouse.SupplyMismatch.selector);
        house.createAuction(p);
        vm.stopPrank();
    }

    // 14 --------------------------------------------------------------------
    function test_14_onRandomness_accessControl() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        vm.roll(p.endBlock + 1);
        house.requestRandomness(id);
        // non-provider rejected
        vm.prank(alice);
        vm.expectRevert(CandleAuctionHouse.NotProvider.selector);
        house.onRandomness(id, 1);
        // provider delivers once
        uint256 req = house.getAuction(id).randomnessRequestId;
        rng.fulfill(req, 42);
        // second delivery rejected
        vm.expectRevert(CandleAuctionHouse.RandomnessAlreadySet.selector);
        rng.fulfill(req, 43);
        // provider can only be driven by the house
        vm.prank(alice);
        vm.expectRevert(MockRandomnessProvider.NotAuctionHouse.selector);
        rng.requestRandomness(id);
    }

    // permissionless claim goes to bidder, not caller
    function test_claimByThirdParty_paysBidder() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        vm.roll(p.startBlock);
        Committed memory b = commit(id, alice, 1, 5 * UNIT, costOf(id, 5 * UNIT, 1) + 1 ether);
        runRandomness(id, 1);
        reveal(b);
        finalizeAfterReveal(id);
        uint256 ab = alice.balance;
        uint256 bb = bob.balance;
        vm.prank(bob);
        house.claim(id, b.index);
        assertEq(alice.balance - ab, b.deposit - costOf(id, 5 * UNIT, 0)); // pays floor price
        assertEq(bob.balance, bb);
        assertEq(token.balanceOf(alice), 5 * UNIT);
    }

    // issuer can withdraw certainly-unsold tokens before all claims, dust after
    function test_withdrawProceeds_twoPhase() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        vm.roll(p.startBlock);
        Committed[] memory bids = new Committed[](2);
        bids[0] = commit(id, alice, 2, 300 * UNIT, costOf(id, 300 * UNIT, 2));
        bids[1] = commit(id, bob, 2, 100 * UNIT + 1, costOf(id, 100 * UNIT + 1, 2));
        runRandomness(id, 1);
        reveal(bids[0]);
        reveal(bids[1]);
        finalizeAfterReveal(id);
        // undersubscribed: totalSold = 400e18+1, unsold certain = supply - that
        uint256 before = token.balanceOf(issuer);
        vm.prank(issuer);
        house.withdrawProceeds(id);
        assertEq(token.balanceOf(issuer) - before, SUPPLY - (400 * UNIT + 1));
        noteClaimed(id, 0, SUPPLY - (400 * UNIT + 1)); // tokens already left the house
        vm.prank(issuer);
        vm.expectRevert(CandleAuctionHouse.NothingToWithdraw.selector);
        house.withdrawProceeds(id);
        claimAllAndCheck(id, bids);
    }
}
