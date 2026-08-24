# Phase 6.1 walkthrough — feed learns from saves

**Executed 08-23-26** against `docs/PHASE6_PLAN_6.1.md`, on branch
`feat/6.1-feed-learns-from-saves`. The save→feed learning loop: a new save bumps its topic's
`user_topic.weight` (visibly — the toast says so), and the item's `aesthetic_tags` start feeding
the item-draw boost through derived taste keywords.

**Status: complete.** All four locked decisions shipped as decided; no mid-phase stops. `bun run
check` (typecheck + lint + format + 558 vitest tests, integration suites running against real
Postgres, not skipped) green at every commit; the two save-touching e2e specs (`feed.spec.ts`,
`item.spec.ts`, 15 tests) green after T4 with **zero assertion edits** — the plan's prediction
that the existing toast assertions (substring / prefix-regex) would survive the longer copy held.

---

# Per-task evidence

## T1 — Weight bump on new save

`bumpTopicWeight` (`db/topics.ts`) landed as the plan's preferred single atomic upsert — Drizzle
accepted the `xmax = 0` returning expression without a fight, so the select-then-branch fallback
was never needed. `saveToCollection` distinguishes new-save from move via the previously-dead
`isItemSaved`, and returns `drift: { topicLabel, isNew } | null`.

Integration coverage (`routers.integration.test.ts`, "6.1 — a save teaches the feed", driven as
`otherUserId` so the 7.0-fixture on `userId` can't contaminate the arithmetic): row created at
1.5 with `isNew: true` · move reports `drift: null` and leaves 1.5 · direct bumps step 2.0 → 2.5
→ 3.0 and a further bump stays clamped · unsave leaves the learned weight untouched.

## T2 — Derived taste keywords

`deriveTasteKeywords` (pure) + `getTasteKeywords` (last-24 unique tags over the 30 most recent
saves) in `db/saves.ts`; `getFeedPage` now fetches weights and keywords in parallel and the
`tasteKeywords: []` TODO is gone. Unit tests pin flatten-in-recency-order, case-insensitive
first-form dedupe, exact cap, empty history; the integration test proves the DB ordering:
`["botanical plate", "sepia", "etching"]` — most recent save first, the shared tag kept at its
first-seen slot.

The feed.test.ts knob-gating block needed one more mock (`getTasteKeywords`, resolving `[]`) —
anticipated in spirit by the plan's "nothing downstream of the array changes", but the mock
itself wasn't in the plan's steps.

## T3 — Distribution tests

`composePage — learned weights (6.1)` in `feed.test.ts`, importing the real `WEIGHT_CAP` (the
module mock now spreads `importActual` so pure constants stay real). Pooled over 8 fixed seeds ×
1000-card pages, every page asserted full:

- Uniform weights: topic-a share 0.25 ± 0.03 ✓. Capped topic: share rises **> 5pp** over uniform
  but stays **< 0.5** — DRIFT+JUMP's 60% of slots use weights only to pick walk starts, so even a
  fully-learned topic never takes a majority.
- Under shipped knobs (pageSize 12, topicCap 3), a capped-weight topic never exceeds 3 cards —
  a quarter of the page, bounded by the diversity cap alone.

## T4 — The combined save toast

`saveToastText` (`src/lib/save-toast.ts`) is the single copy source for all four call sites
(feed screen, item shell, gallery screen, `/dev/tokens`); both sheets widened `onSaved` to carry
`drift`. Invalidations untouched — deliberately **no `feed.page` invalidation**: weights and
keywords are read per request, so the next page picks them up without reshuffling a feed
mid-scroll.

## T5 — End-to-end verification (scripted form of the plan's manual FEED_DEBUG check)

A throwaway script (same fixtures as production: real router calls, real `getFeedPage` with
`FEED_DEBUG`) onboarded two users with the same four topics, then saved 5 high-scoring botany
items as one of them:

- Every save toasted the topic: `Saved to Articles · Drifting a little more toward Botany`.
- Weights after the burst: botany 3.0 (capped after the 4th bump), the other three at 1.0.
- Taste keywords: 16 unique tags derived from the 5 items, recency-ordered.
- Fresh feed pages (4 pages, 48 cards each user): **10/48 botany for the saver vs 5/48 for the
  cold user** — the share doubled, visibly but not overwhelmingly, exactly the done bar.

---

# Where the plan and reality disagreed

1. **T3's "same 4-topic dense-graph fixture" is subtly asymmetric for per-topic shares.** The
   tier-mix test's flat `sim: 0.3` graph is fine for measuring *tier* ratios, but `pickJump`
   slices each row's stored tail, and with tied sims tail membership falls out of array order —
   topic "a" (first in every row) sat in almost no JUMP tails and measured 0.195 instead of 0.25
   under uniform weights, failing the plan's sanity assertion. Fixed by rotating sims
   (row of topic i = i+1 @ 0.9, i+2 @ 0.5, i+3 @ 0.1, cyclic) so every topic plays the same role
   in every mechanism. The plan's assertions then passed unchanged.
2. **The plan predicted `sheets.test.tsx` would fail *typecheck* once components read
   `result.drift`.** It didn't — the tRPC hooks are `vi.mock`ed at runtime, not at the type
   level, so the hand-typed mock shape never meets the component's types. The break was real but
   showed up as one runtime assertion failure (`onSaved` now called with two args). Same fix as
   planned: the mocked result type carries `drift`, plus the new pass-through test.
3. **Toast copy diverges from phase0** (locked decision, recorded here as the plan requires):
   phase0's second variant reads "Now **also** drifting toward"; shipped copy is "Drifting a
   little more toward" for an existing row, "Now drifting toward" for a new one.

# Documented, deliberately not mechanized

- **An authed never-onboarded user can save from the public `/i/`/`/g/` pages.** That creates a
  single-row weights map (their whole feed then starts from one topic — bounded: CORE is only
  40% of slots, topicCap caps it at 3 cards/page, DRIFT/JUMP wander outward) and flips
  `hasCompletedOnboarding`, so `/onboarding` will skip the picker for them forever. Acceptable
  for an invite-gated app whose sign-up flow lands on onboarding; build nothing.
- **`LEAST` clamps a hand-set super-cap weight *down* on its next bump.** Production writes can't
  exceed 3.0; only test fixtures can (the integration file hand-sets 7.0 on `userId`'s topicA —
  which is exactly why the 6.1 tests run as `otherUserId`). A fixture quirk, not a bug.
