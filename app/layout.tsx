import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { versionedIconPath } from "./lib/iconVersion";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Re-mind",
  description: "Re-mind controller",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: versionedIconPath("/favicon.ico"), sizes: "any" },
      { url: versionedIconPath("/favicon-16x16.png"), sizes: "16x16", type: "image/png" },
      { url: versionedIconPath("/favicon-32x32.png"), sizes: "32x32", type: "image/png" },
      { url: versionedIconPath("/icon-192x192.png"), sizes: "192x192", type: "image/png" },
      { url: versionedIconPath("/icon-512x512.png"), sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: versionedIconPath("/apple-touch-icon.png"), sizes: "180x180", type: "image/png" }],
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
