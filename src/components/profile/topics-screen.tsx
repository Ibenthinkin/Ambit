"use client";

import * as React from "react";

import { useQueryClient } from "@tanstack/react-query";

import { ExhibitionCard } from "~/components/onboarding/exhibition-card";
import { useProfileHub } from "~/components/profile/profile-hub";
import { levelRowOrder, TopicLevels } from "~/components/topics/topic-levels";
import { Button } from "~/components/ui/button";
import { Eyebrow } from "~/components/ui/eyebrow";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Rise } from "~/components/ui/rise";
import { TextLink } from "~/components/ui/text-link";
import { pickWeight, weightOf } from "~/server/config/topic-levels";
import { api } from "~/trpc/react";

// /profile/topics — the Topics tab of the Profile hub, after the questionnaire (10-02-26,
// docs/PLAN_onboarding-questionnaire.md §4). It is the questionnaire's reveal, kept: the same
// level rows of the reader's topics, each at *a little · some · a lot · off*, plus a search box to
// add one and a link to answer the questions again. Every change saves at once — no Done button,
// no confirmation, an optimistic `topics.mine` so the reader sees the result before the server.
//
// The rows sit under facet headings again (DESIGN_redesign decision 3, 10-06-26) — `TopicLevels`
// draws them, shared with the reveal. What it still does not have is umbrella-group chips:
// finding a topic is the search box's job.
//
// Two writes:
//   - `setWeight` — a level change. One row, snapped to the level's canonical weight.
//   - `setMine`   — adding (from search) or removing (off). The whole set is resent, but the
//     server's replace is weight-preserving ("keep" mode): a topic that was already picked keeps
//     the weight in its row — a level the reader set, or what saves have nudged it to — and only
//     a newly added topic takes the weight sent. So adding one topic never flattens the others.
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
// `settle()` below refetches only when this write is the last one in the scope
// (`topics-screen.queue.test.tsx` runs this through TanStack Query's real queue).
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

/** How many search results to offer — a short list to choose from, not a second browse page. */
const MAX_RESULTS = 8;

/**
 * Label search over `topics`, minus what's already picked: case-insensitive, anywhere in the
 * label, with labels that *start* with the words first ("bo" → Books, Botany before any "…bo…"),
 * then by label. Pure, and exported so its ordering is a unit of its own if it ever grows.
 */
export function searchTopics<T extends { id: string; label: string }>(
  topics: readonly T[],
  picked: ReadonlySet<string>,
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [];
  return topics
    .filter((t) => !picked.has(t.id) && t.label.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.label.localeCompare(b.label);
    })
    .slice(0, MAX_RESULTS);
}

export function TopicsScreen({ dev }: { dev: boolean }) {
  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const hub = useProfileHub();
  const topics = api.topics.list.useQuery();
  const mine = api.topics.mine.useQuery();
  // The stored exhibition (First Exhibition); null for a reader who signed up on bank v1.
  const taste = api.topics.taste.useQuery();
  const [query, setQuery] = React.useState("");

  // Where keyboard focus goes when a row is switched off. The "off" cell unmounts with its row,
  // which would drop focus to <body> and strand a keyboard reader at the top of the page.
  // `removed` is the topic just switched off; `target` is the row to land on (the next one, or
  // the previous if it was last) or "search" when nothing is left. An effect finishes the job
  // once the row has actually left the list (the removal is optimistic, a tick later).
  const focusAfterRemoval = React.useRef<{
    removed: string;
    target: string;
  } | null>(null);
  const addSectionRef = React.useRef<HTMLElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Every current pick, topic id → weight.
  const picks = new Map((mine.data ?? []).map((p) => [p.topicId, p.weight]));
  const all = (topics.data ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    facet: t.facet,
  }));
  const results = searchTopics(all, new Set(picks.keys()), query);

  // Finish the focus hand-off above once the removed row has actually left `picks`.
  React.useEffect(() => {
    const pending = focusAfterRemoval.current;
    if (!pending || picks.has(pending.removed)) return;
    focusAfterRemoval.current = null;
    const el =
      pending.target === "search"
        ? addSectionRef.current?.querySelector<HTMLElement>("input")
        : listRef.current?.querySelector<HTMLElement>(
            `[data-topic="${pending.target}"] [role="radio"][aria-checked="true"]`,
          );
    el?.focus();
  });

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
   *  keeps the list honest instead of letting a row vanish and snap back on the server's
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
    // §6) — a plain div, not `Column`, which centres. 720 px is DESIGN_redesign §6.5's.
    <div className="md:max-w-[720px]">
      <Rise>
        <p className="text-ink px-5 pt-8 text-[24px] leading-[1.35] tracking-[-0.01em]">
          <span>{picks.size} on.</span>{" "}
          <span className="text-ink/62 italic">Changes save as you go.</span>
        </p>
      </Rise>

      {/* Add — a search over every pickable topic the reader doesn't have yet. */}
      <Rise delayMs={60}>
        <section ref={addSectionRef} className="px-5 pt-10">
          <Field label="Add a topic">
            <Input
              size="lg"
              type="search"
              value={query}
              placeholder="Search — film, maps, the sea…"
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          {query.trim() !== "" && (
            <div aria-live="polite" className="pt-3">
              {results.length === 0 ? (
                <p className="text-ink/62 text-[15px]">
                  No topics match “{query.trim()}”.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-[10px]">
                  {results.map((t) => (
                    <li key={t.id}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Naming one topic by itself is a strong signal — `pickWeight(1)`,
                          // "a lot" — and the level is one tap away if that is too much.
                          commit(new Map(picks).set(t.id, pickWeight(1)));
                          setQuery("");
                        }}
                      >
                        Add {t.label}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </Rise>

      {/* The reader's first exhibition, as the reveal showed it; a retake replaces it.
          Below the search, as DESIGN_redesign §6.5 orders the screen. */}
      {taste.data && (
        <Rise delayMs={90}>
          <div className="px-5 pt-10">
            <ExhibitionCard
              taste={taste.data}
              topicLabels={new Map(all.map((t) => [t.id, t.label]))}
            />
          </div>
        </Rise>
      )}

      {/* Tune or drop. `onLevel` is a direct `setWeight` — it never changes *which* topics are
          picked; `onOff` removes the row through the floor-checked `commit`. */}
      <Rise delayMs={120}>
        <section aria-labelledby="topics-mine" className="px-5 pt-11">
          {/* An h2, so the facet headings (h3) under it don't skip a level. */}
          <Eyebrow as="h2" id="topics-mine" className="block text-[11px]">
            Your topics
          </Eyebrow>
          <div ref={listRef} className="pt-6">
            <TopicLevels
              topics={all}
              picks={picks}
              onLevel={(topicId, level) => setWeight.mutate({ topicId, level })}
              onOff={(topicId) => {
                // Choose the focus target from the list as drawn (by heading, then label —
                // `levelRowOrder` is TopicLevels' own order) before the row goes. The
                // last-topic floor refuses in `commit`; the effect then never sees the row
                // leave, so nothing moves.
                const order = levelRowOrder(all, picks);
                const i = order.indexOf(topicId);
                focusAfterRemoval.current = {
                  removed: topicId,
                  target: order[i + 1] ?? order[i - 1] ?? "search",
                };
                const next = new Map(picks);
                next.delete(topicId);
                commit(next);
              }}
            />
          </div>
        </section>
      </Rise>

      <Rise delayMs={180}>
        <p className="text-ink/62 px-5 pt-10 text-[15px] leading-[1.5]">
          Want to start over?{" "}
          <TextLink href="/onboarding?retake=1" tone="body">
            Retake the questions
          </TextLink>
        </p>
      </Rise>

      {dev && (
        <div className="px-5 pt-6 pb-[140px]">
          <button
            type="button"
            onClick={() => resetWeights.mutate()}
            className="border-hairline border-ink/18 text-ink h-[40px] px-5 text-[13px]"
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
