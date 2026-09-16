use anchor_lang::prelude::*;

#[error_code]
pub enum CandleError {
    #[msg("Invalid auction parameters")]
    InvalidParams,
    #[msg("Auction is not in the required state")]
    InvalidState,
    #[msg("Commit window is not open")]
    CommitWindowClosed,
    #[msg("Commit window has not ended yet")]
    CommitWindowNotEnded,
    #[msg("Deposit too small")]
    DepositTooSmall,
    #[msg("Randomness account was seeded before the commit window ended")]
    RandomnessSeededTooEarly,
    #[msg("Randomness account does not belong to this auction")]
    RandomnessMismatch,
    #[msg("Randomness has not been revealed yet")]
    RandomnessNotRevealed,
    #[msg("Randomness timeout has not elapsed")]
    RandomnessTimeoutNotElapsed,
    #[msg("Bid was committed after the random cutoff and is invalid")]
    BidAfterCutoff,
    #[msg("Reveal period is over")]
    RevealPeriodOver,
    #[msg("Reveal period has not ended yet")]
    RevealPeriodNotEnded,
    #[msg("Bid already revealed")]
    AlreadyRevealed,
    #[msg("Commitment hash mismatch")]
    CommitmentMismatch,
    #[msg("Tick out of range")]
    InvalidTick,
    #[msg("Quantity must be positive")]
    ZeroQuantity,
    #[msg("Deposit does not cover price * quantity")]
    InsufficientDeposit,
    #[msg("Bid cannot be claimed yet")]
    NotClaimable,
    #[msg("Only the issuer may do this")]
    Unauthorized,
    #[msg("Auction has already started")]
    AlreadyStarted,
    #[msg("Nothing to withdraw")]
    NothingToWithdraw,
}
