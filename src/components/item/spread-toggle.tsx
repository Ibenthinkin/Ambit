"use client";

import { LayoutGlyph } from "~/components/icons/layout-glyph";
import { RailButton } from "~/components/ui/rail-toolbar";

// The desktop item screen's one extra control (docs/DESIGN_spread-mode.md D4): flips between one
// picture and a two-page spread. A plain toggle rather than Ben's drawn pick list — with two
// states a menu is a click spent on nothing. `aria-pressed` is what tells a screen reader it is a
// toggle and which way it is set; the label names the "on" state, which is the convention for a
// pressed-state button.

export function SpreadToggle({
  spread,
  onToggle,
}: {
  spread: boolean;
  onToggle: () => void;
}) {
  return (
    <RailButton
      label="Two pictures at a time"
      pressed={spread}
      onClick={onToggle}
    >
      <LayoutGlyph pages={spread ? 2 : 1} size={30} className="text-white/82" />
    </RailButton>
  );
}
