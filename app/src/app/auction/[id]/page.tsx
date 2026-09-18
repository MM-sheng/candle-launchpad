"use client";
import { use, useEffect, useMemo, useState } from "react";
import { useAccount, useBlockNumber, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { erc20Abi, formatUnits, parseUnits, decodeEventLog, type Hex } from "viem";
import { HOUSE, EXPLORER, CHAIN } from "@/lib/config";
import { houseAbi, STATE, cost, priceOfTick, type Auction, type Bid } from "@/lib/contract";
import { blocksToHuman, fmtBnb, fmtTok, short } from "@/lib/format";
import { downloadJson, importBids, listBids, randomSalt, saveBid, type StoredBid } from "@/lib/salts";
import { PhaseSteps } from "@/components/PhaseSteps";
import { useLanguage } from "@/components/Language";

export default function AuctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { zh } = useLanguage();
  const { id: idStr } = use(params);
  const id = BigInt(idStr);
  const { address } = useAccount();
  const client = usePublicClient();
  const { data: block } = useBlockNumber({ watch: true });
  const { writeContractAsync } = useWriteContract();

  const { data: auction, refetch } = useReadContract({ address: HOUSE, abi: houseAbi, functionName: "getAuction", args: [id] }) as {
    data?: Auction;
    refetch: () => void;
  };
  const { data: demand } = useReadContract({ address: HOUSE, abi: houseAbi, functionName: "getDemand", args: [id] }) as { data?: bigint[] };
  const { data: bidCount } = useReadContract({ address: HOUSE, abi: houseAbi, functionName: "bidCount", args: [id] }) as { data?: bigint };
  const { data: pendingNative, refetch: refetchPending } = useReadContract({
    address: HOUSE, abi: houseAbi, functionName: "pendingNative", args: [address ?? "0x0000000000000000000000000000000000000000"], query: { enabled: !!address },
  }) as { data?: bigint; refetch: () => void };
  const token = auction?.p.token;
  const { data: decimals } = useReadContract({ address: token, abi: erc20Abi, functionName: "decimals", query: { enabled: !!token } });
  const { data: symbol } = useReadContract({ address: token, abi: erc20Abi, functionName: "symbol", query: { enabled: !!token } });
  const dec = Number(decimals ?? 18);
  const sym = (symbol as string) ?? "";

  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [local, setLocal] = useState<StoredBid[]>([]);
  const [chainBids, setChainBids] = useState<(Bid & { index: bigint })[]>([]);

  const reloadLocal = () => setLocal(address ? listBids(HOUSE, id, address, CHAIN.id) : []);
  useEffect(reloadLocal, [address, id]);

  // My on-chain bids (indexes from local storage; also scan for ones committed elsewhere).
  useEffect(() => {
    if (!client || !address || bidCount === undefined) return;
    (async () => {
      const out: (Bid & { index: bigint })[] = [];
      for (let i = 0n; i < bidCount; i++) {
        const b = (await client.readContract({ address: HOUSE, abi: houseAbi, functionName: "getBid", args: [id, i] })) as Bid;
        if (b.bidder.toLowerCase() === address.toLowerCase()) out.push({ ...b, index: i });
      }
      setChainBids(out);
    })();
  }, [client, address, id, bidCount, auction?.state, auction?.claimedBids, auction?.revealedBids]);

  async function tx(label: string, fn: () => Promise<Hex>) {
    setErr(undefined);
    setBusy(label);
    try {
      const hash = await fn();
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`${label.replace(/…$/, "")} transaction reverted: ${hash}`);
      refetch();
      refetchPending();
      return hash;
    } catch (e: any) {
      setErr(e.shortMessage ?? e.message);
    } finally {
      setBusy(undefined);
    }
  }

  if (!auction) return <div className="muted">{zh ? "加载中…" : "Loading…"}</div>;
  const a = auction;
  const p = a.p;
  const state = STATE[a.state];
  const now = block ?? 0n;
  const isIssuer = address && address.toLowerCase() === a.issuer.toLowerCase();
  const inWindow = state === "Committing" && now >= p.startBlock && now <= p.endBlock;
  const windowOver = now > p.endBlock;
  const timeoutAt = p.endBlock + p.randomnessTimeoutBlocks;
  const clearingPrice = priceOfTick(p, a.clearingTick);

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>
            Auction #{idStr} <span className={`state ${state}`} style={{ marginLeft: 12, verticalAlign: "middle" }}>{state}</span>
          </h2>
          <span className="muted">{zh ? "区块" : "block"} {now.toString()}</span>
        </div>
        <div style={{ marginTop: 16 }}><PhaseSteps a={a} now={now} /></div>
        <div className="grid">
          <KV k={zh ? "代币" : "Token"} v={<a href={`${EXPLORER}/token/${p.token}`} target="_blank">{sym || short(p.token)}</a>} />
          <KV k={zh ? "供应量" : "Supply"} v={fmtTok(p.supply, dec, sym)} />
          <KV k={zh ? "价格范围" : "Price range"} v={`${fmtBnb(p.minPrice, 8)} – ${fmtBnb(priceOfTick(p, p.numTicks - 1), 8)} / ${sym || (zh ? "代币" : "token")}`} />
          <KV k={zh ? "价格档" : "Ticks"} v={`${p.numTicks} × ${fmtBnb(p.priceTick, 8)}`} />
          <KV k={zh ? "发行方" : "Issuer"} v={short(a.issuer)} />
          <KV k={zh ? "未揭示罚金" : "Unrevealed penalty"} v={`${p.unrevealedPenaltyBps / 100}%`} />
        </div>
      </div>

      <div className="notice">
        <b>{zh ? "未经审核的项目。" : "Unverified listing."}</b> {zh ? "任何人都能创建拍卖，代币可能毫无价值。BNB 由合约提供退款路径，代币未经平台审核。" : "Anyone can create auctions here; the token may be worthless. Your BNB is refundable by contract, the token is not vetted."}{" "}
        <a href={`${EXPLORER}/token/${p.token}`} target="_blank">{zh ? "代币合约" : "Token contract"} ↗</a>
      </div>

      {pendingNative !== undefined && pendingNative > 0n && (
        <div className="card" style={{ borderColor: "var(--accent)" }}>
          <h2>You have {fmtBnb(pendingNative)} waiting</h2>
          <p className="muted">A refund or payout could not be pushed to your address (it rejected the transfer). Pull it here.</p>
          <button disabled={!!busy} onClick={() => tx("Withdrawing…", () => writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "withdrawPending", args: [] }))}>Withdraw pending BNB</button>
        </div>
      )}

      <Timeline a={a} now={now} />

      {state === "Committing" && !windowOver && (
        <BidForm a={a} id={id} dec={dec} sym={sym} disabled={!inWindow || !address} busy={busy} onSubmit={async (tick, qty, deposit) => {
          if (!address || !client) return;
          if (!window.confirm(
            `Your bid secret (salt) will be saved in this browser AND downloaded as a JSON file.\n\n` +
            `If you lose it you cannot reveal, and ${p.unrevealedPenaltyBps / 100}% of your deposit is forfeited.\n\n` +
            `Continue and keep the downloaded file safe?`,
          )) return;
          const salt = randomSalt();
          const commitment = (await client.readContract({
            address: HOUSE, abi: houseAbi, functionName: "commitmentHash", args: [id, address, tick, qty, salt],
          })) as Hex;
          const hash = await tx("Committing bid…", () =>
            writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "commitBid", args: [id, commitment], value: deposit }),
          );
          if (!hash) return;
          const rc = await client.getTransactionReceipt({ hash });
          let bidIndex = "?";
          for (const l of rc.logs) {
            try {
              const ev = decodeEventLog({ abi: houseAbi, data: l.data, topics: l.topics });
              if (ev.eventName === "BidCommitted") bidIndex = (ev.args as any).bidIndex.toString();
            } catch {}
          }
          const rec: StoredBid = {
            house: HOUSE, chainId: CHAIN.id, auctionId: idStr, bidIndex, bidder: address, tick, quantity: qty.toString(),
            salt, deposit: deposit.toString(), commitTx: hash, createdAt: Date.now(),
          };
          saveBid(rec);
          reloadLocal();
          downloadJson(`candle-bid-${idStr}-${bidIndex}.json`, [rec]);
        }} />
      )}

      {state === "Committing" && windowOver && (
        <div className="card">
          <h2>{zh ? "提交窗口已关闭" : "Commit window closed"}</h2>
          <p className="muted">{zh ? "现在任何人都能请求随机截止点，crank 通常会自动完成。" : "Anyone can now request the random cutoff. The crank normally does this automatically."}</p>
          <div className="row">
            <button disabled={!!busy} onClick={() => tx(zh ? "正在请求随机数…" : "Requesting randomness…", () => writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "requestRandomness", args: [id] }))}>{zh ? "请求随机数" : "Request randomness"}</button>
            {now > timeoutAt && (
              <button className="secondary" disabled={!!busy} onClick={() => tx("Fallback…", () => writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "settleFallback", args: [id] }))}>Settle fallback (cutoff = end)</button>
            )}
          </div>
        </div>
      )}

      {state === "AwaitingRandomness" && (
        <div className="card">
          <h2>{zh ? "等待 Chainlink VRF" : "Waiting for Chainlink VRF"}</h2>
          <p className="muted">{zh ? "请求编号" : "Request id"} <code>{a.randomnessRequestId.toString()}</code>。{zh ? "回调通常会在一分钟内到达。" : "The callback usually lands within a minute."}</p>
          {now > timeoutAt && (
            <button className="secondary" disabled={!!busy} onClick={() => tx("Fallback…", () => writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "settleFallback", args: [id] }))}>VRF never answered — settle fallback</button>
          )}
        </div>
      )}

      {state === "Revealing" && now > a.revealEndBlock && (
        <div className="card">
          <h2>{zh ? "揭示期已结束" : "Reveal period over"}</h2>
          <button disabled={!!busy} onClick={() => tx(zh ? "正在结算…" : "Finalizing…", () => writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "finalize", args: [id] }))}>{zh ? "结算" : "Finalize"}</button>
        </div>
      )}

      {(state === "Finalized" || state === "Cancelled") && (
        <div className="card">
          <h2>{zh ? "结果" : "Result"}</h2>
          {state === "Cancelled" ? (
            <p>{zh ? "拍卖已取消——所有押金均可全额退款，代币退回发行方。" : "Auction cancelled — every deposit is refundable in full, tokens return to the issuer."}</p>
          ) : (
            <div className="grid">
              <KV k={zh ? "清算价" : "Clearing price"} v={`${fmtBnb(clearingPrice, 8)} / ${sym || (zh ? "代币" : "token")} (${zh ? "价格档" : "tick"} ${a.clearingTick})`} />
              <KV k={zh ? "已售" : "Sold"} v={fmtTok(a.totalSold, dec, sym)} />
              <KV k="Marginal tick fill" v={a.marginDemand > 0n ? `${((Number(a.marginSupply) / Number(a.marginDemand)) * 100).toFixed(2)}%` : "100%"} />
              <KV k="Claimed" v={`${a.claimedBids} / ${bidCount?.toString() ?? "?"} bids`} />
            </div>
          )}
          {demand && <Histogram a={a} demand={demand} dec={dec} />}
          {isIssuer && (
            <div className="row" style={{ marginTop: 12 }}>
              <button disabled={!!busy} onClick={() => tx("Withdrawing…", () => writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "withdrawProceeds", args: [id] }))}>Withdraw proceeds (issuer)</button>
              <span className="muted">Collected so far: {fmtBnb(a.proceedsClaimed + a.penaltiesClaimed - a.proceedsWithdrawn)} pending</span>
            </div>
          )}
        </div>
      )}

      {address && (
        <MyBids a={a} id={id} dec={dec} sym={sym} local={local} chain={chainBids} busy={busy} onReveal={(b) =>
          tx("Revealing…", () => writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "revealBid", args: [id, BigInt(b.bidIndex), b.tick, BigInt(b.quantity), b.salt] }))
        } onClaim={(index) => tx("Claiming…", () => writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "claim", args: [id, index] }))}
          onRetryTokens={(index) => tx("Retrying token delivery…", () => writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "claimTokens", args: [id, index] }))}
          onRefundUndelivered={(index) => tx("Refunding payment…", () => writeContractAsync({ address: HOUSE, abi: houseAbi, functionName: "refundUndelivered", args: [id, index] }))}
          onImport={(json) => { try { importBids(json); reloadLocal(); } catch (e: any) { setErr(e.message); } }} />
      )}

      {busy && <div className="muted">{busy}</div>}
      {err && <div className="err">{err}</div>}
    </>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function Timeline({ a, now }: { a: Auction; now: bigint }) {
  const { zh } = useLanguage();
  const p = a.p;
  const state = STATE[a.state];
  const lower = p.startBlock + ((p.endBlock - p.startBlock) * BigInt(p.minCutoffRatioBps) + 9999n) / 10000n;
  return (
    <div className="card">
      <h2>{zh ? "时间线" : "Timeline"}</h2>
      <div className="grid">
        <KV k={zh ? "提交窗口" : "Commit window"} v={`${p.startBlock} → ${p.endBlock}`} />
        {state === "Committing" && now < p.startBlock && <KV k="Opens in" v={`${(p.startBlock - now).toString()} blocks ≈ ${blocksToHuman(p.startBlock - now)}`} />}
        {state === "Committing" && now >= p.startBlock && now <= p.endBlock && <KV k="Window ends in" v={`${(p.endBlock - now).toString()} blocks ≈ ${blocksToHuman(p.endBlock - now)}`} />}
        <KV k={zh ? "随机截止" : "Random cutoff"} v={a.cutoffBlock > 0n ? `${zh ? "区块" : "block"} ${a.cutoffBlock}` : <span className="warn" style={{ padding: "2px 8px" }}>{zh ? `未知——窗口关闭后从 [${lower}, ${p.endBlock}] 中抽取` : `unknown — drawn after the window from [${lower.toString()}, ${p.endBlock.toString()}]`}</span>} />
        {a.revealEndBlock > 0n && <KV k="Reveal until" v={`${a.revealEndBlock} (${now <= a.revealEndBlock ? `${(a.revealEndBlock - now).toString()} blocks left ≈ ${blocksToHuman(a.revealEndBlock - now)}` : "ended"})`} />}
      </div>
      {state === "Committing" && (
        <p className="warn" style={{ marginTop: 12 }}>
          {zh ? <>截止区块在窗口关闭<b>后</b>由 VRF 选出，晚于它的出价会退款。越早出价越稳妥。</> : <>The cutoff block is chosen by VRF <b>after</b> the window closes. Bids landing after it are refunded. Bidding early is safer.</>}
        </p>
      )}
    </div>
  );
}

function BidForm({ a, id, dec, sym, disabled, busy, onSubmit }: {
  a: Auction; id: bigint; dec: number; sym: string; disabled: boolean; busy?: string;
  onSubmit: (tick: number, qty: bigint, deposit: bigint) => Promise<void>;
}) {
  const { zh } = useLanguage();
  const p = a.p;
  const [tick, setTick] = useState(0);
  const [qty, setQty] = useState("10");
  const [extra, setExtra] = useState("0");
  const q = useMemo(() => { try { return parseUnits(qty || "0", dec); } catch { return 0n; } }, [qty, dec]);
  const minDeposit = cost(p, q, priceOfTick(p, tick));
  const deposit = minDeposit + (() => { try { return parseUnits(extra || "0", 18); } catch { return 0n; } })();
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); onSubmit(tick, q, deposit); }}>
      <h2>{zh ? "提交密封出价" : "Place a sealed bid"}</h2>
      <div className="grid">
        <label>{zh ? "价格档" : "Price tick"}
          <select value={tick} onChange={(e) => setTick(Number(e.target.value))}>
            {Array.from({ length: p.numTicks }, (_, i) => (
              <option key={i} value={i}>tick {i} — {fmtBnb(priceOfTick(p, i), 8)} / {sym || "token"}</option>
            ))}
          </select>
        </label>
        <label>{zh ? "数量" : "Quantity"} ({sym || (zh ? "代币" : "tokens")})<input value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label>{zh ? "额外押金（tBNB，可选，用于隐藏出价规模）" : "Extra deposit (tBNB, optional — hides your bid size)"}<input value={extra} onChange={(e) => setExtra(e.target.value)} /></label>
      </div>
      <p className="muted">{zh ? <>最低押金：<b>{fmtBnb(minDeposit, 8)}</b>。总托管：<b>{fmtBnb(deposit, 8)}</b>。领取时退回未使用押金；最终支付清算价。</> : <>Minimum deposit for this bid: <b>{fmtBnb(minDeposit, 8)}</b>. Total escrow: <b>{fmtBnb(deposit, 8)}</b>. Unused deposit is refunded on claim; you pay the clearing price, not your tick.</>}</p>
      <p className="warn">{zh ? <>salt 会保存在本浏览器并下载为 JSON 文件。请妥善保管；没有它就无法揭示出价，并会罚没 {p.unrevealedPenaltyBps / 100}% 的押金。</> : <>Your salt is saved in this browser <b>and</b> downloaded as a JSON file. Keep it — without it the bid can't be revealed and {p.unrevealedPenaltyBps / 100}% of the deposit is forfeited.</>}</p>
      <button disabled={disabled || !!busy || q === 0n}>{busy ?? (zh ? "提交出价" : "Commit bid")}</button>
    </form>
  );
}

function Histogram({ a, demand, dec }: { a: Auction; demand: bigint[]; dec: number }) {
  const n = a.p.numTicks;
  const max = demand.slice(0, n).reduce((m, d) => (d > m ? d : m), 0n);
  if (max === 0n) return <p className="muted">No revealed demand.</p>;
  return (
    <>
      <h3 style={{ margin: "16px 0 4px", fontSize: 14 }} className="muted">Revealed demand by tick — white filled, amber marginal</h3>
      <div className="hist" style={{ marginBottom: 24 }}>
        {Array.from({ length: n }, (_, i) => {
          const h = Number((demand[i] * 100n) / max);
          const cls = a.totalSold > 0n ? (i > a.clearingTick ? "above" : i === a.clearingTick ? "clear" : "") : "";
          return (
            <div key={i} className={`bar ${cls}`} style={{ height: `${Math.max(h, demand[i] > 0n ? 2 : 0)}%` }} title={`tick ${i}: ${formatUnits(demand[i], dec)}`}>
              <span>{i}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function MyBids({ a, id, dec, sym, local, chain, busy, onReveal, onClaim, onRetryTokens, onRefundUndelivered, onImport }: {
  a: Auction; id: bigint; dec: number; sym: string; local: StoredBid[]; chain: (Bid & { index: bigint })[]; busy?: string;
  onReveal: (b: StoredBid) => Promise<unknown>; onClaim: (index: bigint) => Promise<unknown>;
  onRetryTokens: (index: bigint) => Promise<unknown>; onRefundUndelivered: (index: bigint) => Promise<unknown>; onImport: (json: string) => void;
}) {
  const { zh } = useLanguage();
  const client = usePublicClient();
  // Claimed bids whose token transfer failed: detected via the TokenDeliveryDeferred event.
  const [undelivered, setUndelivered] = useState<Record<string, { tokens: bigint; payment: bigint }>>({});
  useEffect(() => {
    if (!client || chain.length === 0) return;
    (async () => {
      const out: typeof undelivered = {};
      for (const b of chain) {
        if (!b.claimed) continue;
        try {
          const deferred = await client.getLogs({
            address: HOUSE, fromBlock: a.revealEndBlock, toBlock: "latest",
            event: { type: "event", name: "TokenDeliveryDeferred", inputs: [
              { name: "auctionId", type: "uint256", indexed: true }, { name: "bidIndex", type: "uint256", indexed: true },
              { name: "tokens", type: "uint256", indexed: false }, { name: "payment", type: "uint256", indexed: false } ] },
            args: { auctionId: id, bidIndex: b.index },
          });
          if (deferred.length === 0) continue;
          const delivered = await client.getLogs({
            address: HOUSE, fromBlock: a.revealEndBlock, toBlock: "latest",
            event: { type: "event", name: "TokensDelivered", inputs: [
              { name: "auctionId", type: "uint256", indexed: true }, { name: "bidIndex", type: "uint256", indexed: true },
              { name: "tokens", type: "uint256", indexed: false }, { name: "payment", type: "uint256", indexed: false } ] },
            args: { auctionId: id, bidIndex: b.index },
          });
          const refunded = await client.getLogs({
            address: HOUSE, fromBlock: a.revealEndBlock, toBlock: "latest",
            event: { type: "event", name: "UndeliveredRefunded", inputs: [
              { name: "auctionId", type: "uint256", indexed: true }, { name: "bidIndex", type: "uint256", indexed: true },
              { name: "payment", type: "uint256", indexed: false } ] },
            args: { auctionId: id, bidIndex: b.index },
          });
          const settled = [...delivered, ...refunded];
          if (settled.length === 0) out[b.index.toString()] = { tokens: (deferred[0].args as any).tokens, payment: (deferred[0].args as any).payment };
        } catch {}
      }
      setUndelivered(out);
    })();
  }, [client, chain, id, a.revealEndBlock, a.claimedBids]);
  const state = STATE[a.state];
  const [previews, setPreviews] = useState<Record<string, { tokens: bigint; payment: bigint; penalty: bigint }>>({});
  useEffect(() => {
    if (!client || (state !== "Finalized" && state !== "Cancelled" && state !== "Revealing")) return;
    (async () => {
      const out: typeof previews = {};
      for (const b of chain) {
        try {
          const r = (await client.readContract({ address: HOUSE, abi: houseAbi, functionName: "previewClaim", args: [id, b.index] })) as [bigint, bigint, bigint];
          out[b.index.toString()] = { tokens: r[0], payment: r[1], penalty: r[2] };
        } catch {}
      }
      setPreviews(out);
    })();
  }, [client, chain, state, id]);

  const p = a.p;
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{zh ? "我的出价" : "My bids"}</h2>
        <div className="row">
          <button className="secondary" onClick={() => downloadJson(`candle-bids-${id}.json`, local)} disabled={local.length === 0}>{zh ? "下载 salts" : "Download salts"}</button>
          <label className="secondary" style={{ cursor: "pointer" }}>
            <span className="muted">{zh ? "导入 salts 文件" : "Import salts file"}</span>
            <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(onImport); }} />
          </label>
        </div>
      </div>
      {chain.length === 0 && <p className="muted">{zh ? "这个钱包还没有出价。" : "No bids from this wallet."}</p>}
      {chain.length > 0 && (
        <table>
          <thead><tr><th>#</th><th>{zh ? "提交" : "Committed"}</th><th>{zh ? "押金" : "Deposit"}</th><th>{zh ? "状态" : "Status"}</th><th>{zh ? "结果" : "Outcome"}</th><th></th></tr></thead>
          <tbody>
            {chain.map((b) => {
              const secret = local.find((l) => l.bidIndex === b.index.toString());
              const invalid = a.cutoffBlock > 0n && b.commitBlock > a.cutoffBlock;
              const pv = previews[b.index.toString()];
              const canReveal = state === "Revealing" && !b.revealed && !invalid && !!secret;
              const canClaim = !b.claimed && (state === "Finalized" || state === "Cancelled" || (state === "Revealing" && invalid));
              return (
                <tr key={b.index.toString()}>
                  <td>{b.index.toString()}</td>
                  <td>block {b.commitBlock.toString()} {invalid && <span className="err">(after cutoff)</span>}</td>
                  <td>{fmtBnb(b.deposit, 6)}</td>
                  <td>
                    {b.claimed ? "claimed" : b.revealed ? `revealed: tick ${b.tick}, ${fmtTok(b.quantity, dec, sym)}` : secret ? `sealed (tick ${secret.tick}, ${fmtTok(BigInt(secret.quantity), dec, sym)})` : <span className="err">sealed — no salt in this browser</span>}
                  </td>
                  <td>
                    {pv && (pv.tokens > 0n ? <span className="ok">{fmtTok(pv.tokens, dec, sym)} for {fmtBnb(pv.payment)}, refund {fmtBnb(b.deposit - pv.payment)}</span>
                      : pv.penalty > 0n ? <span className="err">unrevealed: refund {fmtBnb(b.deposit - pv.penalty)}, penalty {fmtBnb(pv.penalty)}</span>
                      : state === "Finalized" || state === "Cancelled" || invalid ? `refund ${fmtBnb(b.deposit)}` : "")}
                  </td>
                  <td>
                    {canReveal && <button disabled={!!busy} onClick={() => onReveal(secret!)}>{zh ? "揭示" : "Reveal"}</button>}
                    {canClaim && <button disabled={!!busy} onClick={() => onClaim(b.index)}>{zh ? "领取" : "Claim"}</button>}
                    {undelivered[b.index.toString()] && (
                      <div className="row">
                        <span className="err">Token delivery failed — {fmtTok(undelivered[b.index.toString()].tokens, dec, sym)} held, {fmtBnb(undelivered[b.index.toString()].payment)} parked</span>
                        <button className="secondary" disabled={!!busy} onClick={() => onRetryTokens(b.index)}>Retry delivery</button>
                        <button className="secondary" disabled={!!busy} onClick={() => onRefundUndelivered(b.index)}>Refund payment (after 30 days)</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {state === "Revealing" && chain.some((b) => !b.revealed && b.commitBlock <= a.cutoffBlock && !local.find((l) => l.bidIndex === b.index.toString())) && (
        <p className="warn" style={{ marginTop: 12 }}>Some bids have no salt stored here. Import the JSON you downloaded when committing, otherwise {p.unrevealedPenaltyBps / 100}% of that deposit is forfeited.</p>
      )}
    </div>
  );
}
