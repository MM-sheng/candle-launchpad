/**
 * End-to-end auction on BNB testnet with two wallets, exercising exactly the contract
 * calls the frontend makes. Appends a transaction log to docs/devnet-run.md.
 *
 *   npx tsx scripts/e2e.ts
 *
 * Env: PRIVATE_KEY (issuer + bidder A), BIDDER_B_PRIVATE_KEY, AUCTION_HOUSE, BSC_TESTNET_RPC_URL, E2E_TOKEN.
 */
import "dotenv/config";
import { appendFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, erc20Abi, parseUnits, formatUnits, formatEther, decodeEventLog, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import houseAbi from "../abi/CandleAuctionHouse.json" with { type: "json" };

const STATE = ["Committing", "AwaitingRandomness", "Revealing", "Finalized", "Cancelled"];
const env = (n: string, d?: string) => { const v = process.env[n] ?? d; if (v === undefined) throw new Error(`missing ${n}`); return v; };
const key = (n: string) => { const k = env(n); return (k.startsWith("0x") ? k : `0x${k}`) as Hex; };

const rpc = env("BSC_TESTNET_RPC_URL");
const house = env("AUCTION_HOUSE") as Address;
const token = env("E2E_TOKEN", "0xcb415e4C71df31128f5597Ad067355396D343c9a") as Address;
const A = privateKeyToAccount(key("PRIVATE_KEY"));
const B = privateKeyToAccount(key("BIDDER_B_PRIVATE_KEY"));
const pub = createPublicClient({ chain: bscTestnet, transport: http(rpc) });
const wA = createWalletClient({ chain: bscTestnet, transport: http(rpc), account: A });
const wB = createWalletClient({ chain: bscTestnet, transport: http(rpc), account: B });

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const txs: [string, Hex][] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(label: string, w: typeof wA, req: Record<string, unknown>) {
  const { request } = await pub.simulateContract({ ...req, account: w.account } as any);
  const hash = await w.writeContract(request as any);
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  log(`${label}: ${hash} (gas ${rc.gasUsed})`);
  txs.push([label, hash]);
  return rc;
}
const read = (fn: string, args: unknown[]) => pub.readContract({ address: house, abi: houseAbi, functionName: fn, args }) as Promise<any>;
const auction = (id: bigint) => read("getAuction", [id]);
async function waitBlock(target: bigint, what: string) {
  for (;;) {
    const b = await pub.getBlockNumber();
    if (b > target) return b;
    log(`waiting for ${what}: block ${b} → ${target}`);
    await sleep(6000);
  }
}
async function waitState(id: bigint, s: string, timeoutMs: number) {
  const t0 = Date.now();
  for (;;) {
    const a = await auction(id);
    if (STATE[a.state] === s) return a;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${s}`);
    log(`waiting for ${s}, currently ${STATE[a.state]}`);
    await sleep(6000);
  }
}
const randomSalt = () => ("0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, "0")).join("")) as Hex;

async function main() {
  const dec = await pub.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
  const sym = await pub.readContract({ address: token, abi: erc20Abi, functionName: "symbol" });
  const unit = 10n ** BigInt(dec);
  const supply = parseUnits("100", dec);
  const balA0 = await pub.getBalance({ address: A.address }), balB0 = await pub.getBalance({ address: B.address });
  const tokA0 = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [A.address] });
  const tokB0 = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [B.address] });
  log(`issuer/bidder A ${A.address}, bidder B ${B.address}, token ${sym}`);

  // ---- create
  const allowance0 = await pub.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [A.address, house] });
  if (allowance0 < supply) await send("Approve supply", wA, { address: token, abi: erc20Abi, functionName: "approve", args: [house, supply] });
  // Read the block number *after* the approve landed; +20 leaves room for RPC lag.
  const now = await pub.getBlockNumber({ cacheTime: 0 });
  const p = {
    token, numTicks: 3, startBlock: now + 20n, endBlock: now + 20n + 60n, revealDurationBlocks: 400n, randomnessTimeoutBlocks: 600n,
    minCutoffRatioBps: 5000, unrevealedPenaltyBps: 1000, supply, priceUnit: unit,
    minPrice: parseUnits("0.00001", 18), priceTick: parseUnits("0.00001", 18), minRaise: 0n,
  };
  const rc = await send("Create auction", wA, { address: house, abi: houseAbi, functionName: "createAuction", args: [p] });
  let id = 0n;
  for (const l of rc.logs) { try { const e = decodeEventLog({ abi: houseAbi, data: l.data, topics: l.topics }); if (e.eventName === "AuctionCreated") id = (e.args as any).auctionId; } catch {} }
  log(`auctionId = ${id}, commit window ${p.startBlock}-${p.endBlock}`);

  // ---- commit (same hash the UI computes via commitmentHash())
  const price = (t: number) => p.minPrice + BigInt(t) * p.priceTick;
  const cost = (q: bigint, pr: bigint) => (q * pr + unit - 1n) / unit;
  const bids = [
    { w: wA, who: "A", tick: 2, qty: parseUnits("50", dec), extra: parseUnits("0.0002", 18), salt: randomSalt(), index: 0n as bigint },
    { w: wB, who: "B", tick: 0, qty: parseUnits("70", dec), extra: 0n, salt: randomSalt(), index: 0n as bigint },
  ];
  await waitBlock(p.startBlock - 1n, "commit window");
  for (const b of bids) {
    const commitment = await read("commitmentHash", [id, b.w.account.address, b.tick, b.qty, b.salt]);
    const deposit = cost(b.qty, price(b.tick)) + b.extra;
    const r = await send(`Commit bid ${b.who} (tick ${b.tick}, ${formatUnits(b.qty, dec)} ${sym}, deposit ${formatEther(deposit)})`, b.w,
      { address: house, abi: houseAbi, functionName: "commitBid", args: [id, commitment], value: deposit });
    for (const l of r.logs) { try { const e = decodeEventLog({ abi: houseAbi, data: l.data, topics: l.topics }); if (e.eventName === "BidCommitted") b.index = (e.args as any).bidIndex; } catch {} }
  }

  // ---- crank: randomness
  await waitBlock(p.endBlock, "end of commit window");
  await send("Request randomness", wA, { address: house, abi: houseAbi, functionName: "requestRandomness", args: [id] });
  const a1 = await waitState(id, "Revealing", 10 * 60_000);
  log(`VRF cutoff = ${a1.cutoffBlock} (window ${p.startBlock}-${p.endBlock}), reveal until ${a1.revealEndBlock}`);

  // ---- reveal
  for (const b of bids) {
    const bid = await read("getBid", [id, b.index]);
    if (BigInt(bid.commitBlock) > BigInt(a1.cutoffBlock)) { log(`bid ${b.who} committed after cutoff — refund only`); continue; }
    await send(`Reveal bid ${b.who}`, b.w, { address: house, abi: houseAbi, functionName: "revealBid", args: [id, b.index, b.tick, b.qty, b.salt] });
  }

  // ---- finalize
  await waitBlock(BigInt(a1.revealEndBlock), "end of reveal period");
  await send("Finalize", wA, { address: house, abi: houseAbi, functionName: "finalize", args: [id] });
  const a2 = await auction(id);
  log(`state ${STATE[a2.state]}, clearing tick ${a2.clearingTick}, totalSold ${formatUnits(a2.totalSold, dec)}, margin ${a2.marginSupply}/${a2.marginDemand}`);

  // ---- claim + withdraw
  const outcomes: string[] = [];
  for (const b of bids) {
    const [tok, pay, pen] = (await read("previewClaim", [id, b.index])) as [bigint, bigint, bigint];
    const bid = await read("getBid", [id, b.index]);
    await send(`Claim bid ${b.who}`, b.w, { address: house, abi: houseAbi, functionName: "claim", args: [id, b.index] });
    outcomes.push(`- Bid ${b.who}: ${formatUnits(tok, dec)} ${sym}, payment ${formatEther(pay)} tBNB, refund ${formatEther(BigInt(bid.deposit) - pay - pen)} tBNB${pen ? `, penalty ${formatEther(pen)}` : ""}`);
  }
  await send("Withdraw proceeds", wA, { address: house, abi: houseAbi, functionName: "withdrawProceeds", args: [id] });

  // ---- conservation
  const a3 = await auction(id);
  const houseTok = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [house] });
  const escrow = await read("totalEscrowed", []).catch(() => null);
  const tokA1 = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [A.address] });
  const tokB1 = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [B.address] });
  log(`house token balance ${formatUnits(houseTok, dec)}; escrow ${escrow}; claimed ${a3.claimedBids}/${bids.length}`);
  log(`token delta A ${formatUnits(tokA1 - tokA0, dec)} (issuer: -supply + fill + unsold), B ${formatUnits(tokB1 - tokB0, dec)}`);
  log(`native delta A ${formatEther((await pub.getBalance({ address: A.address })) - balA0)} (incl. gas), B ${formatEther((await pub.getBalance({ address: B.address })) - balB0)} (incl. gas)`);

  const md = `
## Frontend-parity run (auctionId ${id}) — \`scripts/e2e.ts\`

Two wallets, same contract calls the app makes (\`commitmentHash\` → \`commitBid\` → \`revealBid\` → \`claim\`), crank steps inline.

- Supply: ${formatUnits(supply, dec)} ${sym}, 3 ticks from ${formatEther(p.minPrice)} tBNB
- Bid A: tick 2, ${formatUnits(bids[0].qty, dec)} ${sym} (+${formatEther(bids[0].extra)} tBNB extra deposit to mask size)
- Bid B: tick 0, ${formatUnits(bids[1].qty, dec)} ${sym}
- Commit window: blocks \`${p.startBlock}\`–\`${p.endBlock}\`; VRF cutoff: block \`${a1.cutoffBlock}\`
- Clearing tick ${a2.clearingTick} (${formatEther(price(a2.clearingTick))} tBNB/${sym}), sold ${formatUnits(a2.totalSold, dec)} ${sym}, marginal fill ${a2.marginSupply}/${a2.marginDemand}
${outcomes.join("\n")}
- After withdraw: house token balance ${formatUnits(houseTok, dec)}, claimed ${a3.claimedBids}/${bids.length}

| Action | Transaction |
|---|---|
${txs.map(([l, h]) => `| ${l} | [\`${h}\`](https://testnet.bscscan.com/tx/${h}) |`).join("\n")}
`;
  appendFileSync("docs/devnet-run.md", md);
  log("appended to docs/devnet-run.md");
}

main().catch((e) => { console.error(e); process.exit(1); });
