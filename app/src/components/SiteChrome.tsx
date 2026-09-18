"use client";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { LanguageToggle, useLanguage } from "./Language";
import { Logo } from "./Logo";

export function SiteHeader() {
  const { zh } = useLanguage();
  return <header className="topbar">
    <Link href="/" className="brand"><Logo /> WickBid <span className="pill">{process.env.NEXT_PUBLIC_CHAIN_ID === "56" ? (zh ? "主网" : "mainnet") : (zh ? "测试网" : "testnet")}</span></Link>
    <nav><Link href="/create" className="navlink">{zh ? "创建拍卖" : <><span>Create</span><span className="hide-sm"> auction</span></>}</Link><LanguageToggle /><ConnectButton chainStatus="none" showBalance={false} accountStatus={{ smallScreen: "avatar", largeScreen: "address" }} label={zh ? "连接" : "Connect"} /></nav>
  </header>;
}

export function SiteFooter() {
  const { zh } = useLanguage();
  return <footer className="footer"><span>{zh ? "密封出价 · 随机截止 · 统一价格" : "Sealed bids. Random close. One fair price."}</span><a href="https://github.com/MM-sheng/candle-launchpad" target="_blank">{zh ? "源代码" : "Source"}</a></footer>;
}
