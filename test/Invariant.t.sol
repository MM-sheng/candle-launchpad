// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CandleAuctionHouse} from "../src/CandleAuctionHouse.sol";
import {MockRandomnessProvider} from "../src/randomness/MockRandomnessProvider.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// Handler: drives one auction through random actions. Any revert is fine
/// (fail_on_revert = false); we only care that the solvency invariant holds.
contract Handler is Test {
    CandleAuctionHouse public house;
    MockRandomnessProvider public rng;
    MockERC20 public token;
    address public issuer = makeAddr("issuer");
    uint256 public auctionId;
    uint256 constant UNIT = 1e18;

    struct B {
        address bidder;
        uint8 tick;
        uint256 qty;
        bytes32 salt;
    }

    B[] public bids;
    address[] public actors;

    constructor(CandleAuctionHouse h, MockRandomnessProvider r, MockERC20 t) {
        house = h;
        rng = r;
        token = t;
        for (uint256 i; i < 6; i++) {
            address a = makeAddr(string(abi.encodePacked("actor", i)));
            vm.deal(a, 1e6 ether);
            actors.push(a);
        }
        token.mint(issuer, 1e9 * UNIT);
        vm.prank(issuer);
        token.approve(address(house), type(uint256).max);
        vm.prank(issuer);
        auctionId = house.createAuction(
            CandleAuctionHouse.AuctionParams({
                token: token,
                supply: 1000 * UNIT,
                priceUnit: UNIT,
                minPrice: 0.001 ether,
                priceTick: 0.0005 ether,
                numTicks: 8,
                startBlock: uint64(block.number + 1),
                endBlock: uint64(block.number + 50),
                revealDurationBlocks: 30,
                minCutoffRatioBps: 3000,
                unrevealedPenaltyBps: 1000,
                minRaise: 0,
                randomnessTimeoutBlocks: 40
            })
        );
    }

    function roll(uint8 n) external {
        vm.roll(block.number + bound(n, 1, 20));
    }

    function commit(uint256 actorSeed, uint8 tick, uint256 qty, uint256 extra) external {
        address a = actors[actorSeed % actors.length];
        tick = uint8(bound(tick, 0, 7));
        qty = bound(qty, 1, 600 * UNIT);
        extra = bound(extra, 0, 2 ether);
        bytes32 salt = keccak256(abi.encode(actorSeed, tick, qty, bids.length));
        bytes32 h = house.commitmentHash(auctionId, a, tick, qty, salt);
        uint256 deposit = house.cost(auctionId, qty, house.priceOfTick(auctionId, tick)) + extra;
        vm.prank(a);
        house.commitBid{value: deposit}(auctionId, h);
        bids.push(B(a, tick, qty, salt));
    }

    function requestAndFulfil(uint256 word) external {
        house.requestRandomness(auctionId);
        rng.fulfill(house.getAuction(auctionId).randomnessRequestId, word);
    }

    function fallbackSettle() external {
        house.settleFallback(auctionId);
    }

    function reveal(uint256 i) external {
        if (bids.length == 0) return;
        i = i % bids.length;
        vm.prank(bids[i].bidder);
        house.revealBid(auctionId, i, bids[i].tick, bids[i].qty, bids[i].salt);
    }

    function finalize() external {
        house.finalize(auctionId);
    }

    function claim(uint256 i) external {
        if (bids.length == 0) return;
        house.claim(auctionId, i % bids.length);
    }

    function withdraw() external {
        vm.prank(issuer);
        house.withdrawProceeds(auctionId);
    }

    function bidCount() external view returns (uint256) {
        return bids.length;
    }
}

/// 16. Contract native balance ≥ Σ unclaimed refunds + issuer's unwithdrawn proceeds.
contract InvariantTest is Test {
    CandleAuctionHouse house;
    MockRandomnessProvider rng;
    MockERC20 token;
    Handler handler;

    function setUp() public {
        vm.roll(100);
        rng = new MockRandomnessProvider();
        house = new CandleAuctionHouse(rng);
        rng.setAuctionHouse(address(house));
        token = new MockERC20("Launch", "LCH", 18);
        handler = new Handler(house, rng, token);
        targetContract(address(handler));
    }

    function invariant_solvent() public view {
        uint256 id = handler.auctionId();
        CandleAuctionHouse.Auction memory a = house.getAuction(id);
        uint256 owed = a.proceedsClaimed + a.penaltiesClaimed - a.proceedsWithdrawn;
        uint256 n = house.bidCount(id);
        for (uint256 i; i < n; i++) {
            CandleAuctionHouse.Bid memory b = house.getBid(id, i);
            if (!b.claimed) owed += b.deposit; // upper bound: full deposit may be refunded
        }
        assertGe(address(house).balance, owed, "house is insolvent");
        assertEq(address(house).balance, house.totalEscrowed(), "escrow accounting matches balance");
    }

    function invariant_tokensNeverExceedSupply() public view {
        uint256 id = handler.auctionId();
        CandleAuctionHouse.Auction memory a = house.getAuction(id);
        uint256 out = a.tokensWithdrawn;
        for (uint256 i; i < 6; i++) {
            out += token.balanceOf(handler.actors(i));
        }
        // all actor balances originate from this auction; issuer withdrawals tracked via tokensWithdrawn
        assertLe(out, a.p.supply);
        assertEq(token.balanceOf(address(house)) + out, a.p.supply);
    }
}
