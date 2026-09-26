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

// ── Shape (09-25-26 amendment to docs/DESIGN_landing-redo.md) ─────────────────────────────────
//
// The reel is full-bleed `object-fit: cover`. A wide picture on a tall phone is scaled until it
// covers the screen's *height* and then cropped — on an iPhone that turned a 960 px painting into a
// blurry close-up of its middle (Ben's first device look). So a phone draws only tall pictures and
// a computer only wide ones, and each must be big enough not to be stretched past recognition: the
// masters are small (the pool's tall pictures measured a median 893 px high), so the floor drops
// the smallest rather than promising sharpness it can't give. Square-ish pictures sit out.

export type LandingShape = "portrait" | "landscape";

/** Tall: 0.4 ≤ width / height ≤ 0.8. A phone held upright is ~0.46; a thinner needle covers it only
 *  by being blown up across its width. */
export const PORTRAIT_MIN_RATIO = 0.4;
export const PORTRAIT_MAX_RATIO = 0.8;
/** Wide: 1.25 ≤ width / height ≤ 2. A computer is ~1.6; a panorama (the first 1440 look drew a
 *  6 : 1 one) covers it only by being blown up across its height. */
export const LANDSCAPE_MIN_RATIO = 1.25;
export const LANDSCAPE_MAX_RATIO = 2;
/** The cached master's long edge must be at least this. */
export const LANDING_MIN_LONG_EDGE = 800;

export function landingShape(
  width: number | null | undefined,
  height: number | null | undefined,
): LandingShape | null {
  if (!width || !height) return null;
  if (Math.max(width, height) < LANDING_MIN_LONG_EDGE) return null;
  const ratio = width / height;
  if (ratio >= PORTRAIT_MIN_RATIO && ratio <= PORTRAIT_MAX_RATIO)
    return "portrait";
  if (ratio >= LANDSCAPE_MIN_RATIO && ratio <= LANDSCAPE_MAX_RATIO)
    return "landscape";
  return null;
}

/**
 * Which reel the server preloads, from the only thing it can see: the user agent. A phone is
 * assumed upright; everything else wide — including an iPad, which has reported itself as a Mac
 * since iPadOS 13. The client corrects a wrong guess with the real orientation after hydration;
 * the cost of one is the preloaded pictures of the other reel.
 */
export function guessShape(userAgent: string | null | undefined): LandingShape {
  return userAgent && /Mobi|iPhone|iPod|Android/.test(userAgent)
    ? "portrait"
    : "landscape";
}
