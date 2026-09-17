import type { Metadata } from "next";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Candle Launchpad",
  description: "Commit-reveal token auction with a random cutoff and uniform clearing price (BNB Chain)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="topbar">
            <Link href="/" className="brand">🕯️ Candle Launchpad <span className="pill">{process.env.NEXT_PUBLIC_CHAIN_ID === "56" ? "BNB mainnet" : "BNB testnet"}</span></Link>
            <nav>
              <Link href="/create">Create auction</Link>
              <ConnectButton chainStatus="icon" showBalance={false} />
            </nav>
          </header>
          <main className="container"><div className="warn" role="note"><strong>Unaudited / 未审计.</strong> These contracts have not received a third-party audit. You may lose funds. Auctions are permissionless and issuers are not vetted. Failed token delivery may require a 30-day wait before a refund can be attempted. Only participate if you understand these risks.</div>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
