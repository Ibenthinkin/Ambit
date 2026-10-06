"use client";

import Link from "next/link";
import { useState } from "react";

import { TopicLevels, type LevelTopic } from "~/components/topics/topic-levels";
import { Button } from "~/components/ui/button";
import { MIN_PICKS } from "~/lib/interview/config";
import type { Pick } from "~/lib/interview/picks";
import {
  draftPicks,
  reseed,
  sameProposal,
  seedDraft,
  withLevel,
  withOff,
} from "~/lib/interview/reveal-draft";
import type { TasteV1 } from "~/lib/interview/taste";
import { cn } from "~/lib/utils";
import { weightOf } from "~/server/config/topic-levels";

import { Rise } from "~/components/ui/rise";

import { ExhibitionCard } from "./exhibition-card";
import { StepBar } from "./step-bar";

// The questionnaire's last screen: "Here's where we'll start". Everything the answers added up
// to, as a list of topics each at a level, and the reader's chance to disagree before any of it
// is written — a little / some / a lot / off on every row.
//
// **A local draft.** The proposal (`proposed`, from lib/interview/picks.ts) seeds a draft that is
// edited here (lib/interview/reveal-draft.ts); nothing is saved until "Start exploring" hands the
// draft to `onSubmit`. What is written is exactly what this screen showed — which is why
// `onboarding.complete` *overwrites*. If the proposal changes while the screen is up — a
// kept-out subject allowed back in (kept-out.ts) — the draft is **re-seeded**: rows the reader
// set by hand keep what they set, the rest follow the new proposal.
//
// **Off keeps the row.** A switched-off topic stays on the page with "off" pressed, so a stray
// tap can be undone without going back through the questions. It just isn't submitted.
export interface RevealStepProps {
  /** `topics.list` rows — the labels. */
  topics: readonly LevelTopic[];
  /** What the answers proposed. Seeds the draft; a different proposal later re-seeds it. */
  proposed: readonly Pick[];
  /** The exhibition the answers make (First Exhibition, taste.ts). Absent on a bank without
   *  v2's questions — the reveal is then the levels list alone. */
  taste?: TasteV1;
  /** A signed-up reader retaking the questions: this will *replace* what they have. */
  retake: boolean;
  submitting: boolean;
  error: string;
  onSubmit: (picks: Pick[]) => void;
  onBack: () => void;
}

export function RevealStep({
  topics,
  proposed,
  taste,
  retake,
  submitting,
  error,
  onSubmit,
  onBack,
}: RevealStepProps) {
  const [draft, setDraft] = useState(() => seedDraft(proposed));
  // Re-seeding during render, not in an effect, so no frame shows the old rows against a new
  // proposal. Compared by content: a parent handing over an equal list in a new array is not a
  // new proposal, and must not loop.
  const [seededFrom, setSeededFrom] = useState(proposed);
  if (!sameProposal(seededFrom, proposed)) {
    setSeededFrom(proposed);
    setDraft(reseed(draft, proposed));
  }

  const short = draft.picks.size < MIN_PICKS;

  function submit() {
    // Guarded here as well as by `disabled` — and against a second press while one is in flight.
    if (short || submitting) return;
    // In the proposal's own order (best first), so the submitted list reads like the answers did.
    onSubmit(draftPicks(draft));
  }

  return (
    <>
      {/* The body rises; the bar is a sibling, because <Rise>'s transform would capture `fixed`. */}
      <Rise>
        <div data-step="reveal">
          {/* The exhibition the answers make — above the levels it was built from. */}
          {taste && (
            <div className="mb-8">
              <ExhibitionCard
                taste={taste}
                topicLabels={new Map(topics.map((t) => [t.id, t.label]))}
              />
            </div>
          )}
          <h1 className="text-ink-hi text-[30px] leading-[1.15] font-semibold tracking-[-0.4px]">
            Here’s where we’ll start
          </h1>
          <p className="text-ink/62 mt-3 text-[15px] leading-[1.55]">
            Turn anything up, down or off. Ambit wanders sideways from here, and
            you can change all of this later.
          </p>
          {retake && (
            <p className="text-ink/82 mt-3 text-[15px] leading-[1.55]">
              This replaces your current topics.{" "}
              <Link
                href="/profile/topics"
                replace
                className="text-accent underline underline-offset-2"
              >
                Cancel
              </Link>
            </p>
          )}

          <div className="mt-6">
            <TopicLevels
              topics={topics}
              picks={draft.picks}
              off={draft.off}
              onLevel={(id, level) =>
                setDraft((d) => withLevel(d, id, weightOf(level)))
              }
              onOff={(id) => setDraft((d) => withOff(d, id))}
            />
          </div>
        </div>
      </Rise>

      <StepBar error={error}>
        <Button size="md" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          size="md"
          disabled={short}
          aria-busy={submitting}
          onClick={submit}
          className={cn(submitting && "pointer-events-none opacity-80")}
        >
          {short ? "Keep at least three" : "Start exploring"}
        </Button>
      </StepBar>
    </>
  );
}
