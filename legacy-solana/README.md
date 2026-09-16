# Candle Launchpad (Solana devnet prototype)

Single-round token launch auction with **commit-reveal bids**, a **random cutoff slot**
decided on-chain *after* the commit window closes, and a **uniform clearing price**.

- On-chain program: `programs/candle_launchpad` (Rust + Anchor 0.32)
- Tests: `tests/` (mocha + LiteSVM, slot warping)
- Crank: `scripts/crank.ts`
- Frontend: `app/` (M5)

## Lifecycle

```
Committing ──(end_slot passed, request_randomness)──► AwaitingRandomness
    │                                                        │ settle_randomness
    │ settle_fallback (timeout)                              ▼
    └───────────────────────────────────────────────────► Revealing
                                                             │ finalize
                                                  ┌──────────┴──────────┐
                                                  ▼                     ▼
                                              Finalized             Cancelled
                                              (claim /               (full refunds,
                                               withdraw_proceeds)     tokens back)
```

`cutoff_slot = lo + random % (end_slot - lo + 1)` where
`lo = start_slot + ceil(len * min_cutoff_ratio_bps / 10000)`.
Bids with `commit_slot <= cutoff_slot` are valid; later ones are refunded in full and may be
claimed as soon as the cutoff is known.

## Design decisions (resolved from the plan's open questions)

| Topic | Decision |
|---|---|
| Marginal-tick rounding | Per-bid fill = `floor(qty * margin_supply / margin_demand)` (u128). Σ fills ≤ supply. Issuer withdraws the certainly-unsold part right after finalize; the rounding dust is released once `claimed_bids == total_bids`. Every `claim` accumulates `proceeds_claimed` / `penalties_claimed`, and `withdraw_proceeds` is idempotent/repeatable. |
| Randomness failure | Randomness account is bound **once** (`request_randomness`) and must be seeded after `end_slot`. If nothing is settled within `randomness_timeout_slots` after `end_slot`, anyone can call `settle_fallback` → `cutoff = end_slot` (plain sealed-bid auction). |
| Cancellation | Issuer can cancel only before `start_slot`. `finalize` also cancels when nothing sold or `total_sold * clearing_price < min_raise`; in `Cancelled` every bid gets a full refund (no penalty). |
| Rent vs deposit | `Bid.deposit_lamports` is tracked separately from account rent; `claim` moves payment + penalty to the auction PDA and closes the bid to the bidder (refund + rent). |
| Commitment | `sha256(auction ‖ bidder ‖ tick:u8 ‖ quantity:u64 LE ‖ salt[32])` |
| Claim | Permissionless (anyone can crank; funds always go to `bid.bidder`). |
| Penalty recipient | Issuer (field kept separate for later re-routing). |
| Bids per address | Unlimited (`bid_index`). |
| Defaults | reveal 1500 slots (~10 min devnet), `min_cutoff_ratio_bps = 5000`. |
| Pricing | `price(tick)` is lamports per `price_unit` base units (usually `10^decimals`). Cost rounds **up**. |

Out of scope (see plan §9): DEX pool bootstrap, USDC quote asset, listing page, platform fee,
shill-bidding by the issuer (commit-reveal does not prevent it).

## Randomness source

`request_randomness` / `settle_randomness` read the bound account via `read_randomness()`
in `instructions/randomness.rs`. Without the `switchboard` cargo feature this expects a
`MockRandomness` PDA (`["mock_rand", auction]`) created by anyone and revealed by the issuer.
M4 swaps the reader for Switchboard On-Demand; the auction interface is unchanged.

## Develop

```bash
anchor build
npm test          # LiteSVM tests (no validator needed)
```
