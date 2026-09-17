// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {CandleAuctionHouse} from "../src/CandleAuctionHouse.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Token whose issuer can block transfers to chosen addresses (blocklist / rug).
contract BlockableERC20 is MockERC20 {
    mapping(address => bool) public blocked;

    constructor() MockERC20("Rug", "RUG", 18) {}

    function setBlocked(address a, bool b) external {
        blocked[a] = b;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[to], "blocked");
        super._update(from, to, value);
    }
}

/// @dev Bidder contract that refuses native currency (no receive/fallback).
contract NoReceiveBidder {
    CandleAuctionHouse immutable house;

    constructor(CandleAuctionHouse h) {
        house = h;
    }

    function commit(uint256 id, bytes32 c) external payable returns (uint256) {
        return house.commitBid{value: msg.value}(id, c);
    }

    function reveal(uint256 id, uint256 idx, uint8 tick, uint256 qty, bytes32 salt) external {
        house.revealBid(id, idx, tick, qty, salt);
    }

    function pull() external {
        house.withdrawPending();
    }
}

/// @dev Same, but accepts native currency — used to prove the pending balance is collectable.
contract LaterReceiveBidder is NoReceiveBidder {
    bool public accept;

    constructor(CandleAuctionHouse h) NoReceiveBidder(h) {}

    function setAccept(bool a) external {
        accept = a;
    }

    receive() external payable {
        require(accept, "no");
    }
}

contract DeliveryTest is BaseTest {
    BlockableERC20 rug;

    function setUp() public override {
        super.setUp();
        rug = new BlockableERC20();
        rug.mint(issuer, 1e9 * UNIT);
        vm.prank(issuer);
        rug.approve(address(house), type(uint256).max);
    }

    function _rugParams() internal view returns (CandleAuctionHouse.AuctionParams memory p) {
        p = defaultParams();
        p.token = rug;
    }

    /// Winner is blocklisted by the token after committing: refund still arrives, payment is parked,
    /// issuer is not credited, and after the delay the bidder recovers the payment.
    function test_H1_blockedTokenDoesNotTrapDeposit() public {
        uint256 id = create(_rugParams());
        address alice = newBidder("alice");
        vm.roll(house.getAuction(id).p.startBlock);
        Committed memory c = commit(id, alice, 2, 10 * UNIT, costOf(id, 10 * UNIT, 2) + 1 ether);
        runRandomness(id, 7);
        reveal(c);
        finalizeAfterReveal(id);

        rug.setBlocked(alice, true);

        uint256 before = alice.balance;
        house.claim(id, c.index);
        uint256 payment = costOf(id, 10 * UNIT, 0);
        // full refund of the unused deposit even though tokens could not move
        assertEq(alice.balance - before, c.deposit - payment, "refund delivered");
        assertEq(rug.balanceOf(alice), 0, "no tokens");
        CandleAuctionHouse.Auction memory a = house.getAuction(id);
        assertEq(a.proceedsClaimed, 0, "issuer not credited for undelivered tokens");

        // issuer can take the certainly-unsold part but not the dust while delivery is pending
        vm.prank(issuer);
        house.withdrawProceeds(id);
        assertEq(rug.balanceOf(address(house)), 10 * UNIT, "sold tokens still held");

        // retry fails while blocked
        vm.expectRevert(CandleAuctionHouse.DeliveryFailed.selector);
        house.claimTokens(id, c.index);
        vm.expectRevert(CandleAuctionHouse.RefundDelayNotElapsed.selector);
        house.refundUndelivered(id, c.index);

        vm.warp(block.timestamp + house.UNDELIVERED_REFUND_DELAY());
        uint256 before2 = alice.balance;
        house.refundUndelivered(id, c.index);
        assertEq(alice.balance - before2, payment, "payment returned");
        assertEq(house.totalEscrowed(), 0, "nothing left in escrow");

        // now the issuer can sweep the undelivered tokens as unsold
        vm.prank(issuer);
        house.withdrawProceeds(id);
        assertEq(rug.balanceOf(address(house)), 0, "vault drained");
        vm.expectRevert(CandleAuctionHouse.NothingPending.selector);
        house.refundUndelivered(id, c.index);
    }

    /// Token recovers (unblocked): retry delivers and credits the issuer exactly once.
    function test_H1_retryDeliversAndCreditsIssuer() public {
        uint256 id = create(_rugParams());
        address alice = newBidder("alice");
        vm.roll(house.getAuction(id).p.startBlock);
        Committed memory c = commit(id, alice, 1, 10 * UNIT, costOf(id, 10 * UNIT, 1));
        runRandomness(id, 7);
        reveal(c);
        finalizeAfterReveal(id);

        rug.setBlocked(alice, true);
        house.claim(id, c.index);
        rug.setBlocked(alice, false);

        house.claimTokens(id, c.index);
        assertEq(rug.balanceOf(alice), 10 * UNIT, "tokens delivered on retry");
        uint256 payment = costOf(id, 10 * UNIT, 0);
        assertEq(house.getAuction(id).proceedsClaimed, payment, "issuer credited once");
        vm.expectRevert(CandleAuctionHouse.NothingPending.selector);
        house.claimTokens(id, c.index);

        uint256 ib = issuer.balance;
        vm.prank(issuer);
        house.withdrawProceeds(id);
        assertEq(issuer.balance - ib, payment, "issuer withdraws proceeds");
        assertEq(rug.balanceOf(address(house)), 0, "vault drained incl. dust");
        assertEq(house.totalEscrowed(), 0);
    }

    /// Token that lies about balances in createAuction (mints nothing to the house):
    /// bidders still get refunds and, after the delay, their payments.
    function test_H1_tokenWithNoBalanceStillRefunds() public {
        uint256 id = create(_rugParams());
        // simulate a token that lied: yank the house's balance
        uint256 held = rug.balanceOf(address(house));
        vm.prank(address(house));
        rug.transfer(address(0xdead), held);

        address alice = newBidder("alice");
        vm.roll(house.getAuction(id).p.startBlock);
        Committed memory c = commit(id, alice, 0, 5 * UNIT, costOf(id, 5 * UNIT, 0) + 0.1 ether);
        runRandomness(id, 3);
        reveal(c);
        finalizeAfterReveal(id);

        uint256 before = alice.balance;
        house.claim(id, c.index);
        assertEq(alice.balance - before, 0.1 ether, "unused deposit refunded");
        vm.warp(block.timestamp + 30 days);
        house.refundUndelivered(id, c.index);
        assertEq(alice.balance - before, c.deposit, "made whole");
    }

    /// H2: a bidder that cannot receive native currency does not block settlement;
    /// its refund is parked and collectable later.
    function test_H2_rejectingReceiverGetsPendingBalance() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        uint256 id = create(p);
        LaterReceiveBidder bob = new LaterReceiveBidder(house);
        vm.deal(address(bob), 10 ether);
        address alice = newBidder("alice");

        vm.roll(p.startBlock);
        uint256 qty = 10 * UNIT;
        bytes32 salt = keccak256("bob");
        bytes32 h = house.commitmentHash(id, address(bob), 1, qty, salt);
        uint256 deposit = costOf(id, qty, 1) + 1 ether;
        uint256 idx = bob.commit{value: deposit}(id, h);
        Committed memory c = commit(id, alice, 1, 5 * UNIT, costOf(id, 5 * UNIT, 1));

        runRandomness(id, 1);
        bob.reveal(id, idx, 1, qty, salt);
        reveal(c);
        finalizeAfterReveal(id);

        // claim succeeds although bob reverts on receive
        uint256 bobBefore = address(bob).balance;
        house.claim(id, idx);
        uint256 payment = costOf(id, qty, 0); // undersubscribed → clears at the floor tick
        assertEq(token.balanceOf(address(bob)), qty, "tokens delivered");
        assertEq(house.pendingNative(address(bob)), deposit - payment, "refund parked");
        assertEq(address(bob).balance, bobBefore, "nothing pushed");

        // everyone else settles normally and the issuer can sweep everything
        house.claim(id, c.index);
        assertEq(house.getAuction(id).claimedBids, 2);
        vm.prank(issuer);
        house.withdrawProceeds(id);
        assertEq(token.balanceOf(address(house)), 0, "vault drained");

        // bob collects once able to receive
        vm.expectRevert(CandleAuctionHouse.TransferFailed.selector);
        bob.pull();
        bob.setAccept(true);
        bob.pull();
        assertEq(address(bob).balance, bobBefore + deposit - payment, "refund collected");
        assertEq(house.pendingNative(address(bob)), 0);
        assertEq(house.totalEscrowed(), 0, "escrow fully unwound");
        vm.expectRevert(CandleAuctionHouse.NothingPending.selector);
        bob.pull();
    }

    /// Issuer whose address rejects native currency still receives proceeds via pending.
    function test_H2_issuerRejectingReceiveGetsPending() public {
        CandleAuctionHouse.AuctionParams memory p = defaultParams();
        LaterReceiveBidder iss = new LaterReceiveBidder(house); // reused as a "contract issuer"
        token.mint(address(iss), SUPPLY);
        vm.prank(address(iss));
        token.approve(address(house), SUPPLY);
        vm.prank(address(iss));
        uint256 id = house.createAuction(p);

        address alice = newBidder("alice");
        vm.roll(p.startBlock);
        Committed memory c = commit(id, alice, 0, 10 * UNIT, costOf(id, 10 * UNIT, 0));
        runRandomness(id, 1);
        reveal(c);
        finalizeAfterReveal(id);
        house.claim(id, c.index);

        vm.prank(address(iss));
        house.withdrawProceeds(id);
        uint256 payment = costOf(id, 10 * UNIT, 0);
        assertEq(house.pendingNative(address(iss)), payment, "proceeds parked");
        iss.setAccept(true);
        iss.pull();
        assertEq(address(iss).balance, payment);
        assertEq(house.totalEscrowed(), 0);
    }
}
