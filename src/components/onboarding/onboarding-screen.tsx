"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { Rise } from "~/components/ui/rise";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

export interface OnboardingScreenProps {
  /** `TOPICS` (src/server/config/topics.ts) mapped down to just what the grid needs. */
  topics: { id: string; label: string }[];
  /** Minimum picks before the CTA flips from "Pick N more" to "Start exploring" (SPEC §3.2: 3). */
  minPicks: number;
}

// Onboarding's topic-chip picker (Ambit - Onboarding.dc.html, PHASE5_PLAN_5.3.md) — the screen a
// freshly invited sign-up lands on before ever seeing a feed. A near-straight port of the
// prototype's interaction model (tap chips, sticky CTA gates on a minimum count); the two real
// differences are the sixteen-chip grid (not the handoff's thirty-two — see topics.ts's header
// comment) and a real mutation instead of `localStorage` (Decision 2). This is the app's first
// client-side consumer of the tRPC React client — every client component before this one
// (AuthCard, ResetPasswordCard, SignOutButton) has talked to Better Auth's client directly.
export function OnboardingScreen({ topics, minPicks }: OnboardingScreenProps) {
  const router = useRouter();
  const { mutateAsync } = api.topics.setMine.useMutation();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Local `submitting`, not the mutation's own `isPending` — mirrors AuthCard exactly (same
  // aria-busy + pointer-events-none opacity-80 treatment) and keeps the test's `useMutation` mock
  // down to a single `mutateAsync` field.
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
      // backing into it just bounces forward to /feed again via the redirect below — a dead
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
      <Rise>
        <div className="px-6 pt-16 pb-2">
          <p className="text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase">
            Ambit · Setup
          </p>
          <h1 className="text-ink-hi mt-[14px] text-[34px] leading-[1.12] font-semibold tracking-[-0.4px]">
            What pulls your attention?
          </h1>
          <p className="text-ink/62 mt-3 text-[16px] leading-[1.55]">
            Choose as many as you like. Ambit starts here — then wanders
            sideways into things you&apos;d never think to search for.
          </p>
        </div>
      </Rise>

      {/* The grid rises as one unit (landing's 0/80/160 stagger), not per-chip — a per-chip
          stagger would turn a 16-chip grid into a slow cascade the handoff never asks for. */}
      <Rise delayMs={80}>
        <div
          role="group"
          aria-label="Topics"
          className="flex flex-wrap gap-[10px] px-6 pt-[22px] pb-[180px]"
        >
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
      </Rise>

      {/* Fixed chrome — not wrapped in <Rise>, which would fight its own positioning. The error
          slot lives inside this bar (above the count/CTA row) rather than in the scrollable
          column above: the bar is always on screen regardless of scroll position, so a mutation
          failure that could fire while the user is anywhere on a tall grid stays visible. */}
      <div className="from-bg to-bg/0 fixed inset-x-0 bottom-0 z-20 bg-linear-to-t from-62% px-6 pt-5 pb-10">
        {error && (
          <div
            role="alert"
            data-testid="onboarding-error"
            className="text-error mt-[11px] text-center font-sans text-[12.5px]"
          >
            {error}
          </div>
        )}
        <div className="flex items-center gap-[14px]">
          <p
            aria-live="polite"
            className="text-ink/55 flex-1 font-sans text-[12.5px]"
          >
            {countLabel}
          </p>
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
        </div>
      </div>
    </main>
  );
}
