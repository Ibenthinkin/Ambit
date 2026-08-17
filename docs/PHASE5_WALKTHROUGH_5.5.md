# Phase 5.5 walkthrough — shared backbone + collections backend

> Companion to `PHASE5_PLAN_5.5.md`. Executed 08-16-26 on branch `phase-5.5-backbone`, in the same
> session that wrote the plan. Followed the plan's 10 numbered steps in order, in two commits
> (backend 1–4, UI 5–9, with step 10's test changes folded into each).
>
> Scope: the two backbone components every screen from 5.6 onward mounts, plus the collections data
> model the save sheet needs. No product screen changed — `/feed` is still the throwaway
> placeholder — so the whole phase is demoed on `/dev/tokens` against the real router.

## What shipped

### Backend (steps 1–4)

- **`collection` table** — nanoid id (the `invite`/`item` pattern: app-generated so the id is known
  before insert), `user_id`, `name`, `created_at`, plus `UNIQUE (user_id, name)` and
  `idx_collection_user`. Migration `0002_quick_whizzer.sql`, generated and read before applying;
  it came out as exactly the predicted one `CREATE TABLE`, one `ADD COLUMN`, the constraint, the
  index and two FKs — no drops, no renames.
- **`saved_item.collection_id`** — nullable, `ON DELETE SET NULL`. Nullable means "saved but
  uncollected": counted by "Everything kept", filed under no named collection. `SET NULL` rather
  than `CASCADE` so deleting a collection can never silently delete someone's saves (deletion
  isn't built yet — the constraint is written correctly now so 5.10 doesn't have to migrate it).
- **`src/server/db/collections.ts`** — `getCollections` (counts via `LEFT JOIN`, so an empty
  collection reports `0` instead of vanishing from the list; lazily seeds Articles/Art/Photos on
  first read), `getCollectionForUser` (the ownership check), `setItemCollection` (one upsert covers
  both first-save and re-file — that `onConflictDoUpdate` *is* the one-collection-per-item rule).
- **`src/server/db/saves.ts`** — `saveItem` deleted along with `saves.toggle`; the write path is now
  `setItemCollection` alone. `getSavedItems` gained an optional `collectionId` (5.9's chips), and
  `getSavedCount` was added so the "Everything kept" row doesn't fetch every item record to call
  `.length` on it.
- **Router** — `toggle` → `collections` / `saveToCollection` / `unsave` / `list` / `count`.
- **SPEC** §5.4, new §5.4c, §5.6, §6.3, §7 all updated to match.

### UI (steps 5–9)

- **`src/hooks/use-press.ts`** (first file in a new directory) — 12px slop, 450ms long press,
  guarded `navigator.vibrate`, refs rather than state so a gesture never re-renders mid-press, and
  a teardown that clears the timer because a long press typically opens a sheet that unmounts the
  pressed element.
- **`BottomSheet` v2** — centered title slot, exit animation, `maxHeightPct`, and **no horizontal
  padding on the shell** so the collection sheets can scroll their rows edge to edge (content owns
  its own insets, matching the prototypes' `padding:10px 0 26px`).
- **`PillToolbar` + `AvatarChip`** — the README's pill spec verbatim, ≥44px tap targets over the
  design's 31px glyphs, three bookmark states, and the `pointer-events` split.
- **Three sheets over one shell** in `src/components/sheets/` — `SaveToCollectionSheet`,
  `CollectionsSheet`, `ShareSheet`, plus the shared `CollectionRow`.
- **`/dev/tokens`** hosts all of it against the real router.

## Findings worth keeping

**jsdom has no `AnimationEvent` at all, so React never delivers `onAnimationEnd` there.** Probed
four ways — from a child with `bubbles: true`, a manual bubbling `dispatchEvent`, directly on the
handler element, and with testing-library's default init — all zero calls. This started as "why is
my exit-animation test failing" and the answer was that the test *couldn't* pass. The sheet now
attaches a **native** listener via a ref instead: testable, and it's the path that actually runs in
a browser. Worth remembering for 5.8, which has considerably more animation to test than this.

**The sheet's exit state is adjusted during render, not in an effect.** The first version set it in
a `useEffect` and tripped `react-hooks/set-state-in-effect` — which turned out to be flagging a real
defect, not just style: an effect renders the closed sheet once and *then* re-renders it as leaving,
which is a visible flicker on the way out. React's documented "adjusting state when a prop changes"
pattern (compare against a `prevOpen` state, set during render) fixes both, and shrinks the
component's state to a single `leaving` bit with `mounted = open || leaving` derived.

**`animationend` bubbles.** Without a `e.target === el` guard, any child animation finishing inside
an open sheet would tear it down mid-exit. There's a test for it.

**A statistical test's fixture has to be able to reach what it measures.** Not from this phase — see
the same day's `feed.test.ts` de-flaking — but it's the same lesson as the `LEFT JOIN` in
`getCollections`: the shape of the fixture silently decides what the assertion means.

## Deviations from the plan, all deliberate

1. **`saves.count` was added as a procedure.** The plan specified `getSavedCount` in the repo but
   left the browse sheet free to use `saves.list().length` — which would fetch every item record to
   produce a number. It has a real consumer (the "Everything kept" row), so it isn't the
   dead-procedure pattern that `toggle` was.
2. **Seeded collections get staggered `created_at` values.** Postgres' `now()` is transaction start
   time, identical for all three rows in one insert, which left `ORDER BY created_at` a three-way
   tie and no stable sheet order. Offsetting by index keeps the column honest ("the defaults were
   created first, in this order") and makes a later user-created collection sort naturally after
   them.
3. **`onSaved` reports the collection id as well as its name.** Callers need the id to move their
   own `currentCollectionId`, so reopening the sheet puts the accent dot on the right row. The
   plan's signature passed only the name, which would have forced every caller into a second query.
4. **`Bookmark` needed no `filled` prop** — 5.4 had already added one. The plan assumed otherwise.
5. **Share targets got explicit `aria-label`s.** Three of the six are a bare letter glyph over a
   caption, which announces as "X X" at best and "P" at worst; it also made them untestable by
   accessible name.

## Verification

- `bun run check` — typecheck, lint, format, **268 tests** (was 219). Green.
- **19 router tests ran against real Postgres** (not skipped — verified in verbose output),
  including the cross-user authorization case: saving into another user's collection returns
  `NOT_FOUND`, and nothing lands in their collection.
- `bun run build` clean; `/dev/tokens` still absent from the production build.
- `bun run e2e` — see below.

## The e2e run: a cold-compile flake, and how it nearly got misdiagnosed

**Final state: `bun run e2e` green, 7/7, three consecutive runs at ~14s each.** Getting there is
worth writing down, because the investigation took a wrong turn that looked convincing.

First, `bun run e2e` couldn't start at all: a **12-hour-old hung dev server** held port 3000 with no
listening socket whatsoever, so Playwright's `reuseExistingServer` had nothing to reuse and its own
`next dev` refused to boot alongside it. Killed it (it was serving nothing).

Then the run took **11.5 minutes** and failed one test: `auth.spec.ts:162`, where signing in with a
stale password after a reset should surface an `auth-error`. Re-running warm, it failed a
*different* test — `auth.spec.ts:118` — on the **same assertion**, in 18.8s. `test.describe.serial`
means a failure aborts the rest of the file, which is why the two runs stopped at different points.

At that point the obvious check was an A/B against `main`, which passed 7/7. That looked like proof
the regression was 5.5's. **It wasn't** — `main`'s tree had already been compiled by the preceding
runs, so the comparison held branch *and warmth* apart at the same time. The actual discriminator is
warmth alone: every failure happened on the first run after a code change (new components, a changed
`globals.css`), while Next was still compiling routes on demand; once warm, the branch ran 7/7 three
times, and `auth.spec.ts` alone ran 6/6.

So: same class of false alarm the 5.4 walkthrough recorded, and the same lesson twice over —
**an A/B is only evidence if it isolates one variable**, and a 5s `toContainText` timeout is not a
safe assertion against a dev server that may be compiling the route underneath it. The suite's
tightest timeouts are a standing flake risk worth revisiting when e2e joins CI in Phase 7.1.

## Post-merge: `/code-review`, and the two things it caught that mattered

Ran `/code-review` over the whole range after merging. Ten findings, all applied (commit `05e77d6`).
Two were real defects rather than polish, and both are the same *kind* of mistake — code that works
in the place you happened to test it:

1. **`/dev/tokens` was permanently burning the corpus.** `feed.page` looks like a read, and is
   declared as a tRPC *query* — but `getFeedPage` calls `markSeen` unconditionally, and `seen_item`
   has no TTL by design (it's what backs the feed's "almost never repeats" promise). So every visit
   to the style guide consumed a page of the signed-in user's feed forever, and with the 30s
   `staleTime` and React Query's default `refetchOnWindowFocus`, tabbing back consumed another. The
   demo now prefers an item the user has already saved (`saves.list` is a pure read) and borrows
   from the feed only behind a button that names the cost. **The general lesson: a tRPC `query` is
   not a promise of purity**, and this one's write is three files away from its call site.
2. **Nothing in the app establishes a positioning context.** `PillToolbar` and `BottomSheet` were
   both `absolute`, inherited from prototypes that sit inside an iOS-frame wrapper. The real app has
   no such wrapper — not `layout.tsx`, not `/dev/tokens` — so both resolved against the initial
   containing block: the pill scrolled away with the page instead of floating, and a sheet opened
   after scrolling rendered off-screen at the top of the document. Both are now `fixed`, which is
   what "floating toolbar" means in a viewport rather than a mock frame. **This would have read as
   broken during the on-device pass**, which is exactly the check this phase's Done bar names — the
   review caught it first only because it read the CSS rather than the screenshots.

The third medium was **silent save failures** — the sheet dismisses the instant a row is picked, so
a failed write was indistinguishable from a success. `onError` is now a *required* prop rather than
optional, which is why the type checker found all four call sites immediately.

The remaining seven were smaller: full dialog semantics and a Tab trap on the sheet shell (the scrim
hid the page visually but did nothing to the tab order), `overflow-y-auto` back on the panel as a
floor for free-form children, `usePress` resetting before bailing on a non-primary button, the
"Everything kept" count waiting for its own query instead of flashing `0 items`, the Share demo
button disabled until an item exists, and the sheets test restoring shared fixture state in
`afterEach` so one failure can't cascade.

One finding was **deliberately not built**: lazy seeding keys on "the user has no collections" rather
than "has never been seeded". That's harmless while collections can't be deleted, and it becomes a
bug the moment 5.10 ships deletion — so it's documented at the call site and written into
BUILD_PLAN's 5.10 line, rather than migrated speculatively now.

And one bug found *while* fixing: the focus trap's first draft filtered candidates by
`offsetParent !== null`, which reports `null` for everything under jsdom — the trap would have
tested as empty while working fine in a browser. Same family as the `AnimationEvent` finding above:
**jsdom's missing layout and event interfaces will quietly invert what a DOM test proves.**

After the fixes: **279 tests** (was 268), build clean, e2e 7/7.

### Round two: reviewing the fixes found the fix was broken

A second `/code-review` pass over round one turned up four more, and the first is the one worth
remembering: **the accessibility work added in round one did not survive a re-rendering parent.**
`BottomSheet`'s focus effect listed `onClose` in its dependency array, and every call site passes a
fresh inline arrow (`onClose={() => setSaveOpen(false)}`) — so *any* parent render while a sheet was
open tore the effect down and rebuilt it. That yanked focus off whatever the user had tabbed to and
put it back on the panel, and re-recorded the restore-focus target as a control *inside* the sheet,
so closing then "restored" focus to a node about to be unmounted. Precisely the failure the change
was written to prevent. `onClose` now lives in a ref; the entry/exit focus effect keys on `open`
alone. The regression guard was mutation-tested — reinstating the old dependency array fails it.

The second was **the third instance of this phase's positioning bug**: `Toast` was still `absolute`,
which made round one's new failed-save message paint off-screen on a long page — so the fix for
"silent save failures" was itself silent. Now `fixed`, with a `raised` variant that clears the pill.
The handoff's otherwise-puzzling "toast bottom: 46–120px depending on screen" turns out to encode
exactly that distinction.

Also: the Tab trap leaked whenever focus sat outside the panel (Safari blurs to `<body>` when you
tap non-focusable sheet content, and from `<body>` an unguarded Tab walks into the page behind the
scrim), and `/dev/tokens`'s borrow button vanished after a single failed attempt.

**282 tests, build clean, e2e 7/7.** The standing lesson from both rounds: this phase's recurring
defect was never logic, it was *context* — `absolute` inherited from prototypes that live in a frame
the real app doesn't have, and an effect whose dependencies were correct in isolation and wrong
against real callers. Neither shows up in a unit test that renders the component alone.

## Not in this phase, on purpose

- **Drag-to-close.** `bottom-sheet.tsx`'s own comment used to attribute it to 5.5; the design only
  specifies a drag-following close on the gallery details sheet, so it is **5.8's**, and the comment
  now says so.
- **The feed's long-press item sheet** ("Closer Look" + compact collection rows, on a third
  animation, `ambitmenurise`) — 5.6's.
- **`createCollection`** — creation lives on Profile (5.10). Shipping the procedure now would be a
  second untested write path with no consumer, which is exactly what deleting `toggle` cleaned up.
- **The Save-image row** — 5.7, with the image proxy it needs. `ShareSheet` takes `imageContext`
  now so callers don't change shape later.
