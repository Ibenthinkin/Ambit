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

/**
 * Read-and-clear the note for `itemId`. A note for a different item is left alone (it belongs to
 * a navigation still in flight); no note at all means the page was opened cold — a pasted link,
 * a bookmark, a reload — which is the closest to "link".
 */
export function takeArrival(itemId: string): ArrivalFrom {
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
    /* fall through to "link" */
  }
  return "link";
}
