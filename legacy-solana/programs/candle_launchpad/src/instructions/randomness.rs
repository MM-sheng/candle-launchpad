use anchor_lang::prelude::*;

use crate::errors::CandleError;
use crate::state::*;

// ---------------------------------------------------------------------------
// Mock randomness (used unless the `switchboard` feature is enabled).
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct MockCreateRandomness<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub auction: Account<'info, Auction>,
    #[account(
        init,
        payer = payer,
        space = 8 + MockRandomness::INIT_SPACE,
        seeds = [MOCK_RANDOMNESS_SEED, auction.key().as_ref()],
        bump,
    )]
    pub randomness: Account<'info, MockRandomness>,
    pub system_program: Program<'info, System>,
}

pub fn mock_create_randomness(ctx: Context<MockCreateRandomness>) -> Result<()> {
    let r = &mut ctx.accounts.randomness;
    r.auction = ctx.accounts.auction.key();
    r.seed_slot = Clock::get()?.slot;
    r.revealed = false;
    r.value = [0; 32];
    r.bump = ctx.bumps.randomness;
    Ok(())
}

#[derive(Accounts)]
pub struct MockRevealRandomness<'info> {
    pub issuer: Signer<'info>,
    #[account(has_one = issuer @ CandleError::Unauthorized)]
    pub auction: Account<'info, Auction>,
    #[account(mut, has_one = auction @ CandleError::RandomnessMismatch)]
    pub randomness: Account<'info, MockRandomness>,
}

pub fn mock_reveal_randomness(ctx: Context<MockRevealRandomness>, value: [u8; 32]) -> Result<()> {
    let r = &mut ctx.accounts.randomness;
    require!(!r.revealed, CandleError::InvalidState);
    r.revealed = true;
    r.value = value;
    Ok(())
}

/// Reads (seed_slot, revealed_value) from the bound randomness account.
#[cfg(not(feature = "switchboard"))]
fn read_randomness(auction: &Pubkey, info: &AccountInfo) -> Result<(u64, Option<[u8; 32]>)> {
    require_keys_eq!(*info.owner, crate::ID, CandleError::RandomnessMismatch);
    let data = info.try_borrow_data()?;
    let r = MockRandomness::try_deserialize(&mut &data[..])?;
    require_keys_eq!(r.auction, *auction, CandleError::RandomnessMismatch);
    Ok((r.seed_slot, if r.revealed { Some(r.value) } else { None }))
}

#[cfg(feature = "switchboard")]
fn read_randomness(_auction: &Pubkey, _info: &AccountInfo) -> Result<(u64, Option<[u8; 32]>)> {
    // M4: parse switchboard_on_demand::RandomnessAccountData and return
    // (seed_slot, get_value(&clock).ok()).
    unimplemented!("switchboard integration lands in M4")
}

// ---------------------------------------------------------------------------
// Auction-facing instructions (same interface regardless of the source).
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct RequestRandomness<'info> {
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    /// CHECK: validated by `read_randomness` (owner/type depends on feature).
    pub randomness: UncheckedAccount<'info>,
}

/// Bind a randomness account to the auction. Callable by anyone once the commit
/// window is over, exactly once. The randomness must have been seeded *after*
/// `end_slot`, so no one could have known it while bidding.
pub fn request_randomness(ctx: Context<RequestRandomness>) -> Result<()> {
    let clock = Clock::get()?;
    let auction = &mut ctx.accounts.auction;
    require!(auction.state == AuctionState::Committing, CandleError::InvalidState);
    require!(clock.slot > auction.end_slot, CandleError::CommitWindowNotEnded);

    let (seed_slot, _) = read_randomness(&auction.key(), &ctx.accounts.randomness)?;
    require!(seed_slot > auction.end_slot, CandleError::RandomnessSeededTooEarly);

    auction.randomness_account = ctx.accounts.randomness.key();
    auction.randomness_requested_slot = clock.slot;
    auction.state = AuctionState::AwaitingRandomness;
    Ok(())
}

#[derive(Accounts)]
pub struct SettleRandomness<'info> {
    #[account(mut, has_one = randomness_account @ CandleError::RandomnessMismatch)]
    pub auction: Account<'info, Auction>,
    /// CHECK: must equal auction.randomness_account (checked by has_one).
    pub randomness_account: UncheckedAccount<'info>,
}

pub fn settle_randomness(ctx: Context<SettleRandomness>) -> Result<()> {
    let clock = Clock::get()?;
    let auction = &mut ctx.accounts.auction;
    require!(auction.state == AuctionState::AwaitingRandomness, CandleError::InvalidState);

    let (_, value) = read_randomness(&auction.key(), &ctx.accounts.randomness_account)?;
    let value = value.ok_or(CandleError::RandomnessNotRevealed)?;
    let random = u64::from_le_bytes(value[..8].try_into().unwrap());

    let cutoff = auction.compute_cutoff(random);
    enter_revealing(auction, cutoff, clock.slot);
    Ok(())
}

#[derive(Accounts)]
pub struct SettleFallback<'info> {
    #[account(mut)]
    pub auction: Account<'info, Auction>,
}

/// If randomness was never bound or never revealed within
/// `randomness_timeout_slots` after `end_slot`, degrade to a plain sealed-bid
/// auction: cutoff = end_slot. Anyone may call.
pub fn settle_fallback(ctx: Context<SettleFallback>) -> Result<()> {
    let clock = Clock::get()?;
    let auction = &mut ctx.accounts.auction;
    require!(
        matches!(auction.state, AuctionState::Committing | AuctionState::AwaitingRandomness),
        CandleError::InvalidState
    );
    let deadline = auction.end_slot.checked_add(auction.randomness_timeout_slots).unwrap();
    require!(clock.slot > deadline, CandleError::RandomnessTimeoutNotElapsed);

    let cutoff = auction.end_slot;
    enter_revealing(auction, cutoff, clock.slot);
    Ok(())
}

fn enter_revealing(auction: &mut Auction, cutoff_slot: u64, now: u64) {
    auction.cutoff_slot = cutoff_slot;
    auction.reveal_end_slot = now.checked_add(auction.reveal_duration_slots).unwrap();
    auction.state = AuctionState::Revealing;
}
