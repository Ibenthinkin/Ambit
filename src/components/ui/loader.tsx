import * as React from "react";

import { cn } from "~/lib/utils";

// Ben's "Reach" loader (docs/LoaderAnimation/loader/, 10-04-26), replacing the generic ring
// spinner: the Ambit mark — a ring with a dot at its centre — where the dot reaches out to the
// ring, travels once round it and comes home, every 2.4 s. Rebuilt here as a React component
// rather than shipping the design's `<ambit-loader>` web component: `docs/` isn't in the image,
// and every other design in the app is rebuilt in its own components the same way.
//
// **How the motion is built.** Everything is drawn in the design's 26-unit space, in a 26 px box
// scaled to `size` — so the keyframes can say "11.5px" (the ring's radius) and mean it at every
// size. Three animations, all on one 2.4 s cycle (keyframes in globals.css):
//   - the ring's opacity breathes 0.28 ↔ 0.75 (`loader-ring`);
//   - the dot slides out to the ring and shrinks to 0.55 in the first 22%, and back in the last
//     22% (`loader-reach`);
//   - between those, its wrapper turns a full circle (`loader-orbit`) — the dot is offset, so a
//     rotating wrapper carries it round the ring.
//
// **Reduced motion plays the whole thing, on purpose** (Ben, 10-04-26 — the same call as the view
// glyph and the page turn). globals.css collapses every animation to 0.01 ms except inside
// `.motion-gentle`, so the mark span carries that class. The design also offers a `calm` variant
// (dot still, ring pulsing) for reduced motion; it is deliberately not built.
//
// The colour is `currentColor`, `text-accent` by default, so the accent knob recolours it live;
// on an accent-filled button pass `className="text-on-accent"`.

export const LOADER_SIZES = { inline: 18, block: 26, hero: 64 } as const;

/** The design's units: a 26-unit box, the ring at r 11.5, the dot at r 3.6. */
const UNITS = 26;
const RING_R = 11.5;
const DOT_R = 3.6;
/** Below this the 1.7 stroke renders under a pixel and the ring vanishes; draw it at 2. */
const SMALL_BELOW_PX = 22;

export interface LoaderProps {
  /** Rendered size in px. 18 inline (the default), 26 for a block wait, 64 hero. */
  size?: number;
  /** Visible text beside the mark, and its accessible name. */
  label?: string;
  className?: string;
}

export function Loader({
  size = LOADER_SIZES.inline,
  label,
  className,
}: LoaderProps) {
  return (
    <span
      role="status"
      aria-label={label ?? "Loading"}
      className={cn(
        "text-accent inline-flex items-center gap-[10px] align-middle",
        className,
      )}
    >
      <span
        data-loader-box
        aria-hidden="true"
        className="relative flex-none"
        style={{ width: size, height: size }}
      >
        <span
          data-loader-mark
          className="motion-gentle absolute top-0 left-0 size-[26px] origin-top-left"
          style={{ transform: `scale(${size / UNITS})` }}
        >
          <svg
            width={UNITS}
            height={UNITS}
            viewBox={`0 0 ${UNITS} ${UNITS}`}
            className="absolute inset-0 overflow-visible"
          >
            <circle
              className="animate-loader-ring"
              cx={UNITS / 2}
              cy={UNITS / 2}
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth={size < SMALL_BELOW_PX ? 2 : 1.7}
            />
          </svg>
          {/* Turns about the box's centre, which is the ring's centre; the dot rides it. */}
          <span className="animate-loader-orbit absolute inset-0">
            <span
              className="animate-loader-reach absolute rounded-full bg-current"
              style={{
                left: UNITS / 2 - DOT_R,
                top: UNITS / 2 - DOT_R,
                width: DOT_R * 2,
                height: DOT_R * 2,
              }}
            />
          </span>
        </span>
      </span>
      {label ? (
        <span className="text-ink/40 font-sans text-[14px] leading-[1.3]">
          {label}
        </span>
      ) : null}
    </span>
  );
}
