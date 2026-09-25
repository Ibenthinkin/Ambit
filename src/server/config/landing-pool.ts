// Which corpus pictures may open the app (docs/DESIGN_landing-redo.md D1).
//
// The landing shows a picture full-bleed with no credit, to a reader who has not signed in. That
// is a narrower use than the feed's, so the rule is narrower than "is in the corpus": a curator
// score of 9+, and a licence that permits exactly this — public domain or CC0, stated as such by
// the source. **Exact strings, not a heuristic.** `license` is free text each adapter writes
// (SPEC §5.1), so the honest rule is a list of the strings the adapters actually write, plus one
// prefix for The Public Domain Review's per-collection variants. Adding a source is one line here
// and one case in the test — never a regex over "public domain", which would quietly admit
// "Rights retained by the author" the day a source phrases something differently.
//
// Excluded on purpose: NULL (a missing rights statement is not a permissive one), CC BY (its
// condition is attribution and the landing renders none), the blogs ("Rights retained by original
// authors — displayed with credit and link": the link-card posture is display WITH a link, which
// a reel is not), `archive`'s "unknown", and Loupe.

/** The curator's floor for the landing. The feed's floor is 4; this screen shows the best. */
export const LANDING_SCORE_FLOOR = 9;

/** Exact `item.license` strings that admit a picture. Source in the comment; counts are 09-25-26 local. */
export const LANDING_LICENSES: readonly string[] = [
  "CC0 1.0 (public domain)", // cma 826, met 456, aic 43
  "CC0", // smithsonian 245
  "Public Domain Mark", // wellcome 203
  "Public domain (NASA)", // nasa-images 142
  "No known restrictions on publication", // loc 101
];

/** Prefixes that admit a picture — PDR writes `Public domain — <basis> · text CC BY-SA 4.0 (…)`. */
export const LANDING_LICENSE_PREFIXES: readonly string[] = ["Public domain —"];

export function isLandingLicense(license: string | null | undefined): boolean {
  if (!license) return false;
  if (LANDING_LICENSES.includes(license)) return true;
  return LANDING_LICENSE_PREFIXES.some((p) => license.startsWith(p));
}
