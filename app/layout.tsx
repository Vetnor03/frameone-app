import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { APP_ICON_PATH, versionedIconPath } from "./lib/iconVersion";

export const metadata: Metadata = {
  title: "Re-mind",
  description: "Re-mind controller",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: versionedIconPath(APP_ICON_PATH), sizes: "512x512", type: "image/png" }],
    shortcut: [{ url: versionedIconPath(APP_ICON_PATH), type: "image/png" }],
    apple: [{ url: versionedIconPath(APP_ICON_PATH), sizes: "512x512", type: "image/png" }],
  },
  themeColor: "#061b24",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Re-mind",
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
