# Phase 5.9 walkthrough — Saved + collections UI

**Executed 08-23-26** against `docs/PHASE5_PLAN_5.9.md`, on branch `feat/5.9-saved-collections-ui`,
straight through with no mid-phase stop, as the plan prescribed. `bun run check` green (581 vitest
tests, 21 of them new), `bun run build` clean, the new e2e spec 5/5.

**Status: complete.** The plan survived contact with reality almost untouched — no design question
came up, and the two places that argued back were both about the *e2e environment*, not the code.
One finding improved on the plan: the hydration handoff turned out to cover chip taps too (below).

---

## What shipped

**The screen.** `/saved` — the app's last 404-ing internal route. Header with back arrow, "Saved"
title and total count line ("Your quiet collection" / "1 thing kept" / "N things kept");
horizontally scrolling collection chips ("All · N" plus one per collection, counts omitted at
zero); the feed's own masonry — each saved item dressed as a synthetic CORE `FeedCard` so
`buildTiles`/`packColumns` are reused verbatim, and CORE can never synthesize a Because tile; an
always-visible unsave badge per tile (glass circle over images, flat over article cards);
optimistic unsave with the "Removed from Saved" toast and the item-sheet invalidation trio; empty
state, filtered-empty state, and an error branch; the pill with its white-filled `on-saved`
bookmark and no Share. Zero backend changes, exactly as planned — the whole screen sits on 5.5's
`saves` router.

**The two scope reinterpretations** (both BUILD_PLAN's own, stated in code comments): chips are
**collections**, not the prototype's All/Images/Reading type filter; the grid is the **5.6 shared
masonry**, not the prototype's rounded caption grid. Consequence of the second: no per-tile "Open
in reader →" link — the whole article tile is the tap target.

**Navigation semantics** (the phase's real content):

- Filter state lives in the URL. Chips `router.replace` to `/saved?collection={id}`; the active
  chip and the `saves.list` input both derive from `useSearchParams`. A stale or hand-edited id
  degrades to the filtered-empty line, nothing to validate.
- Image tap → gallery via `markGalleryOrigin` + push, byte-for-byte the `HeroGalleryLink` move.
  The gallery needed zero changes — the origin marker was built entry-agnostic in 5.8.
- Article tap → reader with **no** origin marker: `feed-origin` semantically means "the *feed* is
  one entry down", and writing it from Saved would mislabel the item page's pill. Accepted seam
  (commented at the call site): swipe-back from a Saved-opened reader pushes `/feed?focus=`.
- Leaving Saved uses the new `saved-origin` marker — third small origin file, same deliberate
  non-abstraction as `gallery-origin`. `CollectionsSheet` marks it before pushing; the header
  back-arrow and the pill's Feed button share one `leaveSaved` = marked ? pop : push `/feed`.
  Verified end-to-end: leaving Saved returns to the identical feed with zero `feed.page` draws.

**Small enablers.** `Chip` grew the `size="sm"` variant its header comment had been promising
(12.5px/500, tighter padding, **no** `chip-pop` on select — the pop is onboarding's, and a filter
row that squashes on every flick reads as noise). `onLongPress` went optional on
`ImageTile`/`ArticleCard` — Saved has no item sheet; the badge replaces it — with no feed change,
since `usePress` already treats an absent handler as "never arm the timer".

## The hydration handoff — better than planned

The RSC shell (`app/saved/page.tsx`) prefetches `saves.list` / `collections` / `count` with inputs
byte-identical to the client hooks, same contract as `/feed`. The done-bar check was scripted
(throwaway Playwright spec, deleted after): a hard document load of `/saved` painted the masonry
with **zero** client `saves.*` requests.

The plan expected each chip tap to then cost one client `saves.list` fetch and shrugged at it
("idempotent read, unlike `feed.page` no corpus is burned"). Reality: a chip tap's
`router.replace` is an RSC navigation — the shell re-runs with the new `?collection=`, prefetches
the filtered list server-side, and the payload hydrates the new query key. Measured: **zero**
client tRPC requests per chip tap; the data rides the route's RSC response instead. The
"duplicate fetch is harmless" rationale in Decision 1 stands, it just never gets exercised.

## Where the e2e environment argued back (the code didn't)

The full suite went from four spec files to five, and five parallel workers against one dev
server pushed the suite over a threshold the four-spec suite was already brushing: server-bound
waits (a fresh user's first feed compose, a save's invalidation round trip) started outliving
Playwright's 5-second default assertion timeout, with a **rotating** victim — `auth.spec:68`
three runs straight (it had the thinnest wait in the suite), then `feed.spec`'s console-error
test, then this spec's own save round-trip, plus the documented `gallery.spec:193` flake making
its usual appearances. Confirmed environmental, not regression, per the CLAUDE.md protocol:
every failing test passes in isolation, and **`main` fails the same way under the same load**
(verified 08-23-26: `feed.spec:173` red on a clean `main` run).

Two mitigations landed, both the same shape: the server-bound waits in `saved.spec.ts` and the
one in `auth.spec:68` now carry the 15-second allowance `feed.spec`'s own polls have always used.
Also cleared ~271 accumulated e2e users / ~6.4k `seen_item` rows (the documented `gallery:193`
aggravator) mid-session. Final state: three consecutive full runs green **except**
`gallery.spec:193` in two of them — which CLAUDE.md and the plan's own done bar say is not
evidence about the branch (it passed 5/5 in isolation on this branch immediately after).

The honest residual: the suite's margin under five workers is thin, and the next spec file added
will hit this again. If it does, the fix worth considering is a `workers` cap in
`playwright.config.ts`, not more per-assertion allowances.

## Deferred / flagged (from the plan's §7, unchanged)

- **Public share-collection (`/c/{collection}`): deferred entirely.** No share affordance on
  `/saved`; nothing to degrade — no prototype screen exists for it either.
- **Collection creation lives in 5.10.** Chips show the three seeded defaults plus any collection
  that acquires saves; the sheet's "New collection" signpost row already points at `/profile`.
- **Reachability (open question for Ben):** Saved remains two hops from the feed (pill bookmark →
  sheet → row). 5.9 deliberately added no nav entry — possibly intentional restraint per
  BUILD_PLAN; 5.10's Settings adds a "Saved with live count" shortcut card. **Decide there.**
- **No `saves.list` pagination** — accepted for v1; revisit only if a real account's list gets
  slow.
- **Reader-entry back seam** (Decision 3): swipe-back from a Saved-opened item page goes to a
  fresh `/feed?focus=`, not Saved. Known, commented, cheap to revisit if the device pass
  dislikes it.

## Files

New: `src/app/saved/page.tsx`, `src/components/saved/{saved-screen,saved-tile,collection-chips}.tsx`,
`src/components/saved/saved-origin.ts`, `src/components/saved/saved-screen.test.tsx`,
`e2e/saved.spec.ts`.

Modified: `src/components/ui/chip.tsx` (+tests), `src/components/feed/{image-tile,article-card}.tsx`
(optional `onLongPress`), `src/components/sheets/collections-sheet.tsx` (+sheet test: the origin
marker), `src/server/api/routers/routers.integration.test.ts` (the chips'-arithmetic test),
`e2e/auth.spec.ts` (the 15s allowance).

Untouched, per the plan's do-not-touch list: the saves router, `db/*`, gallery code, `masonry.ts`,
`use-press.ts`, `pill-toolbar.tsx`, `toast.tsx`.
