import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { versionedIconPath } from "./lib/iconVersion";

export const metadata: Metadata = {
  title: "RE:MIND",
  description: "RE:MIND controller",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: versionedIconPath("/r_Logo.png"), type: "image/png" }],
    apple: [{ url: versionedIconPath("/r_Logo.png"), type: "image/png" }],
  },
  themeColor: "#061b24",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RE:MIND",
  },
};

// 🔒 Disable zoom / scaling
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
