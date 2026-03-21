"use client";

import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <title>BumbleBee — Impact Funding Monitor</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
