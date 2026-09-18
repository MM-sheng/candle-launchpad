import type { Metadata } from "next";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Providers } from "./providers";
import { RiskBanner } from "@/components/RiskBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "WickBid",
  description: "Sealed bids. Random close. One fair price. Candle-auction token launches on BNB Chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="topbar">
            <Link href="/" className="brand">
              <span className="logo">🕯️</span> WickBid
              <span className="pill">{process.env.NEXT_PUBLIC_CHAIN_ID === "56" ? "mainnet" : "testnet"}</span>
            </Link>
            <nav>
              <Link href="/create" className="navlink">Create<span className="hide-sm"> auction</span></Link>
              <ConnectButton chainStatus="none" showBalance={false} accountStatus={{ smallScreen: "avatar", largeScreen: "address" }} label="Connect" />
            </nav>
          </header>
          <main className="container"><RiskBanner />{children}</main>
          <footer className="footer">
            <span>WickBid — Sealed bids. Random close. One fair price.</span>
            <a href="https://github.com/MM-sheng/candle-launchpad" target="_blank">Source</a>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
