"use client";

import * as React from "react";

import { Chip } from "~/components/ui/chip";
import { cn } from "~/lib/utils";
import { FACET_LABELS } from "~/server/config/topic-facets";
import { groupsFor } from "~/server/config/topic-groups";
import type { TopicFacet } from "~/server/db/schema";

import { groupState, toggleGroup, toggleTopic, type Picks } from "./picks";

// docs/DESIGN_onboarding-interview.md §3 "GroupPicker" — one component per facet section, the
// shared picker behind both onboarding's Pick phase (`onboarding-screen.tsx`) and the Topics tab
// (`profile/topics-screen.tsx`). It only ever *adds or removes* picks; what weight a pick carries
// is decided by `picks.ts` and shown by the host's `TopicLevels` summary.
//
// A group renders as a `Chip` (tri-state — on / off / "mixed", `groupState`) with a small round
// disclosure button on its trailing edge, *not* nested inside the chip. **Why a sibling and not a
// child:** a `<button>` inside a `<button>` is invalid HTML — the browser closes the outer one
// early — and even where a framework papers over that, it is unreachable by assistive tech (two
// interactive targets can never nest). So the chip and its disclosure are two buttons side by
// side in one `inline-flex` wrapper, each independently clickable and independently labelled.
//
// **Why a singleton group has no disclosure at all:** there is nothing to disclose — the chip
// *is* the one topic, and a second button that reveals a single duplicate chip would be a step
// with no purpose. The threshold is `members.length > 1`, read off `groupsFor`'s intersection
// with the topics actually listed (never the config's raw member count — see that function's own
// header for why CI and a just-promoted production can list fewer than this file's groups do).
//
// **Disclosure state is local and per group**, a `Set<string>` of open group ids in this
// component alone. It is not persisted anywhere and a reload folds every row back closed: coarse
// by default, fine-tuning one tap away.
//
// The disclosure button names its member row with `aria-controls` only while that row is open —
// the row is unmounted when closed, and an `aria-controls` pointing at an id that isn't in the
// document is a dangling reference to assistive tech.
export interface PickerTopic {
  id: string;
  label: string;
  facet: TopicFacet;
}

export interface GroupPickerProps {
  facet: TopicFacet;
  /** `topics.list` rows, every facet — the picker filters to its own via `groupsFor`. */
  topics: readonly PickerTopic[];
  picks: Picks;
  onChange: (next: Map<string, number>) => void;
}

export function GroupPicker({
  facet,
  topics,
  picks,
  onChange,
}: GroupPickerProps) {
  const groups = groupsFor(facet, topics);
  const [open, setOpen] = React.useState<Set<string>>(new Set());

  // Built once per render rather than once per member chip — a group's members are ids, and the
  // chip needs a label to show.
  const labelOf = new Map(topics.map((t) => [t.id, t.label]));

  function toggleOpen(groupId: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <div
      role="group"
      aria-label={`${FACET_LABELS[facet]} groups`}
      className="flex flex-wrap gap-[10px]"
    >
      {groups.map(({ group, members }) => {
        const state = groupState(picks, members);
        const isOpen = open.has(group.id);
        const memberRowId = `group-${group.id}-members`;
        return (
          <div key={group.id} className="flex flex-col gap-[10px]">
            <div className="inline-flex items-center gap-[6px]">
              <Chip
                selected={state}
                onClick={() => onChange(toggleGroup(picks, members))}
              >
                {state === "mixed"
                  ? `${group.label} · ${members.filter((m) => picks.has(m)).length} of ${members.length}`
                  : group.label}
              </Chip>
              {members.length > 1 && (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? memberRowId : undefined}
                  aria-label={
                    isOpen
                      ? `Hide topics in ${group.label}`
                      : `Show ${members.length} topics in ${group.label}`
                  }
                  onClick={() => toggleOpen(group.id)}
                  className={cn(
                    "border-hairline border-ink/12 text-ink/62 flex h-[28px] w-[28px] flex-none items-center justify-center rounded-full text-[12px] transition-colors",
                    isOpen && "bg-accent/10 border-accent",
                  )}
                >
                  {members.length}
                </button>
              )}
            </div>
            {isOpen && (
              <div
                id={memberRowId}
                role="group"
                aria-label={`${group.label} topics`}
                className="flex flex-wrap gap-[8px] pl-3"
              >
                {members.map((memberId) => (
                  <Chip
                    key={memberId}
                    size="sm"
                    selected={picks.has(memberId)}
                    onClick={() => onChange(toggleTopic(picks, memberId))}
                  >
                    {labelOf.get(memberId) ?? memberId}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
