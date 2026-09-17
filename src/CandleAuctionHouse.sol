// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IRandomnessProvider, ICandleAuction} from "./interfaces/IRandomnessProvider.sol";

/// @title CandleAuctionHouse
/// @notice Multi-auction token launchpad: commit-reveal bids, a random cutoff block
///         chosen after the commit window closes, and a uniform clearing price.
///         Quote asset is the native currency.
contract CandleAuctionHouse is ICandleAuction, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant MAX_TICKS = 64;
    uint256 public constant BPS = 10_000;

    enum State {
        Committing, // before/during the commit window
        AwaitingRandomness, // window closed, randomness requested
        Revealing, // cutoff known
        Finalized,
        Cancelled
    }

    /// @dev Field order is chosen for storage packing (2 slots of small fields).
    struct AuctionParams {
        IERC20 token; // slot 0 ─┐
        uint8 numTicks; // 1..64 │ 29 bytes
        uint64 startBlock; //    ─┘
        uint64 endBlock; // slot 1 ─┐
        uint64 revealDurationBlocks; //│
        uint64 randomnessTimeoutBlocks; // after endBlock, settleFallback becomes available
        uint16 minCutoffRatioBps; //   │ 28 bytes
        uint16 unrevealedPenaltyBps; //┘
        uint256 supply; // token base units for sale
        uint256 priceUnit; // `priceUnit` base units cost `price(tick)` wei (usually 10**decimals)
        uint256 minPrice; // wei per priceUnit at tick 0
        uint256 priceTick; // wei step between ticks
        uint256 minRaise; // wei; 0 disables
    }

    struct Auction {
        AuctionParams p;
        address issuer; // slot ─┐
        State state; //          │
        uint64 cutoffBlock; //   │ 31 bytes
        uint8 clearingTick; //  ─┘
        uint64 revealEndBlock; // slot ─┐
        uint32 revealedBids; //         │ 20 bytes
        uint32 claimedBids; //         ─┘
        uint256 randomnessRequestId;
        // clearing
        uint256 marginSupply; // supply left for the marginal tick
        uint256 marginDemand; // total demand at the marginal tick
        uint256 totalSold; // theoretical (pre-rounding)
        // accounting (accumulated by claim / withdrawn by issuer)
        uint256 proceedsClaimed;
        uint256 penaltiesClaimed;
        uint256 proceedsWithdrawn;
        uint256 tokensWithdrawn;
    }

    struct Bid {
        address bidder; // slot ─┐
        uint64 commitBlock; //   │
        bool revealed; //        │ 31 bytes
        bool claimed; //         │
        uint8 tick; //          ─┘
        bytes32 commitment;
        uint256 deposit;
        uint256 quantity;
    }

    IRandomnessProvider public immutable randomnessProvider;

    uint256 public auctionCount;
    mapping(uint256 => Auction) internal _auctions;
    mapping(uint256 => uint256[64]) internal _demandByTick;
    mapping(uint256 => Bid[]) internal _bids;
    /// @dev Tokens actually transferred to bidders per auction (Σ floor-rounded fills).
    mapping(uint256 => uint256) internal _tokensPaid;

    /// @dev Native currency owed to bidders (deposits) and issuers (proceeds) but not yet paid out.
    uint256 public totalEscrowed;

    /// @notice Native currency that could not be pushed to `account` (receiver reverted).
    ///         Withdraw with `withdrawPending()`.
    mapping(address => uint256) public pendingNative;

    /// @dev Tokens that could not be delivered on claim (token reverted / blocklisted / lied about
    ///      balance). The bid's payment stays escrowed until delivery succeeds via `claimTokens`,
    ///      or is refunded to the bidder via `refundUndelivered` after UNDELIVERED_REFUND_DELAY.
    struct Undelivered {
        uint256 tokens;
        uint256 payment;
        uint64 since; // timestamp of the failed delivery
    }
    mapping(uint256 => mapping(uint256 => Undelivered)) internal _undelivered;
    mapping(uint256 => uint32) internal _undeliveredCount;
    uint256 public constant UNDELIVERED_REFUND_DELAY = 30 days;

    // ---------------------------------------------------------------- events
    event AuctionCreated(uint256 indexed auctionId, address indexed issuer, address indexed token, AuctionParams params);
    event AuctionCancelled(uint256 indexed auctionId);
    event BidCommitted(uint256 indexed auctionId, uint256 indexed bidIndex, address indexed bidder, uint256 deposit, uint64 commitBlock);
    event RandomnessRequested(uint256 indexed auctionId, uint256 requestId);
    event CutoffSet(uint256 indexed auctionId, uint64 cutoffBlock, uint64 revealEndBlock, bool fallbackUsed);
    event BidRevealed(uint256 indexed auctionId, uint256 indexed bidIndex, uint8 tick, uint256 quantity);
    event AuctionFinalized(uint256 indexed auctionId, State state, uint8 clearingTick, uint256 clearingPrice, uint256 totalSold);
    event Claimed(uint256 indexed auctionId, uint256 indexed bidIndex, address indexed bidder, uint256 tokens, uint256 refund, uint256 payment, uint256 penalty);
    event ProceedsWithdrawn(uint256 indexed auctionId, uint256 nativeAmount, uint256 tokenAmount);
    event NativePaymentDeferred(address indexed account, uint256 amount);
    event PendingWithdrawn(address indexed account, uint256 amount);
    event TokenDeliveryDeferred(uint256 indexed auctionId, uint256 indexed bidIndex, uint256 tokens, uint256 payment);
    event TokensDelivered(uint256 indexed auctionId, uint256 indexed bidIndex, uint256 tokens, uint256 payment);
    event UndeliveredRefunded(uint256 indexed auctionId, uint256 indexed bidIndex, uint256 payment);

    // ---------------------------------------------------------------- errors
    error InvalidParams();
    error InvalidState();
    error CommitWindowClosed();
    error CommitWindowNotEnded();
    error DepositTooSmall();
    error NotProvider();
    error RandomnessAlreadySet();
    error RandomnessTimeoutNotElapsed();
    error BidAfterCutoff();
    error RevealPeriodOver();
    error RevealPeriodNotEnded();
    error AlreadyRevealed();
    error CommitmentMismatch();
    error InvalidTick();
    error ZeroQuantity();
    error InsufficientDeposit();
    error NotClaimable();
    error AlreadyClaimed();
    error Unauthorized();
    error AlreadyStarted();
    error NothingToWithdraw();
    error TransferFailed();
    error SupplyMismatch();
    error NothingPending();
    error DeliveryFailed();
    error RefundDelayNotElapsed();

    constructor(IRandomnessProvider provider) {
        randomnessProvider = provider;
    }

    // ---------------------------------------------------------------- views
    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return _auctions[auctionId];
    }

    function getDemand(uint256 auctionId) external view returns (uint256[64] memory) {
        return _demandByTick[auctionId];
    }

    function getBid(uint256 auctionId, uint256 bidIndex) external view returns (Bid memory) {
        return _bids[auctionId][bidIndex];
    }

    function bidCount(uint256 auctionId) external view returns (uint256) {
        return _bids[auctionId].length;
    }

    function priceOfTick(uint256 auctionId, uint8 tick) public view returns (uint256) {
        AuctionParams storage p = _auctions[auctionId].p;
        return p.minPrice + uint256(tick) * p.priceTick;
    }

    /// @notice Wei owed for `quantity` base units at `price` wei per `priceUnit`. Rounds up.
    function cost(uint256 auctionId, uint256 quantity, uint256 price) public view returns (uint256) {
        uint256 unit = _auctions[auctionId].p.priceUnit;
        return (quantity * price + unit - 1) / unit;
    }

    function commitmentHash(uint256 auctionId, address bidder, uint8 tick, uint256 quantity, bytes32 salt)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), auctionId, bidder, tick, quantity, salt));
    }

    /// @notice Preview what `claim` would pay out for a bid in the current state.
    function previewClaim(uint256 auctionId, uint256 bidIndex)
        external
        view
        returns (uint256 tokens, uint256 payment, uint256 penalty)
    {
        return _settle(_auctions[auctionId], _bids[auctionId][bidIndex]);
    }

    // ---------------------------------------------------------------- issuer
    function createAuction(AuctionParams calldata p) external nonReentrant returns (uint256 auctionId) {
        if (p.supply == 0 || p.priceUnit == 0 || p.minPrice == 0 || p.priceTick == 0) revert InvalidParams();
        if (p.numTicks == 0 || p.numTicks > MAX_TICKS) revert InvalidParams();
        if (p.startBlock < block.number || p.endBlock < p.startBlock) revert InvalidParams();
        if (p.revealDurationBlocks == 0 || p.randomnessTimeoutBlocks == 0) revert InvalidParams();
        if (p.minCutoffRatioBps > BPS || p.unrevealedPenaltyBps > BPS) revert InvalidParams();
        // top price must not overflow later math
        p.minPrice + uint256(p.numTicks - 1) * p.priceTick;

        auctionId = auctionCount++;
        Auction storage a = _auctions[auctionId];
        a.p = p;
        a.issuer = msg.sender;
        a.state = State.Committing;

        // Fee-on-transfer tokens are rejected: received amount must equal supply.
        uint256 before = p.token.balanceOf(address(this));
        p.token.safeTransferFrom(msg.sender, address(this), p.supply);
        if (p.token.balanceOf(address(this)) - before != p.supply) revert SupplyMismatch();

        emit AuctionCreated(auctionId, msg.sender, address(p.token), p);
    }

    /// @notice Issuer may cancel only before the commit window opens.
    function cancelAuction(uint256 auctionId) external nonReentrant {
        Auction storage a = _auctions[auctionId];
        if (msg.sender != a.issuer) revert Unauthorized();
        if (a.state != State.Committing) revert InvalidState();
        if (block.number >= a.p.startBlock) revert AlreadyStarted();
        a.state = State.Cancelled;
        emit AuctionCancelled(auctionId);
    }

    /// @notice Issuer collects native proceeds + penalties accumulated by claims so far,
    ///         and unsold tokens. Repeatable. The certainly-unsold part of supply is available
    ///         right after finalize; marginal-tick rounding dust is released once every bid
    ///         has been claimed.
    function withdrawProceeds(uint256 auctionId) external nonReentrant {
        Auction storage a = _auctions[auctionId];
        if (msg.sender != a.issuer) revert Unauthorized();
        if (a.state != State.Finalized && a.state != State.Cancelled) revert InvalidState();

        uint256 nativeAmount = a.proceedsClaimed + a.penaltiesClaimed - a.proceedsWithdrawn;

        uint256 tokenAmount;
        if (a.state == State.Cancelled) {
            tokenAmount = a.p.supply - a.tokensWithdrawn; // bidders never receive tokens
        } else if (a.claimedBids == _bids[auctionId].length && _undeliveredCount[auctionId] == 0) {
            tokenAmount = a.p.supply - _tokensPaid[auctionId] - a.tokensWithdrawn; // incl. rounding dust
        } else {
            tokenAmount = a.p.supply - a.totalSold - a.tokensWithdrawn; // certainly unsold
        }

        if (nativeAmount == 0 && tokenAmount == 0) revert NothingToWithdraw();

        a.proceedsWithdrawn += nativeAmount;
        a.tokensWithdrawn += tokenAmount;
        totalEscrowed -= nativeAmount;

        if (tokenAmount > 0) a.p.token.safeTransfer(msg.sender, tokenAmount);
        if (nativeAmount > 0) _payNative(msg.sender, nativeAmount);
        emit ProceedsWithdrawn(auctionId, nativeAmount, tokenAmount);
    }

    // ---------------------------------------------------------------- bidders
    function commitBid(uint256 auctionId, bytes32 commitment) external payable nonReentrant returns (uint256 bidIndex) {
        Auction storage a = _auctions[auctionId];
        if (a.state != State.Committing) revert InvalidState();
        if (block.number < a.p.startBlock || block.number > a.p.endBlock) revert CommitWindowClosed();
        if (msg.value < a.p.minPrice) revert DepositTooSmall();

        bidIndex = _bids[auctionId].length;
        _bids[auctionId].push(
            Bid({
                bidder: msg.sender,
                commitment: commitment,
                deposit: msg.value,
                commitBlock: uint64(block.number),
                revealed: false,
                claimed: false,
                tick: 0,
                quantity: 0
            })
        );
        totalEscrowed += msg.value;
        emit BidCommitted(auctionId, bidIndex, msg.sender, msg.value, uint64(block.number));
    }

    function revealBid(uint256 auctionId, uint256 bidIndex, uint8 tick, uint256 quantity, bytes32 salt) external nonReentrant {
        Auction storage a = _auctions[auctionId];
        Bid storage b = _bids[auctionId][bidIndex];
        if (b.bidder != msg.sender) revert Unauthorized();
        if (a.state != State.Revealing) revert InvalidState();
        if (block.number > a.revealEndBlock) revert RevealPeriodOver();
        if (b.commitBlock > a.cutoffBlock) revert BidAfterCutoff();
        if (b.revealed) revert AlreadyRevealed();
        if (tick >= a.p.numTicks) revert InvalidTick();
        if (quantity == 0) revert ZeroQuantity();
        if (commitmentHash(auctionId, msg.sender, tick, quantity, salt) != b.commitment) revert CommitmentMismatch();
        if (b.deposit < cost(auctionId, quantity, priceOfTick(auctionId, tick))) revert InsufficientDeposit();

        b.revealed = true;
        b.tick = tick;
        b.quantity = quantity;
        _demandByTick[auctionId][tick] += quantity;
        a.revealedBids += 1;
        emit BidRevealed(auctionId, bidIndex, tick, quantity);
    }

    /// @notice Permissionless: anyone may crank a claim; funds always go to the bidder.
    function claim(uint256 auctionId, uint256 bidIndex) external nonReentrant {
        Auction storage a = _auctions[auctionId];
        Bid storage b = _bids[auctionId][bidIndex];
        if (b.claimed) revert AlreadyClaimed();
        (uint256 tokens, uint256 payment, uint256 penalty) = _settle(a, b);

        // effects
        b.claimed = true;
        a.claimedBids += 1;
        a.penaltiesClaimed += penalty;
        uint256 refund = b.deposit - payment - penalty;
        totalEscrowed -= refund; // payment + penalty stay escrowed for the issuer

        // interactions — token first; if it cannot be delivered the payment is parked, not credited
        if (tokens > 0) {
            if (_tryTransferToken(a.p.token, b.bidder, tokens)) {
                a.proceedsClaimed += payment;
                _tokensPaid[auctionId] += tokens;
            } else {
                _undelivered[auctionId][bidIndex] = Undelivered(tokens, payment, uint64(block.timestamp));
                _undeliveredCount[auctionId] += 1;
                emit TokenDeliveryDeferred(auctionId, bidIndex, tokens, payment);
            }
        }
        if (refund > 0) _payNative(b.bidder, refund);
        emit Claimed(auctionId, bidIndex, b.bidder, tokens, refund, payment, penalty);
    }

    /// @notice Retry delivering tokens for a claim whose token transfer failed. Anyone may call.
    function claimTokens(uint256 auctionId, uint256 bidIndex) external nonReentrant {
        Undelivered memory u = _undelivered[auctionId][bidIndex];
        if (u.tokens == 0) revert NothingPending();
        Auction storage a = _auctions[auctionId];
        address bidder = _bids[auctionId][bidIndex].bidder;
        if (!_tryTransferToken(a.p.token, bidder, u.tokens)) revert DeliveryFailed();
        delete _undelivered[auctionId][bidIndex];
        _undeliveredCount[auctionId] -= 1;
        a.proceedsClaimed += u.payment;
        _tokensPaid[auctionId] += u.tokens;
        emit TokensDelivered(auctionId, bidIndex, u.tokens, u.payment);
    }

    /// @notice If tokens still cannot be delivered UNDELIVERED_REFUND_DELAY after the failed claim,
    ///         the bidder takes their payment back; the tokens count as unsold. Anyone may call.
    function refundUndelivered(uint256 auctionId, uint256 bidIndex) external nonReentrant {
        Undelivered memory u = _undelivered[auctionId][bidIndex];
        if (u.tokens == 0) revert NothingPending();
        if (block.timestamp < uint256(u.since) + UNDELIVERED_REFUND_DELAY) revert RefundDelayNotElapsed();
        Auction storage a = _auctions[auctionId];
        address bidder = _bids[auctionId][bidIndex].bidder;
        // one last delivery attempt keeps the issuer whole if the token recovered
        if (_tryTransferToken(a.p.token, bidder, u.tokens)) {
            delete _undelivered[auctionId][bidIndex];
            _undeliveredCount[auctionId] -= 1;
            a.proceedsClaimed += u.payment;
            _tokensPaid[auctionId] += u.tokens;
            emit TokensDelivered(auctionId, bidIndex, u.tokens, u.payment);
            return;
        }
        delete _undelivered[auctionId][bidIndex];
        _undeliveredCount[auctionId] -= 1;
        totalEscrowed -= u.payment;
        _payNative(bidder, u.payment);
        emit UndeliveredRefunded(auctionId, bidIndex, u.payment);
    }

    /// @notice Collect native currency that a previous push transfer could not deliver.
    function withdrawPending() external nonReentrant {
        uint256 amount = pendingNative[msg.sender];
        if (amount == 0) revert NothingPending();
        pendingNative[msg.sender] = 0;
        totalEscrowed -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit PendingWithdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------- randomness / lifecycle
    /// @notice Anyone may call once the commit window is over. Binds exactly one request.
    function requestRandomness(uint256 auctionId) external nonReentrant {
        Auction storage a = _auctions[auctionId];
        if (a.state != State.Committing) revert InvalidState();
        if (block.number <= a.p.endBlock) revert CommitWindowNotEnded();
        a.state = State.AwaitingRandomness;
        uint256 requestId = randomnessProvider.requestRandomness(auctionId);
        a.randomnessRequestId = requestId;
        emit RandomnessRequested(auctionId, requestId);
    }

    /// @inheritdoc ICandleAuction
    function onRandomness(uint256 auctionId, uint256 randomWord) external nonReentrant {
        if (msg.sender != address(randomnessProvider)) revert NotProvider();
        Auction storage a = _auctions[auctionId];
        if (a.state != State.AwaitingRandomness) revert RandomnessAlreadySet();
        _enterRevealing(auctionId, a, _computeCutoff(a.p, randomWord), false);
    }

    /// @notice If randomness never arrives within `randomnessTimeoutBlocks` after `endBlock`,
    ///         degrade to a plain sealed-bid auction with cutoff = endBlock. Anyone may call.
    function settleFallback(uint256 auctionId) external nonReentrant {
        Auction storage a = _auctions[auctionId];
        if (a.state != State.Committing && a.state != State.AwaitingRandomness) revert InvalidState();
        if (block.number <= uint256(a.p.endBlock) + a.p.randomnessTimeoutBlocks) revert RandomnessTimeoutNotElapsed();
        _enterRevealing(auctionId, a, a.p.endBlock, true);
    }

    function finalize(uint256 auctionId) external nonReentrant {
        Auction storage a = _auctions[auctionId];
        if (a.state != State.Revealing) revert InvalidState();
        if (block.number <= a.revealEndBlock) revert RevealPeriodNotEnded();

        (uint8 clearingTick, uint256 marginSupply, uint256 marginDemand, uint256 totalSold) =
            _computeClearingStorage(_demandByTick[auctionId], a.p.numTicks, a.p.supply);
        a.clearingTick = clearingTick;
        a.marginSupply = marginSupply;
        a.marginDemand = marginDemand;
        a.totalSold = totalSold;

        uint256 clearingPrice = priceOfTick(auctionId, clearingTick);
        uint256 raised = cost(auctionId, totalSold, clearingPrice);
        a.state = (totalSold == 0 || raised < a.p.minRaise) ? State.Cancelled : State.Finalized;
        emit AuctionFinalized(auctionId, a.state, clearingTick, clearingPrice, totalSold);
    }

    // ---------------------------------------------------------------- pure logic
    /// @notice Uniform-price clearing over the tick histogram (plan §5).
    function computeClearing(uint256[64] memory demand, uint8 numTicks, uint256 supply)
        public
        pure
        returns (uint8 clearingTick, uint256 marginSupply, uint256 marginDemand, uint256 totalSold)
    {
        uint256 cumulative = 0;
        for (uint256 i = numTicks; i > 0; i--) {
            uint256 t = i - 1;
            uint256 d = demand[t];
            cumulative += d;
            if (cumulative >= supply) {
                uint256 above = cumulative - d;
                return (uint8(t), supply - above, d, supply);
            }
        }
        // Undersubscribed: everyone fills in full at the floor price.
        return (0, demand[0], demand[0], cumulative);
    }

    /// @dev Same algorithm as `computeClearing`, but walks storage from the top tick
    ///      and stops at the clearing tick, so only the ticks that matter are loaded.
    function _computeClearingStorage(uint256[64] storage demand, uint8 numTicks, uint256 supply)
        internal
        view
        returns (uint8 clearingTick, uint256 marginSupply, uint256 marginDemand, uint256 totalSold)
    {
        uint256 cumulative = 0;
        for (uint256 i = numTicks; i > 0; i--) {
            uint256 t = i - 1;
            uint256 d = demand[t];
            cumulative += d;
            if (cumulative >= supply) {
                uint256 above = cumulative - d;
                return (uint8(t), supply - above, d, supply);
            }
        }
        uint256 d0 = demand[0];
        return (0, d0, d0, cumulative);
    }

    function _computeCutoff(AuctionParams storage p, uint256 randomWord) internal view returns (uint64) {
        uint256 len = p.endBlock - p.startBlock;
        uint256 lower = p.startBlock + (len * p.minCutoffRatioBps + BPS - 1) / BPS;
        uint256 span = p.endBlock - lower + 1;
        return uint64(lower + (randomWord % span));
    }

    function _enterRevealing(uint256 auctionId, Auction storage a, uint64 cutoff, bool fallbackUsed) internal {
        a.cutoffBlock = cutoff;
        a.revealEndBlock = uint64(block.number) + a.p.revealDurationBlocks;
        a.state = State.Revealing;
        emit CutoffSet(auctionId, cutoff, a.revealEndBlock, fallbackUsed);
    }

    /// @dev Settlement rule (plan §6). Reverts if the bid is not claimable yet.
    function _settle(Auction storage a, Bid storage b)
        internal
        view
        returns (uint256 tokens, uint256 payment, uint256 penalty)
    {
        if (a.state == State.Cancelled) return (0, 0, 0);
        if (a.state == State.Revealing) {
            // only bids invalidated by the cutoff may be claimed early
            if (b.commitBlock <= a.cutoffBlock) revert NotClaimable();
            return (0, 0, 0);
        }
        if (a.state != State.Finalized) revert NotClaimable();

        if (b.commitBlock > a.cutoffBlock) return (0, 0, 0);
        if (!b.revealed) return (0, 0, b.deposit * a.p.unrevealedPenaltyBps / BPS);
        if (a.totalSold == 0 || b.tick < a.clearingTick) return (0, 0, 0);

        uint256 filled = b.tick > a.clearingTick
            ? b.quantity
            : Math.mulDiv(b.quantity, a.marginSupply, a.marginDemand); // floor; Σ ≤ marginSupply
        uint256 price = a.p.minPrice + uint256(a.clearingTick) * a.p.priceTick;
        payment = (filled * price + a.p.priceUnit - 1) / a.p.priceUnit;
        // cost(filled, clearing) ≤ cost(quantity, bid price) ≤ deposit
        return (filled, payment, 0);
    }

    /// @dev Push native currency; if the receiver reverts, park it in `pendingNative`
    ///      (still counted in totalEscrowed) so one hostile receiver cannot block settlement.
    function _payNative(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) {
            pendingNative[to] += amount;
            totalEscrowed += amount;
            emit NativePaymentDeferred(to, amount);
        }
    }

    /// @dev Non-reverting ERC-20 transfer with SafeERC20 semantics (missing return value tolerated).
    function _tryTransferToken(IERC20 token, address to, uint256 amount) internal returns (bool) {
        if (address(token).code.length == 0) return false;
        (bool ok, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }
}
