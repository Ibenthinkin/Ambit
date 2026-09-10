"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Chip } from "~/components/ui/chip";
import { Column } from "~/components/ui/column";
import { Rise } from "~/components/ui/rise";
import { cn } from "~/lib/utils";
import { FACETS, FACET_LABELS } from "~/server/config/topic-facets";
import type { TopicFacet } from "~/server/db/schema";
import { api } from "~/trpc/react";

// /profile/topics (docs/DESIGN_topic-facets-and-personas.md §3): every pickable topic, one tab
// per facet, every toggle saved at once. This is the picker Ben feel-tests the feed with, so it
// is built to be flipped constantly: no Done button, no confirmation, an optimistic `topics.mine`
// so the chip answers before the server does. The write is `setMine` with the full set — the
// same procedure onboarding uses — so `setUserTopics`'s weight-preserving replace applies to
// every flip: a topic kept across the write keeps its learned weight.
//
// It replaces Settings' "What you see" sheet, which could only ever offer the sixteen and had no
// room for four groups of a hundred chips.
//
// `dev` (Task 8): under FEED_DEBUG each pressed chip shows its learned weight and a Reset button
// sets them all back to 1.0. The product build never renders a weight.
export function TopicsScreen({ dev }: { dev: boolean }) {
  const router = useRouter();
  const utils = api.useUtils();
  const topics = api.topics.list.useQuery();
  const mine = api.topics.mine.useQuery();
  const [facet, setFacet] = React.useState<TopicFacet>(FACETS[0]);
  const [hint, setHint] = React.useState("");

  const setMine = api.topics.setMine.useMutation({
    // **Serialized, not parallel.** Every toggle sends the whole set, and `setUserTopics` is a
    // delete-then-insert transaction — so two flips in quick succession can interleave and leave
    // the DB holding whichever *transaction* committed last, which is not necessarily the last
    // set the reader chose. Found by e2e (two toggles on two tabs; the second was silently lost).
    // A `scope.id` puts same-scope mutations in a serial queue (TanStack Query v5); only the
    // mutationFn waits, `onMutate` still runs the instant `.mutate()` is called, so the chip
    // still answers immediately.
    scope: { id: "topics.setMine" },
    // Optimistic: the chip flips now, `topics.mine` is patched to the set we sent, and settle
    // re-reads the truth. On error the patch is rolled back to the snapshot.
    onMutate: async ({ topicIds }) => {
      await utils.topics.mine.cancel();
      const previous = utils.topics.mine.getData();
      utils.topics.mine.setData(undefined, topicIds);
      setHint("");
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.topics.mine.setData(undefined, ctx.previous);
      setHint("Couldn't save that — try again.");
    },
    onSettled: () => void utils.topics.mine.invalidate(),
  });

  // Dev readout: the query only runs under the gate, and the procedure would FORBID it anyway.
  const weights = api.topics.weights.useQuery(undefined, { enabled: dev });
  const resetWeights = api.topics.resetWeights.useMutation({
    onSuccess: () => void utils.topics.weights.invalidate(),
  });
  const weightOf = new Map(
    (weights.data ?? []).map((w) => [w.topicId, w.weight]),
  );

  const picked = new Set(mine.data ?? []);
  const tabTopics = (topics.data ?? []).filter((t) => t.facet === facet);

  function toggle(topicId: string) {
    const next = new Set(picked);
    if (next.has(topicId)) {
      if (next.size === 1) {
        // The mutation's floor is one (`min(1)`); refusing here keeps the chip honest instead of
        // letting it flip and snap back on the server's BAD_REQUEST.
        setHint("Keep at least one topic.");
        return;
      }
      next.delete(topicId);
    } else {
      next.add(topicId);
    }
    setMine.mutate({ topicIds: [...next] });
  }

  return (
    <main className="bg-bg min-h-dvh">
      <Column width="narrow">
        <Rise>
          <div className="px-5 pt-14 pb-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-ink/60 font-sans text-[13px]"
            >
              ← Profile
            </button>
            <h1 className="text-ink-hi mt-3 text-[28px] leading-[1.15] font-semibold tracking-[-0.3px]">
              Topics
            </h1>
            <p className="text-ink/62 mt-2 text-[15px] leading-[1.5]">
              {picked.size} on. Changes save as you go.
            </p>
          </div>
        </Rise>

        {/* Tabs scroll sideways below md rather than wrapping — four labels fit at 402 px, but a
            fifth (era, one day) would not. */}
        <div
          role="tablist"
          aria-label="Facets"
          className="border-ink/10 mx-5 mt-4 flex gap-6 overflow-x-auto border-b"
        >
          {FACETS.map((f) => (
            <button
              key={f}
              role="tab"
              type="button"
              aria-selected={f === facet}
              onClick={() => setFacet(f)}
              className={cn(
                "-mb-px shrink-0 border-b-2 pb-3 font-sans text-[14px] transition-colors",
                f === facet
                  ? "border-accent text-ink-hi"
                  : "text-ink/55 border-transparent",
              )}
            >
              {FACET_LABELS[f]}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          aria-label={`${FACET_LABELS[facet]} topics`}
          className="flex flex-wrap gap-[10px] px-5 pt-5 pb-6"
        >
          {tabTopics.map((t) => (
            <Chip
              key={t.id}
              selected={picked.has(t.id)}
              onClick={() => toggle(t.id)}
            >
              {dev && picked.has(t.id) && weightOf.has(t.id)
                ? `${t.label} · ${weightOf.get(t.id)!.toFixed(1)}`
                : t.label}
            </Chip>
          ))}
        </div>

        <p
          role="status"
          aria-live="polite"
          className="text-ink/55 px-5 font-sans text-[12.5px]"
        >
          {hint}
        </p>

        {dev && (
          <div className="px-5 pt-6 pb-[140px]">
            <button
              type="button"
              onClick={() => resetWeights.mutate()}
              className="border-hairline rounded-pill border-ink/18 text-ink h-[40px] px-5 text-[13px]"
            >
              Reset weights
            </button>
            <p className="text-ink/45 mt-2 font-sans text-[12px]">
              Dev only (FEED_DEBUG). Saves nudge a topic&apos;s weight up by
              0.5, capped at 3.0.
            </p>
          </div>
        )}
        {!dev && <div className="pb-[140px]" />}
      </Column>
    </main>
  );
}
