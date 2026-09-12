"use client";

import * as React from "react";

import { GRID_COLS } from "~/components/feed/masonry";
import { useProfileHub } from "~/components/profile/profile-hub";
import { Rise } from "~/components/ui/rise";
import { useColumnCount } from "~/hooks/use-media-query";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { CollectionTile, NewCollectionTile } from "./collection-tile";
import { NewCollectionSheet } from "./new-collection-sheet";

// The Collections tab — `/profile`'s content (docs/DESIGN_list-screens.md §2). Everything you've
// filed, one face each, the dashed tile first. The identity block, the nav and the toolbar are
// the hub's (`profile-hub.tsx`); this file is the grid and the one sheet that adds to it.
//
// No heading: the tab is the heading. The grid packs the feed's column count — two on the phone,
// three from `md`, four from `xl` — through the same literal class map the feed and Saved read.

export function CollectionsTab() {
  const hub = useProfileHub();
  // Prefetched by `app/profile/page.tsx`, input-less.
  const collections = api.saves.collections.useQuery();
  const columnCount = useColumnCount();

  const [newCollectionOpen, setNewCollectionOpen] = React.useState(false);

  return (
    <>
      {/* `pb-[120px]` clears the floating pill, so the last row isn't parked under it. Each tile
          rises on its own, with no stagger — the prototype animates them individually. */}
      <div
        data-testid="collections-grid"
        className={cn("grid gap-4 px-5 pt-[18px] pb-[120px]", GRID_COLS[columnCount])}
      >
        <Rise>
          <NewCollectionTile onClick={() => setNewCollectionOpen(true)} />
        </Rise>
        {collections.data?.map((c) => (
          <Rise key={c.id}>
            <CollectionTile
              id={c.id}
              name={c.name}
              itemCount={c.itemCount}
              covers={c.covers}
            />
          </Rise>
        ))}
      </div>

      <NewCollectionSheet
        open={newCollectionOpen}
        onClose={() => setNewCollectionOpen(false)}
        onCreated={(c) => hub.toast(`${c.name} created`)}
      />
    </>
  );
}
