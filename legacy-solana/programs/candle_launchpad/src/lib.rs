#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("DsKyZALPRQX7s4RZLATvm4u37KpSpe6KpTP4P7CjPUNG");

#[program]
pub mod candle_launchpad {
    use super::*;

    pub fn create_auction(ctx: Context<CreateAuction>, params: CreateAuctionParams) -> Result<()> {
        instructions::create_auction(ctx, params)
    }

    pub fn cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
        instructions::cancel_auction(ctx)
    }

    pub fn commit_bid(ctx: Context<CommitBid>, bid_index: u32, commitment: [u8; 32], deposit_lamports: u64) -> Result<()> {
        instructions::commit_bid(ctx, bid_index, commitment, deposit_lamports)
    }

    pub fn mock_create_randomness(ctx: Context<MockCreateRandomness>) -> Result<()> {
        instructions::mock_create_randomness(ctx)
    }

    pub fn mock_reveal_randomness(ctx: Context<MockRevealRandomness>, value: [u8; 32]) -> Result<()> {
        instructions::mock_reveal_randomness(ctx, value)
    }

    pub fn request_randomness(ctx: Context<RequestRandomness>) -> Result<()> {
        instructions::request_randomness(ctx)
    }

    pub fn settle_randomness(ctx: Context<SettleRandomness>) -> Result<()> {
        instructions::settle_randomness(ctx)
    }

    pub fn settle_fallback(ctx: Context<SettleFallback>) -> Result<()> {
        instructions::settle_fallback(ctx)
    }

    pub fn reveal_bid(ctx: Context<RevealBid>, tick: u8, quantity: u64, salt: [u8; 32]) -> Result<()> {
        instructions::reveal_bid(ctx, tick, quantity, salt)
    }

    pub fn finalize(ctx: Context<Finalize>) -> Result<()> {
        instructions::finalize(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim(ctx)
    }

    pub fn withdraw_proceeds(ctx: Context<WithdrawProceeds>) -> Result<()> {
        instructions::withdraw_proceeds(ctx)
    }
}
