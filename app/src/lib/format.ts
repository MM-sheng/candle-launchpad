import { formatUnits } from "viem";

export const fmtBnb = (wei: bigint, digits = 6) => trim(formatUnits(wei, 18), digits) + " tBNB";
export const fmtTok = (units: bigint, decimals: number, symbol = "", digits = 4) =>
  trim(formatUnits(units, decimals), digits) + (symbol ? " " + symbol : "");

function trim(s: string, digits: number) {
  if (!s.includes(".")) return s;
  const [i, f] = s.split(".");
  const ff = f.slice(0, digits).replace(/0+$/, "");
  return ff ? `${i}.${ff}` : i;
}

/** BSC testnet after the Maxwell/Fermi upgrades: ~0.45 s per block (measured 2026-09). */
export const BLOCK_SECONDS = 0.45;
export function blocksToHuman(n: bigint | number): string {
  const s = Math.max(0, Number(n)) * BLOCK_SECONDS;
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

export const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
