// Turns an item's `source` column — a lowercase slug like `"aic"` — into the eyebrow the UI
// shows above an article's headline ("ART INSTITUTE OF CHICAGO").
//
// A lookup table rather than a formatting rule, because the rule doesn't exist: two of the five v1
// sources are initialisms nobody expands correctly by algorithm (`aic`, `cma`), one is a proper
// noun with an article baked in ("The Met"), and only `wikipedia` happens to be its own label
// capitalized. So: name the ones we ship, and title-case the rest.
//
// **The fallback is load-bearing, not defensive padding.** `item.source` is deliberately an open
// set in the schema (SPEC §6.1 commits five adapters for v1; Phase 6 adds more, and the
// ambit-archive / loupe integrations add private ones) — so this function will regularly see a
// slug that predates it. Rendering `"archive"` as "Archive" is a perfectly good outcome;
// rendering it as `undefined` is not.
import { BLOGS } from "~/server/config/blogs";
import { PDR } from "~/server/config/pdr";

const SOURCE_LABELS: Record<string, string> = {
  wikipedia: "Wikipedia",
  met: "The Met",
  aic: "Art Institute of Chicago",
  cma: "Cleveland Museum of Art",
  wellcome: "Wellcome Collection",
  // Phase 6.2's trial sources. Named here rather than left to the fallback because the fallback
  // gets all four visibly wrong: "Loc", "Nasa-images" and "Poetrydb" are not things anyone calls
  // them, and a credit line is the one place a source's name has to be right — it is the claim
  // the item is making about where it came from.
  smithsonian: "Smithsonian Open Access",
  loc: "Library of Congress",
  "nasa-images": "NASA Image Library",
  poetrydb: "PoetryDB",
  // Phase 6.3: blogs name themselves in the registry — one source of truth for the credit line,
  // the attribution column, and the link-out row's copy.
  ...Object.fromEntries(BLOGS.map((b) => [b.id, b.label])),
  // Sources round 2 (09-02-26): a walk source that is not a blog — its label lives in its own
  // config row for the same reason the blogs' do (one source of truth for the credit line).
  [PDR.id]: PDR.label,
};

export function sourceLabel(source: string): string {
  return (
    SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1)
  );
}
