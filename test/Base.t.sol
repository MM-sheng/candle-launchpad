// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CandleAuctionHouse} from "../src/CandleAuctionHouse.sol";
import {MockRandomnessProvider} from "../src/randomness/MockRandomnessProvider.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

abstract contract BaseTest is Test {
    CandleAuctionHouse house;
    MockRandomnessProvider rng;
    MockERC20 token;

    address issuer = makeAddr("issuer");
    uint256 constant UNIT = 1e18;
    uint256 constant SUPPLY = 1000 * UNIT;
    uint256 constant MIN_PRICE = 0.001 ether;
    uint256 constant TICK = 0.0005 ether;

    struct Committed {
        uint256 auctionId;
        uint256 index;
        address bidder;
        uint8 tick;
        uint256 quantity;
        bytes32 salt;
        uint256 deposit;
    }

    function setUp() public virtual {
        vm.roll(1000);
        rng = new MockRandomnessProvider();
        house = new CandleAuctionHouse(rng);
        rng.setAuctionHouse(address(house));
        token = new MockERC20("Launch", "LCH", 18);
        token.mint(issuer, 1e12 * UNIT);
        vm.prank(issuer);
        token.approve(address(house), type(uint256).max);
    }

    function defaultParams() internal view returns (CandleAuctionHouse.AuctionParams memory p) {
        p = CandleAuctionHouse.AuctionParams({
            token: token,
            supply: SUPPLY,
            priceUnit: UNIT,
            minPrice: MIN_PRICE,
            priceTick: TICK,
            numTicks: 10,
            startBlock: uint64(block.number + 10),
            endBlock: uint64(block.number + 110),
            revealDurationBlocks: 100,
            minCutoffRatioBps: 5000,
            unrevealedPenaltyBps: 1000,
            minRaise: 0,
            randomnessTimeoutBlocks: 200
        });
    }

    function create(CandleAuctionHouse.AuctionParams memory p) internal returns (uint256 id) {
        vm.prank(issuer);
        id = house.createAuction(p);
    }

    function price(uint256 id, uint8 tick) internal view returns (uint256) {
        return house.priceOfTick(id, tick);
    }

    function costOf(uint256 id, uint256 qty, uint8 tick) internal view returns (uint256) {
        return house.cost(id, qty, price(id, tick));
    }

    function newBidder(string memory name) internal returns (address a) {
        a = makeAddr(name);
        vm.deal(a, 1_000_000 ether);
    }

    function commit(uint256 id, address bidder, uint8 tick, uint256 qty, uint256 deposit)
        internal
        returns (Committed memory c)
    {
        bytes32 salt = keccak256(abi.encode(bidder, tick, qty, block.number, house.bidCount(id)));
        bytes32 h = house.commitmentHash(id, bidder, tick, qty, salt);
        vm.prank(bidder);
        uint256 idx = house.commitBid{value: deposit}(id, h);
        c = Committed(id, idx, bidder, tick, qty, salt, deposit);
    }

    function reveal(Committed memory c) internal {
        vm.prank(c.bidder);
        house.revealBid(c.auctionId, c.index, c.tick, c.quantity, c.salt);
    }

    /// Warp past the window, request + fulfil randomness.
    function runRandomness(uint256 id, uint256 word) internal {
        CandleAuctionHouse.Auction memory a = house.getAuction(id);
        if (block.number <= a.p.endBlock) vm.roll(a.p.endBlock + 1);
        house.requestRandomness(id);
        rng.fulfill(house.getAuction(id).randomnessRequestId, word);
    }

    function finalizeAfterReveal(uint256 id) internal {
        vm.roll(house.getAuction(id).revealEndBlock + 1);
        house.finalize(id);
    }

    struct Totals {
        uint256 refunds;
        uint256 tokens;
        uint256 issuerNative;
        uint256 issuerTokens;
    }

    /// Claims every unclaimed bid, withdraws issuer proceeds, asserts conservation:
    ///   issuerNative + Σrefunds == Σdeposits ; Σtokens + issuerTokens == supply
    function claimAllAndCheck(uint256 id, Committed[] memory bids) internal returns (Totals memory t) {
        uint256 totalDeposits;
        address cranker = makeAddr("cranker");
        for (uint256 i = 0; i < bids.length; i++) {
            totalDeposits += bids[i].deposit;
            if (house.getBid(id, bids[i].index).claimed) {
                // claimed inside the test body; account by balances there instead
                continue;
            }
            uint256 nb = bids[i].bidder.balance;
            uint256 tb = token.balanceOf(bids[i].bidder);
            vm.prank(cranker);
            house.claim(id, bids[i].index);
            t.refunds += bids[i].bidder.balance - nb;
            t.tokens += token.balanceOf(bids[i].bidder) - tb;
        }
        CandleAuctionHouse.Auction memory a = house.getAuction(id);
        assertEq(a.claimedBids, house.bidCount(id), "all claimed");

        uint256 inb = issuer.balance;
        uint256 itb = token.balanceOf(issuer);
        vm.prank(issuer);
        house.withdrawProceeds(id);
        t.issuerNative = issuer.balance - inb;
        t.issuerTokens = token.balanceOf(issuer) - itb;

        a = house.getAuction(id);
        assertEq(t.issuerNative, a.proceedsClaimed + a.penaltiesClaimed, "issuer income = proceeds+penalties");
        assertEq(t.issuerNative + t.refunds + _preClaimed[id], totalDeposits, "native conservation");
        assertEq(t.tokens + t.issuerTokens + _preClaimedTokens[id], SUPPLYOf(id), "token conservation");
        // no per-auction escrow left behind
        vm.prank(issuer);
        vm.expectRevert(CandleAuctionHouse.NothingToWithdraw.selector);
        house.withdrawProceeds(id);
    }

    // For bids claimed inside a test body before claimAllAndCheck, record what they received.
    mapping(uint256 => uint256) _preClaimed;
    mapping(uint256 => uint256) _preClaimedTokens;

    function noteClaimed(uint256 id, uint256 refund, uint256 tokens_) internal {
        _preClaimed[id] += refund;
        _preClaimedTokens[id] += tokens_;
    }

    function SUPPLYOf(uint256 id) internal view returns (uint256) {
        return house.getAuction(id).p.supply;
    }
}
