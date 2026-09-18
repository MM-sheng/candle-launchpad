"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePublicClient, useBlockNumber } from "wagmi";
import { HOUSE, EXPLORER } from "@/lib/config";
import { houseAbi, STATE, type Auction } from "@/lib/contract";
import { short, blocksToHuman } from "@/lib/format";
import { TestnetOnboarding } from "@/components/TestnetOnboarding";
import { useLanguage } from "@/components/Language";

type Row = { id: bigint; a: Auction };

export default function Home() {
  const { zh } = useLanguage();
  const client = usePublicClient();
  const { data: block } = useBlockNumber({ watch: true });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    if (!client || !HOUSE) return;
    let cancelled = false;
    (async () => {
      try {
        // nextAuctionId isn't exposed; walk ids until getAuction returns an empty issuer.
        const out: Row[] = [];
        for (let i = 0n; i < 200n; i++) {
          const a = (await client.readContract({ address: HOUSE, abi: houseAbi, functionName: "getAuction", args: [i] })) as Auction;
          if (a.issuer === "0x0000000000000000000000000000000000000000") break;
          out.push({ id: i, a });
        }
        if (!cancelled) setRows(out.reverse());
      } catch (e: any) {
        if (!cancelled) setErr(e.shortMessage ?? e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, block && block / 10n]);

  if (!HOUSE) return <div className="warn">Set NEXT_PUBLIC_AUCTION_HOUSE in app/.env.local</div>;

  return (
    <>
      <div className="card hero">
        <h1>{zh ? "密封出价，随机截止，统一价格。" : "Sealed bids. Random close. One fair price."}</h1>
        <p>{zh ? "用蜡烛拍卖发行代币：出价保持密封，窗口关闭后由 Chainlink VRF 选出真实截止区块，所有中标者支付相同清算价。" : "Token launches as a candle auction: bids stay sealed, Chainlink VRF picks the real closing block after the window shuts, and every winner pays the same clearing price."}</p>
      </div>
      <TestnetOnboarding />
      <div className="card">
        <h2>{zh ? "运作方式" : "How it works"}</h2>
        <p className="muted">
          {zh ? <>1. 出价人提交价格档、数量和 salt 的哈希并托管 tBNB。2. 窗口关闭后，Chainlink VRF 选出<b>随机截止区块</b>，晚于它的出价退款。3. 有效出价人揭示出价。4. 所有中标者支付<b>统一清算价</b>，未使用的押金退回。</> : <>1. Bidders <b>commit</b> a hash of (price tick, quantity, salt) and escrow tBNB. 2. After the window closes, Chainlink VRF picks a <b>random cutoff block</b> — bids committed after it are refunded. 3. Valid bidders <b>reveal</b>. 4. Everyone pays the same <b>clearing price</b>; unfilled deposits are refunded.</>}
        </p>
        <p className="muted">
          {zh ? "合约" : "Contract"}: <a href={`${EXPLORER}/address/${HOUSE}`} target="_blank">{HOUSE}</a>
        </p>
      </div>
      <div className="card">
        <h2>{zh ? "拍卖" : "Auctions"}</h2>
        {err && <div className="err">{err}</div>}
        {rows === null && !err && <div className="muted">{zh ? "加载中…" : "Loading…"}</div>}
        {rows && rows.length === 0 && <div className="muted">{zh ? <>还没有拍卖。<Link href="/create">创建一个</Link>。</> : <>No auctions yet. <Link href="/create">Create one</Link>.</>}</div>}
        {rows && rows.length > 0 && rows.map(({ id, a }) => {
          const st = STATE[a.state];
          const now = block ?? 0n;
          let when = "";
          if (st === "Committing") when = now < a.p.startBlock ? (zh ? `约 ${blocksToHuman(a.p.startBlock - now)} 后开始` : `opens in ~${blocksToHuman(a.p.startBlock - now)}`) : now <= a.p.endBlock ? (zh ? `约 ${blocksToHuman(a.p.endBlock - now)} 后关闭提交窗口` : `commit window closes in ~${blocksToHuman(a.p.endBlock - now)} (random cutoff inside)`) : (zh ? "窗口已关闭，等待随机截止" : "window closed — awaiting random close");
          else if (st === "AwaitingRandomness") when = zh ? "等待 Chainlink VRF" : "waiting for Chainlink VRF";
          else if (st === "Revealing") when = now <= a.revealEndBlock ? (zh ? `揭示截止区块 ${a.revealEndBlock}（约 ${blocksToHuman(a.revealEndBlock - now)}）` : `reveal until block ${a.revealEndBlock} (~${blocksToHuman(a.revealEndBlock - now)})`) : (zh ? "揭示已结束，等待结算" : "reveal ended — awaiting finalize");
          else if (st === "Finalized") when = zh ? `已结算 · ${a.claimedBids} 笔已领取` : `settled · ${a.claimedBids} claimed`;
          else when = zh ? "已取消 · 全额退款" : "cancelled · full refunds";
          return (
            <Link key={id.toString()} href={`/auction/${id}`} className="list-row" style={{ color: "inherit" }}>
              <span className="id">#{id.toString()}</span>
              <span>
                <span className={`state ${st}`}>{st}</span>
                <div className="meta">{when} · {a.p.numTicks} {zh ? "个价格档 · 发行方" : "ticks · issuer"} {short(a.issuer)}</div>
              </span>
              <span className="muted">→</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
