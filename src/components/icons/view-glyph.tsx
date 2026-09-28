// The spread toggle's glyph (docs/DESIGN_spread-mode.md D4) — Ben's Claude Design mark from
// `docs/viewTOggleTOkens/view-toggle/`, replacing the bars placeholder: **one page** for a single
// picture, **an open magazine** for a spread.
//
// **Always two filled paths, one per page, with the same command structure in both states.** In
// single view the halves meet at x=12 and read as one page; in a spread they part by a 1.4-unit
// gutter and their top and bottom edges curve like pages lifting off a spine. Identical commands
// are what let the browser interpolate `d` between them — a path that gained or lost a point
// would just pop. The numbers are copied from `view-toggle.tokens.json` because `docs/` is not in
// the image.
//
// **The morph is a CSS transition on `d`,** set as a `path('…')` style so it can animate, with
// the same string on the `d` attribute as the fallback. Chromium animates it; the design's README
// says Safari and Firefox swap instantly, so a missing morph in Ben's Firefox is expected. Reduce Motion collapses the transition through `globals.css`'s global rule,
// like every other transition in the app.

const PAGES = {
  single: {
    left: "M12 4C12 4 6.5 4 6.5 4V20C6.5 20 12 20 12 20Z",
    right: "M12 4C12 4 17.5 4 17.5 4V20C17.5 20 12 20 12 20Z",
  },
  spread: {
    left: "M11.3 6.4C8.8 5 5.8 4.6 2.5 5.3V18.9C5.8 18.2 8.8 18.6 11.3 20Z",
    right:
      "M12.7 6.4C15.2 5 18.2 4.6 21.5 5.3V18.9C18.2 18.2 15.2 18.6 12.7 20Z",
  },
} as const;

/** The token file's morph: 420ms on a slightly overshooting ease. */
const MORPH = "d 420ms cubic-bezier(.3,1.3,.5,1)";

export function ViewGlyph({
  mode,
  size = 24,
  className,
}: {
  mode: "single" | "spread";
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
      {[PAGES[mode].left, PAGES[mode].right].map((d, i) => (
        <path
          // Index keys on purpose: the same two elements must persist across a change of
          // `mode`, or there would be nothing to transition.
          key={i}
          d={d}
          fill="currentColor"
          style={{ d: `path('${d}')`, transition: MORPH }}
        />
      ))}
    </svg>
  );
}
