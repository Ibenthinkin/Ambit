// The Library of Congress adapter — Phase 6.2, a *trial* source (docs/source-candidates.md's
// trial loop), and deliberately the narrowest adapter in the repo.
//
// **Why it is scoped to named collections instead of searching all of loc.gov.** `?fo=json` on any
// /pictures/search/ URL returns clean JSON with no auth, and every result carries a ready-to-use
// full-size image on tile.loc.gov — so far, the friendliest API here. The catch, probed 08-20-26
// and re-confirmed 08-21-26: the per-result `rights` field comes back **empty on every row**. LoC
// holds a great deal of in-copyright material, so a search that can't read rights per result is a
// search that cannot be ingested safely.
//
// The way through is to only ever search inside collections the Library has blanket-cleared, and
// carry that collection's rights statement as a constant — see CLEARED_COLLECTIONS. For this
// trial there is exactly one: the John Margolies Roadside America photograph archive. The verdict
// Phase 6.2 asks Ben for is about the *pattern* as much as the collection — a Keep means the list
// grows over time, one verified rights statement at a time.
//
// **The second call this adapter deliberately does not make.** Fetching an item's own record
// (`/pictures/item/<pk>/?fo=json`) yields both `rights_information` and, occasionally, real
// curatorial prose in a `summary` field. A 10-item live sample settled it: `rights_information`
// was byte-identical across all ten (so a constant is honest and a per-item call buys nothing),
// and only 1 of 10 had any `summary` at all (so the N+1 buys a summary 90% of the time it costs a
// request). Summaries are synthesized from the search response instead.
import { fetchJson } from "./http";
import { toLede, uniqueTags } from "./normalize";
import type { NormalizedItem, SourceAdapter } from "./types";

const LOC_API = "https://www.loc.gov/pictures/search/";
/** loc.gov documents burst limits and throttles hard when crossed; be gentler than any other
 *  source here. This is a research library, not a museum API built for reuse traffic. */
const LOC_DELAY_MS = 500;
/** The `c` parameter is the page size; `sp` is the 1-based page number. Both live-verified. */
const LOC_PAGE_SIZE = 50;

/**
 * A collection the Library of Congress has blanket-cleared for reuse, and whose rights statement
 * therefore applies to every item inside it.
 *
 * `token` is the search token that scopes into the collection AND the string that must appear in
 * a result's own `collection[]` array — that second use is the belt-and-braces re-check (the
 * Phase 0.2 Met lesson: a source's search filter is never trusted on its own). Composing
 * `q=<token> <query>` was verified live to stay inside the collection across four queries, but
 * "verified across four queries" is not "guaranteed", and the guard costs nothing.
 *
 * `license` is recorded **verbatim** from the API's own `rights_information` on an item in the
 * collection — not paraphrased, and not upgraded to "public domain", which is a stronger claim
 * than the Library itself makes.
 */
interface ClearedCollection {
  token: string;
  name: string;
  license: string;
}

export const CLEARED_COLLECTIONS: ClearedCollection[] = [
  {
    token: "mrg",
    name: "John Margolies Roadside America Photograph Archive",
    // Verbatim from https://www.loc.gov/pictures/item/2017702117/?fo=json → `rights_information`,
    // read 08-21-26. 11,708 images, designated free to use and reuse by the Library in 2017.
    license: "No known restrictions on publication",
  },
];

/** One `results[]` element from /pictures/search/?fo=json. `rights` is deliberately absent from
 *  this interface: the API does return the key, but empty on every row sampled — typing it would
 *  invite a future reader to trust it. */
export interface LocRaw {
  pk: string;
  title: string;
  /** The collection tokens this item belongs to — the field the scope guard reads. */
  collection?: string[];
  creator?: string;
  created_published_date?: string;
  medium?: string;
  subjects?: string[];
  image?: { full?: string; thumb?: string; square?: string };
  links?: { item?: string; resource?: string };
}

/** The collection whose rights statement covers this item, or undefined if it belongs to none of
 *  them — which is the case the guard exists for. */
export function locCollectionOf(raw: LocRaw): ClearedCollection | undefined {
  const tokens = raw.collection ?? [];
  return CLEARED_COLLECTIONS.find((c) => tokens.includes(c.token));
}

/** Exported for the same reason isMetServable() is: ingestion filters with it before paying for a
 *  curation call. Three conditions — inside a cleared collection, has a title, has a full image. */
export function isLocServable(raw: LocRaw): boolean {
  return Boolean(locCollectionOf(raw) && raw.title?.trim() && raw.image?.full);
}

/**
 * P&P search results carry no prose at all (see the header for why the per-item call that
 * sometimes would isn't made). What they do carry is unusually descriptive for catalogue metadata:
 * Margolies titled his own slides, so the title is already a sentence about a place, and the
 * staff-added subject headings name the building type and the town.
 *
 * The collection name goes in last rather than first, so the sentence leads with what the picture
 * is of. It also guarantees the result clears the curator's 60-character thin-summary floor even
 * for a row stripped of everything else.
 */
function locSummary(raw: LocRaw, collection: ClearedCollection): string {
  const subjects = (raw.subjects ?? [])
    // Subject headings arrive in LoC's punctuated form ("Automobile service stations--1980-1990.",
    // "United States--Washington (State)--Zillah."). Splitting on the double hyphen and rejoining
    // turns a cataloguing string into something readable — the curator reads this as prose.
    .flatMap((s) => s.split("--"))
    .map((s) => s.replace(/\.$/, "").trim())
    .filter(Boolean);

  const parts = [
    raw.title,
    raw.creator ?? null,
    raw.created_published_date?.replace(/\.$/, "") ?? null,
    raw.medium ?? null,
    subjects.length ? subjects.join(", ") : null,
    collection.name,
  ];
  return toLede(parts.filter(Boolean).join(". "));
}

async function search(
  query: string,
  opts?: { limit?: number },
): Promise<LocRaw[]> {
  const limit = opts?.limit ?? 50;
  const items: LocRaw[] = [];

  // Every cleared collection is searched in turn and the results concatenated. With one entry
  // that's a no-op; with several it makes collection order the rank order, which is the honest
  // reading of "these are separate collections that happen to share a rights posture" — LoC gives
  // no cross-collection relevance score to merge on.
  for (const collection of CLEARED_COLLECTIONS) {
    for (let page = 1; page <= 5 && items.length < limit; page++) {
      const res = (await fetchJson(
        `${LOC_API}?q=${encodeURIComponent(`${collection.token} ${query}`)}` +
          `&fo=json&c=${LOC_PAGE_SIZE}&sp=${page}`,
        { delayMs: LOC_DELAY_MS },
      )) as { results?: LocRaw[] };

      const hits = res.results ?? [];
      if (hits.length === 0) break;

      for (const hit of hits) {
        if (items.length >= limit) break;
        if (isLocServable(hit)) items.push(hit);
      }
      // Short page = last page. LoC keeps answering past the end with an empty results array, but
      // stopping here saves the extra round trip on the common narrow query.
      if (hits.length < LOC_PAGE_SIZE) break;
    }
  }
  return items;
}

function toItem(raw: LocRaw): NormalizedItem {
  // toItem stays a pure happy-path mapper (types.ts) — search() has already dropped anything
  // outside a cleared collection. The fallback keeps the function total for a raw the caller
  // hand-fed it, and states the weakest true thing rather than inventing a rights claim.
  const collection = locCollectionOf(raw) ?? {
    token: "",
    name: "Library of Congress",
    license: "unknown",
  };

  return {
    source: "loc",
    // The P&P record's stable primary key, and the number its own permalink is built from.
    sourceId: raw.pk,
    type: "image",
    title: raw.title,
    summary: locSummary(raw, collection),
    body: null,
    // `image.full` is already a full-size JPEG on tile.loc.gov — no IIIF size segment to rewrite
    // and no thumbnail trap, unlike Wellcome and AIC. Nothing to do but pass it through.
    imageUrl: raw.image?.full ?? null,
    sourceUrl:
      raw.links?.item ?? `https://www.loc.gov/pictures/item/${raw.pk}/`,
    // The photographer where the record names one, then the holding institution — the same
    // "creator, then custodian" shape Wellcome's attribution uses.
    attribution: [raw.creator, "Library of Congress"]
      .filter(Boolean)
      .join(". "),
    license: collection.license,
    tags: uniqueTags([
      ...(raw.subjects ?? []).flatMap((s) =>
        s.split("--").map((part) => part.replace(/\.$/, "").trim()),
      ),
      collection.name,
    ]),
  };
}

export const loc: SourceAdapter<LocRaw> = {
  source: "loc",
  search,
  toItem,
};
