"use client";

import * as React from "react";

import { DESKTOP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import {
  PillToolbar,
  type PillToolbarProps,
} from "~/components/ui/pill-toolbar";
import { RailToolbar } from "~/components/ui/rail-toolbar";

// The toolbar every ordinary screen mounts: the phone pill below `md`, the desktop rail from it
// (docs/DESIGN_chrome-redesign.md §2). The server snapshot is the pill; a desktop client
// re-renders before paint, the way the feed's column count does (`use-media-query.ts`). The item
// screen does not use this — it places the pill *inside* its fading caption and the rail
// *outside* it, so it renders each by hand.
export function Toolbar(props: PillToolbarProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  return desktop ? <RailToolbar {...props} /> : <PillToolbar {...props} />;
}
