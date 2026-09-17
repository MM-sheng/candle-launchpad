"use client";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { bscTestnet } from "wagmi/chains";
import { fallback, http, type Address } from "viem";

export const HOUSE = (process.env.NEXT_PUBLIC_AUCTION_HOUSE ?? "") as Address;
/** Comma-separated list; the first healthy endpoint wins, the rest are fallbacks. */
export const RPCS = (process.env.NEXT_PUBLIC_RPC_URL ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545,https://bsc-testnet-rpc.publicnode.com,https://data-seed-prebsc-2-s1.bnbchain.org:8545")
  .split(",").map((s) => s.trim()).filter(Boolean);
export const RPC = RPCS[0];
export const CHAIN = bscTestnet;
export const EXPLORER = "https://testnet.bscscan.com";

export const wagmiConfig = getDefaultConfig({
  appName: "Candle Launchpad",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "00000000000000000000000000000000",
  chains: [bscTestnet],
  transports: { [bscTestnet.id]: fallback(RPCS.map((u) => http(u, { retryCount: 2 })), { rank: false }) },
  ssr: true,
});
