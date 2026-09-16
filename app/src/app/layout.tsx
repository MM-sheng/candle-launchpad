import type { Metadata } from "next";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Candle Launchpad",
  description: "Commit-reveal token auction with a random cutoff and uniform clearing price (BNB testnet)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="topbar">
            <Link href="/" className="brand">🕯️ Candle Launchpad <span className="pill">BNB testnet</span></Link>
            <nav>
              <Link href="/create">Create auction</Link>
              <ConnectButton chainStatus="icon" showBalance={false} />
            </nav>
          </header>
          <main className="container">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
