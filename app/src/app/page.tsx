"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePublicClient, useBlockNumber } from "wagmi";
import { parseAbiItem } from "viem";
import { HOUSE, EXPLORER } from "@/lib/config";
import { houseAbi, STATE, type Auction } from "@/lib/contract";
import { short } from "@/lib/format";
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
      <TestnetOnboarding />
      <div className="card">
        <h2>Sealed bids. Random close. One fair price.</h2>
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
        {rows && rows.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>State</th>
                <th>Issuer</th>
                <th>Commit window</th>
                <th>Ticks</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ id, a }) => (
                <tr key={id.toString()}>
                  <td>{id.toString()}</td>
                  <td>
                    <span className={`state ${STATE[a.state]}`}>{STATE[a.state]}</span>
                  </td>
                  <td>{short(a.issuer)}</td>
                  <td>
                    {a.p.startBlock.toString()} – {a.p.endBlock.toString()}
                  </td>
                  <td>{a.p.numTicks}</td>
                  <td>
                    <Link href={`/auction/${id}`}>Open →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
