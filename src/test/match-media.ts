import { act } from "@testing-library/react";
import { vi } from "vitest";

/**
 * A `window.matchMedia` stand-in for jsdom, which has none. `matching` lists the queries that
 * report `matches: true`; everything else (including `prefers-reduced-motion`, which
 * `BottomSheet` also asks about) reports false. `fire` flips one query and notifies its
 * listeners, which is how a test says "the window was resized across the breakpoint".
 *
 * Every media-query list object returned here carries `addEventListener` /
 * `removeEventListener`, because `useMediaQuery` subscribes through them — a stub that
 * returns a bare `{ matches }` would throw the moment a component using the hook mounts.
 */
export function stubMatchMedia(matching: string[]) {
  const state = new Map(matching.map((q) => [q, true]));
  const listeners = new Map<string, Set<() => void>>();

  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return state.get(query) === true;
    },
    media: query,
    addEventListener: (_type: "change", cb: () => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)!.add(cb);
    },
    removeEventListener: (_type: "change", cb: () => void) => {
      listeners.get(query)?.delete(cb);
    },
  }));

  return {
    fire(query: string, matches: boolean) {
      state.set(query, matches);
      act(() => {
        for (const cb of listeners.get(query) ?? []) cb();
      });
    },
  };
}
