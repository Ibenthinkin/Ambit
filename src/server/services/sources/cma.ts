// The Cleveland Museum of Art adapter (SPEC §6.1). Ported from phase0/harvest.ts's harvestCma —
// the friendliest API of the five: no key, `limit` up to 1000 (one request can cover a whole
// topic's quota, unlike the Met's N+1 pattern or AIC's 100-per-page cap), full records in the
// search response, an explicit `cc0` search flag, and — rare for a museum — a real prose
// `description` on many objects (the subject-first text Phase 0.2 found museums usually lack).
//
// New finding this task (not recorded in phase0/NOTES.md, since the throwaway harvester never
// re-rendered the description anywhere): that prose `description` field carries raw HTML
// (`<em>`, `<br>`) the API docs don't mention. Stripped via normalize.ts's stripHtml() before it
// becomes item.summary — CLAUDE.md is explicit that source HTML must never reach the app
// unsanitized, and summary is meant to be safe plain text everywhere it's read.
import { fetchJson } from "./http";
import { stripHtml, toLede, uniqueTags } from "./normalize";
import type { NormalizedItem, SourceAdapter } from "./types";

const CMA_API = "https://openaccess-api.clevelandart.org/api/artworks/";

interface CmaCreator {
  description?: string;
  name?: string;
}

/** One CMA search result record. `cc0` in the search URL is a presence-only flag (no `=1`), and
 *  — same trust-nothing rule as every other adapter — the per-record `share_license_status` is
 *  still re-checked rather than trusting the search filter blindly. */
export interface CmaRaw {
  id: number;
  title: string;
  description?: string;
  creators?: CmaCreator[];
  creation_date?: string;
  culture?: string[];
  technique?: string;
  department?: string;
  type?: string;
  images?: { web?: { url?: string } };
  url: string;
  share_license_status?: string;
}

export function isCmaServable(raw: CmaRaw): boolean {
  return Boolean(
    raw.share_license_status === "CC0" && raw.images?.web?.url && raw.title,
  );
}

/** Prose first when the museum wrote some — CMA is the one source in the v1 set where "subject
 *  before medium/department" (the Phase 0.2 lesson) is true at the source, not something the
 *  adapter has to fake by reordering catalogue fields. */
function cmaSummary(a: CmaRaw): string {
  const creators = (a.creators ?? [])
    .map((c) => c.description ?? c.name)
    .filter(Boolean)
    .join("; ");
  const parts = [
    a.description ? stripHtml(a.description) : null,
    creators || null,
    a.creation_date ?? null,
    a.technique ?? null,
    (a.culture ?? []).filter(Boolean).join(", ") || null,
    a.type ?? null,
    a.department ? `${a.department} collection` : null,
  ];
  return toLede(parts.filter(Boolean).join(". "));
}

async function search(
  query: string,
  opts?: { limit?: number },
): Promise<CmaRaw[]> {
  const limit = opts?.limit ?? 50;

  // Over-ask 3x in ONE request (CMA's limit goes up to 1000) and still re-check
  // share_license_status per record below — the Met's lesson from Phase 0: search filters lie,
  // the object record is the truth.
  const res = (await fetchJson(
    `${CMA_API}?q=${encodeURIComponent(query)}&cc0&has_image=1` +
      `&limit=${Math.min(limit * 3, 1000)}&fields=id,title,description,creators,` +
      `creation_date,culture,technique,department,type,images,url,share_license_status`,
    { delayMs: 150 },
  )) as { data?: CmaRaw[] };

  const items: CmaRaw[] = [];
  for (const hit of res.data ?? []) {
    if (items.length >= limit) break;
    if (isCmaServable(hit)) items.push(hit);
  }
  return items;
}

function toItem(raw: CmaRaw): NormalizedItem {
  return {
    source: "cma",
    sourceId: String(raw.id),
    type: "image",
    title: raw.title,
    summary: cmaSummary(raw),
    body: null,
    imageUrl: raw.images?.web?.url ?? null,
    sourceUrl: raw.url,
    // CMA has no folksonomy tag array — classification fields stand in.
    tags: uniqueTags([
      raw.type,
      raw.department,
      raw.technique,
      ...(raw.culture ?? []),
    ]),
    attribution: [
      (raw.creators ?? [])
        .map((c) => c.description ?? c.name)
        .filter(Boolean)
        .join("; "),
      "The Cleveland Museum of Art",
    ]
      .filter(Boolean)
      .join(". "),
    license: "CC0 1.0 (public domain)",
  };
}

export const cma: SourceAdapter<CmaRaw> = {
  source: "cma",
  search,
  toItem,
};
