"use client";
import type { Address, Hex } from "viem";

/** Locally stored bid secrets. Losing these means the bid cannot be revealed. */
export type StoredBid = {
  house: Address;
  chainId: number;
  auctionId: string;
  bidIndex: string;
  bidder: Address;
  tick: number;
  quantity: string; // base units, decimal string
  salt: Hex;
  deposit: string;
  commitTx?: Hex;
  createdAt: number;
};

const KEY = "candle:bids:v1";

function load(): StoredBid[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function listBids(house: Address, auctionId: bigint, bidder?: Address): StoredBid[] {
  return load().filter(
    (b) =>
      b.house.toLowerCase() === house.toLowerCase() &&
      b.auctionId === auctionId.toString() &&
      (!bidder || b.bidder.toLowerCase() === bidder.toLowerCase()),
  );
}

export function saveBid(b: StoredBid) {
  const all = load().filter((x) => !(x.house === b.house && x.auctionId === b.auctionId && x.bidIndex === b.bidIndex && x.bidder === b.bidder));
  all.push(b);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function randomSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" + Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("")) as Hex;
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function importBids(json: string): number {
  const arr = JSON.parse(json) as StoredBid[];
  if (!Array.isArray(arr)) throw new Error("expected an array");
  for (const b of arr) saveBid(b);
  return arr.length;
}
