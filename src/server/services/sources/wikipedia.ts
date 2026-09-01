// Wikipedia adapter (SPEC §6.1). Articles, not images-first: the source's real value is prose,
// and its lead image is a bonus that comes with a licensing catch (see below). Ported from
// phase0/harvest.ts's harvestWikipedia, then extended with two things the throwaway script never
// needed: per-image license resolution, and a real full-body fetch for the `body` field.
//
// Three requests per article, not one — and each shape is a real API constraint, not a stylistic
// choice:
//   1. search()       — up to 20 titles/query, one call
//   2. detail (intro) — up to 20 pages/call (TextExtracts' exintro cap); gets summary + lead image
//                        + categories. The lead image is asked for as a **1600 px thumbnail**, never
//                        the original — see the note above `search()`.
//   3. imageinfo       — per-page license lookup, batched ~10 File titles/call (extmetadata is
//                        documented as expensive server-side — keep batches small)
//   4. detail (body)   — full-article extracts are capped at ONE page per request (unlike intro
//                        extracts), so this is the expensive step and only runs for items the
//                        caller actually keeps.
import { fetchJson } from "./http";
import { toLede, uniqueTags } from "./normalize";
import type { NormalizedItem, SourceAdapter } from "./types";

const WIKI_API = "https://en.wikipedia.org/w/api.php";

/** Search results that are navigational rather than substantive — bad feed items regardless of
 *  their extract length (a "List of..." article can easily clear the 200-char stub filter). */
export function isLowValueTitle(title: string): boolean {
  return (
    /^(List of|Index of|Outline of|Timeline of|Glossary of)\b/i.test(title) ||
    /\(disambiguation\)/i.test(title)
  );
}

/**
 * The settled decision (docs/PHASE3_PLAN.md Task 1): Wikipedia article text is CC BY-SA 4.0, but
 * each lead image carries its OWN per-file license the search/extract APIs never expose — 3.1
 * resolves it via `imageinfo&iiprop=extmetadata`'s `LicenseShortName` and only serves the image
 * when this predicate is true. An unresolvable or non-free license means the card goes text-only
 * rather than risk serving something we can't relicense.
 */
export function isFreeImageLicense(
  license: string | null | undefined,
): boolean {
  if (!license) return false;
  return /^(public domain|pd(-|\b)|no restrictions|cc0|cc[ -]by(?:[ -]sa)?\b)/i.test(
    license,
  );
}

/** What toItem() consumes — already resolved by search(): the intro-detail page object, an
 *  optionally-fetched full body, and the lead image's resolved license (null = no image, or an
 *  image whose license didn't resolve to something free). */
export interface WikipediaRaw {
  page: {
    pageid: number;
    title: string;
    extract: string;
    /** PageImages' `thumbnail` at `pithumbsize=1600`: a `/thumb/…/1920px-…` derivative for large
     *  files (Wikimedia snaps to its standard widths), or the unscaled original when the file is
     *  already narrower than that. Either way, never a multi-megabyte original. */
    thumbnail?: { source: string; width: number; height: number };
    categories?: { title: string }[];
  };
  body: string | null;
  imageLicense: string | null;
}

interface WikiSearchHit {
  pageid: number;
  title: string;
}
interface WikiDetailPage {
  pageid: number;
  title?: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  pageimage?: string;
  categories?: { title: string }[];
}

/** A WikiDetailPage that's already passed the title + extract-length check — narrows `title`
 *  and `extract` from optional to required so the mapping below doesn't need a second check. */
type KeptDetailPage = WikiDetailPage & { title: string; extract: string };

/** The shape of one `prop=imageinfo&iiprop=extmetadata` response page. */
interface WikiImageInfoPage {
  title?: string;
  imageinfo?: { extmetadata?: { LicenseShortName?: { value?: string } } }[];
}

/** Batches an array into chunks of `size` — used for both the 20-pages/call detail cap and the
 *  ~10-titles/call imageinfo batching. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * The lead-image size asked of PageImages (`pithumbsize`). Through 8.1 T7.4 this adapter asked for
 * `piprop=original` and stored the full-resolution file — one measured at 11.9 MB — which the image
 * cache (`image-cache.ts`) then shrank to ≤1600 px anyway. Wikimedia budgets `upload.wikimedia.org`
 * by *bytes*, so those originals tripped a 429 after ~450 of them and left ~846 images uncached
 * (T7.4c). Asking for exactly the cache's `MAX_EDGE` gets a `/thumb/` derivative at roughly 20×
 * fewer bytes, converted to PNG/JPEG for SVG, TIFF, PDF and WebP originals — the API does the
 * format work, which is why the T7.4c row rewrite (`scripts/rethumb-wikipedia.ts`) re-asks the
 * API rather than rewriting URLs by pattern.
 */
export const LEAD_IMAGE_WIDTH = 1600;

/**
 * The file name a Wikimedia upload URL points at — `Margins.svg` for both the original
 * `…/commons/c/c8/Margins.svg` and the derivative `…/commons/thumb/c/c8/Margins.svg/1920px-Margins.svg.png`
 * — decoded to the underscore form PageImages reports as `pageimage`. Null for anything that is
 * not an upload path. This is how T7.4c's rewrite proves a fresh thumbnail is the SAME file whose
 * license ingest resolved: a page whose lead image has changed since must keep its stored URL,
 * because the new file's license was never checked.
 */
export function leadImageFileName(url: string): string | null {
  let path: string;
  try {
    const u = new URL(url);
    if (u.host !== "upload.wikimedia.org") return null;
    path = u.pathname;
  } catch {
    return null;
  }
  const m =
    /^\/wikipedia\/[^/]+\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/.exec(
      path,
    );
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
}

async function search(
  query: string,
  opts?: { limit?: number },
): Promise<WikipediaRaw[]> {
  const limit = opts?.limit ?? 50;

  const searchRes = (await fetchJson(
    `${WIKI_API}?action=query&format=json&list=search&srnamespace=0` +
      `&srlimit=${limit + 10}&srsearch=${encodeURIComponent(query)}`,
    { delayMs: 120 },
  )) as { query?: { search?: WikiSearchHit[] } };

  const hits = (searchRes.query?.search ?? []).filter(
    (h) => !isLowValueTitle(h.title),
  );
  if (hits.length === 0) return [];

  // Detail fetch, 20 pages per call — cllimit=max is load-bearing (a smaller value is a
  // whole-query budget, not per-page, and silently starves every page after the first).
  const detailPages: KeptDetailPage[] = [];
  for (const batch of chunk(hits, 20)) {
    const ids = batch.map((h) => h.pageid);
    const detail = (await fetchJson(
      `${WIKI_API}?action=query&format=json&prop=extracts|pageimages|categories` +
        `&exintro=1&explaintext=1&piprop=thumbnail|name&pithumbsize=${LEAD_IMAGE_WIDTH}` +
        `&cllimit=max&clshow=!hidden` +
        `&pageids=${ids.join("|")}`,
      { delayMs: 120 },
    )) as { query?: { pages?: Record<string, WikiDetailPage> } };
    for (const id of ids) {
      const page = detail.query?.pages?.[String(id)];
      // Stubs make poor feed cards and noisy curator judgments — same 200-char floor phase0 used.
      if (page?.title && (page.extract ?? "").trim().length >= 200) {
        detailPages.push(page as KeptDetailPage);
      }
    }
    if (detailPages.length >= limit) break;
  }

  const kept = detailPages.slice(0, limit);

  // Resolve lead-image licenses in batches of 10 (extmetadata is documented as expensive).
  // MediaWiki normalizes File-title underscores to spaces in its RESPONSE (confirmed live,
  // 08-07-26: `pageimage: "The_Sun_in_white_light.jpg"` comes back from imageinfo as
  // `title: "File:The Sun in white light.jpg"`, with a `query.normalized` entry recording the
  // rewrite). Normalize here so the lookup map's keys match what toFileTitle() below produces.
  const toFileTitle = (name: string) => `File:${name.replace(/_/g, " ")}`;
  const fileNames = kept
    .filter((p) => p.pageimage)
    .map((p) => toFileTitle(p.pageimage!));
  const licenseByFile = new Map<string, string | null>();
  for (const batch of chunk([...new Set(fileNames)], 10)) {
    if (batch.length === 0) continue;
    const info = (await fetchJson(
      `${WIKI_API}?action=query&format=json&prop=imageinfo&iiprop=extmetadata` +
        `&titles=${batch.map(encodeURIComponent).join("|")}`,
      { delayMs: 120 },
    )) as { query?: { pages?: Record<string, WikiImageInfoPage> } };
    for (const p of Object.values(info.query?.pages ?? {})) {
      const shortName =
        p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value ?? null;
      if (p.title) licenseByFile.set(p.title, shortName);
    }
  }

  return kept.map((page) => {
    const fileTitle = page.pageimage ? toFileTitle(page.pageimage) : null;
    const rawLicense = fileTitle
      ? (licenseByFile.get(fileTitle) ?? null)
      : null;
    return {
      page,
      body: null, // fetched separately by fetchBody(), only for items the caller keeps
      imageLicense: isFreeImageLicense(rawLicense) ? rawLicense : null,
    };
  });
}

/**
 * Full-article body fetch — one page per request (whole-article extracts don't batch the way
 * intro extracts do), so this is deliberately NOT called from search(); the ingestion job calls
 * it only for items that survive the structural floor + collision resolution, to avoid paying
 * for text nobody will curate or serve.
 *
 * `exsectionformat=wiki` (not `plain`, as through 5.6) so the extract keeps its section markers —
 * `== Section ==` / `=== Subsection ===`. That is the only structure a plain-text extract can
 * carry, and it is what the reader variant of `/i/[itemId]` typesets from
 * (`src/lib/reader-blocks.ts`); without it a 50 000-character article renders as one undivided
 * slab. Rows ingested before the flip have marker-less bodies until
 * `scripts/backfill-wikipedia-bodies.ts` has been run over them.
 */
export async function fetchBody(pageId: number): Promise<string | null> {
  const res = (await fetchJson(
    `${WIKI_API}?action=query&format=json&prop=extracts&explaintext=1&exsectionformat=wiki&pageids=${pageId}`,
    { delayMs: 120 },
  )) as { query?: { pages?: Record<string, { extract?: string }> } };
  const extract = res.query?.pages?.[String(pageId)]?.extract;
  return extract ? extract.slice(0, 50_000) : null;
}

function toItem(raw: WikipediaRaw): NormalizedItem {
  const { page, body, imageLicense } = raw;
  const tags = uniqueTags(
    (page.categories ?? []).map((c) => c.title?.replace(/^Category:/, "")),
  );
  return {
    source: "wikipedia",
    sourceId: String(page.pageid),
    type: "article",
    title: page.title,
    summary: toLede(page.extract),
    body,
    imageUrl: imageLicense ? (page.thumbnail?.source ?? null) : null,
    sourceUrl: `https://en.wikipedia.org/?curid=${page.pageid}`,
    tags,
    attribution: `Wikipedia contributors, "${page.title}"`,
    license: imageLicense
      ? `CC BY-SA 4.0 (text); image: ${imageLicense}`
      : "CC BY-SA 4.0 (text)",
  };
}

export const wikipedia: SourceAdapter<WikipediaRaw> = {
  source: "wikipedia",
  search,
  toItem,
};
