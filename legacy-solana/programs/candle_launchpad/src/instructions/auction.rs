use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::CandleError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateAuctionParams {
    pub auction_id: u64,
    pub supply: u64,
    pub price_unit: u64,
    pub min_price: u64,
    pub price_tick: u64,
    pub num_ticks: u8,
    pub start_slot: u64,
    pub end_slot: u64,
    pub reveal_duration_slots: u64,
    pub min_cutoff_ratio_bps: u16,
    pub unrevealed_penalty_bps: u16,
    pub min_raise: u64,
    pub randomness_timeout_slots: u64,
}

#[derive(Accounts)]
#[instruction(params: CreateAuctionParams)]
pub struct CreateAuction<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = issuer,
        space = 8 + Auction::INIT_SPACE,
        seeds = [AUCTION_SEED, issuer.key().as_ref(), &params.auction_id.to_le_bytes()],
        bump,
    )]
    pub auction: Account<'info, Auction>,
    #[account(
        init,
        payer = issuer,
        seeds = [VAULT_SEED, auction.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = auction,
    )]
    pub token_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = issuer_token_account.mint == mint.key())]
    pub issuer_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn create_auction(ctx: Context<CreateAuction>, params: CreateAuctionParams) -> Result<()> {
    let clock = Clock::get()?;
    require!(params.supply > 0, CandleError::InvalidParams);
    require!(params.price_unit > 0, CandleError::InvalidParams);
    require!(params.min_price > 0, CandleError::InvalidParams);
    require!(params.price_tick > 0, CandleError::InvalidParams);
    require!(params.num_ticks >= 1 && (params.num_ticks as usize) <= MAX_TICKS, CandleError::InvalidParams);
    require!(params.start_slot >= clock.slot, CandleError::InvalidParams);
    require!(params.end_slot >= params.start_slot, CandleError::InvalidParams);
    require!(params.reveal_duration_slots > 0, CandleError::InvalidParams);
    require!(params.min_cutoff_ratio_bps as u64 <= BPS_DENOM, CandleError::InvalidParams);
    require!(params.unrevealed_penalty_bps as u64 <= BPS_DENOM, CandleError::InvalidParams);
    require!(params.randomness_timeout_slots > 0, CandleError::InvalidParams);
    // Highest price must not overflow.
    params
        .min_price
        .checked_add((params.num_ticks as u64 - 1).checked_mul(params.price_tick).ok_or(CandleError::InvalidParams)?)
        .ok_or(CandleError::InvalidParams)?;

    let auction = &mut ctx.accounts.auction;
    auction.issuer = ctx.accounts.issuer.key();
    auction.auction_id = params.auction_id;
    auction.mint = ctx.accounts.mint.key();
    auction.token_vault = ctx.accounts.token_vault.key();
    auction.supply = params.supply;
    auction.price_unit = params.price_unit;
    auction.min_price = params.min_price;
    auction.price_tick = params.price_tick;
    auction.num_ticks = params.num_ticks;
    auction.start_slot = params.start_slot;
    auction.end_slot = params.end_slot;
    auction.reveal_duration_slots = params.reveal_duration_slots;
    auction.min_cutoff_ratio_bps = params.min_cutoff_ratio_bps;
    auction.unrevealed_penalty_bps = params.unrevealed_penalty_bps;
    auction.min_raise = params.min_raise;
    auction.randomness_timeout_slots = params.randomness_timeout_slots;
    auction.state = AuctionState::Committing;
    auction.randomness_account = Pubkey::default();
    auction.demand_by_tick = [0; MAX_TICKS];
    auction.bump = ctx.bumps.auction;
    auction.vault_bump = ctx.bumps.token_vault;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.issuer_token_account.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.issuer.to_account_info(),
            },
        ),
        params.supply,
    )?;
    Ok(())
}

#[derive(Accounts)]
pub struct CancelAuction<'info> {
    pub issuer: Signer<'info>,
    #[account(mut, has_one = issuer @ CandleError::Unauthorized)]
    pub auction: Account<'info, Auction>,
}

/// Issuer may cancel only before the commit window opens.
pub fn cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    require!(auction.state == AuctionState::Committing, CandleError::InvalidState);
    require!(Clock::get()?.slot < auction.start_slot, CandleError::AlreadyStarted);
    auction.state = AuctionState::Cancelled;
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawProceeds<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(mut, has_one = issuer @ CandleError::Unauthorized, has_one = token_vault)]
    pub auction: Account<'info, Auction>,
    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = issuer_token_account.mint == auction.mint, constraint = issuer_token_account.owner == issuer.key())]
    pub issuer_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// Issuer collects SOL proceeds + penalties accumulated by claims so far, and
/// unsold tokens. Callable repeatedly.
///
/// Tokens: the part of supply that is certainly unsold (`supply - total_sold`)
/// is available right after finalize. Rounding dust from the marginal tick is
/// only knowable once every bid has been claimed, at which point the whole
/// remaining vault balance is released.
pub fn withdraw_proceeds(ctx: Context<WithdrawProceeds>) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    require!(
        matches!(auction.state, AuctionState::Finalized | AuctionState::Cancelled),
        CandleError::InvalidState
    );

    // ---- SOL ----
    let available = auction
        .proceeds_claimed
        .checked_add(auction.penalties_claimed)
        .unwrap()
        .checked_sub(auction.proceeds_withdrawn)
        .unwrap();

    // ---- tokens ----
    let all_claimed = auction.claimed_bids == auction.total_bids;
    let token_amount = if auction.state == AuctionState::Cancelled || all_claimed {
        ctx.accounts.token_vault.amount
    } else {
        auction
            .supply
            .checked_sub(auction.total_sold)
            .unwrap()
            .checked_sub(auction.tokens_withdrawn)
            .unwrap()
    };

    require!(available > 0 || token_amount > 0, CandleError::NothingToWithdraw);

    if available > 0 {
        auction.proceeds_withdrawn = auction.proceeds_withdrawn.checked_add(available).unwrap();
        auction.sub_lamports(available)?;
        ctx.accounts.issuer.add_lamports(available)?;
    }

    if token_amount > 0 {
        auction.tokens_withdrawn = auction.tokens_withdrawn.checked_add(token_amount).unwrap();
        let issuer_key = auction.issuer;
        let id_bytes = auction.auction_id.to_le_bytes();
        let seeds: &[&[u8]] = &[AUCTION_SEED, issuer_key.as_ref(), &id_bytes, &[auction.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.issuer_token_account.to_account_info(),
                    authority: auction.to_account_info(),
                },
                &[seeds],
            ),
            token_amount,
        )?;
    }
    Ok(())
}
