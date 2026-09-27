import type * as React from "react";

// The spread toggle's glyph (docs/DESIGN_spread-mode.md D4): one wide bar for a single picture,
// two bars for a spread.
//
// **A placeholder.** It is Ben's drawing for the feed layout picker that was not built
// (docs/layout-picker/), and he is drawing a replacement. Everything outside this file talks to
// it through one prop, `pages`, so the new mark is a one-file swap.
//
// **Always four rects, never one or two.** In the two-bar state pairs of rects sit exactly on top
// of each other and read as one wider bar; in the one-bar state all four do. Keeping the element
// count constant is what lets CSS *transition* between the states — a rect that appeared or
// vanished would just pop. The numbers are copied from `layout-picker.tokens.json`'s
// `glyph.bars` (a 24-unit box; each pair is `[x, width]`), because `docs/` is not in the image.
//
// **The morph is CSS transitions on `x` and `width`,** which SVG 2 made CSS geometry properties.
// Chromium and Safari 17+ animate them; **Firefox does not** and switches instantly — Ben's own
// browser, so the missing morph there is expected, not a bug. Reduce Motion collapses the
// transition through `globals.css`'s global rule, like every other transition in the app.

const BARS = {
  1: [
    [5.5, 13],
    [5.5, 13],
    [5.5, 13],
    [5.5, 13],
  ],
  2: [
    [3, 7.6],
    [3, 7.6],
    [13.4, 7.6],
    [13.4, 7.6],
  ],
} as const;

/** The token file's morph: 320ms on a slightly overshooting ease. */
const MORPH = "320ms cubic-bezier(.3,1.3,.5,1)";

export function LayoutGlyph({
  pages,
  size = 24,
  className,
}: {
  pages: 1 | 2;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
    >
      {BARS[pages].map(([x, width], i) => {
        const style: React.CSSProperties = {
          transition: `x ${MORPH}, width ${MORPH}`,
        };
        return (
          <rect
            // Index keys on purpose: the same four elements must persist across a change of
            // `pages`, or there would be nothing to transition.
            key={i}
            x={x}
            y={4}
            width={width}
            height={16}
            rx={1.2}
            fill="currentColor"
            style={style}
          />
        );
      })}
    </svg>
  );
}
