"use client";

import * as React from "react";

// The shared bottom-sheet shell: a 22px-top-radius panel sliding up from the bottom over a
// blurred scrim. Closes on scrim click or Escape. Drag-to-close (the prototypes' pointer-tracked
// sheet drag), the centered title slot, and an exit animation are all **5.5's** problem — this
// primitive only implements the two programmatic close paths, and the grabber below is decorative
// until then.
//
// Phase 5.4 note: the `animate-sheet-up` class now resolves to the redesign's snappier 260ms
// `sheetup` curve. The longer 400ms travel this component originally used lives on as
// `animate-sheet-gallery`, reserved for the gallery details modal (5.8).
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
        {/* Grabber — purely decorative until 5.5 wires up drag-to-close. 36×4 at the redesign's
            own 0.18 alpha, left off the text/border/fill ladder (which has no "solid indicator
            bar" category to normalize this into). */}
        <div className="flex flex-col items-center py-4">
          <div className="rounded-pill bg-ink/18 h-1 w-9" />
        </div>
        {children}
      </div>
    </div>
  );
}
