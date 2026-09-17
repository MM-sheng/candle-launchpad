"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseAbi, parseUnits, type Address } from "viem";
import { CHAIN, EXPLORER } from "@/lib/config";

export const TEST_TOKEN = (process.env.NEXT_PUBLIC_TEST_TOKEN ?? "") as Address;
const FAUCET = "https://www.bnbchain.org/en/testnet-faucet";

/** Shown on testnet only: how to get tBNB and free test tokens to try the launchpad. */
export function TestnetOnboarding({ compact = false }: { compact?: boolean }) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (CHAIN.id !== 97) return null;

  async function mint() {
    if (!address || !client || !TEST_TOKEN) return;
    setBusy(true);
    setMsg(undefined);
    try {
      const hash = await writeContractAsync({
        address: TEST_TOKEN,
        abi: parseAbi(["function mint(address to, uint256 amount)"]),
        functionName: "mint",
        args: [address, parseUnits("1000", 18)],
      });
      await client.waitForTransactionReceipt({ hash });
      setMsg("Minted 1,000 CNDL to your wallet.");
    } catch (e: any) {
      setMsg(e.shortMessage ?? e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ borderColor: "#1e3a5f" }}>
      <h2>Testnet beta — try it in 3 steps</h2>
      <ol style={{ margin: "0 0 12px 18px", lineHeight: 1.8 }}>
        <li>Connect a wallet and switch to <b>BNB Smart Chain Testnet</b> (chainId 97). RainbowKit will offer to add it.</li>
        <li>Get free tBNB for gas and bids from the <a href={FAUCET} target="_blank">official faucet</a> (0.3 tBNB is plenty).</li>
        <li>
          Want to <b>create</b> an auction? Mint free test tokens:{" "}
          <button className="secondary" disabled={!address || busy || !TEST_TOKEN} onClick={mint}>
            {busy ? "Minting…" : "Mint 1,000 test CNDL"}
          </button>
          {TEST_TOKEN && <span className="muted"> — token <a href={`${EXPLORER}/token/${TEST_TOKEN}`} target="_blank">{TEST_TOKEN.slice(0, 8)}…</a></span>}
        </li>
      </ol>
      {msg && <div className="muted">{msg}</div>}
      {!compact && (
        <p className="muted" style={{ margin: 0 }}>
          Everything here is test money. Bids need a saved secret (salt) to reveal — the site saves it in your browser and downloads a copy; keep it.
          Auctions advance automatically (a crank runs every few minutes), so after the commit window closes, wait a bit and refresh.
        </p>
      )}
    </div>
  );
}
