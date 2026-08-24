"use client";

import * as React from "react";

import type { Topic } from "~/server/db/topics";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { api } from "~/trpc/react";

// "What you see" — the re-pick of the sixteen topics, from Settings rather than onboarding.
//
// **This is safe to expose because `setUserTopics` doesn't reset weights.** It deletes only the
// topics actually dropped from the selection and inserts only the newly added ones
// (`db/topics.ts`), so a topic the reader keeps across a re-pick retains whatever weight the feed
// has learned for it from their saves. Without that, opening this sheet and pressing Save would
// quietly wipe months of drift — which is the whole reason a topic editor could ship at all.
//
// The chip grid is onboarding's chrome verbatim; only the gate differs (see `MIN_PICKS`).

/**
 * One, not onboarding's three.
 *
 * Onboarding asks for three because a cold-start feed with a single topic has nothing to drift
 * *from* — that minimum is a quality gate on an empty account, not an invariant of the system. An
 * established reader who wants to narrow to two topics has a feed full of learned weights and a
 * corpus behind it; blocking them would be hostile. One is the floor because `topics.setMine`'s
 * own input schema is `.min(1)`, and a Save that the server would reject shouldn't be pressable.
 */
const MIN_PICKS = 1;

export interface TopicsSheetProps {
  open: boolean;
  onClose: () => void;
  topics: Topic[];
  initialSelected: string[];
  onSaved: () => void;
}

export function TopicsSheet({
  open,
  onClose,
  topics,
  initialSelected,
  onSaved,
}: TopicsSheetProps) {
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(initialSelected),
  );
  const [prevOpen, setPrevOpen] = React.useState(open);
  const utils = api.useUtils();

  // Re-seed on every *open*, so a reader who toggles chips and then dismisses the sheet without
  // saving finds their real selection when they come back — a discarded edit must not leak into
  // the next one.
  //
  // Adjusting state during render on a prop change, rather than in an effect: React's own
  // documented pattern for exactly this shape, and the same move `BottomSheet` makes for its exit
  // animation. An effect here would render the sheet once with the *stale* selection and then
  // again with the fresh one — a visible flicker of the wrong chips, and the reason
  // `react-hooks/set-state-in-effect` flags it.
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setSelected(new Set(initialSelected));
  }

  const setMine = api.topics.setMine.useMutation({
    onSuccess: () => {
      void utils.topics.mine.invalidate();
      onSaved();
      onClose();
    },
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="What you see"
      maxHeightPct={72}
    >
      <div className="flex min-h-0 flex-col gap-4 px-5 pt-1 pb-2">
        <p className="text-ink/45 text-[13px] leading-[1.5]">
          Ambit starts from these and wanders sideways.
        </p>

        <div className="flex min-h-0 flex-1 flex-wrap gap-[10px] overflow-y-auto">
          {topics.map((topic) => (
            <Chip
              key={topic.id}
              selected={selected.has(topic.id)}
              onClick={() => toggle(topic.id)}
            >
              {topic.label}
            </Chip>
          ))}
        </div>

        <Button
          onClick={() => setMine.mutate({ topicIds: [...selected] })}
          disabled={selected.size < MIN_PICKS || setMine.isPending}
          aria-busy={setMine.isPending}
        >
          Save
        </Button>
      </div>
    </BottomSheet>
  );
}
