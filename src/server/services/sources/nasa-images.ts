// The NASA Image & Video Library adapter — Phase 6.2, a *trial* source (docs/source-candidates.md's
// trial loop). Deliberately chosen over APOD, which the pre-correction BUILD_PLAN named: APOD is
// one image a day behind a keyed API, this is the whole NASA media catalogue with no auth at all.
//
// **The trial question here is licensing, not shape.** NASA-originated media is public domain, and
// the API is the easiest of the four to consume — but a live survey of 600 items across six
// queries (08-21-26) found **no rights field of any kind**: not on the item, not on the asset
// links, nowhere. There is nothing to filter on and nothing to re-check, which is a materially
// different posture from Smithsonian's honest CC0 flag or LoC's cleared collections.
//
// What the survey did find is a credit trail. 172 of 600 items carried `secondary_creator` and 291
// carried `photographer`, and essentially all of those values are NASA and its research partners
// ("NASA/JPL-Caltech", "NASA/JPL/University of Arizona", the ASTER science team). Two of 600 named
// something else entirely — a sky survey and an individual person. So: the license string this
// adapter records is `"Public domain (NASA)"`, scoped honestly by that word "NASA" and by the
// attribution line, which reproduces NASA's own credit verbatim rather than flattening every item
// to a bare agency name. Whether that is good enough is exactly what Ben's T6 verdict decides — a
// Park on license muddiness is a legitimate outcome and the evidence for it is recorded, not hidden.
//
// **No image URL rewrite.** Unlike Wellcome (IIIF size segment) or Smithsonian (a `max` parameter),
// every item here ships its renditions as explicit `links[]` entries with widths attached, so the
// adapter picks from the ladder the API already published instead of guessing at a URL shape.
import { fetchJson } from "./http";
import { decodeEntities, stripHtml, toLede, uniqueTags } from "./normalize";
import type { NormalizedItem, SourceAdapter } from "./types";

const NASA_API = "https://images-api.nasa.gov/search";
/** No documented rate limit and no key; 250ms matches the other unkeyed sources here. */
const NASA_DELAY_MS = 250;

/**
 * Rendition preference, best-fit-first. `~medium` is ~1280px / 160KB — the right size for a feed
 * hero — and `~orig` is last because it is the raw asset (2800px / 490KB on one sampled image,
 * and far larger on others). Coverage across the 600-item survey: orig 600, thumb 599, small 561,
 * medium 486, large 439 — so `orig` earns its place at the bottom of the ladder as the only
 * rendition that is always there.
 */
const RENDITION_ORDER = ["medium", "large", "small", "thumb", "orig"] as const;

/** One `collection.items[]` element. `data` is an array in the wire format but only ever carries
 *  one entry for an image asset; `links` holds the renditions plus (sometimes) a captions file. */
export interface NasaRaw {
  href?: string;
  data?: {
    nasa_id?: string;
    title?: string;
    description?: string;
    description_508?: string;
    keywords?: string[];
    date_created?: string;
    center?: string;
    /** NASA's own credit line where one exists ("NASA/JPL-Caltech"). */
    secondary_creator?: string;
    photographer?: string;
    location?: string;
    media_type?: string;
  }[];
  links?: { href?: string; rel?: string; render?: string; width?: number }[];
}

const nasaData = (raw: NasaRaw) => raw.data?.[0] ?? {};

/**
 * The best available rendition, per RENDITION_ORDER. Falls back to the first image-rendering link
 * of any shape — an asset whose filename doesn't follow the `~suffix` convention is still an
 * image, and dropping it over a naming convention would be the wrong trade.
 */
export function nasaImageUrl(raw: NasaRaw): string | null {
  const links = (raw.links ?? []).filter((l) => l.href);
  for (const rendition of RENDITION_ORDER) {
    const match = links.find((l) => l.href!.includes(`~${rendition}.`));
    if (match) return match.href!;
  }
  return links.find((l) => l.render === "image")?.href ?? null;
}

/** Exported for the same reason isMetServable() is: ingestion filters before paying for curation.
 *  There is no license condition to test — see the file header — so this is purely "is there an
 *  item here at all". */
export function isNasaServable(raw: NasaRaw): boolean {
  const data = nasaData(raw);
  return Boolean(data.nasa_id && data.title?.trim() && nasaImageUrl(raw));
}

/**
 * NASA descriptions are real prose — press-release prose, but prose, and present on 600 of 600
 * sampled items. Two cleanups before it can be stored:
 *   - `stripHtml`: 58 of 600 carried `<a>`/`<b>` markup (CLAUDE.md: source HTML never reaches the
 *     app unsanitized).
 *   - `decodeEntities`: 13 of 600 carried `&quot;`/`&amp;` around quoted remarks, which stripHtml
 *     leaves untouched because they aren't tags.
 * The fallback ladder ends on a synthesized line because NormalizedItem.summary is a required
 * non-empty string.
 */
function nasaSummary(raw: NasaRaw, attribution: string): string {
  const data = nasaData(raw);
  const prose = data.description ?? data.description_508 ?? "";
  const cleaned = toLede(decodeEntities(stripHtml(prose)));
  if (cleaned.length >= 20) return cleaned;

  const parts = [
    data.title,
    data.location ?? null,
    data.date_created?.slice(0, 10) ?? null,
    attribution,
  ];
  return toLede(parts.filter(Boolean).join(". "));
}

/**
 * NASA's own credit line, preferred over anything this adapter could compose. `secondary_creator`
 * is the field NASA uses for exactly this ("NASA/JPL-Caltech/Harvard-Smithsonian CfA"), and it
 * already names the agency, so it is passed through untouched. Below it, `photographer`, then the
 * originating center — each prefixed with "NASA" only when the value doesn't already say it.
 */
export function nasaAttribution(raw: NasaRaw): string {
  const data = nasaData(raw);
  const credit = data.secondary_creator?.trim() ?? data.photographer?.trim();
  if (credit) return /nasa/i.test(credit) ? credit : `NASA / ${credit}`;
  return data.center?.trim() ? `NASA / ${data.center.trim()}` : "NASA";
}

async function search(
  query: string,
  opts?: { limit?: number },
): Promise<NasaRaw[]> {
  const limit = opts?.limit ?? 50;
  const items: NasaRaw[] = [];

  // 100 results per page is the API's own maximum and its default for this endpoint.
  for (let page = 1; page <= 5 && items.length < limit; page++) {
    const res = (await fetchJson(
      `${NASA_API}?q=${encodeURIComponent(query)}&media_type=image&page=${page}`,
      { delayMs: NASA_DELAY_MS },
    )) as { collection?: { items?: NasaRaw[] } };

    const hits = res.collection?.items ?? [];
    if (hits.length === 0) break;

    for (const hit of hits) {
      if (items.length >= limit) break;
      if (isNasaServable(hit)) items.push(hit);
    }
  }
  return items;
}

function toItem(raw: NasaRaw): NormalizedItem {
  const data = nasaData(raw);
  const attribution = nasaAttribution(raw);
  const nasaId = data.nasa_id ?? "";

  return {
    source: "nasa-images",
    // NASA's own permanent asset identifier — the key every images.nasa.gov URL is built from.
    sourceId: nasaId,
    type: "image",
    title: data.title ?? "",
    summary: nasaSummary(raw, attribution),
    body: null,
    imageUrl: nasaImageUrl(raw),
    sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(nasaId)}`,
    attribution,
    // The honest ceiling on what can be claimed: NASA-originated media is public domain, and the
    // API exposes no per-item rights field to narrow that further. The parenthetical is the scope,
    // not decoration — see the file header, and T6's verdict on whether it's sufficient.
    license: "Public domain (NASA)",
    tags: uniqueTags([...(data.keywords ?? []), data.center]),
  };
}

export const nasaImages: SourceAdapter<NasaRaw> = {
  source: "nasa-images",
  search,
  toItem,
};
