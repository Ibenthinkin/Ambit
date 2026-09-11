"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { Column } from "~/components/ui/column";
import { Rise } from "~/components/ui/rise";
import { cn } from "~/lib/utils";
import { FACETS, FACET_LABELS } from "~/server/config/topic-facets";
import type { TopicFacet } from "~/server/db/schema";
import { api } from "~/trpc/react";

export interface OnboardingScreenProps {
  /** `topics.list` (every faceted topic, label order) mapped down to what the grid needs. */
  topics: { id: string; label: string; facet: TopicFacet }[];
  /** Minimum picks — across all four stages — before the CTA flips to "Start exploring"
   *  (SPEC §3.2: 3). */
  minPicks: number;
}

/** Stage copy (09-11-26, docs/DESIGN_chrome-redesign.md §6). The facet order is `FACETS` and is
 *  not a copy decision. */
const STAGE_HEADINGS: Record<TopicFacet, string> = {
  subject: "What are you drawn to?",
  medium: "In what form?",
  look: "What should it feel like?",
  place: "Anywhere in particular?",
};

// Onboarding's topic-chip picker (Ambit - Onboarding.dc.html, PHASE5_PLAN_5.3.md) — the screen a
// freshly invited sign-up lands on before ever seeing a feed. A near-straight port of the
// prototype's interaction model (tap chips, sticky CTA gates on a minimum count); the real
// difference from the handoff is a real mutation instead of `localStorage` (Decision 2).
//
// **Four stages since 09-10-26** (docs/DESIGN_topic-facets-and-personas.md §2). The grid used to
// be the sixteen `TOPICS` from config; it is now every faceted topic — a hundred of them — which
// is a broken screen as one grid and a fine one as four grouped stages. Nothing is written until
// the last stage's CTA: one `setMine` with the union, so abandoning onboarding halfway leaves no
// rows and `hasCompletedOnboarding()` still reads false.
export function OnboardingScreen({ topics, minPicks }: OnboardingScreenProps) {
  const router = useRouter();
  const { mutateAsync } = api.topics.setMine.useMutation();

  // One set for all four stages, so Back-and-unpick works and the final write is the union.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState(0);
  // Local `submitting`, not the mutation's own `isPending` — mirrors AuthCard exactly (same
  // aria-busy + pointer-events-none opacity-80 treatment) and keeps the test's `useMutation` mock
  // down to a single `mutateAsync` field.
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const facet = FACETS[stage]!;
  const isLast = stage === FACETS.length - 1;
  const stageTopics = topics.filter((t) => t.facet === facet);

  function toggle(topicId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      // Toggle off has to *delete*, not just add — an easy thing to get half-right and the
      // reason this is its own function rather than inlined at the call site.
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  }

  const count = selected.size;
  const remaining = minPicks - count;
  const countLabel =
    count === 0
      ? "Nothing picked yet"
      : `${count} ${count === 1 ? "interest" : "interests"} chosen`;
  const ctaLabel = remaining > 0 ? `Pick ${remaining} more` : "Start exploring";

  async function handleSubmit() {
    // Guard in the handler, not just visually via `disabled` — the same "don't trust disabled
    // alone" caution AuthCard's validation already models. Also guards re-entry while a previous
    // submit is still in flight.
    if (submitting || count < minPicks) return;

    setError("");
    setSubmitting(true);
    try {
      await mutateAsync({ topicIds: [...selected] });
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
        {/* `key={stage}` re-mounts the header and grid per stage so <Rise> plays again — a stage
            change should feel like a new screen, not a chip list swapping under a static title. */}
        <Rise key={`h-${stage}`}>
          <div className="px-6 pt-16 pb-2">
            <p className="text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase">
              Ambit · Setup · {stage + 1} of {FACETS.length}
            </p>
            <h1 className="text-ink-hi mt-[14px] text-[34px] leading-[1.12] font-semibold tracking-[-0.4px]">
              {STAGE_HEADINGS[facet]}
            </h1>
            <p className="text-ink/62 mt-3 text-[16px] leading-[1.55]">
              {stage === 0
                ? "Choose as many as you like. Ambit starts here — then wanders sideways into things you'd never think to search for."
                : `${FACET_LABELS[facet]} — pick any, or none.`}
            </p>
          </div>
        </Rise>

        {/* The grid rises as one unit (landing's 0/80/160 stagger), not per-chip — a per-chip
          stagger would turn a long grid into a slow cascade the handoff never asks for. */}
        <Rise key={`g-${stage}`} delayMs={80}>
          <div
            role="group"
            aria-label={`${FACET_LABELS[facet]} topics`}
            className="flex flex-wrap gap-[10px] px-6 pt-[22px] pb-[200px]"
          >
            {stageTopics.map((topic) => (
              <Chip
                key={topic.id}
                selected={selected.has(topic.id)}
                onClick={() => toggle(topic.id)}
              >
                {topic.label}
              </Chip>
            ))}
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
          {/* Four dots; the active one is the accent. `aria-current="step"` is the screen-reader
              equivalent of the colour. */}
          <nav
            aria-label="Setup progress"
            className="mb-3 flex justify-center gap-2"
          >
            {FACETS.map((f, i) => (
              <span
                key={f}
                aria-current={i === stage ? "step" : undefined}
                aria-label={FACET_LABELS[f]}
                className={cn(
                  "block h-[6px] w-[6px] rounded-full transition-colors",
                  i === stage ? "bg-accent" : "bg-ink/20",
                )}
              />
            ))}
          </nav>
          {/* Label above the buttons, not beside them: at 402px the last stage carries Back AND
              the CTA, and "Nothing picked yet" beside both wrapped to two lines and clipped
              against the bottom edge. Stacked on every stage rather than only the last, so the
              bar does not jump height when Back appears. */}
          <p
            aria-live="polite"
            className="text-ink/55 mb-2 font-sans text-[12.5px]"
          >
            {countLabel}
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
            {isLast ? (
              <Button
                shape="pill"
                size="md"
                disabled={remaining > 0}
                aria-busy={submitting}
                onClick={handleSubmit}
                className={cn(submitting && "pointer-events-none opacity-80")}
              >
                {ctaLabel}
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
