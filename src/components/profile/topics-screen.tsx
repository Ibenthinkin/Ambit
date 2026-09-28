"use client";

import * as React from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useProfileHub } from "~/components/profile/profile-hub";
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

// /profile/topics — the Topics tab of the Profile hub (docs/DESIGN_topic-facets-and-personas.md §3,
// docs/DESIGN_list-screens.md §3, docs/DESIGN_onboarding-interview.md §3): every pickable topic,
// grouped by facet, every change saved at once. This is the picker Ben feel-tests the feed with,
// so it is built to be flipped constantly: no Done button, no confirmation, an optimistic
// `topics.mine` so the reader sees the result before the server does.
//
// **The summary sits above the picker.** `TopicLevels` — the same component onboarding's Start
// phase shows over the draft — renders every current pick, grouped by facet, with a four-way
// segmented control (*a little · some · a lot · off*) per topic. Below it, one `GroupPicker` per
// facet (also shared with onboarding's Pick phase) is how a reader *adds* a topic; `TopicLevels`
// is how they *tune or drop* one they already have. Two mutations follow from that split:
// `setMine` (the picker's add/remove — the whole set, weighted) and `setWeight` (the summary's
// per-topic level — snaps one existing pick straight to a level's canonical weight without
// touching any other row).
//
// `setMine` resends every pick with the weight this screen's cache holds for it, but the server's
// replace is weight-preserving: a topic that was already picked keeps the weight in its row (a
// level the reader set, or what saves have nudged it to), and only a newly added topic takes the
// weight sent. So a picker tap can never flatten the levels above it.
//
// **Both mutations share one `scope`, and only the last write in it refetches.** `setUserTopics`
// (behind `setMine`) is a delete-then-insert transaction, so two writes in flight could interleave
// and leave the database holding whichever committed last — not necessarily the last thing the
// reader did. One `scope.id` puts every write from this screen, of either kind, into a serial
// queue. `onMutate` still runs the instant `.mutate()` is called, so the UI answers immediately
// regardless of the queue. The queue brings a second rule with it: a write that settles while
// another is still waiting must not refetch `topics.mine`, or the server's rows from *between*
// the two writes land over the waiting write's optimistic patch — and a tap in that window builds
// its whole-set `setMine` from the stale cache and deletes the pick the waiting write added.
// `settle()` below refetches only when this write is the last one in the scope.
//
// The hub (`profile-hub.tsx`) owns the title, the nav, the toolbar and the toast, so this renders
// content only; its two refusals ("Keep at least one topic." and a failed save) go through the
// hub's toast, which is fixed above the toolbar and so visible wherever on the page the reader
// tapped.
//
// `dev`: a `Reset weights` button, gated on FEED_DEBUG, sets every pick back to 1.0. The product
// build never renders a weight as a number — only the level words the segmented control speaks.
/** The one queue both writes join — see the file header. The id is only a key: never shown, never
 *  sent to the server. */
const WRITE_SCOPE = { id: "topics.setMine" };

export function TopicsScreen({ dev }: { dev: boolean }) {
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const hub = useProfileHub();
  const topics = api.topics.list.useQuery();
  const mine = api.topics.mine.useQuery();

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

  /** Refetch `topics.mine` — unless another write is still queued behind this one (file header).
   *  `isMutating` counts mutations whose status is `pending`, and TanStack Query flips a mutation
   *  to `success`/`error` only *after* its `onSettled` returns, so the write settling right now
   *  still counts itself: `1` means it is the last. A queued write is `pending` from the moment
   *  `.mutate()` is called, so it counts too, even before its request has started. */
  function settle() {
    const inScope = queryClient.isMutating({
      predicate: (m) => m.options.scope?.id === WRITE_SCOPE.id,
    });
    if (inScope <= 1) void utils.topics.mine.invalidate();
  }

  const setMine = api.topics.setMine.useMutation({
    // See the file header: one serial queue shared with `setWeight`.
    scope: WRITE_SCOPE,
    // Optimistic: `topics.mine` is patched to the picks we sent, and settle re-reads the truth.
    // On error the patch is rolled back to the snapshot.
    onMutate: async ({ picks: sent }) => {
      await utils.topics.mine.cancel();
      const previous = utils.topics.mine.getData();
      utils.topics.mine.setData(undefined, sent);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.topics.mine.setData(undefined, ctx.previous);
      hub.toast("Couldn't save that — try again.");
    },
    onSettled: settle,
  });

  const setWeight = api.topics.setWeight.useMutation({
    scope: WRITE_SCOPE,
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
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.topics.mine.setData(undefined, ctx.previous);
      hub.toast("Couldn't save that — try again.");
    },
    onSettled: settle,
  });

  const resetWeights = api.topics.resetWeights.useMutation({
    onSuccess: () => void utils.topics.mine.invalidate(),
  });

  /** Writes `next`, or refuses it: the mutation's floor is one (`min(1)`), and refusing here
   *  keeps the picker honest instead of letting a chip flip and snap back on the server's
   *  BAD_REQUEST. */
  function commit(next: Map<string, number>) {
    if (next.size === 0) {
      hub.toast("Keep at least one topic.");
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
