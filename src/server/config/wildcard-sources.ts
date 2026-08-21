// Sources the gallery rail's **wildcard** slot prefers, when it has any.
//
// The rail (services/gallery-rail.ts) mostly walks the topic graph: stay here, drift one hop, jump
// across. A wildcard slot ignores the walk entirely and draws an image from the whole corpus — the
// serendipity dial with no floor under it. This list narrows that draw when it is non-empty.
//
// **`archive` is here, and it is the only entry.** The list shipped empty in Phase 5.8 — the knob
// was the doorway, not the feature — because `ambit-archive` had an adapter built to this repo's
// `SourceAdapter` contract but no integration on this side. Phase A.5 landed that integration
// (`sources/archive.ts`, a sixth source), and this is the line 5.8 was built to let someone change:
// Ben's own photographs now surface as the gallery rail's wildcards, at `wildcardChance` (0.1),
// without another line moving anywhere.
//
// It answers a wish recorded on 08-20-26 and deliberately left unimplemented until there was
// something real behind it: Ben wanted the archive's flavour *more* present in gallery browsing than
// the ordinary feed draw gives it. A wildcard slot is where that lives — not a new feed tier, and
// not a change to the walk.
//
// **The fall-through matters as much as the list.** `getGalleryRail` tries the preferred draw first
// and falls back to a source-unrestricted one when it comes back empty (see `drawForStep`), so an
// archive with no ingested rows yet costs nothing: the wildcard simply reaches the whole corpus, the
// way it did before this line changed. Nothing here needs guarding on how full the archive is.
export const WILDCARD_SOURCES: string[] = ["archive"];
