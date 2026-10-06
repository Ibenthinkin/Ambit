import { Geist_Mono, Hanken_Grotesk, Inter } from "next/font/google";

// Two app-wide faces (docs/DESIGN_redesign.md §3.3): Hanken Grotesk for everything readable
// (--font-sans) and Geist Mono for eyebrows, labels, counts and meta (--font-mono). Both go
// through next/font/google, which self-hosts the files at build time, so the CSP's
// `font-src 'self'` is untouched. Inter survives below for the parked landing overture alone.
//
// Hanken is static-weight here: 400 and 500 are the only weights the redesign uses (titles are
// regular weight), plus italic for secondary half-sentences and artwork titles.
export const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-hanken",
});

// Geist Mono: uppercase labels at 9.5-12 px, almost always grey. Upright only.
export const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-geist-mono",
});

// Inter, for the landing's overture only (docs/DESIGN_landing-redo.md D4). The reference is ABC
// Diatype, a commercial grotesque; Inter is the nearest face we can ship, and Hanken — the app's
// one text face — is humanist enough to read as a different idea. One static weight, latin only:
// ~25 KB of woff2, self-hosted by next/font and preloaded by the component that imports it. Not
// on <html>: this is one screen's voice, not a second app-wide font token.
export const inter = Inter({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-inter",
});
