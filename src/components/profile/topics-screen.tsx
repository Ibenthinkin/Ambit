"use client";

import * as React from "react";

import { Chip } from "~/components/ui/chip";
import { Rise } from "~/components/ui/rise";
import {
  FACETS,
  FACET_LABELS,
  FACET_PROMPTS,
} from "~/server/config/topic-facets";
import { groupsFor } from "~/server/config/topic-groups";
import type { TopicFacet } from "~/server/db/schema";
import { api } from "~/trpc/react";

// /profile/topics — the Topics tab of the Profile hub (docs/DESIGN_topic-facets-and-personas.md §3;
// a tab since 09-12-26, docs/DESIGN_list-screens.md §3): every pickable topic, grouped by facet,
// every toggle saved at once. This is the picker Ben feel-tests the feed with, so it is built to be
// flipped constantly: no Done button, no confirmation, an optimistic `topics.mine` so the chip
// answers before the server does. The write is `setMine` with the full set — the same procedure
// onboarding uses — so `setUserTopics`'s weight-preserving replace applies to every flip: a topic
// kept across the write keeps its learned weight.
//
// The hub (`profile-hub.tsx`) owns the title, the nav and the toolbar, so this renders content
// only. The facets are **four stacked sections** on one page, each under the question onboarding
// asked for it (`FACET_PROMPTS`) — Ben's 09-12-26 review of the list screens, replacing a chip
// row that showed one facet at a time. A filter made the reader flick to see what they had
// picked elsewhere; the whole vocabulary is a few screens of chips, and the four questions in
// sequence read as the onboarding screen laid flat, which is what this is. Nothing is a
// tablist: the hub's nav above is the screen's one row of sections.
//
// It replaced Settings' "What you see" sheet, which could only ever offer the sixteen and had no
// room for four groups of a hundred chips.
//
// **Umbrella groups since 09-25-26** (design doc §2a; `config/topic-groups.ts`): each section
// leads with its facet's group chips — the same chips onboarding showed — and folds the flat
// topic list behind a "Show all N topics" disclosure, so the page reads as onboarding laid flat
// and the fine-tuning is one tap away rather than the whole page. A group chip is a tri-state
// summary of its listed members: on when all are picked, off when none, `mixed` ("· 3 of 12")
// otherwise. Tapping completes a mixed group rather than clearing it — the reader's likely
// intent when they see "3 of 12" is "the rest too", and the full group is one more tap from off.
// Groups are picker-side only: every write is still `setMine` with topic ids.
//
// `dev` (Task 8): under FEED_DEBUG each pressed chip shows its learned weight and a Reset button
// sets them all back to 1.0. The product build never renders a weight.
export function TopicsScreen({ dev }: { dev: boolean }) {
  const utils = api.useUtils();
  const topics = api.topics.list.useQuery();
  const mine = api.topics.mine.useQuery();
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
  const all = topics.data ?? [];
  // Which sections have their flat topic list open. Local state, reset on navigation: the
  // folded page is the default view every visit, the way onboarding was coarse.
  const [expanded, setExpanded] = React.useState<Set<TopicFacet>>(new Set());

  /** Writes `next`, or refuses it: the mutation's floor is one (`min(1)`), and refusing here
   *  keeps the chip honest instead of letting it flip and snap back on the server's BAD_REQUEST. */
  function commit(next: Set<string>) {
    if (next.size === 0) {
      setHint("Keep at least one topic.");
      return;
    }
    setMine.mutate({ topicIds: [...next] });
  }

  function toggle(topicId: string) {
    const next = new Set(picked);
    if (next.has(topicId)) next.delete(topicId);
    else next.add(topicId);
    commit(next);
  }

  /** A group tap: all listed members on unless every one already is, in which case all off. */
  function toggleGroup(members: readonly string[]) {
    const next = new Set(picked);
    const complete = members.every((m) => picked.has(m));
    for (const m of members) {
      if (complete) next.delete(m);
      else next.add(m);
    }
    commit(next);
  }

  function toggleExpanded(f: TopicFacet) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  return (
    // Left-aligned at the list measure inside the hub's wide column (docs/DESIGN_list-screens.md
    // §6) — a plain div, not `Column`, which centres.
    <div className="md:max-w-[600px]">
      <Rise>
        <p className="text-ink/62 px-5 pt-5 text-[15px] leading-[1.5]">
          {picked.size} on. Changes save as you go.
        </p>
      </Rise>

      {/* One section per facet, in `FACETS` order, every one on the page at once. The eyebrow is
          the facet's name and the heading its onboarding question, so the tab reads as the four
          setup stages laid end to end. `h2`: the hub's identity block holds the page's h1. */}
      {FACETS.map((f, i) => {
        const sectionTopics = all.filter((t) => t.facet === f);
        const sectionGroups = groupsFor(f, sectionTopics);
        const open = expanded.has(f);
        const n = sectionTopics.length;
        return (
          <Rise key={f} delayMs={80 + i * 60}>
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
              {/* The group chips — onboarding's stage, laid flat. A group's state is derived from
                  its listed members on every render, never stored, so it cannot drift from the
                  flat list below it. */}
              <div
                role="group"
                aria-label={`${FACET_LABELS[f]} groups`}
                className="flex flex-wrap gap-[10px] pt-4"
              >
                {sectionGroups.map(({ group, members }) => {
                  const on = members.filter((m) => picked.has(m)).length;
                  const state =
                    on === 0 ? false : on === members.length ? true : "mixed";
                  return (
                    <Chip
                      key={group.id}
                      selected={state}
                      onClick={() => toggleGroup(members)}
                    >
                      {state === "mixed"
                        ? `${group.label} · ${on} of ${members.length}`
                        : group.label}
                    </Chip>
                  );
                })}
              </div>
              {/* The disclosure. A text button, not a chip: it is not a pick. `aria-controls`
                  names the flat list it opens, which only exists while open. */}
              {n > 0 && (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={open ? `topics-${f}-all` : undefined}
                  onClick={() => toggleExpanded(f)}
                  className="text-ink/62 hover:text-ink decoration-ink/25 mt-4 font-sans text-[13px] underline underline-offset-[3px] transition-colors"
                >
                  {open
                    ? `Hide ${FACET_LABELS[f].toLowerCase()} topics`
                    : `Show all ${n} ${n === 1 ? "topic" : "topics"}`}
                </button>
              )}
              {open && (
                <div
                  id={`topics-${f}-all`}
                  role="group"
                  aria-label={`${FACET_LABELS[f]} topics`}
                  className="flex flex-wrap gap-[10px] pt-4"
                >
                  {sectionTopics.map((t) => (
                    <Chip
                      key={t.id}
                      size="sm"
                      selected={picked.has(t.id)}
                      onClick={() => toggle(t.id)}
                    >
                      {dev && picked.has(t.id) && weightOf.has(t.id)
                        ? `${t.label} · ${weightOf.get(t.id)!.toFixed(1)}`
                        : t.label}
                    </Chip>
                  ))}
                </div>
              )}
            </section>
          </Rise>
        );
      })}

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
