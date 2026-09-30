import { isBlogSource } from "./blogs";

// Publications — the second kind of link-card source (docs/DESIGN_writing.md D6, 09-28-26):
// Aeon, Psyche, Atlas Obscura and the rest, each shown as its lead image, its own dek, a `from:`
// credit and a prominent link, never a republished article. **Empty until Phase 5** registers the
// first one (`docs/PLAN_writing.md` Phase 5 gives the config's full shape); it exists now so the
// display code can key on `isLinkCardSource` once, and a publication lands on the reader page
// correctly the day it is added.
//
// A rights posture belongs to the *source*, not the item — the same rule `isBlogSource` follows —
// which is why this is a list of ids and not a column.

export interface PublicationConfig {
  id: string;
  label: string;
}

export const PUBLICATIONS: readonly PublicationConfig[] = [];

export function isPublicationSource(source: string): boolean {
  return PUBLICATIONS.some((p) => p.id === source);
}

/**
 * Every source shown as a link card: the designated blogs and the publications. **PDR is not one**
 * — its pictures are public domain and its essays are CC BY-SA, so it is its own case wherever it
 * shares the link-out row (see `link-out-row.tsx`).
 */
export function isLinkCardSource(source: string): boolean {
  return isBlogSource(source) || isPublicationSource(source);
}
