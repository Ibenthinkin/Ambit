"use client";

import * as React from "react";

import { inter } from "~/lib/fonts";
import { cn } from "~/lib/utils";

import { OVERTURE, type OverturePhase } from "./use-overture";

// The opening line (docs/DESIGN_landing-redo.md D4): `AMBIT — A quieter way to be curious.` on
// black, whose tail collapses into the wordmark — and then the whole line goes with the cut into
// the reel. Ben, 09-26-26: no text hovering over the slideshow. (Until then the wordmark stayed over
// the pictures in `mix-blend-mode: difference`; the blend is kept for the collapse, which plays over
// the reel's first frame whenever the pictures beat the overture.)
//
// Copied from the reference's `#intro-text`, with one deliberate difference: the reference
// collapses the tail with a `width` transition, which moves its siblings and is counted as layout
// shift. Here the tail keeps its box and is clipped (`clip-path`) and faded, while the wordmark is
// translated by half the tail's measured width — which is exactly where it would sit if the line
// were only the wordmark. Same motion, compositor only, CLS 0.
//
// The measured half-width is written as a CSS variable on the element, imperatively, in a layout
// effect: it is a pixel value that only the DOM knows, it must land before the first collapsing
// frame paints, and a state round-trip would cost a render for nothing.
//
// **Reduced motion gets the same line and the same collapse** (Ben, 09-26-26, after a day of a
// plain-fade variant on both his devices read as "the text animation is gone"): the root carries
// `.motion-gentle`, which exempts it from globals.css's 0.01 ms rule. The reel is what reduced
// motion changes (the `gentle` tempo — no drift, a soft first frame).

export const WORDMARK = "AMBIT";
export const TAGLINE = " — A quieter way to be curious.";

export interface OvertureProps {
  phase: OverturePhase;
  /** The sheet is up: nothing renders. */
  hidden?: boolean;
}

const EASE = "cubic-bezier(.4,0,.2,1)";
// No fill mode, deliberately: the keyframe has no delay and ends at opacity's natural value, so a
// fill does nothing visible — and a `both`-filled *finished* animation keeps holding opacity in the
// style a transition is computed from (final review, 09-26-26).
const FADE_IN = `overture-in ${OVERTURE.fadeInMs}ms ease`;

export function Overture({ phase, hidden = false }: OvertureProps) {
  const markRef = React.useRef<HTMLSpanElement>(null);
  const tailRef = React.useRef<HTMLSpanElement>(null);

  React.useLayoutEffect(() => {
    if (phase !== "collapse" || !tailRef.current || !markRef.current) return;
    const half = tailRef.current.getBoundingClientRect().width / 2;
    markRef.current.style.setProperty("--drift", `${half}px`);
  }, [phase]);

  if (hidden || phase === "done") return null;
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
        // Opts out of globals.css's reduced-motion collapse: reduced-motion readers get this line
        // and its collapse too, and at 0.01 ms the collapse would be a jump.
        "motion-gentle",
        "text-[clamp(15px,2vw,25px)] font-normal whitespace-nowrap",
      )}
      style={{ animation: FADE_IN }}
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
    </div>
  );
}
