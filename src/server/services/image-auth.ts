// Which server-side image fetches carry credentials, decided in one place.
//
// Ambit makes exactly two image requests of its own: the curator downloads each image at ingest
// (curator.ts imageAsDataUrl — the model is handed bytes, never a URL) and the image proxy fills
// its disk cache on first view (image-cache.ts fillCache; Phase 7.3). Every museum answers a bare
// GET. Loupe does not: its `/media/*` is gated on Ben's session cookie OR a static bearer
// (Loupe SPEC §12, since 2026-09-05), and the bearer is the server-to-server path. So both fetch
// sites merge whatever this function returns into their headers, and this is the only file that
// knows a token exists.
//
// Decided by SOURCE, not by URL host: a loupe item's imageUrl is minted by Loupe's own server,
// so trusting the URL is the same trust as ingesting from Loupe at all. No host allowlist.
//
// `process.env` is read at call time rather than through `~/env` — importing `~/env` runs the
// full Zod validation (DATABASE_URL, the Better Auth pair, …) and would fail this file's unit
// tests, the same reason sources/archive.ts and curator.ts read their keys the same way.
//
// When the token is unset the loupe case returns `{}` rather than throwing: the adapter's walk()
// already refuses to run without it (no loupe rows exist without config), so this path is only
// reachable for rows that pre-date a lost env var, and the upstream 401 then surfaces where every
// other fetch failure does (the curator's onImageFetchFailure tally; the proxy's 502 and
// `img:warm`'s per-host tally).

// The literal rather than `LOUPE.id` from config/loupe.ts: that file lands in Task 4 and this
// helper must stand alone before it (and image-cache.ts stays free of the sources layer).
export function imageFetchHeaders(source: string): Record<string, string> {
  if (source !== "loupe") return {};
  const token = process.env.LOUPE_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
