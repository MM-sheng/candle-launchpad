"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useBlockNumber, usePublicClient, useWriteContract } from "wagmi";
import { erc20Abi, parseUnits, decodeEventLog, type Address } from "viem";
import { HOUSE } from "@/lib/config";
import { houseAbi } from "@/lib/contract";
import { blocksToHuman } from "@/lib/format";
import { TestnetOnboarding, TEST_TOKEN } from "@/components/TestnetOnboarding";
import { useLanguage } from "@/components/Language";

export default function CreatePage() {
  const { zh } = useLanguage();
  const { address } = useAccount();
  const client = usePublicClient();
  const { data: block } = useBlockNumber({ watch: true });
  const { writeContractAsync } = useWriteContract();
  const router = useRouter();

  const [f, setF] = useState({
    token: TEST_TOKEN || "",
    supply: "1000",
    minPrice: "0.00001", // tBNB per whole token
    priceTick: "0.00001",
    numTicks: "10",
    startDelay: "30", // blocks from now (wallet confirmation takes a few blocks)
    commitLen: "1300",
    revealLen: "1300",
    minCutoffRatio: "50", // %
    penalty: "10", // %
    minRaise: "0",
    timeout: "2000",
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
      const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [address, HOUSE] });
      if (allowance < supply) {
        setStatus(zh ? "正在授权代币…" : "Approving token…");
        const h = await writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve", args: [HOUSE, supply] });
        const approvalReceipt = await client.waitForTransactionReceipt({ hash: h });
        if (approvalReceipt.status !== "success") throw new Error(`Token approval reverted: ${h}`);
      }
      // Re-read the block after the approval so startBlock is still in the future.
      const nowBlock = await client.getBlockNumber({ cacheTime: 0 });
      const p = {
        token,
        numTicks: Number(f.numTicks),
        startBlock: nowBlock + BigInt(f.startDelay),
        endBlock: nowBlock + BigInt(f.startDelay) + BigInt(f.commitLen),
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

      setStatus(zh ? "正在创建拍卖…" : "Creating auction…");
      const hash = await writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "createAuction", args: [p] });
      const rc = await client.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error(`Auction creation reverted: ${hash}`);
      let id: bigint | undefined;
      for (const l of rc.logs) {
        try {
          const ev = decodeEventLog({ abi: houseAbi, data: l.data, topics: l.topics });
          if (ev.eventName === "AuctionCreated") id = (ev.args as any).auctionId;
        } catch {}
      }
      setStatus(zh ? `已创建拍卖 #${id}` : `Created auction #${id}`);
      if (id !== undefined) router.push(`/auction/${id}`);
    } catch (e: any) {
      setErr(e.shortMessage ?? e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <TestnetOnboarding compact />
    <form className="card" onSubmit={submit}>
      <h2>{zh ? "创建拍卖" : "Create auction"}</h2>
      {!address && <div className="warn">{zh ? "请先连接钱包。" : "Connect a wallet first."}</div>}
      <div className="grid">
        <label>{zh ? "代币地址（你持有的 ERC-20）" : "Token address (ERC-20 you hold)"}<input value={f.token} onChange={set("token")} placeholder="0x…" required /></label>
        <label>{zh ? "供应量（完整代币）" : "Supply (whole tokens)"}<input value={f.supply} onChange={set("supply")} required /></label>
        <label>{zh ? "最低价格（每枚代币的 tBNB）" : "Min price (tBNB per token)"}<input value={f.minPrice} onChange={set("minPrice")} required /></label>
        <label>{zh ? "价格步长（tBNB）" : "Price tick (tBNB)"}<input value={f.priceTick} onChange={set("priceTick")} required /></label>
        <label>{zh ? "价格档数量（1–64）" : "Number of ticks (1–64)"}<input value={f.numTicks} onChange={set("numTicks")} type="number" min={1} max={64} required /></label>
        <label>{zh ? "开始倒计时（区块）" : "Start in (blocks)"} ≈ {blocksToHuman(Number(f.startDelay))}<input value={f.startDelay} onChange={set("startDelay")} type="number" min={1} /></label>
        <label>{zh ? "提交窗口（区块）" : "Commit window (blocks)"} ≈ {blocksToHuman(Number(f.commitLen))}<input value={f.commitLen} onChange={set("commitLen")} type="number" min={1} /></label>
        <label>{zh ? "揭示期（区块）" : "Reveal period (blocks)"} ≈ {blocksToHuman(Number(f.revealLen))}<input value={f.revealLen} onChange={set("revealLen")} type="number" min={1} /></label>
        <label>{zh ? "最小截止比例（%）" : "Min cutoff ratio (%)"}<input value={f.minCutoffRatio} onChange={set("minCutoffRatio")} type="number" min={0} max={100} /></label>
        <label>{zh ? "未揭示罚金（%）" : "Unrevealed penalty (%)"}<input value={f.penalty} onChange={set("penalty")} type="number" min={0} max={100} /></label>
        <label>{zh ? "最低募资额（tBNB，0 表示无）" : "Min raise (tBNB, 0 = none)"}<input value={f.minRaise} onChange={set("minRaise")} /></label>
        <label>{zh ? "随机数超时（区块）" : "Randomness timeout (blocks)"}<input value={f.timeout} onChange={set("timeout")} type="number" min={1} /></label>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        {zh ? `时间按每区块约 0.45 秒估算，实际会随网络变化。请为揭示留足时间（公共 RPC 可能延迟）。随机截止点位于提交窗口后 ${100 - Number(f.minCutoffRatio)}% 的范围内。` : `Timing estimates use ~0.45 s per block; actual timing varies by network. Verify block timing and allow enough time to reveal (public RPCs may lag). The random cutoff lands in the last ${100 - Number(f.minCutoffRatio)}% of the commit window.`}
      </p>
      <div className="row">
        <button disabled={busy || !address}>{busy ? (zh ? "处理中…" : "Working…") : (zh ? "授权并创建" : "Approve & create")}</button>
        {status && <span className="muted">{status}</span>}
      </div>
      {err && <div className="err">{err}</div>}
    </form>
    </>
  );
}
