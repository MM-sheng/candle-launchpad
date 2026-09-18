"use client";
import { useEffect, useState } from "react";

/** Testnet notice is dismissible; the required unaudited warning stays visible on mainnet. */
export function RiskBanner() {
  const mainnet = process.env.NEXT_PUBLIC_CHAIN_ID === "56";
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { setHidden(sessionStorage.getItem("wickbid:risk-ack") === "1"); } catch {}
  }, []);
  if (!mainnet && hidden) return null;
  return (
    <div className="risk" role="note">
      <div className="risk-row">
        <span>
          <b>{mainnet ? "Unaudited · 未审计" : "Testnet beta · 测试网"}</b>
          {mainnet ? " — Use only funds you can afford to lose." : " — test money only."}
        </span>
        <span className="risk-actions">
          <button className="link" onClick={() => setOpen(!open)}>{open ? "Less" : "Details"}</button>
          {!mainnet && <button className="link" onClick={() => { try { sessionStorage.setItem("wickbid:risk-ack", "1"); } catch {} setHidden(true); }}>Dismiss ✕</button>}
        </span>
      </div>
      {open && (
        <ul className="risk-list">
          <li>The contracts have not had a third-party audit.</li>
          <li>Anyone can create an auction; issuers and tokens are not vetted. A token may be worthless.</li>
          <li>Your bid secret (salt) lives in this browser and a downloaded file. Losing it forfeits part of the deposit.</li>
          <li>If a token cannot be delivered, refunds of the payment may require a 30-day wait.</li>
        </ul>
      )}
    </div>
  );
}
