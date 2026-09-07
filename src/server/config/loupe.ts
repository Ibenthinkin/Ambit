// Loupe as a source (Loupe Phase 4, built 09-06-26; docs/PLAN_loupe-hookup.md). Plain data, no
// I/O — imported by src/lib/source-label.ts, which client components render, so it must stay
// import-safe there, like config/pdr.ts.
//
// **Why this is not a row in blogs.ts.** Loupe is Ben's own magazine-clipping bench (the loupe
// repo; Ambit-Admin's Ecosystem Architecture). Its material is Internet Archive scans with no open
// license — "personal use only" — which Ambit shows in full (an article's OCR text is its body)
// rather than as a link card, so the blog posture does not apply. It is the second walk source
// that is not a blog, after `pdr`.
//
// **Rights and audience.** The per-user content-pool gate the ecosystem doc planned for Loupe
// material is deferred indefinitely (Ben, 09-06-26): Ambit is invite-only and every reader is
// someone Ben knows. `item.source` is the column a future gate filters on; nothing here forecloses
// it. The license string is Loupe's own and travels through toItem() verbatim — a rights
// statement, not UI copy.
//
// **No robots check, no delay.** Those are third-party etiquette; this is a service on Ben's own
// machine that exists to be walked.
export const LOUPE = {
  id: "loupe",
  /** The credit-line eyebrow. The issue and publication are in each item's `attribution`. */
  label: "Loupe",
  /** Where `LOUPE_URL` points in dev. Loupe's own default is :3000, which Ambit must own —
   *  run it as `MEDIA_BASE_URL=http://localhost:3100/media bunx next dev -p 3100`. */
  defaultUrl: "http://localhost:3100",
  /** `/api/v1/articles` caps `limit` at 200 (Loupe SPEC §8.2). The corpus is ~135 kept
   *  articles today, so a full walk is one request. */
  pageSize: 200,
} as const;
