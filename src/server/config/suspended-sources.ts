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
// ── History ───────────────────────────────────────────────────────────────────────────────────
//
// **aic** (Art Institute of Chicago) — suspended 08-20-26, **lifted by 5.7's image proxy**.
// `www.artic.edu` sits behind Cloudflare bot management, which 403s any image request carrying a
// `localhost` referer: 20/20 deterministic, 20/20 succeed with any other referer. Since
// `next dev`'s canonical origin *is* localhost:3000, all 1,338 AIC images — 17.5% of the corpus —
// failed on the dev machine. `/api/img/[itemId]` fetches server-side and sends no referer at all,
// which makes the question moot by construction. The second, still-unexplained cause seen on the
// phone (`docs/HANDOFF_aic-images.md` Q2) is what 5.7's device pass checks; if it survives the
// proxy, aic comes back to this list and the handoff doc gets the verdict.
export const SUSPENDED_SOURCES: SourceId[] = [];

/** Whether `source` is currently switched off. Accepts a plain string for DB rows. */
export function isSuspendedSource(source: string): boolean {
  return (SUSPENDED_SOURCES as string[]).includes(source);
}
