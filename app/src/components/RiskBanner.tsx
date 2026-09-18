"use client";
import { useEffect, useState } from "react";
import { useLanguage } from "./Language";

/** Testnet notice is dismissible; the required unaudited warning stays visible on mainnet. */
export function RiskBanner() {
  const { zh } = useLanguage();
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
          <b>{mainnet ? (zh ? "未经审计" : "Unaudited") : (zh ? "测试网公测" : "Testnet beta")}</b>
          {mainnet ? (zh ? " — 只投入你能承受损失的资金。" : " — Use only funds you can afford to lose.") : (zh ? " — 仅使用测试币。" : " — test money only.")}
        </span>
        <span className="risk-actions">
          <button className="link" onClick={() => setOpen(!open)}>{open ? (zh ? "收起" : "Less") : (zh ? "详情" : "Details")}</button>
          {!mainnet && <button className="link" onClick={() => { try { sessionStorage.setItem("wickbid:risk-ack", "1"); } catch {} setHidden(true); }}>{zh ? "关闭" : "Dismiss"} ✕</button>}
        </span>
      </div>
      {open && (
        <ul className="risk-list">
          <li>{zh ? "合约尚未经过第三方审计。" : "The contracts have not had a third-party audit."}</li>
          <li>{zh ? "任何人都能创建拍卖；发行方和代币未经平台审核，代币可能毫无价值。" : "Anyone can create an auction; issuers and tokens are not vetted. A token may be worthless."}</li>
          <li>{zh ? "出价密钥（salt）保存在本浏览器和下载文件中；丢失会导致部分押金被罚没。" : "Your bid secret (salt) lives in this browser and a downloaded file. Losing it forfeits part of the deposit."}</li>
          <li>{zh ? "若代币无法交付，付款退款可能需要等待 30 天。" : "If a token cannot be delivered, refunds of the payment may require a 30-day wait."}</li>
        </ul>
      )}
    </div>
  );
}
