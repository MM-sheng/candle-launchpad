# Candle Launchpad (EVM · BNB Chain testnet)

> **Status (2026-09-17):** feature-complete, code frozen at `v1.0.0-rc1`, running on BNB Chain
> testnet. **Not audited, not on mainnet.** Mainnet path: [launch checklist](docs/LAUNCH.md). 中文项目说明：[项目说明](docs/PROJECT.zh.md).
>
> v1 scope: BNB mainnet, native BNB quote asset, no platform fee, permissionless auction creation,
> no automatic DEX pool. Robinhood Chain deferred (no Chainlink VRF there).

Token launch auction with **commit-reveal bids**, a **random cutoff block** chosen by
Chainlink VRF *after* the commit window closes, and a **uniform clearing price**.
Quote asset is the native currency (tBNB).

- `src/CandleAuctionHouse.sol` — one contract, many auctions (`auctionId`)
- `src/randomness/` — `MockRandomnessProvider` (tests) / `ChainlinkVRFProvider` (VRF v2.5)
- `test/` — Foundry: unit (§10 items 1–14), reentrancy, fuzz, invariant
- `script/Deploy.s.sol` — env-driven deploy (`RANDOMNESS_PROVIDER=mock|chainlink`)
- `scripts/crank.ts` — polls auctions and calls `requestRandomness` / `settleFallback` / `finalize`
- `app/` — Next.js + wagmi + RainbowKit UI (create auction, bid, reveal, claim)
- `abi/` — exported ABIs (`npm run abi`)
- `docs/devnet-run.md` — BNB testnet deployments + recorded auctions
- `docs/LAUNCH.md` — mainnet launch checklist and accepted risks
- `docs/PROJECT.zh.md` — 中文项目说明与当前状态
- `docs/BETA.zh.md` — 测试网公测发布手册（Vercel、GitHub Actions crank、推文草稿）
- `legacy-solana/` — earlier Anchor prototype (superseded)

## Lifecycle

```
Committing ──(block > endBlock, requestRandomness)──► AwaitingRandomness
    │                                                        │ onRandomness (provider)
    │ settleFallback (timeout)                               ▼
    └───────────────────────────────────────────────────► Revealing
                                                             │ finalize
                                                  ┌──────────┴──────────┐
                                                  ▼                     ▼
                                              Finalized             Cancelled
                                              (claim /               (full refunds,
                                               withdrawProceeds)      tokens back)
```

`cutoffBlock = lower + random % (endBlock − lower + 1)`,
`lower = startBlock + ceil(len · minCutoffRatioBps / 10000)`.
Bids with `commitBlock <= cutoffBlock` are valid; later ones are refunded in full and may
be claimed as soon as the cutoff is known.

## Settlement (per bid, `claim` — permissionless, funds always go to the bidder)

| Case | Tokens | Native back |
|---|---|---|
| committed after cutoff | 0 | full deposit |
| valid, not revealed | 0 | deposit × (1 − penalty); penalty → issuer |
| revealed, tick < clearing | 0 | full deposit |
| tick > clearing | quantity | deposit − quantity × clearingPrice |
| tick == clearing | ⌊quantity · marginSupply / marginDemand⌋ | deposit − filled × clearingPrice |
| auction Cancelled | 0 | full deposit |

`cost` rounds up; Σ filled ≤ supply by construction.

### Delivery guarantees (hostile tokens / receivers)

Auction creation is permissionless, so the contract assumes the token may misbehave:

- If a native push (refund / payout) is rejected by the receiver, the amount is parked in
  `pendingNative[receiver]` and collectable with `withdrawPending()`. One hostile receiver can
  never block anyone else's settlement.
- If the token transfer on `claim` fails (blocklist, paused, lying `balanceOf`), the bidder still
  receives their native refund immediately; the tokens and the payment are parked.
  `claimTokens` retries delivery (credits the issuer on success); after 30 days
  `refundUndelivered` returns the payment to the bidder and the tokens count as unsold.
- The issuer is only ever credited for tokens that were actually delivered.

Every state-changing function is `nonReentrant`.

## Design decisions

| Topic | Decision |
|---|---|
| Marginal rounding | Store `marginSupply`/`marginDemand`, fill = floor(q·S/D). Issuer withdraws `supply − totalSold` right after finalize; rounding dust released once every bid is claimed (`withdrawProceeds` is repeatable). |
| Randomness failure | One request per auction. If no callback within `randomnessTimeoutBlocks` after `endBlock`, anyone calls `settleFallback` → cutoff = endBlock. |
| Cancellation | Issuer: only before `startBlock`. `finalize`: nothing sold, or `totalSold × clearingPrice < minRaise` → Cancelled, everyone refunded in full (no penalty). |
| Commitment | `keccak256(abi.encode(chainid, house, auctionId, bidder, tick, quantity, salt))` |
| Fee-on-transfer tokens | Rejected in `createAuction` (balance delta must equal `supply`). |
| Penalty recipient | Issuer. Bids per address: unlimited. Defaults: `minCutoffRatioBps = 5000`, reveal ≈ 10 min of blocks (BSC testnet ≈ 0.45 s/block → 1300 blocks). |

## Develop

```bash
forge build
forge test
forge test --gas-report --no-match-contract "Invariant|Fuzz"
```

## Run the crank

```bash
cp .env.example .env   # PRIVATE_KEY (testnet), AUCTION_HOUSE, BSC_TESTNET_RPC_URL
npm install
npm run crank -- --all            # or: npm run crank -- 3 7 --interval 5000
```

## Run the app

```bash
cd app && cp .env.example .env.local && npm install && npm run dev
```

Bid salts are stored in `localStorage` and also downloaded as JSON on every commit; the
auction page can re-import that file on another browser.

## Deploy (testnet only)

```bash
cp .env.example .env   # fill in; never commit
source .env
RANDOMNESS_PROVIDER=chainlink forge script script/Deploy.s.sol --rpc-url bsc_testnet --broadcast --verify
```

Then add the printed `ChainlinkVRFProvider` address as a consumer of your VRF subscription.
