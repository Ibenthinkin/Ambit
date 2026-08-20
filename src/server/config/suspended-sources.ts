import type { SourceId } from "~/server/services/sources/types";

// Sources that stay in the codebase but are switched off end to end: ingestion skips them, and the
// feed will not draw their existing rows. One list, two consumers (`scripts/ingest.ts` and
// `db/feed.ts`'s `getTopicPools`), because a source that is only half-suspended is worse than one
// that isn't suspended at all — ingestion stopping while 1,338 undrawable rows keep winning slots
// in the draw would look exactly like a feed that had quietly gone bad.
//
// This is a **suspension, not a removal**: the adapter, its tests, and every ingested row stay put,
// so lifting the flag is a one-line change and no re-ingest.
//
// ── Why each one is here ──────────────────────────────────────────────────────────────────────
//
// **aic** (Art Institute of Chicago, suspended 08-20-26) — `www.artic.edu` sits behind Cloudflare
// bot management, which 403s any image request carrying a `localhost` referer: 20/20 deterministic,
// 20/20 succeed with any other referer. Since `next dev`'s canonical origin *is* localhost:3000,
// every one of AIC's 1,338 images — 17.5% of the corpus — fails on the dev machine, and they also
// failed on-device over a tailnet referer that succeeds from the laptop (a second, still-unexplained
// cause; see `docs/HANDOFF_aic-images.md`). The tile's fallback is designed to look calm, so the
// result is a feed quietly pocked with holes that teaches you nothing while you build against it.
//
// **The fix that lifts this is 5.7's image proxy**, which gives every image one origin and makes
// the referer question moot — at which point AIC should come straight back, and the open question
// of whether the block is a dev-only artifact (both referers ever tested are dev-only) can finally
// be answered against a real production origin.
export const SUSPENDED_SOURCES: SourceId[] = ["aic"];

/** Whether `source` is currently switched off. Accepts a plain string for DB rows. */
export function isSuspendedSource(source: string): boolean {
  return (SUSPENDED_SOURCES as string[]).includes(source);
}
