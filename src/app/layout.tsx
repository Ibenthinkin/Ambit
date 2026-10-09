import "~/styles/globals.css";

import { SerwistProvider } from "@serwist/turbopack/react";
import { type Metadata, type Viewport } from "next";
import { connection } from "next/server";

import { SwCleanup } from "~/components/dev/sw-cleanup";
import { InstallListener } from "~/components/install/install-listener";
import { UsageProvider } from "~/components/usage/usage-provider";
import { env } from "~/env";
import { geistMono, hanken } from "~/lib/fonts";
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
// viewport sizing) out separately, so both need to be exported from this file. This is a literal
// hex, not a reference to `--color-bg` (globals.css) — metadata/viewport exports run outside the
// CSS cascade and can't read a custom property — but it must be kept in sync with that token by
// hand if the background ever changes.
export const viewport: Viewport = {
  themeColor: "#0E0E0E",
};

// **Async, and that is load-bearing** (Phase 7.2). Awaiting `connection()` opts every route into
// on-demand rendering. The CSP nonce that `proxy.ts` mints per request must not be baked into static
// HTML at build time — that would be one nonce for every visitor, which is no nonce at all — and
// Next stamps the nonce onto its own scripts only when it renders per request. (This layout once
// read the nonce itself for the pre-paint accent script; that script went with the accent knob in
// redesign Task 1.3, so nothing here needs the value any more, only the dynamic rendering.)
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();

  return (
    <html lang="en" className={`${hanken.variable} ${geistMono.variable}`}>
      {/* `bg-bg`/`text-ink` set the base surface + text color app-wide (every screen but the
          gallery, which opts into `bg-immersive` itself); `font-sans` is Hanken Grotesk
          and `font-mono` Geist Mono (src/lib/fonts.ts). Titles opt into the
          brighter `text-ink-hi` per-component. */}
      <body className="bg-bg text-ink font-sans antialiased">
        {/* Registers src/app/serwist/sw.js/route.ts as the page's service worker on mount —
            without this, the SW is compiled and servable but no browser ever installs it.
            **Production only.** A precaching service worker in front of a dev server is a trap:
            chunk URLs change on every rebuild, so a device that loaded the app earlier keeps being
            served stale JS from the SW cache. The page renders (HTML and CSS are fine) but the
            hydration bundle doesn't match, so nothing responds to a tap — with no error in the
            terminal and none in the console. That failure mode ate an hour of 5.5's on-device pass.
            `SwCleanup` handles the other half: devices that already installed one. */}
        {/* Renders nothing — it just starts listening for the browser's install events, which fire
            once and early and are lost if nothing is listening at that moment. It sits outside the
            production branch on purpose: the install *flow* has nothing to do with the service
            worker, and a reader testing on a dev build should still see it behave. */}
        <InstallListener />
        {/* The after-beta off switch: unset NEXT_PUBLIC_USAGE_ENABLED and redeploy. */}
        {env.NEXT_PUBLIC_USAGE_ENABLED === "1" ? <UsageProvider /> : null}
        {process.env.NODE_ENV === "production" ? (
          <SerwistProvider swUrl="/serwist/sw.js">
            <TRPCReactProvider>{children}</TRPCReactProvider>
          </SerwistProvider>
        ) : (
          <>
            <SwCleanup />
            <TRPCReactProvider>{children}</TRPCReactProvider>
          </>
        )}
      </body>
    </html>
  );
}
