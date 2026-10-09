// Sources the item rail's **wildcard** slot prefers, when it has any.
//
// The rail (services/gallery-rail.ts) mostly walks the topic graph: stay here, drift one hop, jump
// across. A wildcard slot ignores the walk entirely and draws an image from the whole corpus — the
// serendipity dial with no floor under it. This list narrows that draw when it is non-empty.
//
// **Empty again as of 10-08-26.** The list shipped empty in Phase 5.8 — the knob was the doorway,
// not the feature — and Phase A.5 put `archive` in it: Ben wanted his own photographs *more*
// present in rail browsing than the ordinary feed draw gave them, and a wildcard slot at
// `wildcardChance` (0.1) was where that lived. The archive had only ever been there to fill an
// early corpus that was short of pictures; at ~214,000 items Ben retired it
// (`config/suspended-sources.ts`), and a preference for a suspended source is a query that can
// only come back empty, so the entry went with it.
//
// **The fall-through matters as much as the list.** `getGalleryRail` tries the preferred draw first
// and falls back to a source-unrestricted one when it comes back empty (see `drawForStep`), so a
// preferred source with no drawable rows costs nothing but that first query: the wildcard simply
// reaches the whole corpus. Nothing here needs guarding on how full a source is.
export const WILDCARD_SOURCES: string[] = [];
