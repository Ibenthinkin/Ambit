import "~/styles/globals.css";

import { SerwistProvider } from "@serwist/turbopack/react";
import { type Metadata, type Viewport } from "next";

import { SwCleanup } from "~/components/dev/sw-cleanup";
import { sora } from "~/lib/fonts";
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
  themeColor: "#161411",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `data-accent="indigo"` is the default (and, as of Phase 5.4, only) value of the app-wide
    // accent knob — see globals.css's `@layer base` for how this attribute drives `--accent-raw`,
    // and PHASE5_PLAN.md Decision 2 for why the picker itself is deferred to Phase 9.2.
    <html lang="en" data-accent="indigo" className={sora.variable}>
      {/* `bg-bg`/`text-ink` set the base surface + text color app-wide (every screen but the
          gallery, which opts into `bg-immersive` itself); `font-sans` is Sora, the redesign's one
          typeface for everything — there is no second family to switch into. Titles opt into the
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
