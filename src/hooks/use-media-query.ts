"use client";

import * as React from "react";

/** Tailwind's `md`. The one breakpoint this app has — see docs/DESIGN_desktop-polish.md §1. */
export const DESKTOP_QUERY = "(min-width: 768px)";
/** Tailwind's `xl`. Exists only for the feed's fourth column. */
export const WIDE_QUERY = "(min-width: 1280px)";
/**
 * A real hover and a fine pointer — a mouse or a trackpad. The feed's tile strip
 * (`tile-actions.tsx`) is mounted only where this matches: a strip that is merely invisible on a
 * phone would still catch taps across the top of every tile.
 */
export const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Does `query` match right now — as a subscription, not a one-off read.
 *
 * **Why `useSyncExternalStore` and not `useEffect` + `useState`.** The feed's first page is
 * rendered on the server (`app/feed/page.tsx` prefetches it), so the server has to commit to a
 * column count before any browser exists; that is `serverValue`. On the client, React hydrates
 * with the server snapshot and — if `getSnapshot` disagrees — re-renders *synchronously, before
 * paint*. A `useEffect` would paint the phone layout first and then jump, which on a 1440px
 * screen is two columns snapping to four in front of the reader.
 *
 * `matchMedia` is guarded because jsdom doesn't implement it; absent, the hook reports
 * `serverValue`, which keeps every existing component test rendering the phone layout.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const mql = window.matchMedia(query);
      // Optional-chained: an older test stub may return a bare `{ matches }`.
      mql.addEventListener?.("change", onChange);
      return () => mql.removeEventListener?.("change", onChange);
    },
    [query],
  );
  const getSnapshot = React.useCallback(() => {
    if (typeof window.matchMedia !== "function") return serverValue;
    return window.matchMedia(query).matches;
  }, [query, serverValue]);
  const getServerSnapshot = React.useCallback(() => serverValue, [serverValue]);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * How many masonry columns the feed packs: 2 on a phone, 3 from `md`, 4 from `xl`. The server
 * always says 2 — the phone is the first home, and the desktop case hydrates up (see above).
 */
export function useColumnCount(): 2 | 3 | 4 {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const wide = useMediaQuery(WIDE_QUERY);
  if (wide) return 4;
  if (desktop) return 3;
  return 2;
}
