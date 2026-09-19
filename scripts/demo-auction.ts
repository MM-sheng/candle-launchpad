/** Create a short BNB testnet auction for screenshots and live demos.
 * Usage: npm run demo-auction -- --minutes 5 --supply 1000
 * Env: PRIVATE_KEY, BSC_TESTNET_RPC_URL, AUCTION_HOUSE, optional E2E_TOKEN.
 */
import "dotenv/config";
import { createPublicClient, createWalletClient, decodeEventLog, erc20Abi, http, isAddress, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import houseAbi from "../abi/CandleAuctionHouse.json" with { type: "json" };

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const env = (name: string, fallback?: string) => { const value = process.env[name] ?? fallback; if (!value?.trim()) throw new Error(`missing ${name}`); return value.trim(); };
const positive = (name: string, fallback: string) => { const value = Number(option(name, fallback)); if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`); return value; };

const rpc = env("BSC_TESTNET_RPC_URL", "https://data-seed-prebsc-1-s1.bnbchain.org:8545");
const house = env("AUCTION_HOUSE") as Address;
const token = env("E2E_TOKEN", "0xcb415e4C71df31128f5597Ad067355396D343c9a") as Address;
if (!isAddress(house) || !isAddress(token)) throw new Error("invalid AUCTION_HOUSE or E2E_TOKEN");
const rawKey = env("PRIVATE_KEY");
const account = privateKeyToAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex);
// viem's client generics vary across supported package versions; runtime requests
// are still checked by simulateContract before any transaction is sent.
const pub: any = createPublicClient({ chain: bscTestnet, transport: http(rpc) });
const wallet: any = createWalletClient({ chain: bscTestnet, transport: http(rpc), account });
const minutes = positive("--minutes", "5");
const supplyText = option("--supply", "1000");
const commitBlocks = BigInt(Math.ceil(minutes * 60 / 0.45));

async function send(label: string, request: Record<string, unknown>) {
  const simulated = await pub.simulateContract({ ...request, account } as any);
  const hash = await wallet.writeContract(simulated.request as any);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  console.log(`${label}: https://testnet.bscscan.com/tx/${hash}`);
  return receipt;
}

async function main() {
  if (await pub.getChainId() !== 97) throw new Error("refusing to run: RPC is not BNB Chain testnet (chainId 97)");
  if ((await pub.getCode({ address: house })) === "0x") throw new Error("no auction house contract at AUCTION_HOUSE");
  const decimals = await pub.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
  const symbol = await pub.readContract({ address: token, abi: erc20Abi, functionName: "symbol" });
  const supply = parseUnits(supplyText, decimals);
  let balance = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  if (balance < supply) {
    await send("Mint test tokens", { address: token, abi: [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }], functionName: "mint", args: [account.address, supply - balance] });
    balance = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  }
  if (balance < supply) throw new Error(`insufficient ${symbol} after mint`);
  const allowance = await pub.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [account.address, house] });
  if (allowance < supply) await send("Approve test tokens", { address: token, abi: erc20Abi, functionName: "approve", args: [house, supply] });

  const now = await pub.getBlockNumber({ cacheTime: 0 });
  const p = {
    token, numTicks: 10, startBlock: now + 30n, endBlock: now + 30n + commitBlocks,
    revealDurationBlocks: 1300n, randomnessTimeoutBlocks: 2000n,
    minCutoffRatioBps: 5000, unrevealedPenaltyBps: 1000, supply,
    priceUnit: 10n ** BigInt(decimals), minPrice: parseUnits("0.00001", 18),
    priceTick: parseUnits("0.00001", 18), minRaise: 0n,
  };
  const receipt = await send("Create demo auction", { address: house, abi: houseAbi, functionName: "createAuction", args: [p] });
  let id: bigint | undefined;
  for (const log of receipt.logs) { try { const event = decodeEventLog({ abi: houseAbi, data: log.data, topics: log.topics }); if (event.eventName === "AuctionCreated") id = (event.args as any).auctionId; } catch {} }
  if (id === undefined) throw new Error("AuctionCreated event not found");
  console.log(`\nDemo auction #${id}`);
  console.log(`Open: https://wickbid.com/auction/${id}`);
  console.log(`Commit blocks: ${p.startBlock}–${p.endBlock} (~${minutes} minutes)`);
  console.log("Keep the page open near closing time to capture the Random close step; the external crank will request VRF automatically.");
}

main().catch((error: any) => { console.error(`Demo auction failed: ${error.shortMessage ?? error.message}`); process.exit(1); });
