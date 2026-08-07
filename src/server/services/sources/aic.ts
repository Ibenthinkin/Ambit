// The Art Institute of Chicago adapter (SPEC §6.1). Ported from phase0/harvest.ts's harvestAic.
// Unlike the Met, one search call returns FULL records (no N+1 detail-fetch pattern) — but AIC's
// search has no public-domain filter at all, so `isAicServable()` is entirely our own check, and
// AIC's own `limit` parameter hard-caps at 100 (a 403 "Invalid limit" above that, not documented),
// so search() pages instead of asking for more per request.
import { fetchJson } from "./http";
import { toLede, uniqueTags } from "./normalize";
import type { NormalizedItem, SourceAdapter } from "./types";

const AIC_API = "https://api.artic.edu/api/v1";
const AIC_IIIF = "https://www.artic.edu/iiif/2";
const AIC_FIELDS =
  "id,title,image_id,artist_display,date_display,medium_display,department_title,term_titles,is_public_domain,classification_title,place_of_origin";
/** Undocumented: AIC 403s "Invalid limit" above 100 — a hard page-size cap, not a rate limit. */
const AIC_PAGE_SIZE = 100;

/** One AIC search result record. `is_public_domain` can be entirely ABSENT on some records (not
 *  just `false`) — isAicServable() below has to treat "missing" the same as "no". */
export interface AicRaw {
  id: number;
  title: string;
  image_id?: string | null;
  artist_display?: string;
  date_display?: string;
  medium_display?: string;
  department_title?: string;
  term_titles?: string[];
  is_public_domain?: boolean;
  classification_title?: string;
  place_of_origin?: string;
}

/** AIC's search has no PD filter of its own — every hit needs this check before being treated as
 *  a candidate (mirrors isMetServable(), same trust-nothing rule, different reason: the Met's
 *  filter lies, AIC's doesn't exist). */
export function isAicServable(raw: AicRaw): boolean {
  return Boolean(raw.is_public_domain && raw.image_id && raw.title);
}

/** IIIF URL construction — the `config.iiif_url` base plus a fit-in-box size request. `!843,843`,
 *  NEVER the docs' plain `843,`: a plain-width request 403s on any original narrower than 843px
 *  because IIIF servers reject upscaling (phase0/NOTES.md — ~7% of thumbnails 403'd before this
 *  was found). */
export function aicImageUrl(imageId: string): string {
  return `${AIC_IIIF}/${imageId}/full/!843,843/0/default.jpg`;
}

function aicSummary(a: AicRaw): string {
  const parts = [
    a.artist_display?.replace(/\n/g, ", ") ?? null,
    a.date_display ?? null,
    a.medium_display ?? null,
    a.place_of_origin ?? null,
    a.classification_title ?? null,
    a.department_title ? `${a.department_title} collection` : null,
    (a.term_titles ?? []).join(", ") || null,
  ];
  return toLede(parts.filter(Boolean).join(". "));
}

async function search(
  query: string,
  opts?: { limit?: number },
): Promise<AicRaw[]> {
  const limit = opts?.limit ?? 50;
  const items: AicRaw[] = [];

  // Page until quota is hit, hits run out, or a safety cap on pages/topic (matches phase0's cap).
  for (let page = 1; page <= 6 && items.length < limit; page++) {
    const res = (await fetchJson(
      `${AIC_API}/artworks/search?q=${encodeURIComponent(query)}` +
        `&page=${page}&limit=${AIC_PAGE_SIZE}&fields=${AIC_FIELDS}`,
      { delayMs: 120 },
    )) as { data?: AicRaw[] };

    const hits = res.data ?? [];
    if (hits.length === 0) break;

    for (const hit of hits) {
      if (items.length >= limit) break;
      if (isAicServable(hit)) items.push(hit);
    }
  }
  return items;
}

function toItem(raw: AicRaw): NormalizedItem {
  return {
    source: "aic",
    sourceId: String(raw.id),
    type: "image",
    title: raw.title,
    summary: aicSummary(raw),
    body: null,
    imageUrl: raw.image_id ? aicImageUrl(raw.image_id) : null,
    sourceUrl: `https://www.artic.edu/artworks/${raw.id}`,
    tags: uniqueTags([
      ...(raw.term_titles ?? []),
      raw.department_title,
      raw.classification_title,
    ]),
    attribution: [
      raw.artist_display?.replace(/\n/g, ", "),
      "The Art Institute of Chicago",
    ]
      .filter(Boolean)
      .join(". "),
    license: "CC0 1.0 (public domain)",
  };
}

export const aic: SourceAdapter<AicRaw> = {
  source: "aic",
  search,
  toItem,
};
