"use client";

import * as React from "react";

import { NewCollectionRow } from "~/components/sheets/collection-rows";
import { BottomSheet } from "~/components/ui/bottom-sheet";

// The profile's dashed tile opens this (Phase 5.10). Since 09-10-26 the form itself is
// `NewCollectionRow`, shared with every sheet that offers collections — this shell just gives it a
// title and a sheet to sit in, expanded from the start because there is nothing else here.
//
// Closing unmounts nothing (the sheet animates out), so a half-typed name would survive to the next
// open; the `key` bump on close is what hands the next visit a fresh, empty field.
export interface NewCollectionSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called with the created row so the parent can toast it. */
  onCreated: (collection: { id: string; name: string }) => void;
}

export function NewCollectionSheet({
  open,
  onClose,
  onCreated,
}: NewCollectionSheetProps) {
  const [visit, setVisit] = React.useState(0);
  const close = () => {
    setVisit((v) => v + 1);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={close} title="New collection">
      <div className="px-2 pt-1 pb-2">
        <NewCollectionRow
          key={visit}
          initiallyOpen
          onCreate={(row) => {
            onCreated(row);
            close();
          }}
        />
      </div>
    </BottomSheet>
  );
}
