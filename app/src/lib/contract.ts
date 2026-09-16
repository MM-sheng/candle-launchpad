import houseAbiJson from "./houseAbi.json";
import type { Abi, Address } from "viem";

export const houseAbi = houseAbiJson as Abi;

export const STATE = ["Committing", "AwaitingRandomness", "Revealing", "Finalized", "Cancelled"] as const;
export type StateName = (typeof STATE)[number];

export type AuctionParams = {
  token: Address;
  numTicks: number;
  startBlock: bigint;
  endBlock: bigint;
  revealDurationBlocks: bigint;
  randomnessTimeoutBlocks: bigint;
  minCutoffRatioBps: number;
  unrevealedPenaltyBps: number;
  supply: bigint;
  priceUnit: bigint;
  minPrice: bigint;
  priceTick: bigint;
  minRaise: bigint;
};

export type Auction = {
  p: AuctionParams;
  issuer: Address;
  state: number;
  cutoffBlock: bigint;
  clearingTick: number;
  revealEndBlock: bigint;
  revealedBids: number;
  claimedBids: number;
  randomnessRequestId: bigint;
  marginSupply: bigint;
  marginDemand: bigint;
  totalSold: bigint;
  proceedsClaimed: bigint;
  penaltiesClaimed: bigint;
  proceedsWithdrawn: bigint;
  tokensWithdrawn: bigint;
};

export type Bid = {
  bidder: Address;
  commitBlock: bigint;
  revealed: boolean;
  claimed: boolean;
  tick: number;
  commitment: `0x${string}`;
  deposit: bigint;
  quantity: bigint;
};

export const priceOfTick = (p: AuctionParams, tick: number) => p.minPrice + BigInt(tick) * p.priceTick;
/** wei owed for `qty` base units at `price` wei per priceUnit; rounds up like the contract. */
export const cost = (p: AuctionParams, qty: bigint, price: bigint) => (qty * price + p.priceUnit - 1n) / p.priceUnit;
