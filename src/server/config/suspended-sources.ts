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
export const SUSPENDED_SOURCES: SourceId[] = ["aic", "mossandfog"];

/** Whether `source` is currently switched off. Accepts a plain string for DB rows. */
export function isSuspendedSource(source: string): boolean {
  return (SUSPENDED_SOURCES as string[]).includes(source);
}
