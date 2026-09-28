"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GroupPicker } from "~/components/topics/group-picker";
import { TopicLevels } from "~/components/topics/topic-levels";
import { Button } from "~/components/ui/button";
import { Column } from "~/components/ui/column";
import { Rise } from "~/components/ui/rise";
import { cn } from "~/lib/utils";
import {
  FACETS,
  FACET_LABELS,
  FACET_PROMPTS,
} from "~/server/config/topic-facets";
import { weightOf } from "~/server/config/topic-levels";
import type { TopicFacet } from "~/server/db/schema";
import { api } from "~/trpc/react";

export interface OnboardingScreenProps {
  /** `topics.list` (every faceted topic, label order) mapped down to what the pickers need. */
  topics: { id: string; label: string; facet: TopicFacet }[];
}

// docs/DESIGN_onboarding-interview.md §3 "Onboarding phases" — the screen a freshly invited
// sign-up lands on before ever seeing a feed.
//
// **Two phases here, three in the design.** The design's progress row reads "Pick · Refine ·
// Start"; `Refine` is the interview (§4–§5), which plan 2 (docs/PLAN_onboarding-interview.md)
// inserts between these two. Until then the flow is Pick → Start, so `PHASES` below carries only
// those two entries. `phase` is derived from `stage`, never stored separately, so there is exactly
// one source of truth for "where am I".
//
// **Pick has no floor.** Every Pick stage — including the very first — can be passed with nothing
// chosen, `Next` always reads "Next", and there is no group-tap counter anywhere in the Pick
// phase. A reader who has no opinion about, say, places shouldn't be made to invent one. The only
// floor is at the very end.
//
// **Floor of one at Start, and why nothing is written before it.** `Start` renders `TopicLevels`
// over the draft — every pick made across all four Pick stages, editable one more time (tune a
// level, or turn a topic off) before it becomes real. "Start exploring" is disabled while
// `picks.size === 0`: that is the client side of `setMine`'s `.min(1)`, which answers an empty
// write with a BAD_REQUEST — and a reader with no rows would land back here on their next visit
// anyway (`hasCompletedOnboarding` reads `user_topic` rows). Nothing is written before this
// button, so abandoning onboarding at any earlier stage, including by closing the tab, leaves no
// rows.
//
// **`picks` is a `Map<string, number>`: topic id → weight.** The unit picked is a topic, at a
// weight (`~/server/config/topic-levels`'s three reader-facing levels), and the two pure
// functions in `~/components/topics/picks.ts` (`toggleGroup`, `toggleTopic`, wired up inside
// `GroupPicker`) are the only place a weight gets chosen on the Pick side — this file never
// writes a weight literal itself. `TopicLevels` on Start writes the *other* way: `onLevel` reads
// a level word off the segmented control and turns it back into a weight via `weightOf`, `onOff`
// just deletes the entry. So the whole screen carries exactly one weight-bearing state value from
// the first tap to the final mutation.
export function OnboardingScreen({ topics }: OnboardingScreenProps) {
  const router = useRouter();
  const { mutateAsync } = api.topics.setMine.useMutation();

  // Every pick made so far, across every stage: topic id → weight. Nothing is flattened or
  // resolved until submit — Start reads this map directly.
  const [picks, setPicks] = useState<Map<string, number>>(new Map());
  // 0..FACETS.length-1 is a Pick stage (one per facet, `FACETS` order); `stage === FACETS.length`
  // is Start. One integer captures both "which Pick facet" and "am I on Start" — `phase` below is
  // just a read of it, not a second piece of state that could drift out of sync.
  const [stage, setStage] = useState(0);
  // Local `submitting`, not the mutation's own `isPending` — mirrors AuthCard exactly (same
  // aria-busy + pointer-events-none opacity-80 treatment) and keeps the test's `useMutation` mock
  // down to a single `mutateAsync` field.
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const phase = stage < FACETS.length ? "pick" : "start";
  const facet = phase === "pick" ? FACETS[stage]! : undefined;

  // The progress row's dots — two, since `Refine` isn't built yet. Plan 2
  // (docs/PLAN_onboarding-interview.md) inserts `{ key: "refine", label: "Refine" }` here, between
  // these two; nothing about `phase`'s derivation above needs to change to accommodate it, since
  // `phase` would just gain a third possible value alongside its own stage range.
  const PHASES = [
    { key: "pick", label: "Pick" },
    { key: "start", label: "Start" },
  ] as const;

  const count = picks.size;
  const countLabel =
    count === 0
      ? "Nothing picked yet"
      : `${count} ${count === 1 ? "topic" : "topics"} chosen`;

  async function handleSubmit() {
    // Guard in the handler, not just visually via `disabled` — the same "don't trust disabled
    // alone" caution AuthCard's validation already models. Also guards re-entry while a previous
    // submit is still in flight.
    if (submitting || picks.size === 0) return;

    setError("");
    setSubmitting(true);
    try {
      await mutateAsync({
        picks: [...picks].map(([topicId, weight]) => ({ topicId, weight })),
      });
      // `replace`, not `push` (Decision 9): pushing would leave /onboarding in history, and
      // backing into it just bounces forward to /feed again via the page's redirect — a dead
      // entry that makes the back button look broken. Leave `submitting` true through the
      // navigation itself, same reasoning as AuthCard's post-signup redirect.
      router.replace("/feed");
    } catch {
      setError("Something went wrong saving your picks — try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="bg-bg min-h-dvh">
      {/* The desktop cap (docs/DESIGN_desktop-polish.md §1). The chips keep their own `px-6`
       *inside* the column, so at 768px the grid simply stops growing rather than re-padding. */}
      <Column width="narrow">
        {/* `key={stage}` re-mounts the header and body per stage so <Rise> plays again — a stage
            change (Pick → Pick or Pick → Start) should feel like a new screen, not content
            swapping under a static title. */}
        <Rise key={`h-${stage}`}>
          <div className="px-6 pt-16 pb-2">
            <p className="text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase">
              {phase === "pick"
                ? `Ambit · Setup · ${stage + 1} of ${FACETS.length}`
                : "Ambit · Setup · Start"}
            </p>
            <h1 className="text-ink-hi mt-[14px] text-[34px] leading-[1.12] font-semibold tracking-[-0.4px]">
              {phase === "pick"
                ? FACET_PROMPTS[facet!]
                : "Here's where we'll start"}
            </h1>
            <p className="text-ink/62 mt-3 text-[16px] leading-[1.55]">
              {phase === "pick"
                ? stage === 0
                  ? "Choose as many as you like. Ambit starts here — then wanders sideways into things you'd never think to search for."
                  : `${FACET_LABELS[facet!]} — pick any, or none.`
                : "Turn anything off, or say how much of it you want. You can change all of this any time from your profile."}
            </p>
          </div>
        </Rise>

        {/* The body rises as one unit (landing's 0/80/160 stagger), not per-chip/per-row — a
            per-item stagger would turn a long grid or summary into a slow cascade the handoff
            never asks for. */}
        <Rise key={`b-${stage}`} delayMs={80}>
          <div className="px-6 pt-[22px] pb-[200px]">
            {phase === "pick" ? (
              <GroupPicker
                facet={facet!}
                topics={topics}
                picks={picks}
                onChange={setPicks}
              />
            ) : (
              <TopicLevels
                topics={topics}
                picks={picks}
                onLevel={(id, l) =>
                  setPicks((p) => new Map(p).set(id, weightOf(l)))
                }
                onOff={(id) =>
                  setPicks((p) => {
                    const n = new Map(p);
                    n.delete(id);
                    return n;
                  })
                }
              />
            )}
          </div>
        </Rise>
      </Column>

      {/* Fixed chrome — not wrapped in <Rise>, which would fight its own positioning. The error
          slot lives inside this bar (above the count/CTA row) rather than in the scrollable
          column above: the bar is always on screen regardless of scroll position, so a mutation
          failure that could fire while the user is anywhere on a tall grid stays visible. */}
      <div className="from-bg to-bg/0 fixed inset-x-0 bottom-0 z-20 bg-linear-to-t from-62% pt-5 pb-10">
        {/* Full-width gradient, narrow content — the bar's fade has to cover the whole viewport or
            the chips scroll out from under a 600px band. The `px-6` moved off the bar and onto the
            column so the CTA row lands column-then-padding, exactly like the chips above it;
            left on the bar it would sit 24px inside the column's edge instead of at it. */}
        <Column width="narrow" className="px-6">
          {error && (
            <div
              role="alert"
              data-testid="onboarding-error"
              className="text-error mt-[11px] text-center font-sans text-[12.5px]"
            >
              {error}
            </div>
          )}
          {/* One dot per phase (two today, three once `Refine` lands). `aria-current="step"` is
              the screen-reader equivalent of the accent colour. */}
          <nav
            aria-label="Setup progress"
            className="mb-3 flex justify-center gap-2"
          >
            {PHASES.map((p) => (
              <span
                key={p.key}
                aria-current={p.key === phase ? "step" : undefined}
                aria-label={p.label}
                className={cn(
                  "block h-[6px] w-[6px] rounded-full transition-colors",
                  p.key === phase ? "bg-accent" : "bg-ink/20",
                )}
              />
            ))}
          </nav>
          {/* Label above the buttons, not beside them: at 402px the last stage carries Back AND
              the CTA, and a long status line beside both wrapped to two lines and clipped against
              the bottom edge. Stacked on every stage rather than only the last, so the bar does
              not jump height when Back appears. */}
          <p
            aria-live="polite"
            className="text-ink/55 mb-2 font-sans text-[12.5px]"
          >
            {phase === "start" && picks.size === 0
              ? "Pick at least one topic to start."
              : countLabel}
          </p>
          <div className="flex items-center justify-end gap-[14px]">
            {stage > 0 && (
              <Button
                shape="pill"
                size="md"
                variant="ghost"
                onClick={() => setStage((s) => s - 1)}
              >
                Back
              </Button>
            )}
            {phase === "start" ? (
              <Button
                shape="pill"
                size="md"
                disabled={picks.size === 0}
                aria-busy={submitting}
                onClick={handleSubmit}
                className={cn(submitting && "pointer-events-none opacity-80")}
              >
                Start exploring
              </Button>
            ) : (
              <Button
                shape="pill"
                size="md"
                onClick={() => setStage((s) => s + 1)}
              >
                Next
              </Button>
            )}
          </div>
        </Column>
      </div>
    </main>
  );
}
