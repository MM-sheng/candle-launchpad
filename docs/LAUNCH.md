# Mainnet launch checklist (BNB Chain)

Scope for v1 (decided 2026-09-17): native BNB quote asset, no platform fee, permissionless
auction creation, no automatic DEX pool. Everything below assumes that scope.

Status legend: ✅ done · 🔧 engineering, can be done now · 🧑 needs a human / external party · ⏳ waiting

## 1. Contract

| # | Item | Status |
|---|---|---|
| 1.1 | Fund-delivery hardening for hostile tokens / receivers (`pendingNative`, `claimTokens`, `refundUndelivered`) | ✅ |
| 1.2 | `nonReentrant` on every state-changing function; Slither medium+ reviewed | ✅ |
| 1.3 | Redeploy hardened contract to BNB testnet, run `scripts/e2e.ts`, update `docs/devnet-run.md` | ✅ auction #0 on `0x662F…4881` |
| 1.4 | Freeze the code: tag `v1.0.0-rc1`, no further contract changes without re-audit | ✅ tagged |
| 1.5 | **External audit** of `src/` (one reputable firm; budget 2–4 weeks). Hand them `README.md`, this file, `test/`, and the Slither report | 🧑 |
| 1.6 | Fix audit findings, re-run the full suite + fuzz with `FOUNDRY_PROFILE=ci` (10k runs), tag `v1.0.0` | ⏳ |

Known accepted risks (document for auditors and in the UI):
- Auction creation is permissionless: anyone can list any token. The contract guarantees bidders
  get their BNB back even if the token is malicious, but it cannot make a worthless token valuable.
  The UI must show a clear "unverified issuer" warning.
- Issuer shill bidding is not prevented by commit-reveal.
- Sybil splitting of bids can win a slightly larger share of the marginal tick (floor rounding).
- Chainlink VRF liveness: if no callback within `randomnessTimeoutBlocks`, the auction degrades to
  cutoff = `endBlock` (plain sealed-bid). Bidders are told this up front.

## 2. Randomness (Chainlink VRF v2.5)

| # | Item | Status |
|---|---|---|
| 2.1 | Verify mainnet coordinator / key hash on https://docs.chain.link/vrf/v2-5/supported-networks (values pre-filled in `.env.example`) | ✅ from docs 2026-09-16 |
| 2.2 | Create a mainnet VRF subscription at https://vrf.chain.link, fund with BNB (`payInNative=true`) — start with ≥ 2 BNB; each request costs roughly 0.005–0.02 BNB at 200 gwei key hash | 🧑 |
| 2.3 | Deploy `ChainlinkVRFProvider` + `CandleAuctionHouse` (`script/Deploy.s.sol`), add the provider as a consumer | 🧑 |
| 2.4 | **Transfer provider ownership to a multisig or `TimelockController`** (≥ 24 h delay). The base `VRFConsumerBaseV2Plus.setCoordinator` cannot be disabled; whoever owns the provider could point it at a fake coordinator and choose the cutoff. Ownership must not sit on a hot wallet | 🧑 |
| 2.5 | Subscription balance alert (Chainlink Automation or a cron hitting `getSubscription`) — low balance = auctions fall back to sealed-bid | 🔧 |

## 3. Off-chain infrastructure

| # | Item | Status |
|---|---|---|
| 3.1 | Private RPC (Alchemy / QuickNode / NodeReal) for crank and frontend; public BSC nodes rate-limit `eth_getLogs` and lag | 🧑 |
| 3.2 | Crank as a supervised service (pm2/systemd/container) on two hosts with different RPCs; `npm run crank -- --all`. Both may run concurrently — transitions are idempotent and the loser just reverts | 🔧 |
| 3.3 | Crank wallet: dedicated key, ≥ 0.5 BNB, balance alert | 🧑 |
| 3.4 | Alerting on: auction stuck in `AwaitingRandomness` > timeout/2, `settleFallback` used, `TokenDeliveryDeferred`, `NativePaymentDeferred` | 🔧 |
| 3.5 | Indexer for the auction list (The Graph subgraph or a small Postgres + viem watcher). The current UI walks `getAuction(i)` sequentially — fine for tens of auctions, not thousands | 🔧 |

## 4. Frontend

| # | Item | Status |
|---|---|---|
| 4.1 | Regenerate ABI; add "pending BNB" banner + `withdrawPending`, and undelivered-token retry/refund actions | ✅ |
| 4.2 | Unverified-issuer / unknown-token warning on every auction page; link to token contract | ✅ |
| 4.3 | RPC fallback list (`fallback([http(a), http(b)])`) so one dead node does not blank the page | ✅ |
| 4.4 | WalletConnect project id (free at https://cloud.reown.com) for mobile wallets | 🧑 |
| 4.5 | Salt safety: explain the penalty before the first commit; require the user to confirm they saved the file; offer re-import | ✅ |
| 4.6 | Hosting (Vercel/Cloudflare Pages), domain, `NEXT_PUBLIC_*` for mainnet | 🧑 |
| 4.7 | Terms / risk disclosure page; jurisdiction review for token sales | 🧑 |

## 5. Launch sequence

1. Audit signed off, `v1.0.0` tagged.
2. Deploy to mainnet from a fresh deployer key; verify on BscScan; record addresses in `docs/mainnet.md`.
3. Provider ownership → timelock/multisig; VRF subscription funded; consumer added.
4. Crank running on two hosts; alerting live.
5. Frontend deployed pointing at mainnet; run one small **internal** auction end-to-end with real BNB (tiny supply).
6. Announce. Keep the first public auctions small (`minRaise` and supply caps are per-auction parameters).

## 6. Explicitly out of v1

USDC/USDT quote asset · platform fee · issuer allowlist / KYC · automatic PancakeSwap pool · Robinhood Chain.
