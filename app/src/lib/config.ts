"use client";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { bsc, bscTestnet } from "wagmi/chains";
import { fallback, http, type Address } from "viem";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "97");
if (chainId !== 56 && chainId !== 97) throw new Error("NEXT_PUBLIC_CHAIN_ID must be 56 or 97");
export const CHAIN = chainId === 56 ? bsc : bscTestnet;
if (chainId === 56 && (!process.env.NEXT_PUBLIC_RPC_URL || !process.env.NEXT_PUBLIC_AUCTION_HOUSE)) throw new Error("Mainnet requires explicit RPC and auction house configuration");

export const HOUSE = (process.env.NEXT_PUBLIC_AUCTION_HOUSE ?? "") as Address;
/** Comma-separated list; the first healthy endpoint wins, the rest are fallbacks. */
export const RPCS = (process.env.NEXT_PUBLIC_RPC_URL ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545,https://bsc-testnet-rpc.publicnode.com,https://data-seed-prebsc-2-s1.bnbchain.org:8545")
  .split(",").map((s) => s.trim()).filter(Boolean);
export const RPC = RPCS[0];
export const EXPLORER = CHAIN.blockExplorers.default.url;

export const wagmiConfig = getDefaultConfig({
  appName: "Candle Launchpad",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "00000000000000000000000000000000",
  chains: [CHAIN],
  transports: { [CHAIN.id]: fallback(RPCS.map((u) => http(u, { retryCount: 2 })), { rank: false }) },
  ssr: true,
});
