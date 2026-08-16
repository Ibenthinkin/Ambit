import { Sora } from "next/font/google";

// Sora is a variable font (wght 100-800). `weight` is deliberately OMITTED — for a variable font,
// next/font/google serves the single variable file and lets weight be controlled per-element in
// CSS (`font-weight: 600`), which covers the redesign's 400/500/600/700/800 usage without fetching
// a separate static instance per weight. (Same rationale as the Newsreader setup this replaced in
// Phase 5.4; see docs/PHASE5_PLAN_5.4.md.)
//
// No `axes` — Sora has no optical-size axis, so the `wght` axis next/font includes by default is
// the whole story. No `style` — the redesign uses no italics anywhere (the old serif wordmark's
// italic treatment died with Newsreader).
//
// next/font/google self-hosts the font files at build time, which satisfies the handoff README's
// "Sora via Google Fonts. Self-host in production."
export const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sora",
});
