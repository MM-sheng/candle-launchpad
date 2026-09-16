"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useBlockNumber, usePublicClient, useWriteContract } from "wagmi";
import { erc20Abi, parseUnits, decodeEventLog, type Address } from "viem";
import { HOUSE } from "@/lib/config";
import { houseAbi } from "@/lib/contract";
import { blocksToHuman } from "@/lib/format";

export default function CreatePage() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { data: block } = useBlockNumber({ watch: true });
  const { writeContractAsync } = useWriteContract();
  const router = useRouter();

  const [f, setF] = useState({
    token: "",
    supply: "1000",
    minPrice: "0.00001", // tBNB per whole token
    priceTick: "0.00001",
    numTicks: "10",
    startDelay: "20", // blocks from now
    commitLen: "400",
    revealLen: "400",
    minCutoffRatio: "50", // %
    penalty: "10", // %
    minRaise: "0",
    timeout: "600",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const [status, setStatus] = useState<string>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!client || !address || !block) return;
    setErr(undefined);
    setBusy(true);
    try {
      const token = f.token as Address;
      const decimals = await client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
      const priceUnit = 10n ** BigInt(decimals);
      const supply = parseUnits(f.supply, decimals);
      const p = {
        token,
        numTicks: Number(f.numTicks),
        startBlock: block + BigInt(f.startDelay),
        endBlock: block + BigInt(f.startDelay) + BigInt(f.commitLen),
        revealDurationBlocks: BigInt(f.revealLen),
        randomnessTimeoutBlocks: BigInt(f.timeout),
        minCutoffRatioBps: Math.round(Number(f.minCutoffRatio) * 100),
        unrevealedPenaltyBps: Math.round(Number(f.penalty) * 100),
        supply,
        priceUnit,
        minPrice: parseUnits(f.minPrice, 18),
        priceTick: parseUnits(f.priceTick, 18),
        minRaise: parseUnits(f.minRaise || "0", 18),
      };

      const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [address, HOUSE] });
      if (allowance < supply) {
        setStatus("Approving token…");
        const h = await writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve", args: [HOUSE, supply] });
        await client.waitForTransactionReceipt({ hash: h });
      }
      setStatus("Creating auction…");
      const hash = await writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "createAuction", args: [p] });
      const rc = await client.waitForTransactionReceipt({ hash });
      let id: bigint | undefined;
      for (const l of rc.logs) {
        try {
          const ev = decodeEventLog({ abi: houseAbi, data: l.data, topics: l.topics });
          if (ev.eventName === "AuctionCreated") id = (ev.args as any).auctionId;
        } catch {}
      }
      setStatus(`Created auction #${id}`);
      if (id !== undefined) router.push(`/auction/${id}`);
    } catch (e: any) {
      setErr(e.shortMessage ?? e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Create auction</h2>
      {!address && <div className="warn">Connect a wallet first.</div>}
      <div className="grid">
        <label>Token address (ERC-20 you hold)<input value={f.token} onChange={set("token")} placeholder="0x…" required /></label>
        <label>Supply (whole tokens)<input value={f.supply} onChange={set("supply")} required /></label>
        <label>Min price (tBNB per token)<input value={f.minPrice} onChange={set("minPrice")} required /></label>
        <label>Price tick (tBNB)<input value={f.priceTick} onChange={set("priceTick")} required /></label>
        <label>Number of ticks (1–64)<input value={f.numTicks} onChange={set("numTicks")} type="number" min={1} max={64} required /></label>
        <label>Start in (blocks) ≈ {blocksToHuman(Number(f.startDelay))}<input value={f.startDelay} onChange={set("startDelay")} type="number" min={1} /></label>
        <label>Commit window (blocks) ≈ {blocksToHuman(Number(f.commitLen))}<input value={f.commitLen} onChange={set("commitLen")} type="number" min={1} /></label>
        <label>Reveal period (blocks) ≈ {blocksToHuman(Number(f.revealLen))}<input value={f.revealLen} onChange={set("revealLen")} type="number" min={1} /></label>
        <label>Min cutoff ratio (%)<input value={f.minCutoffRatio} onChange={set("minCutoffRatio")} type="number" min={0} max={100} /></label>
        <label>Unrevealed penalty (%)<input value={f.penalty} onChange={set("penalty")} type="number" min={0} max={100} /></label>
        <label>Min raise (tBNB, 0 = none)<input value={f.minRaise} onChange={set("minRaise")} /></label>
        <label>Randomness timeout (blocks)<input value={f.timeout} onChange={set("timeout")} type="number" min={1} /></label>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        Reveal period ≥ 400 blocks is recommended on BSC testnet (public RPCs lag). The random cutoff lands in the last {100 - Number(f.minCutoffRatio)}% of the commit window.
      </p>
      <div className="row">
        <button disabled={busy || !address}>{busy ? "Working…" : "Approve & create"}</button>
        {status && <span className="muted">{status}</span>}
      </div>
      {err && <div className="err">{err}</div>}
    </form>
  );
}
