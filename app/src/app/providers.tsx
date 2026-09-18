"use client";
import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState } from "react";
import { wagmiConfig } from "@/lib/config";
import { LanguageProvider } from "@/components/Language";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchInterval: 4000 } } }));
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider theme={darkTheme({ accentColor: "#ebedf0", accentColorForeground: "#0b0c0f", borderRadius: "medium", fontStack: "system" })}><LanguageProvider>{children}</LanguageProvider></RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
