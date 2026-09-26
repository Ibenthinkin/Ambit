"use client";

import * as React from "react";

import { inter } from "~/lib/fonts";
import { cn } from "~/lib/utils";

import { OVERTURE, type OverturePhase } from "./use-overture";

// The opening line (docs/DESIGN_landing-redo.md D4): `AMBIT — A quieter way to be curious.` on
// black, whose tail collapses into the wordmark; the wordmark then stays over the reel at fixed
// size in `mix-blend-mode: difference` (on the fixed layer — see below), inverting whatever
// picture is behind it.
//
// Copied from the reference's `#intro-text`, with one deliberate difference: the reference
// collapses the tail with a `width` transition, which moves its siblings and is counted as layout
// shift. Here the tail keeps its box and is clipped (`clip-path`) and faded, while the wordmark is
// translated by half the tail's measured width — which is exactly where it would sit if the line
// were only the wordmark. Same motion, compositor only, CLS 0. On `done` the tail unmounts and the
// line re-centres on the wordmark alone in the same frame the transform is dropped, so nothing
// visibly moves.
//
// The measured half-width is written as a CSS variable on the element, imperatively, in a layout
// effect: it is a pixel value that only the DOM knows, it must land before the first collapsing
// frame paints, and a state round-trip would cost a render for nothing.
//
// **Under reduced motion** (`gentle`, D6 as of 09-26-26) none of that runs: the whole line fades
// out over the same 2.2 s, and on `done` the root is re-keyed so the wordmark remounts centred and
// fades back in by itself. Opacity is the only property that ever changes. The old
// `motion-reduce:hidden` is gone with it — the reduced-motion reader is meant to see this line now.

export const WORDMARK = "AMBIT";
export const TAGLINE = " — A quieter way to be curious.";

export interface OvertureProps {
  phase: OverturePhase;
  /** The sheet is up: nothing renders. */
  hidden?: boolean;
  /**
   * Reduced motion (D6): the collapse is a plain fade of the whole line, then the wordmark alone
   * fades back in. Opacity is the only property that moves. Read after hydration, so `in` must
   * render identically with and without it — it does: the prop only matters from `collapse` on.
   */
  gentle?: boolean;
}

const EASE = "cubic-bezier(.4,0,.2,1)";
const FADE_IN = `overture-in ${OVERTURE.fadeInMs}ms ease both`;

export function Overture({
  phase,
  hidden = false,
  gentle = false,
}: OvertureProps) {
  const markRef = React.useRef<HTMLSpanElement>(null);
  const tailRef = React.useRef<HTMLSpanElement>(null);

  React.useLayoutEffect(() => {
    if (gentle || phase !== "collapse" || !tailRef.current || !markRef.current)
      return;
    const half = tailRef.current.getBoundingClientRect().width / 2;
    markRef.current.style.setProperty("--drift", `${half}px`);
  }, [phase, gentle]);

  if (hidden) return null;
  const collapsing = phase === "collapse";
  // The gentle collapse fades the *line*; the full one moves its parts.
  const lineFading = gentle && collapsing;
  const partsMoving = !gentle && collapsing;
  // Gentle `done` remounts the root: the wordmark re-centres and the fade-in plays again for it
  // alone. Full motion keeps the element — its transform is dropped in the same frame the tail
  // unmounts, so nothing visibly moves (see the top of the file).
  const gentleDone = gentle && phase === "done";

  return (
    <div
      key={gentleDone ? "mark" : "line"}
      data-testid="overture"
      aria-hidden
      className={cn(
        inter.className,
        // The blend lives here, on the fixed layer: `fixed` + z-index makes this its own stacking
        // context, and a blended child would only blend against this empty group — never the
        // pictures behind it. White in `difference` is the reference's inverting wordmark.
        "pointer-events-none fixed inset-0 z-20 flex items-center justify-center text-white mix-blend-difference",
        // Opts out of globals.css's reduced-motion collapse: under the preference this line's
        // fades *are* the reduced version (D6), and 0.01 ms fades would be flashes.
        "motion-gentle",
        "text-[clamp(15px,2vw,25px)] font-normal whitespace-nowrap",
      )}
      style={{
        // Dropped once the line starts fading: a finished `both`-filled animation keeps holding
        // opacity 1 and beats inline styles in the cascade, so the 0 below would never paint.
        // Nothing visible changes — it ended 900 ms ago at 1, the property's natural value.
        animation: phase === "in" || gentleDone ? FADE_IN : "none",
        opacity: lineFading ? 0 : undefined,
        transition: lineFading
          ? `opacity ${OVERTURE.collapseMs}ms ease`
          : undefined,
      }}
    >
      <span
        ref={markRef}
        data-testid="overture-mark"
        className="inline-block tracking-[.32em]"
        style={{
          transform: partsMoving ? "translateX(var(--drift, 0px))" : "none",
          transition: partsMoving
            ? `transform ${OVERTURE.collapseMs}ms ${EASE}`
            : "none",
          willChange: "transform",
        }}
      >
        {WORDMARK}
      </span>
      {phase !== "done" ? (
        <span
          ref={tailRef}
          data-testid="overture-tail"
          className="inline-block tracking-[.02em] whitespace-pre"
          style={{
            clipPath: partsMoving ? "inset(0 100% 0 0)" : "inset(0)",
            opacity: partsMoving ? 0 : 1,
            transition: partsMoving
              ? `clip-path ${OVERTURE.collapseMs}ms ${EASE}, opacity ${OVERTURE.tailFadeMs}ms ease`
              : "none",
          }}
        >
          {TAGLINE}
        </span>
      ) : null}
    </div>
  );
}
