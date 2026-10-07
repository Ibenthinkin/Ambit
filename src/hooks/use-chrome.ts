"use client";

import * as React from "react";

import { DESKTOP_QUERY, useMediaQuery } from "~/hooks/use-media-query";

// The picture's chrome — the toolbar, and above `md` the caption — and *when* it is on screen.
// Nothing here knows what the chrome is; the item screen renders it and fades it.
//
// Two rule sets, one per side of the app's one breakpoint (docs/DESIGN_redesign.md decision 7,
// §6.2, §6.3). It replaces `useChromeCycle`'s ten-second show/hide loop, which went in the
// redesign on purpose: a caption that comes and goes on its own is a screen that keeps moving
// while you look at it.
//
//   - **A phone** (below `md`): it starts hidden. A tap toggles it — always, both ways. Scrolling
//     the page more than 24 px down shows it, and it then *stays*: scrolling back up does not
//     hide it; only a tap does. A new picture or a zoom puts it away (`hide`). There is no clock
//     and no mouse rule — `wake` is nothing here.
//   - **A computer** (from `md`): it starts hidden. Any input — the caller wires mouse move, key,
//     wheel, touch and scroll — shows it and restarts a 2.6 s idle timer; the timer running out
//     is the *only* thing that hides it. A tap is a wake, never a hide, and `hide` is ignored: a
//     new picture arrives by an arrow key or a drag, both of which are input.
//
// **Why a phone ignores `wake` as well as the caller not wiring it.** After a tap on a touch
// screen the browser fires *compatibility* mouse events, `mousemove` among them. Had a phone
// listened for those, the second tap's hide would be undone in the same instant and the chrome
// could never be put away. The item screen only adds its wake listeners from `md` — and the
// reducer below refuses a phone's wake anyway, so neither half alone can let it back in. A
// touch screen *at* `md` or wider (an iPad on its side) is on the computer rules, where a stray
// compatibility mousemove is harmless: nothing there hides except the clock.
//
// A pure reducer plus a thin hook, so the rules are testable without a DOM and the hook owns
// only the timer and the choice of rule set.

/** Desktop idle: how long after the last input the chrome stays up. The prototype's number. */
export const CHROME_IDLE_MS = 2600;
/** Phone: scrolled *past* this many px, the chrome comes up (and stays). */
export const SCROLL_SHOW_PX = 24;

export interface ChromeState {
  visible: boolean;
  /**
   * Bumped by every desktop wake, so the idle timer restarts even when a wake leaves `visible`
   * where it was — which is the common case (a mouse moving over chrome already showing).
   */
  wakes: number;
}

export type ChromeAction =
  | { type: "toggle"; desktop: boolean }
  | { type: "wake"; desktop: boolean }
  | { type: "scroll"; y: number; desktop: boolean }
  | { type: "hide"; desktop: boolean }
  | { type: "idle"; desktop: boolean };

const INITIAL: ChromeState = { visible: false, wakes: 0 };

/** The two rule sets. Every action carries which one applies, so the reducer stays pure. */
export function chromeReducer(
  state: ChromeState,
  action: ChromeAction,
): ChromeState {
  if (action.desktop) {
    switch (action.type) {
      case "toggle":
      case "wake":
      case "scroll":
        return { visible: true, wakes: state.wakes + 1 };
      case "idle":
        return state.visible ? { ...state, visible: false } : state;
      case "hide":
        return state;
    }
  }
  switch (action.type) {
    case "toggle":
      return { ...state, visible: !state.visible };
    case "scroll":
      return action.y > SCROLL_SHOW_PX && !state.visible
        ? { ...state, visible: true }
        : state;
    case "hide":
      return state.visible ? { ...state, visible: false } : state;
    case "wake":
    case "idle":
      return state;
  }
}

export interface Chrome {
  visible: boolean;
  /** A tap on the picture. A phone flips; a computer wakes. */
  toggle: () => void;
  /** Any desktop input. Nothing on a phone. */
  wake: () => void;
  /** The page's scroll position. A phone shows past 24 px; a computer wakes at any depth. */
  onScroll: (y: number) => void;
  /** A new picture, or a zoom (docs/DESIGN_hero-zoom.md D1). A phone hides; a computer ignores it. */
  hide: () => void;
}

export interface ChromeOptions {
  /**
   * Desktop only: asked when the idle timer runs out. True means keyboard focus is inside the
   * chrome, so it must stay (WCAG 2.4.7: a focused control never fades to `visibility: hidden`);
   * the timer restarts instead of hiding.
   */
  holdWhile?: () => boolean;
}

export function useChrome({ holdWhile }: ChromeOptions = {}): Chrome {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [state, dispatch] = React.useReducer(chromeReducer, INITIAL);

  // The idle timer: desktop only, restarted by every wake (`wakes` moves even when `visible`
  // doesn't). Crossing `md` drops it — a phone has no clock.
  React.useEffect(() => {
    if (!desktop || !state.visible) return;
    const id = setTimeout(
      () => dispatch({ type: holdWhile?.() ? "wake" : "idle", desktop: true }),
      CHROME_IDLE_MS,
    );
    return () => clearTimeout(id);
  }, [desktop, state.visible, state.wakes, holdWhile]);

  const toggle = React.useCallback(
    () => dispatch({ type: "toggle", desktop }),
    [desktop],
  );
  const wake = React.useCallback(
    () => dispatch({ type: "wake", desktop }),
    [desktop],
  );
  const onScroll = React.useCallback(
    (y: number) => dispatch({ type: "scroll", y, desktop }),
    [desktop],
  );
  const hide = React.useCallback(
    () => dispatch({ type: "hide", desktop }),
    [desktop],
  );

  return { visible: state.visible, toggle, wake, onScroll, hide };
}
