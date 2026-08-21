// The personal-archive adapter (SPEC §6.1) — Phase A.5. Its source is not a museum API but Ben's
// own ambit-archive service (a separate repo), which turns bare personal image files into
// described, tagged, embedded records and serves them behind a search API shaped like a museum's.
//
// **Why this is the thinnest adapter in the repo.** Every other adapter spends most of its length
// manufacturing a NormalizedItem out of a catalogue record that wasn't built for us: synthesizing
// a summary from scattered note fields, rewriting IIIF URLs, and re-checking a license the search
// filter already claimed. The archive does all of that on its own side, deliberately — "the
// archive meets Ambit's contract; Ambit does not bend" — so its /search contract (ambit-archive
// SPEC §8) already guarantees ranked order, an absolute imageUrl, summaries of at least 60
// characters, and a clean string[] of tags. toItem() is therefore a pure projection, and the two
// literals it does supply are documented below rather than derived.
//
// **It is also the first authenticated source.** Every museum API here is anonymous; this one
// takes a static `x-archive-key` header, which is why fetchJson grew an optional `headers` bag
// (see http.ts). The archive is user-blind by design — one shared key, server to server — so
// there is nothing per-reader to thread through here.
import { fetchJson } from "./http";
import type { NormalizedItem, SourceAdapter } from "./types";

/** One /search element. Mirrors ambit-archive's `ArchiveSearchItem` (its src/server.ts:121). */
export interface ArchiveRaw {
  id: string;
  contentHash: string;
  title: string;
  /** Always >= 60 chars — enforced over there at the enrichment prompt, so `thin-summary` in
   *  Ambit's structural floor should never fire for this source. Nonzero drops = contract drift. */
  summary: string;
  tags: string[];
  kind: string;
  width: number;
  height: number;
  capturedAt: string | null;
  /** Absolute already — built from the ARCHIVE's own ARCHIVE_PUBLIC_URL, not from ours. That is
   *  why Ambit needs no ARCHIVE_PUBLIC_URL of its own; we pass the value straight through. */
  imageUrl: string;
  license: "unknown";
}

/** The archive's /search clamps at 200 (its search.ts MAX_LIMIT). Clamp client-side too so the
 *  URL we build states what we will actually get back, rather than asking for more and silently
 *  being cut — the same "say what you mean" reason AIC's adapter pages explicitly. */
const ARCHIVE_MAX_LIMIT = 200;

async function search(
  query: string,
  opts?: { limit?: number },
): Promise<ArchiveRaw[]> {
  // Read process.env at call time rather than importing ~/env at module top: importing ~/env runs
  // full Zod validation (DATABASE_URL, the Better Auth pair, ...) which would fail this file's
  // unit tests under Vitest. curator.ts reads OPENROUTER_API_KEY the same way, for the same reason.
  const base = process.env.ARCHIVE_URL;
  const key = process.env.ARCHIVE_API_KEY;
  if (!base || !key) {
    // Thrown, never an empty array. A missing config that reads as "zero results" is exactly the
    // failure ingest's error accounting exists to catch (the Phase 0.2 Met-403 lesson): the run
    // would report a clean success having silently ingested nothing.
    throw new Error(
      "archive adapter not configured — set ARCHIVE_URL and ARCHIVE_API_KEY in .env",
    );
  }

  const limit = Math.min(opts?.limit ?? 50, ARCHIVE_MAX_LIMIT);
  const url =
    `${base.replace(/\/+$/, "")}/search` +
    `?q=${encodeURIComponent(query)}&limit=${limit}`;

  // A bare ranked array, not an envelope — and the order IS the contract: the archive ranks by
  // cosine similarity against the query embedding, and this array's index becomes the item's
  // search rank in ingest's collision resolution (types.ts SourceAdapter).
  return (await fetchJson(url, {
    headers: { "x-archive-key": key },
  })) as ArchiveRaw[];
}

/** Pure projection — see the header for why there is nothing to synthesize or re-check.
 *
 *  Deliberately unused raw fields: `contentHash` (the archive's own natural key; `id` is what
 *  Ambit's (source, sourceId) uniqueness hangs off), `kind` (how the image was *captured*, never
 *  a quality signal), and `width`/`height`/`capturedAt` (no NormalizedItem field wants them —
 *  Ambit's `item` table has no dimension or date columns). */
function toItem(raw: ArchiveRaw): NormalizedItem {
  return {
    source: "archive",
    sourceId: raw.id,
    type: "image",
    title: raw.title,
    summary: raw.summary,
    body: null,
    imageUrl: raw.imageUrl,
    // Same value as imageUrl, on purpose. Archive items have no landing page to link "view at
    // source" at — there is no /a/:id over there, only the public /img route — and pointing at
    // the image itself is the recorded judgment call (ambit-archive docs/SEED.md §5). If the
    // archive ever grows a per-item page, this is the line that changes.
    sourceUrl: raw.imageUrl,
    // A constant supplied here, because the archive returns no attribution field at all while
    // NormalizedItem.attribution is a required string. Every archive item shares one credit by
    // design: the corpus is Ben's own captures, of heterogeneous and largely unknown origin.
    // "Personal archive" is the honest ceiling on what can be claimed about any of them.
    attribution: "Personal archive",
    // Always the literal "unknown", and passed through rather than re-hard-coded so a future
    // wire-level change surfaces here instead of being masked. Honest by policy: identifying the
    // artwork in a photo says nothing about the rights on *this screenshot of a reproduction*.
    license: raw.license,
    // Already a clean array — the archive coalesces null to [] on its side precisely so this
    // line can't become `null.map(...)` at ingest time.
    tags: raw.tags,
  };
}

export const archive: SourceAdapter<ArchiveRaw> = {
  source: "archive",
  search,
  toItem,
};
