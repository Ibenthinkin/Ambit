"use client";

import type { ReelPicture } from "~/server/services/landing-pool";

import type { Tempo } from "./tempos";
import { REEL_SIZES } from "./use-pictures";

// The reel's pixels, and nothing else — no timers, no state (docs/DESIGN_landing-redo.md D5).
// `LandingScreen` owns the index; this paints the layers.
//
// **Three layers, not the whole reel.** A cross-fade needs both frames mounted at once, and
// swapping one `<img src>` gives a blank flash (the browser drops the decoded bitmap the moment
// the attribute changes) — 5.11's reason for mounting all eight of its slides. With `usePictures`
// decoding ahead off-DOM, three is enough: the one leaving, the one showing, the one next. Keyed
// by id so React keeps each element, and its bitmap, across re-renders.
//
// **The ground is pure black** (`#000`, not the app's warm near-black): the reference's cut from
// black into colour is part of the effect, and the overture sits on it. **No grade** — 5.11's
// `saturate(.72) contrast(1.06)` made eight postcards read as one surface; the reference's
// pictures are in their own colour.

export interface LandingReelProps {
  pictures: readonly ReelPicture[];
  index: number;
  prev: number | null;
  tempo: Tempo;
  /** Until the gate opens every layer is transparent and the overture owns the screen. */
  started: boolean;
  /** Tapping the imagery steps to the next picture. Omitted in static mode. */
  onTap?: () => void;
}

export function LandingReel({
  pictures,
  index,
  prev,
  tempo,
  started,
  onTap,
}: LandingReelProps) {
  const n = pictures.length;
  const next = n > 1 ? (index + 1) % n : null;
  // Leaving, current, next — de-duplicated, because with two pictures `prev` and `next` coincide.
  // Out-of-range indices are dropped too: turning the phone swaps to the other shape's reel, and a
  // `prev` from a longer one can point past the end of this one.
  const layers = [prev, index, next].filter(
    (i, k, arr): i is number => i !== null && i < n && arr.indexOf(i) === k,
  );
  const leaving = prev !== null && prev < n ? prev : null;
  // No fade while nothing is leaving: the first frame after the overture (and after a restart) is
  // the reference's hard cut out of black under either tempo (D4). Only picture-to-picture changes
  // take the tempo's fade.
  const cut = tempo.fadeMs === 0 || leaving === null;

  return (
    <div
      data-testid="landing-reel"
      // A plain div with a handler, deliberately not a <button>: the floating glyph is the
      // accessible control for "open sign-in", and this is a convenience for the thumb.
      aria-hidden
      onClick={onTap}
      className="fixed inset-0 overflow-hidden"
      style={{ background: "#000" }}
    >
      {layers.map((i) => {
        const p = pictures[i]!;
        const current = started && i === index;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.id}
            data-id={p.id}
            src={p.src}
            srcSet={p.srcSet ?? undefined}
            sizes={p.srcSet ? REEL_SIZES : undefined}
            alt=""
            decoding="async"
            // The first frame is the page's LCP element; the RSC preloads it at high priority too.
            fetchPriority={i === 0 ? "high" : undefined}
            className="absolute inset-0 size-full object-cover"
            style={{
              opacity: current ? 1 : 0,
              transition: cut ? "none" : `opacity ${tempo.fadeMs}ms ease`,
              // The leaving layer keeps its animation through the fade: removing a CSS animation
              // cancels it and its fill, and the picture would snap from ~1.04 back to scale(1) at
              // full opacity. The element is keyed, so the running animation simply continues.
              animation:
                tempo.drift && started && (i === index || i === leaving)
                  ? `reel-drift ${tempo.frameMs + tempo.fadeMs}ms linear both`
                  : undefined,
              willChange: "opacity, transform",
            }}
          />
        );
      })}

      {/* Darkens the bottom so the sheet's edge and the glyph stay legible over whatever picture is
          underneath. Clear at the top, unlike 5.11's: the wordmark inverts its own ground. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 80%, rgba(0,0,0,0.85) 100%)",
        }}
      />
    </div>
  );
}
