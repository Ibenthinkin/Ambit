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
  /** "thumb" (default): the sheets' small rows, card-2 gaps and cells. "tile": the Collections
   *  tab — #141414 gaps, #1A1A1A fillers, a bare 1 px outline when empty (DESIGN §6.5). */
  variant?: "thumb" | "tile";
}

export function CoverMosaic({
  covers,
  className,
  placeholderSize = 26,
  variant = "thumb",
}: CoverMosaicProps) {
  const tile = variant === "tile";
  const shown = covers.slice(0, 4);

  if (shown.length === 0) {
    return (
      <div
        data-testid="cover-mosaic"
        data-count={0}
        className={cn(
          "flex items-center justify-center",
          tile
            ? "border-ink/12 border"
            : "border-hairline border-ink/10 bg-ink/3",
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
      // `bg-card-2` shows through the 1 px gaps (and fills the empty cells) — DESIGN §6.1.
      className={cn(
        "grid grid-cols-2 grid-rows-2 overflow-hidden",
        tile ? "gap-0.5 bg-[#141414]" : "bg-card-2 gap-px",
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
          <div
            key={i}
            data-filler
            className={cn("min-h-0", tile ? "bg-[#1A1A1A]" : "bg-card-2")}
          />
        ),
      )}
    </div>
  );
}
