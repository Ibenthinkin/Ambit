// The Smithsonian Open Access adapter — Phase 6.2, a *trial* source (docs/source-candidates.md's
// trial loop), not yet a committed v1 source. api.si.edu spans every Smithsonian unit at once:
// the art museums, Cooper Hewitt's design collection, and — overwhelmingly by row count — the
// natural-history specimen catalogues.
//
// **Why the license story is unusually easy here, and where it still isn't.** Unlike the Met
// (whose own public-domain filter lies) or Wellcome (per-item licenses), Smithsonian exposes
// `media_usage:"CC0"` as a *query* filter, and a live sample of 400 rows across eight queries
// (08-21-26) found `usage.access: "CC0"` on every single one. So the filter is honest. What it
// does NOT cover: 2 of those 400 rows simultaneously carried
// `indexedStructured.online_media_rights: ["Copyright protected/restricted"]` — the record's own
// catalogue metadata contradicting the media's usage block. 0.5% is small but it is not zero, and
// the Phase 0.2 Met lesson is that a source's own filter is never sufficient alone. Both signals
// are re-checked in search() below, and a row that fails either is dropped rather than reconciled.
//
// **Keyed, like archive.ts.** A free api.data.gov key raises the rate limit from DEMO_KEY's 10/hr
// to 1,000/hr (confirmed live via the `x-ratelimit-limit` response header).
import { fetchJson } from "./http";
import { stripHtml, toLede, uniqueTags } from "./normalize";
import type { NormalizedItem, SourceAdapter } from "./types";

const SI_API = "https://api.si.edu/openaccess/api/v1.0/search";
/** 1,000 requests/hr on a real key = one every 3.6s to exhaust it; 400ms is far inside that and
 *  matches the Met's pace, which is the slowest any source here needs to be. */
const SI_DELAY_MS = 400;
/** The search endpoint's page size. 100 is its documented maximum. */
const SI_PAGE_ROWS = 100;

/** One `response.rows[]` element. Only the fields toItem() reads are typed; the API returns a
 *  good deal more (docSignature, hash, version, per-media `resources` renditions) that no
 *  NormalizedItem field wants. Everything is optional because the union of all Smithsonian units'
 *  cataloguing practices is genuinely ragged — a botany specimen and a Cooper Hewitt textile share
 *  almost no fields beyond title. */
export interface SmithsonianRaw {
  id: string;
  title: string;
  unitCode?: string;
  content?: {
    freetext?: Record<string, { label?: string; content?: string }[]>;
    indexedStructured?: Record<string, unknown>;
    descriptiveNonRepeating?: {
      guid?: string;
      record_ID?: string;
      record_link?: string;
      data_source?: string;
      unit_code?: string;
      online_media?: {
        media?: {
          type?: string;
          content?: string;
          thumbnail?: string;
          usage?: { access?: string };
        }[];
      };
    };
  };
}

/** The first Images-typed media entry with a usable delivery URL — the one that becomes
 *  `imageUrl`. Records routinely carry several (a gem specimen had six); rank order within a
 *  record is the museum's own, so "first" is the closest thing to "primary" on offer. */
function primaryImage(raw: SmithsonianRaw) {
  const media = raw.content?.descriptiveNonRepeating?.online_media?.media ?? [];
  return media.find((m) => m.type === "Images" && m.content);
}

/**
 * The two-signal license check described in the file header, plus the usual "is there actually an
 * image and a title" servability gate. Exported for the same reason isMetServable() is: the
 * ingestion job filters with it before paying for a curation call.
 *
 * The `online_media_rights` test deliberately excludes "No Known Copyright Restrictions" — the
 * far more common value in the same field (9 of 400 in the live sample vs. 2 restrictive), and a
 * *permissive* statement whose text nonetheless contains both "copyright" and "restrictions".
 * Matching it would drop clean rows for saying they're clean.
 */
export function isSmithsonianServable(raw: SmithsonianRaw): boolean {
  const media = primaryImage(raw);
  if (!media || media.usage?.access !== "CC0") return false;
  if (!raw.title?.trim()) return false;

  const rights = raw.content?.indexedStructured?.online_media_rights;
  const restricted =
    Array.isArray(rights) &&
    rights.some(
      (r) =>
        typeof r === "string" &&
        !/no known/i.test(r) &&
        /protect|restrict/i.test(r),
    );
  return !restricted;
}

/** Pull every `content` string out of one freetext bucket whose `label` matches, in the order the
 *  API listed them. Smithsonian's freetext is a bag of `{label, content}` pairs per bucket, and
 *  the label is what separates a usable Description from the Provenance/"Record Last Modified"
 *  boilerplate sitting in the same `notes` array. */
function freetext(
  raw: SmithsonianRaw,
  bucket: string,
  label?: RegExp,
): string[] {
  const entries = raw.content?.freetext?.[bucket] ?? [];
  return entries
    .filter((e) => (label ? label.test(e.label ?? "") : true))
    .map((e) => e.content)
    .filter((c): c is string => Boolean(c?.trim()));
}

/**
 * Smithsonian records have real prose surprisingly often — but only in the art and design units.
 * The natural-history catalogues (which are most of the 5.2M rows) have none at all, so this
 * walks down a ladder and only ever bottoms out on a synthesized string:
 *
 *   1. `notes` entries labeled Description / Label Text / Summary — genuine curatorial prose.
 *   2. `physicalDescription` — a catalogue sentence, but a concrete one ("Earthenware, H x Diam…").
 *   3. Taxonomy + place + object type + date — what a specimen record actually has to say.
 *   4. `"<title> — <attribution>"`, the never-empty floor (NormalizedItem.summary is a required
 *      non-empty string; the curator reads it as the item's primary text signal).
 *
 * Rungs 2-3 are joined rather than raced, because either alone is usually under the curator's
 * 60-character thin-summary floor while the two together clear it.
 */
function smithsonianSummary(raw: SmithsonianRaw, attribution: string): string {
  const prose = freetext(raw, "notes", /description|label text|summary/i);
  if (prose.length) return toLede(stripHtml(prose.join(" ")));

  const parts = [
    ...freetext(raw, "physicalDescription"),
    ...freetext(raw, "taxonomicName"),
    ...freetext(raw, "objectType"),
    ...freetext(raw, "place"),
    ...freetext(raw, "date"),
    ...freetext(raw, "name"),
  ];
  const synthesized = toLede(stripHtml(parts.join(". ")));
  return synthesized.length >= 20
    ? synthesized
    : `${raw.title} — ${attribution}`;
}

/** Every unit is a Smithsonian unit, but `data_source` alone ("National Museum of Asian Art")
 *  doesn't say so, and some values already do ("Cooper Hewitt, Smithsonian Design Museum") — so
 *  the parent credit is appended only when it isn't already there. */
function smithsonianAttribution(raw: SmithsonianRaw): string {
  const unit = raw.content?.descriptiveNonRepeating?.data_source?.trim();
  if (!unit) return "Smithsonian Institution";
  return /smithsonian/i.test(unit) ? unit : `${unit}, Smithsonian Institution`;
}

/**
 * The IDS delivery service serves the *full-resolution* JPEG by default — 837KB on one sampled
 * object, which is a feed hero nobody asked for. `&max=1200` brings the same image back at 89KB
 * (live-verified 08-21-26, byte-for-byte identical in size to the record's own "Screen Image"
 * rendition, so it is the same downscale the Smithsonian itself serves).
 *
 * Following the Wellcome precedent: a URL rewrite, verified against real bytes, in preference to
 * a per-item second call to the asset manifest.
 */
export function smithsonianImageUrl(url: string): string {
  return url.includes("max=") ? url : `${url}&max=1200`;
}

async function search(
  query: string,
  opts?: { limit?: number },
): Promise<SmithsonianRaw[]> {
  // process.env at call time, never a top-level `~/env` import — see archive.ts's header for the
  // full reasoning (importing ~/env runs Zod over the whole app surface and breaks unit tests).
  const key = process.env.SMITHSONIAN_API_KEY;
  if (!key) {
    // Thrown, never an empty array: a missing key that reads as "zero results" would let a run
    // report clean success having ingested nothing (the Phase 0.2 Met-403 lesson).
    throw new Error(
      "smithsonian adapter not configured — set SMITHSONIAN_API_KEY in .env (free key: https://api.data.gov/signup/)",
    );
  }

  const limit = opts?.limit ?? 50;
  const items: SmithsonianRaw[] = [];

  // The CC0 + Images terms ride along inside `q` rather than as separate parameters — that is the
  // API's own filtering idiom (its docs' Lucene-style query syntax), verified live 08-20/08-21.
  const q = `${query} AND media_usage:"CC0" AND online_media_type:"Images"`;

  // Page until the quota is met. The re-check below drops well under 1% (see the header), so
  // unlike the Met this barely needs to over-scan — but it pages anyway rather than assuming one
  // page of 100 always suffices for a narrow query.
  for (
    let start = 0;
    start < SI_PAGE_ROWS * 5 && items.length < limit;
    start += SI_PAGE_ROWS
  ) {
    const res = (await fetchJson(
      `${SI_API}?q=${encodeURIComponent(q)}&rows=${SI_PAGE_ROWS}&start=${start}` +
        `&api_key=${encodeURIComponent(key)}`,
      { delayMs: SI_DELAY_MS },
    )) as { response?: { rows?: SmithsonianRaw[] } };

    const rows = res.response?.rows ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (items.length >= limit) break;
      if (isSmithsonianServable(row)) items.push(row);
    }
  }
  return items;
}

function toItem(raw: SmithsonianRaw): NormalizedItem {
  const dnr = raw.content?.descriptiveNonRepeating;
  const attribution = smithsonianAttribution(raw);
  const indexed = raw.content?.indexedStructured ?? {};
  const indexedList = (field: string): (string | undefined)[] => {
    const v = indexed[field];
    return Array.isArray(v)
      ? v.map((x) => (typeof x === "string" ? x : undefined))
      : [];
  };

  return {
    source: "smithsonian",
    sourceId:
      // `record_ID` ("fsg_F1923.16") over the row's own `id`
      // ("ld1-1643390182193-1643390191198-1") deliberately: record_ID is unit code plus accession
      // number, i.e. derived from the object, while `id` carries what look like ingest timestamps
      // and would therefore be free to change under a Smithsonian re-index — taking the whole
      // corpus with it, since (source, sourceId) is the idempotency key.
      dnr?.record_ID ?? raw.id,
    type: "image",
    title: raw.title,
    summary: smithsonianSummary(raw, attribution),
    body: null,
    // Non-null by construction: search() only ever returns rows isSmithsonianServable() passed,
    // and that requires a media entry with `content`. The `?? null` is the type system's due,
    // not a real case.
    imageUrl: (() => {
      const url = primaryImage(raw)?.content;
      return url ? smithsonianImageUrl(url) : null;
    })(),
    // The unit's own object page where there is one ("https://asia.si.edu/object/F1923.16/"). A
    // fair number of natural-history records have only the n2t.net ARK, which record_link then
    // duplicates — either way it resolves to a real landing page, which is what "view at source"
    // owes the reader.
    sourceUrl: dnr?.record_link ?? dnr?.guid ?? "",
    attribution,
    // Not synthesized: this is the value `usage.access` actually carried, and isSmithsonianServable
    // has already refused anything that said otherwise or whose catalogue metadata disagreed.
    license: "CC0",
    tags: uniqueTags([
      ...indexedList("topic"),
      ...indexedList("object_type"),
      ...indexedList("culture"),
      ...indexedList("name"),
      ...indexedList("tax_family"),
      ...indexedList("place"),
    ]),
  };
}

export const smithsonian: SourceAdapter<SmithsonianRaw> = {
  source: "smithsonian",
  search,
  toItem,
};
