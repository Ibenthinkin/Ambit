"use client";

import * as React from "react";

// The accent knob's canonical home (Phase 5.10). The four accents lived on `/dev/tokens` from 5.1
// until Settings gave them a real picker; this module is now the one place they're listed, and
// `/dev/tokens` imports from here.
//
// The mechanism itself is unchanged and predates this file: `[data-accent]` on `<html>` selects a
// different `--accent-raw` in globals.css's `@layer base`, and because `--color-accent` is declared
// in an `@theme inline` block every `bg-accent`/`text-accent` utility re-resolves live when the
// attribute changes — no rebuild, no reload. All this file adds is *persistence*.
//
// **Per-device, in localStorage, not a user column.** A column would mean a migration, a write on
// every tap, and a round trip before the app could paint in the right color; the accent is a
// preference about this screen, and a phone and a laptop wanting different ones is reasonable. If
// cross-device sync ever matters, a column can be added later and seeded from this value.
//
// ⚠️ KEEP IN SYNC WITH `src/app/layout.tsx`'s inline `<head>` script. That script re-applies the
// stored accent before first paint (otherwise the page paints indigo and flips, which is exactly
// the flash this is meant to avoid), and it runs before any module has loaded, so it cannot import
// from here. The storage key and the four valid keys are duplicated there deliberately.

/**
 * The four accents, with their literal hexes.
 *
 * The hexes are duplicated from globals.css's `@layer base` for one specific reason (the same one
 * `/dev/tokens` gave when it owned this list): a swatch has to paint its color *before* the
 * attribute is switched to it, so `bg-accent` — which always resolves to the *current* accent —
 * would render four identical dots.
 */
export const ACCENTS = [
  { key: "indigo", label: "Indigo", hex: "#4C5FE0" },
  { key: "amber", label: "Amber", hex: "#D9A73C" },
  { key: "green", label: "Green", hex: "#3FA35C" },
  { key: "red", label: "Red", hex: "#D9483F" },
] as const;

export type AccentKey = (typeof ACCENTS)[number]["key"];

/** The value the server always renders — see `layout.tsx`'s `suppressHydrationWarning`. */
export const DEFAULT_ACCENT: AccentKey = "indigo";

const KEY = "ambit.accent.v1";

function isAccentKey(value: string | null): value is AccentKey {
  return ACCENTS.some((accent) => accent.key === value);
}

/**
 * The stored accent, or the default. Safe to call in any environment: Safari in Lockdown/private
 * mode throws on *any* storage access, and an unrecognized stored value (a hand-edited entry, a key
 * from a future build) falls back rather than writing a bogus attribute onto `<html>`.
 *
 * Client-only by construction — call it from an effect, never during render, or the server's HTML
 * and the client's first render disagree.
 */
export function storedAccent(): AccentKey {
  try {
    const value = localStorage.getItem(KEY);
    return isAccentKey(value) ? value : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

/**
 * Applies an accent to the live document and remembers it. Both halves are wrapped: a failed write
 * costs the user persistence, not the accent itself, so the attribute is set first and separately.
 */
export function setAccent(key: AccentKey): void {
  try {
    document.documentElement.dataset.accent = key;
  } catch {
    // No document (SSR, a worker). Nothing to paint, so nothing to do.
  }
  try {
    localStorage.setItem(KEY, key);
  } catch {
    // Storage denied — the accent still applies for this session, it just won't survive a reload.
  }
  for (const listener of listeners) listener();
}

// ── the accent as an external store ─────────────────────────────────────────────────────────────
// The accent genuinely lives *outside* React — in localStorage and on an attribute of `<html>` —
// and it is unreadable during a server render. That is the exact shape `useSyncExternalStore`
// exists for, and using it rather than a `useState` + `useEffect` pair buys the one thing this
// needs: `getServerSnapshot` runs for both the server render *and* the hydration render, so the
// two agree by construction and the real value arrives on the pass after. (A `setState` in an
// effect would do the same thing a frame later, and is what `react-hooks/set-state-in-effect`
// rightly objects to.)

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * No cache: `useSyncExternalStore` compares snapshots with `Object.is`, and this returns a string,
 * so reading storage on every render is already identity-stable by value. A cache would only add a
 * way for the stored value and React's idea of it to disagree.
 */
function getSnapshot(): AccentKey {
  return storedAccent();
}

/**
 * The current accent, or `null` on the server and during hydration.
 *
 * The null is deliberate and load-bearing: a caller renders no value at all until the real one is
 * known, rather than rendering the default and flipping. (The *paint* is already correct by then —
 * layout.tsx's inline script sets the attribute before first paint. This hook is only about what
 * React knows.)
 */
export function useAccent(): AccentKey | null {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => null);
}
