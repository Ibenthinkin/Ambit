"use client";

import Link from "next/link";
import { useState } from "react";

import { TopicLevels, type LevelTopic } from "~/components/topics/topic-levels";
import { Button } from "~/components/ui/button";
import { MIN_PICKS } from "~/lib/interview/config";
import type { Pick } from "~/lib/interview/picks";
import { cn } from "~/lib/utils";
import { weightOf } from "~/server/config/topic-levels";

import { Rise } from "~/components/ui/rise";

import { StepBar } from "./step-bar";

// The questionnaire's last screen: "Here's where we'll start". Everything the answers added up
// to, as a list of topics each at a level, and the reader's chance to disagree before any of it
// is written — a little / some / a lot / off on every row.
//
// **A local draft.** The proposal arrives once (`proposed`, from lib/interview/picks.ts) and is
// edited here; nothing is saved until "Start exploring" hands the draft to `onSubmit`. What is
// written is exactly what this screen showed — which is why `onboarding.complete` *overwrites*.
//
// **Off keeps the row.** A switched-off topic stays on the page with "off" pressed, so a stray
// tap can be undone without going back through the questions. It just isn't submitted.
export interface RevealStepProps {
  /** `topics.list` rows — the labels. */
  topics: readonly LevelTopic[];
  /** What the answers proposed. Read once, on mount. */
  proposed: readonly Pick[];
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
  retake,
  submitting,
  error,
  onSubmit,
  onBack,
}: RevealStepProps) {
  const [picks, setPicks] = useState<Map<string, number>>(
    () => new Map(proposed.map((p) => [p.topicId, p.weight])),
  );
  const [off, setOff] = useState<Set<string>>(new Set());

  const short = picks.size < MIN_PICKS;

  function setLevel(topicId: string, weight: number) {
    setPicks((prev) => new Map(prev).set(topicId, weight));
    setOff((prev) => {
      const next = new Set(prev);
      next.delete(topicId);
      return next;
    });
  }
  function turnOff(topicId: string) {
    setPicks((prev) => {
      const next = new Map(prev);
      next.delete(topicId);
      return next;
    });
    setOff((prev) => new Set(prev).add(topicId));
  }

  function submit() {
    // Guarded here as well as by `disabled` — and against a second press while one is in flight.
    if (short || submitting) return;
    // In the proposal's own order (best first), so the submitted list reads like the answers did.
    onSubmit(
      proposed
        .filter((p) => picks.has(p.topicId))
        .map((p) => ({ topicId: p.topicId, weight: picks.get(p.topicId)! })),
    );
  }

  return (
    <>
      {/* The body rises; the bar is a sibling, because <Rise>'s transform would capture `fixed`. */}
      <Rise>
        <div data-step="reveal">
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
              picks={picks}
              off={off}
              onLevel={(id, level) => setLevel(id, weightOf(level))}
              onOff={turnOff}
            />
          </div>
        </div>
      </Rise>

      <StepBar error={error}>
        <Button shape="pill" size="md" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          shape="pill"
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
