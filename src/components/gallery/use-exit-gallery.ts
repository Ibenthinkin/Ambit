"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { cameFromFeed } from "~/components/feed/feed-origin";
import { cameFromApp } from "./gallery-origin";

// The two ways out of the gallery, in one place — the same shape, and the same reasoning, as
// `hooks/use-leave-to-feed.ts` (read it first; this is that lesson applied one screen deeper).
//
// The lesson: `/feed` is dynamic, so a *pushed* navigation to it re-runs the server component and
// draws a fresh page of cards. Measured 08-20-26, every back-tap cost 24 items of the reader's
// corpus. Popping history costs nothing and returns the feed exactly as it was left — same tiles,
// same scroll. So every exit has to know whether there is something behind it to pop to.
//
// The gallery sits one step further down than the item page did, which is why there are two exits
// rather than one:
//
//   - `exit()` — the close gesture. Goes back to the **entry surface**: the item page today, Saved
//     in 5.9. Entry-agnostic by construction (the marker stores an item id, not a route).
//   - `toFeed()` — the pill's Feed button. Goes all the way home, past the item page.
//
// The stack this is navigating, when a reader arrived the ordinary way, is `…feed → /i/x → /g/x`.
// `history.go(-2)` lands on the intact feed with zero draws. It is only correct when *both* markers
// line up — that's the proof both entries are really there — and anything else falls back to the
// documented cold-open path.

export interface ExitGallery {
  /** Close the gallery: pop to the entry surface, or push it if there's nothing behind. */
  exit: () => void;
  /** Leave for the feed entirely: pop past the item page, or build a focused feed. */
  toFeed: () => void;
}

export function useExitGallery(entryItemId: string): ExitGallery {
  const router = useRouter();

  const exit = React.useCallback(() => {
    // Read at call time, never at render: the server has no `sessionStorage`, so deciding this
    // during render would either be a hydration mismatch or an unconditional cold-open branch.
    if (cameFromApp(entryItemId)) {
      router.back();
      return;
    }
    // Cold-opened `/g/` — a shared link, a bookmark, a PWA resume. There is nothing behind this
    // page, so "back" would leave Ambit. Push the item page instead: it is the canonical home of
    // this picture (SPEC §8.1), and where a reader closing the gallery means to end up.
    router.push(`/i/${entryItemId}`);
  }, [entryItemId, router]);

  const toFeed = React.useCallback(() => {
    // Both markers, or neither path. `cameFromApp` says `/i/x → /g/x` is on the stack;
    // `cameFromFeed` says `feed → /i/x` is under that. Together they're the two entries `go(-2)`
    // is about to skip, and checking only one would sometimes skip a page that isn't there.
    if (cameFromApp(entryItemId) && cameFromFeed(entryItemId)) {
      history.go(-2);
      return;
    }
    // The documented cold-open path (`use-leave-to-feed.ts`): build a feed with this item under
    // the reader's eye, rather than popping out of the app.
    router.push(`/feed?focus=${entryItemId}`);
  }, [entryItemId, router]);

  return { exit, toFeed };
}
