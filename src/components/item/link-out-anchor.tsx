"use client";

import * as React from "react";

import { useUsage } from "~/components/usage/usage-provider";

// The one client island in `LinkOutRow`. The row is server-safe on purpose (the reader renders it
// from a server component, and a function prop cannot cross that boundary), so the click handler
// lives in this tiny anchor instead. Records `item.linkout` — that the reader left for the
// original, never where it points: the URL stays out of the usage tables.
//
// `onClick` covers a left click (and Enter); `onAuxClick` covers a middle click, which opens the
// same link in a new tab and fires `auxclick` rather than `click`.
export function LinkOutAnchor({
  itemId,
  ...rest
}: React.ComponentProps<"a"> & { itemId: string }) {
  const { track } = useUsage();
  const record = () => track("item.linkout", { itemId });
  return (
    <a
      {...rest}
      onClick={record}
      onAuxClick={(e) => {
        // `auxclick` is every non-primary button — a right-click (the context menu) included.
        // Only the middle button opens the link.
        if (e.button === 1) record();
      }}
    />
  );
}
