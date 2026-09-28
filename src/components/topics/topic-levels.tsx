"use client";

import * as React from "react";

import { Segmented } from "~/components/ui/segmented";
import { FACET_LABELS, FACETS } from "~/server/config/topic-facets";
import {
  LEVEL_LABELS,
  LEVELS,
  levelOf,
  type Level,
} from "~/server/config/topic-levels";

import type { PickerTopic } from "./group-picker";
import type { Picks } from "./picks";

// docs/DESIGN_onboarding-interview.md §3 "TopicLevels" — the *summary* half of the weighted
// picker, complementing `GroupPicker`'s (add/remove) half. Two hosts render it: onboarding's
// Start phase (`onboarding-screen.tsx`), over the draft a reader is about to save, and the Topics
// tab (`profile/topics-screen.tsx`), above its pickers, where every existing pick needs the
// tune-or-drop row `GroupPicker`'s add/remove chips don't give it. Plan 2's interview
// (docs/PLAN_onboarding-interview.md) will show it again on its confirm step, marking what it
// proposed with `suggested`.
//
// **Why levels and not a raw number (D4).** The engine underneath is still a fractional
// `user_topic.weight` — `topic-levels.ts`'s file header spells out the full arithmetic — but
// nobody hand-tuning a pick should have to think in those units, and a raw number invites a
// precision the weighting doesn't actually have (three picks and a nudge look identical to one
// deliberate 2.5). "A little / some / a lot" is the whole reader-facing vocabulary everywhere a
// human sets a weight by hand; `levelOf` is how this component reads a stored weight back into
// one of those three words, and `onLevel` hands back a `Level`, never a number. Turning it into a
// weight is the host's job, always through `weightOf`: onboarding writes it into its draft, the
// Topics tab into its optimistic cache patch, and the `setWeight` procedure into the row itself.
//
// **Why "off" is a fourth segment, not a separate button beside the control.** A pick a reader
// is looking at *right now* has exactly four states — three strengths plus "not this" — and the
// design treats leaving as just the fourth way to answer the same question ("how much of this?"
// vs. a `Segmented` for "how much" plus an unrelated trash icon for "none"). One control, one
// place to look, and `Segmented`'s own guard (a click on the already-pressed segment fires
// nothing) is what keeps a stray tap on "some" from re-writing a pick that hasn't changed.
export interface TopicLevelsProps {
  /** `topics.list` rows, every facet — used for labels and facet grouping. */
  topics: readonly PickerTopic[];
  picks: Picks;
  /** Topics the interview brought in (plan 2). Marked "suggested" so a reader can tell what they
   *  chose from what Ambit proposed on their behalf. */
  suggested?: ReadonlySet<string>;
  onLevel: (topicId: string, level: Level) => void;
  onOff: (topicId: string) => void;
}

// The segmented control's four options, built once at module scope — the three real levels plus
// the "off" pseudo-level, in the exact order the design calls for (§3).
const LEVEL_OPTIONS = [
  ...LEVELS.map((level) => ({ key: level, label: LEVEL_LABELS[level] })),
  { key: "off" as const, label: LEVEL_LABELS.off },
];

export function TopicLevels({
  topics,
  picks,
  suggested,
  onLevel,
  onOff,
}: TopicLevelsProps) {
  if (picks.size === 0) {
    return <p className="text-ink/62 text-[15px]">Nothing picked yet.</p>;
  }

  // Built once per render rather than once per row — the same shape `GroupPicker` builds its
  // `labelOf` map in, and for the same reason: `picks` carries ids, not labels or facets.
  const topicById = new Map(topics.map((t) => [t.id, t]));

  return (
    <div className="flex flex-col gap-6">
      {FACETS.map((facet) => {
        // A facet's rows: every picked topic that both exists in `topics` and belongs to this
        // facet, in label order (§3's last bullet) — never picks-insertion order, which would
        // reorder a row every time a reader re-picks something.
        const rows = [...picks.keys()]
          .map((id) => topicById.get(id))
          .filter((topic): topic is PickerTopic => topic?.facet === facet)
          .sort((a, b) => a.label.localeCompare(b.label));

        // No eyebrow at all for a facet with nothing picked in it (the brief's "no Place
        // eyebrow" case) — an empty section header would just be dead space.
        if (rows.length === 0) return null;

        return (
          <div key={facet} className="flex flex-col gap-2">
            {/* Same eyebrow treatment as the onboarding stage header
                (onboarding-screen.tsx) — one visual vocabulary for "this is a facet name". */}
            <p className="text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase">
              {FACET_LABELS[facet]}
            </p>
            {rows.map((topic) => {
              const weight = picks.get(topic.id) ?? 0;
              const level = levelOf(weight);
              return (
                <div
                  key={topic.id}
                  role="group"
                  aria-label={`${topic.label} level`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2"
                >
                  <span className="text-ink text-[15px]">
                    {topic.label}
                    {suggested?.has(topic.id) && (
                      <span className="text-accent ml-2 font-sans text-[11px] font-semibold tracking-[1.2px] uppercase">
                        suggested
                      </span>
                    )}
                  </span>
                  <Segmented
                    options={LEVEL_OPTIONS}
                    value={level}
                    onChange={(key) => {
                      if (key === "off") {
                        onOff(topic.id);
                      } else {
                        onLevel(topic.id, key);
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
