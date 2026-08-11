"use client";

import * as React from "react";

// Gallery's details sheet, generalized into a reusable overlay (Ambit - Gallery.dc.html
// ~78-86): a 26px-top-radius panel sliding up from the bottom over a blurred scrim. Closes on
// scrim click or Escape. Drag-to-close (the prototype's pointer-tracked `sheetDrag` state) is
// explicitly **5.5's** problem — this primitive only implements the two programmatic close
// paths; the grabber below is decorative until then.
export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    // z-[35] mirrors the prototype's own stacking value — there's no `--z-*` theme namespace to
    // draw a name from (PHASE5_PLAN.md flagged this unverified; arbitrary value it is).
    <div className="absolute inset-0 z-[35]">
      <div
        data-testid="bottom-sheet-scrim"
        onClick={onClose}
        className="animate-scrim-in bg-scrim/66 absolute inset-0 backdrop-blur-[3px]"
      />
      <div className="border-hairline animate-sheet-up bg-surface shadow-sheet rounded-t-sheet border-ink/12 absolute inset-x-0 bottom-0 max-h-[80%] overflow-y-auto border-t px-[26px] pt-2 pb-10">
        {/* Grabber — purely decorative until 5.5 wires up drag-to-close. Left at the
            prototype's own 0.24 alpha rather than forced onto the text/border/fill ladder,
            which doesn't have a "solid indicator bar" category to normalize this into. */}
        <div className="flex flex-col items-center py-4">
          <div className="rounded-pill bg-ink/24 h-[5px] w-10" />
        </div>
        {children}
      </div>
    </div>
  );
}
