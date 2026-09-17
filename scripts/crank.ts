/**
 * Crank: pushes auctions through the permissionless transitions.
 *
 *   npm run crank -- <auctionId> [<auctionId> ...] [--interval 5000] [--once]
 *   npm run crank -- --all            # crank every auction discovered via AuctionCreated logs
 *
 * Env (.env): CRANK_PRIVATE_KEY (or PRIVATE_KEY), BSC_TESTNET_RPC_URL, AUCTION_HOUSE.
 * Uses polling, not log subscriptions, because public BSC testnet RPCs rate-limit eth_getLogs.
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import houseAbi from "../abi/CandleAuctionHouse.json" with { type: "json" };

const STATE = ["Committing", "AwaitingRandomness", "Revealing", "Finalized", "Cancelled"] as const;

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing env ${name}`);
  return v;
}

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string, d: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const interval = Number(opt("--interval", "5000"));
const once = flag("--once");
const all = flag("--all");
const ids = args.filter((a: string) => /^\d+$/.test(a)).map(BigInt);
if (!all && ids.length === 0) {
  console.error("usage: crank.ts <auctionId>... | --all  [--interval ms] [--once]");
  process.exit(1);
}

const rpc = env("BSC_TESTNET_RPC_URL", "https://data-seed-prebsc-1-s1.bnbchain.org:8545");
const house = env("AUCTION_HOUSE") as Address;
const rawKey = env("CRANK_PRIVATE_KEY", process.env.PRIVATE_KEY);
const account = privateKeyToAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex);
const pub = createPublicClient({ chain: bscTestnet, transport: http(rpc) });
const wallet = createWalletClient({ chain: bscTestnet, transport: http(rpc), account });

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function discoverAuctions(): Promise<bigint[]> {
  // auctionIds are contiguous from zero. Reading the counter avoids an
  // unbounded eth_getLogs query, which public BSC RPCs reject.
  const count = (await pub.readContract({
    address: house,
    abi: houseAbi,
    functionName: "auctionCount",
  })) as bigint;
  const discovered: bigint[] = [];
  for (let id = 0n; id < count; id++) discovered.push(id);
  return discovered;
}

async function send(fn: string, id: bigint) {
  const { request } = await pub.simulateContract({ address: house, abi: houseAbi, functionName: fn, args: [id], account });
  const hash = await wallet.writeContract(request);
  log(`  ${fn}(${id}) -> ${hash}`);
  const r = await pub.waitForTransactionReceipt({ hash });
  log(`  ${fn}(${id}) ${r.status} gas=${r.gasUsed}`);
}

async function step(id: bigint, block: bigint): Promise<boolean> {
  const a = (await pub.readContract({ address: house, abi: houseAbi, functionName: "getAuction", args: [id] })) as any;
  const state = STATE[Number(a.state)];
  const end = BigInt(a.p.endBlock);
  const timeoutAt = end + BigInt(a.p.randomnessTimeoutBlocks);
  log(`#${id} ${state} block=${block} end=${end} cutoff=${a.cutoffBlock} revealEnd=${a.revealEndBlock}`);

  try {
    switch (state) {
      case "Committing":
        if (block > timeoutAt) await send("settleFallback", id);
        else if (block > end) await send("requestRandomness", id);
        return false;
      case "AwaitingRandomness":
        // VRF callback pending; only intervene if the provider never delivered.
        if (block > timeoutAt) await send("settleFallback", id);
        return false;
      case "Revealing":
        if (block > BigInt(a.revealEndBlock)) await send("finalize", id);
        return false;
      default:
        return true; // Finalized / Cancelled: nothing left to crank
    }
  } catch (e: any) {
    log(`  #${id} tx failed: ${e.shortMessage ?? e.message?.split("\n")[0]}`);
    return false;
  }
}

async function main() {
  log(`crank ${account.address} house=${house} rpc=${rpc}`);
  let targets = all ? await discoverAuctions() : ids;
  const done = new Set<bigint>();
  for (;;) {
    const block = await pub.getBlockNumber();
    for (const id of targets) {
      if (done.has(id)) continue;
      if (await step(id, block)) done.add(id);
    }
    if (once || (!all && targets.every((id: bigint) => done.has(id)))) {
      log("nothing left to crank; exiting");
      return;
    }
    await new Promise((r) => setTimeout(r, interval));
    if (all) targets = await discoverAuctions();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
