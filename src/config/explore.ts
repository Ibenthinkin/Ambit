// `/explore` — a signed-out taste of the feed (09-26-26, docs/PLAN_explore-route.md).
//
// A client-safe leaf: no imports, so the explore screen, the item screen's rail and the
// `feed.explore` router can all read the same numbers without dragging the server into a bundle.
//
// The caps are *soft* and *per visit*: counted in the browser, reset by a reload. They shape the
// taste, they don't guard anything — the account wall is what keeps Ambit invite-only, and the
// server's page backstop is only there so a script can't page the corpus forever.

/** Image cards the explore feed shows before its end card. */
export const EXPLORE_FEED_IMAGE_CAP = 200;

/** Sideways steps the item screen's rail allows a visitor who came from `/explore`. */
export const EXPLORE_RAIL_CAP = 100;

/** `feed.explore` answers an empty, final page from this page index on — 24 pages is ~288 cards,
 *  comfortably past the 200-image cap, so the client's cap is always what a visitor meets. */
export const EXPLORE_MAX_PAGES = 24;
