import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { Env, expectFail, sol, tokens, PRICE_UNIT } from "./helpers";

type Committed = Awaited<ReturnType<Env["commitBid"]>>;

function price(a: any, tick: number): bigint {
  return BigInt(a.minPrice.toString()) + BigInt(tick) * BigInt(a.priceTick.toString());
}
function cost(a: any, qty: bigint, p: bigint): bigint {
  const unit = BigInt(a.priceUnit.toString());
  return (qty * p + unit - 1n) / unit;
}

/// Claims every bid, withdraws issuer proceeds, and asserts the conservation invariants:
///   issuer SOL income + Σ refunds == Σ deposits
///   Σ tokens to bidders + tokens back to issuer == supply
async function claimAllAndCheckInvariants(env: Env, auction: PublicKey, bids: Committed[]) {
  const a0 = await env.fetchAuction(auction);
  const supply = BigInt(a0.supply.toString());
  const totalDeposits = bids.reduce((s, b) => s + b.deposit, 0n);
  const issuerTokensBefore = env.tokenBalance(env.issuerAta);

  let sumRefund = 0n;
  let sumTokens = 0n;
  for (const b of bids) {
    const bidAcc = await env.fetchBid(b.bid);
    if (!bidAcc) continue; // already claimed in test body
    const rent = env.lamports(b.bid) - b.deposit;
    // pay claim tx fee from a separate cranker so the bidder balance delta is exact
    const cranker = env.newWallet(1);
    const before = env.lamports(b.bidder.publicKey);
    const tokBefore = env.tokenBalance(env.bidderAta(b.bidder.publicKey));
    await env.claim(auction, b, cranker);
    const refund = env.lamports(b.bidder.publicKey) - before - rent;
    sumRefund += refund;
    sumTokens += env.tokenBalance(env.bidderAta(b.bidder.publicKey)) - tokBefore;
    assert.isNull(await env.fetchBid(b.bid), "bid account closed");
  }

  const issuerBefore = env.lamports(env.issuer.publicKey);
  const a1 = await env.fetchAuction(auction);
  assert.equal(a1.claimedBids, a1.totalBids);
  const expectedIncome = BigInt(a1.proceedsClaimed.toString()) + BigInt(a1.penaltiesClaimed.toString());
  const vaultBefore = env.tokenBalance(env.vaultPda(auction));
  if (expectedIncome > 0n || vaultBefore > 0n) {
    await env.withdrawProceeds(auction);
  }
  const issuerIncome = env.lamports(env.issuer.publicKey) - issuerBefore + 5000n; // + tx fee paid by issuer
  const issuerTokensBack = env.tokenBalance(env.issuerAta) - issuerTokensBefore;

  assert.equal(issuerIncome, expectedIncome, "issuer income == proceeds + penalties");
  assert.equal(issuerIncome + sumRefund, totalDeposits, "SOL conservation");
  assert.equal(sumTokens + issuerTokensBack, supply, "token conservation");
  assert.equal(env.tokenBalance(env.vaultPda(auction)), 0n, "vault drained");
  return { sumRefund, sumTokens, issuerIncome, issuerTokensBack };
}

describe("candle launchpad", () => {
  it("1. happy path: commit → random cutoff → reveal → clear → claim, with conservation", async () => {
    const env = Env.create();
    const params = env.defaultParams({ supply: new BN(tokens(1000).toString()) });
    const auction = await env.createAuction(params);
    assert.equal(env.tokenBalance(env.vaultPda(auction)), tokens(1000));

    env.warpTo(params.startSlot.toNumber());
    const alice = env.newWallet(), bob = env.newWallet(), carol = env.newWallet();
    const a = await env.fetchAuction(auction);
    // alice: 500 @ tick 4, bob: 400 @ tick 2, carol: 300 @ tick 2 (margin), all early
    const bids: Committed[] = [];
    bids.push(await env.commitBid(auction, alice, 0, 4, tokens(500), cost(a, tokens(500), price(a, 4)) + sol(1)));
    env.warpBy(5);
    bids.push(await env.commitBid(auction, bob, 0, 2, tokens(400), cost(a, tokens(400), price(a, 2))));
    env.warpBy(5);
    bids.push(await env.commitBid(auction, carol, 0, 2, tokens(300), cost(a, tokens(300), price(a, 2))));

    // Random → cutoff in second half of window; all three committed in first 10 slots so all valid.
    await env.runRandomness(auction, 12345n);
    const a2 = await env.fetchAuction(auction);
    assert.deepEqual(a2.state, { revealing: {} });
    const cutoff = BigInt(a2.cutoffSlot.toString());
    const lo = BigInt(params.startSlot.toString()) + 50n;
    assert.isTrue(cutoff >= lo && cutoff <= BigInt(params.endSlot.toString()), `cutoff ${cutoff} in [${lo}, ${params.endSlot}]`);

    for (const b of bids) await env.revealBid(auction, b, b.tick, b.quantity, b.salt);
    const a3 = await env.fetchAuction(auction);
    assert.equal(a3.demandByTick[4].toString(), tokens(500).toString());
    assert.equal(a3.demandByTick[2].toString(), tokens(700).toString());

    env.warpTo(BigInt(a3.revealEndSlot.toString()) + 1n);
    await env.finalize(auction);
    const a4 = await env.fetchAuction(auction);
    assert.deepEqual(a4.state, { finalized: {} });
    assert.equal(a4.clearingTick, 2);
    assert.equal(a4.marginSupply.toString(), tokens(500).toString());
    assert.equal(a4.marginDemand.toString(), tokens(700).toString());

    const r = await claimAllAndCheckInvariants(env, auction, bids);
    // alice full fill at clearing price tick 2
    assert.equal(env.tokenBalance(env.bidderAta(alice.publicKey)), tokens(500));
    // bob & carol pro-rata 500/700
    const bobFill = (tokens(400) * tokens(500)) / tokens(700);
    const carolFill = (tokens(300) * tokens(500)) / tokens(700);
    assert.equal(env.tokenBalance(env.bidderAta(bob.publicKey)), bobFill);
    assert.equal(env.tokenBalance(env.bidderAta(carol.publicKey)), carolFill);
    assert.isTrue(r.sumTokens <= tokens(1000));
    const p2 = price(a4, 2);
    assert.equal(r.issuerIncome, cost(a4, tokens(500), p2) + cost(a4, bobFill, p2) + cost(a4, carolFill, p2));
  });

  it("2. bids committed after the cutoff can only be refunded, never revealed", async () => {
    const env = Env.create();
    const params = env.defaultParams({ minCutoffRatioBps: 0 });
    const auction = await env.createAuction(params);
    const start = params.startSlot.toNumber();
    env.warpTo(start);
    const alice = env.newWallet(), bob = env.newWallet();
    const a = await env.fetchAuction(auction);
    const early = await env.commitBid(auction, alice, 0, 1, tokens(10), cost(a, tokens(10), price(a, 1)));
    env.warpTo(start + 90);
    const late = await env.commitBid(auction, bob, 0, 1, tokens(10), cost(a, tokens(10), price(a, 1)));

    // random 20 with ratio 0 → cutoff = start + 20
    await env.runRandomness(auction, 20n);
    const a2 = await env.fetchAuction(auction);
    assert.equal(a2.cutoffSlot.toNumber(), start + 20);

    await expectFail(env.revealBid(auction, late, 1, tokens(10), late.salt), "BidAfterCutoff");
    await env.revealBid(auction, early, 1, tokens(10), early.salt);

    // Invalid bid can be refunded right away during Revealing, in full.
    const before = env.lamports(bob.publicKey);
    const rent = env.lamports(late.bid) - late.deposit;
    await env.claim(auction, late, env.newWallet(1));
    assert.equal(env.lamports(bob.publicKey) - before, late.deposit + rent);
    // Valid bid cannot be claimed before finalize.
    await expectFail(env.claim(auction, early, env.newWallet(1)), "NotClaimable");

    env.warpTo(a2.revealEndSlot.toNumber() + 1);
    await env.finalize(auction);
    await claimAllAndCheckInvariants(env, auction, [early, late]);
  });

  it("3. reveal with wrong hash is rejected", async () => {
    const env = Env.create();
    const params = env.defaultParams();
    const auction = await env.createAuction(params);
    env.warpTo(params.startSlot.toNumber());
    const alice = env.newWallet();
    const a = await env.fetchAuction(auction);
    const b = await env.commitBid(auction, alice, 0, 3, tokens(10), cost(a, tokens(10), price(a, 3)));
    await env.runRandomness(auction, 7n);
    await expectFail(env.revealBid(auction, b, 3, tokens(11), b.salt), "CommitmentMismatch");
    await expectFail(env.revealBid(auction, b, 2, tokens(10), b.salt), "CommitmentMismatch");
    await expectFail(env.revealBid(auction, b, 3, tokens(10), Buffer.alloc(32)), "CommitmentMismatch");
    await env.revealBid(auction, b, 3, tokens(10), b.salt);
    await expectFail(env.revealBid(auction, b, 3, tokens(10), b.salt), "AlreadyRevealed");
  });

  it("4. reveal with insufficient deposit is rejected", async () => {
    const env = Env.create();
    const params = env.defaultParams();
    const auction = await env.createAuction(params);
    env.warpTo(params.startSlot.toNumber());
    const alice = env.newWallet();
    const a = await env.fetchAuction(auction);
    const b = await env.commitBid(auction, alice, 0, 3, tokens(10), cost(a, tokens(10), price(a, 3)) - 1n);
    await env.runRandomness(auction, 7n);
    await expectFail(env.revealBid(auction, b, 3, tokens(10), b.salt), "InsufficientDeposit");
  });

  it("5. unrevealed valid bid is refunded minus penalty; penalty goes to issuer", async () => {
    const env = Env.create();
    const params = env.defaultParams({ unrevealedPenaltyBps: 1000 });
    const auction = await env.createAuction(params);
    env.warpTo(params.startSlot.toNumber());
    const alice = env.newWallet(), bob = env.newWallet();
    const a = await env.fetchAuction(auction);
    const dep = sol(2);
    const silent = await env.commitBid(auction, alice, 0, 3, tokens(10), dep);
    const loud = await env.commitBid(auction, bob, 0, 3, tokens(10), cost(a, tokens(10), price(a, 3)));
    await env.runRandomness(auction, 1n);
    await env.revealBid(auction, loud, 3, tokens(10), loud.salt);
    const a2 = await env.fetchAuction(auction);
    env.warpTo(a2.revealEndSlot.toNumber() + 1);
    await env.finalize(auction);

    const before = env.lamports(alice.publicKey);
    const rent = env.lamports(silent.bid) - dep;
    await env.claim(auction, silent, env.newWallet(1));
    const penalty = (dep * 1000n) / 10000n;
    assert.equal(env.lamports(alice.publicKey) - before - rent, dep - penalty);
    assert.equal(env.tokenBalance(env.bidderAta(alice.publicKey)), 0n);
    const a3 = await env.fetchAuction(auction);
    assert.equal(a3.penaltiesClaimed.toString(), penalty.toString());

    await claimAllAndCheckInvariants(env, auction, [silent, loud]);
  });

  it("6. total demand < supply: everyone fills at min price, rest returns to issuer", async () => {
    const env = Env.create();
    const params = env.defaultParams({ supply: new BN(tokens(1000).toString()) });
    const auction = await env.createAuction(params);
    env.warpTo(params.startSlot.toNumber());
    const alice = env.newWallet(), bob = env.newWallet();
    const a = await env.fetchAuction(auction);
    const b1 = await env.commitBid(auction, alice, 0, 5, tokens(100), cost(a, tokens(100), price(a, 5)));
    const b2 = await env.commitBid(auction, bob, 0, 0, tokens(200), cost(a, tokens(200), price(a, 0)));
    await env.runRandomness(auction, 3n);
    await env.revealBid(auction, b1, 5, tokens(100), b1.salt);
    await env.revealBid(auction, b2, 0, tokens(200), b2.salt);
    const a2 = await env.fetchAuction(auction);
    env.warpTo(a2.revealEndSlot.toNumber() + 1);
    await env.finalize(auction);
    const a3 = await env.fetchAuction(auction);
    assert.equal(a3.clearingTick, 0);
    assert.equal(a3.totalSold.toString(), tokens(300).toString());

    const r = await claimAllAndCheckInvariants(env, auction, [b1, b2]);
    assert.equal(env.tokenBalance(env.bidderAta(alice.publicKey)), tokens(100));
    assert.equal(env.tokenBalance(env.bidderAta(bob.publicKey)), tokens(200));
    assert.equal(r.issuerTokensBack, tokens(700));
    // Alice paid the floor price, not her bid price.
    assert.equal(r.issuerIncome, cost(a3, tokens(300), price(a3, 0)));
  });

  it("7. marginal tick pro-rata never over-allocates (odd quantities)", async () => {
    const env = Env.create();
    const supply = 1_000_001n; // base units, deliberately awkward
    const params = env.defaultParams({ supply: new BN(supply.toString()) });
    const auction = await env.createAuction(params);
    env.warpTo(params.startSlot.toNumber());
    const a = await env.fetchAuction(auction);
    const qs = [333_337n, 123_457n, 999_983n, 7n, 500_001n];
    const bids: Committed[] = [];
    for (const q of qs) {
      const w = env.newWallet();
      bids.push(await env.commitBid(auction, w, 0, 2, q, cost(a, q, price(a, 2)) + 1n));
    }
    await env.runRandomness(auction, 99n);
    for (const b of bids) await env.revealBid(auction, b, 2, b.quantity, b.salt);
    const a2 = await env.fetchAuction(auction);
    env.warpTo(a2.revealEndSlot.toNumber() + 1);
    await env.finalize(auction);
    const r = await claimAllAndCheckInvariants(env, auction, bids);
    assert.isTrue(r.sumTokens <= supply, "no over-allocation");
    assert.isTrue(r.sumTokens >= supply - BigInt(qs.length), "dust bounded by bid count");
    assert.equal(r.issuerTokensBack, supply - r.sumTokens);
  });

  it("8. double claim is rejected", async () => {
    const env = Env.create();
    const params = env.defaultParams();
    const auction = await env.createAuction(params);
    env.warpTo(params.startSlot.toNumber());
    const alice = env.newWallet();
    const a = await env.fetchAuction(auction);
    const b = await env.commitBid(auction, alice, 0, 1, tokens(5), cost(a, tokens(5), price(a, 1)));
    await env.runRandomness(auction, 1n);
    await env.revealBid(auction, b, 1, tokens(5), b.salt);
    const a2 = await env.fetchAuction(auction);
    env.warpTo(a2.revealEndSlot.toNumber() + 1);
    await env.finalize(auction);
    await env.claim(auction, b);
    // Account is closed; second claim fails at account resolution.
    await expectFail(env.claim(auction, b), "AccountNotInitialized");
  });

  it("9. state machine rejects out-of-phase calls", async () => {
    const env = Env.create();
    const params = env.defaultParams();
    const auction = await env.createAuction(params);
    const start = params.startSlot.toNumber();

    // Before start: no commits, finalize/settle invalid.
    const alice = env.newWallet();
    await expectFail(env.commitBid(auction, alice, 0, 1, tokens(1), sol(1)), "CommitWindowClosed");
    await expectFail(env.finalize(auction), "InvalidState");
    await expectFail(env.settleFallback(auction), "InvalidState");

    env.warpTo(start);
    const b = await env.commitBid(auction, alice, 0, 1, tokens(1), sol(1));
    await expectFail(env.finalize(auction), "InvalidState");
    await expectFail(env.revealBid(auction, b, 1, tokens(1), b.salt), "InvalidState");
    await expectFail(env.cancelAuction(auction), "AlreadyStarted");
    // Randomness can't be requested before the window ends.
    await env.mockCreateRandomness(auction);
    await expectFail(env.requestRandomness(auction), "CommitWindowNotEnded");

    env.warpTo(params.endSlot.toNumber() + 1);
    await expectFail(env.commitBid(auction, alice, 1, 1, tokens(1), sol(1)), "CommitWindowClosed");
    // Randomness seeded *during* the window is rejected.
    await expectFail(env.requestRandomness(auction), "RandomnessSeededTooEarly");
    // Fallback before timeout is rejected.
    await expectFail(env.settleFallback(auction), "RandomnessTimeoutNotElapsed");
    // ...and works after it, with cutoff = end_slot.
    env.warpTo(params.endSlot.toNumber() + params.randomnessTimeoutSlots.toNumber() + 1);
    await env.settleFallback(auction);
    const a2 = await env.fetchAuction(auction);
    assert.equal(a2.cutoffSlot.toNumber(), params.endSlot.toNumber());
    await expectFail(env.requestRandomness(auction), "InvalidState");
    await expectFail(env.finalize(auction), "RevealPeriodNotEnded");
    await env.revealBid(auction, b, 1, tokens(1), b.salt);
    env.warpTo(a2.revealEndSlot.toNumber() + 1);
    await expectFail(env.revealBid(auction, b, 1, tokens(1), b.salt), "RevealPeriodOver");
    await env.finalize(auction);
    await expectFail(env.finalize(auction), "InvalidState");
    // Non-issuer cannot withdraw.
    await expectFail(env.withdrawProceeds(auction, alice), "Unauthorized");
    await claimAllAndCheckInvariants(env, auction, [b]);
  });

  it("9b. issuer can cancel before start; bidders unaffected; tokens return", async () => {
    const env = Env.create();
    const params = env.defaultParams();
    const auction = await env.createAuction(params);
    const before = env.tokenBalance(env.issuerAta);
    await env.cancelAuction(auction);
    await env.withdrawProceeds(auction);
    assert.equal(env.tokenBalance(env.issuerAta) - before, BigInt(params.supply.toString()));
  });

  it("9c. min_raise not met → Cancelled, everyone refunded in full (no penalty)", async () => {
    const env = Env.create();
    const params = env.defaultParams({ minRaise: new BN(sol(100).toString()) });
    const auction = await env.createAuction(params);
    env.warpTo(params.startSlot.toNumber());
    const alice = env.newWallet(), bob = env.newWallet();
    const a = await env.fetchAuction(auction);
    const b1 = await env.commitBid(auction, alice, 0, 1, tokens(5), cost(a, tokens(5), price(a, 1)));
    const b2 = await env.commitBid(auction, bob, 0, 1, tokens(5), sol(1)); // will not reveal
    await env.runRandomness(auction, 1n);
    await env.revealBid(auction, b1, 1, tokens(5), b1.salt);
    const a2 = await env.fetchAuction(auction);
    env.warpTo(a2.revealEndSlot.toNumber() + 1);
    await env.finalize(auction);
    assert.deepEqual((await env.fetchAuction(auction)).state, { cancelled: {} });
    const r = await claimAllAndCheckInvariants(env, auction, [b1, b2]);
    assert.equal(r.issuerIncome, 0n);
    assert.equal(r.sumTokens, 0n);
    assert.equal(r.issuerTokensBack, BigInt(params.supply.toString()));
  });

  it("10. cutoff distribution: many random draws all land in [start + ratio*len, end]", async () => {
    const env = Env.create();
    const len = 100;
    for (const ratioBps of [0, 5000, 10000]) {
      for (let i = 0; i < 25; i++) {
        const params = env.defaultParams({
          auctionId: new BN(ratioBps * 1000 + i),
          minCutoffRatioBps: ratioBps,
        });
        params.endSlot = new BN(params.startSlot.toNumber() + len);
        const auction = await env.createAuction(params);
        const rnd = BigInt.asUintN(64, BigInt(i) * 0x9e3779b97f4a7c15n + 0xdeadbeefn);
        await env.runRandomness(auction, rnd);
        const a = await env.fetchAuction(auction);
        const c = a.cutoffSlot.toNumber();
        const lo = params.startSlot.toNumber() + Math.ceil((len * ratioBps) / 10000);
        assert.isTrue(c >= lo && c <= params.endSlot.toNumber(), `ratio ${ratioBps}: cutoff ${c} in [${lo}, ${params.endSlot}]`);
        if (ratioBps === 10000) assert.equal(c, params.endSlot.toNumber());
      }
    }
  });

  it("11. extremes: 64 ticks, one huge bid, zero-quantity rejected, invalid tick rejected", async () => {
    const env = Env.create();
    const params = env.defaultParams({ numTicks: 64, supply: new BN(tokens(1_000_000).toString()) });
    const auction = await env.createAuction(params);
    env.warpTo(params.startSlot.toNumber());
    const whale = env.newWallet(50_000), tiny = env.newWallet();
    const a = await env.fetchAuction(auction);
    const huge = tokens(5_000_000);
    const w = await env.commitBid(auction, whale, 0, 63, huge, cost(a, huge, price(a, 63)));
    const z = await env.commitBid(auction, tiny, 0, 10, 0n, sol(1));
    const bad = await env.commitBid(auction, tiny, 1, 64, tokens(1), sol(1));
    await env.runRandomness(auction, 5n);
    await env.revealBid(auction, w, 63, huge, w.salt);
    await expectFail(env.revealBid(auction, z, 10, 0n, z.salt), "ZeroQuantity");
    await expectFail(env.revealBid(auction, bad, 64, tokens(1), bad.salt), "InvalidTick");
    const a2 = await env.fetchAuction(auction);
    env.warpTo(a2.revealEndSlot.toNumber() + 1);
    await env.finalize(auction);
    const a3 = await env.fetchAuction(auction);
    assert.equal(a3.clearingTick, 63);
    const r = await claimAllAndCheckInvariants(env, auction, [w, z, bad]);
    assert.equal(env.tokenBalance(env.bidderAta(whale.publicKey)), tokens(1_000_000));
    assert.equal(r.issuerIncome, cost(a3, tokens(1_000_000), price(a3, 63)) + 2n * ((sol(1) * 1000n) / 10000n));
  });

  it("params validation", async () => {
    const env = Env.create();
    await expectFail(env.createAuction(env.defaultParams({ numTicks: 65 })), "InvalidParams");
    await expectFail(env.createAuction(env.defaultParams({ numTicks: 0 })), "InvalidParams");
    await expectFail(env.createAuction(env.defaultParams({ supply: new BN(0) })), "InvalidParams");
    const p = env.defaultParams();
    p.endSlot = new BN(p.startSlot.toNumber() - 1);
    await expectFail(env.createAuction(p), "InvalidParams");
    await expectFail(env.createAuction(env.defaultParams({ unrevealedPenaltyBps: 10001 })), "InvalidParams");
  });
});
