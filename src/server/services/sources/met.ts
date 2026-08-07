// The Met adapter (SPEC §6.1). Ported from phase0/harvest.ts's harvestMet, same shape: search()
// returns bare object IDs (an N+1 request pattern — one search, then one fetch per object, unlike
// AIC below whose search returns full records), so this is the slowest adapter of the five by
// design, not by bug.
//
// The load-bearing lesson from Phase 0 (phase0/NOTES.md): the Met's own `isPublicDomain=true`
// search filter LIES — of the first 20 "machine" hits, 14 weren't actually public domain. Every
// object's own record has to be re-checked; trusting the search filter would ingest copyrighted
// images. `isMetServable()` is that re-check, exported separately from toItem() so the ingestion
// job (Phase 3.4) can filter before paying for a curation call on something that'll be dropped.
import { fetchJson } from "./http";
import { toLede, uniqueTags } from "./normalize";
import type { NormalizedItem, SourceAdapter } from "./types";

const MET_API = "https://collectionapi.metmuseum.org/public/collection/v1";
/** ~2.5 req/s. Faster than this and the Met starts 403ing partway through a run (phase0/NOTES.md);
 *  the 403 clears after a pause, which is exactly what http.ts's retry-with-backoff absorbs. */
const MET_DELAY_MS = 400;

/** One Met object record — the API's own field names, kept as-is since toItem() is the only place
 *  that needs to know them. Fields are cataloguing metadata, not prose (Phase 0.2's finding: Met
 *  summaries are synthesized, not extracted, and are dominated by artist/date/medium unless the
 *  synthesis order deliberately leads with the subject-bearing tags — see metSummary below). */
export interface MetRaw {
  objectID: number;
  isPublicDomain: boolean;
  title: string;
  artistDisplayName?: string;
  artistDisplayBio?: string;
  objectDate?: string;
  medium?: string;
  culture?: string;
  period?: string;
  classification?: string;
  department?: string;
  objectName?: string;
  tags?: { term: string }[] | null;
  primaryImage?: string;
  primaryImageSmall?: string;
  objectURL: string;
  creditLine?: string;
}

/** The Met's search filter is not trustworthy (see file header) — every object must pass this
 *  check on its OWN record before being treated as a candidate item. */
export function isMetServable(raw: MetRaw): boolean {
  return Boolean(raw.isPublicDomain && raw.primaryImage && raw.title);
}

/** Museum objects have no prose — this synthesizes a summary from catalogue fields, in an order
 *  chosen deliberately in Phase 0 (subject-bearing tags last is a known weakness, kept because
 *  reordering was tried and didn't help — the museum text itself just doesn't lead with subject). */
function metSummary(o: MetRaw): string {
  const who = [o.artistDisplayName, o.artistDisplayBio]
    .filter(Boolean)
    .join(", ");
  const parts = [
    who || null,
    o.objectDate ?? null,
    o.medium ?? null,
    o.culture ?? null,
    o.period ?? null,
    o.classification ?? null,
    o.department ? `${o.department} collection` : null,
    (o.tags ?? [])
      .map((t) => t.term)
      .filter(Boolean)
      .join(", ") || null,
  ];
  return toLede(parts.filter(Boolean).join(". "));
}

async function search(
  query: string,
  opts?: { limit?: number },
): Promise<MetRaw[]> {
  const limit = opts?.limit ?? 50;

  const searchRes = (await fetchJson(
    `${MET_API}/search?hasImages=true&isPublicDomain=true&q=${encodeURIComponent(query)}`,
    { delayMs: MET_DELAY_MS },
  )) as { objectIDs?: number[] };
  const ids = searchRes.objectIDs ?? [];

  // Phase 0 measured 30-70% of the search's own "public domain" claims failing the per-object
  // check, so scan well past the quota — the Met's totals run into the thousands, it can afford it.
  const items: MetRaw[] = [];
  for (const id of ids.slice(0, limit * 4)) {
    if (items.length >= limit) break;
    let obj: MetRaw;
    try {
      obj = (await fetchJson(`${MET_API}/objects/${id}`, {
        delayMs: MET_DELAY_MS,
      })) as MetRaw;
    } catch {
      // Dead object IDs exist in the search index (phase0/NOTES.md found one 404 on a live run) —
      // isolate the failure per-item rather than aborting the whole search.
      continue;
    }
    if (isMetServable(obj)) items.push(obj);
  }
  return items;
}

function toItem(raw: MetRaw): NormalizedItem {
  return {
    source: "met",
    sourceId: String(raw.objectID),
    type: "image",
    title: raw.title,
    summary: metSummary(raw),
    body: null,
    // Some Met image URLs contain literal spaces (phase0/NOTES.md) — stored as-is here; the
    // curator's own fetch (Phase 3.3) tries encodeURI as a fallback when a raw fetch 400s.
    imageUrl: raw.primaryImageSmall ?? raw.primaryImage ?? null,
    sourceUrl: raw.objectURL,
    tags: uniqueTags([
      ...(raw.tags ?? []).map((t) => t.term),
      raw.department,
      raw.classification,
      raw.culture,
      raw.objectName,
    ]),
    attribution: [raw.creditLine, "The Metropolitan Museum of Art"]
      .filter(Boolean)
      .join(". "),
    license: "CC0 1.0 (public domain)",
  };
}

export const met: SourceAdapter<MetRaw> = {
  source: "met",
  search,
  toItem,
};
