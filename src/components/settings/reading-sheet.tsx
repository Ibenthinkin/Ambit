"use client";

import * as React from "react";

import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Segmented } from "~/components/ui/segmented";
import {
  READING_AMOUNTS,
  READING_LABELS,
  type ReadingAmount,
} from "~/server/config/reading-amount";

// How much writing the reader wants mixed into their feed — the questionnaire's last question,
// changeable here (docs/PLAN_onboarding-questionnaire.md §4). Modelled on `accent-sheet.tsx`: the
// sheet shows the current choice and reports a pick; the screen owns the mutation.
//
// A `Segmented` rather than a list of rows because the four amounts are points on one scale —
// none · a little · some · a lot — the same control, and the same words' shape, as a topic's
// level on /profile/topics.
export interface ReadingSheetProps {
  open: boolean;
  onClose: () => void;
  /** The stored amount; `null` = never said, shown as the feed's default ("Some"). */
  current: ReadingAmount | null;
  onPick: (amount: ReadingAmount) => void;
}

/** What a reader who never answered is getting: the engine's default share is "some". */
export const DEFAULT_READING: ReadingAmount = "some";

const OPTIONS = READING_AMOUNTS.map((amount) => ({
  key: amount,
  label: READING_LABELS[amount],
}));

export function ReadingSheet({
  open,
  onClose,
  current,
  onPick,
}: ReadingSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Reading">
      <div className="px-6 pt-1 pb-6">
        <p className="text-ink/62 pb-4 text-[15px] leading-[1.5]">
          How much writing — essays, articles, old documents — to mix in with
          the pictures.
        </p>
        <Segmented
          options={OPTIONS}
          value={current ?? DEFAULT_READING}
          onChange={onPick}
        />
      </div>
    </BottomSheet>
  );
}
