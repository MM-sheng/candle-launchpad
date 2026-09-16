"use client";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { bscTestnet } from "wagmi/chains";
import { http, type Address } from "viem";

export const HOUSE = (process.env.NEXT_PUBLIC_AUCTION_HOUSE ?? "") as Address;
export const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
export const CHAIN = bscTestnet;
export const EXPLORER = "https://testnet.bscscan.com";

export const wagmiConfig = getDefaultConfig({
  appName: "Candle Launchpad",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "00000000000000000000000000000000",
  chains: [bscTestnet],
  transports: { [bscTestnet.id]: http(RPC) },
  ssr: true,
});
