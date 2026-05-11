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
      { url: versionedIconPath("/favicon.svg"), sizes: "any", type: "image/svg+xml" },
      { url: versionedIconPath("/remind-icon.svg"), sizes: "any", type: "image/svg+xml" },
    ],
    apple: [{ url: versionedIconPath("/remind-icon.svg"), sizes: "1024x1024", type: "image/svg+xml" }],
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
