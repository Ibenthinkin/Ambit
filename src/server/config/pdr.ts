// The Public Domain Review as a source (sources round 2, 09-02-26; docs/HANDOFF_publicdomainreview.md
// is the probe, docs/PLAN_publicdomainreview.md the design). Plain data, no I/O — this file is
// imported by src/lib/source-label.ts, which client components render, so it must stay
// import-safe there.
//
// **Why this is not a row in blogs.ts.** BLOGS is the registry of *designated blogs*: content whose
// rights are retained by its authors and which Ambit shows only as a link card under the one
// honest BLOG_LICENSE string. PDR is a different case — a publication whose featured images are
// public domain and whose own text it licenses CC BY-SA 4.0 — so it is a walk source (no search
// API; the whole corpus is walked, docs/PHASE6_DESIGN_6.3.md §4) that is NOT a blog. Its license
// strings are built per item in services/sources/pdr.ts from each record's own rights fields;
// the two constants below are the essay cases that are the same on every row.
//
// **robots.txt:** none — 404 on 09-02-26 (and no sitemap.xml). Ben's call, recorded in the handoff
// §1: silence is permission. `assertCrawlAllowed` already treats a 404 as "no policy"; the walker
// calls it on every run like every other walk source, so a policy file appearing later is honoured
// the night it appears.
export const PDR = {
  id: "pdr",
  /** The credit line's text, and the attribution fallback when a collection names no institution. */
  label: "The Public Domain Review",
  /** Origin only — no path, no trailing slash. The walker builds every URL from it. */
  baseUrl: "https://publicdomainreview.org",
  /** Where Featured_Image_Path resolves. Also sent in every detail response as
   *  `site.siteMetadata.imageHost`; the walker prefers the live value and falls back to this. */
  imageHost: "https://pdr-assets.b-cdn.net",
  /** PDR's own reuse terms — the CC BY-SA 4.0 grant the license strings point at. */
  reusePolicyUrl: "https://publicdomainreview.org/reusing-material/",
  /** ISO date of the last human check of /robots.txt (404 — no policy). */
  robotsCheckedOn: "2026-09-02",
} as const;

/** An essay PDR publishes under CC BY-SA 4.0: the text is stored and shown in full. The
 *  historical images in an essay carry no rights labels on PDR's side, "just links to the
 *  original source" (reusing-material) — hence the second clause. */
export const PDR_ESSAY_LICENSE =
  "Text CC BY-SA 4.0 (The Public Domain Review) · images public domain";

/** An essay under "Custom License" (book excerpts, reprints) or with no label: the same posture
 *  as a designated blog — one image, PDR's own teaser, a credit and a link, never the text. */
export const PDR_CARD_LICENSE =
  "Rights retained by the author — displayed with credit and link";
