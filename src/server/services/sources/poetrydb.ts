// The PoetryDB adapter — Phase 6.2, a *trial* source (docs/source-candidates.md's trial loop) and
// the only text-shaped one in the batch. poetrydb.org serves public-domain classic poetry over an
// unauthenticated JSON API; it is the batch's answer to "does the feed read differently when a
// tile is a poem rather than an object".
//
// **The two-step search, and why it isn't the one-step the plan expected.** The natural shape is
// `GET /lines/<keyword>` — substring search across every line of every poem, returning whole
// poems. It does not work. Probed 08-21-26 across nine keywords: `/lines/love`, `/lines/night`,
// `/lines/sea`, `/lines/rose`, `/lines/stars`, `/lines/moon`, `/lines/gods`, `/lines/flower` and
// `/lines/nightingale` **all returned HTTP 503** (a platform "Application Error" page, not JSON),
// while `/lines/ozymandias` — which matches a single poem — returned 200. The failure tracks
// result-set size, not the keyword: the same searches with the output narrowed to
// `/lines/<keyword>/title,author` return 200 and hundreds of rows (1,504 for "love"). So the
// upstream can find the poems; it just cannot serialize the full text of that many at once.
//
// Hence: discover with `/lines/<keyword>/title,author`, then fetch each poem's text individually
// with `/author,title/<author>;<title>:abs`. That is an N+1 like the Met's, for the same reason —
// it is what the API can actually do — and it is bounded by `limit`, so a quota of 15 costs 16
// requests rather than one per poem in the database.
//
// **A known, measured gap in step two.** 1 of 40 sampled poems could not be fetched back:
// PoetryDB's router splits the path on `/` before matching, so a title containing a slash
// ("Monday Night May 11th 1846 / Domestic Peace") is unreachable through the exact-lookup route
// no matter how it is encoded. Those poems are skipped, not retried and not fatal.
import { fetchJson } from "./http";
import { toLede } from "./normalize";
import type { NormalizedItem, SourceAdapter } from "./types";

const POETRYDB_API = "https://poetrydb.org";
/** No documented rate limit, and the service is visibly a small hosted app — the 503s above are
 *  what it looks like under strain. Be as gentle as the other unkeyed sources. */
const POETRYDB_DELAY_MS = 250;

/** A poem, hydrated. The line-search step returns only `title`/`author`; `lines` and `linecount`
 *  arrive from the per-poem fetch, which is why they're optional on the wire type even though
 *  search() only ever emits fully-hydrated records. */
export interface PoetryRaw {
  title: string;
  author: string;
  lines?: string[];
  linecount?: string;
}

/**
 * PoetryDB answers a no-match with a JSON **object** (`{status: 404, reason: "Not found"}`) at
 * HTTP 200, not with an empty array — so an adapter that assumed "array" would crash on a query
 * that simply found nothing. This is the shape check that keeps a legitimate empty result from
 * being read as an error (and, just as important, from being read as data).
 */
export function poetryHits(payload: unknown): PoetryRaw[] {
  return Array.isArray(payload) ? (payload as PoetryRaw[]) : [];
}

/** The exact-lookup URL for one poem. Both components are percent-encoded; `;` stays literal
 *  because it is PoetryDB's own field separator, and `:abs` asks for exact rather than substring
 *  matching on both fields. */
export function poetryPoemUrl(author: string, title: string): string {
  return (
    `${POETRYDB_API}/author,title/` +
    `${encodeURIComponent(author)};${encodeURIComponent(title)}:abs`
  );
}

/** Stable and unique in practice: PoetryDB's own exact lookup keys on exactly this pair, so if two
 *  records shared it they would be indistinguishable upstream too. Kept verbatim apart from
 *  whitespace collapsing — lowercasing or stripping punctuation would risk fusing "Sonnet I" and
 *  "Sonnet 1", and (source, sourceId) is the uniqueness constraint the whole corpus hangs off. */
export function poetrySourceId(raw: PoetryRaw): string {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  return `${clean(raw.author)}::${clean(raw.title)}`;
}

/** The poem's own opening, which is the honest lede for a poem — no synopsis exists and inventing
 *  one would be writing about the poem rather than showing it. Blank lines (PoetryDB's stanza
 *  breaks) are skipped so the summary never opens on nothing. */
function poetrySummary(raw: PoetryRaw): string {
  const opening = (raw.lines ?? [])
    .filter((l) => l.trim().length > 0)
    .slice(0, 2)
    .join(" / ");
  // The em-dash-and-author tail also guarantees the result clears the curator's 60-character
  // thin-summary floor for a two-line epigram.
  return toLede(
    opening ? `${opening} — ${raw.author}` : `${raw.title} — ${raw.author}`,
  );
}

async function search(
  query: string,
  opts?: { limit?: number },
): Promise<PoetryRaw[]> {
  const limit = opts?.limit ?? 50;

  // Step one: the line search, narrowed to title+author. Narrowing is not an optimization — it is
  // the difference between 200 and 503 (see the file header).
  const found = poetryHits(
    await fetchJson(
      `${POETRYDB_API}/lines/${encodeURIComponent(query)}/title,author`,
      { delayMs: POETRYDB_DELAY_MS },
    ),
  );

  // Step two: hydrate the first `limit` of them. PoetryDB returns no ranking — the array order is
  // arbitrary — but the rank contract in types.ts is mechanical (index = rank, feeding ingest's
  // collision rule), and an arbitrary-but-stable order satisfies it fine.
  const items: PoetryRaw[] = [];
  for (const hit of found) {
    if (items.length >= limit) break;
    if (!hit.title || !hit.author) continue;

    const poem = poetryHits(
      await fetchJson(poetryPoemUrl(hit.author, hit.title), {
        delayMs: POETRYDB_DELAY_MS,
      }),
    )[0];

    // Skipped rather than retried: the misses are titles PoetryDB's own router cannot address
    // (the slash case in the header), so a retry would fail identically.
    if (poem?.lines?.length) items.push(poem);
  }
  return items;
}

function toItem(raw: PoetryRaw): NormalizedItem {
  const lines = raw.lines ?? [];
  return {
    source: "poetrydb",
    sourceId: poetrySourceId(raw),
    type: "article",
    title: raw.title,
    summary: poetrySummary(raw),
    // The whole poem, blank lines and all — src/lib/reader-blocks.ts turns each non-blank line
    // into its own paragraph block, so stanza gaps are lost on /i/ today. Storing them anyway
    // keeps the record faithful and leaves the door open for verse handling later (a decision
    // for T7 if poetrydb is kept, not something the adapter should pre-empt).
    body: lines.join("\n"),
    // Poems have no image, and the feed's article card never reads imageUrl (verified 08-21-26,
    // components/feed/article-card.tsx) — a null here is a supported shape, not a gap.
    imageUrl: null,
    // PoetryDB has no human-facing site; this is its own exact-lookup endpoint, which is a real,
    // linkable, permanent address for exactly this poem. Plain JSON, but honest — and preferred
    // over a bare `/title/<title>` lookup, which would answer with every poem sharing the title.
    sourceUrl: poetryPoemUrl(raw.author, raw.title),
    attribution: raw.author,
    // PoetryDB's corpus is the classic public-domain canon; it publishes no per-poem rights field
    // and needs none.
    license: "Public domain",
    tags: [raw.author, "poetry"],
  };
}

export const poetrydb: SourceAdapter<PoetryRaw> = {
  source: "poetrydb",
  search,
  toItem,
};
