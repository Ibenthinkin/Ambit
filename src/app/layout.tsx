import "~/styles/globals.css";

import { SerwistProvider } from "@serwist/turbopack/react";
import { type Metadata, type Viewport } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Ambit",
  description: "A calm, non-social anti-doomscroll feed.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  // The web app manifest (src/app/manifest.ts) covers Android/desktop install metadata; iOS
  // Safari doesn't read manifest.json for its "Add to Home Screen" flow at all, so it needs this
  // separate `appleWebApp` block to know the app is installable and how to present it.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ambit",
  },
};

// `next`'s `viewport` export is a distinct API from `metadata` — `themeColor` used to live under
// `metadata` but Next split anything that can affect the browser chrome's paint (theme color,
// viewport sizing) out separately, so both need to be exported from this file.
export const viewport: Viewport = {
  themeColor: "#161411",
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        {/* Registers src/app/serwist/sw.js/route.ts as the page's service worker on mount —
            without this, the SW is compiled and servable but no browser ever installs it. */}
        <SerwistProvider swUrl="/serwist/sw.js">
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
