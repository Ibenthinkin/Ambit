// How did the reader get to this item page? — the one fact `item.open{from}` needs.
//
// Why a marker in storage and not a query parameter: the item URL is the app's one public,
// shareable address, and docs/DESIGN_usage.md forbids tracking that rides on a URL (a `?from=`
// would be copied into every shared link). So the screen that navigates leaves a note in
// `sessionStorage` — the same trick as `components/feed/feed-origin.ts` — and the item page
// reads it once and tears it up.
//
// The note names the item as well as the origin, so a stale note (a navigation that never
// arrived, a different item opened by hand later) can never be misattributed to the wrong page.
//
// `from` is always one of `META_SPEC["item.open"].from`; `isFrom` guards what comes back out of
// storage, since a string read from storage is not trustworthy just because we wrote it once.
import { META_SPEC } from "~/config/usage";

export type ArrivalFrom = (typeof META_SPEC)["item.open"]["from"][number];

const KEY = "ambit.itemArrival.v1";

const isFrom = (v: unknown): v is ArrivalFrom =>
  typeof v === "string" &&
  (META_SPEC["item.open"].from as readonly string[]).includes(v);

/** Call immediately before navigating to `/i/{itemId}`. */
export function markArrival(itemId: string, from: ArrivalFrom): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ id: itemId, from }));
  } catch {
    // Private mode: the arrival is then read as a cold one ("link"). Degraded, not broken.
  }
}

// Whether this document has yet answered "how did I get here?" for an item page. A full page
// load can only be the first route once; after that, an arrival with no note is a client-side
// navigation we did not mark (Back, Forward) — and history navigation is not a thing to record.
let firstRoute = true;

/** Test seam. */
export function resetArrivalForTests(): void {
  firstRoute = true;
}

/** Was this document loaded by a plain navigation (a link, the address bar) to this item? A
 *  reload or a back/forward restore reports another `type`, and so does a document that is not
 *  this item's (the reader got here by client-side routing). */
function loadedByNavigation(itemId: string): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    if (nav?.type !== "navigate") return false;
    return new URL(nav.name).pathname === `/i/${itemId}`;
  } catch {
    return false;
  }
}

/**
 * Read-and-clear the note for `itemId`. A note for a different item is left alone (it belongs to
 * a navigation still in flight). With no note, the arrival is a cold `link` only when it is this
 * document's first route and the browser says the document was navigated to (not reloaded or
 * restored); every other no-note arrival (Back, Forward, reload) returns `null`: record nothing.
 */
export function takeArrival(itemId: string): ArrivalFrom | null {
  const first = firstRoute;
  firstRoute = false;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const note = JSON.parse(raw) as { id?: unknown; from?: unknown };
      if (note.id === itemId && isFrom(note.from)) {
        sessionStorage.removeItem(KEY);
        return note.from;
      }
    }
  } catch {
    /* fall through */
  }
  return first && loadedByNavigation(itemId) ? "link" : null;
}
