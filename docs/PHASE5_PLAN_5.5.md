# Phase 5.5 — Shared backbone + collections backend: detailed execution plan

**Status: ready to execute.** Written to be executed cold, by a session that has not read the
research behind it. Everything you need is in this document; where it says "verified", the claim
was checked against the repo or the prototypes at plan time (08-16-26), not inherited.

**What this phase is.** The redesign's two backbone components — the floating pill toolbar and the
bottom-sheet family — plus the collections data model the save sheet needs. Almost every screen
from 5.6 onward mounts these, so they get built once, properly, against the real router, and
demoed on `/dev/tokens`. No product screen changes in this phase: `/feed` stays the throwaway
placeholder until 5.6.

**Source of truth.** `docs/design_handoff_ambit_pwa_redesign/README.md` §"The two shared UI
patterns" (lines 126–201) for the visual and motion spec, with the standing Phase 5 convention
that **the `.dc.html` prototypes win over the README where they conflict**. This plan already
applied that convention and records the divergences it found — see "Settled at plan time" below.
Recreate the designs in the app's own components; do not port prototype code.

**Reference reading before you start** (in this order, ~15 minutes):

- `README.md` lines 126–201 — pill, sheets, toast specs, verbatim values.
- `src/components/ui/bottom-sheet.tsx` — its header comment already scopes what 5.5 adds.
- `src/server/api/routers/saves.ts` + `src/server/db/saves.ts` — the surface being replaced.
- `src/app/dev/tokens/page.tsx` — the demo surface, and the house pattern for a `Section`.

---

## Preconditions — verified 08-16-26, re-check if time has passed

- **Migration state is clean.** `drizzle/meta/_journal.json` lists two migrations and the database
  has two applied, so Step 1 generates a straightforward `0002_*`. `saved_item` currently has
  exactly `user_id, item_id, saved_at` and no `collection` table exists — that is the baseline the
  generated SQL should be diffing against.
- **The database is populated**: 8,563 items, 16 users, 14 onboarded. Plenty for the demo. Note
  **`saved_item` is empty** — so the accent dot and "Already saved here" only appear after you save
  something through the sheet you just built. That is the correct starting state, not a bug.
- **Containers**: `ambit-postgres-1` and `ambit-mailpit-1` are up. `DATABASE_URL` is in `.env`, so
  the integration tests will actually run rather than self-skip.

**You must be signed in for Step 9's demo to work.** `feed.page` and every `saves.*` procedure is a
`protectedProcedure`, but `/dev/tokens` is currently a session-less static page — so an anonymous
visit makes every new demo section fail with `UNAUTHORIZED`, which reads like a broken component
rather than a missing session. Before wiring the demo: `bun run invite <your-email>`, then sign up
through `/` and complete onboarding (the guard added in 5.3 will force it). Sign-in state persists
across dev-server restarts. If a sheet renders empty and the network tab shows `UNAUTHORIZED`, this
is why — do not go debugging the query.

---

## Decisions already made with Ben — do not relitigate

Four put to Ben directly on 08-16-26; all four sided with the recommendation.

1. **One collection per item.** `saved_item` gains a **nullable** `collection_id` FK. Its primary
   key is already `(user_id, item_id)`, so one row per saved item means one collection per item —
   which is exactly what the prototypes model (`{ [itemId]: collectionName }`, a single accent
   dot, "Already saved here" on exactly one row). **Picking a different collection MOVES the item**
   (an `UPDATE`), it does not add a second membership. `NULL` means "saved but uncollected" — it
   surfaces only under the UI's "Everything kept" total, never under a named collection.
2. **`saves.toggle` is removed**, replaced by `saveToCollection` / `unsave` / `collections`. It is
   verified dead: nothing in `src/` or `e2e/` calls it — not even the `/feed` placeholder — only
   `routers.test.ts` and `routers.integration.test.ts` do. A collection-less toggle is also
   semantically wrong now that every save routes through the sheet. This edits SPEC §7 and the
   "exactly six procedures" assertion; both are deliberate, see Steps 3 and 4.
3. **Share targets all invoke `navigator.share`**, falling back to a toast where the API is absent.
   Six visible targets, one honest behavior: the OS share sheet is what an iOS user expects, and it
   leaves no third-party intent URLs to rot. Per-service deep links were considered and rejected.
4. **"Save image" is deferred to 5.7.** It needs a server-side image proxy — museum image servers
   bot-block third-party fetchers (CLAUDE.md), so a cross-origin client download cannot work — and
   the row only ever appears in image contexts, which do not exist until 5.7. `ShareSheet` still
   takes the `imageContext` prop in 5.5; it just renders nothing for it yet.

Carried in from the 5.4 re-baseline (recorded in `PHASE5_PLAN_5.4.md`): the collections backend
gets built here rather than mocked, because the save sheet is a backbone component on nearly every
screen and building it on mocks then rewiring would double the work.

---

## Settled at plan time from the prototypes — read this before building the sheets

**The pill's bookmark sheet has two modes, and the BUILD_PLAN line does not say so.** Verified by
reading the prototypes directly:

| Context | Title | Rows | Picking a row |
|---|---|---|---|
| **Item in context** — Item Image, Item Text, Gallery | "Save to collection" | Collections only. Accent dot + sub-label "Already saved here" on the item's current collection; every other row gets a `rgba(239,235,224,0.25)` dot and an "N items" count. | **Saves/moves** the item, closes, toasts "Saved to {name}". |
| **No item in context** — the Feed pill | "Your collections" | "Everything kept" (total count, 40%-alpha dot) **first**, then each collection with counts, then "New collection" / sub-label "Make one on your profile" (18%-alpha dot) **last**. | **Navigates** to Saved, filtered to that collection. The "New collection" row navigates to Profile. |

These are two components over one shell (`SaveToCollectionSheet`, `CollectionsSheet`), not one
component with a boolean. Evidence: `Ambit - Item Image.dc.html:231-243` versus
`Ambit - Feed Masonry 3.dc.html:427-449` and `:559`.

**Not in this phase, despite looking adjacent:** the feed's *long-press item sheet*
(`Feed Masonry 3.dc.html:128-147` — item title, a "Closer Look" row, then a compact
`SAVE TO COLLECTION` row list, on a different `ambitmenurise .2s ease` animation) is **5.6's**.
Build `usePress` here; build what it opens there.

**Collection creation is not in this phase either.** The Feed prototype's own "New collection" row
reads "Make one on your profile" and navigates to Profile — creation lives on `/profile`, which is
5.10. So 5.5 ships **no `createCollection` procedure**: adding one now would be a second untested
write path with no consumer, which is precisely what removing `saves.toggle` is cleaning up. The
sheet's "New collection" row is a static pointer.

**Two more divergences worth knowing:**

- **Slop distance.** The README's global rule (line 399) says cancel a tap past **12px**; the Feed
  prototype's own handler uses **10px**. Use **12px** — the README states it as an
  implement-once-use-everywhere rule and BUILD_PLAN 5.5 already wrote `≤12px`. The prototype's 10px
  is inside that band, so nothing is lost.
- **Share URL.** The prototypes display `ambit.link/i/{itemId}`. That is a mock domain. Build the
  real URL from `window.location.origin`, and display it with the scheme stripped so it still reads
  like the design.

---

## Steps

Work on a branch off `main` (`phase-5.5-backbone`), merged back when green. Run `bun run check`
after each backend step; it is fast and catches drizzle/type breakage immediately.

### 1. Schema + migration — `src/server/db/schema.ts`, `drizzle/`

Add the `collection` table. Follow the `invite` table's id pattern exactly (`src/server/db/schema.ts:263-275`)
— app-generated nanoid, not a Postgres default, so the app knows an id before insert:

```ts
export const collection = pgTable(
  "collection",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // The unique key is what makes lazy default-seeding safe under concurrency (Step 2): two
    // simultaneous `collections()` calls both try to insert Articles/Art/Photos, and the loser's
    // `onConflictDoNothing` turns into a no-op instead of a duplicate.
    unique("uq_collection_user_name").on(table.userId, table.name),
    index("idx_collection_user").on(table.userId),
  ],
);
```

Add the FK to `savedItem` (`schema.ts:216-233`), leaving its primary key and existing index alone:

```ts
    collectionId: text("collection_id").references(() => collection.id, {
      onDelete: "set null",
    }),
```

`onDelete: "set null"` rather than cascade: deleting a collection must never silently delete the
user's saves. (Collection deletion is not built in this phase; the constraint is set correctly now
so 5.10 does not have to migrate it.)

Comment both additions in the file's established teaching style — `schema.ts` explains *why* for
every non-obvious column, and these two are non-obvious (nullable FK meaning; `set null` choice).

Then generate and apply:

```
bun run db:generate     # writes drizzle/0002_*.sql — read it before applying
bun run db:migrate
```

**Read the generated SQL before applying it.** Expected: one `CREATE TABLE collection`, one
`ALTER TABLE saved_item ADD COLUMN collection_id`, the unique constraint, the index, two FKs.
Anything else (a table drop, a column rename) means the schema edit went wrong — stop and fix the
schema, do not hand-edit the migration.

### 2. Repository layer — new `src/server/db/collections.ts`, edit `src/server/db/saves.ts`

Every function takes `userId` explicitly and filters by it — the house rule stated at the top of
`saves.ts` and in SPEC §11. Use the same `const { db } = await import("./client")` dynamic import
every repo file uses (the reason is documented in `items.ts`'s `drawFromTopic`: CI runs `bun run
test` with no env vars at all, and a top-level import would trigger `~/env`'s Zod validation).

**`collections.ts`:**

- `DEFAULT_COLLECTION_NAMES = ["Articles", "Art", "Photos"] as const` — exported, because the
  seeding logic and its tests both need it.
- `getCollections(userId): Promise<CollectionWithCount[]>` where `CollectionWithCount` is
  `{ id, name, createdAt, itemCount: number }`. **Seeds lazily**: if the user has no collection
  rows, insert the three defaults with `.onConflictDoNothing()` first, then read. Counts come from
  a `LEFT JOIN saved_item ... GROUP BY collection.id` so an empty collection reports `0` rather
  than vanishing. Order by `createdAt` ascending, so the three defaults keep a stable, seeded order.
- `getCollectionOwner(collectionId): Promise<string | undefined>` — or fold the ownership check
  into `setItemCollection`; either is fine, but the check must exist (Step 3).
- `setItemCollection(userId, itemId, collectionId): Promise<void>` — upsert into `saved_item`:
  insert `(userId, itemId, collectionId)`, and on conflict on the `(user_id, item_id)` primary key
  **update `collection_id`**. That single statement is what implements "picking another row moves
  the item" from Decision 1, and it makes save-then-move and first-time-save the same code path.

**`saves.ts` edits:**

- `saveItem` / `unsaveItem` / `isItemSaved` keep their signatures. `saveItem` now leaves
  `collection_id` `NULL` — it is no longer reachable from the UI after Step 3, so if it ends up
  with no caller at all, delete it rather than leaving it dead (check at the end of Step 3).
- `getSavedItems(userId)` gains an optional `collectionId` filter for 5.9's chips:
  `getSavedItems(userId, opts?: { collectionId?: string })`. Keep the existing
  `desc(savedItem.savedAt)` ordering.
- Add `getSavedCount(userId): Promise<number>` — the "Everything kept" row's count.

### 3. Router — `src/server/api/routers/saves.ts`

Replace `toggle` with three procedures; keep `list`. All `protectedProcedure`.

| Procedure | Type | Input | Output |
|---|---|---|---|
| `saves.collections` | query | — | `{ id, name, itemCount }[]` |
| `saves.saveToCollection` | mutation | `{ itemId: string, collectionId: string }` | `{ collectionName: string }` |
| `saves.unsave` | mutation | `{ itemId: string }` | `{ saved: false }` |
| `saves.list` | query | `{ collectionId?: string }` | `Item[]` |

`saveToCollection` must do three checks, in this order, before writing:

1. The item exists → `NOT_FOUND` (mirror the message style `toggle` used: `No item with id ${id}`).
2. The collection exists **and belongs to `ctx.user.id`** → `NOT_FOUND`, *not* `FORBIDDEN` — do not
   leak whether another user's collection id is real. This is the one genuinely new authorization
   surface in the phase; it is the reason `collectionId` is a client-supplied id at all.
3. Then `setItemCollection`.

It returns `collectionName` so the caller can toast "Saved to {name}" without a second round trip.

`list`'s input becomes an optional object. Give it a default (`.input(z.object({ collectionId:
z.string().optional() }).optional())`) so existing no-arg callers keep working.

Finally: grep for any remaining `saveItem` caller. If Step 2 left it with none, delete it and its
tests in the same commit — the phase is removing a dead write path, not adding one.

### 4. SPEC updates — `SPEC.md`

The SPEC is a living doc and these are real decisions landing:

- **§5.4 `saved_item`** — add `collection_id TEXT REFERENCES collection(id) ON DELETE SET NULL` to
  the SQL block, with a line explaining that `NULL` means "saved but uncollected".
- **New §5.4c `collection`** — the `CREATE TABLE`, the `(user_id, name)` unique constraint, and a
  sentence on lazy default seeding (Articles/Art/Photos) and why one-collection-per-item follows
  from `saved_item`'s composite primary key.
- **§5.6 Indexes** — add `idx_collection_user`.
- **§6.3 Repositories** — `saves.ts` line updated; add the `collections.ts` line.
- **§7 API table** — remove the `saves.toggle` row, add the three new rows exactly as tabulated in
  Step 3. Add a bullet noting the ownership check on `collectionId`.

### 5. `usePress` — new `src/hooks/use-press.ts` (first file in a new directory)

There is no `src/hooks/` yet; create it. (`src/lib/` holds non-React utilities — `cn`, fonts, auth
clients — so a hook does not belong there.)

```ts
export interface UsePressOptions {
  onTap?: () => void;
  onLongPress?: () => void;
  longPressMs?: number; // default 450
  slopPx?: number;      // default 12
}
// Returns props to spread onto the pressable element:
// onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave
export function usePress(options: UsePressOptions): React.DOMAttributes<Element>;
```

Behavior, ported from `Feed Masonry 3.dc.html:372-406` with the values from "Settled at plan time":

- **pointer-down** records `{x, y}`, clears `moved`, starts a 450ms timer. Ignore secondary buttons
  (`e.button === 2`).
- The timer firing = long press: set a `longFired` ref, call `onLongPress`, and fire
  `navigator.vibrate?.(8)` inside a `try`/`catch` (it throws on some browsers and is absent on iOS
  Safari entirely — never let it break the gesture).
- **pointer-move** past `slopPx` on either axis marks `moved` and cancels the timer.
- **pointer-up** fires `onTap` **only if** neither `longFired` nor `moved`. Always clear the timer.
- **pointer-cancel / pointer-leave** cancel everything without firing.
- Clean the timer up in a `useEffect` teardown — a sheet that opens on long-press unmounts the
  pressed element, and a live timer would fire into a dead component.

Use refs, not state, for `pressPt` / `longFired`: they must not trigger re-renders mid-gesture.

**iOS safety** (this is why the hook exists rather than inline handlers): the pressable element
needs `touch-action: manipulation` and `-webkit-touch-callout: none` so a long press does not raise
Safari's own callout menu or a text selection. Add `select-none touch-manipulation` on the elements
that consume the hook, and set `-webkit-touch-callout: none` where needed.

### 6. `BottomSheet` v2 — `src/components/ui/bottom-sheet.tsx`, `src/styles/globals.css`

Two additions, both flagged in the component's own header comment:

**a. Centered title slot.** Add an optional `title?: string` prop rendering above `children`: Sora
600 15px `text-ink-hi`, centered, matching the existing padding rhythm. Every 5.5 sheet passes one.

**b. Exit animation.** Today the component returns `null` the instant `open` flips false, so the
sheet vanishes. It needs to play out:

- Keep an internal `rendered` state. `open` true → render immediately. `open` false → keep
  rendering with an exit class, unmount on `animationend` (with a `setTimeout` fallback matched to
  the duration, because `animationend` does not fire if the element is display-hidden).
- Add `--animate-sheet-down` (the 260ms `sheetup` curve reversed) and a scrim fade-out to
  `globals.css`, alongside the existing `--animate-sheet-up` / `--animate-scrim-in`. Follow the
  Tailwind v4 CSS-first `@theme` pattern already in that file — there is no config file.
- **Honor `prefers-reduced-motion`**: 5.4 added support app-wide; under it, unmount immediately
  rather than holding a static sheet on screen for 260ms.

**This changes an existing test's meaning.** `bottom-sheet.test.tsx`'s "renders nothing when closed"
stays valid for a sheet that was *never* opened, but it no longer describes open→closed. Update the
test name to say so and add a case covering the exit path (children still present right after
close, gone after the animation completes — drive it with fake timers). This assertion change is
expected and called out in BUILD_PLAN; do not work around it by skipping the exit animation.

**Drag-to-close is still not in this phase** — the header comment currently lumps it in with 5.5,
but it belongs to the gallery details sheet (5.8), which is the only place the design specifies a
drag-following close. Update that comment to say 5.8 so the next reader is not misled.

### 7. `PillToolbar` + `AvatarChip` + icons

**`src/components/ui/avatar-chip.tsx`** — 25px circle on the `.bg-avatar-gradient` utility 5.4
added, 1.5px white-75% border. Size prop, defaulting to 25.

**`src/components/ui/pill-toolbar.tsx`:**

```tsx
export interface PillToolbarProps {
  bookmark: "idle" | "saved" | "on-saved"; // outline / accent-filled / white-filled
  onBookmark: () => void;
  onShare: () => void;
  onProfile?: () => void; // default: navigate /profile
  onHome?: () => void;    // default: navigate /feed
  extra?: React.ReactNode; // page-specific action, in the same row — never a second bar
}
```

Values verbatim from README lines 131–153: `gap:26px; padding:8px 20px; border-radius:999px;`
`background: rgba(240,237,231,0.225); backdrop-filter: blur(26px) saturate(180%);` 0.5px
white-28% border, `--shadow-toolbar` (already a token from 5.4), `bottom: 26px`, horizontally
centered.

**The `pointer-events` wrapper is load-bearing**, not a detail: the outer full-width row is
`pointer-events-none` so the feed scrolls under it; the pill itself is `pointer-events-auto`. Get
this wrong and the pill eats a full-width horizontal strip of every scroll gesture.

Items left→right: avatar chip, Ambit mark (the `Logo` icon, 31px — 5.4 already made it the
redesign's exact mark), bookmark (24px), share (23px). Hit areas ≥44px where layout allows;
README's 31px is the prototype's floor, not the target.

Icon audit: `Bookmark` and `Share` exist in `src/components/icons/index.tsx`. Bookmark needs a
**filled** variant for the two active states — add a `filled?: boolean` prop rather than a second
icon component. Strokes stay in the handoff's 1.7–2px band (5.4 audited these; `Bookmark`
deliberately keeps 1.3 on its bespoke 13×16 grid — leave it).

### 8. The sheets — `src/components/sheets/`

New directory, three components, all over `BottomSheet`. Each takes `open` / `onClose` and reports
outcomes upward via callbacks; **none of them owns a toast** — the mounting screen owns toast state,
exactly as the prototypes do and as `/dev/tokens` already does for `Toast`.

**`save-to-collection-sheet.tsx`** — item context. Title "Save to collection". Reads
`api.saves.collections.useQuery()`; rows per the table in "Settled at plan time": 9px dot, name
(Sora 15px `text-ink`), sub-label (Sora 12px, 38% alpha), 14px vertical / 12px horizontal padding,
14px radius, hairline bottom border. Max height 72% with the list scrolling — put the scroll on the
row list, not the sheet, so the grabber and title stay pinned. Picking calls
`api.saves.saveToCollection.useMutation()`, closes, and fires `onSaved(collectionName)`. Needs the
item's current collection to render the accent dot — take it as a prop
(`currentCollectionId?: string`) rather than fetching it per sheet.

**`collections-sheet.tsx`** — no item context. Title "Your collections". Same row rendering, but
"Everything kept" prepended (total from `saves.list`'s length or the new `getSavedCount`) and
"New collection · Make one on your profile" appended. Rows navigate; they do not mutate.

**`share-sheet.tsx`** — title "Share" (`"Share this collection"` when a `collection` prop is set,
for 5.9). Copy-link row: monospace 12.5px truncating URL + accent "Copy link" button, built from
`window.location.origin`. Copy via `navigator.clipboard.writeText`, then close and fire
`onCopied(url)`. Targets row: horizontally scrollable, 52px circles + 10.5px 50%-alpha labels, in
order **Messages, Stories, X, Pinterest, WhatsApp, Email**; X / Pinterest / WhatsApp use a Sora 700
19px letter glyph, the other three use 1.7px outline icons (Messages and Stories glyphs are in
`Item Image.dc.html:112-119` — recreate, don't port). Per Decision 3, **every** target calls
`navigator.share({ title, url })` in a `try`/`catch`; if `navigator.share` is absent, fall back to
`onShareUnavailable()` so the screen can toast. An `AbortError` from the user dismissing the OS
sheet is a normal outcome — swallow it silently, never toast an error for it. `imageContext?:
boolean` is accepted and unused (Decision 4).

Controls inside these sheets, and the pill's own buttons, must `stopPropagation` on pointer-down —
README line 401's rule, so a resting thumb during a scroll cannot fire them.

### 9. `/dev/tokens` demo — `src/app/dev/tokens/page.tsx`

Add three `Section`s, following the file's existing pattern. This is the phase's acceptance
surface, so it must run against the **real router**, not fixtures:

- **PillToolbar** — mounted for real at the bottom of the page, with a control row to cycle
  `bookmark` through its three states.
- **Sheets** — buttons opening each of the three, with a `Toast` wired to their callbacks so the
  full "pick → mutate → close → toast" loop is exercised.
- **usePress** — a pressable tile reporting "tapped" / "long-pressed" so the gesture can be checked
  on a real phone.

The sheets need a real `itemId` to save. Get one from `api.feed.page.useQuery({})` and use the
first card's item — no new dev-only procedure, and it exercises the same path a real screen will.
The page is already `"use client"` and already `notFound()`s in production; nothing changes there.

**Render a visible signed-out state** rather than letting the queries fail silently. All of these
procedures are protected (see Preconditions), and `/dev/tokens` has never needed a session before,
so add a short banner in the new sections when `feed.page` errors with `UNAUTHORIZED`: "Sign in at
`/` to demo the backbone against the real router." Two lines of code that save the next person the
same fifteen minutes.

### 10. Tests — the complete expected-changes list

Existing tests that **must** change (each one is a deliberate consequence, not a break to route
around):

- `src/server/api/routers/routers.test.ts:193-206` — the "exactly six SPEC §7 procedures"
  assertion. Now eight: drop `saves.toggle`, add `saves.collections`, `saves.saveToCollection`,
  `saves.unsave`. Update the test name's "six".
- `routers.test.ts` — the `saves.toggle` UNAUTHORIZED and missing-input cases become
  `saves.saveToCollection` / `saves.unsave` equivalents. Every new procedure needs its
  UNAUTHORIZED case; that is the file's whole job.
- `routers.integration.test.ts:186-218` — the `saves.toggle + saves.list` block is rewritten as
  `saveToCollection + list + unsave`. Self-skips without `DATABASE_URL`, like the rest of the file.
- `src/components/ui/bottom-sheet.test.tsx` — per Step 6.

New tests:

- **`collections.integration.test.ts`** — lazy seeding creates exactly three collections and is
  idempotent across two calls; counts are correct including a `0` for an empty collection; moving
  an item between collections leaves exactly one `saved_item` row; `NULL` collection items are
  counted by `getSavedCount` but appear under no named collection.
- **Router integration** — `saveToCollection` rejects another user's `collectionId` with
  `NOT_FOUND` (the authorization case from Step 3, and the most important new test in the phase);
  rejects an unknown `itemId`; `list({ collectionId })` filters.
- **`use-press.test.ts`** (jsdom, fake timers) — tap fires `onTap`; a 450ms hold fires
  `onLongPress` and *not* `onTap`; a 13px move cancels both; pointer-cancel fires neither. Assert
  the slop boundary on both sides (11px still taps, 13px does not) — an off-by-one here is
  invisible in manual testing and ruins scrolling on a phone.
- **Component tests** for `PillToolbar` (three bookmark states render distinctly; callbacks fire)
  and each sheet (rows render from mocked query data; picking calls the mutation with the right
  ids; "Already saved here" lands on the right row). Mock the tRPC hooks the way
  `onboarding-screen.test.tsx` already does — follow that file, it is the house pattern for a
  client component with a mutation.

Per-file `// @vitest-environment jsdom` for anything rendering React; the server tests stay on the
`"node"` default.

---

## Verification

Backend, then components, then the real thing:

1. `bun run check` — typecheck, lint, format, unit tests. Green.
2. `bun run db:migrate` applied cleanly, and the generated SQL was read before applying (Step 1).
3. Integration tests green against the real database (`DATABASE_URL` set) — they self-skip
   otherwise, so **confirm they actually ran**; a skipped authorization test proves nothing.
4. `bun run build` clean, with `/dev/tokens` still absent from the production build.
5. `bun run e2e` — all 7 still green **unmodified**. Nothing in this phase touches a user-facing
   flow, so any e2e change is a signal something leaked out of scope.
6. **On a real phone** (the phase's actual Done bar, per BUILD_PLAN): open `/dev/tokens` on the dev
   server over LAN, **signed in** (see Preconditions — sign in on the phone too; the session is
   per-browser), and check —
   - the pill floats correctly and the page scrolls *under* it (the `pointer-events` test);
   - a long press opens a sheet and does **not** raise Safari's callout or select text;
   - a tap during a scroll does not fire (the slop guard);
   - both sheets animate in **and out**;
   - picking a collection toasts and the choice survives a reload (it went to Postgres);
   - the share sheet's copy-link writes the clipboard, and a target opens the real iOS share sheet.

---

## Risks / sharp edges

- **The exit animation is where bugs will hide.** A sheet that unmounts its children before the
  animation ends flashes empty; one that never unmounts leaks a scrim over the page and swallows
  every tap. The `animationend` + timeout-fallback pairing in Step 6 covers both; test the
  reduced-motion path too, since it takes a different branch.
- **`saveToCollection`'s ownership check is the phase's only real authorization surface.** It is
  the first procedure taking a client-supplied id for a *user-owned row* (`items.byId` is public;
  everything else is scoped by `ctx.user.id` alone). Get the check in, and test it against a second
  user's collection id specifically.
- **Lazy seeding races.** Two concurrent `collections()` calls both attempt the insert; the
  `(user_id, name)` unique constraint plus `onConflictDoNothing` is what makes the loser harmless.
  If you drop the constraint "because the code checks first", you will get duplicate Articles rows
  under a double-mounted React 19 dev render.
- **`navigator.share` is not available everywhere**, including desktop Chrome without the flag and
  any non-secure origin. The fallback path is not an edge case during development — it is what you
  will hit on the laptop. Make sure it toasts rather than throwing.
- **`navigator.vibrate` throws on some browsers** and is absent on iOS Safari. Always guarded.
- **Do not let the two sheets converge into one component with flags.** They share a shell and a
  row style, and nothing else: one mutates, one navigates. The moment a `mode` prop appears, the
  "Already saved here" logic starts leaking into the browse sheet.
- **twMerge registration.** Any *new* custom `bg-`/`border-` utility added to `globals.css` must be
  registered in `cn()`'s config, or it is silently dropped next to a `bg-ink/NN` class. This has
  now bitten twice (`border-hairline` in 5.1, `.bg-avatar-gradient` in 5.4). The pill's translucent
  background is the candidate here — if it becomes a named utility rather than an arbitrary value,
  register it and add a `utils.test.ts` case.

---

## What comes next (not this phase)

- **5.6 Feed masonry** mounts `PillToolbar` + `CollectionsSheet` + `usePress` for real, and builds
  the long-press item sheet ("Closer Look" + compact collection rows, on `ambitmenurise`).
- **5.7 Item pages** mount `SaveToCollectionSheet` with a real `currentCollectionId`, and add the
  "Save image" row plus the image-proxy route deferred by Decision 4.
- **5.9 Saved** is pure UI over this phase's backend — `list({ collectionId })` and the collection
  counts are already built for its chips.
- **5.10 Profile** adds collection creation (`createCollection`), which is why the "New collection"
  row points there.
