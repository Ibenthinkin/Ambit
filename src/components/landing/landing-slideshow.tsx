"use client";

import type { LandingSlide } from "./landing-slides";

// The slideshow's pixels, and nothing else — no timers, no state. `LandingScreen` owns the run and
// the index; this renders whichever one is current.
//
// **Why every slide is mounted at once rather than swapping a single `<img src>`.** A cross-fade
// needs both frames on screen at the same time, and swapping the `src` of one element gives you a
// blank flash instead: the browser tears down the decoded bitmap the moment the attribute changes.
// Eight stacked layers whose `opacity` is toggled costs nothing (the GPU composites them) and is
// the only way the fade is a fade.

export interface LandingSlideshowProps {
  run: readonly LandingSlide[];
  index: number;
  /** Cross-fade duration in ms — `fadeMs(SLIDE_MS)`. */
  fade: number;
  /** Tapping the imagery skips to the sign-in sheet. Omitted in static mode. */
  onTap?: () => void;
}

export function LandingSlideshow({
  run,
  index,
  fade,
  onTap,
}: LandingSlideshowProps) {
  return (
    <div
      data-testid="landing-slideshow"
      // A plain div with a handler, deliberately not a <button>: the floating glyph is the
      // accessible control for "open sign-in", and a second focusable element with the same
      // meaning would both clutter the tab order and break `getByRole` in the e2e suite. This is a
      // convenience for the thumb, and `aria-hidden` says so.
      aria-hidden
      onClick={onTap}
      className="bg-bg-app fixed inset-0 overflow-hidden"
    >
      {run.map((slide, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={slide.src}
          src={slide.src}
          alt=""
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          style={{
            opacity: i === index ? 1 : 0,
            transition: `opacity ${fade}ms ease`,
            // The handoff's grade: pulled-back saturation and a touch of contrast, so eight
            // unrelated works read as one surface rather than a slideshow of postcards.
            filter: "saturate(0.72) contrast(1.06)",
          }}
        />
      ))}

      {/* Darkens top and bottom so the wordmark and the sheet's edge stay legible over whatever
          image happens to be underneath them. The stops are the prototype's. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(12,11,9,0.62) 0%, rgba(12,11,9,0.3) 30%, rgba(12,11,9,0.55) 66%, rgba(12,11,9,0.85) 100%)",
        }}
      />
    </div>
  );
}
