# The list screens — the Profile hub, faces on collections, desktop width — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-12-26 by Fable 5.1, from the design doc below and a read of every file named
here at `main` = `4273337`. **For:** a cold session on a cheaper model, on a plain branch off
`main` (Ben's convention — no worktree).

**Goal:** `/profile` becomes a hub — the avatar block over a four-link nav (Collections · Topics
· Edit profile · Settings) whose tabs are routes under one layout; the gear, the Edit pill, the
Topics row, both glass headers and Settings' shortcut cards go; collections get a square-cornered
2×2 mosaic of their four newest pictures on the Collections tab and small in every picker row;
the hub and Saved take the feed's wide column and pack the feed's column count on desktop;
`/settings` redirects permanently to `/profile/settings`.

**Architecture:** a server `app/profile/layout.tsx` (guard + `user.me` prefetch) wraps a client
`ProfileHub` — `<main>`, wide `Column`, header, `<nav>` of `<Link replace>`s keyed on
`useSelectedLayoutSegment()`, the `Toolbar`, the `CollectionsSheet` and one raised `Toast` exposed
through `ProfileHubContext` — around the four child pages, which now render content only. The
`saves.collections` shape changes once (`cover: string | null` → `covers: string[]`) behind a
window-function query; a new `CoverMosaic` paints it wherever a collection shows its face;
`CollectionRow` takes a `leading` slot for the pickers. `GRID_COLS` moves from the feed screen to
`masonry.ts` so three grids share it. Nothing in the feed engine, the item screen or onboarding
changes.

**Tech Stack:** Next.js 16.2 App Router, React 19, tRPC 11 + React Query v5, Drizzle 0.45,
Tailwind v4, Vitest 4 (+ jsdom), Playwright 1.62, Bun 1.4. **No new dependencies.**

**Spec:** `docs/DESIGN_list-screens.md` — read it first. Its six decisions are the spec; this
plan is how.

## Global Constraints

- **Branch off `main`, plain branch, no worktree:** `git switch -c feat/list-screens main`.
  Commit after every task with the message given; `git status -sb` must not read `[ahead N]`
  when the phase is declared done — push.
- **TDD every task**: write the test, run it and watch it fail for the right reason, then the
  code. `bun run vitest run <file>` runs one file; `bun run test` the suite; `bun run check` is
  typecheck + lint + format + tests and must be green before the final push (see the known-red
  note below). Run `bun run format` (prettier) before each commit — `check` fails on drift.
- **`bun run e2e:prod`** is the e2e suite (production build), never `bun run e2e`. Playwright's
  `chromium` project is 402 × 874; `desktop` is 1440 × 900. If `feed.spec.ts` "scrolling appends
  another page" goes red in the full run, re-run with `E2E_PROD=1 bunx playwright test
  --workers=1` — a three-worker contention flake (log 09-10), not evidence about this branch.
- **Known red, not yours:** `source-invariants.test.ts` fails on one 70sscifiart row whose
  summary contains a literal `<details>`. It fails on `main` too. Ignore it.
- **A layout's server code runs on the document load only.** A client tab switch re-renders the
  page segment, not the layout, so the four pages keep their own `getSession` guards; the
  layout's is defense in depth, not a replacement. Do not delete a page guard.
- **Tab navigation is `replace`, never `push`** — `<Link replace>` in the nav,
  `router.replace(...)` in Settings' two rows. The hub is one history entry (design decision 5).
- **Tailwind classes are literal.** `GRID_COLS`'s three strings, `md:max-w-[600px]`,
  `md:max-w-[1120px]` — never interpolated; the scanner reads source text.
- **Every image is a plain `<img alt="">`**, never `next/image` (arbitrary museum URLs), and
  every tappable row or control does `onPointerDown={(e) => e.stopPropagation()}`.
- The design's pixel values are the spec. Where a number in this plan disagrees with the design
  doc, **the plan wins** (it was written second, against the code) and the executor notes the
  discrepancy in the log entry.

## File map

| file | task | responsibility |
|---|---|---|
| `src/server/db/collections.ts`, `src/server/api/routers/routers.integration.test.ts` | 1 | `covers: string[]` on every collection, newest four |
| `src/components/profile/cover-mosaic.tsx` (+ test), `src/components/profile/collection-tile.tsx` | 2 | the face; the tile paints it square-cornered |
| `src/components/feed/masonry.ts` (+ test), `src/components/feed/feed-screen.tsx`, `src/app/profile/layout.tsx`, `src/app/profile/page.tsx`, `src/components/profile/profile-hub.tsx` (+ test), `src/components/profile/collections-tab.tsx` (+ test, from `profile-screen.tsx`) | 3 | `GRID_COLS` shared; the hub layout, header, nav, toolbar, toast context; the Collections tab |
| `src/components/profile/topics-screen.tsx` (+ test), `e2e/settings.spec.ts` | 4 | the Topics tab: no chrome, facet chips |
| `src/components/profile/profile-edit-screen.tsx` (+ test), delete `src/components/profile/edit-origin.ts`, `e2e/settings.spec.ts` | 5 | the Edit tab: no header, save stays, Discard resets |
| `src/app/settings/page.tsx`, `src/app/profile/settings/page.tsx`, `src/components/settings/settings-screen.tsx` (+ test), delete `src/components/settings/settings-origin.ts`, `e2e/settings.spec.ts`, `e2e/auth.spec.ts`, `e2e/pwa.prod.spec.ts`, `e2e/security.spec.ts` | 6 | the Settings tab and the 308 |
| `src/components/ui/glass-header.tsx`, `src/components/saved/saved-screen.tsx` (+ test), `src/components/sheets/collection-rows.tsx` (+ test), `src/components/sheets/save-to-collection-sheet.tsx`, `src/components/sheets/collections-sheet.tsx`, `src/components/sheets/item-sheet.tsx`, `src/components/sheets/sheets.test.tsx`, `e2e/desktop.spec.ts` | 7 | Saved goes wide; picker rows get faces; desktop e2e |
| `docs/design_handoff_ambit_pwa_redesign/README.md`, `docs/DESIGN_desktop-polish.md`, `SPEC.md`, `CLAUDE.md`, `log.md` | 8 | the words; push |

---

### Task 1: Server — `covers`, the four newest pictures per collection

**Files:**
- Modify: `src/server/db/collections.ts` (the `CollectionWithCount` interface, `withCovers`)
- Test: `src/server/api/routers/routers.integration.test.ts` (the "covers report…" case in
  the 5.10 collections describe, ~line 557)

**Interfaces:**
- Produces: `CollectionWithCount.covers: string[]` (newest first, length 0–4) replacing
  `cover: string | null`; `COVER_COUNT = 4`. Every consumer of `saves.collections` sees the new
  field: `CollectionTile` (Task 2), the pickers (Task 7). The two sheets and `TileActions`
  ignore the field today and keep compiling.

- [ ] **Step 1: Failing test.** In `routers.integration.test.ts`, replace the whole
  `it("covers report the newest saved image per collection, and null when there is none", …)`
  block with:

```ts
    it("covers are the four newest pictures, newest first, and [] when there are none", async () => {
      const { db } = await import("~/server/db/client");
      const caller = createCaller(authedContext(userId));
      const maps = (await caller.saves.collections()).find(
        (c) => c.name === "Maps",
      )!;

      // Four more image items in topicA (the afterAll sweep deletes by topicA, so they need no
      // cleanup of their own). With itemFive that is five pictures — one more than a face holds.
      const extras = await insertHomedItems(
        db,
        [6, 7, 8, 9].map((n) => ({
          source: "met",
          sourceId: `test-router-item-${n}-${nanoid(8)}`,
          type: "image" as const,
          title: `Integration test item ${n}`,
          summary: "A summary long enough to be unremarkable.",
          imageUrl: `https://example.com/test-router-item-${n}.jpg`,
          sourceUrl: `https://example.com/test-router-item-${n}-${nanoid(8)}`,
          topicId: topicA,
          curationScore: 7,
          aestheticTags: [],
        })),
      );

      // Saved in order: five, six, seven, eight, nine — then an article on top. The article is
      // the newest save and must not appear (image-only), and item five is the oldest picture
      // and must fall off the end (four, not five).
      for (const id of [itemFiveId, ...extras.map((e) => e.id)]) {
        await caller.saves.saveToCollection({ itemId: id, collectionId: maps.id });
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await caller.saves.saveToCollection({
        itemId: itemOneId,
        collectionId: maps.id,
      });

      const after = await caller.saves.collections();
      expect(after.find((c) => c.name === "Maps")?.covers).toEqual([
        "https://example.com/test-router-item-9.jpg",
        "https://example.com/test-router-item-8.jpg",
        "https://example.com/test-router-item-7.jpg",
        "https://example.com/test-router-item-6.jpg",
      ]);
      // Art holds itemTwo, an article — saves but no pictures is an empty face, not a null.
      expect(after.find((c) => c.name === "Art")?.covers).toEqual([]);
      // And an empty collection, likewise.
      expect(after.find((c) => c.name === "Photos")?.covers).toEqual([]);
    });
```

  Check the file's imports: `insertHomedItems` is already imported from
  `~/server/db/test-fixtures` (the `beforeAll` uses it) and `nanoid` from `nanoid`. If the
  describe that holds this test saved `itemOneId` into "Art" earlier, that is fine — Art's
  assertion is about pictures, and itemOne is an article.

- [ ] **Step 2: Run — fails** on `covers` being `undefined` (the field does not exist yet):
  `bun run vitest run src/server/api/routers/routers.integration.test.ts -t "covers are"`

- [ ] **Step 3: Implement.** In `src/server/db/collections.ts`:

  1. Add `lte` and `sql` to the drizzle import:
     `import { and, asc, count, desc, eq, isNotNull, lte, sql } from "drizzle-orm";`
  2. Replace the `cover` member of `CollectionWithCount` with:

```ts
  /**
   * The image URLs of the four most recently saved *image* items in this collection, newest
   * first — `[]` when the collection is empty or holds only articles. The Collections tab paints
   * them as a 2×2 mosaic and every picker row as a 36 px one (docs/DESIGN_list-screens.md §2, §7);
   * `TileActions` and the two sheets that predate the face ignore the field, which is why it could
   * change shape here rather than fork into a second read.
   */
  covers: string[];
```

  3. Above `withCovers`, add `export const COVER_COUNT = 4;` with a one-line comment ("a face is
     four pictures; the fifth is the one a 2×2 has no cell for").
  4. Replace the body of `withCovers` (keep its doc comment, but rewrite the second paragraph to
     describe the window function rather than `DISTINCT ON`):

```ts
async function withCovers(
  userId: string,
  rows: Omit<CollectionWithCount, "covers">[],
): Promise<CollectionWithCount[]> {
  if (rows.length === 0) return [];
  const { db } = await import("./client");

  // Rank every collected picture inside its collection, newest save first. A window function
  // rather than `DISTINCT ON`, which only ever keeps *one* row per group — a face holds four.
  // The same filter as before, and for the same reason: an uncollected save (`collection_id`
  // null) belongs to no tile, and an article cannot be a cover, so both are excluded *before*
  // ranking rather than after, or an article that is the newest save would take a slot and
  // leave a hole.
  const ranked = db
    .select({
      collectionId: savedItem.collectionId,
      imageUrl: item.imageUrl,
      n: sql<number>`row_number() over (partition by ${savedItem.collectionId} order by ${savedItem.savedAt} desc)`.as(
        "n",
      ),
    })
    .from(savedItem)
    .innerJoin(item, eq(item.id, savedItem.itemId))
    .where(
      and(
        eq(savedItem.userId, userId),
        isNotNull(savedItem.collectionId),
        isNotNull(item.imageUrl),
      ),
    )
    .as("ranked");

  const covers = await db
    .select({
      collectionId: ranked.collectionId,
      imageUrl: ranked.imageUrl,
    })
    .from(ranked)
    .where(lte(ranked.n, COVER_COUNT))
    // `n` ascending is newest-first, which is the order the mosaic fills its cells in.
    .orderBy(ranked.collectionId, ranked.n);

  const byCollection = new Map<string, string[]>();
  for (const row of covers) {
    // Both non-null by the WHERE above; the guard narrows the types rather than handling a case.
    if (!row.collectionId || !row.imageUrl) continue;
    const list = byCollection.get(row.collectionId) ?? [];
    list.push(row.imageUrl);
    byCollection.set(row.collectionId, list);
  }
  return rows.map((row) => ({
    ...row,
    covers: byCollection.get(row.id) ?? [],
  }));
}
```

  Remove `desc` from the import if nothing else in the file uses it (the linter will say).

- [ ] **Step 4: Run — passes:**
  `bun run vitest run src/server/api/routers/routers.integration.test.ts`
  Then `bun run typecheck` — it will now fail in `collection-tile.tsx` and
  `profile-screen.test.tsx` on `cover`. That is Task 2's red; do not fix it here.

- [ ] **Step 5: Commit.**

```bash
bun run format
git add src/server/db/collections.ts src/server/api/routers/routers.integration.test.ts
git commit -m "feat(saves): collections carry covers — the four newest pictures, newest first"
```

---

### Task 2: `CoverMosaic`, and the tile paints it

**Files:**
- Create: `src/components/profile/cover-mosaic.tsx`, `src/components/profile/cover-mosaic.test.tsx`
- Modify: `src/components/profile/collection-tile.tsx`
- Modify: `src/components/profile/profile-screen.test.tsx` (fixtures + one assertion; the file
  is renamed in Task 3)

**Interfaces:**
- Consumes: `covers: string[]` (Task 1).
- Produces: `CoverMosaic({ covers, className, placeholderSize = 26 })` — a square face sized by
  the caller's `className`; `data-testid="cover-mosaic"`, `data-count="{0..4}"`.
  `CollectionTileProps.covers: string[]` replaces `cover`.

- [ ] **Step 1: Failing test.** Create `src/components/profile/cover-mosaic.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CoverMosaic } from "./cover-mosaic";

// The face of a collection (docs/DESIGN_list-screens.md §2): nothing → the bookmark square, one
// picture fills, two to four tile a 2×2 with the empties filled by a flat cell. The arithmetic
// is the whole component, so the assertions are about cell counts.
const urls = (n: number) =>
  Array.from({ length: n }, (_, i) => `https://example.test/${i}.jpg`);

describe("CoverMosaic", () => {
  it("shows the bookmark placeholder and no image when there is nothing to show", () => {
    render(<CoverMosaic covers={[]} className="size-9" />);
    const face = screen.getByTestId("cover-mosaic");
    expect(face).toHaveAttribute("data-count", "0");
    expect(face.querySelector("img")).toBeNull();
    expect(face.querySelector("svg")).not.toBeNull();
  });

  it("one picture fills the square on its own", () => {
    render(<CoverMosaic covers={urls(1)} className="size-9" />);
    const face = screen.getByTestId("cover-mosaic");
    expect(face).toHaveAttribute("data-count", "1");
    expect(face.querySelectorAll("img")).toHaveLength(1);
    expect(face.querySelectorAll("[data-filler]")).toHaveLength(0);
  });

  it("three pictures fill three cells and a filler takes the fourth", () => {
    render(<CoverMosaic covers={urls(3)} className="size-9" />);
    const face = screen.getByTestId("cover-mosaic");
    expect(face).toHaveAttribute("data-count", "3");
    expect(face.querySelectorAll("img")).toHaveLength(3);
    expect(face.querySelectorAll("[data-filler]")).toHaveLength(1);
  });

  it("never shows more than four, in the order given", () => {
    render(<CoverMosaic covers={urls(6)} className="size-9" />);
    const srcs = [...screen.getByTestId("cover-mosaic").querySelectorAll("img")].map(
      (img) => img.getAttribute("src"),
    );
    expect(srcs).toEqual(urls(4));
  });

  it("every picture is decorative", () => {
    render(<CoverMosaic covers={urls(2)} className="size-9" />);
    for (const img of document.querySelectorAll("img")) {
      expect(img).toHaveAttribute("alt", "");
    }
  });
});
```

- [ ] **Step 2: Run — fails** (cannot resolve `./cover-mosaic`):
  `bun run vitest run src/components/profile/cover-mosaic.test.tsx`

- [ ] **Step 3: Implement.** Create `src/components/profile/cover-mosaic.tsx`:

```tsx
import * as React from "react";

import { Bookmark } from "~/components/icons";
import { cn } from "~/lib/utils";

// A collection's face (docs/DESIGN_list-screens.md §2, decision 3): the four newest pictures in
// a square-cornered 2×2. Sized by the caller — `aspect-square w-full` on the Collections tab,
// `size-9` in a picker row, `size-7` in the tile menu — so the same component is the face at
// every scale.
//
// Three shapes, by count. Nothing: the outline bookmark on a hairline square, the same
// glyph-shows-the-affordance treatment Saved's empty state uses rather than a picture-shaped
// placeholder that promises a picture there isn't. One: it fills the square. Two to four: the
// grid, cells filled in order, the empties a flat `bg-ink/5` so the face reads as "a set with
// room in it" rather than a broken image.
//
// **Square corners.** Ben's "ditch the rounded corners on hero images in every view" applies to
// any picture that is content; the 20 px radius the old single cover wore goes with it.
//
// Plain `<img>`, never `next/image`: arbitrary museum URLs, the same rule as every other image
// surface in the app. `alt=""` — the name beside the face is the accessible label.

export interface CoverMosaicProps {
  /** Newest first, as `saves.collections` returns them. Anything past the fourth is ignored. */
  covers: string[];
  /** The square's size and any position — the component owns no dimensions of its own. */
  className?: string;
  /** The empty state's glyph, in px. 26 on the tab; a row passes 14. */
  placeholderSize?: number;
}

export function CoverMosaic({
  covers,
  className,
  placeholderSize = 26,
}: CoverMosaicProps) {
  const shown = covers.slice(0, 4);

  if (shown.length === 0) {
    return (
      <div
        data-testid="cover-mosaic"
        data-count={0}
        className={cn(
          "border-hairline border-ink/10 bg-ink/3 flex items-center justify-center",
          className,
        )}
      >
        <Bookmark size={placeholderSize} className="text-ink/30" />
      </div>
    );
  }

  if (shown.length === 1) {
    return (
      <div
        data-testid="cover-mosaic"
        data-count={1}
        className={cn("overflow-hidden", className)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shown[0]} alt="" className="size-full object-cover" />
      </div>
    );
  }

  return (
    <div
      data-testid="cover-mosaic"
      data-count={shown.length}
      // `bg-bg` is what shows through the 2 px gaps — the page, not a border colour.
      className={cn(
        "bg-bg grid grid-cols-2 grid-rows-2 gap-[2px] overflow-hidden",
        className,
      )}
    >
      {[0, 1, 2, 3].map((i) =>
        shown[i] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={shown[i]}
            alt=""
            className="size-full min-h-0 object-cover"
          />
        ) : (
          <div key={i} data-filler className="bg-ink/5 min-h-0" />
        ),
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — passes:** `bun run vitest run src/components/profile/cover-mosaic.test.tsx`

- [ ] **Step 5: The tile.** In `src/components/profile/collection-tile.tsx`:
  - Import `CoverMosaic` from `./cover-mosaic`; drop the `Bookmark` import (keep `Plus`).
  - `CollectionTileProps`: `cover: string | null` → `covers: string[]`.
  - Replace the `{cover ? (<img …/>) : (<div …><Bookmark …/></div>)}` block with
    `<CoverMosaic covers={covers} className="aspect-square w-full" />`.
  - In `NewCollectionTile`, drop `rounded-[20px]` from the dashed square so the two tiles match.
  - Update the file's header comment: the cover is now the four newest pictures (`covers`, from
    `db/collections.ts`'s `withCovers`), painted by `CoverMosaic`, square-cornered.

- [ ] **Step 6: The screen test's fixtures.** In `profile-screen.test.tsx`: in `COLLECTIONS`,
  `cover: "https://example.test/cover.jpg"` → `covers: ["https://example.test/cover.jpg"]`
  and `cover: null` → `covers: []`. In "leads the grid with the dashed tile…", keep the
  `img` assertions as they are (c1 has one `img` with that `src`; c2 has none) — they still
  hold through the mosaic.

- [ ] **Step 7: Run — passes:**
  `bun run vitest run src/components/profile` and `bun run typecheck` (green again).

- [ ] **Step 8: Commit.**

```bash
bun run format
git add src/components/profile/cover-mosaic.tsx src/components/profile/cover-mosaic.test.tsx src/components/profile/collection-tile.tsx src/components/profile/profile-screen.test.tsx
git commit -m "feat(profile): CoverMosaic — a collection's face is its four newest pictures, square-cornered"
```

---

### Task 3: The hub — layout, header, nav, toolbar, toast context; the Collections tab

**Files:**
- Modify: `src/components/feed/masonry.ts` (export `GRID_COLS`), `src/components/feed/masonry.test.ts`,
  `src/components/feed/feed-screen.tsx` (import it instead of defining it)
- Create: `src/app/profile/layout.tsx`, `src/components/profile/profile-hub.tsx`,
  `src/components/profile/profile-hub.test.tsx`
- Rename: `src/components/profile/profile-screen.tsx` → `collections-tab.tsx`,
  `profile-screen.test.tsx` → `collections-tab.test.tsx` (`git mv` both), then edit
- Modify: `src/app/profile/page.tsx`

**Interfaces:**
- Consumes: `CoverMosaic`, `CollectionTile({ covers })` (Task 2); `useColumnCount` from
  `~/hooks/use-media-query`; `Toolbar`, `CollectionsSheet`, `Toast`, `Column`, `AvatarChip`,
  `Rise`, `Spinner`, `Button` as they exist.
- Produces: `GRID_COLS: { 2: "grid-cols-2"; 3: "grid-cols-3"; 4: "grid-cols-4" }` from
  `masonry.ts`; `ProfileHub({ children })`; `ProfileHubContext`, `useProfileHub(): { toast(text: string): void }`
  from `profile-hub.tsx`; `PROFILE_TABS` (exported for the test); `CollectionsTab()` from
  `collections-tab.tsx`. Tasks 4–6 render inside the hub and call `useProfileHub().toast`.

- [ ] **Step 1: `GRID_COLS` — failing test.** Append to `src/components/feed/masonry.test.ts`:

```ts
describe("GRID_COLS", () => {
  // Three literal strings, one per value `useColumnCount` can return — shared by the feed, the
  // Collections tab and Saved. Literal on purpose: Tailwind's scanner reads source text.
  it("names one literal class per column count", () => {
    expect(GRID_COLS).toEqual({
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
    });
  });
});
```

  Add `GRID_COLS` to the file's `./masonry` import.

- [ ] **Step 2: Run — fails** (no export): `bun run vitest run src/components/feed/masonry.test.ts`

- [ ] **Step 3: Move it.** Cut the `const GRID_COLS = {…} as const;` block (and its two-line
  comment) out of `feed-screen.tsx` and paste it into `masonry.ts` after `IMAGE_ASPECTS`, as
  `export const GRID_COLS = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" } as const;`
  with the same comment. In `feed-screen.tsx`, add `GRID_COLS` to the existing
  `from "~/components/feed/masonry"` import. Run
  `bun run vitest run src/components/feed` — green, including the feed screen's three
  `grid-cols-*` assertions.

- [ ] **Step 4: Hub — failing test.** Create `src/components/profile/profile-hub.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { avatarGradient } from "~/lib/avatar-hue";
import { ProfileHub, useProfileHub } from "./profile-hub";

// The shell every profile tab renders inside (docs/DESIGN_list-screens.md §1): identity block,
// the four-link nav, the toolbar, one raised toast. Everything below the one query is mocked;
// the assertions are about wiring — which link is current, that links replace rather than push,
// that Feed pops or pushes by the marker.
interface QueryState {
  data: unknown;
  isPending: boolean;
  isError: boolean;
}
function blankQuery(): QueryState {
  return { data: undefined, isPending: false, isError: false };
}

const { meState, segment, pushMock, backMock } = vi.hoisted(() => ({
  meState: { current: blankQuery() },
  segment: { current: null as string | null },
  pushMock: vi.fn(),
  backMock: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({}),
    user: {
      me: { useQuery: () => ({ ...meState.current, refetch: vi.fn() }) },
    },
    saves: {
      // `CollectionsSheet` mounts closed but still calls its hooks.
      collections: { useQuery: () => ({ data: [], isLoading: false }) },
      count: { useQuery: () => ({ data: 0, isLoading: false }) },
      createCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: backMock }),
  useSelectedLayoutSegment: () => segment.current,
}));

const ME = {
  id: "user_abc123",
  name: "Ben Traverse",
  email: "ben@example.test",
  handle: "bentraverse",
  bio: "Maps, mostly.",
};

beforeEach(() => {
  meState.current = { data: ME, isPending: false, isError: false };
  segment.current = null;
  sessionStorage.clear();
  pushMock.mockClear();
  backMock.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("ProfileHub", () => {
  it("renders name, handle and bio from user.me above the children", () => {
    render(
      <ProfileHub>
        <p>tab body</p>
      </ProfileHub>,
    );
    expect(screen.getByText("Ben Traverse")).toBeInTheDocument();
    expect(screen.getByText("@bentraverse")).toBeInTheDocument();
    expect(screen.getByText("Maps, mostly.")).toBeInTheDocument();
    expect(screen.getByText("tab body")).toBeInTheDocument();
  });

  it("paints the avatar with this user's own deterministic gradient", () => {
    render(<ProfileHub>x</ProfileHub>);
    const avatar = document.querySelector("span[aria-hidden]") as HTMLElement;
    expect(avatar.style.backgroundImage).toBe(avatarGradient("user_abc123"));
  });

  it("offers the four tabs in order, as replacing links", () => {
    render(<ProfileHub>x</ProfileHub>);
    const nav = screen.getByRole("navigation", { name: "Profile" });
    const links = [...nav.querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual([
      "Collections",
      "Topics",
      "Edit profile",
      "Settings",
    ]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/profile",
      "/profile/topics",
      "/profile/edit",
      "/profile/settings",
    ]);
  });

  it("marks the current tab from the selected segment — null is Collections", () => {
    render(<ProfileHub>x</ProfileHub>);
    expect(screen.getByRole("link", { name: "Collections" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("…and 'settings' is Settings", () => {
    segment.current = "settings";
    render(<ProfileHub>x</ProfileHub>);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Collections" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("the toolbar's Feed button pops when marked and pushes when opened cold", () => {
    render(<ProfileHub>x</ProfileHub>);
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(pushMock).toHaveBeenCalledWith("/feed");
    expect(backMock).not.toHaveBeenCalled();

    sessionStorage.setItem("ambit.profileOrigin.v1", "1");
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(backMock).toHaveBeenCalledOnce();
  });

  it("the toolbar's avatar navigates nowhere — you are already here", () => {
    render(<ProfileHub>x</ProfileHub>);
    pushMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(pushMock).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
  });

  it("shows the error branch rather than an empty profile when the read fails, tabs intact", () => {
    meState.current = { data: undefined, isPending: false, isError: true };
    render(<ProfileHub>x</ProfileHub>);
    expect(screen.getByText("Couldn't load your profile.")).toBeInTheDocument();
    expect(screen.queryByText("Ben Traverse")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Profile" })).toBeInTheDocument();
  });

  // The desktop pass, revised (docs/DESIGN_list-screens.md §6): the hub is the feed's wide
  // column, not the 600 px list column.
  it("takes the wide column above md", () => {
    render(<ProfileHub>x</ProfileHub>);
    expect(document.querySelector(".md\\:max-w-\\[1120px\\]")).not.toBeNull();
    expect(document.querySelector(".md\\:max-w-\\[600px\\]")).toBeNull();
  });

  it("a tab can toast through the context, raised above the toolbar", () => {
    vi.useFakeTimers();
    function Tab() {
      const hub = useProfileHub();
      return (
        <button type="button" onClick={() => hub.toast("Profile saved")}>
          say it
        </button>
      );
    }
    render(
      <ProfileHub>
        <Tab />
      </ProfileHub>,
    );
    fireEvent.click(screen.getByText("say it"));
    expect(screen.getByText("Profile saved")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run — fails** (cannot resolve `./profile-hub`):
  `bun run vitest run src/components/profile/profile-hub.test.tsx`

- [ ] **Step 6: Implement the hub.** Create `src/components/profile/profile-hub.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";

import { cameToProfileFromApp } from "~/components/profile/profile-origin";
import { CollectionsSheet } from "~/components/sheets/collections-sheet";
import { AvatarChip } from "~/components/ui/avatar-chip";
import { Button } from "~/components/ui/button";
import { Column } from "~/components/ui/column";
import { Rise } from "~/components/ui/rise";
import { Spinner } from "~/components/ui/spinner";
import { Toast } from "~/components/ui/toast";
import { Toolbar } from "~/components/ui/toolbar";
import { avatarGradient } from "~/lib/avatar-hue";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

// The Profile hub (docs/DESIGN_list-screens.md §1, decisions 1, 2, 4, 5): what every tab under
// `/profile` shares. `app/profile/layout.tsx` mounts it once around the child page, so a tab
// switch re-renders the page segment and leaves this — the identity block, the nav, the toolbar,
// the toast — where it is.
//
// **Links, not ARIA tabs.** `role="tab"` promises an in-page panel; these navigate (to routes
// that are deep-linkable and reload-safe — decision 4), so they are a `<nav>` of links with
// `aria-current="page"`. **`replace`, not push** (decision 5, Saved's chips' rule): flicking
// between tabs is refinement of one screen, so the hub is one history entry and the toolbar's
// Feed button pops back to the intact feed from any tab. `profile-origin.ts` is the hub's one
// marker; the old `edit-origin`/`settings-origin` pair went with the back chevrons they served.
//
// **No `GlassHeader`**, as before: nothing here needs to stay on screen — the nav scrolls away
// with the avatar, and the toolbar is the fixed chrome.
//
// Same window-scroll rule as every other screen: the viewport is the scroller, no inner div.

/** The four tabs, in order. `segment` is what `useSelectedLayoutSegment()` reports for each. */
export const PROFILE_TABS = [
  { segment: null, href: "/profile", label: "Collections" },
  { segment: "topics", href: "/profile/topics", label: "Topics" },
  { segment: "edit", href: "/profile/edit", label: "Edit profile" },
  { segment: "settings", href: "/profile/settings", label: "Settings" },
] as const;

export interface ProfileHubApi {
  /** Show `text` in the hub's raised toast. The hub owns the one toast so tabs never stack two. */
  toast: (text: string) => void;
}

// A no-op default rather than `null`: a tab rendered outside the hub (its own unit test) toasts
// into the void instead of throwing.
export const ProfileHubContext = React.createContext<ProfileHubApi>({
  toast: () => undefined,
});

export function useProfileHub(): ProfileHubApi {
  return React.useContext(ProfileHubContext);
}

export function ProfileHub({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segment = useSelectedLayoutSegment();

  // Prefetched by the layout, input-less — the byte-identical-input contract holds trivially.
  const me = api.user.me.useQuery();

  const [toastText, setToastText] = React.useState<string | null>(null);
  const [collectionsOpen, setCollectionsOpen] = React.useState(false);
  // The rect of the toolbar control that opened the sheet — above `md` the sheet floats beside
  // it (docs/DESIGN_chrome-redesign.md §2); the phone ignores it.
  const [collectionsAnchor, setCollectionsAnchor] =
    React.useState<DOMRect | null>(null);

  const hubApi = React.useMemo<ProfileHubApi>(
    () => ({ toast: (text) => setToastText(text) }),
    [],
  );

  // Pop when an in-app surface brought us here, push when the hub was opened cold (a bookmark, a
  // reload, the PWA resuming). Same corpus arithmetic as `leaveSaved` — an unconditional push
  // rebuilds a dynamic feed and spends two pages of the reader's corpus per trip. Right from any
  // tab, because the tabs `replace`.
  const leaveProfile = React.useCallback(() => {
    if (cameToProfileFromApp()) router.back();
    else router.push("/feed");
  }, [router]);

  return (
    <ProfileHubContext.Provider value={hubApi}>
      <main className="bg-bg text-ink min-h-dvh">
        {/* The feed's wide column, not the list column (docs/DESIGN_list-screens.md §6): the
            Collections grid packs three or four across, and the other tabs cap themselves. */}
        <Column width="wide">
          {me.isPending ? (
            <div className="flex justify-center py-24">
              <Spinner />
            </div>
          ) : null}

          {/* A failed load must never render as a profile with no name — same rule as every
              other screen's error branch. The nav below still renders: Settings (and sign-out)
              must stay reachable when the profile row won't load. */}
          {me.isError ? (
            <div className="flex flex-col items-center gap-4 px-8 py-24">
              <span className="text-ink/40 text-center text-[14px]">
                Couldn&apos;t load your profile.
              </span>
              <Button
                variant="ghost"
                shape="pill"
                onClick={() => void me.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : null}

          {me.data ? (
            <>
              <Rise>
                <div className="flex items-center gap-[18px] px-5 pt-14">
                  <AvatarChip
                    size={88}
                    // Deterministic from the user id — see `lib/avatar-hue.ts` for why this
                    // isn't stored, and why there is no upload.
                    gradient={avatarGradient(me.data.id)}
                  />
                  <div className="min-w-0">
                    <h1 className="text-ink-hi truncate text-[28px] leading-[1.1] font-semibold">
                      {me.data.name}
                    </h1>
                    {/* Stored bare and lowercase; the `@` is presentation only. */}
                    {me.data.handle ? (
                      <p className="text-ink/45 mt-[5px] truncate text-[15px]">
                        @{me.data.handle}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Rise>

              {me.data.bio ? (
                <p className="text-ink/58 px-5 pt-[14px] text-[14.5px] leading-[1.5]">
                  {me.data.bio}
                </p>
              ) : null}
            </>
          ) : null}

          {/* Where the Edit pill was. Scrolls sideways below md rather than wrapping — four
              labels fit at 402 px; a fifth one day would not. */}
          <nav
            aria-label="Profile"
            className="border-ink/10 mx-5 mt-5 flex gap-6 overflow-x-auto border-b"
          >
            {PROFILE_TABS.map((tab) => {
              const current = tab.segment === segment;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  replace
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "-mb-px shrink-0 border-b-2 pb-3 text-[14px] font-medium whitespace-nowrap transition-colors",
                    current
                      ? "border-accent text-ink-hi"
                      : "text-ink/55 border-transparent",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          {children}
        </Column>

        <Toolbar
          bookmark="idle"
          // One bookmark behavior app-wide: the sheet, which already writes `saved-origin` and
          // offers filtered entry.
          onBookmark={(anchor) => {
            setCollectionsAnchor(anchor);
            setCollectionsOpen(true);
          }}
          onHome={leaveProfile}
          // Inert: you are already on Profile. A no-op rather than the default keeps the button
          // from pushing a second copy of the hub onto the history stack.
          onProfile={() => undefined}
          // No `onShare` — a profile has nothing to share while public profiles are out of scope.
        />

        <CollectionsSheet
          open={collectionsOpen}
          onClose={() => setCollectionsOpen(false)}
          anchor={collectionsAnchor}
        />

        {/* `raised` — the toolbar is mounted here, and an unraised toast would sit behind it. */}
        <Toast
          text={toastText ?? ""}
          open={toastText !== null}
          onDone={() => setToastText(null)}
          durationMs={1800}
          raised
        />
      </main>
    </ProfileHubContext.Provider>
  );
}
```

- [ ] **Step 7: Run — passes:** `bun run vitest run src/components/profile/profile-hub.test.tsx`

- [ ] **Step 8: The layout.** Create `src/app/profile/layout.tsx`:

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ProfileHub } from "~/components/profile/profile-hub";
import { auth } from "~/lib/auth";
import { api, HydrateClient } from "~/trpc/server";

// The Profile hub's server shell (docs/DESIGN_list-screens.md §1): every route under /profile —
// Collections, Topics, Edit profile, Settings — renders inside `ProfileHub`, which this layout
// mounts once. The guard here is defense in depth *behind* each page's own: a layout's server
// code runs on the document load, and a client tab switch re-renders only the page segment, so
// the pages keep their `getSession` calls.
//
// One prefetch, `user.me`, for the identity block — input-less, so the byte-identical-input
// contract with the hub's `useQuery` holds trivially. It seeds the same per-request query client
// the child page's prefetches do (`trpc/server.ts` caches `createQueryClient` per request), so the
// nested `HydrateClient`s dehydrate one store.

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  void api.user.me.prefetch();

  return (
    <HydrateClient>
      <ProfileHub>{children}</ProfileHub>
    </HydrateClient>
  );
}
```

- [ ] **Step 9: The Collections tab — rename and cut.**
  `git mv src/components/profile/profile-screen.tsx src/components/profile/collections-tab.tsx`
  and `git mv src/components/profile/profile-screen.test.tsx src/components/profile/collections-tab.test.tsx`.
  Then rewrite `collections-tab.tsx` to this (everything the hub now owns is gone: the gear, the
  identity block, the Edit pill, the Topics row, the heading, the toolbar, the collections sheet,
  the toast, `<main>`, `Column`):

```tsx
"use client";

import * as React from "react";

import { GRID_COLS } from "~/components/feed/masonry";
import { useProfileHub } from "~/components/profile/profile-hub";
import { Rise } from "~/components/ui/rise";
import { useColumnCount } from "~/hooks/use-media-query";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { CollectionTile, NewCollectionTile } from "./collection-tile";
import { NewCollectionSheet } from "./new-collection-sheet";

// The Collections tab — `/profile`'s content (docs/DESIGN_list-screens.md §2). Everything you've
// filed, one face each, the dashed tile first. The identity block, the nav and the toolbar are
// the hub's (`profile-hub.tsx`); this file is the grid and the one sheet that adds to it.
//
// No heading: the tab is the heading. The grid packs the feed's column count — two on the phone,
// three from `md`, four from `xl` — through the same literal class map the feed and Saved read.

export function CollectionsTab() {
  const hub = useProfileHub();
  // Prefetched by `app/profile/page.tsx`, input-less.
  const collections = api.saves.collections.useQuery();
  const columnCount = useColumnCount();

  const [newCollectionOpen, setNewCollectionOpen] = React.useState(false);

  return (
    <>
      {/* `pb-[120px]` clears the floating pill, so the last row isn't parked under it. Each tile
          rises on its own, with no stagger — the prototype animates them individually. */}
      <div
        data-testid="collections-grid"
        className={cn("grid gap-4 px-5 pt-[18px] pb-[120px]", GRID_COLS[columnCount])}
      >
        <Rise>
          <NewCollectionTile onClick={() => setNewCollectionOpen(true)} />
        </Rise>
        {collections.data?.map((c) => (
          <Rise key={c.id}>
            <CollectionTile
              id={c.id}
              name={c.name}
              itemCount={c.itemCount}
              covers={c.covers}
            />
          </Rise>
        ))}
      </div>

      <NewCollectionSheet
        open={newCollectionOpen}
        onClose={() => setNewCollectionOpen(false)}
        onCreated={(c) => hub.toast(`${c.name} created`)}
      />
    </>
  );
}
```

- [ ] **Step 10: The page.** `src/app/profile/page.tsx`: import `CollectionsTab` from
  `~/components/profile/collections-tab` instead of `ProfileScreen`; keep the guard; prefetch
  only `api.saves.collections` (drop `user.me` — the layout's — and `topics.mine` — the deleted
  row's); render `<HydrateClient><CollectionsTab /></HydrateClient>`. Rewrite the header comment
  to say the identity block is the layout's and this shell feeds the grid.

- [ ] **Step 11: The tab's test.** Edit `collections-tab.test.tsx`:
  - Import `CollectionsTab` (and render `<CollectionsTab />` everywhere `<ProfileScreen />` was).
  - Add `import { stubMatchMedia } from "~/test/match-media";` and
    `import { DESKTOP_QUERY, WIDE_QUERY } from "~/hooks/use-media-query";`; add
    `afterEach(() => vi.unstubAllGlobals());`.
  - Drop the `user.me` and `topics.mine` entries from the trpc mock, `meState`, `ME`, and the
    `avatarGradient` import.
  - **Delete** these tests (they moved to the hub, or their subject is gone): "renders name,
    handle and bio", "omits the handle and bio rows", "paints the avatar", "the gear and the Edit
    pill each write their own marker", "the pill's Feed button pops", "the pill's avatar
    navigates nowhere", "shows the error branch", "centers in a narrow column above md", and the
    whole `ProfileScreen — Topics row` describe.
  - In "leads the grid with the dashed tile, then one tile per collection": remove the two
    lines asserting the bare count `"2"` ("The bare count beside the Collections heading").
  - Rename `describe("ProfileScreen"` → `describe("CollectionsTab"`.
  - In "creates a collection from the sheet…", the toast used to render here; now it goes
    through the hub. Wrap that render in a provider and assert the call:

```tsx
    const toast = vi.fn();
    render(
      <ProfileHubContext.Provider value={{ toast }}>
        <CollectionsTab />
      </ProfileHubContext.Provider>,
    );
    // … existing steps that type "  Maps  " and play onSuccess …
    expect(toast).toHaveBeenCalledWith("Maps created");
```

    (import `ProfileHubContext` from `./profile-hub`; replace the old
    `expect(screen.getByText("Maps created"))` line.)
  - Add:

```tsx
  it("packs the feed's column count — two on the phone, four from xl", () => {
    render(<CollectionsTab />);
    expect(screen.getByTestId("collections-grid")).toHaveClass("grid-cols-2");
    cleanup();
    stubMatchMedia([DESKTOP_QUERY, WIDE_QUERY]);
    render(<CollectionsTab />);
    expect(screen.getByTestId("collections-grid")).toHaveClass("grid-cols-4");
  });
```

    (add `cleanup` to the `@testing-library/react` import.)

- [ ] **Step 12: Run — passes:** `bun run vitest run src/components/profile src/components/feed`
  and `bun run typecheck`. `grep -rn "ProfileScreen\|profile-screen" src` must print nothing.

- [ ] **Step 13: Commit.**

```bash
bun run format
git add -A src/components/feed/masonry.ts src/components/feed/masonry.test.ts src/components/feed/feed-screen.tsx src/app/profile src/components/profile
git commit -m "feat(profile): the hub — one layout, a four-link nav under the avatar, the Collections tab"
```

  (The app is briefly inconsistent after this commit: `/profile/edit`, `/profile/topics` render
  their own `<main>` and headers inside the hub until Tasks 4–5, and the gear's target `/settings`
  still exists until Task 6. That is fine on a feature branch; do not try to run e2e until
  Task 7.)

---

### Task 4: The Topics tab — no chrome, facet chips

**Files:**
- Modify: `src/components/profile/topics-screen.tsx`, `src/components/profile/topics-screen.test.tsx`
- Modify: `e2e/settings.spec.ts` (three `getByRole("tab", …)` calls)

**Interfaces:**
- Consumes: the hub (Task 3) — `TopicsScreen` now renders content only, inside it.
- Produces: `TopicsScreen({ dev })` unchanged in signature; the facet row is
  `role="group" aria-label="Facets"` of `Chip size="sm"`; the topic chips are in
  `role="group" aria-label="{Facet} topics"`.

- [ ] **Step 1: Failing test.** In `topics-screen.test.tsx`:
  - Replace the `pressed()` helper so it reads the *topic* group, not every button:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
// …
/** The pressed chips inside the topic group — the facet chips are pressed too, and not the point. */
function pressed() {
  const group = screen.getByRole("group", { name: /topics$/ });
  return within(group)
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent);
}
```

  - Replace the first two tests:

```tsx
  it("shows four facet chips in order with Subject pressed, and that facet's topics", () => {
    render(<TopicsScreen dev={false} />);
    const facets = within(screen.getByRole("group", { name: "Facets" })).getAllByRole("button");
    expect(facets.map((f) => f.textContent)).toEqual(["Subject", "Medium", "Look", "Place"]);
    expect(facets[0]).toHaveAttribute("aria-pressed", "true");
    expect(facets[1]).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Alpha" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gamma" })).toBeNull();
    expect(pressed()).toEqual(["Alpha"]);
  });

  it("a facet chip switches the group", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Medium" }));
    expect(screen.getByRole("button", { name: "Gamma" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();
    expect(screen.getByRole("group", { name: "Medium topics" })).toBeInTheDocument();
  });

  it("renders no title, no back link and no <main> — the hub owns those", () => {
    render(<TopicsScreen dev={false} />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByText("← Profile")).toBeNull();
    expect(document.querySelector("main")).toBeNull();
    expect(screen.getByText("1 on. Changes save as you go.")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run — fails** (`getAllByRole("tab")` still exists; no group named "Facets"):
  `bun run vitest run src/components/profile/topics-screen.test.tsx`

- [ ] **Step 3: Implement.** In `topics-screen.tsx`:
  - Remove the `useRouter` import and the `router` const; remove the `Column` import.
  - Replace everything from `return (` to the end of the component with:

```tsx
  return (
    // Left-aligned at the list measure inside the hub's wide column (docs/DESIGN_list-screens.md
    // §6) — a plain div, not `Column`, which centres.
    <div className="md:max-w-[600px]">
      <Rise>
        <p className="text-ink/62 px-5 pt-5 text-[15px] leading-[1.5]">
          {picked.size} on. Changes save as you go.
        </p>
      </Rise>

      {/* A chip row, not a second tablist: the hub's nav above is the screen's one row of
          sections, and two underlined rows stacked read as one broken one. Scrolls sideways
          below md rather than wrapping, like Saved's filter row. */}
      <div
        role="group"
        aria-label="Facets"
        className="mt-4 flex gap-2 overflow-x-auto px-5"
      >
        {FACETS.map((f) => (
          <Chip
            key={f}
            size="sm"
            selected={f === facet}
            onClick={() => setFacet(f)}
          >
            {FACET_LABELS[f]}
          </Chip>
        ))}
      </div>

      <div
        role="group"
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
    </div>
  );
```

  - Update the header comment: it is the Topics *tab* of the hub now (09-12-26,
    docs/DESIGN_list-screens.md §3); the facets are chips so there are no tabs under tabs. Drop
    the `cn` import if it is now unused.
  - `app/profile/topics/page.tsx` needs no change (its guard and prefetches stay; the hub wraps
    it through the layout).

- [ ] **Step 4: Run — passes:** `bun run vitest run src/components/profile/topics-screen.test.tsx`

- [ ] **Step 5: The e2e spec.** In `e2e/settings.spec.ts`, every
  `page.getByRole("tab", { name: "Subject" })` / `"Medium"` becomes
  `page.getByRole("button", { name: "Subject", exact: true })` / `"Medium"` (three sites: the
  first Subject click, the Medium click, the Medium click after reload). `exact: true` so
  "Medium" cannot match a longer chip label. The rest of the spec is rewritten in Task 6; this
  keeps it consistent per task.

- [ ] **Step 6: Commit.**

```bash
bun run format
git add src/components/profile/topics-screen.tsx src/components/profile/topics-screen.test.tsx e2e/settings.spec.ts
git commit -m "feat(profile): the Topics tab — no chrome, the facets are chips"
```

---

### Task 5: The Edit profile tab — no header, the save stays, Discard resets

**Files:**
- Modify: `src/components/profile/profile-edit-screen.tsx`, `src/components/profile/profile-edit-screen.test.tsx`
- Delete: `src/components/profile/edit-origin.ts`
- Modify: `e2e/settings.spec.ts` (the edit test)

**Interfaces:**
- Consumes: `useProfileHub().toast` (Task 3).
- Produces: `ProfileEditScreen()` unchanged in signature, content-only.

- [ ] **Step 1: Failing test.** In `profile-edit-screen.test.tsx`:
  - Add `import { ProfileHubContext } from "./profile-hub";` and a hoisted `toastMock: vi.fn()`
    (add it to the `vi.hoisted` object and `.mockClear()` it in `beforeEach`).
  - Add a render helper and use it in every test in place of `render(<ProfileEditScreen />)`:

```tsx
function renderScreen() {
  return render(
    <ProfileHubContext.Provider value={{ toast: toastMock }}>
      <ProfileEditScreen />
    </ProfileHubContext.Provider>,
  );
}
```

  - Every `screen.getByRole("button", { name: "Save" })` becomes
    `screen.getByRole("button", { name: "Save changes" })` (the header's Save is gone; the
    double-submit test then clicks the same button twice).
  - Replace "on success: primes the cache, toasts, and leaves after the confirmation beat" with:

```tsx
  it("on success: primes the cache, toasts through the hub, and stays on the tab", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const updated = { ...ME, name: "Ben R" };
    act(() => saveOpts.current!.onSuccess(updated));

    expect(setDataMock).toHaveBeenCalledWith(undefined, updated);
    expect(invalidateMock).toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith("Profile saved");
    expect(pushMock).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
    // …and a second save is possible: the guard released when the write settled.
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(saveMutateMock).toHaveBeenCalledTimes(2);
  });
```

  - Replace "Discard and the back chevron leave without submitting anything" with:

```tsx
  it("Discard puts the loaded values back and navigates nowhere", () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Someone" } });
    fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText("About"), { target: { value: "" } });

    fireEvent.click(screen.getByText("Discard"));

    expect(screen.getByLabelText("Name")).toHaveValue("Ben Traverse");
    expect(screen.getByLabelText("Handle")).toHaveValue("bentraverse");
    expect(screen.getByLabelText("About")).toHaveValue("Maps, mostly.");
    expect(saveMutateMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("renders no header and no <main> — the hub owns those", () => {
    renderScreen();
    expect(screen.queryByRole("heading", { name: "Edit profile" })).toBeNull();
    expect(document.querySelector("main")).toBeNull();
  });
```

  - Remove the `sessionStorage.setItem("ambit.profileEditOrigin.v1", "1")` line and any
    `afterEach(() => vi.useRealTimers())` that becomes unused (keep it if another test uses fake
    timers).

- [ ] **Step 2: Run — fails** (a Back button still renders; `pushMock` is called after 900 ms;
  no `toastMock` call): `bun run vitest run src/components/profile/profile-edit-screen.test.tsx`

- [ ] **Step 3: Implement.** In `profile-edit-screen.tsx`:
  - Imports: remove `useRouter`, `GlassHeader`, `IconButton`, `ChevronLeft`, `Column`, `Toast`,
    `cameToEditFromApp`; add `import { useProfileHub } from "./profile-hub";`.
  - `ProfileEditScreen`: replace `<main className="bg-bg text-ink min-h-dvh">…</main>` with a
    `<div className="md:max-w-[600px]">…</div>` (the left-aligned list measure, §6); the pending
    and error branches lose their `Column` wrappers and become plain divs with the same classes
    (`flex justify-center py-24`, `flex flex-col items-center gap-4 px-8 py-24`).
  - `EditForm`: remove `router`, `leaveEdit`, `toast` state and the `<Toast>`; add
    `const hub = useProfileHub();`. The mutation's `onSuccess` becomes:

```ts
    onSuccess: (updated) => {
      // Both, and in this order: `setData` makes the hub's header above correct the instant it
      // re-renders, and the invalidate makes it *true* rather than merely optimistic.
      utils.user.me.setData(undefined, updated);
      void utils.user.me.invalidate();
      hub.toast("Profile saved");
      // Nothing leaves (docs/DESIGN_list-screens.md §4) — the header is the confirmation — so
      // the guard releases here rather than on a timer.
      setSubmitting(false);
    },
```

  - Add a `discard` handler and use it on the Discard button:

```ts
  /** Back to what was loaded — a reset, not an exit: there is nowhere to go, the form is a tab. */
  const discard = () => {
    setName(profile.name);
    setHandle(profile.handle ?? "");
    setBio(profile.bio ?? "");
    setHandleError(null);
    setFormError(null);
  };
```

  - Remove the whole `<GlassHeader>…</GlassHeader>` block; replace `<Column width="narrow">`
    … `</Column>` with a fragment (`<>` … `</>`), keeping the avatar block (`pt-[34px]` → `pt-6`,
    it no longer sits under a header) and the fields as they are. The "Save changes" `Button`
    and the `Discard` button stay where they are.
  - Rewrite the file's header comment: it is the Edit tab of the hub (09-12-26,
    docs/DESIGN_list-screens.md §4) — no glass header because there is nothing to keep on
    screen, the save is the button at the foot of the form, success stays. Keep the EMAIL and
    avatar-upload paragraphs.
  - Delete `src/components/profile/edit-origin.ts` (`git rm`). `grep -rn "edit-origin\|markProfileEditOrigin\|cameToEditFromApp" src e2e` must print only `settings-screen.tsx` (Task 6 removes that).
  - `app/profile/edit/page.tsx`: no change.

- [ ] **Step 4: Run — passes:** `bun run vitest run src/components/profile/profile-edit-screen.test.tsx`

- [ ] **Step 5: The e2e spec.** In `e2e/settings.spec.ts`, "the edit form round-trips name,
  handle and bio":
  - `page.getByRole("button", { name: "Edit profile" })` → `page.getByRole("link", { name: "Edit profile" })`.
  - Replace the block from `// The save leaves after its confirmation beat` through the Settings
    lines with:

```ts
    // The save stays on the tab (09-12-26): the hub's header above the form is the same row,
    // and it reads back the new name without a navigation.
    await expect(page).toHaveURL(/\/profile\/edit$/);
    await expect(page.getByRole("heading", { name: "Ben R" })).toBeVisible();
    await expect(page.getByText(`@${HANDLE}`)).toBeVisible();
    await expect(page.getByText("Maps, mostly.")).toBeVisible();

    // And Settings — a tab now — reads the same row.
    await page.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL("/profile/settings", { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Ben R" })).toBeVisible();
```

    (`getByRole("heading")` rather than `getByText`: on the edit tab "Ben R" is also the Name
    field's value, and `getByText` would be ambiguous. Task 6 makes `/profile/settings` real.)

- [ ] **Step 6: Commit.**

```bash
bun run format
git add -A src/components/profile/profile-edit-screen.tsx src/components/profile/profile-edit-screen.test.tsx src/components/profile/edit-origin.ts e2e/settings.spec.ts
git commit -m "feat(profile): the Edit tab — no header, a save that stays, Discard resets"
```

---

### Task 6: The Settings tab, and `/settings` becomes a 308

**Files:**
- Move: `src/app/settings/page.tsx` → `src/app/profile/settings/page.tsx` (`git mv`)
- Create: `src/app/settings/page.tsx` (the redirect)
- Modify: `src/components/settings/settings-screen.tsx`, `src/components/settings/settings-screen.test.tsx`
- Delete: `src/components/settings/settings-origin.ts`
- Modify: `e2e/settings.spec.ts`, `e2e/auth.spec.ts`, `e2e/pwa.prod.spec.ts`, `e2e/security.spec.ts`

**Interfaces:**
- Consumes: the hub (Task 3).
- Produces: `SettingsScreen({ versionLabel })` unchanged in signature, content-only; the route
  `/profile/settings`; `/settings` → 308 `/profile/settings`.

- [ ] **Step 1: Failing test.** In `settings-screen.test.tsx`:
  - Delete the whole `describe("SettingsScreen — shortcut cards", …)` and the test
    "back pops when marked and pushes to /profile when opened cold".
  - Add `replaceMock: vi.fn()` to the hoisted object, use it in the `next/navigation` mock
    (`replace: replaceMock`), and `.mockClear()` it in `beforeEach`.
  - Replace "centers the header and the body in narrow columns above md" with:

```tsx
  // Inside the hub's wide column (docs/DESIGN_list-screens.md §6) the rows sit left-aligned at
  // the list measure. One cap, not two: there is no header of its own any more.
  it("caps itself at the list measure, left-aligned, with no header and no <main>", () => {
    renderScreen();
    expect(document.querySelectorAll(".md\\:max-w-\\[600px\\]")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
    expect(screen.queryByText("Everything kept")).toBeNull();
    expect(document.querySelector("main")).toBeNull();
  });
```

  - Replace "the 'What you see' row navigates to /profile/topics" with:

```tsx
  it("the 'What you see' and 'Account details' rows switch tabs in place", () => {
    renderScreen();
    fireEvent.click(screen.getByText("What you see"));
    expect(replaceMock).toHaveBeenCalledWith("/profile/topics");
    fireEvent.click(screen.getByText("Account details"));
    expect(replaceMock).toHaveBeenCalledWith("/profile/edit");
    expect(pushMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("ambit.profileEditOrigin.v1")).toBeNull();
  });
```

  - In "renders every designed row", the list stays as is (no "Edit profile" in it — good).
  - Drop `savedCount` from the hoisted object, the trpc mock (`saves.count`), the `ME` usage in
    the deleted card test, and `beforeEach` if nothing else reads them. (Keep `meState` — the
    screen still queries `user.me`? It does not after this task; drop it too, and the
    `api.user.me` mock entry.)

- [ ] **Step 2: Run — fails** (Back still renders; `push` is called, not `replace`):
  `bun run vitest run src/components/settings/settings-screen.test.tsx`

- [ ] **Step 3: Implement the screen.** In `settings-screen.tsx`:
  - Imports: remove `markProfileEditOrigin`, `cameToSettingsFromApp`, `markSavedOrigin`,
    `AvatarChip`, `Column`, `GlassHeader`, `IconButton`, `ChevronLeft`, `Bookmark`,
    `avatarGradient`; keep everything else.
  - Remove the `me` and `savedCount` queries, `leaveSettings`, `goEdit`, `goSaved`.
  - "Account details" row: `onClick={() => router.replace("/profile/edit")}`. "What you see"
    row: `onClick={() => router.replace("/profile/topics")}`. Both with a one-line comment: an
    in-hub tab switch, `replace` like the nav (docs/DESIGN_list-screens.md §5).
  - Replace `<main className="bg-bg text-ink min-h-dvh"><GlassHeader>…</GlassHeader><Column width="narrow"><div …>` … `</div></Column>` … `</main>` with
    `<div className="md:max-w-[600px]">` … the groups … `</div>` followed by the three sheets and
    the toast as siblings in a fragment. Delete the two-card `grid grid-cols-2` block entirely.
    The body's own padding (`px-5 pt-…`) stays on the inner div; make the first group start at
    `pt-5`.
  - Keep the screen's own `Toast` (its stubs and the notifications row toast through it; it is
    not raised by the hub because Settings' toasts are unrelated to saves — pass `raised`
    anyway, the hub's toolbar is under it now).
  - Rewrite the header comment: the Settings tab of the hub (09-12-26,
    docs/DESIGN_list-screens.md §5); the two shortcut cards went because the tabs are those
    doorways; sign-out's home is `/profile/settings`.
  - Delete `src/components/settings/settings-origin.ts` (`git rm`).
    `grep -rn "settings-origin\|markSettingsOrigin\|cameToSettingsFromApp" src e2e` prints nothing.

- [ ] **Step 4: The routes.**
  `git mv src/app/settings/page.tsx src/app/profile/settings/page.tsx`; in it, drop the
  `user.me` and `saves.count` prefetches (the header is the layout's; the count card is gone),
  keep `topics.list` and `topics.mine` and the guard, and fix the relative import
  `"../../../package.json"` → `"../../../../package.json"`. Then create the new
  `src/app/settings/page.tsx`:

```tsx
import { permanentRedirect } from "next/navigation";

// `/settings` was its own screen (5.10 → 09-12-26). Settings is a tab of the Profile hub now
// (docs/DESIGN_list-screens.md §5), so anything still pointing here — a bookmark, a history
// entry, the PWA resuming — lands on the tab. Permanent (308), like `/g/[itemId]`.
//
// `src/proxy.ts` keeps `/settings` in AUTHED_PREFIXES on purpose: a signed-out visitor bounces
// to `/` before this runs, which is the same answer `/profile/settings` would give.
export default function SettingsRedirect() {
  permanentRedirect("/profile/settings");
}
```

- [ ] **Step 5: Run — passes:** `bun run vitest run src/components/settings` and
  `bun run typecheck`; `bun run test` green apart from the known red.

- [ ] **Step 6: The e2e specs.**
  - `e2e/settings.spec.ts`:
    - Every `goTo(page, "/settings")` → `goTo(page, "/profile/settings")` (three sites).
    - The first test ("a new user signs up and reaches Profile from the feed's pill"): after
      `waitForURL("/profile")`, add
      `await expect(page.getByRole("navigation", { name: "Profile" }).getByRole("link")).toHaveText(["Collections", "Topics", "Edit profile", "Settings"]);`
      and keep the tile assertions.
    - In "the real settings rows are real…": the first `page.getByText("What you see").click()`
      now lands on `/profile/topics` by `replace` — `waitForURL("/profile/topics")` still holds.
      After the reload block, `await goTo(page, "/settings")` → `"/profile/settings"`.
    - Add one test at the end:

```ts
  test("/settings lands on the Settings tab", async ({ page }) => {
    await goTo(page, "/settings");
    await page.waitForURL("/profile/settings", { timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByText("Ambit · invite-only · v0.5")).toBeVisible();
  });
```

    - Update the file's header comment ("Phase 5.10's three screens" → the Profile hub's tabs).
  - `e2e/auth.spec.ts:144`: `page.goto("/settings")` → `page.goto("/profile/settings")`; amend
    the comment above it ("Sign-out's permanent home … `/profile/settings` since 09-12-26").
  - `e2e/pwa.prod.spec.ts:170,177`: both `"/settings"` → `"/profile/settings"`.
  - `e2e/security.spec.ts:208`: `"/settings"` → `"/profile/settings"` in the array. (The
    signed-out guard test elsewhere in that file, if it lists `/settings`, keeps it — the bounce
    happens before the redirect.)

- [ ] **Step 7: Commit.**

```bash
bun run format
git add -A src/app/settings src/app/profile/settings src/components/settings e2e/settings.spec.ts e2e/auth.spec.ts e2e/pwa.prod.spec.ts e2e/security.spec.ts
git commit -m "feat(settings): the Settings tab; /settings redirects to /profile/settings"
```

---

### Task 7: Saved goes wide; picker rows get faces; desktop e2e

**Files:**
- Modify: `src/components/ui/glass-header.tsx`, `src/components/saved/saved-screen.tsx`,
  `src/components/saved/saved-screen.test.tsx`
- Modify: `src/components/sheets/collection-rows.tsx`, `src/components/sheets/collection-rows.test.tsx`,
  `src/components/sheets/save-to-collection-sheet.tsx`, `src/components/sheets/collections-sheet.tsx`,
  `src/components/sheets/item-sheet.tsx`, `src/components/sheets/sheets.test.tsx`
- Modify: `e2e/desktop.spec.ts`

**Interfaces:**
- Consumes: `GRID_COLS` (Task 3), `CoverMosaic` (Task 2), `covers` (Task 1).
- Produces: `GlassHeaderProps.width?: "narrow" | "reader" | "wide"` (default `"narrow"`);
  `RowLeading` and `CollectionRowProps.leading?: RowLeading` from `collection-rows.tsx`.

- [ ] **Step 1: Saved — failing test.** In `saved-screen.test.tsx`:
  - Add `import { stubMatchMedia } from "~/test/match-media";`,
    `import { DESKTOP_QUERY, WIDE_QUERY } from "~/hooks/use-media-query";`, and `cleanup` to
    the testing-library import. (`afterEach(() => vi.unstubAllGlobals())` is already there.)
  - Replace "centers the header and the body in narrow columns above md" with:

```tsx
  // The desktop pass, revised (docs/DESIGN_list-screens.md §6): Saved takes the feed's wide
  // column — header content and body both — and packs the feed's column count.
  it("takes the wide column above md, header and body", () => {
    render(<SavedScreen />);
    expect(document.querySelectorAll(".md\\:max-w-\\[1120px\\]").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector(".md\\:max-w-\\[600px\\]")).toBeNull();
  });

  it("packs two stacks on the phone and four from xl", () => {
    render(<SavedScreen />);
    expect(screen.getByTestId("saved-columns")).toHaveClass("grid-cols-2");
    cleanup();
    stubMatchMedia([DESKTOP_QUERY, WIDE_QUERY]);
    render(<SavedScreen />);
    expect(screen.getByTestId("saved-columns")).toHaveClass("grid-cols-4");
    expect(screen.getByTestId("saved-columns").querySelectorAll(":scope > div")).toHaveLength(4);
  });
```

  - In "renders both tile kinds across the two columns", `container.querySelectorAll(".grid > div")`
    → `screen.getByTestId("saved-columns").querySelectorAll(":scope > div")`.

- [ ] **Step 2: Run — fails:** `bun run vitest run src/components/saved/saved-screen.test.tsx`

- [ ] **Step 3: Implement Saved.**
  - `glass-header.tsx`: add `width?: ColumnProps["width"]` to the props (import the type from
    `./column`), default `"narrow"`, and pass it to the inner `<Column width={width} …>`. Extend
    the comment: Saved passes `wide` since 09-12-26; onboarding keeps the default.
  - `saved-screen.tsx`: import `GRID_COLS` alongside `buildTiles, packColumns`;
    `import { useColumnCount } from "~/hooks/use-media-query";`; `import { cn } from "~/lib/utils";`.
    `const columnCount = useColumnCount();` and
    `packColumns(buildTiles([{ cards }], {}), columnCount)` with `columnCount` in the memo deps.
    `<GlassHeader width="wide" className="flex-col items-stretch">`; `<Column width="wide">`;
    the grid div becomes
    `<div data-testid="saved-columns" className={cn("grid items-start gap-1 px-1 pt-2", GRID_COLS[columnCount])}>`.
    Replace the "narrow, not the feed's wide … thin feed" comment with: the feed's column and
    column count (docs/DESIGN_list-screens.md §6) — the stretched phone was the complaint, and a
    modest collection at 1440 is four short stacks rather than two long ones.

- [ ] **Step 4: Run — passes:** `bun run vitest run src/components/saved src/components/ui`

- [ ] **Step 5: Rows — failing test.** Append to `collection-rows.test.tsx`
  (add `CollectionRow` to its import):

```tsx
describe("CollectionRow's leading slot", () => {
  it("renders the dot when nothing is asked for", () => {
    render(<CollectionRow label="Art" sub="2 items" onPick={vi.fn()} />);
    expect(screen.queryByTestId("cover-mosaic")).toBeNull();
    expect(document.querySelector(".rounded-full")).not.toBeNull();
  });

  it("renders a mosaic of the covers, ringed when current", () => {
    render(
      <CollectionRow
        label="Art"
        sub="Already saved here"
        leading={{ kind: "covers", covers: ["https://example.test/a.jpg"], current: true }}
        onPick={vi.fn()}
      />,
    );
    const face = screen.getByTestId("cover-mosaic");
    expect(face).toHaveAttribute("data-count", "1");
    expect(face.parentElement).toHaveClass("ring-accent");
  });

  it("renders a glyph square for the pseudo-rows", () => {
    render(
      <CollectionRow
        label="Everything kept"
        sub="7 items"
        leading={{ kind: "glyph", glyph: "bookmark" }}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("row-glyph")).toHaveAttribute("data-glyph", "bookmark");
    expect(screen.queryByTestId("cover-mosaic")).toBeNull();
  });

  it("the collapsed New collection row leads with the plus square", () => {
    render(<NewCollectionRow onCreate={vi.fn()} />);
    expect(screen.getByTestId("row-glyph")).toHaveAttribute("data-glyph", "plus");
  });
});
```

  And in `sheets.test.tsx`, add `covers: []` to every collection fixture object (the
  `collectionsData` initial value and `DEFAULT_COLLECTIONS`, plus the inline one in "uses the
  singular…") — `covers: ["https://example.test/c1.jpg"]` for `c1` in the two shared ones — and
  add to the `SaveToCollectionSheet` describe:

```tsx
  it("leads every row with the collection's face, the current one ringed", () => {
    render(
      <SaveToCollectionSheet
        open
        onClose={vi.fn()}
        itemId="item-1"
        currentCollectionId="c2"
        onSaved={vi.fn()}
        onError={vi.fn()}
      />,
    );
    const faces = screen.getAllByTestId("cover-mosaic");
    // Articles has one picture, Art none, and the New-collection row is a glyph, not a face.
    expect(faces.map((f) => f.getAttribute("data-count"))).toEqual(["1", "0"]);
    expect(faces[1]!.parentElement).toHaveClass("ring-accent");
    expect(faces[0]!.parentElement).not.toHaveClass("ring-accent");
  });
```

  and to the `CollectionsSheet` describe:

```tsx
  it("leads Everything kept with the bookmark square and each collection with its face", () => {
    render(<CollectionsSheet open onClose={vi.fn()} />);
    expect(screen.getAllByTestId("row-glyph").map((g) => g.getAttribute("data-glyph"))).toEqual([
      "bookmark",
      "plus",
    ]);
    expect(screen.getAllByTestId("cover-mosaic")).toHaveLength(2);
  });
```

  and to the `ItemSheet` describe (its rows are bespoke, so the face is asserted by count):

```tsx
  it("shows each collection's face on its compact row", () => {
    render(
      <ItemSheet
        open
        onClose={vi.fn()}
        item={{ id: "item-1", title: "A plate" }}
        onSaved={vi.fn()}
        onError={vi.fn()}
        appUrl="https://ambit.test"
        onToast={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("cover-mosaic")).toHaveLength(2);
  });
```

  (Match the `ItemSheet` props to what the describe's existing tests pass — copy their render.)

- [ ] **Step 6: Run — fails:** `bun run vitest run src/components/sheets`

- [ ] **Step 7: Implement the rows.** In `collection-rows.tsx`:
  - `import { CoverMosaic } from "~/components/profile/cover-mosaic";` and
    `import { Bookmark, Plus } from "~/components/icons";`.
  - Add, above `CollectionRowProps`:

```ts
/**
 * What leads a row (docs/DESIGN_list-screens.md §7). `covers` is a collection's face, 36 px,
 * ringed in the accent when `current` ("Already saved here"); `glyph` is one of the two
 * pseudo-rows' squares — the outline bookmark for "Everything kept", the dashed plus for
 * "New collection…". Absent, the row keeps its 9 px dot (`tone`).
 */
export type RowLeading =
  | { kind: "covers"; covers: string[]; current?: boolean }
  | { kind: "glyph"; glyph: "bookmark" | "plus" };
```

  - Add `leading?: RowLeading;` to `CollectionRowProps`, and replace the dot `<span … />` in
    the row with:

```tsx
      {leading?.kind === "covers" ? (
        <span
          className={cn(
            "size-9 flex-none overflow-hidden",
            leading.current && "ring-accent ring-2",
          )}
        >
          <CoverMosaic covers={leading.covers} className="size-9" placeholderSize={14} />
        </span>
      ) : leading?.kind === "glyph" ? (
        <span
          data-testid="row-glyph"
          data-glyph={leading.glyph}
          className={cn(
            "flex size-9 flex-none items-center justify-center",
            leading.glyph === "bookmark"
              ? "border-hairline border-ink/10 bg-ink/3"
              : "border-ink/16 bg-ink/[4.5%] border-[0.5px] border-dashed",
          )}
        >
          {leading.glyph === "bookmark" ? (
            <Bookmark size={14} className="text-ink/40" />
          ) : (
            <Plus size={14} className="text-ink/55" />
          )}
        </span>
      ) : (
        <span className={cn("size-[9px] flex-none rounded-full", DOT_TONE[tone])} />
      )}
```

  - In `NewCollectionRow`'s collapsed branch, add `leading={{ kind: "glyph", glyph: "plus" }}`
    to the `<CollectionRow>`.
  - Update the header comment: rows lead with a face or a glyph square since 09-12-26; the dot
    is the fallback.
  - `save-to-collection-sheet.tsx`: on each `<CollectionRow>`, add
    `leading={{ kind: "covers", covers: c.covers, current: isCurrent }}`.
  - `collections-sheet.tsx`: "Everything kept" gets `leading={{ kind: "glyph", glyph: "bookmark" }}`;
    each collection row `leading={{ kind: "covers", covers: c.covers }}`.
  - `item-sheet.tsx`: in the per-collection `<button>`, replace
    `<span className="bg-accent size-2 flex-none rounded-full" />` with
    `<CoverMosaic covers={c.covers} className="size-7 flex-none" placeholderSize={12} />`
    (import it). Amend the "Deliberately no 'Already saved here' state" paragraph: the face
    comes from the same `saves.collections` read, so it costs nothing the dot didn't.

- [ ] **Step 8: Run — passes:** `bun run vitest run src/components/sheets` and `bun run test`
  (known red aside).

- [ ] **Step 9: Desktop e2e.** Append to `e2e/desktop.spec.ts`'s serial describe, after the
  hover-strip test and before the right-click one (both sign in; copy that idiom):

```ts
  // docs/DESIGN_list-screens.md §6: the hub is the feed's wide column, left-aligned, and packs
  // four collection tiles across; Saved packs four stacks.
  test("the Profile hub is wide and left-aligned, and its collections pack four across", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);
    await page.getByRole("button", { name: "Profile" }).click();
    await page.waitForURL("/profile", { timeout: 15_000 });

    const nav = page.getByRole("navigation", { name: "Profile" });
    await expect(nav.getByRole("link")).toHaveText([
      "Collections",
      "Topics",
      "Edit profile",
      "Settings",
    ]);
    // The 1120 column is centred in 1440, so its left edge is at 160; the nav is inset 20.
    const navBox = (await nav.boundingBox())!;
    expect(Math.abs(navBox.x - (160 + 20))).toBeLessThan(2);

    // The dashed tile plus the three seeded defaults: one row of four.
    const tiles = page.getByTestId("collections-grid").locator(":scope > *");
    await expect(tiles).toHaveCount(4);
    const tops = await tiles.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size).toBe(1);
    const gridBox = (await page.getByTestId("collections-grid").boundingBox())!;
    expect(gridBox.width).toBeLessThanOrEqual(1120);

    await page.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL("/profile/settings");
    await expect(page.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.goto("/saved");
    await expect(page.getByTestId("saved-columns").locator(":scope > div")).toHaveCount(4);
  });
```

  (`/saved` renders four stacks whether or not anything is saved — the grid's column count is a
  class; the earlier hover-strip test has saved two items by this point in the serial run.)

- [ ] **Step 10: Run the whole suite:** `bun run e2e:prod` — both projects green (the `chromium`
  project's rewritten `settings.spec.ts` included). Then `bun run check` — green apart from the
  known red.

- [ ] **Step 11: Commit.**

```bash
bun run format
git add src/components/ui/glass-header.tsx src/components/saved src/components/sheets e2e/desktop.spec.ts
git commit -m "feat(lists): Saved takes the wide column; every picker row leads with its collection's face"
```

---

### Task 8: Words — README amendment, the desktop-polish width table, SPEC, CLAUDE.md, log; push

**Files:**
- Modify: `docs/design_handoff_ambit_pwa_redesign/README.md`, `docs/DESIGN_desktop-polish.md`,
  `SPEC.md`, `CLAUDE.md`, `log.md`

- [ ] **Step 1: README.** Above §7 "Saved" (line ~341), add an amendment note in the idiom the
  09-11-26 one at line ~157 uses:

```markdown
> **Amended 09-12-26 (`docs/DESIGN_list-screens.md`).** Sections 7–10 describe the phone
> prototypes; the built screens diverge: `/profile` is a hub — the identity block over a
> four-link nav (Collections · Topics · Edit profile · Settings), no gear, no Edit pill —
> whose tabs are routes under one layout; a collection's cover is a square-cornered 2×2 of its
> four newest pictures, on the Collections tab and small in every picker row; Edit profile and
> Settings have no glass header and no back chevron (they are tabs), Settings has no shortcut
> cards, and `/settings` redirects to `/profile/settings`; on desktop the hub and Saved take the
> feed's 1120 px column and pack its column count.
```

- [ ] **Step 2: Desktop-polish design.** In `docs/DESIGN_desktop-polish.md` §1, the `Column`
  bullet: after "`wide` **1120 px** (the feed)" add
  "— **and, since 09-12-26, the Profile hub and Saved** (`docs/DESIGN_list-screens.md` §6);
  `narrow` keeps onboarding and reset-password, and the hub's Edit / Topics / Settings tabs cap
  themselves at 600 px left-aligned inside the wide column".

- [ ] **Step 3: SPEC.** `grep -n "/settings\|/profile" SPEC.md`: in the screens list (~line 444)
  amend the `/profile/topics` bullet ("reached from Profile's Topics row and from Settings' 'What
  you see'" → "a tab of the Profile hub since 09-12-26, also reached from Settings' 'What you
  see'; the facets are chips"), and add a bullet: "`/profile` is a hub (09-12-26,
  `docs/DESIGN_list-screens.md`): Collections · Topics · Edit profile · Settings as routed tabs
  under one layout; `/settings` is a permanent redirect to `/profile/settings`." In §11's
  headers bullet, `/settings` → `/profile/settings` in the e2e path list.

- [ ] **Step 4: CLAUDE.md.** Line ~21: "sign-out lives on `/settings`" → "sign-out lives on
  `/profile/settings`". Lines ~118 and ~229–230: "list screens are sub-project 4, unwritten" →
  "sub-project 4, the list screens, shipped 09-12-26 — see its bullet". Add a bullet under
  Architecture after the chrome-redesign one:

```markdown
- **The list screens shipped 09-12-26** (design `docs/DESIGN_list-screens.md`, plan
  `docs/PLAN_list-screens.md`; sub-project 4 of four from Ben's desktop review). `/profile` is a
  **hub**: `app/profile/layout.tsx` mounts `ProfileHub` — the identity block, a `<nav>` of four
  `<Link replace>`s (Collections · Topics · Edit profile · Settings) keyed on
  `useSelectedLayoutSegment()`, the `Toolbar`, and one raised toast tabs reach through
  `useProfileHub()` — around the child pages, which render content only. Tabs `replace`, so the
  hub is one history entry and Feed pops from any tab; `profile-origin.ts` is the hub's one
  marker (`edit-origin`/`settings-origin` are gone with the back chevrons). **`/settings` is a
  308 to `/profile/settings`**; `proxy.ts` keeps it in `AUTHED_PREFIXES` on purpose. A
  collection's face is **`CoverMosaic`** — `saves.collections` returns `covers: string[]` (the
  four newest pictures, one `row_number()` window, `COVER_COUNT = 4`) instead of `cover` — on
  the Collections tab and as the `leading` slot of `CollectionRow` in every picker. The hub and
  Saved are `Column width="wide"` and pack `GRID_COLS[useColumnCount()]` (`GRID_COLS` lives in
  `masonry.ts` now); the Edit / Topics / Settings tabs sit left-aligned in a
  `md:max-w-[600px]` div. One trap: **a layout's server guard runs on the document load only** —
  client tab switches re-render the page segment — so the four pages keep their own guards.
```

- [ ] **Step 5: log.md.** Extend the 09-12 entry (one heading per day — append a block, do not
  add a second `###`): what shipped (the eight commits in a line each), the decisions (Ben's six,
  in his words where the design doc quotes him), findings (anything the plan got wrong against
  the code, the `getByText` ambiguity on the edit tab, whatever e2e turned up), and the
  session-spend line per CLAUDE.md's instructions (run the script; omit the line if it exits
  non-zero).

- [ ] **Step 6: Final checks and push.**
  `bun run check` green (known red aside); `bun run e2e:prod` green;
  `grep -rn "profile-screen\|edit-origin\|settings-origin\|\.cover\b" src e2e` prints nothing
  relevant. Then:

```bash
bun run format
git add docs/design_handoff_ambit_pwa_redesign/README.md docs/DESIGN_desktop-polish.md SPEC.md CLAUDE.md log.md
git commit -m "docs: the list screens — README amendment, SPEC, CLAUDE.md, log"
git push -u origin feat/list-screens
```

  Ben reviews in the browser (phone width and 1440) and merges; the merge goes to production on
  the next redeploy (no migration, no seed change — `covers` is a query, not a column).

---

## Self-review against the spec

- §1 hub: the layout (3, Step 8), `ProfileHub` with header / `<nav aria-label="Profile">` of
  `<Link replace>` / `aria-current` / `useSelectedLayoutSegment` / `Toolbar` / `CollectionsSheet`
  / raised `Toast` / `ProfileHubContext` (3, Step 6); `edit-origin.ts` deleted (5),
  `settings-origin.ts` deleted (6); `profile-origin.ts` untouched and read by `leaveProfile` (3). ✔
- §2 Collections tab: `collections-tab.tsx` with `GRID_COLS[useColumnCount()]`, no heading,
  `NewCollectionTile` first (3, Step 9); `CoverMosaic`'s three shapes, square corners, `alt=""`
  (2); `covers` via `row_number()` capped at `COVER_COUNT` (1). ✔
- §3 Topics tab: no back link, no h1, "N on…" first, facet chips in a `group`, topics in a
  named `group` (4). ✔
- §4 Edit tab: no `GlassHeader`, "Save changes" saves, success `setData` + invalidate + hub
  toast + stays + guard released, Discard resets both fields and both errors (5). ✔
- §5 Settings tab: `git mv` + `permanentRedirect` (6, Step 4), no header / cards /
  `leaveSettings`, the two rows `router.replace` in-hub, sign-out and footer unchanged,
  `AUTHED_PREFIXES` untouched (6). ✔
- §6 desktop: hub `Column width="wide"` (3), tabs' `md:max-w-[600px]` divs (4, 5, 6), Saved
  `wide` on header and body with `GlassHeader width` and `saved-columns` packing
  `useColumnCount()` (7). ✔
- §7 picker rows: `RowLeading`, the 36 px face ringed when current, the two glyph squares,
  `NewCollectionRow`'s plus, the three sheets and `ItemSheet`'s 28 px face (7). ✔
- §8 testing: every named unit test has a step; e2e `settings.spec.ts` rewritten across 4–6,
  the three path-only specs in 6, `desktop.spec.ts` in 7. ✔
- Decisions: D1 order Collections · Topics · Edit profile · Settings in `PROFILE_TABS` (3); D2
  no gear anywhere (3); D3 mosaic on tab and rows (2, 7); D4 routes under `app/profile/` (3, 6);
  D5 `replace` in the nav and Settings' rows (3, 6); D6 wide + left-aligned + 600 px panels
  (3–7). ✔
- Names used across tasks: `COVER_COUNT`, `covers`, `CoverMosaic` (`covers`, `className`,
  `placeholderSize`; test ids `cover-mosaic`, `data-count`, `data-filler`), `GRID_COLS`,
  `ProfileHub` / `ProfileHubContext` / `useProfileHub` / `PROFILE_TABS`, `CollectionsTab`
  (`collections-grid`), `RowLeading` / `leading` (`row-glyph`, `data-glyph`),
  `GlassHeader width`, `saved-columns`, nav `aria-label="Profile"`. Each defined once, used with
  the same signature after. ✔
