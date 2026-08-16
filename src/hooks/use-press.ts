"use client";

import * as React from "react";

// The app's one press gesture (design handoff README, "Slop guard — implement once, use
// everywhere"). Distinguishes a *tap* from a *long press* from a *scroll*, which sounds trivial
// and is not: on a touch device every scroll begins as a pointer-down on whatever the thumb
// happened to land on, so a naive `onClick` fires constantly while the user is just moving the
// feed past. Hence the slop guard — a press that travels more than `slopPx` before release was
// never a tap.
//
// Ported from the prototype's handler (`Ambit - Feed Masonry 3.dc.html:372-406`) with one
// deliberate divergence: the prototype uses a 10px slop, the README states 12px as the global
// rule, and 12px wins (the prototype's value sits inside it, so nothing is lost).
//
// Consumers should also carry `select-none touch-manipulation` and, where a long press is wired
// up, `-webkit-touch-callout: none` — without those, iOS Safari raises its own callout menu or
// starts a text selection partway through the gesture and the press never completes.

export interface UsePressOptions {
  /** Fired on release, only if the press neither travelled past the slop nor became a long press. */
  onTap?: () => void;
  /** Fired at `longPressMs`, while the finger is still down. Suppresses the subsequent tap. */
  onLongPress?: () => void;
  longPressMs?: number;
  slopPx?: number;
}

export interface PressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
}

export function usePress({
  onTap,
  onLongPress,
  longPressMs = 450,
  slopPx = 12,
}: UsePressOptions): PressHandlers {
  // Refs, not state, throughout: these change several times per gesture and a re-render mid-press
  // would be pure waste — and worse, would re-run the consumer's render while the finger is down.
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = React.useRef<{ x: number; y: number } | null>(null);
  const moved = React.useRef(false);
  const longFired = React.useRef(false);

  const clearTimer = React.useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // A long press typically opens a sheet, which unmounts the pressed element mid-gesture — so a
  // live timer here would otherwise fire into a dead component.
  React.useEffect(() => clearTimer, [clearTimer]);

  const reset = React.useCallback(() => {
    clearTimer();
    origin.current = null;
    moved.current = false;
    longFired.current = false;
  }, [clearTimer]);

  return {
    onPointerDown: (e) => {
      if (e.button === 2) return; // right-click / secondary — not a press
      origin.current = { x: e.clientX, y: e.clientY };
      moved.current = false;
      longFired.current = false;
      clearTimer();
      if (!onLongPress) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        longFired.current = true;
        // Absent on iOS Safari and known to throw on a few others — never let the haptic break
        // the gesture it's decorating.
        try {
          navigator.vibrate?.(8);
        } catch {
          // no haptics available; the gesture itself is unaffected
        }
        onLongPress();
      }, longPressMs);
    },

    onPointerMove: (e) => {
      if (!origin.current || moved.current) return;
      if (
        Math.abs(e.clientX - origin.current.x) > slopPx ||
        Math.abs(e.clientY - origin.current.y) > slopPx
      ) {
        moved.current = true;
        clearTimer(); // it's a scroll now, not a press
      }
    },

    onPointerUp: () => {
      const wasTap =
        origin.current !== null && !moved.current && !longFired.current;
      reset();
      if (wasTap) onTap?.();
    },

    onPointerCancel: reset,
    onPointerLeave: reset,
  };
}
