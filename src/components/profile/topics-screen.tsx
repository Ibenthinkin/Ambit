"use client";

import * as React from "react";

import { GroupPicker } from "~/components/topics/group-picker";
import { TopicLevels } from "~/components/topics/topic-levels";
import { Rise } from "~/components/ui/rise";
import {
  FACETS,
  FACET_LABELS,
  FACET_PROMPTS,
} from "~/server/config/topic-facets";
import { weightOf } from "~/server/config/topic-levels";
import { api } from "~/trpc/react";

// /profile/topics — the Topics tab of the Profile hub (docs/DESIGN_topic-facets-and-personas.md §3;
// a tab since 09-12-26, docs/DESIGN_list-screens.md §3; rewritten 09-28-26 for the weighted picker,
// docs/DESIGN_onboarding-interview.md §3 "TopicLevels"): every pickable topic, grouped by facet,
// every change saved at once. This is the picker Ben feel-tests the feed with, so it is built to
// be flipped constantly: no Done button, no confirmation, an optimistic `topics.mine` so the reader
// sees the result before the server does.
//
// **The summary sits above the picker now.** `TopicLevels` — the same component the onboarding
// Start phase shows over the draft — renders every current pick, grouped by facet, with a
// four-way segmented control (*a little · some · a lot · off*) per topic. Below it, one
// `GroupPicker` per facet (also shared with onboarding's Pick phase) is how a reader *adds* a
// topic; `TopicLevels` is how they *tune or drop* one they already have. Two mutations follow
// from that split: `setMine` (the picker's add/remove, unchanged in shape — the whole set,
// weighted) and `setWeight` (the summary's per-topic level, new this task — snaps one existing
// pick straight to a level's canonical weight without touching any other row).
//
// **Both mutations share one `scope`.** `setUserTopics` (behind `setMine`) is a
// delete-then-insert transaction, so two writes in flight can interleave and leave the DB holding
// whichever transaction committed last — not necessarily the last thing the reader did. Giving
// `setWeight` the same `scope.id` puts every write from this screen, of either kind, into one
// serial queue: tune a level, then immediately flip a group chip, and the second write still
// lands after the first rather than racing it. `onMutate` still runs the instant `.mutate()` is
// called either way, so the UI answers immediately regardless of the queue.
//
// The hub (`profile-hub.tsx`) owns the title, the nav and the toolbar, so this renders content
// only.
//
// `dev` (Task 8): a `Reset weights` button, gated on FEED_DEBUG, sets every pick back to 1.0. The
// product build never renders a raw weight number — only the three reader-facing level words the
// segmented control already speaks (D4: the product *does* render a weight now, just never as a
// number — the old "never renders a weight" line this comment replaced predates `TopicLevels`).
export function TopicsScreen({ dev }: { dev: boolean }) {
  const utils = api.useUtils();
  const topics = api.topics.list.useQuery();
  const mine = api.topics.mine.useQuery();
  const [hint, setHint] = React.useState("");

  // Every current pick, topic id → weight — what both `TopicLevels` (the summary) and
  // `GroupPicker` (via `groupState`/`toggleGroup`/`toggleTopic`) read to know what's on.
  const picks = new Map((mine.data ?? []).map((p) => [p.topicId, p.weight]));
  // `topics.list` (= `listTopics()`) is defined as "the rows where facet IS NOT NULL", which is
  // exactly what makes them pickable — so `facet!` here is safe, the same move
  // `app/onboarding/page.tsx` makes for the same reason. Drizzle's inferred row type still marks
  // the column nullable, which is all this map is re-typing away.
  const all = (topics.data ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    facet: t.facet!,
  }));

  const setMine = api.topics.setMine.useMutation({
    // See the file header: one serial queue shared with `setWeight`.
    scope: { id: "topics.setMine" },
    // Optimistic: `topics.mine` is patched to the picks we sent, and settle re-reads the truth.
    // On error the patch is rolled back to the snapshot.
    onMutate: async ({ picks: sent }) => {
      await utils.topics.mine.cancel();
      const previous = utils.topics.mine.getData();
      utils.topics.mine.setData(undefined, sent);
      setHint("");
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.topics.mine.setData(undefined, ctx.previous);
      setHint("Couldn't save that — try again.");
    },
    onSettled: () => void utils.topics.mine.invalidate(),
  });

  const setWeight = api.topics.setWeight.useMutation({
    scope: { id: "topics.setMine" },
    // Optimistic: patches just the one row's weight in the `topics.mine` cache, rather than
    // resending the whole set the way `setMine` does — the segmented control changes one topic
    // at a time and there is no reason to touch the others.
    onMutate: async ({ topicId, level }) => {
      await utils.topics.mine.cancel();
      const previous = utils.topics.mine.getData();
      utils.topics.mine.setData(undefined, (prev) =>
        (prev ?? []).map((p) =>
          p.topicId === topicId ? { ...p, weight: weightOf(level) } : p,
        ),
      );
      setHint("");
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.topics.mine.setData(undefined, ctx.previous);
      setHint("Couldn't save that — try again.");
    },
    onSettled: () => void utils.topics.mine.invalidate(),
  });

  const resetWeights = api.topics.resetWeights.useMutation({
    onSuccess: () => void utils.topics.mine.invalidate(),
  });

  /** Writes `next`, or refuses it: the mutation's floor is one (`min(1)`), and refusing here
   *  keeps the picker honest instead of letting a chip flip and snap back on the server's
   *  BAD_REQUEST. */
  function commit(next: Map<string, number>) {
    if (next.size === 0) {
      setHint("Keep at least one topic.");
      return;
    }
    setMine.mutate({
      picks: [...next].map(([topicId, weight]) => ({ topicId, weight })),
    });
  }

  return (
    // Left-aligned at the list measure inside the hub's wide column (docs/DESIGN_list-screens.md
    // §6) — a plain div, not `Column`, which centres.
    <div className="md:max-w-[600px]">
      <Rise>
        <p className="text-ink/62 px-5 pt-5 text-[15px] leading-[1.5]">
          {picks.size} on. Changes save as you go.
        </p>
      </Rise>

      {/* The summary — every current pick, tune-or-drop, above the picker that adds new ones
          (§3). `onOff` deletes the one row and runs it through the same floor-checked `commit`
          the picker uses; `onLevel` is a direct `setWeight` write, since it never changes *which*
          topics are picked, only how strongly. */}
      <Rise delayMs={60}>
        <section aria-labelledby="topics-mine" className="px-5 pt-7">
          <p
            id="topics-mine"
            className="text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase"
          >
            Your topics
          </p>
          <div className="pt-4">
            <TopicLevels
              topics={all}
              picks={picks}
              onLevel={(topicId, level) => setWeight.mutate({ topicId, level })}
              onOff={(topicId) => {
                const next = new Map(picks);
                next.delete(topicId);
                commit(next);
              }}
            />
          </div>
        </section>
      </Rise>

      {/* One section per facet, in `FACETS` order, every one on the page at once. The eyebrow is
          the facet's name and the heading its onboarding question, so the tab reads as the four
          setup stages laid end to end. `h2`: the hub's identity block holds the page's h1. */}
      {FACETS.map((f, i) => (
        <Rise key={f} delayMs={120 + i * 60}>
          <section aria-labelledby={`topics-${f}`} className="px-5 pt-7">
            <p className="text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase">
              {FACET_LABELS[f]}
            </p>
            <h2
              id={`topics-${f}`}
              className="text-ink-hi mt-2 text-[22px] leading-[1.2] font-semibold tracking-[-0.2px]"
            >
              {FACET_PROMPTS[f]}
            </h2>
            <div className="pt-4">
              <GroupPicker
                facet={f}
                topics={all}
                picks={picks}
                onChange={commit}
              />
            </div>
          </section>
        </Rise>
      ))}

      <p
        role="status"
        aria-live="polite"
        className="text-ink/55 px-5 pt-5 font-sans text-[12.5px]"
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
            Dev only (FEED_DEBUG). Saves nudge a topic&apos;s weight up by 0.5,
            capped at 3.0.
          </p>
        </div>
      )}
      {!dev && <div className="pb-[140px]" />}
    </div>
  );
}
