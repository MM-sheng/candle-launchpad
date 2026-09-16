use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::CandleError;
use crate::state::*;

pub fn commitment_hash(auction: &Pubkey, bidder: &Pubkey, tick: u8, quantity: u64, salt: &[u8; 32]) -> [u8; 32] {
    hashv(&[auction.as_ref(), bidder.as_ref(), &[tick], &quantity.to_le_bytes(), salt]).to_bytes()
}

// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(bid_index: u32)]
pub struct CommitBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    #[account(
        init,
        payer = bidder,
        space = 8 + Bid::INIT_SPACE,
        seeds = [BID_SEED, auction.key().as_ref(), bidder.key().as_ref(), &bid_index.to_le_bytes()],
        bump,
    )]
    pub bid: Account<'info, Bid>,
    pub system_program: Program<'info, System>,
}

pub fn commit_bid(ctx: Context<CommitBid>, bid_index: u32, commitment: [u8; 32], deposit_lamports: u64) -> Result<()> {
    let clock = Clock::get()?;
    let auction = &mut ctx.accounts.auction;
    require!(auction.state == AuctionState::Committing, CandleError::InvalidState);
    require!(
        clock.slot >= auction.start_slot && clock.slot <= auction.end_slot,
        CandleError::CommitWindowClosed
    );
    // Must at least be able to afford one price unit at the floor price.
    require!(deposit_lamports >= auction.min_price, CandleError::DepositTooSmall);

    let bid = &mut ctx.accounts.bid;
    bid.auction = auction.key();
    bid.bidder = ctx.accounts.bidder.key();
    bid.bid_index = bid_index;
    bid.commitment = commitment;
    bid.deposit_lamports = deposit_lamports;
    bid.commit_slot = clock.slot;
    bid.revealed = false;
    bid.tick = 0;
    bid.quantity = 0;
    bid.bump = ctx.bumps.bid;

    auction.total_bids = auction.total_bids.checked_add(1).unwrap();

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.bidder.to_account_info(),
                to: bid.to_account_info(),
            },
        ),
        deposit_lamports,
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct RevealBid<'info> {
    pub bidder: Signer<'info>,
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    #[account(mut, has_one = auction, has_one = bidder @ CandleError::Unauthorized)]
    pub bid: Account<'info, Bid>,
}

pub fn reveal_bid(ctx: Context<RevealBid>, tick: u8, quantity: u64, salt: [u8; 32]) -> Result<()> {
    let clock = Clock::get()?;
    let auction = &mut ctx.accounts.auction;
    let bid = &mut ctx.accounts.bid;

    require!(auction.state == AuctionState::Revealing, CandleError::InvalidState);
    require!(clock.slot <= auction.reveal_end_slot, CandleError::RevealPeriodOver);
    require!(bid.commit_slot <= auction.cutoff_slot, CandleError::BidAfterCutoff);
    require!(!bid.revealed, CandleError::AlreadyRevealed);
    require!(tick < auction.num_ticks, CandleError::InvalidTick);
    require!(quantity > 0, CandleError::ZeroQuantity);

    let expected = commitment_hash(&auction.key(), &bid.bidder, tick, quantity, &salt);
    require!(expected == bid.commitment, CandleError::CommitmentMismatch);

    let price = auction.price_of_tick(tick)?;
    let cost = auction.cost(quantity, price)?;
    require!(bid.deposit_lamports >= cost, CandleError::InsufficientDeposit);

    bid.revealed = true;
    bid.tick = tick;
    bid.quantity = quantity;

    let t = tick as usize;
    auction.demand_by_tick[t] = auction.demand_by_tick[t].checked_add(quantity).ok_or(ProgramError::ArithmeticOverflow)?;
    auction.revealed_bids = auction.revealed_bids.checked_add(1).unwrap();
    Ok(())
}

// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Claim<'info> {
    /// Anyone may crank a claim; funds always go to `bidder`.
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: receives the refund and closed-account rent; matched against bid.bidder.
    #[account(mut)]
    pub bidder: UncheckedAccount<'info>,
    #[account(mut, has_one = token_vault, has_one = mint)]
    pub auction: Account<'info, Auction>,
    #[account(mut, has_one = auction, has_one = bidder, close = bidder)]
    pub bid: Account<'info, Bid>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = bidder,
    )]
    pub bidder_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub struct Settlement {
    pub tokens: u64,
    pub payment: u64,
    pub penalty: u64,
}

/// Pure settlement rule (see plan §6).
pub fn settle_bid(auction: &Auction, bid: &Bid) -> Result<Settlement> {
    let none = Settlement { tokens: 0, payment: 0, penalty: 0 };
    match auction.state {
        AuctionState::Cancelled => return Ok(none),
        AuctionState::Revealing => {
            // Only bids invalidated by the cutoff may be claimed early.
            require!(bid.commit_slot > auction.cutoff_slot, CandleError::NotClaimable);
            return Ok(none);
        }
        AuctionState::Finalized => {}
        _ => return Err(CandleError::NotClaimable.into()),
    }

    if bid.commit_slot > auction.cutoff_slot {
        return Ok(none);
    }
    if !bid.revealed {
        let penalty = ((bid.deposit_lamports as u128) * (auction.unrevealed_penalty_bps as u128) / BPS_DENOM as u128) as u64;
        return Ok(Settlement { tokens: 0, payment: 0, penalty });
    }
    if auction.total_sold == 0 || bid.tick < auction.clearing_tick {
        return Ok(none);
    }
    let filled = if bid.tick > auction.clearing_tick {
        bid.quantity
    } else {
        // Marginal tick: pro-rata, floored. Σ over bids ≤ margin_supply.
        ((bid.quantity as u128) * (auction.margin_supply as u128) / (auction.margin_demand as u128)) as u64
    };
    let price = auction.price_of_tick(auction.clearing_tick)?;
    let payment = auction.cost(filled, price)?;
    // cost(filled, clearing) ≤ cost(quantity, bid price) ≤ deposit, so this never underflows.
    require!(payment <= bid.deposit_lamports, CandleError::InsufficientDeposit);
    Ok(Settlement { tokens: filled, payment, penalty: 0 })
}

pub fn claim(ctx: Context<Claim>) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    let bid = &ctx.accounts.bid;
    let s = settle_bid(auction, bid)?;

    let to_auction = s.payment.checked_add(s.penalty).unwrap();
    if to_auction > 0 {
        bid.sub_lamports(to_auction)?;
        auction.add_lamports(to_auction)?;
    }
    auction.proceeds_claimed = auction.proceeds_claimed.checked_add(s.payment).unwrap();
    auction.penalties_claimed = auction.penalties_claimed.checked_add(s.penalty).unwrap();
    auction.claimed_bids = auction.claimed_bids.checked_add(1).unwrap();

    if s.tokens > 0 {
        let issuer_key = auction.issuer;
        let id_bytes = auction.auction_id.to_le_bytes();
        let seeds: &[&[u8]] = &[AUCTION_SEED, issuer_key.as_ref(), &id_bytes, &[auction.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.bidder_token_account.to_account_info(),
                    authority: auction.to_account_info(),
                },
                &[seeds],
            ),
            s.tokens,
        )?;
    }
    // Remaining lamports (deposit refund + rent) go to bidder via `close`.
    Ok(())
}
