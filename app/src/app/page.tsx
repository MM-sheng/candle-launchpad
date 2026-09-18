"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePublicClient, useBlockNumber } from "wagmi";
import { HOUSE, EXPLORER } from "@/lib/config";
import { houseAbi, STATE, type Auction } from "@/lib/contract";
import { short, blocksToHuman } from "@/lib/format";
import { TestnetOnboarding } from "@/components/TestnetOnboarding";

type Row = { id: bigint; a: Auction };

export default function Home() {
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
        <h1>Sealed bids. Random close. One fair price.</h1>
        <p>Token launches as a candle auction: bids stay sealed, Chainlink VRF picks the real closing block after the window shuts, and every winner pays the same clearing price.</p>
      </div>
      <TestnetOnboarding />
      <div className="card">
        <h2>How it works</h2>
        <p className="muted">
          1. Bidders <b>commit</b> a hash of (price tick, quantity, salt) and escrow tBNB. 2. After the window closes, Chainlink VRF picks a
          <b> random cutoff block</b> — bids committed after it are refunded. 3. Valid bidders <b>reveal</b>. 4. Everyone pays the same
          <b> clearing price</b>; unfilled deposits are refunded.
        </p>
        <p className="muted">
          Contract: <a href={`${EXPLORER}/address/${HOUSE}`} target="_blank">{HOUSE}</a>
        </p>
      </div>
      <div className="card">
        <h2>Auctions</h2>
        {err && <div className="err">{err}</div>}
        {rows === null && !err && <div className="muted">Loading…</div>}
        {rows && rows.length === 0 && <div className="muted">No auctions yet. <Link href="/create">Create one</Link>.</div>}
        {rows && rows.length > 0 && rows.map(({ id, a }) => {
          const st = STATE[a.state];
          const now = block ?? 0n;
          let when = "";
          if (st === "Committing") when = now < a.p.startBlock ? `opens in ~${blocksToHuman(a.p.startBlock - now)}` : now <= a.p.endBlock ? `commit window closes in ~${blocksToHuman(a.p.endBlock - now)} (random cutoff inside)` : "window closed — awaiting random close";
          else if (st === "AwaitingRandomness") when = "waiting for Chainlink VRF";
          else if (st === "Revealing") when = now <= a.revealEndBlock ? `reveal until block ${a.revealEndBlock} (~${blocksToHuman(a.revealEndBlock - now)})` : "reveal ended — awaiting finalize";
          else if (st === "Finalized") when = `settled · ${a.claimedBids} claimed`;
          else when = "cancelled · full refunds";
          return (
            <Link key={id.toString()} href={`/auction/${id}`} className="list-row" style={{ color: "inherit" }}>
              <span className="id">#{id.toString()}</span>
              <span>
                <span className={`state ${st}`}>{st}</span>
                <div className="meta">{when} · {a.p.numTicks} ticks · issuer {short(a.issuer)}</div>
              </span>
              <span className="muted">→</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
