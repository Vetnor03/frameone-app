import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_ICON_PATH, APP_ICON_SIZE, versionedIconPath } from "./lib/iconVersion";

export const metadata: Metadata = {
  title: "Re-mind",
  description: "Re-mind controller",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: versionedIconPath(APP_ICON_PATH), sizes: APP_ICON_SIZE, type: "image/png" }],
    apple: [{ url: versionedIconPath(APP_ICON_PATH), sizes: APP_ICON_SIZE, type: "image/png" }],
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
      </body>
    </html>
  );
}
