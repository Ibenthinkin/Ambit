"use client";

import * as React from "react";

// Whether the desktop item screen shows one picture or a two-page spread
// (docs/DESIGN_spread-mode.md D4). The reader flips it with the rail's toggle and it is
// remembered on this device.
//
// **localStorage, not a database column, deliberately** — the same call as the accent knob
// (`lib/accent.ts`) and the last-used collection (`lib/last-collection.ts`, whose shape this
// file copies). It is a fact about a *screen*, not about the reader: a computer wants the spread
// and the same reader's phone never gets one. A column would also mean a migration and a round
// trip before first paint for a two-state toggle.
//
// **Why `useSyncExternalStore` and not `useState(() => localStorage…)`.** The server has no
// localStorage, so it renders `"single"`. A lazy `useState` initializer would read `"spread"` on
// the client's first render and React would report a hydration mismatch. The external-store hook
// takes a separate server snapshot, renders that during hydration, then swaps in the real value
// before paint — no mismatch, no visible flash.
//
// Every storage access is wrapped in try/catch: Safari's Lockdown mode throws on each one, and a
// reader there simply gets the single picture.

export const HERO_LAYOUT_KEY = "ambit.heroLayout.v1";

export type HeroLayout = "single" | "spread";

const listeners = new Set<() => void>();

/** Anything but a stored `"spread"` — unset, junk, or a throwing storage — reads as `"single"`. */
export function readHeroLayout(): HeroLayout {
  try {
    return localStorage.getItem(HERO_LAYOUT_KEY) === "spread"
      ? "spread"
      : "single";
  } catch {
    return "single";
  }
}

/** Remember the choice, and tell every mounted reader of it. */
export function writeHeroLayout(layout: HeroLayout): void {
  try {
    localStorage.setItem(HERO_LAYOUT_KEY, layout);
  } catch {
    /* private mode etc. — the toggle still works for this page, it just isn't remembered */
  }
  for (const cb of listeners) cb();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // A flip in another tab should reach this one too.
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

const getServerSnapshot = (): HeroLayout => "single";

export function useHeroLayout(): HeroLayout {
  return React.useSyncExternalStore(
    subscribe,
    readHeroLayout,
    getServerSnapshot,
  );
}
