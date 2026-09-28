"use client";

import { ViewGlyph } from "~/components/icons/view-glyph";
import { RailButton } from "~/components/ui/rail-toolbar";

// The desktop item screen's one extra control (docs/DESIGN_spread-mode.md D4): flips between one
// picture and a two-page spread — "magazine view", in Ben's view-toggle design
// (`docs/viewTOggleTOkens/`). A plain toggle rather than a pick list — with two states a menu is a
// click spent on nothing. `aria-pressed` is what tells a screen reader it is a toggle and which
// way it is set; the label names the "on" state, which is the convention for a pressed-state
// button. `M` flips it too — the key lives in the item screen's keydown handler, beside the
// arrows.
//
// While pressed the glyph sits on the design's 14% white tile, so the on state reads even in
// Safari, which swaps the glyph without the morph. The tile is the design's 36 px / 10 px radius
// scaled by the rail's ~1.12, like every other glyph in it.

export function SpreadToggle({
  spread,
  onToggle,
}: {
  spread: boolean;
  onToggle: () => void;
}) {
  return (
    <RailButton label="Magazine view" pressed={spread} onClick={onToggle}>
      <span
        className={`inline-flex size-10 items-center justify-center rounded-[11px] transition-colors duration-200 ${
          spread ? "bg-white/14" : "bg-transparent"
        }`}
      >
        <ViewGlyph
          mode={spread ? "spread" : "single"}
          size={30}
          className="text-white/86"
        />
      </span>
    </RailButton>
  );
}
