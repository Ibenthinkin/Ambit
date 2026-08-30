// The Wellcome Collection adapter (SPEC §6.1). Ported from phase0/harvest.ts's harvestWellcome —
// history-of-medicine/science texture the art museums don't have (anatomical plates, apothecary
// jars, strange instruments). License is per item and heterogeneous, unlike CMA's blanket CC0:
// the search is pre-filtered to open licenses AND every hit's own thumbnail.license is re-checked
// (same trust-nothing rule as every other adapter — a request filter is never sufficient alone).
import { fetchJson } from "./http";
import { htmlToText, toLede, uniqueTags } from "./normalize";
import type { NormalizedItem, SourceAdapter } from "./types";

const WELLCOME_API = "https://api.wellcomecollection.org/catalogue/v2/works";
/** No documented rate limit; stay polite anyway — their docs steer bulk users to snapshots. */
const WELLCOME_DELAY_MS = 250;
/** License ids the API uses for licenses this app can serve. */
const OPEN_LICENSES = new Set(["cc-0", "cc-by", "pdm"]);
const LICENSE_LABELS: Record<string, string> = {
  "cc-0": "CC0 1.0 (public domain)",
  pdm: "Public Domain Mark",
  "cc-by": "CC BY 4.0",
};

/** One Wellcome work record. Every field below is optional because `include=` on the search
 *  request adds them, but a given work can genuinely have none of them (see uk9hd5q7 in the
 *  fixture — empty production/contributors/subjects/notes, still a valid servable work). */
export interface WellcomeRaw {
  id: string;
  title: string;
  thumbnail?: { url: string; license?: { id: string } };
  production?: { dates?: { label: string }[] }[];
  contributors?: { agent?: { label: string } }[];
  subjects?: { label?: string; concepts?: { label: string }[] }[];
  notes?: { noteType?: { label: string }; contents?: string[] }[];
  workType?: { label: string };
  physicalDescription?: string;
}

export function isWellcomeServable(raw: WellcomeRaw): boolean {
  const licenseId = raw.thumbnail?.license?.id;
  return Boolean(
    raw.title &&
    raw.thumbnail?.url &&
    licenseId &&
    OPEN_LICENSES.has(licenseId),
  );
}

/**
 * `thumbnail.url` arrives as a rendered IIIF URL at one of two shapes, roughly 40/60 across a
 * live sample (four searches, 08-07-26): the bracket "fit-in-box" form (`!200,200`) and a plain
 * fixed-width form with no upscale guard (`300,`). Both get rewritten to the same `!800,800`
 * fit-in-box target for consistent card sizing.
 *
 * Unlike AIC's IIIF server — which 403s a plain-width request above the original's size (the
 * `843,` trap from Phase 0) — Wellcome's honors a wider plain-width request cleanly: live-verified
 * (`curl -I`, 08-07-26) that `/full/800,/0/default.jpg` 200s and returns a genuinely larger file
 * than `/full/300,/0/default.jpg` (222KB vs 47KB on one sample image), not just a re-served
 * original. So both shapes are safe to widen, unlike AIC where the plain form must be avoided
 * entirely.
 *
 * If a URL is in neither shape (thumbnails not under `/full/.../`), the replace is a no-op and
 * the default size is served — never a hard failure.
 */
export function wellcomeImageUrl(url: string): string {
  return url.replace(/\/full\/!?[0-9]*,[0-9]*\//, "/full/!800,800/");
}

/** Works have no long `description` field of their own; descriptive text, when it exists at all,
 *  hides in a note whose type is labeled "description" or "summary". */
function wellcomeSummary(w: WellcomeRaw): string {
  const contributors = (w.contributors ?? [])
    .map((c) => c.agent?.label)
    .filter(Boolean)
    .join("; ");
  const date = w.production?.[0]?.dates?.[0]?.label;
  const noteText = (w.notes ?? [])
    .filter((n) => /description|summary/i.test(n.noteType?.label ?? ""))
    .flatMap((n) => n.contents ?? [])
    .join(" ");
  const subjects = (w.subjects ?? [])
    .map((s) => s.label ?? s.concepts?.[0]?.label)
    .filter(Boolean)
    .join(", ");
  const parts = [
    noteText || null,
    contributors || null,
    date ?? null,
    w.physicalDescription ?? null,
    w.workType?.label ?? null,
    subjects || null,
  ];
  return toLede(parts.filter(Boolean).join(". "));
}

async function search(
  query: string,
  opts?: { limit?: number },
): Promise<WellcomeRaw[]> {
  const limit = opts?.limit ?? 50;
  const items: WellcomeRaw[] = [];

  // pageSize caps at 100 (vs CMA's 1000), so this pages like AIC does.
  for (let page = 1; page <= 8 && items.length < limit; page++) {
    const res = (await fetchJson(
      `${WELLCOME_API}?query=${encodeURIComponent(query)}` +
        `&items.locations.license=cc-0,cc-by,pdm&pageSize=100&page=${page}` +
        `&include=production,contributors,subjects,notes`,
      { delayMs: WELLCOME_DELAY_MS },
    )) as { results?: WellcomeRaw[] };

    const hits = res.results ?? [];
    if (hits.length === 0) break;

    for (const hit of hits) {
      if (items.length >= limit) break;
      if (isWellcomeServable(hit)) items.push(hit);
    }
  }
  return items;
}

function toItem(raw: WellcomeRaw): NormalizedItem {
  const licenseId = raw.thumbnail?.license?.id;
  const contributors = (raw.contributors ?? [])
    .map((c) => c.agent?.label)
    .filter(Boolean)
    .join("; ");
  return {
    source: "wellcome",
    sourceId: raw.id,
    type: "image",
    // Through htmlToText(): Wellcome italicises journal names with `<i>` in titles and notes.
    title: htmlToText(raw.title),
    summary: htmlToText(wellcomeSummary(raw)),
    body: null,
    imageUrl: raw.thumbnail ? wellcomeImageUrl(raw.thumbnail.url) : null,
    sourceUrl: `https://wellcomecollection.org/works/${raw.id}`,
    tags: uniqueTags([
      ...(raw.subjects ?? []).map((s) => s.label ?? s.concepts?.[0]?.label),
      raw.workType?.label,
    ]),
    attribution: [contributors, "Wellcome Collection"]
      .filter(Boolean)
      .join(". "),
    // Falls back to the raw license id (or "unknown") if a future license id isn't in the label
    // map yet — toItem() stays a pure mapper of whatever it's handed, servability filtering is
    // isWellcomeServable()'s job, not this function's.
    license: licenseId ? (LICENSE_LABELS[licenseId] ?? licenseId) : "unknown",
  };
}

export const wellcome: SourceAdapter<WellcomeRaw> = {
  source: "wellcome",
  search,
  toItem,
};
