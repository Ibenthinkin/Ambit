import * as React from "react";

import { Bookmark } from "~/components/icons";
import { cn } from "~/lib/utils";

// A collection's face (docs/DESIGN_list-screens.md §2, decision 3): the four newest pictures in
// a square-cornered 2×2. Sized by the caller — `aspect-square w-full` on the Collections tab,
// `size-9` in a picker row, `size-7` in the tile menu — so the same component is the face at
// every scale.
//
// Three shapes, by count. Nothing: the outline bookmark on a hairline square, the same
// glyph-shows-the-affordance treatment Saved's empty state uses rather than a picture-shaped
// placeholder that promises a picture there isn't. One: it fills the square. Two to four: the
// grid, cells filled in order, the empties a flat `bg-ink/5` so the face reads as "a set with
// room in it" rather than a broken image.
//
// **Square corners.** Ben's "ditch the rounded corners on hero images in every view" applies to
// any picture that is content; the 20 px radius the old single cover wore goes with it.
//
// Plain `<img>`, never `next/image`: arbitrary museum URLs, the same rule as every other image
// surface in the app. `alt=""` — the name beside the face is the accessible label.

export interface CoverMosaicProps {
  /** Newest first, as `saves.collections` returns them. Anything past the fourth is ignored. */
  covers: string[];
  /** The square's size and any position — the component owns no dimensions of its own. */
  className?: string;
  /** The empty state's glyph, in px. 26 on the tab; a row passes 14. */
  placeholderSize?: number;
}

export function CoverMosaic({
  covers,
  className,
  placeholderSize = 26,
}: CoverMosaicProps) {
  const shown = covers.slice(0, 4);

  if (shown.length === 0) {
    return (
      <div
        data-testid="cover-mosaic"
        data-count={0}
        className={cn(
          "border-hairline border-ink/10 bg-ink/3 flex items-center justify-center",
          className,
        )}
      >
        <Bookmark size={placeholderSize} className="text-ink/30" />
      </div>
    );
  }

  if (shown.length === 1) {
    return (
      <div
        data-testid="cover-mosaic"
        data-count={1}
        className={cn("overflow-hidden", className)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shown[0]} alt="" className="size-full object-cover" />
      </div>
    );
  }

  return (
    <div
      data-testid="cover-mosaic"
      data-count={shown.length}
      // `bg-bg` is what shows through the 2 px gaps — the page, not a border colour.
      className={cn(
        "bg-bg grid grid-cols-2 grid-rows-2 gap-[2px] overflow-hidden",
        className,
      )}
    >
      {[0, 1, 2, 3].map((i) =>
        shown[i] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={shown[i]}
            alt=""
            className="size-full min-h-0 object-cover"
          />
        ) : (
          <div key={i} data-filler className="bg-ink/5 min-h-0" />
        ),
      )}
    </div>
  );
}
