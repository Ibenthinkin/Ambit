"use client";

import * as React from "react";

import { Check } from "~/components/icons";
import { ACCENTS, type AccentKey } from "~/lib/accent";
import { BottomSheet } from "~/components/ui/bottom-sheet";

// The accent picker — the user-facing end of the knob that shipped as a mechanism in 5.1 and waited
// on `/dev/tokens` until now.
//
// The swatch dots paint their literal hex rather than `bg-accent`, which would resolve to whichever
// accent is *currently* active and render four identical dots. `lib/accent.ts` carries the same note
// over the hex list itself.
export interface AccentSheetProps {
  open: boolean;
  onClose: () => void;
  current: AccentKey;
  onPick: (key: AccentKey) => void;
}

export function AccentSheet({
  open,
  onClose,
  current,
  onPick,
}: AccentSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Appearance">
      <div className="flex flex-col px-3 pb-2">
        {ACCENTS.map((accent) => (
          <button
            key={accent.key}
            type="button"
            // `onPick` is `setAccent` itself (settings-screen): it writes the attribute on
            // `<html>`, persists to localStorage, and notifies every subscriber — including the
            // `useAccent()` this sheet's `current` prop comes from. So there is nothing to do here
            // but report the pick.
            onClick={() => onPick(accent.key)}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex w-full items-center gap-[13px] px-3 py-[14px] text-left"
          >
            <span
              className="border-hairline border-ink/16 size-5 flex-none rounded-full"
              style={{ background: accent.hex }}
            />
            <span className="text-ink flex-1 text-[15px]">{accent.label}</span>
            {accent.key === current ? (
              <Check size={15} className="text-accent flex-none" />
            ) : null}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
