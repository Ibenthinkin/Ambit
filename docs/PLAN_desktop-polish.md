# Desktop polish — grow to fit, sheets become dialogs, input basics

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-08-26 by Fable 5.1, from a 1440 px walk through the running app and three
decisions Ben made on 09-07-26. **For:** a cold session on a cheaper model.

**Goal:** above 768 px every screen stops stretching — the feed packs three or four columns
inside a 1120 px container, reading pages get a 720 px measure, list screens center in 600 px,
bottom sheets become centered 520 px dialogs, and tiles work with a keyboard and a right-click.
Below 768 px nothing changes, byte for byte.

**Architecture:** One breakpoint (Tailwind `md`), one `Column` primitive with three widths, one
`useMediaQuery` hook built on `useSyncExternalStore` so the server-rendered feed hydrates
straight into the right column count. `packColumns` generalizes from a hard-coded pair to N.
`BottomSheet` reads the same hook and swaps its positioning classes and animation pair;
gestures stay off at desktop. Tiles gain `tabIndex`, key handlers and a fine-pointer-guarded
`onContextMenu`. One new Playwright project at 1440 × 900 runs one new spec.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (`@theme` tokens in
`src/styles/globals.css`), Vitest + Testing Library (jsdom per file), Playwright.

**Spec:** `docs/DESIGN_desktop-polish.md` — read it first; every number below comes from it.

## Global Constraints

- **Breakpoint:** Tailwind `md` = **768 px**. The feed's second band is `xl` = **1280 px**. No
  other breakpoint may appear in this work.
- **Widths:** `narrow` **600 px**, `reader` **720 px**, `wide` **1120 px**, dialog **520 px**,
  hero cap **70vh**. Always as `md:max-w-[600px]`-style *literal* classes — Tailwind's scanner
  reads source text, so a computed class name silently generates no rule.
- **Below `md` nothing changes.** Every desktop class is `md:`-prefixed (or `xl:`). A task is
  wrong if a phone snapshot differs.
- **No new colour, radius or shadow tokens.** Two new named animations only
  (`--animate-dialog-in`, `--animate-dialog-out`).
- **Hydration:** anything that changes markup by viewport goes through
  `useMediaQuery`/`useSyncExternalStore`, never `useEffect` + state (see the design, §2).
- **Tests are non-negotiable** (SPEC §12). Component tests carry `// @vitest-environment jsdom`
  on line 1. `bun run check` (typecheck, lint, format, unit) must be green before the final
  commit; `bun run e2e` must be green too.
- **Port 3000 is Ambit's.** Run `lsof -ti:3000` before any e2e; kill a squatter first.
- **Branch:** `feat/desktop-polish` off `main`. Plain branch, no worktree.
- **Commits:** conventional prefixes; end every message with the two attribution lines
  from the session's system reminder (`Co-Authored-By:` and `Claude-Session:`).
- **Comment generously** — Ben is a returning webdev and the repo teaches. Match the house
  style: a paragraph above the thing saying *why*, not what.

---

## File map

| File | Responsibility |
|---|---|
| `src/hooks/use-media-query.ts` (new) | `useMediaQuery(query, serverValue)` and `useColumnCount()` |
| `src/hooks/use-media-query.test.tsx` (new) | both hooks under a stubbed `matchMedia` |
| `src/test/match-media.ts` (new) | `stubMatchMedia(matching)` shared test helper |
| `src/components/ui/column.tsx` (new) + `.test.tsx` | the three-width container |
| `src/components/ui/glass-header.tsx` | content in a `narrow` column |
| `src/components/feed/masonry.ts` + `.test.ts` | `packColumns(tiles, columnCount)` |
| `src/components/feed/feed-screen.tsx` + `.test.tsx` | N columns, `wide` column |
| `src/styles/globals.css` | `dialog-in` / `dialog-out` |
| `src/components/ui/bottom-sheet.tsx` + `.test.tsx` | desktop dialog mode |
| `src/components/landing/auth-sheet.tsx` | desktop card mode (bespoke) |
| `src/components/onboarding/onboarding-screen.tsx`, `saved/saved-screen.tsx`, `profile/profile-screen.tsx`, `profile/profile-edit-screen.tsx`, `settings/settings-screen.tsx` | wrap in `narrow` |
| `src/app/i/[itemId]/page.tsx`, `src/components/item/image-item-body.tsx` | `reader` column, hero cap |
| `src/components/feed/image-tile.tsx`, `article-card.tsx` + tests | keyboard, right-click, hover |
| `src/components/gallery/gallery-screen.tsx` + `.test.tsx` | Escape / arrows |
| `playwright.config.ts`, `e2e/desktop.spec.ts` (new) | 1440 × 900 project + spec |
| `docs/design_handoff_ambit_pwa_redesign/README.md`, `CLAUDE.md`, `log.md` | the record |

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
cd /Users/ben/Dev/ambit
git status -sb            # must be clean apart from the four desktop-*.jpeg files
git checkout -b feat/desktop-polish
```

The four `desktop-*.jpeg` files at the repo root are the screenshots the design was made from.
Leave them untracked until Task 11 deletes them.

---

### Task 1: `useMediaQuery` and `useColumnCount`

**Files:**
- Create: `src/hooks/use-media-query.ts`
- Create: `src/hooks/use-media-query.test.tsx`
- Create: `src/test/match-media.ts`

**Interfaces:**
- Produces: `useMediaQuery(query: string, serverValue?: boolean): boolean`,
  `useColumnCount(): 2 | 3 | 4`, `DESKTOP_QUERY = "(min-width: 768px)"`,
  `WIDE_QUERY = "(min-width: 1280px)"`, and the test helper
  `stubMatchMedia(matching: string[]): { fire(query: string, matches: boolean): void }`.

- [ ] **Step 1: Write the shared test helper**

`src/test/match-media.ts`:

```ts
import { act } from "@testing-library/react";
import { vi } from "vitest";

/**
 * A `window.matchMedia` stand-in for jsdom, which has none. `matching` lists the queries that
 * report `matches: true`; everything else (including `prefers-reduced-motion`, which
 * `BottomSheet` also asks about) reports false. `fire` flips one query and notifies its
 * listeners, which is how a test says "the window was resized across the breakpoint".
 *
 * Every media-query list object returned here carries `addEventListener` /
 * `removeEventListener`, because `useMediaQuery` subscribes through them — a stub that
 * returns a bare `{ matches }` would throw the moment a component using the hook mounts.
 */
export function stubMatchMedia(matching: string[]) {
  const state = new Map(matching.map((q) => [q, true]));
  const listeners = new Map<string, Set<() => void>>();

  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return state.get(query) === true;
    },
    media: query,
    addEventListener: (_type: "change", cb: () => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)!.add(cb);
    },
    removeEventListener: (_type: "change", cb: () => void) => {
      listeners.get(query)?.delete(cb);
    },
  }));

  return {
    fire(query: string, matches: boolean) {
      state.set(query, matches);
      act(() => {
        for (const cb of listeners.get(query) ?? []) cb();
      });
    },
  };
}
```

- [ ] **Step 2: Write the failing hook tests**

`src/hooks/use-media-query.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubMatchMedia } from "~/test/match-media";
import {
  DESKTOP_QUERY,
  useColumnCount,
  useMediaQuery,
  WIDE_QUERY,
} from "./use-media-query";

// Rendered rather than `renderHook`ed, for consistency with the other hook tests in this
// directory: what matters is that a *component* re-renders when the query flips.
function Probe({ query }: { query: string }) {
  const matches = useMediaQuery(query);
  return <span data-testid="probe">{matches ? "yes" : "no"}</span>;
}

function Columns() {
  return <span data-testid="cols">{useColumnCount()}</span>;
}

afterEach(() => vi.unstubAllGlobals());

describe("useMediaQuery", () => {
  it("reads the current match on mount", () => {
    stubMatchMedia([DESKTOP_QUERY]);
    render(<Probe query={DESKTOP_QUERY} />);
    expect(screen.getByTestId("probe")).toHaveTextContent("yes");
  });

  it("re-renders when the query flips", () => {
    const media = stubMatchMedia([]);
    render(<Probe query={DESKTOP_QUERY} />);
    expect(screen.getByTestId("probe")).toHaveTextContent("no");

    media.fire(DESKTOP_QUERY, true);
    expect(screen.getByTestId("probe")).toHaveTextContent("yes");
  });

  it("falls back to the server value where matchMedia is absent", () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<Probe query={DESKTOP_QUERY} />);
    expect(screen.getByTestId("probe")).toHaveTextContent("no");
  });
});

describe("useColumnCount", () => {
  it.each([
    [[], 2],
    [[DESKTOP_QUERY], 3],
    [[DESKTOP_QUERY, WIDE_QUERY], 4],
  ])("maps %j to %i columns", (matching, expected) => {
    stubMatchMedia(matching as string[]);
    render(<Columns />);
    expect(screen.getByTestId("cols")).toHaveTextContent(String(expected));
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `bun run vitest run src/hooks/use-media-query.test.tsx`
Expected: FAIL — cannot resolve `./use-media-query`.

- [ ] **Step 4: Write the hook**

`src/hooks/use-media-query.ts`:

```ts
"use client";

import * as React from "react";

/** Tailwind's `md`. The one breakpoint this app has — see docs/DESIGN_desktop-polish.md §1. */
export const DESKTOP_QUERY = "(min-width: 768px)";
/** Tailwind's `xl`. Exists only for the feed's fourth column. */
export const WIDE_QUERY = "(min-width: 1280px)";

/**
 * Does `query` match right now — as a subscription, not a one-off read.
 *
 * **Why `useSyncExternalStore` and not `useEffect` + `useState`.** The feed's first page is
 * rendered on the server (`app/feed/page.tsx` prefetches it), so the server has to commit to a
 * column count before any browser exists; that is `serverValue`. On the client, React hydrates
 * with the server snapshot and — if `getSnapshot` disagrees — re-renders *synchronously, before
 * paint*. A `useEffect` would paint the phone layout first and then jump, which on a 1440px
 * screen is two columns snapping to four in front of the reader.
 *
 * `matchMedia` is guarded because jsdom doesn't implement it; absent, the hook reports
 * `serverValue`, which keeps every existing component test rendering the phone layout.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const mql = window.matchMedia(query);
      // Optional-chained: an older test stub may return a bare `{ matches }`.
      mql.addEventListener?.("change", onChange);
      return () => mql.removeEventListener?.("change", onChange);
    },
    [query],
  );
  const getSnapshot = React.useCallback(() => {
    if (typeof window.matchMedia !== "function") return serverValue;
    return window.matchMedia(query).matches;
  }, [query, serverValue]);
  const getServerSnapshot = React.useCallback(() => serverValue, [serverValue]);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * How many masonry columns the feed packs: 2 on a phone, 3 from `md`, 4 from `xl`. The server
 * always says 2 — the phone is the first home, and the desktop case hydrates up (see above).
 */
export function useColumnCount(): 2 | 3 | 4 {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const wide = useMediaQuery(WIDE_QUERY);
  if (wide) return 4;
  if (desktop) return 3;
  return 2;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `bun run vitest run src/hooks/use-media-query.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-media-query.ts src/hooks/use-media-query.test.tsx src/test/match-media.ts
git commit -m "feat(hooks): useMediaQuery + useColumnCount — hydration-safe breakpoint reads"
```

---

### Task 2: `Column` primitive, and `GlassHeader` puts its content in one

**Files:**
- Create: `src/components/ui/column.tsx`
- Create: `src/components/ui/column.test.tsx`
- Modify: `src/components/ui/glass-header.tsx`

**Interfaces:**
- Produces: `<Column width="narrow" | "reader" | "wide" className? …divProps>`.

- [ ] **Step 1: Write the failing test**

`src/components/ui/column.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Column } from "./column";
import { GlassHeader } from "./glass-header";

describe("Column", () => {
  it.each([
    ["narrow", "md:max-w-[600px]"],
    ["reader", "md:max-w-[720px]"],
    ["wide", "md:max-w-[1120px]"],
  ] as const)("%s caps at %s only above md", (width, cls) => {
    render(
      <Column width={width} data-testid="col">
        x
      </Column>,
    );
    const el = screen.getByTestId("col");
    expect(el).toHaveClass("mx-auto", "w-full", cls);
    // Nothing un-prefixed constrains the phone layout.
    expect([...el.classList].filter((c) => c.startsWith("max-w"))).toEqual([]);
  });

  it("merges the caller's className", () => {
    render(
      <Column width="narrow" className="px-5" data-testid="col">
        x
      </Column>,
    );
    expect(screen.getByTestId("col")).toHaveClass("px-5", "md:max-w-[600px]");
  });
});

describe("GlassHeader", () => {
  it("keeps its chrome full-width and puts the children in a narrow column", () => {
    render(
      <GlassHeader className="flex-col" data-testid="hdr">
        <span>child</span>
      </GlassHeader>,
    );
    const header = screen.getByTestId("hdr");
    expect(header).toHaveClass("sticky", "backdrop-blur-[18px]");
    expect(header).not.toHaveClass("px-5");
    const inner = screen.getByText("child").parentElement!;
    expect(inner).toHaveClass("md:max-w-[600px]", "px-5", "flex-col");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run vitest run src/components/ui/column.test.tsx`
Expected: FAIL — cannot resolve `./column`.

- [ ] **Step 3: Write `Column`**

`src/components/ui/column.tsx`:

```tsx
import * as React from "react";

import { cn } from "~/lib/utils";

/**
 * The three widths the desktop design needs, and no fourth. Literal `md:` classes on purpose —
 * Tailwind's scanner reads source text, so `` `md:max-w-[${px}px]` `` would generate no rule
 * and the column would quietly stay full-width.
 */
const WIDTHS = {
  /** Onboarding, saved, profile, edit profile, settings — anything list-shaped. */
  narrow: "md:max-w-[600px]",
  /** The item page: a book-width measure for body text. */
  reader: "md:max-w-[720px]",
  /** The feed: room for four ~270px masonry columns. */
  wide: "md:max-w-[1120px]",
} as const;

export interface ColumnProps extends React.ComponentProps<"div"> {
  width: keyof typeof WIDTHS;
}

/**
 * The whole desktop mechanism (docs/DESIGN_desktop-polish.md §1): a screen keeps its phone
 * composition and simply stops stretching. Below `md` this is a plain full-width `div`; above
 * it, a centered column. Screens keep their own horizontal padding *inside* it.
 */
export function Column({ width, className, children, ...rest }: ColumnProps) {
  return (
    <div className={cn("mx-auto w-full", WIDTHS[width], className)} {...rest}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Move `GlassHeader`'s layout onto an inner column**

Replace the body of `src/components/ui/glass-header.tsx` with:

```tsx
import * as React from "react";

import { cn } from "~/lib/utils";
import { Column } from "./column";

// Feed's sticky glass header (Ambit - Feed.dc.html ~32): frosted, translucent, sits above the
// scroll content on every screen that has one. Callers supply their own children (wordmark, icon
// button, back arrow, ...) — this primitive only owns the sticky/blur/border chrome that's
// common across screens, not any particular layout of content inside it.
//
// Desktop (docs/DESIGN_desktop-polish.md §1): the *chrome* stays full-width — a blur that stops
// at 600px would look like a mistake — but the content, padding included, sits in the same
// `narrow` column the screen's body uses, so a back button lines up with the body's left edge.
// `className` therefore lands on the inner column, where the flex layout lives, which is what
// every existing caller (`flex-col items-stretch` on Saved) was targeting anyway.
export function GlassHeader({
  className,
  children,
  ...rest
}: React.ComponentProps<"header">) {
  return (
    <header
      // z-[8] mirrors the prototype's own stacking value — there's no `--z-*` theme namespace to
      // draw a name from (PHASE5_PLAN.md flagged this unverified; arbitrary value it is).
      className="bg-bg/66 border-ink/8 sticky top-0 z-[8] border-b-[0.5px] pt-14 pb-3 backdrop-blur-[18px] backdrop-saturate-[160%]"
      {...rest}
    >
      <Column
        width="narrow"
        className={cn("flex items-end justify-between px-5", className)}
      >
        {children}
      </Column>
    </header>
  );
}
```

- [ ] **Step 5: Run the new test plus every screen test that renders a header**

Run: `bun run vitest run src/components/ui src/components/saved src/components/settings src/components/profile`
Expected: PASS. If a screen test asserted `px-5` on the `<header>` itself, update that
assertion to the inner column — the chrome no longer carries padding.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/column.tsx src/components/ui/column.test.tsx src/components/ui/glass-header.tsx
git commit -m "feat(ui): Column — the one desktop primitive; GlassHeader content rides in it"
```

---

### Task 3: `packColumns(tiles, columnCount)`

**Files:**
- Modify: `src/components/feed/masonry.ts` (the `packColumns` function at the bottom)
- Modify: `src/components/feed/masonry.test.ts` (the `describe("packColumns")` block)

**Interfaces:**
- Produces: `packColumns(tiles: FeedTile[], columnCount = 2): FeedTile[][]`. The return
  type widens from a tuple to an array; both callers (`feed-screen.tsx`, `saved-screen.tsx`)
  only ever `.map` it, and the tests destructure — destructuring an array is fine.

- [ ] **Step 1: Add the failing tests** to the existing `describe("packColumns", …)` block:

```ts
  it("packs into N columns, shortest first, lowest index on ties", () => {
    // Eight squares-ish tiles across four columns: the first four go one per column (all
    // level at 0), then each next tile lands on whichever column is shortest.
    const tiles = buildTiles(
      [page(Array.from({ length: 8 }, (_, i) => card(`t${i}`)))],
      LABELS,
    );
    const cols = packColumns(tiles, 4);
    const ids = (col: FeedTile[]) =>
      col.map((t) => (t.kind === "because" ? t.key : t.card.item.id));

    expect(cols).toHaveLength(4);
    expect(cols.map((c) => c[0] && ids([c[0]])[0])).toEqual(["t0", "t1", "t2", "t3"]);
    // Aspects 0..3 are 0.68, 0.78, 1.24, 1.30: column 0 is shortest, then 1, then 2, then 3.
    expect(ids(cols[0]!)).toEqual(["t0", "t4"]);
    expect(ids(cols[1]!)).toEqual(["t1", "t5"]);
    expect(ids(cols[2]!)).toEqual(["t2", "t6"]);
    expect(ids(cols[3]!)).toEqual(["t3", "t7"]);
  });

  it("defaults to two columns, so Saved's call site is unchanged", () => {
    const tiles = buildTiles([page([card("a"), card("b")])], LABELS);
    expect(packColumns(tiles)).toHaveLength(2);
  });

  it("append-only holds per column at any width", () => {
    const first = [page(Array.from({ length: 9 }, (_, i) => card(`a${i}`)))];
    const both = [
      ...first,
      page(Array.from({ length: 9 }, (_, i) => card(`b${i}`))),
    ];
    const c1 = packColumns(buildTiles(first, LABELS), 3);
    const c2 = packColumns(buildTiles(both, LABELS), 3);
    for (let i = 0; i < 3; i++) {
      expect(c2[i]!.slice(0, c1[i]!.length)).toEqual(c1[i]);
    }
  });
```

Add `import type { FeedTile } from "./masonry";` if the file's existing import line doesn't
already bring the type in (it imports `buildTiles, IMAGE_ASPECTS, packColumns` — extend it).

- [ ] **Step 2: Run to verify it fails**

Run: `bun run vitest run src/components/feed/masonry.test.ts`
Expected: FAIL — the second argument is ignored and `toHaveLength(4)` gets 2.

- [ ] **Step 3: Generalize the packer**

Replace `packColumns` in `src/components/feed/masonry.ts`:

```ts
/**
 * Greedy shortest-column packing — the prototype's own algorithm, and the reason this is a
 * `grid` of `flex` stacks rather than CSS `columns`. Native CSS multi-column balances by
 * *reflowing*, which means appending a page can move a tile the user is currently looking at
 * into another column. This can't: a tile's placement depends only on the tiles before it, so
 * growing the list is always append-only per column.
 *
 * `columnCount` arrived with the desktop pass (docs/DESIGN_desktop-polish.md §2): 2 on a phone,
 * 3 from `md`, 4 from `xl`, chosen by `useColumnCount`. Ties go to the lowest index, which keeps
 * the output deterministic (and therefore assertable) for a given input.
 */
export function packColumns(
  tiles: FeedTile[],
  columnCount = 2,
): FeedTile[][] {
  const columns: FeedTile[][] = Array.from({ length: columnCount }, () => []);
  const heights = new Array<number>(columnCount).fill(0);

  for (const tile of tiles) {
    let target = 0;
    for (let i = 1; i < columnCount; i++) {
      if (heights[i]! < heights[target]!) target = i;
    }
    columns[target]!.push(tile);
    heights[target] += estHeight(tile) + GAP;
  }

  return columns;
}
```

- [ ] **Step 4: Run the masonry tests and the two callers' tests**

Run: `bun run vitest run src/components/feed src/components/saved && bun run typecheck`
Expected: PASS. Typecheck passes because both callers only `.map` the result; if the old
`[left, right]` tuple destructure in a test now complains about possibly-undefined, add `!`.

- [ ] **Step 5: Commit**

```bash
git add src/components/feed/masonry.ts src/components/feed/masonry.test.ts
git commit -m "feat(feed): packColumns takes a column count — same greedy pack, N stacks"
```

---

### Task 4: The feed packs N columns inside a `wide` column

**Files:**
- Modify: `src/components/feed/feed-screen.tsx` (the `columns` memo ~line 236 and the grid
  ~line 334)
- Modify: `src/components/feed/feed-screen.test.tsx`

**Interfaces:**
- Consumes: `useColumnCount` (Task 1), `Column` (Task 2), `packColumns(tiles, n)` (Task 3).
- Produces: the grid carries `data-testid="feed-columns"` (the e2e spec in Task 10 counts its
  children).

- [ ] **Step 1: Write the failing test**

Find how `feed-screen.test.tsx` renders the screen (it mocks `~/trpc/react` and feeds pages of
cards; reuse its existing `render…` helper and fixtures — do not invent new ones). Add:

```tsx
import { stubMatchMedia } from "~/test/match-media";
import { DESKTOP_QUERY, WIDE_QUERY } from "~/hooks/use-media-query";

describe("desktop columns", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("packs two columns where matchMedia is absent (the phone, and the server)", () => {
    renderFeed(/* the file's usual fixture pages */);
    const grid = screen.getByTestId("feed-columns");
    expect(grid).toHaveClass("grid-cols-2");
    expect(grid.children).toHaveLength(2);
  });

  it("packs four columns above xl, three above md", () => {
    const media = stubMatchMedia([DESKTOP_QUERY, WIDE_QUERY]);
    renderFeed(/* same fixture */);
    const grid = screen.getByTestId("feed-columns");
    expect(grid).toHaveClass("grid-cols-4");
    expect(grid.children).toHaveLength(4);

    media.fire(WIDE_QUERY, false);
    expect(screen.getByTestId("feed-columns")).toHaveClass("grid-cols-3");
    expect(screen.getByTestId("feed-columns").children).toHaveLength(3);
  });

  it("centers the masonry in the wide column", () => {
    renderFeed(/* same fixture */);
    expect(screen.getByTestId("feed-columns").parentElement).toHaveClass(
      "md:max-w-[1120px]",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run vitest run src/components/feed/feed-screen.test.tsx`
Expected: FAIL — no element with test id `feed-columns`.

- [ ] **Step 3: Wire the count into the screen**

In `src/components/feed/feed-screen.tsx`:

Add the imports:

```ts
import { useColumnCount } from "~/hooks/use-media-query";
import { Column } from "~/components/ui/column";
```

Above the `columns` memo, read the count, and add it to the memo:

```ts
  // 2 / 3 / 4 by viewport, hydration-safe — see `useMediaQuery` on why it isn't an effect.
  const columnCount = useColumnCount();

  const { columns, firstPageTiles, cardCount } = React.useMemo(() => {
    const tiles = buildTiles(pages, topicLabels);
    // (existing comment about page one stays)
    const firstPage =
      pages.length > 0 ? buildTiles([pages[0]!], topicLabels) : [];
    return {
      columns: packColumns(tiles, columnCount),
      firstPageTiles: new Set(tiles.slice(0, firstPage.length)),
      cardCount: pages.reduce((n, p) => n + p.cards.length, 0),
    };
  }, [pages, topicLabels, columnCount]);
```

Add the literal class map near the top of the file (module scope):

```ts
// Literal, never computed — Tailwind's scanner reads source text (see masonry.ts on
// `IMAGE_ASPECTS`). One entry per value `useColumnCount` can return.
const GRID_COLS = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
} as const;
```

Replace the grid `div` (the one with `grid grid-cols-2 items-start gap-1 px-1 pt-[58px]`) so
it sits inside a wide column:

```tsx
      {/* `items-start` so a short column doesn't stretch to match a tall one — the columns are
          independent stacks that happen to sit side by side, which is the whole idea of a masonry.
          The `Column` is the desktop cap (docs/DESIGN_desktop-polish.md §2): 1120px, centered in
          whatever the dev drawer leaves. */}
      <Column width="wide">
        <div
          data-testid="feed-columns"
          className={cn(
            "grid items-start gap-1 px-1 pt-[58px]",
            GRID_COLS[columnCount],
          )}
        >
          {columns.map((column, columnIndex) => (
            /* …the existing column/tile rendering, unchanged… */
          ))}
        </div>
      </Column>
```

`cn` is `~/lib/utils`'s — import it if the file doesn't already.

- [ ] **Step 4: Run the feed tests**

Run: `bun run vitest run src/components/feed`
Expected: PASS. If an existing test selected `.grid > div`, it still matches.

- [ ] **Step 5: Look at it**

```bash
lsof -ti:3000            # empty, or kill what's there
bun run dev
```

Open `http://localhost:3000/feed` at 1440 px wide (sign in as any local account): four
columns, centered, gutters either side. Narrow the window past 1280 → three; past 768 → two,
edge to edge, as before. Reload at 1440: no two-to-four flash.

- [ ] **Step 6: Commit**

```bash
git add src/components/feed/feed-screen.tsx src/components/feed/feed-screen.test.tsx
git commit -m "feat(feed): three and four masonry columns above md/xl, inside a 1120px column"
```

---

### Task 5: `BottomSheet` becomes a centered dialog above `md`

**Files:**
- Modify: `src/styles/globals.css` (the `@theme` animation block and its keyframes)
- Modify: `src/components/ui/bottom-sheet.tsx`
- Modify: `src/components/ui/bottom-sheet.test.tsx`

**Interfaces:**
- Consumes: `useMediaQuery`, `DESKTOP_QUERY` (Task 1); `stubMatchMedia` (Task 1).
- Produces: nothing new — the public `BottomSheetProps` are unchanged.

- [ ] **Step 1: Add the animation pair to `globals.css`**

In the `@theme { … }` block, after the `--animate-menu-drop` line:

```css
  --animate-dialog-in: dialog-in 0.2s ease both; /* a bottom sheet above `md` (the desktop pass):
                                  the same panel, centered, arriving as a dialog does — a short
                                  fade-and-settle rather than a slide from an edge that is
                                  nowhere near it. */
  --animate-dialog-out: dialog-out 0.15s ease both; /* the exit half; `BottomSheet`'s fallback
                                  timer is longer than this, as it must be. */
```

After the `menu-drop` keyframes:

```css
  @keyframes dialog-in {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
  @keyframes dialog-out {
    from {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    to {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.97);
    }
  }
```

The keyframes carry the centering translate themselves because an animation's `transform`
replaces the element's own, and the panel is centered by `-translate-x-1/2 -translate-y-1/2`.
Without it the panel would jump to the top-left corner for the length of the animation.

- [ ] **Step 2: Write the failing tests**

Add to `src/components/ui/bottom-sheet.test.tsx`. First fix the existing reduced-motion test's
stub so it also answers the desktop query with listeners — replace its
`vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));` with
`stubMatchMedia(["(prefers-reduced-motion: reduce)"]);` (import `stubMatchMedia` from
`~/test/match-media`, and `DESKTOP_QUERY` from `~/hooks/use-media-query`). Then add:

```tsx
describe("above md — a centered dialog", () => {
  beforeEach(() => stubMatchMedia([DESKTOP_QUERY]));
  afterEach(() => vi.unstubAllGlobals());

  it("is 520px, centered, rounded on every corner, and arrives by the dialog pair", () => {
    render(
      <BottomSheet open onClose={vi.fn()} title="Save to collection">
        <p>Rows</p>
      </BottomSheet>,
    );
    const panel = screen.getByTestId("bottom-sheet-panel");
    expect(panel).toHaveClass(
      "md:w-[520px]",
      "md:left-1/2",
      "md:top-1/2",
      "md:-translate-x-1/2",
      "md:-translate-y-1/2",
      "md:rounded-sheet",
      "animate-dialog-in",
    );
    expect(panel).not.toHaveClass("animate-sheet-up");
  });

  it("leaves by the dialog pair too, gallery variant included", () => {
    const { rerender } = render(
      <BottomSheet open onClose={vi.fn()} variant="gallery" dragToClose>
        <p>Details</p>
      </BottomSheet>,
    );
    rerender(
      <BottomSheet open={false} onClose={vi.fn()} variant="gallery" dragToClose>
        <p>Details</p>
      </BottomSheet>,
    );
    expect(screen.getByTestId("bottom-sheet-panel")).toHaveClass("animate-dialog-out");
  });

  it("hides the grabber and never arms a drag", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} dragToClose>
        <p>Details</p>
      </BottomSheet>,
    );
    const panel = screen.getByTestId("bottom-sheet-panel");
    expect(panel.querySelector(".md\\:hidden")).not.toBeNull();

    // The phone's close gesture: a slow drag past DRAG_CLOSE_PX. On desktop it must do nothing.
    grab(panel);
    send(panel, "pointerMove", { clientX: 0, clientY: 120 });
    send(panel, "pointerUp", { clientX: 0, clientY: 120 });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("below md — unchanged", () => {
  it("keeps the slide-up pair and the bottom anchoring", () => {
    stubMatchMedia([]);
    render(
      <BottomSheet open onClose={vi.fn()}>
        <p>Rows</p>
      </BottomSheet>,
    );
    const panel = screen.getByTestId("bottom-sheet-panel");
    expect(panel).toHaveClass("animate-sheet-up", "bottom-0", "inset-x-0");
    vi.unstubAllGlobals();
  });
});
```

`grab` and `send` are the file's existing helpers.

- [ ] **Step 3: Run to verify it fails**

Run: `bun run vitest run src/components/ui/bottom-sheet.test.tsx`
Expected: FAIL on the three desktop tests (no `md:` classes, wrong animation pair).

- [ ] **Step 4: Implement the desktop mode**

In `src/components/ui/bottom-sheet.tsx`:

Import: `import { DESKTOP_QUERY, useMediaQuery } from "~/hooks/use-media-query";`

Add the pair to `ANIMATIONS`:

```ts
const ANIMATIONS = {
  sheet: { in: "animate-sheet-up", out: "animate-sheet-down" },
  menu: { in: "animate-menu-rise", out: "animate-menu-drop" },
  gallery: { in: "animate-sheet-gallery", out: "animate-sheet-gallery-out" },
  // Above `md` every variant uses this one (docs/DESIGN_desktop-polish.md §3): the panel is
  // centered, so a slide from the bottom edge would travel half a screen to get there.
  dialog: { in: "animate-dialog-in", out: "animate-dialog-out" },
} as const;
```

Add a desktop skin beside `PANEL`:

```ts
// Above `md` the panel stops being a sheet: 520px, centered both ways, every corner rounded at
// the sheet radius, a full hairline border rather than a top one. `md:inset-auto` clears the
// phone's `inset-x-0 bottom-0` before the `left/top` pair re-anchors it. `overscroll-contain`
// so a wheel at the end of the rows doesn't scroll the page underneath.
const PANEL_DESKTOP =
  "md:inset-auto md:left-1/2 md:top-1/2 md:w-[520px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-sheet md:border md:overscroll-contain";
```

Inside the component, after the `useState`s:

```ts
  // One read, shared by the animation pair, the panel skin and the gesture gate below. Sheets
  // only ever render on the client (they open from a tap), so the server snapshot never paints.
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
```

Find `const pair = variant === "gallery" ? "gallery" : animation;` (~line 299) and make the
desktop win — keep the comment above it and add one line to it saying the dialog pair wins
above `md` because the panel is centered there:

```ts
  const pair = isDesktop ? "dialog" : variant === "gallery" ? "gallery" : animation;
```

Find `const gestureEnabled = dragToClose || Boolean(onSwipeSide);` and gate it:

```ts
  // No drag-to-close and no sideways cycling on a desktop: there is no finger, the grabber is
  // hidden, and a mouse wheel over the rows must never be mistaken for a pull.
  const gestureEnabled = !isDesktop && (dragToClose || Boolean(onSwipeSide));
```

On the panel's `className`, add `PANEL_DESKTOP` after `PANEL[variant]`:

```tsx
        className={cn(
          "border-hairline bg-surface absolute inset-x-0 bottom-0 flex flex-col overflow-y-auto border-t pt-2 pb-[26px] outline-none",
          PANEL[variant],
          PANEL_DESKTOP,
          leaving ? ANIMATIONS[pair].out : ANIMATIONS[pair].in,
        )}
```

On the grabber's wrapper, add `md:hidden`:

```tsx
        <div className="flex shrink-0 flex-col items-center py-4 md:hidden">
```

Check the exit fallback timer: `EXIT_MS` is `{ pill: 300, gallery: 360 }` and is longer than
`dialog-out`'s 150 ms either way, so the `animationend` race still resolves. No change.

- [ ] **Step 5: Run the sheet tests and every sheet consumer**

Run: `bun run vitest run src/components/ui/bottom-sheet.test.tsx src/components/sheets src/components/gallery src/components/feed`
Expected: PASS.

- [ ] **Step 6: Look at it**

With the dev server up, at 1440 px: right-click is not wired yet, so long-press a tile with
the mouse (hold ~0.5 s). The item sheet fades in centered, 520 px, rounded all round, no
grabber. Click the scrim → it fades out. Press Escape on another → same. Narrow below 768 →
the slide-up sheet, grabber back. Also open the gallery (`/g/<itemId>`) and swipe up for the
details sheet: dialog above `md`, sheet below.

- [ ] **Step 7: Commit**

```bash
git add src/styles/globals.css src/components/ui/bottom-sheet.tsx src/components/ui/bottom-sheet.test.tsx
git commit -m "feat(ui): BottomSheet is a centered 520px dialog above md — fade, no grabber, no drag"
```

---

### Task 6: The landing's `AuthSheet` gets the same treatment by hand

**Files:**
- Modify: `src/components/landing/auth-sheet.tsx` (the panel `div` ~line 58)
- Modify: `src/components/landing/landing-screen.test.tsx` (or `auth-card.test.tsx`, whichever
  renders `AuthSheet` — search for `auth-sheet` test id)

`AuthSheet` is deliberately not a `BottomSheet` (its header comment explains: it is *resident*,
not summoned). It translates in and out with Tailwind classes, so the desktop mode is the same
idea in classes: at `md` the panel is a 520 px card centered both ways that fades and settles,
and the closed state is transparent and inert rather than off-screen.

Tailwind v4's `translate-x-*` and `translate-y-*` utilities compose (each sets its own variable
on the `translate` property), so `md:-translate-x-1/2` and the open/closed `translate-y-*`
classes coexist.

- [ ] **Step 1: Write the failing test**

In the test file that renders the landing with the sheet open (find the one asserting
`data-open="true"`), add:

```tsx
  it("is a centered 520px card above md, transparent and inert when closed", () => {
    // Render however the file renders the open sheet; then:
    const sheet = screen.getByTestId("auth-sheet");
    expect(sheet).toHaveClass(
      "md:inset-auto",
      "md:left-1/2",
      "md:top-1/2",
      "md:w-[520px]",
      "md:-translate-x-1/2",
      "md:-translate-y-1/2",
      "md:rounded-[28px]",
    );
    // Closed: (re-render with the sheet collapsed, however the file does it) then:
    // expect(sheet).toHaveClass("translate-y-full", "md:-translate-y-[45%]", "md:opacity-0", "md:pointer-events-none");
  });
```

Fill the two "however the file does it" gaps with the file's existing helpers — don't add a
new render path.

- [ ] **Step 2: Run to verify it fails**

Run: `bun run vitest run src/components/landing`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Add the desktop classes**

In `src/components/landing/auth-sheet.tsx`, replace the panel's class array:

```tsx
        className={[
          "bg-surface border-ink/10 fixed inset-x-0 bottom-0 z-40 max-h-[88dvh] overflow-y-auto",
          "rounded-t-[28px] border-t px-[26px] pt-[14px]",
          // The safe-area inset keeps the last control clear of the iPhone home indicator; the
          // max-height plus scroll is what stops sign-up mode (an extra field) from pushing the
          // submit button off a small screen once the keyboard is up.
          "pb-[calc(36px+env(safe-area-inset-bottom))]",
          // Above `md` (docs/DESIGN_desktop-polish.md §3): a 520px card centered both ways, every
          // corner rounded, a full border. It fades and settles rather than sliding — hence the
          // transition covers opacity too, and the closed state below is transparent rather than
          // off-screen. `md:inset-auto` clears the phone anchoring before `left/top` re-anchor.
          "md:inset-auto md:left-1/2 md:top-1/2 md:w-[520px] md:max-h-[80dvh] md:-translate-x-1/2 md:rounded-[28px] md:border md:pb-[36px]",
          "transition-[translate,opacity] duration-[550ms] ease-[cubic-bezier(.2,.9,.25,1)]",
          open
            ? "translate-y-0 md:-translate-y-1/2 md:opacity-100"
            : "translate-y-full md:-translate-y-[45%] md:opacity-0 md:pointer-events-none",
        ].join(" ")}
```

`transition-[translate,opacity]` replaces `transition-transform`: v4's translate utilities
write the `translate` property, not `transform`, and the fade needs `opacity` in the list.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run vitest run src/components/landing`
Expected: PASS.

- [ ] **Step 5: Look at it**

`http://localhost:3000/` at 1440 px, signed out: click the logo glyph → the sign-in card fades
in centered. Click "Back to the slideshow" → it fades out and the slideshow is clickable
again (the `pointer-events-none` is what makes that true). `/reset-password?token=x` shows
the reset card in the same centered panel. Below 768: the slide, unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing
git commit -m "feat(landing): the auth sheet is a centered card above md"
```

---

### Task 7: Every list screen centers in `narrow`; the item page reads at `reader`

**Files:**
- Modify: `src/components/onboarding/onboarding-screen.tsx`
- Modify: `src/components/saved/saved-screen.tsx`
- Modify: `src/components/profile/profile-screen.tsx`
- Modify: `src/components/profile/profile-edit-screen.tsx`
- Modify: `src/components/settings/settings-screen.tsx`
- Modify: `src/app/i/[itemId]/page.tsx`
- Modify: `src/components/item/image-item-body.tsx`
- Modify: the matching `*.test.tsx` for onboarding, saved, profile, settings and
  `src/components/item/item-sections.test.tsx`

**Interfaces:**
- Consumes: `Column` (Task 2).

The rule for every screen: the `<main>` keeps its `bg-bg text-ink min-h-dvh`; everything
*inside* it that isn't a `GlassHeader` (which already centers itself, Task 2) goes into one
`<Column width="narrow">`. Screens keep their own `px-*`.

- [ ] **Step 1: Write the failing tests**

One assertion per screen test file, using each file's existing render helper:

```tsx
  it("centers in a narrow column above md", () => {
    /* render as the file does */
    expect(document.querySelector(".md\\:max-w-\\[600px\\]")).not.toBeNull();
  });
```

For the item page, in `item-sections.test.tsx` (which renders `ImageItemBody`):

```tsx
  it("the hero caps at 70vh and shows whole above md, cropped to 300px below", () => {
    /* render ImageItemBody with an image item as the file does */
    const img = screen.getByRole("img");
    expect(img).toHaveClass(
      "h-[300px]",
      "object-cover",
      "md:h-auto",
      "md:w-auto",
      "md:max-h-[70vh]",
      "md:max-w-full",
      "md:mx-auto",
      "md:object-contain",
    );
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun run vitest run src/components/onboarding src/components/saved src/components/profile src/components/settings src/components/item`
Expected: FAIL on each new test.

- [ ] **Step 3: Onboarding**

Import `Column`. Wrap the two `<Rise>` blocks (heading + chip grid) in
`<Column width="narrow">…</Column>`. In the fixed action bar, keep the bar full-width and wrap
its *contents* (the error slot and the count/CTA row) in `<Column width="narrow">`:

```tsx
      <div className="from-bg to-bg/0 fixed inset-x-0 bottom-0 z-20 bg-linear-to-t from-62% px-6 pt-5 pb-10">
        {/* Full-width gradient, narrow content — the bar's fade has to cover the whole
            viewport or the chips scroll out from under a 600px band. */}
        <Column width="narrow">
          {error && ( /* unchanged */ )}
          <div className="flex items-center gap-[14px]">
            {/* unchanged */}
          </div>
        </Column>
      </div>
```

Because the bar has `px-6` on the outer and the body has `px-6` inside the column, the CTA row
would sit 24 px inside the column's edge while the chips sit at it. Move the bar's `px-6` off
the outer `div` and onto the inner `Column` (`<Column width="narrow" className="px-6">`) so
both are column-then-padding.

- [ ] **Step 4: Saved, Profile, Edit profile, Settings**

- **Saved:** the `GlassHeader` stays; wrap everything after it (the masonry grid and its
  empty/loading states) in `<Column width="narrow">`.
- **Profile:** wrap the whole of `<main>`'s children (the settings-button row and the three
  `me.*` branches) in one `<Column width="narrow">`.
- **Edit profile:** `GlassHeader` stays; wrap the form `div` (`flex flex-col gap-5 px-5
  pt-[34px] pb-[60px]`) in `<Column width="narrow">`. Do the same for the pending and error
  branches' inner `div`s.
- **Settings:** `GlassHeader` stays; wrap the `<div className="px-5 pb-[120px]">` in
  `<Column width="narrow">`.

- [ ] **Step 5: Item page**

In `src/app/i/[itemId]/page.tsx`, inside `<main …>`, wrap the four `Rise` blocks in
`<Column width="reader">` (import it from `~/components/ui/column`). The `main` keeps
`px-[22px] pt-[68px] pb-[110px]` — but move `px-[22px]` onto the `Column` for the same
column-then-padding reason as onboarding.

In `src/components/item/image-item-body.tsx`, the hero `<img>`'s class becomes:

```tsx
            // Below `md`: the redesign's 300px cover crop. Above it (docs/DESIGN_desktop-polish.md
            // §4): the picture whole, up to 70% of the viewport tall, centered in the reader
            // column. `w-auto` + `max-w-full` is what lets a tall plate stand at its own width
            // instead of stretching to the column and letterboxing inside its rounded box.
            className="rounded-tile block h-[300px] w-full object-cover md:mx-auto md:h-auto md:w-auto md:max-h-[70vh] md:max-w-full md:object-contain"
```

- [ ] **Step 6: Run the screen tests, then typecheck**

Run: `bun run vitest run src/components/onboarding src/components/saved src/components/profile src/components/settings src/components/item && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Look at every screen at 1440 and at 390**

`/onboarding` (a fresh invite: `bun run invite ambit-desktop-check@example.com`, sign up),
`/saved`, `/profile`, `/profile/edit`, `/settings`, and an image item and an article item under
`/i/…`. At 1440: centered; headers' back buttons align with body content; the item hero is
whole and centered; the onboarding CTA row aligns with the chips. At 390: identical to `main`.

- [ ] **Step 8: Commit**

```bash
git add src/components/onboarding src/components/saved src/components/profile src/components/settings src/components/item "src/app/i/[itemId]/page.tsx"
git commit -m "feat(screens): list screens center at 600px, the item page reads at 720px with a 70vh hero"
```

---

### Task 8: Tiles work with a keyboard and a right-click

**Files:**
- Modify: `src/components/feed/image-tile.tsx`
- Modify: `src/components/feed/article-card.tsx`
- Create or extend: `src/components/feed/image-tile.test.tsx`, `src/components/feed/article-card.test.tsx`
  (create if absent; check `ls src/components/feed/*.test.*` first)

**Interfaces:**
- Consumes: `usePress` (unchanged), `stubMatchMedia` (Task 1).
- Produces: both tiles expose `role="button"`, `tabIndex={0}`, `aria-label={item.title}`, and
  handle `Enter`, `Space` and `contextmenu`.

The context-menu guard: only when `onLongPress` is provided (Saved's tiles have none) **and**
`window.matchMedia?.("(pointer: fine)").matches` is true. On Android a long-press synthesizes a
`contextmenu` event after `usePress` has already fired `onLongPress`; the guard is what stops
the sheet opening twice there.

- [ ] **Step 1: Write the failing tests** (`image-tile.test.tsx`; mirror the same three for
  `article-card.test.tsx` with `<ArticleCard card={…} …>`)

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeedCard } from "~/server/services/feed";
import { stubMatchMedia } from "~/test/match-media";
import { ImageTile } from "./image-tile";

// Build a minimal FeedCard the way masonry.test.ts's `card()` does — copy its `makeItem` shape
// rather than importing across test files.
const card = (id: string): FeedCard => ({ /* …as in masonry.test.ts… */ } as FeedCard);

const FINE = "(pointer: fine)";

afterEach(() => vi.unstubAllGlobals());

describe("ImageTile — desktop input", () => {
  it("is a focusable button named after the item, and Enter/Space open it", () => {
    const onTap = vi.fn();
    render(<ImageTile card={card("a")} aspectClass="aspect-square" onTap={onTap} />);
    const tile = screen.getByRole("button", { name: "A title" });
    expect(tile).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(tile, { key: "Enter" });
    fireEvent.keyDown(tile, { key: " " });
    expect(onTap).toHaveBeenCalledTimes(2);
  });

  it("right-click opens the item sheet on a fine pointer, and suppresses the native menu", () => {
    stubMatchMedia([FINE]);
    const onLongPress = vi.fn();
    render(
      <ImageTile card={card("a")} aspectClass="aspect-square" onTap={vi.fn()} onLongPress={onLongPress} />,
    );
    const tile = screen.getByRole("button", { name: "A title" });
    const prevented = !fireEvent.contextMenu(tile);
    expect(onLongPress).toHaveBeenCalledOnce();
    expect(prevented).toBe(true);
  });

  it("ignores right-click on a coarse pointer (Android's synthesized contextmenu)", () => {
    stubMatchMedia([]);
    const onLongPress = vi.fn();
    render(
      <ImageTile card={card("a")} aspectClass="aspect-square" onTap={vi.fn()} onLongPress={onLongPress} />,
    );
    fireEvent.contextMenu(screen.getByRole("button", { name: "A title" }));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("does nothing on right-click when there is no item sheet (Saved)", () => {
    stubMatchMedia([FINE]);
    render(<ImageTile card={card("a")} aspectClass="aspect-square" onTap={vi.fn()} />);
    // Not prevented: the browser's own menu is the right answer here.
    expect(fireEvent.contextMenu(screen.getByRole("button", { name: "A title" }))).toBe(true);
  });
});
```

`fireEvent` returns `false` when a handler called `preventDefault()`.

- [ ] **Step 2: Run to verify it fails**

Run: `bun run vitest run src/components/feed/image-tile.test.tsx src/components/feed/article-card.test.tsx`
Expected: FAIL — no element with role `button`.

- [ ] **Step 3: A shared helper for the two tiles**

Add to `src/hooks/use-press.ts` (it already owns pointer semantics; this keeps the two tiles
from duplicating the guard):

```ts
/**
 * Desktop affordances for a pressable tile (docs/DESIGN_desktop-polish.md §4): a keyboard can
 * "tap" it, and a right-click stands in for the long-press a mouse doesn't have.
 *
 * The `(pointer: fine)` guard is load-bearing. Android fires a synthesized `contextmenu` at the
 * end of a long-press — *after* `usePress` has already called `onLongPress` — so on a coarse
 * pointer this handler must stay out of it or the item sheet opens twice. jsdom has no
 * `matchMedia`; absent, the pointer is assumed coarse, which is the safe direction.
 */
export function useDesktopPress({ onTap, onLongPress }: UsePressOptions) {
  return {
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault(); // Space would otherwise scroll the page
      onTap?.();
    },
    onContextMenu: (e: React.MouseEvent) => {
      if (!onLongPress) return;
      const fine = window.matchMedia?.("(pointer: fine)").matches === true;
      if (!fine) return;
      e.preventDefault();
      onLongPress();
    },
  };
}
```

- [ ] **Step 4: Wire both tiles**

`image-tile.tsx` — import `useDesktopPress` beside `usePress`; in the component:

```ts
  const press = usePress({ onTap, onLongPress });
  const desktop = useDesktopPress({ onTap, onLongPress });
```

and on the wrapper `div`:

```tsx
    <div
      {...press}
      {...desktop}
      role="button"
      tabIndex={0}
      aria-label={item.title}
      className={cn(
        // `group` for the hover zoom below; `focus-visible` outline in the accent so a keyboard
        // reader can see where they are without the phone ever showing a ring.
        "group focus-visible:outline-accent relative block w-full cursor-pointer touch-manipulation overflow-hidden outline-none select-none focus-visible:outline-2 focus-visible:-outline-offset-2",
        aspectClass,
      )}
      style={{ WebkitTouchCallout: "none" }}
    >
```

and on the `<img>` add the hover zoom (the tile's `overflow-hidden` clips it, so neighbours
never move — the classic zoom-in-place; `hover:` is `@media (hover: hover)`-gated in v4, so a
touch screen never sees it):

```tsx
          className="pointer-events-none block h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
```

`article-card.tsx` — same imports; spread `{...desktop}` after `{...handlers}`; add
`role="button" tabIndex={0} aria-label={item.title}`; add to the class string:
`outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent hover:bg-ink/[5%]`.

The `<h2>` inside the article card still gives it a heading for screen readers; the
`aria-label` on the wrapper is what names the *button*.

- [ ] **Step 5: Run the tile tests and the feed/saved screens**

Run: `bun run vitest run src/components/feed src/components/saved src/hooks`
Expected: PASS. If `feed-screen.test.tsx` used `getByRole("img")` to find tiles, that still
works; if it counted `button`s, update the count — every tile is one now.

- [ ] **Step 6: Look at it**

At 1440: hover a tile — the picture eases in 3 %. Tab through the feed — an accent outline
follows; Enter opens the item. Right-click a tile — the item sheet, centered (Task 5); the
browser menu does not appear. On the phone (or DevTools device mode with touch emulation):
long-press still opens the sheet exactly once.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-press.ts src/components/feed
git commit -m "feat(feed): tiles take focus, Enter/Space, and a fine-pointer right-click for the item sheet"
```

---

### Task 9: The gallery answers Escape and the arrow keys

**Files:**
- Modify: `src/components/gallery/gallery-screen.tsx` (after the `advance` callback ~line 147)
- Modify: `src/components/gallery/gallery-screen.test.tsx` (the `describe("the rail")` block)

- [ ] **Step 1: Write the failing tests**

```tsx
    it("ArrowRight advances, ArrowLeft goes back, Escape leaves", () => {
      renderScreen();

      fireEvent.keyDown(window, { key: "ArrowRight" });
      tap();
      expect(screen.getByRole("heading", { name: "Plate r0", level: 1 })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "ArrowLeft" });
      expect(screen.getByRole("heading", { name: "Plate entry", level: 1 })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      // `useExitGallery` pushes `/i/<entry>` when the reader didn't arrive from the app.
      expect(pushMock).toHaveBeenCalledWith("/i/entry");
    });

    it("leaves the keys to the details sheet while it is open", () => {
      renderScreen();
      tap();
      tap(); // chrome up, then details
      fireEvent.keyDown(window, { key: "ArrowRight" });
      // Still on the entry: the sheet owns the keyboard while it's up.
      expect(screen.queryByRole("heading", { name: "Plate r0", level: 1 })).not.toBeInTheDocument();
    });
```

If `useExitGallery`'s `cameFromApp` reads `sessionStorage`, make sure the test's `beforeEach`
clears it (check what the existing exit tests do and copy that).

- [ ] **Step 2: Run to verify it fails**

Run: `bun run vitest run src/components/gallery/gallery-screen.test.tsx`
Expected: FAIL — the heading never changes.

- [ ] **Step 3: Add the listener**

In `gallery-screen.tsx`, after `openDetails` is defined and where `detailsOpen`, `advance` and
`exit` are all in scope:

```ts
  // Keyboard (docs/DESIGN_desktop-polish.md §4): the two things a desktop reader will try. On
  // `window`, because nothing in the gallery holds focus — the rail is a gesture surface, not a
  // control. While the details sheet is up it owns Escape (BottomSheet's own listener closes it),
  // and an arrow that changed the picture under an open sheet would be a surprise, so both are
  // ignored until it's gone.
  React.useEffect(() => {
    if (detailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") advance(1);
      else if (e.key === "ArrowLeft") advance(-1);
      else if (e.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailsOpen, advance, exit]);
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run vitest run src/components/gallery`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/gallery
git commit -m "feat(gallery): arrow keys move, Escape leaves"
```

---

### Task 10: A 1440 × 900 Playwright project and `desktop.spec.ts`

**Files:**
- Modify: `playwright.config.ts` (the `projects` array)
- Create: `e2e/desktop.spec.ts`

- [ ] **Step 1: Add the project**

```ts
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // The desktop spec has its own project below; everything else is the phone-shaped suite.
      testIgnore: /desktop\.spec\.ts$/,
    },
    {
      // The desktop pass (docs/DESIGN_desktop-polish.md §5): one laptop-sized viewport, one spec.
      // `Desktop Chrome`'s default is 1280×720, which is exactly the feed's three-to-four column
      // boundary — the assertions want to be unambiguously on the four-column side of it.
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testMatch: /desktop\.spec\.ts$/,
    },
  ],
```

- [ ] **Step 2: Write the spec**

`e2e/desktop.spec.ts` — modelled on `feed.spec.ts`'s setup, one serial describe, one user:

```ts
import { expect, test } from "@playwright/test";

import {
  cleanupSeeded,
  connect,
  inviteUser,
  openAuthSheet,
  seedFeedCorpus,
  signIn,
  type Connection,
} from "./support";

// The desktop pass, at 1440×900 (see playwright.config.ts's `desktop` project). Everything the
// phone suite asserts still holds in the `chromium` project; this file only checks what changes
// above `md` — docs/DESIGN_desktop-polish.md §5.

const EMAIL = `ambit-desktop-e2e-${Date.now()}@example.com`;
const PASSWORD = "correcthorse123";
const TOPICS = ["astronomy", "botany", "music"] as const;
const PREFIX = "e2e-desktop-";

let conn: Connection;

test.describe.serial("desktop", () => {
  test.beforeAll(async () => {
    conn = await connect();
    await seedFeedCorpus(conn, PREFIX, 60, TOPICS);
    inviteUser(EMAIL);
  });

  test.afterAll(async () => {
    await cleanupSeeded(conn, PREFIX);
  });

  test("sign-up card is centered, the feed packs four centered columns", async ({ page }) => {
    await page.goto("/");
    await openAuthSheet(page);

    // The auth panel is a centered card, not a bottom sheet, at this width.
    const sheet = page.getByTestId("auth-sheet");
    const box = (await sheet.boundingBox())!;
    expect(Math.round(box.width)).toBe(520);
    expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(2);

    await page.getByRole("button", { name: "First time? Create your account" }).click();
    await page.getByPlaceholder("What should we call you?").fill("Desktop E2E");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await page.waitForURL("/onboarding");
    for (const label of ["Astronomy", "Botany", "Music"]) {
      await page.getByRole("button", { name: label, pressed: false }).click();
    }
    await page.getByRole("button", { name: "Start exploring" }).click();
    await page.waitForURL("/feed");
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();

    // Four stacks, every one populated, inside a container no wider than 1120 and centered.
    const grid = page.getByTestId("feed-columns");
    await expect(grid.locator("> div")).toHaveCount(4);
    const perColumn = await grid
      .locator("> div")
      .evaluateAll((cols) => cols.map((c) => c.querySelectorAll("[data-feed-id]").length));
    expect(Math.min(...perColumn)).toBeGreaterThan(0);

    const gridBox = (await grid.boundingBox())!;
    expect(gridBox.width).toBeLessThanOrEqual(1120);
    expect(Math.abs(gridBox.x + gridBox.width / 2 - 720)).toBeLessThan(2);
  });

  test("right-click opens the item sheet as a centered dialog; Escape closes it", async ({
    page,
  }) => {
    // Playwright isolates storage per test; sign in again through the landing page.
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);
    const tile = page.locator("[data-feed-id] > *").first();
    await expect(tile).toBeVisible();

    await tile.click({ button: "right" });

    const panel = page.getByTestId("bottom-sheet-panel");
    await expect(panel.getByText("Save to collection")).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(Math.round(box.width)).toBe(520);
    expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThan(2);
    // Not anchored to the bottom edge.
    expect(box.y + box.height).toBeLessThan(900 - 40);

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });
});
```

`signIn(page, email, password)` in `support.ts` opens the auth sheet, fills the two fields,
clicks "Sign in" and waits for `/feed` — exactly the dance the second test needs.

- [ ] **Step 3: Run it**

```bash
lsof -ti:3000 | xargs -r kill   # a stale dev server is fine to reuse, a squatter is not
bun run e2e --project=desktop
```

Expected: 2 passed.

- [ ] **Step 4: Run the whole suite once**

Run: `bun run e2e`
Expected: green. A red `gallery.spec.ts:193` is the known accumulation flake (CLAUDE.md) —
check `main` before believing it; `bun run e2e:clean --confirm` clears it.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/desktop.spec.ts
git commit -m "test(e2e): a 1440×900 desktop project — four columns, centered dialog, Escape"
```

---

### Task 11: The record

**Files:**
- Modify: `docs/design_handoff_ambit_pwa_redesign/README.md` (the "Frame and canvas" bullet
  ~line 51)
- Modify: `CLAUDE.md` (the repository-status paragraph)
- Modify: `log.md` (today's entry)
- Delete: `desktop-feed.jpeg`, `desktop-item.jpeg`, `desktop-onboarding.jpeg`,
  `desktop-profile.jpeg`, `desktop-landing.png` (repo root, untracked)

- [ ] **Step 1: The handoff README**

Change the bullet to:

```
- Design viewport: **402 × 874** (iPhone 14/15 Pro logical size). The prototypes are
  mobile-only. **Above 768 px the app follows `docs/DESIGN_desktop-polish.md`** (09-08-26):
  the same compositions, capped and centered; sheets become dialogs. The prototypes remain the
  authority for everything below that width.
```

- [ ] **Step 2: `CLAUDE.md`**

Append to the repository-status paragraph, after the Loupe sentence:

```
**The desktop pass shipped 09-08-26** (`docs/DESIGN_desktop-polish.md`, plan
`docs/PLAN_desktop-polish.md`): one breakpoint (`md`, 768 px), one `Column` primitive
(600 / 720 / 1120), `useMediaQuery` on `useSyncExternalStore` so the server-rendered feed
hydrates straight into three or four columns, `BottomSheet` as a centered 520 px dialog above
`md`, tiles focusable with a fine-pointer right-click for the item sheet, and a `desktop`
Playwright project at 1440 × 900. Below 768 px nothing changed.
```

- [ ] **Step 3: `log.md`** — extend today's `### [[09-08-26 Tue]]` entry (create it under
  `## 2026-09` if absent) with a `**Shipped:**` block naming the five sections of the design,
  and a `**Decisions:**` block recording the three Ben made (grow-to-fit per screen; dialogs
  above `md`; input basics only). End with the session-spend line per CLAUDE.md's recipe —
  omit it if the script exits non-zero.

- [ ] **Step 4: Delete the screenshots, run everything**

```bash
rm -f desktop-feed.jpeg desktop-item.jpeg desktop-onboarding.jpeg desktop-profile.jpeg desktop-landing.png
bun run check
```

Expected: typecheck, lint, format and the unit suite all green.

- [ ] **Step 5: Commit**

```bash
git add docs/design_handoff_ambit_pwa_redesign/README.md CLAUDE.md log.md
git commit -m "docs: the desktop pass — handoff note, CLAUDE.md, log"
```

Then stop. Merging `feat/desktop-polish` into `main` is Ben's call, per the house convention.

---

## Self-review

- **Spec coverage.** §1 → Tasks 2, 7 (Column, GlassHeader, fixed bars). §2 → Tasks 1, 3, 4.
  §3 → Tasks 5, 6. §4 → Tasks 7 (hero), 8 (tiles), 9 (gallery). §5 → every task's tests plus
  Task 10; the out-of-scope list is enforced by absence.
- **Types.** `packColumns(tiles, columnCount = 2): FeedTile[][]` (Task 3) is what Task 4
  calls. `useColumnCount(): 2 | 3 | 4` (Task 1) indexes `GRID_COLS` (Task 4). `stubMatchMedia`
  returns `{ fire }` (Task 1) and is used that way in Tasks 4, 5, 8. `useDesktopPress` (Task 8)
  takes `UsePressOptions`, the existing exported type.
- **Known soft spots for the executor.** (a) Task 6's test has two "however the file does it"
  gaps by design — the landing test file's render helper is the right tool and inventing a
  second one is wrong. (b) Task 8's `card()` fixture should be copied from `masonry.test.ts`,
  not imported. (c) If `feed-screen.tsx` chooses `pair` in a way that differs from the
  one-liner in Task 5 Step 4, keep its structure and only add the `isDesktop` branch first.
  (d) `Column` has no `"use client"` and needs none — it is a plain `div`, usable from the
  server-rendered item page and every client screen alike.
