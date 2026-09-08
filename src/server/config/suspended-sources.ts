import type { SourceId } from "~/server/services/sources/types";

// Sources that stay in the codebase but are switched off end to end: ingestion skips them, and the
// feed will not draw their existing rows. One list, several consumers (`scripts/ingest.ts`,
// `db/feed.ts`'s `getTopicPools`, `db/items.ts`'s `drawFromTopic`), because a source that is only
// half-suspended is worse than one that isn't suspended at all — ingestion stopping while 1,338
// undrawable rows keep winning slots in the draw would look exactly like a feed that had quietly
// gone bad.
//
// This is a **suspension, not a removal**: the adapter, its tests, and every ingested row stay put,
// so lifting the flag is a one-line change and no re-ingest. The machinery is kept warm on purpose
// — the next source that goes bad will go bad the same way.
//
// ── Why each one is here ──────────────────────────────────────────────────────────────────────
//
// **aic** (Art Institute of Chicago, suspended 08-20-26) — 1,338 images, 17.5% of the corpus, none
// of which load.
//
// The original diagnosis was a referer rule: `www.artic.edu` 403'd any image request carrying a
// `localhost` referer (20/20 deterministic; 20/20 succeeded with any other referer), and since
// `next dev`'s canonical origin *is* localhost:3000, every AIC image failed on the dev machine.
// 5.7's image proxy was built to settle that by construction — a server-side fetch sends no
// referer at all — and it does exactly what it was meant to.
//
// **It isn't enough, and the reason is worth knowing.** Re-measured at the end of 5.7 (08-20-26
// evening): `www.artic.edu` returns `403` with `cf-mitigated: challenge` and a "Just a moment..."
// body to *every* request from this network — the IIIF image URLs, the plain homepage, browser
// user-agent, no referer, nothing left to object to. That is a Cloudflare **interactive JS
// challenge**, not the referer rule, and a server-side fetch can never satisfy one: there is no
// header to send. Meanwhile `api.artic.edu` is unaffected and still returns 200, so ingestion would
// happily keep adding rows nobody can see — precisely the half-suspended state this file exists to
// prevent. Whether the escalation is permanent or a per-IP reaction to the day's probing is
// unknown; it is one line to reverse once `curl https://www.artic.edu/` returns 200 again.
//
// Both measurements, in full: `docs/HANDOFF_aic-images.md` (§2.2 and its postscript).
//
// **mossandfog** (Moss & Fog, **parked** 09-01-26 — not broken). A walk source has no seed cells
// to withhold, which is how `poetrydb` was parked, so this list is the only switch that keeps a
// registered walker out of the nightly full ingest. Ben's Park verdict on the trial sample: the
// newest 150 curated at 6.60 avg, 41% ≥ 8, a cluster of 36 at score 4, and an advertorial tail
// (tyre shops, artificial turf) that the curator refuses at 1–2 — sound adapter, soft corpus.
// The adapter, fixtures and tests stay; no rows were ever written. Un-parking is removing it
// from this list (docs/source-candidates.md has the sample).
//
// **streetartnews** (StreetArtNews, **parked** 09-02-26 — not broken, and not a quality verdict).
// The trial sample is *strong*: 150 curated at 7.81 avg, 71% ≥ 8, 0 floored — level with
// thingsorganizedneatly, which was kept. It is parked on **sequencing**, and the reason is
// specific enough to be worth writing down, because a future session will otherwise read the
// sample and wonder why it was not kept.
//
// Two numbers. (1) **Topic capture.** 9,509 posts scale the sample's homed items to roughly
// +1,394 mythology, +1,204 architecture, +824 typography — which would put this one blog at 43%
// of mythology and, with thisiscolossal, the two contemporary-art blogs at ~75% of it. "Mythology"
// would stop meaning classical art and start meaning murals, for every reader who picked it at
// onboarding; the feed draws topic-first and has no per-source cap inside a topic. (2) **It would
// write the vocabulary Cut 2 is about to read.** Since Cut 1, off-topic posts are stored un-homed
// rather than dropped, so a full walk adds ~4,120 un-homed rows — more than the entire un-homed
// population at the time (3,555) — and its `street art` tag alone would scale to ~1,500, making
// "street art" the top topic proposal on the strength of a single source. thisiscolossal's
// independent `street art 184` corroborates the cluster; the magnitude would not be independent.
//
// So: revisit **after Cut 2** has decided whether `street art` becomes a topic. If it does, this
// source stops being a topic-capture risk and becomes the obvious way to fill it. Un-parking is
// removing it from this list; a bounded first walk (`--quota`) is the middle option, at the cost
// of `--prune` (a quota makes a walk incomplete). Nothing was ever written for it.
// **Sources round 3, 09-05-26 — nine Tumblr blogs, all parked, for two different reasons.**
// The distinction matters when reading this list: four of them are parked because Ben looked at
// their sample and said so, and five are parked because nobody has ruled on them yet. Neither
// group is walked by the nightly ingest — that is what this list does — but only the second
// group is still an open question.
//
// **Parked by Ben's verdict, 09-05-26.** Sampled, judged, and not wanted for now. Un-parking any
// of these is a reversal of a decision, not the completion of one:
//   nemfrog             91% of offered stored · avg 8.15 · 87% ≥8 · ~41,000 rows
//   humanoidhistory     56% · avg 8.29 · 82% ≥8 · ~27,100 rows
//   dreamsrecurring     38% · avg 8.72 · 96% ≥8 · ~7,800 rows · but only 0.2 tags/post
//   vintagegeekculture  33% · avg 7.44 · 56% ≥8 · ~6,200 rows · the weakest scores of the nine
// Recorded as arithmetic rather than as anyone's reasoning: these four are ~82,100 of the
// round's ~125,700 estimated rows, so parking them removes about **two thirds** of what round 3
// would have added to a 21,892-item corpus. nemfrog and humanoidhistory are also its two largest
// single contributors.
//
// **KEPT 09-06-26 — the other four, and what the numbers above were actually measuring.**
// Ben kept `70sscifiart`, `sovietpostcards`, `thevaultoftheatomicspaceage` and
// `thisisnthappiness`. The "% stored" figures in the parked list above were the **floor's**
// verdict on their captions, not the blogs': structuralFloor dropped any item with a summary
// under 60 characters, a rule written for museum catalogue rows, and these are picture blogs
// whose caption medians run 0-70 chars. docs/PLAN_caption-less-and-wild.md lifted that rule for
// walk images and put the whole quality bar on the curator, which sees the picture. Re-sampled
// the same day, at 150 items each, with the same warm cache and the 99-topic classifier:
//
//                                 old →  new stored · avg  · ≥8   · un-homed
//   70sscifiart                    55% → 100%        · 8.49 · 94%  · 3%
//   sovietpostcards                44% → 100%        · 7.63 · 61%  · 0%   (95 of 99 topics)
//   thevaultoftheatomicspaceage     8% → 100%        · 8.45 · 91%  · 0%
//   thisisnthappiness               7% → 100%        · 8.11 · 87%  · 0%
//
// Each carries a `walkQuota` in blogs.ts — Ben's budget, the newest half or quarter of the
// archive — so un-parking one cannot walk it whole, and the rest is a `--cursor` run later.
// **`sovietpostcards` is walked and no longer suspended; the other three are quota'd and stay
// here until their walk's turn** (one blog at a time, with a readout between, is the plan's rule).
//
// Numbers for the parked four are from `bun run stats:walk <id> --quota 150` (09-05-26), which
// writes nothing to the DB; its curation cache is warm for all nine, so re-running any of them is
// free. The full table is docs/HANDOFF_tumblr-round3.md §2.
export const SUSPENDED_SOURCES: SourceId[] = [
  "aic",
  "mossandfog",
  "streetartnews",
  // Round 3, parked by Ben's verdict (09-05-26; toiich 09-06-26, after the live probe in
  // docs/PLAN_caption-less-and-wild.md showed it two pictures a post with film-title captions —
  // Ben's call, on taste, not on the numbers):
  "nemfrog",
  "humanoidhistory",
  "dreamsrecurring",
  "vintagegeekculture",
  "toiich",
  // Round 3, KEPT 09-06-26 and quota'd, awaiting their walk. That plan shipped, so the floor no
  // longer drops their captions and each has a `walkQuota` in blogs.ts; what keeps them here is
  // sequencing, not doubt — the blogs are walked ONE AT A TIME with a readout between, because a
  // walk is the only place a topic-capture problem shows up (see `streetartnews` above), and
  // because between them they are ~72,000 items and ~11 GB of image cache on a self-hosted VM.
  // `sovietpostcards` went first and is gone from this list; `70sscifiart` second and
  // `thevaultoftheatomicspaceage` third (both 09-07-26 — the second walk is what turned up the
  // missing `science-fiction` topic, promoted before the third so the vault's atomic-age
  // material classifies against it from its first row rather than after a repair);
  // `thisisnthappiness` fourth and last (09-08-26, walk 4, after the vault landed clean under
  // the curator's new fail-fast). All four are walked; this block is history.
];

/** Whether `source` is currently switched off. Accepts a plain string for DB rows. */
export function isSuspendedSource(source: string): boolean {
  return (SUSPENDED_SOURCES as string[]).includes(source);
}
