import type { Metadata } from "next";
import { Providers } from "./providers";
import { RiskBanner } from "@/components/RiskBanner";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
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
          <SiteHeader />
          <main className="container"><RiskBanner />{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
