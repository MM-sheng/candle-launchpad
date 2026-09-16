# Candle Launchpad (EVM · BNB Chain testnet)

> Scope: BNB Chain testnet only. Robinhood Chain is deferred until Chainlink VRF is available there (the contract itself is chain-agnostic).

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
- `docs/devnet-run.md` — BNB testnet deployment + a full recorded auction
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
