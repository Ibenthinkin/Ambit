"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

// Where the feed puts you back when you return to it.
//
// Two mechanisms, in priority order, because they answer two different questions:
//
//   1. `?focus={itemId}` — "I just came back from that item's page." The item page's Back link
//      carries the id, so the feed can put that exact tile under the reader's eye rather than
//      merely near where they were.
//   2. `sessionStorage` — "I came back some other way" (browser back, a reload, the PWA resuming).
//      A remembered offset is a blunter instrument, but it beats the top of the page.
//
// **What actually happens on a return, verified in the browser (08-17-26)** — worth knowing before
// changing anything here, because it isn't what you'd assume:
//
//   - **Popping history preserves the feed.** The App Router restores /feed's RSC payload from the
//     client router cache, so the same tiles are still there and `?focus=` can find its target.
//     This is now the normal return path: `BackToFeed` pops whenever the reader arrived from the
//     feed (see `feed-origin.ts`), and an e2e test pins it — same tile ids, zero requests for
//     `/feed` or `feed.page`.
//   - **Following a fresh `<Link href="/feed?focus=…">` does not.** `/feed` is a dynamic route, so
//     that navigation re-runs the server component, and `getFeedPage` never repeats items — the
//     feed you land on is made of entirely different cards. The focused tile is genuinely gone,
//     and falling back to the remembered offset is the only honest thing left to do. That path
//     now only happens where it is the *right* answer — a cold-opened shared link, which has no
//     feed behind it to go back to. Until 08-20-26 it was the path every return took, at a cost
//     of two pages of corpus each (the RSC render draws one, the client query another) plus the
//     reader's place in the feed.
//
// The two races this has to survive, both found the same way — by watching it fail in Chrome:
//
//   - **The document is short when the effect first runs.** Images haven't laid out yet, so
//     `scrollTo({top: 900})` clamps to whatever the page currently allows and silently lands at 0.
//     Hence the retry schedule, and hence checking where we actually ended up rather than assuming.
//   - **The persist listener eats its own tail.** A clamped restore scrolls the page, which fires
//     `scroll`, which writes the clamped offset over the saved one — so by the second attempt
//     there's nothing left to restore to. Persistence therefore stays off until the restore
//     sequence has settled.
//
// All of it is best-effort by nature: a feed that fails to restore its scroll is mildly annoying,
// a feed that throws while trying is not a feed.

const SCROLL_KEY = "ambit.feedScroll.v1";

/** How far below the top of the viewport the focused tile is parked. Clears the 58px top inset. */
const FOCUS_OFFSET = 84;

/** Close enough, in px, to call a scroll landed — and to call the reader "hasn't moved". */
const EPSILON = 4;

/**
 * Retry schedule, in ms after mount. It needs one because the page genuinely isn't measurable yet:
 * hydration has to finish, and the images above the target have to occupy their slots before any
 * offset means anything. Each attempt re-reads the DOM; the schedule stops as soon as one lands.
 */
const RETRIES_MS = [90, 350, 800];

export function useFeedScroll(): void {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");

  // Persistence stays off until the restore sequence gives up or lands — see the header.
  const settledRef = React.useRef(false);

  React.useEffect(() => {
    settledRef.current = false;
    // Whatever this hook last scrolled to. Used to tell "the page hasn't moved since our attempt"
    // from "the reader has taken over", which a bare `scrollY === 0` check cannot.
    let lastSet: number | null = null;

    /** Matched by attribute so an id straight off the query string never has to be escaped. */
    const focusTarget = () =>
      focusId
        ? [...document.querySelectorAll("[data-feed-id]")].find(
            (node) => node.getAttribute("data-feed-id") === focusId,
          )
        : undefined;

    /**
     * @param isLast whether the retry schedule is exhausted after this attempt.
     * @returns whether this attempt settled the question (landed, or gave up for good).
     */
    const attempt = (isLast: boolean): boolean => {
      // The reader scrolling for themselves ends the whole business immediately — nothing this
      // hook wants is more important than where they just chose to be.
      const untouched =
        lastSet === null
          ? window.scrollY < EPSILON
          : Math.abs(window.scrollY - lastSet) <= EPSILON;
      if (!untouched) return true;

      /** @returns whether the document was actually tall enough to honor the scroll. */
      const land = (target: number): boolean => {
        window.scrollTo({ top: target });
        lastSet = window.scrollY;
        return Math.abs(window.scrollY - target) <= EPSILON;
      };

      const el = focusTarget();
      if (el) {
        // Clamped at zero rather than guarded against it: focusing a tile in the top row is a
        // perfectly ordinary request that computes to a negative offset, and it means "top".
        return land(
          Math.max(
            0,
            window.scrollY + el.getBoundingClientRect().top - FOCUS_OFFSET,
          ),
        );
      }

      // A focus id outranks the remembered offset, so keep waiting for its tile rather than
      // restoring now and hopping to the tile a moment later — two scrolls read as a glitch.
      // Once the schedule is spent, the tile genuinely isn't coming and the offset is all there is.
      if (focusId && !isLast) return false;

      const saved = Number(sessionStorage.getItem(SCROLL_KEY) ?? "");
      if (!Number.isFinite(saved) || saved <= 0) return true;
      return land(saved);
    };

    const last = RETRIES_MS.length - 1;

    if (attempt(RETRIES_MS.length === 0)) {
      settledRef.current = true;
      return;
    }

    const timers = RETRIES_MS.map((delay, index) =>
      setTimeout(() => {
        if (settledRef.current) return;
        if (attempt(index === last) || index === last)
          settledRef.current = true;
      }, delay),
    );

    return () => {
      timers.forEach(clearTimeout);
      settledRef.current = true;
    };
  }, [focusId]);

  // Remember where we are. `passive` because this listener never calls `preventDefault` and saying
  // so lets the browser scroll without waiting on it; rAF-throttled because `scroll` fires far more
  // often than sessionStorage deserves to be written.
  React.useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // See the header: writing while a restore is mid-flight overwrites the offset being
        // restored to with the clamped one it just produced.
        if (!settledRef.current) return;
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
