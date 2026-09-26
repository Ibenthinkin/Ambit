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

export const WORDMARK = "AMBIT";
export const TAGLINE = " — A quieter way to be curious.";

export interface OvertureProps {
  phase: OverturePhase;
  /** The sheet is up: nothing renders. */
  hidden?: boolean;
}

const EASE = "cubic-bezier(.4,0,.2,1)";

export function Overture({ phase, hidden = false }: OvertureProps) {
  const markRef = React.useRef<HTMLSpanElement>(null);
  const tailRef = React.useRef<HTMLSpanElement>(null);

  React.useLayoutEffect(() => {
    if (phase !== "collapse" || !tailRef.current || !markRef.current) return;
    const half = tailRef.current.getBoundingClientRect().width / 2;
    markRef.current.style.setProperty("--drift", `${half}px`);
  }, [phase]);

  if (hidden) return null;
  const collapsing = phase === "collapse";

  return (
    <div
      data-testid="overture"
      aria-hidden
      className={cn(
        inter.className,
        // The blend lives here, on the fixed layer: `fixed` + z-index makes this its own stacking
        // context, and a blended child would only blend against this empty group — never the
        // pictures behind it. White in `difference` is the reference's inverting wordmark.
        "pointer-events-none fixed inset-0 z-20 flex items-center justify-center text-white mix-blend-difference",
        // Reduced motion is only known to script after hydration (D8), so the server always
        // renders this line; the media variant hides it from first paint for a reader who asked
        // for less movement, instead of letting it fade in and vanish on the corrective render.
        "motion-reduce:hidden",
        "text-[clamp(15px,2vw,25px)] font-normal whitespace-nowrap",
      )}
      style={{ animation: `overture-in ${OVERTURE.fadeInMs}ms ease both` }}
    >
      <span
        ref={markRef}
        data-testid="overture-mark"
        className="inline-block tracking-[.32em]"
        style={{
          transform: collapsing ? "translateX(var(--drift, 0px))" : "none",
          transition: collapsing
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
            clipPath: collapsing ? "inset(0 100% 0 0)" : "inset(0)",
            opacity: collapsing ? 0 : 1,
            transition: collapsing
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
