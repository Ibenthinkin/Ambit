import { Newsreader } from "next/font/google";

// Newsreader is a variable font (axes: ital 0-1, opsz 6-72, wght 200-800). `weight` is
// deliberately OMITTED — for a variable font, next/font/google serves the full variable file and
// lets weight be controlled per-element in CSS (`font-weight: 600`), rather than fetching
// separate static instances per weight. This also sidesteps an unresolved question found during
// planning: whether the loader errors on an explicit weight array (e.g. ['400','500','600'])
// combined with `style: ['normal', 'italic']`, since Newsreader's italic file tops out below 600
// upstream — omitting `weight` means the question never arises (see PHASE5_PLAN.md docs
// findings).
//
// `axes: ['opsz']` opts into the optical-size axis on top of the `wght` axis next/font includes
// by default — Newsreader's design (per the handoff) leans on `opsz` across its 14-42px range,
// and it's not served unless explicitly requested.
export const newsreader = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-newsreader",
});
