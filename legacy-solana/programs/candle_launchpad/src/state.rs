use anchor_lang::prelude::*;

pub const MAX_TICKS: usize = 64;
pub const BPS_DENOM: u64 = 10_000;

pub const AUCTION_SEED: &[u8] = b"auction";
pub const BID_SEED: &[u8] = b"bid";
pub const VAULT_SEED: &[u8] = b"vault";
pub const MOCK_RANDOMNESS_SEED: &[u8] = b"mock_rand";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum AuctionState {
    /// Before and during the commit window. Bids accepted in `[start_slot, end_slot]`.
    Committing,
    /// Commit window closed; a randomness account has been bound, waiting for reveal.
    AwaitingRandomness,
    /// Cutoff slot known; valid bids may be revealed until `reveal_end_slot`.
    Revealing,
    /// Clearing price computed; claims and issuer withdrawals allowed.
    Finalized,
    /// Auction cancelled (before start, or min_raise not met). Everyone gets a full refund.
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub issuer: Pubkey,
    pub auction_id: u64,
    pub mint: Pubkey,
    pub token_vault: Pubkey,
    /// Base units of `mint` offered for sale.
    pub supply: u64,
    /// `price_unit` base units of the token are priced at `price(tick)` lamports.
    /// Typically 10^decimals so that prices are "lamports per whole token".
    pub price_unit: u64,
    pub min_price: u64,
    pub price_tick: u64,
    pub num_ticks: u8,
    pub start_slot: u64,
    pub end_slot: u64,
    pub reveal_duration_slots: u64,
    pub min_cutoff_ratio_bps: u16,
    pub unrevealed_penalty_bps: u16,
    /// Minimum proceeds (lamports) for the auction to succeed; 0 disables the check.
    pub min_raise: u64,
    /// If randomness is not settled within this many slots after `end_slot`,
    /// anyone may call `settle_fallback` (cutoff = end_slot).
    pub randomness_timeout_slots: u64,

    pub state: AuctionState,
    pub randomness_account: Pubkey,
    pub randomness_requested_slot: u64,
    pub cutoff_slot: u64,
    pub reveal_end_slot: u64,

    pub demand_by_tick: [u64; MAX_TICKS],
    pub total_bids: u32,
    pub revealed_bids: u32,
    pub claimed_bids: u32,

    pub clearing_tick: u8,
    /// Supply left for the marginal tick after all higher ticks are fully filled.
    pub margin_supply: u64,
    /// Total demand at the marginal tick. fill = qty * margin_supply / margin_demand.
    pub margin_demand: u64,
    /// Theoretical total sold (before per-bid rounding).
    pub total_sold: u64,

    /// Lamports paid by winners so far (accumulated by `claim`).
    pub proceeds_claimed: u64,
    /// Lamports forfeited by unrevealed valid bids (accumulated by `claim`).
    pub penalties_claimed: u64,
    /// Lamports already withdrawn by the issuer.
    pub proceeds_withdrawn: u64,
    /// Tokens already withdrawn by the issuer.
    pub tokens_withdrawn: u64,

    pub bump: u8,
    pub vault_bump: u8,
}

impl Auction {
    pub fn price_of_tick(&self, tick: u8) -> Result<u64> {
        self.min_price
            .checked_add((tick as u64).checked_mul(self.price_tick).ok_or(ProgramError::ArithmeticOverflow)?)
            .ok_or(ProgramError::ArithmeticOverflow.into())
    }

    /// Lamports owed for `quantity` base units at `price` lamports per `price_unit`. Rounds up.
    pub fn cost(&self, quantity: u64, price: u64) -> Result<u64> {
        let num = (quantity as u128)
            .checked_mul(price as u128)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let unit = self.price_unit as u128;
        let c = num
            .checked_add(unit - 1)
            .ok_or(ProgramError::ArithmeticOverflow)?
            / unit;
        u64::try_from(c).map_err(|_| ProgramError::ArithmeticOverflow.into())
    }

    /// Slot range `[lo, end_slot]` from which the cutoff is drawn.
    pub fn cutoff_lower_bound(&self) -> u64 {
        let len = self.end_slot - self.start_slot; // validated end >= start
        let offset = ((len as u128) * (self.min_cutoff_ratio_bps as u128)).div_ceil(BPS_DENOM as u128) as u64;
        self.start_slot + offset
    }

    pub fn compute_cutoff(&self, random: u64) -> u64 {
        let lo = self.cutoff_lower_bound();
        let span = self.end_slot - lo + 1;
        lo + (random % span)
    }
}

#[account]
#[derive(InitSpace)]
pub struct Bid {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub bid_index: u32,
    /// sha256(auction || bidder || tick(u8) || quantity(u64 LE) || salt[32])
    pub commitment: [u8; 32],
    /// Escrowed lamports (excluding the account's rent-exempt reserve).
    pub deposit_lamports: u64,
    pub commit_slot: u64,
    pub revealed: bool,
    pub tick: u8,
    pub quantity: u64,
    pub bump: u8,
}

/// Stand-in for a VRF account in tests / before Switchboard integration.
/// Created by anyone (records `seed_slot`), revealed by the auction issuer.
#[account]
#[derive(InitSpace)]
pub struct MockRandomness {
    pub auction: Pubkey,
    pub seed_slot: u64,
    pub revealed: bool,
    pub value: [u8; 32],
    pub bump: u8,
}
