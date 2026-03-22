"use client";

import "./globals.css";
import { WalletProvider } from "@/components/providers/WalletProvider";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <title>BumbleBee - Autonomous Impact Funding on XRPL</title>
        <link rel="icon" href="/bumblebee.png" type="image/png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
