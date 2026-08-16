import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { versionedIconPath } from "./lib/iconVersion";
import { THEME_STORAGE_KEY } from "./lib/theme";

const themeBootstrapScript = `
  (function () {
    var theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (theme !== 'light' && theme !== 'dark') theme = 'light';
    // Login is always an unauthenticated, pre-preference surface. Do not let a
    // preference left by a previous session darken the next user's sign-in.
    if (location.pathname === '/login') theme = 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  })();
`;

export const metadata: Metadata = {
  metadataBase: new URL("https://re-mind.no"),
  title: "RE:MIND",
  description: "RE:MIND controller",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: versionedIconPath("/AppLogo.png"), type: "image/png" }],
    apple: [{ url: versionedIconPath("/AppLogo.png"), type: "image/png" }],
  },
  themeColor: "#f5f6f8",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
