// Loupe as a corpus-walk source (Loupe Phase 4; docs/PLAN_loupe-hookup.md; Ambit-Admin's
// Ecosystem Architecture names this the corpus-walk pattern's canonical case). Loupe is Ben's
// magazine-clipping bench — Internet Archive scans of the Whole Earth Catalog, segmented into
// articles and illustrations, triaged by hand; `GET /api/v1/articles` serves only what he KEPT,
// oldest issue first, over a keyset cursor (Loupe SPEC §8.2). Ambit walks it in full.
//
// **The thinnest walker in the repo, on purpose.** Loupe was built to meet this contract from the
// other side: every NormalizedItem field is on the wire under its own name, already plain text
// or already null. There is no rights re-check (the license is one honest constant Loupe owns),
// no image derivation (every clip has exactly one), no robots check and no politeness delay (a
// service on Ben's own machine that exists to be walked). What is left for toItem() is three
// decisions, each pinned in loupe.test.ts:
//
//   1. **Identity is position, never `id`.** Loupe re-issues article ids whenever a page is
//      corrected (delete + reinsert), so `(source, source_id)` keyed on `id` would duplicate every
//      corrected clipping. A kept clipping's stable identity is where it sits:
//      `<iaIdentifier>:<pageNumber>:<readingOrder>`. Under that key a correction upserts in place,
//      and a position that no longer exists is removed by `--prune` on a complete walk.
//   2. **Body for articles only.** A text region's OCR is its body (paragraphs, the shape
//      lib/reader-blocks.ts typesets); an illustration's caption is already its summary.
//   3. **Summary falls back to the body's lede** when Loupe's is null — the structural floor's
//      thin-summary rule reads `summary`, and an article with a body is not thin.
//
// **Auth.** Every request carries `Authorization: Bearer <LOUPE_API_TOKEN>`; a 401/403 ends the
// walk on the first response (fetchJson's noRetryOn — the requirement Loupe's own SPEC put on this
// adapter before it existed). The images behind `imageUrl` are gated the same way, and the two
// server-side image fetches attach the same token via services/image-auth.ts — without that half,
// every loupe item would curate blind and fill the proxy with 401s.
import { LOUPE } from "~/server/config/loupe";
import { fetchJson } from "./http";
import { htmlToText, toLede, uniqueTags } from "./normalize";
import type {
  CorpusWalkAdapter,
  FetchOpts,
  NormalizedItem,
  WalkPage,
} from "./types";

/** How much of a body becomes the fallback blurb. */
const LEAD_MAX = 400;

/** One item of `/api/v1/articles`, verbatim (loupe/web/server/rest/articles.ts ArticleListItem
 *  plus `readingOrder`). Every field is kept so the fixture on disk is the wire shape. */
export interface LoupeRaw {
  /** Loupe's article id — NOT stable across corrections; read for nothing but the fixture. */
  id: string;
  type: "image" | "article";
  title: string;
  summary: string | null;
  body: string | null;
  /** Absolute, under Loupe's MEDIA_BASE_URL; bearer-gated (image-auth.ts). */
  imageUrl: string;
  /** Deep link to the Internet Archive page. */
  sourceUrl: string;
  attribution: string;
  license: string;
  publication: { slug: string; title: string };
  issue: { iaIdentifier: string; title: string; date: string | null };
  pageNumber: number;
  readingOrder: number;
  regionType: string;
  confidence: number;
  corrected: boolean;
  tags: string[];
}

interface LoupeEnvelope {
  data: LoupeRaw[];
  nextCursor: string | null;
}

// ── pure helpers (the unit-test surface) ─────────────────────────────────────────────────────

/** Pure: the position key. Typed on the three fields it reads so a test can call it bare. */
export function loupeSourceId(
  raw: Pick<LoupeRaw, "pageNumber" | "readingOrder"> & {
    issue: Pick<LoupeRaw["issue"], "iaIdentifier">;
  },
): string {
  return `${raw.issue.iaIdentifier}:${raw.pageNumber}:${raw.readingOrder}`;
}

/**
 * Pure: OCR text as plain paragraphs separated by one blank line — the shape
 * src/lib/reader-blocks.ts typesets. Loupe's body is already text, but the 8.1 rule (no source
 * HTML, ever) is cheap to keep, and htmlToText also collapses the ragged whitespace hOCR leaves.
 * Returns "" for an empty body so the caller can store null without a special case.
 */
export function bodyText(s: string): string {
  return s
    .split(/\n\s*\n/)
    .map((p) => htmlToText(p))
    .filter(Boolean)
    .join("\n\n");
}

// ── the walk ─────────────────────────────────────────────────────────────────────────────────

function config(): { base: string; token: string } {
  // process.env at call time, not ~/env at module top — see sources/archive.ts for why.
  const base = (process.env.LOUPE_URL ?? "").replace(/\/+$/, "");
  const token = process.env.LOUPE_API_TOKEN;
  if (!base || !token) {
    // Thrown, never an empty page: a missing config that reads as "corpus exhausted" would let a
    // --prune run delete every loupe row as "gone" (the archive adapter's own reasoning, sharpened
    // by --prune existing now).
    throw new Error(
      `loupe adapter not configured — set LOUPE_URL (dev: ${LOUPE.defaultUrl}) and LOUPE_API_TOKEN in .env`,
    );
  }
  return { base, token };
}

/**
 * One page of Loupe's keyset walk. The cursor is Loupe's own `nextCursor` string, passed back
 * untouched (opaque, per the CorpusWalkAdapter rule). No filters are sent, so the cursor's
 * "repeat every filter on every request" caveat (Loupe SPEC §8.2) cannot bite.
 */
async function walk(
  cursor?: string,
  opts?: FetchOpts,
): Promise<WalkPage<LoupeRaw>> {
  const { base, token } = config();
  const limit = Math.max(
    1,
    Math.min(opts?.limit ?? LOUPE.pageSize, LOUPE.pageSize),
  );
  const url =
    `${base}/api/v1/articles?limit=${limit}` +
    (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
  const page = (await fetchJson(url, {
    headers: { Authorization: `Bearer ${token}` },
    noRetryOn: [401, 403],
  })) as LoupeEnvelope;
  return {
    raw: page.data,
    ...(page.nextCursor ? { next: page.nextCursor } : {}),
  };
}

/** Pure projection — see the header for the three decisions it makes. */
function toItem(raw: LoupeRaw): NormalizedItem {
  const body = raw.body ? bodyText(raw.body) : "";
  const summary = htmlToText(raw.summary ?? "") || toLede(body, LEAD_MAX);
  return {
    source: "loupe",
    sourceId: loupeSourceId(raw),
    type: raw.type,
    title: htmlToText(raw.title),
    summary,
    body: raw.type === "article" && body ? body : null,
    imageUrl: raw.imageUrl,
    sourceUrl: raw.sourceUrl,
    // Both verbatim. The license is Loupe's rights statement — a cross-service constant Ambit
    // must not re-spell (loupe/web/server/rest/articles.ts ARTICLE_LICENSE).
    attribution: raw.attribution,
    license: raw.license,
    tags: uniqueTags(raw.tags),
  };
}

export const loupe: CorpusWalkAdapter<LoupeRaw> = {
  source: "loupe",
  walk,
  toItem,
};
