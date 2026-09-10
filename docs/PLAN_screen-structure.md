# Screen structure — the merged item screen, one New-collection row, the living landing slideshow — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-10-26 by Fable 5.1, from the design doc below and a read of every file named
here at `main` = `8461f72`. **For:** a cold session on a cheaper model, on a plain branch off
`main` (Ben's convention — no worktree).

**Goal:** the item page *is* the immersive screen (rail hero, square-cornered and as big as it
can be, details below on scroll, Escape and a down-flick back to the feed); every collection
picker can make a collection; the landing slideshow keeps cycling, answers clicks and arrows,
and its glyph works.

**Architecture:** `/i/[itemId]` renders a new client `ItemScreen` for images: a `HeroRail`
(the gallery's three-cell track, with the strip's height following the loaded picture and the
chrome placed below or over it accordingly) above an `ItemFacts` block in the reader column.
`/g/` redirects. The gallery's rail state, gesture hook, chrome cycle and sheets are lifted, not
rewritten — the hook loses its details zone and swaps an up-flick for a down-flick-at-top. A
`NewCollectionRow` in the shared `collection-rows.tsx` is the one create form. `useSlideshow`
wraps instead of ending, and reduced-motion is read after hydration like everything else on the
landing screen.

**Tech Stack:** Next.js 16.2 App Router, React 19, tRPC + React Query v5, Drizzle, Tailwind v4,
Vitest 4 (+ jsdom), Playwright 1.62, Bun 1.4. **No new dependencies.**

**Spec:** `docs/DESIGN_screen-structure.md` — read it first. The six decisions there are the
spec; this plan is how.

## Global Constraints

- **Branch off `main`, plain branch, no worktree.** Commit after every task with the message
  given; `git status -sb` must not read `[ahead N]` when the phase is declared done — push.
- **TDD every task**: write the test, run it and watch it fail for the right reason, then the
  code. `bun run vitest run <file>` runs one file; `bun run test` the suite; `bun run check` is
  typecheck + lint + format + tests and must be green before the final push (see the known-red
  note below).
- **`bun run e2e:prod`** is the e2e suite (production build). Playwright's `chromium` project is
  402 × 874; `desktop` is 1440 × 900. If `feed.spec.ts:152` ("scrolling appends another page")
  goes red in the full run, re-run with `E2E_PROD=1 bunx playwright test --workers=1` — it is a
  three-worker contention flake (log 09-10), not evidence about this branch.
- **Known red, not yours:** `source-invariants.test.ts` fails on one 70sscifiart row whose
  summary contains a literal `<details>`. It fails on `main` too. Ignore it.
- **Never `preventDefault` on a pointer move** in a gesture hook (the rule `use-swipe-back.ts`
  and `use-rail-gestures.ts` both state). The track declares `touch-action: pan-y`; that is how
  vertical scrolling stays the browser's.
- **The hero is a plain `<img>`, never `next/image`**, wrapped in **no anchor**, with **no
  `-webkit-touch-callout: none`** — `image-item-body.tsx`'s header explains the iOS "Add to
  Photos" reason; keep that comment in `hero-rail.tsx`.
- **Swiping the rail marks nothing seen.** Nothing in this plan touches `seen_item`, and the e2e
  that proves it is kept (Task 7).
- **Comment generously.** Ben reads this repo to learn it; match the density of the files you
  edit (`gallery-screen.tsx` is the register).
- **`docs/` is excluded from the production image.** Nothing production needs may live there.

---

## File map

| file | task | responsibility |
|---|---|---|
| `src/server/services/gallery-rail.ts` (+ integration test) | 1 | `RailItem.body`, `RailItem.topicLabel`, exported `railItemFrom` |
| `src/components/item/item-facts.tsx` (+ test) | 2 | title, maker, credit, summary, facts table, PDR body, link-out — from a `RailItem` |
| `src/hooks/use-rail-gestures.ts` (+ test) | 3 | horizontal rail; down-flick-at-top exit; no details zone; `pan-y` |
| `src/hooks/use-chrome-cycle.ts` (+ test) | 4 | `show()` |
| `src/components/item/hero-rail.tsx` (+ test) | 5 | the strip: track, height-follows-picture, chrome placement |
| `src/components/item/item-screen.tsx` (+ test), `src/app/i/[itemId]/page.tsx`, `src/app/g/[itemId]/page.tsx`, `src/components/item/item-shell.tsx`; delete the gallery files | 6 | the screen; the redirect; Escape for articles |
| `e2e/item.spec.ts`, `e2e/desktop.spec.ts`; delete `e2e/gallery.spec.ts` | 7 | the flows |
| `src/components/sheets/collection-rows.tsx` (+ test), `src/components/profile/new-collection-sheet.tsx` | 8 | `NewCollectionRow`; the profile sheet reuses it |
| `src/components/sheets/item-sheet.tsx`, `save-to-collection-sheet.tsx`, `collections-sheet.tsx`, `sheets.test.tsx`, `src/components/feed/feed-screen.tsx`, `src/app/feed/page.tsx`, `e2e/feed.spec.ts` | 9 | the row in three pickers; Share in the tile sheet |
| `src/components/landing/use-slideshow.ts`, `landing-screen.tsx`, `landing-slideshow.tsx` (+ tests), `e2e/home.spec.ts` | 10 | wrap forever, `advance`, `onFirstPass`, keys, the hydration fix |
| `CLAUDE.md`, `SPEC.md`, `docs/design_handoff_ambit_pwa_redesign/README.md`, `log.md` | 11 | the words |

---

### Task 1: `RailItem` learns `body` and `topicLabel`

**Files:**
- Modify: `src/server/services/gallery-rail.ts:75-89` (the interface), `:318-330` (`toRailItem`), `:244-258` (the loop)
- Modify: `src/server/api/routers/routers.integration.test.ts` (the `items.galleryRail` describe, ~`:781`)

**Interfaces:**
- Produces: `RailItem` gains `body: string | null` and `topicLabel: string | null`.
  `export function railItemFrom(row: Item, topicLabel: string | null, step?: RailStep): RailItem`
  — the one place an `Item` row becomes a rail cell (the `/g/` page has a private copy today;
  Task 6 deletes it). `getGalleryRail` resolves every drawn row's label in one query.

- [ ] **Step 1: Write the failing integration test.** In `routers.integration.test.ts`, inside
  `describe("items.galleryRail", …)`, after "serves an anonymous caller image rows only":

```ts
    it("carries each cell's body and topic label, so the merged item screen can render it whole", async () => {
      const rail = await createCaller(anonContext()).items.galleryRail({
        itemId: plateOneId,
      });
      // The fixtures live in topicA ("Test router topic A") and have no body; a real PDR row would
      // carry an essay. What is pinned is the *shape*: both fields present, the label resolved
      // from the `topic` table rather than from the sixteen-entry config (a grown topic printed
      // its bare slug through the gallery's details sheet until 09-10-26).
      for (const cell of rail) {
        expect(cell).toHaveProperty("body");
        expect(cell).toHaveProperty("topicLabel");
        if (cell.topicId === topicA) expect(cell.topicLabel).toBe("Test router topic A");
      }
    });
```

- [ ] **Step 2: Run — fails** (`topicLabel` undefined):
  `bun run vitest run src/server/api/routers/routers.integration.test.ts -t "carries each cell"`

- [ ] **Step 3: Extend the interface.** In `gallery-rail.ts` replace the `RailItem` interface with:

```ts
/** One rail cell: everything the merged item screen renders for a picture, and nothing else. All
 *  of it public item data — this shape crosses to anonymous visitors. */
export interface RailItem {
  id: string;
  title: string;
  attribution: string | null;
  imageUrl: string | null;
  summary: string | null;
  /** A stored essay (a Public Domain Review collection's own text, 09-02-26) — rendered under the
   *  picture by `ItemFacts`, null for every other source. */
  body: string | null;
  source: string;
  sourceUrl: string;
  license: string | null;
  /** The display topic (Cut 1: nullable — an un-homed picture opened by link, or drawn by a
   *  wildcard slot, has none). `ItemFacts` omits its Topic row rather than inventing one. */
  topicId: string | null;
  /** `topic.label` for `topicId`, resolved here so the client never has to — the config only
   *  knows the sixteen originals, and since 09-10-26 most topics are grown. Null with `topicId`. */
  topicLabel: string | null;
  /** Only populated when the server's debug flag is on (see `getGalleryRail`). */
  debug?: { via: RailVia; topic: string | null };
}
```

- [ ] **Step 4: Replace `toRailItem` with an exported `railItemFrom`.** Delete the private
  `toRailItem` at the bottom of the file and add, in its place:

```ts
/**
 * Narrow a full `item` row to the rail's public shape. `knobs` never travels; ids and copy do.
 * Exported because the item page needs the entry picture in exactly this shape (it is cell zero
 * of the rail it renders), and one function is how the two stay identical.
 */
export function railItemFrom(
  row: Item,
  topicLabel: string | null,
  step?: RailStep,
): RailItem {
  return {
    id: row.id,
    title: row.title,
    attribution: row.attribution,
    imageUrl: row.imageUrl,
    summary: row.summary,
    body: row.body,
    source: row.source,
    sourceUrl: row.sourceUrl,
    license: row.license,
    topicId: row.topicId,
    topicLabel,
    ...(step ? { debug: { via: step.via, topic: step.topic } } : {}),
  };
}

/**
 * `topic.label` for each id, in one query. The rail draws eight rows a batch; eight round trips
 * for eight labels would be the wrong shape, and `getTopicLabel` (one id) is for the save toast.
 */
export async function topicLabelsFor(
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const { db } = await import("~/server/db/client");
  const { topic } = await import("~/server/db/schema");
  const { inArray } = await import("drizzle-orm");
  const rows = await db
    .select({ id: topic.id, label: topic.label })
    .from(topic)
    .where(inArray(topic.id, wanted));
  return new Map(rows.map((r) => [r.id, r.label]));
}
```

  Then in `getGalleryRail`, change the loop to collect rows first and label them after:

```ts
  const drawnRows: { row: Item; step: RailStep }[] = [];
  for (const step of steps) {
    const drawn = await drawForStep(step, anchor, taken, rng);
    if (!drawn) break;
    taken.push(drawn.id);
    drawnRows.push({ row: drawn, step });
  }

  // One label query for the whole batch — see `topicLabelsFor`.
  const labels = await topicLabelsFor(drawnRows.map((d) => d.row.topicId));
  return drawnRows.map(({ row, step }) =>
    railItemFrom(
      row,
      row.topicId ? (labels.get(row.topicId) ?? null) : null,
      debugEnabled ? step : undefined,
    ),
  );
```

  (Delete the old `const rows: RailItem[] = []` / `rows.push(...)` / `return rows;` lines the
  new block replaces. Keep the comments above the loop about `taken` — they still apply.)

- [ ] **Step 5: Run — passes.** Then `bun run vitest run src/server/services/gallery-rail.test.ts`
  (the pure-walk tests; untouched, must stay green) and `bun run typecheck` — **fails** in
  `src/app/g/[itemId]/page.tsx` (its private `toRailItem` no longer satisfies `RailItem`) and in
  `src/components/gallery/gallery-screen.test.tsx` (the fixture is short two fields). Both files
  die in Task 6. Add `body: null, topicLabel: null,` to the `/g/` page's `toRailItem` return and
  to `gallery-screen.test.tsx`'s `railItem` fixture now, so this commit typechecks.

- [ ] **Step 6: Commit.**

```bash
bun run format:write
git add src/server/services/gallery-rail.ts src/server/api/routers/routers.integration.test.ts 'src/app/g/[itemId]/page.tsx' src/components/gallery/gallery-screen.test.tsx
git commit -m "feat(rail): RailItem carries body and topicLabel; railItemFrom is the one row→cell function"
```

---

### Task 2: `ItemFacts` — the details block, from a `RailItem`

**Files:**
- Create: `src/components/item/item-facts.tsx`
- Create: `src/components/item/item-facts.test.tsx`
- Modify: `src/components/item/reuse-notice.tsx` (takes `{ source, sourceUrl, body }` instead of an `Item`)

**Interfaces:**
- Produces: `export function ItemFacts({ item }: { item: RailItem })` — an `<article>` with the
  `<h1>`, the maker line, `CreditLine`, the summary, a `<dl>` of facts (Maker / From / License /
  Topic / Debug, each omitted when null), the PDR notice + `ReaderBlocks` when `body`, and
  `LinkOutRow`. `ReuseNotice`'s prop becomes `item: Pick<Item, "source" | "sourceUrl" | "body">`
  (a `RailItem` satisfies it).

- [ ] **Step 1: Write the failing test** `src/components/item/item-facts.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RailItem } from "~/server/services/gallery-rail";
import { ItemFacts } from "./item-facts";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The text half of what was `ImageItemBody`, plus the gallery details sheet's facts table, in one
// block that renders for whichever rail cell is current. Pure: no queries, no router.
const cell = (over: Partial<RailItem> = {}): RailItem => ({
  id: "item-1",
  title: "A plate",
  attribution: "An engraver",
  imageUrl: "https://example.test/plate.jpg",
  summary: "A caption.",
  body: null,
  source: "met",
  sourceUrl: "https://example.test/o/1",
  license: "CC0",
  topicId: "botany",
  topicLabel: "Botany",
  ...over,
});

describe("ItemFacts", () => {
  it("titles the block, names the maker once, credits the source, and prints the summary", () => {
    render(<ItemFacts item={cell()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("A plate");
    expect(screen.getByText("An engraver")).toBeInTheDocument();
    expect(screen.getByText("A caption.")).toBeInTheDocument();
    // The credit line's link — `from: The Met` — is the one link out for a museum source.
    expect(screen.getByRole("link", { name: /Met/ })).toHaveAttribute(
      "href",
      "https://example.test/o/1",
    );
  });

  it("drops the maker line when attribution merely repeats the source label", () => {
    // A blog's attribution IS the blog (Phase 6.3); saying it twice reads as a bug.
    render(<ItemFacts item={cell({ source: "doorofperception", attribution: "Door of Perception" })} />);
    expect(screen.getAllByText("Door of Perception")).toHaveLength(1);
  });

  it("lists the facts the corpus actually knows, and omits the ones it does not", () => {
    render(<ItemFacts item={cell()} />);
    const dl = screen.getByRole("list", { name: "About this work" });
    expect(dl).toHaveTextContent("License");
    expect(dl).toHaveTextContent("CC0");
    expect(dl).toHaveTextContent("Topic");
    expect(dl).toHaveTextContent("Botany");
  });

  it("omits the Topic row for an un-homed picture (Cut 1) and the License row when there is none", () => {
    render(<ItemFacts item={cell({ topicId: null, topicLabel: null, license: null })} />);
    const dl = screen.getByRole("list", { name: "About this work" });
    expect(dl).not.toHaveTextContent("Topic");
    expect(dl).not.toHaveTextContent("License");
    // "From" is unconditional: every item has a source.
    expect(dl).toHaveTextContent("From");
  });

  it("shows the debug row only when the server sent one", () => {
    render(<ItemFacts item={cell({ debug: { via: "drift", topic: "flowers" } })} />);
    expect(screen.getByText(/drift · flowers/)).toBeInTheDocument();
  });

  it("typesets a stored PDR body under the summary and introduces it with the CC BY-SA notice", () => {
    render(
      <ItemFacts
        item={cell({
          source: "pdr",
          sourceUrl: "https://publicdomainreview.org/collection/x",
          body: "## A heading\n\nA paragraph of essay.",
        })}
      />,
    );
    expect(screen.getByText(/CC BY-SA 4.0/)).toBeInTheDocument();
    expect(screen.getByText("A paragraph of essay.")).toBeInTheDocument();
  });

  it("renders the link-out row for a blog and none for a museum", () => {
    const { rerender } = render(<ItemFacts item={cell({ source: "doorofperception" })} />);
    expect(screen.getByRole("link", { name: /Read on|Open/ })).toBeInTheDocument();
    rerender(<ItemFacts item={cell()} />);
    expect(screen.queryByRole("link", { name: /Read on|Open/ })).toBeNull();
  });
});
```

  Before running, read `link-out-row.tsx:24-47` for the row's real accessible name and fix the
  regex in the last test to match it exactly (it is a single `<a>`; use its text).

- [ ] **Step 2: Run — fails** (module not found):
  `bun run vitest run src/components/item/item-facts.test.tsx`

- [ ] **Step 3: Loosen `ReuseNotice`.** In `reuse-notice.tsx` replace the props interface with:

```ts
export interface ReuseNoticeProps {
  /** Only the three fields it reads — a `RailItem` (the merged item screen) satisfies this as
   *  readily as an `Item` (the reader page). */
  item: Pick<Item, "source" | "sourceUrl" | "body">;
}
```

  (Its body already reads only those three; `ReaderItemBody`'s existing call is unchanged.)

- [ ] **Step 4: Write `src/components/item/item-facts.tsx`:**

```tsx
import { sourceLabel } from "~/lib/source-label";
import type { RailItem } from "~/server/services/gallery-rail";
import { CreditLine } from "./credit-line";
import { LinkOutRow } from "./link-out-row";
import { ReaderBlocks } from "./reader-blocks";
import { ReuseNotice } from "./reuse-notice";

// Everything the merged item screen says about the picture above it (09-10-26,
// docs/DESIGN_screen-structure.md §1). Two ancestors folded into one block:
//
//   - `ImageItemBody`'s text half — title, maker, credit line, summary, a PDR essay, the link-out.
//   - the gallery details sheet's facts table — Maker / From / License / Topic, each row **omitted
//     entirely when null** rather than rendered empty. A table with three rows tells the reader the
//     corpus knows three things; a table with three blanks tells them something is broken. (The
//     prototype's rows were Medium / Origin / Where it lives, three fields the `item` table never
//     carried; these four are the facts that are actually true.)
//
// It takes a `RailItem`, not an `Item`, because it renders for whichever cell of the rail is under
// the reader's finger — and a `RailItem` is exactly the public projection every visitor may see.
// Pure: no queries, no router, no state. `WanderNext` and `JoinCta` sit below it in `ItemScreen`.
export interface ItemFactsProps {
  item: RailItem;
}

/**
 * One row of the facts table. Rendered only by callers that have something to put in it — the
 * null-check lives at the call site so an absent fact costs no row at all.
 */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-hairline border-ink/8 flex gap-3 border-t py-[11px]">
      <dt className="text-ink/40 w-[88px] shrink-0 text-[11px] font-semibold tracking-[0.6px] uppercase">
        {label}
      </dt>
      <dd className="text-ink/82 min-w-0 flex-1 text-[15.5px] leading-[1.45]">
        {children}
      </dd>
    </div>
  );
}

export function ItemFacts({ item }: ItemFactsProps) {
  // Whoever the source names as maker — unless that is just the source's own name again, in which
  // case the credit line already says it and saying it twice reads as a bug (Phase 6.3: a blog's
  // attribution IS the blog).
  const label = sourceLabel(item.source);
  const maker =
    item.attribution && item.attribution !== label ? item.attribution : null;

  return (
    <article>
      {/* Stays an `<h1>`: it's the page's actual subject, and e2e leans on it. */}
      <h1 className="text-ink-hi mt-[20px] text-[28px] leading-[1.16] font-semibold">
        {item.title}
      </h1>

      {maker ? (
        <p className="text-ink/50 mt-[8px] text-[13px]">{maker}</p>
      ) : null}

      <CreditLine source={item.source} sourceUrl={item.sourceUrl} />

      {item.summary ? (
        <p className="text-ink/72 mt-[18px] text-[17px] leading-[1.6]">
          {item.summary}
        </p>
      ) : null}

      {/* The facts table. `role="list"` + a name so a test (and a screen reader) can find the
          table as a unit; a bare `<dl>` has no accessible name to ask for. */}
      <dl aria-label="About this work" role="list" className="mt-[22px]">
        {maker ? <Fact label="Maker">{maker}</Fact> : null}

        <Fact label="From">
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            {label}
          </a>
        </Fact>

        {item.license ? <Fact label="License">{item.license}</Fact> : null}

        {/* Omitted when un-homed (Cut 1): a picture no topic fits has no topic yet. */}
        {item.topicId !== null ? (
          <Fact label="Topic">{item.topicLabel ?? item.topicId}</Fact>
        ) : null}

        {/* SPEC §9's standing dev-overlay rule, this screen's slice of it: how the rail's walk
            reached this picture. Present only when the server's FEED_DEBUG gate is on. */}
        {item.debug ? (
          <Fact label="Debug">
            {item.debug.via} · {item.debug.topic ?? "—"}
          </Fact>
        ) : null}
      </dl>

      {/* An image item that also carries text — a Public Domain Review collection's own essay
          (docs/PLAN_publicdomainreview.md §1). The reader variant's parser and type ramp are
          reused so the two pages read as one app; the notice above it is what PDR's CC BY-SA
          terms ask for. */}
      {item.body ? (
        <>
          <ReuseNotice item={item} />
          <div className="bg-ink/10 mt-[14px] h-[0.5px] w-full" />
          <div className="mt-[20px]">
            <ReaderBlocks body={item.body} />
          </div>
        </>
      ) : null}

      {/* Blog items only (renders null otherwise): the link-out that makes the card a preview. */}
      <LinkOutRow source={item.source} sourceUrl={item.sourceUrl} />
    </article>
  );
}
```

- [ ] **Step 5: Run — passes.** `bun run vitest run src/components/item` — every existing item
  test still green (`ImageItemBody` is untouched until Task 6).

- [ ] **Step 6: Commit.**

```bash
bun run format:write
git add src/components/item/item-facts.tsx src/components/item/item-facts.test.tsx src/components/item/reuse-notice.tsx
git commit -m "feat(item): ItemFacts — the details block from a RailItem, facts table included"
```

---

### Task 3: The gesture hook — details zone out, down-flick-at-top exit in

**Files:**
- Modify: `src/hooks/use-rail-gestures.ts`
- Modify: `src/hooks/use-rail-gestures.test.tsx`

**Interfaces:**
- Produces: `UseRailGesturesOptions = { onTap; onAdvance(dir); onExit }` — `onOpenDetails` is
  gone. The track must carry `touch-action: pan-y` (was `none`). The exit is a downward flick
  (`> EXIT_FAST_PX` in `< EXIT_FAST_MS`) that began with `window.scrollY === 0`, or any two-finger
  movement. Everything horizontal is unchanged.

- [ ] **Step 1: Rewrite the test's `exit` and `details` describes.** Delete
  `describe("details", …)` entirely, remove `onOpenDetails` from the mocks, the `Track`
  component and every `expect(onOpenDetails)`. Replace `describe("exit", …)` with:

```tsx
  describe("exit", () => {
    // The screen scrolls now (the details live under the picture), so the exit had to move off
    // the up-flick — a fast upward move is also how you start scrolling, and Chrome hands the
    // touch to native scrolling mid-gesture. Down, at the top of the page, is unambiguous: the
    // browser has nowhere to scroll, and it is iOS Photos' own dismiss.
    beforeEach(() => {
      Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    });

    it("takes a quick downward flick when the page is at the top", () => {
      fire("pointerdown", { x: 200, y: 200, at: 0 });
      fire("pointermove", { x: 200, y: 300, at: 150 });
      fire("pointerup", { x: 200, y: 300, at: 150 }); // 100px in 150ms

      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it("ignores the same flick when the page is scrolled — that is a scroll back up", () => {
      Object.defineProperty(window, "scrollY", { value: 40, configurable: true });
      fire("pointerdown", { x: 200, y: 200, at: 0 });
      fire("pointermove", { x: 200, y: 300, at: 150 });
      fire("pointerup", { x: 200, y: 300, at: 150 });

      expect(onExit).not.toHaveBeenCalled();
    });

    it("ignores a slow downward drag at the top — that is overscroll, or a reader thinking", () => {
      fire("pointerdown", { x: 200, y: 200, at: 0 });
      fire("pointermove", { x: 200, y: 400, at: 900 });
      fire("pointerup", { x: 200, y: 400, at: 900 }); // 200px in 900ms: far, but slow

      expect(onExit).not.toHaveBeenCalled();
    });

    it("never exits on an upward move of any speed — up is the browser's scroll", () => {
      fire("pointerdown", { x: 200, y: 300, at: 0 });
      fire("pointermove", { x: 200, y: 200, at: 150 });
      fire("pointerup", { x: 200, y: 200, at: 150 });

      expect(onExit).not.toHaveBeenCalled();
      expect(onTap).not.toHaveBeenCalled();
    });

    // iOS Safari fires `pointercancel` the moment it claims a multi-touch gesture for the system,
    // even under a restrictive `touch-action`. Discarding the gesture there threw the two-finger
    // exit away at exactly the moment it was recognised — which is why it "barely fires" on device.
    it("survives Safari cancelling the two-finger gesture out from under it", () => {
      fire("pointerdown", { x: 200, y: 400, id: 1 });
      fire("pointerdown", { x: 240, y: 400, id: 2 });
      fire("pointermove", { x: 200, y: 300, id: 1 });
      fire("pointercancel", { x: 200, y: 300, id: 1 });

      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it("still discards a cancelled single-finger gesture — under pan-y that is the browser taking a scroll", () => {
      fire("pointerdown", { x: 200, y: 400 });
      fire("pointermove", { x: 200, y: 200 });
      fire("pointercancel", { x: 200, y: 200 });

      expect(onExit).not.toHaveBeenCalled();
      expect(onTap).not.toHaveBeenCalled();
    });

    it("takes any two-finger movement, and ignores a two-finger rest", () => {
      fire("pointerdown", { x: 200, y: 400, id: 1 });
      fire("pointerdown", { x: 240, y: 400, id: 2 });
      fire("pointermove", { x: 200, y: 300, id: 1 });
      fire("pointerup", { x: 200, y: 300, id: 1 });
      expect(onExit).toHaveBeenCalledTimes(1);

      fire("pointerdown", { x: 200, y: 400, id: 1 });
      fire("pointerdown", { x: 240, y: 400, id: 2 });
      fire("pointerup", { x: 200, y: 400, id: 1 });
      expect(onExit).toHaveBeenCalledTimes(1);
      expect(onTap).not.toHaveBeenCalled();
    });
  });
```

  In the `advance` describe, the test "locks to horizontal on the first real movement" asserts
  `expect(onOpenDetails).not.toHaveBeenCalled()` — delete that one line.

- [ ] **Step 2: Run — fails** (the hook still exits on up, ignores down):
  `bun run vitest run src/hooks/use-rail-gestures.test.tsx`

- [ ] **Step 3: Change the hook.** In `use-rail-gestures.ts`:
  - Delete the constants `DETAILS_ZONE`, `DETAILS_PX`, `EXIT_FAR_PX` and their comments. Keep
    `EXIT_FAST_PX = 80` / `EXIT_FAST_MS = 320`; rewrite their comment:

```ts
/**
 * The exit: a quick **downward** flick, this much travel inside {@link EXIT_FAST_MS}, that began
 * with the page scrolled to the top.
 *
 * Down, not up, since the screen merge (09-10-26, docs/DESIGN_screen-structure.md decision 4).
 * The picture now sits on top of a page you scroll — the details are under it — so an upward
 * move is the browser's, and the track says so with `touch-action: pan-y`. A downward move at
 * scroll position 0 is the one vertical gesture the browser has no use for, which is exactly why
 * iOS Photos uses it to dismiss. There is deliberately no slow far-drag path any more: a slow
 * downward drag at the top is overscroll, and the two would fight.
 */
const EXIT_FAST_PX = 80;
const EXIT_FAST_MS = 320;
```

  - Remove `onOpenDetails` from `UseRailGesturesOptions` (and its doc line), from the `handlers`
    ref, and from the destructured params. Update the `onExit` doc: `/** A quick downward flick
    from the top of the page, or any two-finger movement. */`.
  - Update the `ref` doc: `/** Spread onto the track element — it must also carry
    \`touch-action: pan-y\`. */` and the header comment's "The track carries `touch-action: none`"
    sentence to: "The track carries `touch-action: pan-y` instead, which tells the browser up
    front that vertical panning is its own and horizontal is ours — declared rather than fought
    for. Under `pan-y` the browser may fire `pointercancel` once it commits to a scroll; a
    single-finger cancel is therefore discarded, exactly as an interruption is."
  - In `down`, replace `startFraction` with `atTop`: delete the `startFraction` declaration and
    assignment, add `let atTop = false;` beside the other locals and `atTop = window.scrollY <= 0;`
    where `startFraction` was set. Delete the `rect` line if nothing else uses it.
  - In `up`, replace the whole `if (lockedAxis === "y" && dy < 0) { … }` block with:

```ts
      if (lockedAxis === "y") {
        // Only a downward flick, only from the top of the page, only fast. See EXIT_FAST_PX.
        const fast = dy > EXIT_FAST_PX && elapsed < EXIT_FAST_MS;
        if (dy > 0 && atTop && fast) cb.onExit();
        return;
      }
```

  - In `move`, the comment "A vertical drag is on its way to being an exit or a details-open"
    becomes "A vertical drag is either the browser's scroll or an exit flick".

- [ ] **Step 4: Run — passes.** Also `bun run vitest run src/components/gallery` — the gallery
  screen test still compiles against `onOpenDetails`? It does not call the hook directly; it
  fires pointer events on the track. Its "tapping the title block opens details" cases now fail
  because `GalleryScreen` passes `onOpenDetails` — **that is expected and temporary**: Task 6
  deletes the gallery. To keep this commit typechecking, remove the `onOpenDetails: openDetails,`
  line from `gallery-screen.tsx:194` (the up-drag-from-the-bottom-third path is gone; the title
  block's `onClick` still opens details there until the file dies).

- [ ] **Step 5: Typecheck + commit.**

```bash
bun run typecheck && bun run format:write
git add src/hooks/use-rail-gestures.ts src/hooks/use-rail-gestures.test.tsx src/components/gallery/gallery-screen.tsx
git commit -m "feat(gestures): the rail exits on a down-flick at the top, not an up-flick; details zone retired; pan-y"
```

---

### Task 4: `useChromeCycle.show()`

**Files:**
- Modify: `src/hooks/use-chrome-cycle.ts`
- Modify: `src/hooks/use-chrome-cycle.test.tsx`

**Interfaces:**
- Produces: `ChromeCycle` gains `show: () => void` — visible now, phase restarted. `toggle` and
  `reset` unchanged.

- [ ] **Step 1: Failing test.** Read the existing file's `describe`/`renderHook`/fake-timer
  shape (it is 90 lines) and add beside "toggle flips immediately…":

```tsx
  it("show makes the chrome visible now and restarts the phase — a mouse moving is not a tap", () => {
    const { result } = renderHook(() => useChromeCycle());
    expect(result.current.visible).toBe(false);

    act(() => result.current.show());
    expect(result.current.visible).toBe(true);

    // Already visible: show() is idempotent on `visible`, but still restarts the ten seconds.
    act(() => vi.advanceTimersByTime(6_000));
    act(() => result.current.show());
    act(() => vi.advanceTimersByTime(6_000));
    expect(result.current.visible).toBe(true); // 12s since the first show, 6s since the second

    act(() => vi.advanceTimersByTime(4_000));
    expect(result.current.visible).toBe(false);
  });
```

- [ ] **Step 2: Run — fails** (`show is not a function`):
  `bun run vitest run src/hooks/use-chrome-cycle.test.tsx`

- [ ] **Step 3: Implement.** In `use-chrome-cycle.ts` add to the interface:

```ts
  /** Show now, and start the next phase from here. For a mouse moving over the picture (desktop),
   *  which should summon the caption without ever hiding it the way a second tap does. */
  show: () => void;
```

  and in the hook body, beside `toggle`:

```ts
  const show = React.useCallback(() => {
    setVisible(true);
    setPhase((p) => p + 1);
  }, []);
```

  Return `{ visible, toggle, reset, show }`.

- [ ] **Step 4: Run — passes. Commit.**

```bash
git add src/hooks/use-chrome-cycle.ts src/hooks/use-chrome-cycle.test.tsx
git commit -m "feat(chrome): show() — a mouse over the picture summons the caption"
```

---

### Task 5: `HeroRail` — the strip

**Files:**
- Create: `src/components/item/hero-rail.tsx`
- Create: `src/components/item/hero-rail.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface HeroRailProps {
  /** The cell before, the cell under the reader, the cell after. An absent neighbour is an empty cell. */
  cells: readonly [RailItem | undefined, RailItem, RailItem | undefined];
  /** From `useRailGestures` — spread onto the track. */
  trackRef: React.RefObject<HTMLDivElement | null>;
  dragPx: number;
  dragging: boolean;
  /** The caption + pill, rendered by the screen; the strip decides where it goes and fades it. */
  chrome: React.ReactNode;
  chromeVisible: boolean;
  /** Desktop or not — passed in so the strip has no media query of its own to mock. */
  desktop: boolean;
}
```

  Exports `heroHeight(ratio: number | undefined, vw: number, vh: number, desktop: boolean): number`
  (pure — `vh` on desktop or when the ratio is unknown, else `min(vh, round(vw × ratio))`) and
  the component. The strip's root is `data-testid="hero-rail"` with `data-overlay="true|false"`;
  the track is `data-testid="gallery-track"` (the name every e2e already uses); the chrome
  wrapper is `data-testid="gallery-chrome"` with `aria-hidden` mirroring `!chromeVisible`.

- [ ] **Step 1: Failing test** `src/components/item/hero-rail.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import * as React from "react";

import type { RailItem } from "~/server/services/gallery-rail";
import { HeroRail, heroHeight } from "./hero-rail";

const cell = (id: string, over: Partial<RailItem> = {}): RailItem => ({
  id,
  title: `Plate ${id}`,
  attribution: null,
  imageUrl: `https://example.test/${id}.jpg`,
  summary: null,
  body: null,
  source: "met",
  sourceUrl: `https://example.test/o/${id}`,
  license: null,
  topicId: null,
  topicLabel: null,
  ...over,
});

function Harness({
  cells,
  desktop = false,
  chromeVisible = false,
}: {
  cells: readonly [RailItem | undefined, RailItem, RailItem | undefined];
  desktop?: boolean;
  chromeVisible?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  return (
    <HeroRail
      cells={cells}
      trackRef={ref}
      dragPx={0}
      dragging={false}
      chrome={<p>caption</p>}
      chromeVisible={chromeVisible}
      desktop={desktop}
    />
  );
}

/** jsdom's viewport is 1024×768 by default; the strip reads both on mount and on resize. */
function viewport(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true });
  act(() => void window.dispatchEvent(new Event("resize")));
}

/** Fires the picture's `load` with a natural size, which is how the strip learns its ratio. */
function loaded(img: HTMLElement, w: number, h: number) {
  Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
  fireEvent.load(img);
}

describe("heroHeight", () => {
  it("is the viewport height on desktop, whatever the picture", () => {
    expect(heroHeight(2, 1440, 900, true)).toBe(900);
    expect(heroHeight(undefined, 1440, 900, true)).toBe(900);
  });
  it("is the picture's own height on the phone, capped at the viewport", () => {
    expect(heroHeight(1, 402, 874, false)).toBe(402); // square → as tall as it is wide
    expect(heroHeight(0.5, 402, 874, false)).toBe(201); // landscape
    expect(heroHeight(3, 402, 874, false)).toBe(874); // tall → capped
  });
  it("is the viewport height while the ratio is unknown — the entry picture is preloaded, so that is a frame", () => {
    expect(heroHeight(undefined, 402, 874, false)).toBe(874);
  });
});

describe("HeroRail", () => {
  beforeEach(() => viewport(402, 874));

  it("renders the three cells, the current one alt-labelled, with no rounded corners and a pan-y track", () => {
    render(<Harness cells={[cell("a"), cell("b"), cell("c")]} />);
    const track = screen.getByTestId("gallery-track");
    expect(track.querySelectorAll("img")).toHaveLength(3);
    expect(track.style.touchAction).toBe("pan-y");
    const img = screen.getByAltText("Plate b");
    expect(img.className).not.toMatch(/rounded/);
    expect(img).toHaveAttribute("src", "/api/img/b");
  });

  it("renders an empty cell for an absent neighbour, so the end reads as an edge", () => {
    render(<Harness cells={[undefined, cell("b"), undefined]} />);
    expect(screen.getByTestId("gallery-track").querySelectorAll("img")).toHaveLength(1);
  });

  it("follows the current picture's height once it has loaded, and places the chrome below a short one", () => {
    render(<Harness cells={[undefined, cell("b"), undefined]} />);
    const strip = screen.getByTestId("hero-rail");
    // Unknown ratio: full height, chrome overlaid.
    expect(strip.style.height).toBe("874px");
    expect(strip).toHaveAttribute("data-overlay", "true");

    loaded(screen.getByAltText("Plate b"), 1000, 1000); // square
    expect(strip.style.height).toBe("402px");
    expect(strip).toHaveAttribute("data-overlay", "false");
  });

  it("keeps a tall picture at the full viewport height with the chrome over it", () => {
    render(<Harness cells={[undefined, cell("b"), undefined]} />);
    loaded(screen.getByAltText("Plate b"), 1000, 2200);
    const strip = screen.getByTestId("hero-rail");
    expect(strip.style.height).toBe("874px");
    expect(strip).toHaveAttribute("data-overlay", "true");
  });

  it("is always the viewport height on desktop", () => {
    viewport(1440, 900);
    render(<Harness cells={[undefined, cell("b"), undefined]} desktop />);
    loaded(screen.getByAltText("Plate b"), 1000, 1000);
    expect(screen.getByTestId("hero-rail").style.height).toBe("900px");
    expect(screen.getByTestId("hero-rail")).toHaveAttribute("data-overlay", "true");
  });

  it("fades the chrome as one unit and makes it inert while hidden", () => {
    const { rerender } = render(<Harness cells={[undefined, cell("b"), undefined]} />);
    const chrome = screen.getByTestId("gallery-chrome");
    expect(chrome).toHaveAttribute("aria-hidden", "true");
    expect(chrome.style.visibility).toBe("hidden");

    rerender(<Harness cells={[undefined, cell("b"), undefined]} chromeVisible />);
    expect(chrome).toHaveAttribute("aria-hidden", "false");
    expect(chrome.style.visibility).toBe("visible");
    expect(chrome).toHaveTextContent("caption");
  });
});
```

- [ ] **Step 2: Run — fails** (module not found):
  `bun run vitest run src/components/item/hero-rail.test.tsx`

- [ ] **Step 3: Write `src/components/item/hero-rail.tsx`:**

```tsx
"use client";

import * as React from "react";

import type { RailItem } from "~/server/services/gallery-rail";

// The picture strip at the top of the merged item screen (09-10-26,
// docs/DESIGN_screen-structure.md §1) — the gallery's rail, moved out of a full-screen room and
// onto the top of a page you scroll.
//
// Three things it owns, and nothing else:
//
//   - **The track.** Three cells, one screen wide each, translated so the middle one is under the
//     reader; the drag rides on top in raw px. Lifted from `GalleryScreen` unchanged, except that
//     the track declares `touch-action: pan-y` — vertical panning is the browser's now, because
//     there is a page below the picture to pan to.
//   - **Its own height, which follows the picture.** `item` stores no dimensions, so each cell's
//     `<img onLoad>` records its natural ratio and the strip is `heroHeight()` of the current one:
//     a square plate is as tall as the screen is wide and the details start right under it; a
//     tall one fills the viewport. Transitioned on advance so the page slides rather than jumps.
//   - **Where the chrome goes.** Under a short picture the caption and pill are an ordinary block
//     *below* it; under a full-height one they overlay the bottom with the gallery's gradient.
//     `data-overlay` says which, for the tests and for anyone debugging why the pill moved.
//
// **The image is a plain `<img>`, in no anchor, with no `-webkit-touch-callout: none`.** The
// feed tiles set the callout (load-bearing there — iOS raises its own image menu partway through
// the long-press that opens the item sheet), so copying that block over is the obvious move and it
// would be a regression: leaving the callout alone is what gives the hero iOS's native "Add to
// Photos" on long-press (verified on device 08-20-26), and an anchor changes the callout iOS
// offers on the image inside it. `next/image` is out for the reason `image-tile.tsx` gives — the
// image hosts are an open, growing set.

export interface HeroRailProps {
  /** The cell before, the cell under the reader, the cell after. An absent neighbour is an empty cell. */
  cells: readonly [RailItem | undefined, RailItem, RailItem | undefined];
  /** From `useRailGestures` — spread onto the track. */
  trackRef: React.RefObject<HTMLDivElement | null>;
  dragPx: number;
  dragging: boolean;
  /** The caption + pill, rendered by the screen; the strip decides where it goes and fades it. */
  chrome: React.ReactNode;
  chromeVisible: boolean;
  /** Desktop or not — passed in so the strip has no media query of its own to mock. */
  desktop: boolean;
}

/** The rail is three screens wide and holds three cells; one screen is a third of it. */
const CELL = "33.3333%";

/**
 * How tall the strip is for a picture of `ratio` (natural height ÷ natural width). Pure, so the
 * rule is testable without a DOM: desktop is always the viewport height (decision 2 — full height,
 * edge to edge); the phone is the picture's own height at full width, capped at the viewport; an
 * unknown ratio is the viewport height, which is the safe placeholder for the one frame before the
 * entry picture (preloaded by the page) reports in.
 */
export function heroHeight(
  ratio: number | undefined,
  vw: number,
  vh: number,
  desktop: boolean,
): number {
  if (desktop || ratio === undefined) return vh;
  return Math.min(vh, Math.round(vw * ratio));
}

/** The viewport, re-read on resize. `innerHeight` rather than `100dvh` because the strip's height
 *  has to be a number the placement rule can compare against. */
function useViewport() {
  const read = () => ({ vw: window.innerWidth, vh: window.innerHeight });
  const [size, setSize] = React.useState(read);
  React.useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

export function HeroRail({
  cells,
  trackRef,
  dragPx,
  dragging,
  chrome,
  chromeVisible,
  desktop,
}: HeroRailProps) {
  const { vw, vh } = useViewport();
  // One ratio per cell id, learned from `onLoad`. A Map in state rather than a ref because the
  // strip's height is derived from it and must re-render when it changes.
  const [ratios, setRatios] = React.useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const learn = React.useCallback((id: string, ratio: number) => {
    setRatios((prev) => {
      if (prev.get(id) === ratio) return prev;
      const next = new Map(prev);
      next.set(id, ratio);
      return next;
    });
  }, []);

  const current = cells[1];
  const height = heroHeight(ratios.get(current.id), vw, vh, desktop);
  // Full-height picture → the caption overlays its foot. Anything shorter → the caption is a
  // block under it. `vh - 1` absorbs a rounding pixel.
  const overlay = height >= vh - 1;

  const chromeBlock = (
    <div
      data-testid="gallery-chrome"
      aria-hidden={!chromeVisible}
      className={overlay ? "pointer-events-none absolute inset-x-0 bottom-0" : ""}
      // **`visibility`, not `pointer-events`, is what makes it untappable while hidden.** An
      // ancestor's `pointer-events: none` can be overridden by any descendant that sets `auto` —
      // and `PillToolbar` does exactly that, on purpose, so its wrapper can span the screen
      // without eating scrolls. `visibility: hidden` cannot be overridden that way, and it
      // transitions discretely: flipping to visible takes effect at once, and back to hidden only
      // after the fade has finished. An invisible control that still takes taps is worse than no
      // control at all.
      style={{
        opacity: chromeVisible ? 1 : 0,
        transform: chromeVisible ? "none" : "translateY(10px)",
        visibility: chromeVisible ? "visible" : "hidden",
        transition: "opacity .6s ease, transform .6s ease, visibility .6s",
        ...(overlay
          ? {
              background:
                "linear-gradient(to top, rgba(11,10,8,0.94) 42%, transparent)",
              padding: "26px 24px 42px",
            }
          : { padding: "18px 24px 22px" }),
      }}
    >
      {/* Only the real targets inside take pointer events back (the screen sets
          `pointer-events-auto` on them) — the gradient stays inert, so a horizontal swipe low on
          the picture still reaches the track underneath rather than dying on a decoration. */}
      {chrome}
    </div>
  );

  return (
    <section
      data-testid="hero-rail"
      data-overlay={overlay}
      className="bg-immersive relative overflow-hidden"
      // `overscroll-behavior` here as well as on `main`: the down-flick exit must never also be a
      // pull-to-refresh, and iOS reads the property from the nearest scroll container it can find.
      style={{ overscrollBehaviorY: "contain" }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          height,
          // Slides rather than jumps between a square plate and a tall one on advance. Off while
          // dragging, like the track's own transform.
          transition: dragging ? "none" : "height .4s cubic-bezier(.22,.61,.36,1)",
        }}
      >
        <div
          ref={trackRef}
          data-testid="gallery-track"
          // `pan-y` declares that vertical panning belongs to the browser and horizontal to the
          // gesture hook — see `use-rail-gestures.ts` for why it never calls `preventDefault`.
          style={{
            touchAction: "pan-y",
            width: "300%",
            height: "100%",
            // -33.3333% of a 3-screen-wide rail is exactly one screen, which centres the middle
            // cell. The drag rides on top in raw px: the rail moves with the finger 1:1.
            transform: `translateX(calc(-${CELL} + ${dragPx}px))`,
            transition: dragging
              ? "none"
              : "transform .4s cubic-bezier(.22,.61,.36,1)",
            willChange: "transform",
          }}
          className="flex"
        >
          {cells.map((c, i) => (
            <div
              key={c?.id ?? `empty-${i}`}
              // Top-aligned (decision 2: no centring); the only inset is the notch.
              className="flex items-start justify-center"
              style={{
                flex: `0 0 ${CELL}`,
                height: "100%",
                paddingTop: "env(safe-area-inset-top, 0px)",
              }}
            >
              {c ? (
                <RailImage
                  item={c}
                  priority={i === 1}
                  onRatio={(r) => learn(c.id, r)}
                />
              ) : null}
            </div>
          ))}
        </div>

        {overlay ? chromeBlock : null}
      </div>

      {overlay ? null : chromeBlock}
    </section>
  );
}

/** One rail cell's picture. `pointer-events: none` — the track owns every pointer on the strip. */
function RailImage({
  item,
  priority,
  onRatio,
}: {
  item: RailItem;
  /** The cell under the reader: fetched ahead of everything else, like the old hero. */
  priority: boolean;
  onRatio: (ratio: number) => void;
}) {
  // Through the proxy, except for the inline `data:` pixels the e2e corpus seeds — same branch as
  // the feed's tiles. See `src/app/api/img/[itemId]/route.ts` for why the proxy exists at all.
  const src = item.imageUrl?.startsWith("data:")
    ? item.imageUrl
    : `/api/img/${item.id}`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={item.title}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onLoad={(e) => {
        const el = e.currentTarget;
        if (el.naturalWidth > 0) onRatio(el.naturalHeight / el.naturalWidth);
      }}
      // Phone: full width, its own height, whole, capped at the viewport, top-aligned inside the
      // cap. Desktop (`md:`): full viewport height, its own width, centred, edge to edge for a
      // landscape. **No radius** — decision 2. `object-top` keeps a capped tall plate against the
      // top of its box rather than floating in it.
      className="pointer-events-none block h-auto max-h-[100dvh] w-full object-contain object-top md:mx-auto md:h-[100dvh] md:w-auto md:max-w-full"
    />
  );
}
```

- [ ] **Step 4: Run — passes.** If the "fades the chrome" case fails on `style.visibility`, it is
  because jsdom drops unknown longhands from a `style` object; assert on `aria-hidden` only and
  keep `visibility` in the code.

- [ ] **Step 5: Commit.**

```bash
bun run format:write
git add src/components/item/hero-rail.tsx src/components/item/hero-rail.test.tsx
git commit -m "feat(item): HeroRail — the rail strip whose height follows the picture and whose chrome follows the height"
```

---

### Task 6: `ItemScreen`; the page; `/g/` redirects; the gallery files go

**Files:**
- Create: `src/components/item/item-screen.tsx`
- Create: `src/components/item/item-screen.test.tsx`
- Modify: `src/app/i/[itemId]/page.tsx`
- Modify: `src/app/g/[itemId]/page.tsx` (becomes a redirect)
- Modify: `src/components/item/item-shell.tsx` (Escape)
- Modify: `src/components/item/item-sections.test.tsx` (the `ImageItemBody's hero` describe goes)
- Delete: `src/components/gallery/gallery-screen.tsx`, `gallery-screen.test.tsx`,
  `gallery-details-sheet.tsx`, `use-exit-gallery.ts`, `use-exit-gallery.test.ts`,
  `gallery-origin.ts`, `gallery-origin.test.ts`, `src/components/item/hero-gallery-link.tsx`,
  `src/components/item/image-item-body.tsx`

**Interfaces:**
- Produces: `export function ItemScreen(props: ItemScreenProps)` with

```ts
export interface ItemScreenProps {
  entryItem: RailItem;
  /** Server-drawn first stretch of rail, entry item first. */
  initialRail: RailItem[];
  /** `items.wanderNext` for the entry item, resolved on the server so a cold link pays no client request. */
  initialWander: WanderRow[];
  authed: boolean;
  appUrl: string;
  viewerName?: string;
  /** `?from=` — the sharer's first name, already validated by the page. */
  sharedBy: string | null;
}
```

  The page hands `ItemShell` only articles now; images render `ItemScreen` directly (it owns its
  own pill and sheets). `ItemShell` gains a window Escape → `leave()`.

- [ ] **Step 1: Failing test** `src/components/item/item-screen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RailItem } from "~/server/services/gallery-rail";
import { ItemScreen } from "./item-screen";

// Composition, not logic: the rail's own draw is `services/gallery-rail`'s, the gestures are
// `use-rail-gestures.test.tsx`'s, the strip's sizing is `hero-rail.test.tsx`'s, and the facts
// block is `item-facts.test.tsx`'s. What is pinned here is the wiring between them.
const {
  railFetchMock,
  savedForItemMock,
  wanderQueryMock,
  invalidateMock,
  backMock,
  pushMock,
} = vi.hoisted(() => ({
  railFetchMock: vi.fn(),
  savedForItemMock: vi.fn(),
  wanderQueryMock: vi.fn(),
  invalidateMock: vi.fn().mockResolvedValue(undefined),
  backMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      items: { galleryRail: { fetch: railFetchMock } },
      saves: { forItem: { invalidate: invalidateMock } },
    }),
    items: { wanderNext: { useQuery: wanderQueryMock } },
    saves: {
      forItem: { useQuery: savedForItemMock },
      collections: { useQuery: () => ({ data: [], isLoading: false }) },
      saveToCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      createCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: backMock, push: pushMock }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const railItem = (id: string, over: Partial<RailItem> = {}): RailItem => ({
  id,
  title: `Plate ${id}`,
  attribution: `Engraver ${id}`,
  imageUrl: `https://example.test/${id}.jpg`,
  summary: null,
  body: null,
  source: "met",
  sourceUrl: `https://example.test/o/${id}`,
  license: null,
  topicId: "botany",
  topicLabel: "Botany",
  ...over,
});

const ENTRY = railItem("entry");
const RAIL = [ENTRY, ...Array.from({ length: 8 }, (_, i) => railItem(`r${i}`))];

function renderScreen(over: Partial<React.ComponentProps<typeof ItemScreen>> = {}) {
  return render(
    <ItemScreen
      entryItem={ENTRY}
      initialRail={RAIL}
      initialWander={[]}
      authed
      appUrl="https://ambit.test"
      sharedBy={null}
      {...over}
    />,
  );
}

const track = () => screen.getByTestId("gallery-track");
function pointer(type: string, x: number, y: number) {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(e, "pointerId", { value: 1 });
  Object.defineProperty(e, "timeStamp", { value: 0 });
  return e;
}
const send = (type: string, x: number, y: number) =>
  act(() => void track().dispatchEvent(pointer(type, x, y)));
const tap = () => {
  send("pointerdown", 100, 100);
  send("pointerup", 100, 100);
};
const key = (k: string) => act(() => void fireEvent.keyDown(window, { key: k }));
const swipe = (dx: number) => {
  send("pointerdown", 200, 400);
  send("pointermove", 200 + dx, 400);
  send("pointerup", 200 + dx, 400);
};

beforeEach(() => {
  railFetchMock.mockReset().mockResolvedValue([]);
  savedForItemMock.mockReturnValue({ data: undefined });
  wanderQueryMock.mockReturnValue({ data: [] });
  invalidateMock.mockClear();
  backMock.mockClear();
  pushMock.mockClear();
  sessionStorage.clear();
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { value: 400, configurable: true });
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  vi.spyOn(window.history, "replaceState");
});
afterEach(() => vi.restoreAllMocks());

describe("ItemScreen", () => {
  it("opens on the entry picture with its facts under it", () => {
    renderScreen();
    expect(screen.getByAltText("Plate entry")).toHaveAttribute("src", "/api/img/entry");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Plate entry");
    expect(screen.getByRole("list", { name: "About this work" })).toBeInTheDocument();
  });

  it("renders only the three cells around the reader", () => {
    renderScreen();
    expect(track().querySelectorAll("img")).toHaveLength(2); // entry + one neighbour
  });

  describe("chrome", () => {
    it("starts hidden, a tap brings it up, a second tap puts it away — nothing else opens", () => {
      renderScreen();
      const chrome = screen.getByTestId("gallery-chrome");
      expect(chrome).toHaveAttribute("aria-hidden", "true");
      tap();
      expect(chrome).toHaveAttribute("aria-hidden", "false");
      tap();
      expect(chrome).toHaveAttribute("aria-hidden", "true");
      expect(screen.queryByTestId("bottom-sheet-panel")).toBeNull();
    });

    it("a mouse moving over the picture brings it up too", () => {
      renderScreen();
      act(() => void fireEvent.mouseMove(track(), { clientX: 10, clientY: 10 }));
      expect(screen.getByTestId("gallery-chrome")).toHaveAttribute("aria-hidden", "false");
    });

    it("hides again on every advance", () => {
      renderScreen();
      tap();
      swipe(-120);
      expect(screen.getByTestId("gallery-chrome")).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("the rail", () => {
    it("advances on a swipe, and the whole page becomes that item — title, facts, address bar", () => {
      renderScreen();
      swipe(-120);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Plate r0");
      expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/i/r0");
      expect(document.title).toContain("Plate r0");
      expect(wanderQueryMock).toHaveBeenLastCalledWith(
        { itemId: "r0" },
        expect.objectContaining({}),
      );
    });

    it("ArrowRight advances, ArrowLeft goes back, Escape leaves", () => {
      renderScreen();
      key("ArrowRight");
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Plate r0");
      key("ArrowLeft");
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Plate entry");
      key("Escape");
      // No feed marker in sessionStorage: a cold open, so the exit builds a focused feed.
      expect(pushMock).toHaveBeenCalledWith("/feed?focus=entry");
    });

    it("Escape pops when the visit came from the feed", () => {
      sessionStorage.setItem("ambit.feedOrigin.v1", "entry");
      renderScreen();
      key("Escape");
      expect(backMock).toHaveBeenCalledTimes(1);
      expect(pushMock).not.toHaveBeenCalled();
    });

    it("leaves the keys to a sheet while one is open", () => {
      renderScreen();
      tap();
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      expect(screen.getByTestId("bottom-sheet-panel")).toBeInTheDocument();
      key("ArrowRight");
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Plate entry");
    });

    it("clamps at a loaded end rather than wrapping", () => {
      renderScreen({ initialRail: [ENTRY] });
      swipe(-120);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Plate entry");
    });

    it("fetches more from the outermost cell, with a capped exclude list", async () => {
      railFetchMock.mockResolvedValue([railItem("t1")]);
      renderScreen();
      // Nine cells; index 5 is within PREFETCH_MARGIN (3) of the tail.
      for (let i = 0; i < 6; i++) swipe(-120);
      await act(async () => {});
      expect(railFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "r7", count: 8 }),
      );
    });
  });

  describe("the auth boundary", () => {
    it("gives a signed-out visitor the picture, the facts and no pill, and fires no protected query", () => {
      renderScreen({ authed: false });
      expect(screen.getByAltText("Plate entry")).toBeInTheDocument();
      expect(screen.getByRole("list", { name: "About this work" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save to collection" })).toBeNull();
      expect(savedForItemMock).toHaveBeenCalledWith(
        { itemId: "entry" },
        expect.objectContaining({ enabled: false }),
      );
    });

    it("gives a signed-in reader the pill, inside the chrome", () => {
      renderScreen();
      tap();
      expect(screen.getByRole("button", { name: "Save to collection" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    });
  });

  it("names the sharer when the link carried one", () => {
    renderScreen({ sharedBy: "Mara" });
    expect(screen.getByText(/Mara/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails** (module not found):
  `bun run vitest run src/components/item/item-screen.test.tsx`

- [ ] **Step 3: Write `src/components/item/item-screen.tsx`.** The rail state, `extend`,
  `advance`, `saveImage`, the share URL and both sheets are `gallery-screen.tsx`'s, lifted; read
  that file once before deleting it so the comments come with the code.

```tsx
"use client";

import * as React from "react";
import { keepPreviousData } from "@tanstack/react-query";

import { HeroRail } from "~/components/item/hero-rail";
import { ItemFacts } from "~/components/item/item-facts";
import { JoinCta } from "~/components/item/join-cta";
import { SharedByRow } from "~/components/item/shared-by-row";
import { WanderNext } from "~/components/item/wander-next";
import { SaveToCollectionSheet } from "~/components/sheets/save-to-collection-sheet";
import { ShareSheet } from "~/components/sheets/share-sheet";
import { Column } from "~/components/ui/column";
import { PillToolbar } from "~/components/ui/pill-toolbar";
import { Rise } from "~/components/ui/rise";
import { Toast } from "~/components/ui/toast";
import { useChromeCycle } from "~/hooks/use-chrome-cycle";
import { useLeaveToFeed } from "~/hooks/use-leave-to-feed";
import { DESKTOP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import { useRailGestures } from "~/hooks/use-rail-gestures";
import { imageFileName } from "~/lib/image-filename";
import { saveToastText } from "~/lib/save-toast";
import { sourceLabel } from "~/lib/source-label";
import type { RailItem } from "~/server/services/gallery-rail";
import type { WanderRow } from "~/server/services/wander";
import { api } from "~/trpc/react";

// `/i/[itemId]` for a picture — the signature screen, since 09-10-26 the *only* picture screen
// (docs/DESIGN_screen-structure.md §1). The immersive gallery and the item page were two rooms
// for one work; this is the one room.
//
//   - **The picture first, edge to edge, as big as it can be.** `HeroRail` at the very top of a
//     page you scroll: swipe sideways and the rail advances; scroll down and the facts are there.
//     No details sheet — "the location of a tap makes too much difference" (Ben).
//   - **The chrome starts hidden** and comes back on a ten-second loop (`useChromeCycle`). A tap
//     brings it up, another puts it away; on desktop a mouse moving over the picture brings it up.
//   - **Swiping goes somewhere, and the page follows.** The rail is `services/gallery-rail.ts`'s
//     endless wander, and it never marks anything seen (log.md 08-20-26). On advance the URL is
//     `replaceState`d to the new item so the address bar, a reload and the share sheet all name
//     what is on screen — no navigation, no server round trip, the track animates.
//   - **Every way out is `useLeaveToFeed(entryItem)`**: Escape, the down-flick, the pill's Feed.
//     Keyed on the *entry* item, whose feed-origin marker decides pop-vs-push, so ten swipes later
//     Back still lands on the intact feed.
//   - **Signed-out visitors get the picture, the facts and the way out.** The pill, the sheets and
//     every protected query sit behind `authed`. Leaving is not a privilege, and neither is looking.

export interface ItemScreenProps {
  entryItem: RailItem;
  /** Server-drawn first stretch of rail, entry item first. */
  initialRail: RailItem[];
  /** `items.wanderNext` for the entry item, resolved on the server so a cold link pays no client request. */
  initialWander: WanderRow[];
  authed: boolean;
  /** The app's own origin (`env.BETTER_AUTH_URL`), for building an absolute share URL. */
  appUrl: string;
  /** The signed-in reader's first name, if any — becomes `?from=` on the link they share. */
  viewerName?: string;
  /** `?from=` on the link that brought this reader here, already validated by the page. */
  sharedBy: string | null;
}

/** How many cells per fetch, and how close to an end the reader gets before the next one starts. */
const BATCH = 8;
const PREFETCH_MARGIN = 3;
/** Mirrors the router's `exclude` cap. Past this the rail accepts a rare repeat far behind. */
const EXCLUDE_CAP = 200;
/** A mouse that jitters fires `mousemove` at 60Hz; the chrome needs one call per quarter second. */
const MOUSEMOVE_THROTTLE_MS = 250;

export function ItemScreen({
  entryItem,
  initialRail,
  initialWander,
  authed,
  appUrl,
  viewerName,
  sharedBy,
}: ItemScreenProps) {
  const [items, setItems] = React.useState<RailItem[]>(initialRail);
  const [index, setIndex] = React.useState(0);
  // Each end stops asking once a batch comes back short — the corpus has nothing more that way.
  const [exhausted, setExhausted] = React.useState({
    head: false,
    tail: initialRail.length <= BATCH,
  });
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const chrome = useChromeCycle();
  const leave = useLeaveToFeed(entryItem.id);
  const desktop = useMediaQuery(DESKTOP_QUERY);

  const current = items[index] ?? entryItem;

  const utils = api.useUtils();
  // `enabled: authed` is the auth boundary in client form — an anonymous visitor must not fire a
  // protected procedure and collect an UNAUTHORIZED in their console.
  const saved = api.saves.forItem.useQuery(
    { itemId: current.id },
    { enabled: authed },
  );
  // Keyed on whatever is on screen. The entry item's answer is `initialData` from the server, and
  // the query client's 30s `staleTime` (trpc/query-client.ts) means it is not refetched on mount —
  // which is what keeps a cold share link at zero client requests. `keepPreviousData` keeps the
  // block from blanking during the one fetch a swipe costs.
  const wander = api.items.wanderNext.useQuery(
    { itemId: current.id },
    {
      placeholderData: keepPreviousData,
      initialData: current.id === entryItem.id ? initialWander : undefined,
    },
  );

  // ── fetching more rail ────────────────────────────────────────────────────────────────────────
  const inFlight = React.useRef({ head: false, tail: false });
  const extend = React.useCallback(
    async (end: "head" | "tail") => {
      if (inFlight.current[end]) return;
      inFlight.current[end] = true;
      try {
        // Anchored on the outermost cell at that end, so the walk continues from where the rail
        // actually stops rather than restarting at the entry item.
        const anchor = end === "tail" ? items[items.length - 1] : items[0];
        if (!anchor) return;
        const batch = await utils.items.galleryRail.fetch({
          itemId: anchor.id,
          count: BATCH,
          exclude: items.slice(-EXCLUDE_CAP).map((i) => i.id),
        });
        if (batch.length < BATCH) {
          setExhausted((prev) => ({ ...prev, [end]: true }));
        }
        if (batch.length === 0) return;
        if (end === "tail") {
          setItems((prev) => [...prev, ...batch]);
        } else {
          // Reversed: the draw walks *away* from the anchor, so the cell drawn first belongs
          // nearest to it — which, at the head, means last in the prepended run.
          setItems((prev) => [...batch].reverse().concat(prev));
          setIndex((i) => i + batch.length);
        }
      } finally {
        inFlight.current[end] = false;
      }
    },
    [items, utils],
  );

  React.useEffect(() => {
    if (!exhausted.tail && index >= items.length - 1 - PREFETCH_MARGIN) void extend("tail");
    if (!exhausted.head && index <= PREFETCH_MARGIN) void extend("head");
  }, [index, items.length, exhausted, extend]);

  // ── advancing ─────────────────────────────────────────────────────────────────────────────────
  const advance = React.useCallback(
    (dir: 1 | -1) => {
      setIndex((i) => {
        const next = i + dir;
        // Past a loaded end: stay put. The transform snaps back on its own, which reads as a
        // rubber-band — the corpus-thin degradation, and deliberately not a wrap.
        if (next < 0 || next >= items.length) return i;
        return next;
      });
      chrome.reset();
    },
    [items.length, chrome],
  );

  // The address bar follows the rail. `replaceState`, not `router.replace`: this is the same page
  // showing a different cell, not a navigation, and a navigation would re-run the server component
  // and blank the track mid-animation. The feed-origin marker is keyed on the entry item and is
  // untouched, so `leave()` still pops. Skipped for the entry item so a fresh load rewrites nothing.
  React.useEffect(() => {
    if (current.id === entryItem.id) return;
    window.history.replaceState(null, "", `/i/${current.id}`);
    document.title = `${current.title} · Ambit`;
  }, [current.id, current.title, entryItem.id]);

  // ── keyboard ──────────────────────────────────────────────────────────────────────────────────
  // On `window`, because nothing here holds focus — the rail is a gesture surface, not a control.
  // While a sheet is up it owns Escape (BottomSheet's own listener closes it), and an arrow that
  // changed the picture under an open sheet would be a surprise, so all three are ignored until
  // it's gone.
  const sheetOpen = saveOpen || shareOpen;
  React.useEffect(() => {
    if (sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") advance(1);
      else if (e.key === "ArrowLeft") advance(-1);
      else if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, advance, leave]);

  // ── gestures ──────────────────────────────────────────────────────────────────────────────────
  const { ref, dragPx, dragging } = useRailGestures({
    onTap: chrome.toggle,
    onAdvance: advance,
    onExit: leave,
  });

  // Desktop: a mouse moving over the picture is a request for the caption, and unlike a tap it
  // never hides it. Throttled — `mousemove` fires continuously.
  const lastMove = React.useRef(0);
  const onMouseMove = (e: React.MouseEvent) => {
    if (e.timeStamp - lastMove.current < MOUSEMOVE_THROTTLE_MS) return;
    lastMove.current = e.timeStamp;
    chrome.show();
  };

  // ── share + save ──────────────────────────────────────────────────────────────────────────────
  const shareUrl = `${appUrl}/i/${current.id}${
    viewerName ? `?from=${encodeURIComponent(viewerName)}` : ""
  }`;

  /**
   * Hand the full-resolution image to the OS, keyed to whatever is on screen.
   * `navigator.share({ files })` is the path that actually reaches an iOS camera roll; the
   * `<a download>` fallback is for desktop and browsers that can't share files.
   */
  const saveImage = React.useCallback(async () => {
    const itemId = current.id;
    try {
      const res = await fetch(`/api/img/${itemId}`);
      if (!res.ok) throw new Error(`image ${res.status}`);
      const blob = await res.blob();
      const name = imageFileName(itemId, blob.type);
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (err) {
          if ((err as Error)?.name !== "AbortError") throw err;
        }
        return;
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
      URL.revokeObjectURL(href);
      setToast("Image saved");
    } catch {
      setToast("Couldn't save that image");
    }
  }, [current.id]);

  // ── render ────────────────────────────────────────────────────────────────────────────────────
  const cells = [items[index - 1], current, items[index + 1]] as const;

  const caption = (
    <>
      <div className="pointer-events-auto">
        <h2 className="text-ink-hi text-[22px] leading-[1.24] font-semibold">
          {current.title}
        </h2>
        <p className="text-ink/52 mt-[7px] text-[12.5px] tracking-[0.15px]">
          {current.attribution ?? sourceLabel(current.source)}
        </p>
      </div>
      {authed ? (
        // `static`, so the pill rides inside the fading chrome block instead of floating
        // independently of it — this is the one screen where it belongs to something.
        <PillToolbar
          className="static bottom-auto mt-[20px]"
          bookmark={saved.data?.saved ? "saved" : "idle"}
          onBookmark={() => setSaveOpen(true)}
          onShare={() => setShareOpen(true)}
          onHome={leave}
        />
      ) : null}
    </>
  );

  return (
    // `overscroll-behavior-y: contain`: the down-flick exit must never also be a pull-to-refresh.
    <main
      className="bg-bg text-ink min-h-dvh pb-[110px]"
      style={{ overscrollBehaviorY: "contain" }}
      onMouseMove={onMouseMove}
    >
      <HeroRail
        cells={cells}
        trackRef={ref}
        dragPx={dragPx}
        dragging={dragging}
        chrome={caption}
        chromeVisible={chrome.visible}
        desktop={desktop}
      />

      {/* A book-width measure above `md` (docs/DESIGN_desktop-polish.md §1, §4). */}
      <Column width="reader" className="px-[22px]">
        {sharedBy ? (
          <Rise>
            <SharedByRow name={sharedBy} />
          </Rise>
        ) : null}
        <Rise delayMs={50}>
          <ItemFacts item={current} />
        </Rise>
        <Rise delayMs={120}>
          <WanderNext rows={wander.data ?? []} />
        </Rise>
        {authed ? null : (
          <Rise delayMs={160}>
            <JoinCta variant="image" />
          </Rise>
        )}
      </Column>

      {authed ? (
        <>
          <SaveToCollectionSheet
            open={saveOpen}
            onClose={() => setSaveOpen(false)}
            itemId={current.id}
            currentCollectionId={saved.data?.collectionId ?? undefined}
            onSaved={async (collection, drift) => {
              setToast(saveToastText(collection.name, drift));
              await utils.saves.forItem.invalidate({ itemId: current.id });
            }}
            onError={setToast}
          />
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            url={shareUrl}
            title={current.title}
            imageContext
            onSaveImage={() => void saveImage()}
            onCopied={() => setToast("Link copied")}
            onShareUnavailable={() => setToast("Sharing isn't available here")}
          />
          <Toast
            text={toast ?? ""}
            open={toast !== null}
            onDone={() => setToast(null)}
            raised
          />
        </>
      ) : null}
    </main>
  );
}
```

  `WanderRow` — check its export name and path in `src/server/services/wander.ts` (the
  `WanderNext` component imports it; use the same import). The `<h2>` in the caption, not
  `<h1>`: the page's `<h1>` is `ItemFacts`'s — one per page, and e2e's
  `getByRole("heading", { level: 1 })` must find exactly one.

- [ ] **Step 4: Run — passes.** If the "fetches more" case's expected anchor id is off by one,
  count the swipes against `PREFETCH_MARGIN` and fix the test's expectation, not the margin.

- [ ] **Step 5: The page.** Rewrite the body of `src/app/i/[itemId]/page.tsx`'s default export
  (keep `generateMetadata`, `getItem`, the `preload` block and every comment above the return):

```tsx
export default async function ItemPage({ params, searchParams }: { … }) {
  const { itemId } = await params;
  const item = await getItem(itemId);
  if (!item) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  const wander = await api.items.wanderNext({ itemId });
  const sharedBy = sharedByName((await searchParams).from);
  const viewerName = session?.user.name?.trim().split(/\s+/)[0];

  if (item.imageUrl && !item.imageUrl.startsWith("data:")) {
    preload(`/api/img/${item.id}`, { as: "image", fetchPriority: "high" });
  }

  // A picture is the merged screen (09-10-26): the rail drawn here so it opens on cells that
  // already exist — the first moment must never be a blank strip — and the entry item in the
  // rail's own shape so cell zero is indistinguishable from the rest.
  if (item.type === "image") {
    const rail = await api.items.galleryRail({ itemId, count: 8 });
    const entryItem = railItemFrom(
      item,
      item.topicId ? ((await topicLabelsFor([item.topicId])).get(item.topicId) ?? null) : null,
    );
    return (
      <ItemScreen
        entryItem={entryItem}
        initialRail={[entryItem, ...rail]}
        initialWander={wander}
        authed={Boolean(session)}
        appUrl={env.BETTER_AUTH_URL}
        viewerName={viewerName}
        sharedBy={sharedBy}
      />
    );
  }

  // An article keeps the reader layout, inside the shell that gives it the pill and the exits.
  return (
    <ItemShell
      itemId={item.id}
      title={item.title}
      hasImage={false}
      authed={Boolean(session)}
      appUrl={env.BETTER_AUTH_URL}
      viewerName={viewerName}
    >
      <main className="bg-bg text-ink min-h-dvh pt-[68px] pb-[110px]">
        <Column width="reader" className="px-[22px]">
          {sharedBy ? (
            <Rise>
              <SharedByRow name={sharedBy} />
            </Rise>
          ) : null}
          <Rise delayMs={50}>
            <div className="mt-[18px]">
              <ReaderItemBody item={item} />
            </div>
          </Rise>
          <Rise delayMs={120}>
            <WanderNext rows={wander} />
          </Rise>
          {session ? null : (
            <Rise delayMs={160}>
              <JoinCta variant="article" />
            </Rise>
          )}
        </Column>
      </main>
    </ItemShell>
  );
}
```

  Imports: add `ItemScreen`, `railItemFrom`, `topicLabelsFor`; remove `ImageItemBody`. Update
  the file's header comment: "…the image variant is `ItemScreen` (the merged screen,
  09-10-26) and the article variant the reader inside `ItemShell`."

- [ ] **Step 6: `/g/` redirects.** Replace the whole of `src/app/g/[itemId]/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

// `/g/[itemId]` was the immersive gallery (5.8 → 09-10-26). The item page is that screen now
// (docs/DESIGN_screen-structure.md §1), so anything still pointing here — a bookmark, a history
// entry, a link in a message — lands on the one screen that exists. Permanent, and images only
// was never worth checking: `/i/` 404s an unknown id itself.
export default async function GalleryPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  redirect(`/i/${itemId}`);
}
```

- [ ] **Step 7: Escape for articles.** In `item-shell.tsx`, after `const swipeRef = …`:

```ts
  // Escape leaves (09-10-26). On `window`, for the same reason the merged image screen's keys
  // are: nothing on a reader page holds focus. Suspended while a sheet is up — BottomSheet owns
  // Escape then.
  const sheetOpen = saveOpen || shareOpen;
  React.useEffect(() => {
    if (sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, leave]);
```

  (Move the `saveOpen`/`shareOpen` `useState` lines above it.) Pin it: `ls src/components/item/`
  — if `item-shell.test.tsx` exists, add the case there; if not, create it with the same
  `~/trpc/react` + `next/navigation` mocks as `item-screen.test.tsx` (`saves.forItem.useQuery`,
  `saves.collections.useQuery`, `saves.saveToCollection.useMutation`,
  `saves.createCollection.useMutation`, `useUtils`, `useRouter` with `back`/`push`) and this:

```tsx
describe("ItemShell", () => {
  it("Escape leaves — pops with a feed marker, pushes a focused feed without", () => {
    render(
      <ItemShell itemId="a1" title="An article" hasImage={false} authed appUrl="https://ambit.test">
        <p>body</p>
      </ItemShell>,
    );
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    expect(pushMock).toHaveBeenCalledWith("/feed?focus=a1");

    sessionStorage.setItem("ambit.feedOrigin.v1", "a1");
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    expect(backMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 8: Delete the gallery.**

```bash
git rm src/components/gallery/gallery-screen.tsx src/components/gallery/gallery-screen.test.tsx src/components/gallery/gallery-details-sheet.tsx src/components/gallery/use-exit-gallery.ts src/components/gallery/use-exit-gallery.test.ts src/components/gallery/gallery-origin.ts src/components/gallery/gallery-origin.test.ts src/components/item/hero-gallery-link.tsx src/components/item/image-item-body.tsx
```

  Then in `item-sections.test.tsx` delete the `describe("ImageItemBody's hero", …)`, the two
  `ImageItemBody` describes that follow it ("blog items and the maker line", "with a stored body
  (PDR)") — their cases live in `item-facts.test.tsx` now — and the `ImageItemBody` import.
  `grep -rn "gallery-origin\|galleryOrigin\|HeroGalleryLink\|ImageItemBody\|use-exit-gallery\|GalleryScreen" src e2e` must then return exactly one hit, `src/components/saved/saved-tile.tsx:38`,
  which calls `markGalleryOrigin(id)` and pushes `/g/${id}`. Change it to push `/i/${id}` and
  delete the marker call and its import. Do **not** substitute `markFeedOrigin` — Saved is not
  the feed, and the merged screen's `leave()` correctly pushes `/feed?focus=` from there (which is
  exactly what the gallery did when the marker named another item). Check `saved-tile.test.tsx`
  (if present) for an assertion on `/g/` and retarget it to `/i/`.

- [ ] **Step 9: Typecheck, lint, the item + sheet + hook suites.**

```bash
bun run typecheck && bun run lint && bun run vitest run src/components/item src/hooks src/components/saved
```

  Expected: clean. `ls src/components/gallery/` should be empty — `rmdir` it.

- [ ] **Step 10: Look at it.** `bun run dev`, sign in as `persona-theo@ambit.local` (password in
  `.env` as `PERSONA_PASSWORD`), open a tile at 402 px and at 1440. Check: the picture is edge to
  edge and square-cornered; a square one's title sits below it; a tall one's overlays; swipe
  sideways and the address bar changes; scroll down to the facts; Escape lands on the feed you
  left; `/g/<id>` redirects. Fix what's wrong before committing.

- [ ] **Step 11: Commit.**

```bash
bun run format:write
git add -A src/app/i src/app/g src/components/item src/components/gallery src/components/saved
git commit -m "feat(item): the merged item screen — rail hero, facts below, Escape and down-flick to the feed; /g/ redirects; gallery retired"
```

---

### Task 7: Playwright — `gallery.spec.ts` folds into `item.spec.ts`; the desktop case

**Files:**
- Modify: `e2e/item.spec.ts` (the "signed-in reader gets the pill" test's tail; two new tests)
- Modify: `e2e/desktop.spec.ts` (one new test)
- Delete: `e2e/gallery.spec.ts`

- [ ] **Step 1: Retarget the item spec.** In "a signed-in reader gets the pill, and can file the
  item", replace everything from `// The hero is a doorway as of 5.8` to the end of the test with:

```ts
    // The picture IS the screen as of 09-10-26 — there is no doorway to tap. What belongs here:
    // the strip is on the page, the facts are under it, and the chrome comes up on a tap.
    await expect(page.getByTestId("gallery-track")).toBeVisible();
    await expect(page.getByRole("list", { name: "About this work" })).toBeVisible();
```

  Add, after that test, the three gallery flows (their fixtures — six images across two topics
  — move from `gallery.spec.ts`'s `beforeAll` into this file's; read both `beforeAll`s and merge
  the image rows, keeping this file's `imageId`/`articleId` names and adding `imageIds`):

```ts
  test("/g/ redirects to the item page", async ({ page }) => {
    await page.goto(`/g/${imageId}`);
    await page.waitForURL(`/i/${imageId}`);
    await expect(page.getByTestId("gallery-track")).toBeVisible();
  });

  test("from the feed: tile → item → swipe → Escape returns to the intact feed, drawing nothing", async ({
    page,
  }) => {
    await page.goto("/feed");
    await signIn(page, EMAIL, PASSWORD);
    const feedIds = () =>
      page
        .locator("[data-feed-id]")
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-feed-id")));
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    const before = await feedIds();

    const imageTile = page.locator("[data-feed-id]:has(img)").first();
    await expect(imageTile).toBeVisible();
    const itemId = (await imageTile.getAttribute("data-feed-id"))!;
    await imageTile.locator("> *").click();
    await page.waitForURL(`/i/${itemId}`);
    await waitForHydration(page, "[data-testid='gallery-track']");

    // Every way back to /feed that would cost a page of corpus.
    const draws: string[] = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/api/trpc/feed.page")) draws.push("client");
      else if (pathname === "/feed") draws.push(`route:${request.method()}`);
    });

    // ArrowRight advances the rail — the address bar follows, the page does not reload.
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.url()).not.toContain(`/i/${itemId}`);

    // Escape pops the feed that was already on the stack: same tiles, nothing redrawn.
    await page.keyboard.press("Escape");
    await page.waitForURL(/\/feed$/);
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    expect(await feedIds()).toEqual(before);
    expect(draws).toEqual([]);
  });

  // The sentence the whole rail design turns on (08-20-26 corpus-burn postmortem): swiping is free.
  test("a rail session spends none of the reader's corpus", async ({ page }) => {
    const { db, seenItem, user } = conn;
    const { count, eq } = await import("drizzle-orm");
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, EMAIL));
    const seenCount = async () => {
      const [c] = await db.select({ n: count() }).from(seenItem).where(eq(seenItem.userId, row!.id));
      return c!.n;
    };
    const before = await seenCount();
    for (const id of imageIds.slice(0, 3)) {
      await page.goto(`/i/${id}`);
      await expect(page.getByTestId("gallery-track")).toBeVisible();
    }
    expect(await seenCount()).toBe(before);
  });
```

  The rail needs neighbours: give the item spec's fixture at least four images in `astronomy`
  (the original `gallery.spec.ts` seeds six across two topics — copy that block). Check
  `signIn`'s import and whether the serial describe already has a signed-in context by that
  point; the original file signs up in "a signed-in reader gets the pill", so tests after it can
  `signIn`.

- [ ] **Step 2: Delete `e2e/gallery.spec.ts`** (`git rm`). Its "tap brings the chrome up, tap
  again opens the details sheet" and "an article id has no gallery" are gone with the sheet and
  the route; "a cold-opened gallery renders whole for a signed-out visitor" is covered by the
  item spec's existing "an image item renders whole for a signed-out visitor" — add to that test:
  `await expect(page.getByTestId("gallery-track")).toBeVisible();` and
  `await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);`.

- [ ] **Step 3: The desktop case.** In `e2e/desktop.spec.ts`, after the right-click test:

```ts
  test("the item page's picture fills the viewport height, with the facts in the reader column", async ({
    page,
  }) => {
    // Reuses the session the first test established — read that test for how `session` is saved.
    await restoreSession(page, session);
    await page.goto("/feed");
    const imageTile = page.locator("[data-feed-id]:has(img)").first();
    await expect(imageTile).toBeVisible();
    await imageTile.locator("> *").click();
    await page.waitForURL(/\/i\//);

    const strip = page.getByTestId("hero-rail");
    await expect(strip).toBeVisible();
    const box = (await strip.boundingBox())!;
    expect(Math.round(box.height)).toBe(900);
    expect(Math.round(box.width)).toBe(1440);

    const facts = page.getByRole("list", { name: "About this work" });
    const fb = (await facts.boundingBox())!;
    expect(fb.width).toBeLessThanOrEqual(720);

    // A mouse moving over the picture summons the caption.
    await page.mouse.move(700, 300);
    await page.mouse.move(720, 320);
    await expect(page.getByTestId("gallery-chrome")).toHaveAttribute("aria-hidden", "false");
  });
```

  Read the file's first test for the `session`/`restoreSession` names it actually uses and
  match them.

- [ ] **Step 4: Run.** `bun run e2e:clean --confirm` then `bun run e2e:prod`. Expected: green in
  both projects (49 before this plan, minus gallery's 5, plus 3 item + 1 desktop). See Global
  Constraints for the three-worker flake.

- [ ] **Step 5: Commit.**

```bash
git add e2e/
git commit -m "test(e2e): the merged item screen — gallery.spec folded into item.spec; desktop hero fills the height"
```

---

### Task 8: `NewCollectionRow`, and the profile sheet reuses it

**Files:**
- Modify: `src/components/sheets/collection-rows.tsx`
- Create: `src/components/sheets/collection-rows.test.tsx`
- Modify: `src/components/profile/new-collection-sheet.tsx`

**Interfaces:**
- Produces:

```ts
export interface NewCollectionRowProps {
  /** Called with the created row. The caller decides what happens next — file an item, navigate. */
  onCreate: (collection: { id: string; name: string }) => void;
  /** Start expanded — the profile's sheet is nothing but this form. */
  initiallyOpen?: boolean;
}
export function NewCollectionRow(props: NewCollectionRowProps): JSX.Element;
```

  A faint `CollectionRow` labelled "New collection…" / "Name it and it's made"; on pick it
  becomes an `Input` (`aria-label="Collection name"`, `maxLength={40}`, autoFocus) + a Create
  `Button`; Enter submits; blank disables Create; CONFLICT renders `role="alert"` "You already
  have a collection with that name." inline and keeps the text; success calls
  `saves.createCollection`, invalidates `saves.collections`, calls `onCreate(row)`, collapses.

- [ ] **Step 1: Failing test** `src/components/sheets/collection-rows.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewCollectionRow } from "./collection-rows";

const { createMock, invalidateMock, createOpts } = vi.hoisted(() => ({
  createMock: vi.fn(),
  invalidateMock: vi.fn().mockResolvedValue(undefined),
  createOpts: {
    current: undefined as
      | undefined
      | {
          onSuccess: (row: { id: string; name: string }) => void;
          onError: (err: { data?: { code?: string } }) => void;
        },
  },
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({ saves: { collections: { invalidate: invalidateMock } } }),
    saves: {
      createCollection: {
        useMutation: (opts: NonNullable<typeof createOpts.current>) => {
          createOpts.current = opts;
          return { mutate: createMock, isPending: false };
        },
      },
    },
  },
}));

beforeEach(() => {
  createMock.mockClear();
  invalidateMock.mockClear();
});

describe("NewCollectionRow", () => {
  it("is a row until picked, then a name field with Create disabled on blank", () => {
    render(<NewCollectionRow onCreate={vi.fn()} />);
    expect(screen.queryByLabelText("Collection name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /New collection/ }));
    expect(screen.getByLabelText("Collection name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("creates on Enter, invalidates the list, hands the caller the row, and collapses", () => {
    const onCreate = vi.fn();
    render(<NewCollectionRow onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /New collection/ }));
    const field = screen.getByLabelText("Collection name");
    fireEvent.change(field, { target: { value: "  Maps " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(createMock).toHaveBeenCalledWith({ name: "Maps" });

    createOpts.current!.onSuccess({ id: "c9", name: "Maps" });
    expect(invalidateMock).toHaveBeenCalled();
    expect(onCreate).toHaveBeenCalledWith({ id: "c9", name: "Maps" });
    expect(screen.queryByLabelText("Collection name")).toBeNull();
  });

  it("renders a duplicate name inline and keeps the text so it can be edited", () => {
    render(<NewCollectionRow onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /New collection/ }));
    const field = screen.getByLabelText("Collection name");
    fireEvent.change(field, { target: { value: "Art" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    createOpts.current!.onError({ data: { code: "CONFLICT" } });
    expect(screen.getByRole("alert")).toHaveTextContent("You already have a collection with that name.");
    expect(field).toHaveValue("Art");
    fireEvent.change(field, { target: { value: "Art 2" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("starts expanded when asked — the profile's sheet is nothing but this form", () => {
    render(<NewCollectionRow onCreate={vi.fn()} initiallyOpen />);
    expect(screen.getByLabelText("Collection name")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails.** `bun run vitest run src/components/sheets/collection-rows.test.tsx`

- [ ] **Step 3: Add the row.** In `collection-rows.tsx`, add imports for `Button`, `Input` and
  `api`, and append:

```tsx
export interface NewCollectionRowProps {
  /** Called with the created row. The caller decides what happens next — file an item, navigate. */
  onCreate: (collection: { id: string; name: string }) => void;
  /** Start expanded — the profile's sheet is nothing but this form. */
  initiallyOpen?: boolean;
}

/**
 * The one create form in the app (09-10-26, docs/DESIGN_screen-structure.md §2). Until this it
 * lived only behind the profile's dashed tile, and every sheet that offered collections stopped
 * short of making one — the Collections sheet's "New collection" row *navigated to the profile*.
 *
 * A row that becomes a field, rather than a nested sheet: the reader is already inside a sheet,
 * with an item in hand, and a second sheet over the first is exactly the "location of a tap"
 * clunkiness Ben's review was about. The duplicate-name case renders inline and keeps the typed
 * text, because the reader's next move is to edit it.
 */
export function NewCollectionRow({
  onCreate,
  initiallyOpen = false,
}: NewCollectionRowProps) {
  const [open, setOpen] = React.useState(initiallyOpen);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const utils = api.useUtils();

  const create = api.saves.createCollection.useMutation({
    onSuccess: (row) => {
      void utils.saves.collections.invalidate();
      setName("");
      setError(null);
      setOpen(initiallyOpen);
      onCreate(row);
    },
    onError: (err) => {
      setError(
        err.data?.code === "CONFLICT"
          ? "You already have a collection with that name."
          : "Something went wrong — try again.",
      );
    },
  });

  const trimmed = name.trim();
  const submit = () => {
    if (!trimmed || create.isPending) return;
    setError(null);
    create.mutate({ name: trimmed });
  };

  if (!open) {
    return (
      <CollectionRow
        label="New collection…"
        sub="Name it and it's made"
        tone="faint"
        onPick={() => setOpen(true)}
      />
    );
  }

  return (
    <div
      className="flex flex-col gap-3 px-3 py-[10px]"
      // Same rule as the rows: a thumb resting here mid-scroll must not reach the sheet's gestures.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Input
        autoFocus
        value={name}
        maxLength={40}
        placeholder="Collection name"
        aria-label="Collection name"
        onChange={(e) => {
          setName(e.target.value);
          // Clear a stale conflict as soon as the name changes — the error was about the old
          // text, and leaving it up makes the new one look rejected too.
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      {error ? (
        <span role="alert" className="text-error text-[12.5px]">
          {error}
        </span>
      ) : null}
      <Button
        onClick={submit}
        // Blank is the only disabled state: a name that's merely a duplicate has to be
        // *submittable*, or the user can't discover the conflict.
        disabled={trimmed.length === 0 || create.isPending}
        aria-busy={create.isPending}
      >
        Create
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run — passes.**

- [ ] **Step 5: The profile sheet reuses it.** `new-collection-sheet.tsx` becomes:

```tsx
"use client";

import { NewCollectionRow } from "~/components/sheets/collection-rows";
import { BottomSheet } from "~/components/ui/bottom-sheet";

// The profile's dashed tile opens this (Phase 5.10). Since 09-10-26 the form itself is
// `NewCollectionRow`, shared with every sheet that offers collections — this shell just gives it
// a title and a sheet to sit in, expanded from the start because there is nothing else here.
export interface NewCollectionSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called with the created row so the parent can toast it. */
  onCreated: (collection: { id: string; name: string }) => void;
}

export function NewCollectionSheet({ open, onClose, onCreated }: NewCollectionSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="New collection">
      <div className="px-2 pt-1 pb-2">
        <NewCollectionRow
          initiallyOpen
          onCreate={(row) => {
            onCreated(row);
            onClose();
          }}
        />
      </div>
    </BottomSheet>
  );
}
```

  Run `bun run vitest run src/components/profile` — the profile screen tests that create a
  collection through this sheet must still pass (they mock `saves.createCollection.useMutation`;
  if the mock captured `opts` by a different name, adjust the mock, not the row).

- [ ] **Step 6: Commit.**

```bash
bun run format:write && bun run typecheck && bun run lint
git add src/components/sheets/collection-rows.tsx src/components/sheets/collection-rows.test.tsx src/components/profile/new-collection-sheet.tsx
git commit -m "feat(sheets): NewCollectionRow — the one create form, inline, reused by the profile's sheet"
```

---

### Task 9: The row in three pickers; Share in the tile sheet

**Files:**
- Modify: `src/components/sheets/item-sheet.tsx`, `save-to-collection-sheet.tsx`, `collections-sheet.tsx`
- Modify: `src/components/sheets/sheets.test.tsx`
- Modify: `src/components/feed/feed-screen.tsx` (~`:470`), `src/app/feed/page.tsx`
- Modify: `e2e/feed.spec.ts`

**Interfaces:**
- `ItemSheetProps` gains `appUrl: string` and `viewerName?: string` (for the Share row's URL).
  `FeedScreenProps` gains the same two, passed from `app/feed/page.tsx` (`env.BETTER_AUTH_URL`,
  `session.user.name` first token — the same expression `app/i/[itemId]/page.tsx` uses).

- [ ] **Step 1: Failing tests.** In `sheets.test.tsx`'s mock, add `createCollection: {
  useMutation: () => ({ mutate: vi.fn(), isPending: false }) }` under `saves`. Then:

  In `describe("ItemSheet")`, update `renderSheet` to pass `appUrl="https://ambit.test"`, and add:

```tsx
  it("offers a Share row that opens the share sheet for the item's own page", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    // The share sheet shows the url without its scheme.
    expect(screen.getByText("ambit.test/i/item-9")).toBeInTheDocument();
  });

  it("ends with a New collection row that files the item into what it makes", () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    const labels = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(labels[labels.length - 1]).toContain("New collection");
    fireEvent.click(screen.getByRole("button", { name: /New collection/ }));
    expect(screen.getByLabelText("Collection name")).toBeInTheDocument();
  });
```

  In `describe("SaveToCollectionSheet")`, add:

```tsx
  it("ends with a New collection row", () => {
    render(<SaveToCollectionSheet open onClose={vi.fn()} itemId="i1" onSaved={vi.fn()} onError={vi.fn()} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(labels[labels.length - 1]).toContain("New collection");
  });
```

  In `describe("CollectionsSheet")`, change "brackets the collections with the two pseudo-rows"
  so the last row is asserted as `toContain("New collection")` and
  `toContain("Name it and it's made")` (not "Make one on your profile"), and delete "marks the
  profile-origin, not the saved one, before navigating to Profile" — nothing navigates to the
  profile from here any more.

- [ ] **Step 2: Run — fails.** `bun run vitest run src/components/sheets/sheets.test.tsx`

- [ ] **Step 3: `SaveToCollectionSheet`.** After the `collections.data?.map(...)` inside
  `CollectionRowList`, add:

```tsx
          <NewCollectionRow
            onCreate={(c) => {
              // Made with an item in hand: file it there at once, exactly as picking a row does.
              pick(c.id);
            }}
          />
```

  Import `NewCollectionRow` from `./collection-rows`.

- [ ] **Step 4: `CollectionsSheet`.** Replace the trailing "New collection / Make one on your
  profile" `CollectionRow` (and its comment) with:

```tsx
          {/* Made here, since 09-10-26 — this row used to navigate to the profile, where the only
              create form lived. A new collection is empty, so the useful next screen is the one
              that fills it: Saved, filtered to it, the same place an existing row goes. */}
          <NewCollectionRow
            onCreate={(c) => go(`/saved?collection=${encodeURIComponent(c.id)}`)}
          />
```

  Remove the now-unused `markProfileOrigin` import and the `if (href === "/profile")` branch in
  `go`.

- [ ] **Step 5: `ItemSheet`.** Add `appUrl: string; viewerName?: string;` to the props with the
  doc lines `ItemShell` uses. Add state `const [shareOpen, setShareOpen] = React.useState(false);`
  and the URL:

```ts
  const shareUrl = item
    ? `${appUrl}/i/${item.id}${viewerName ? `?from=${encodeURIComponent(viewerName)}` : ""}`
    : "";
```

  After the "Closer Look" button, add a Share row of the same shape (import `Share` from
  `~/components/icons` — check the glyph's export name in `src/components/icons/index.ts`; the
  pill uses it):

```tsx
        <button
          type="button"
          onClick={() => {
            onClose();
            setShareOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex w-full items-center gap-[11px] rounded-[12px] px-[10px] py-[14px] text-left transition-transform duration-150 active:scale-[0.99]"
        >
          <Share size={18} className="text-accent flex-none" />
          <span className="text-ink text-[15px]">Share</span>
        </button>
```

  After the collections `map`, add:

```tsx
        <NewCollectionRow onCreate={(c) => pick(c.id)} />
```

  The tile sheet has no toast of its own, so `ItemSheetProps` also gains
  `onToast: (message: string) => void` (the feed passes `setToast`). Then, after the
  `</BottomSheet>` closing tag, wrap the return in a fragment and add:

```tsx
      {/* Opened by the Share row above. No `imageContext`/`onSaveImage`: the tile sheet doesn't
          know the item's type, and Save image stays on the item screen. */}
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={shareUrl}
        title={item?.title ?? ""}
        onCopied={() => onToast("Link copied")}
        onShareUnavailable={() => onToast("Sharing isn't available here")}
      />
```

- [ ] **Step 6: The feed passes what the sheet needs.** `FeedScreenProps` gains
  `appUrl: string; viewerName?: string;`; `app/feed/page.tsx` passes
  `appUrl={env.BETTER_AUTH_URL}` and `viewerName={session.user.name?.trim().split(/\s+/)[0]}`
  (import `env` from `~/env`). `feed-screen.tsx`'s `<ItemSheet …>` gains `appUrl`, `viewerName`
  and `onToast={setToast}`. `/dev/feed`'s page passes the same two. The feed-screen tests render
  `FeedScreen` — add `appUrl="https://ambit.test"` to their render helper.

- [ ] **Step 7: Run.** `bun run vitest run src/components/sheets src/components/feed src/components/profile && bun run typecheck && bun run lint`

- [ ] **Step 8: e2e.** In `e2e/feed.spec.ts`, after "a long press opens the item sheet, and
  picking a collection saves", add:

```ts
  test("…and a new collection can be made from it, filing the item at once", async ({ page }) => {
    await onFeed(page);
    const tile = page.locator("[data-feed-id] > *").first();
    const box = (await tile.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(550);
    await page.mouse.up();

    const sheet = page.getByTestId("bottom-sheet-panel");
    await expect(sheet.getByText("Share")).toBeVisible();
    await sheet.getByRole("button", { name: /New collection/ }).click();
    await sheet.getByLabel("Collection name").fill(`Made from a tile ${Date.now()}`);
    await sheet.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(/^Saved to Made from a tile/)).toBeVisible({ timeout: 15_000 });
  });
```

  `bun run e2e:prod` — green.

- [ ] **Step 9: Commit.**

```bash
bun run format:write
git add src/components/sheets src/components/feed src/app/feed src/app/dev e2e/feed.spec.ts
git commit -m "feat(sheets): New collection in every picker; Share in the tile sheet"
```

---

### Task 10: The landing slideshow lives; the glyph works

**Files:**
- Modify: `src/components/landing/use-slideshow.ts`, `use-slideshow.test.tsx`
- Modify: `src/components/landing/landing-screen.tsx`, `landing-screen.test.tsx`
- Modify: `src/components/landing/landing-slideshow.tsx` (a doc line)
- Modify: `e2e/home.spec.ts`

**Interfaces:**
- `SlideshowOptions.onDone` → `onFirstPass: () => void` ("fires exactly once per run: after the
  last slide of the first pass has held for `endDelayMs`, or immediately on `skip()`").
  `Slideshow` gains `advance: (dir: 1 | -1) => void`; `running` is gone (the cycle never stops
  while `enabled`); `skip`/`restart` stay.

- [ ] **Step 1: Rewrite `use-slideshow.test.tsx`'s cases.** Rename `onDone` → `onFirstPass`
  throughout `setup`. Replace the describe's cases with:

```tsx
describe("useSlideshow", () => {
  it("advances one slide per slideMs, fires onFirstPass after the last one has held, and keeps going", () => {
    const { result, onFirstPass } = setup({ count: 3 });
    expect(result.current.index).toBe(0);
    advance(SLIDE_MS);
    expect(result.current.index).toBe(1);
    advance(SLIDE_MS);
    expect(result.current.index).toBe(2);
    expect(onFirstPass).not.toHaveBeenCalled();

    // The last slide holds for the handoff beat; then the sheet rises AND the cycle wraps to
    // slide 0 in the same tick, and the pictures carry on at the ordinary cadence.
    advance(END_MS);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    expect(result.current.index).toBe(0); // wrapped
    advance(SLIDE_MS);
    expect(result.current.index).toBe(1);
    advance(SLIDE_MS);
    advance(SLIDE_MS); // 2 → wraps to 0 with no hold: the second pass is silent
    expect(result.current.index).toBe(0);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
  });

  it("waits for `enabled` — a slow first decode must not burn slide 0's time", () => {
    const { result, rerender, onFirstPass, options } = setup({ enabled: false });
    advance(5_000);
    expect(result.current.index).toBe(0);
    expect(onFirstPass).not.toHaveBeenCalled();
    rerender({ ...options, enabled: true });
    advance(SLIDE_MS);
    expect(result.current.index).toBe(1);
  });

  it("skip() fires onFirstPass now, once, and does not stop the pictures", () => {
    const { result, onFirstPass } = setup({ count: 8 });
    advance(SLIDE_MS);
    act(() => result.current.skip());
    act(() => result.current.skip());
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    advance(SLIDE_MS);
    expect(result.current.index).toBe(2); // still moving behind the sheet
  });

  it("does not fire onFirstPass again when the pass ends after a skip", () => {
    const { result, onFirstPass } = setup({ count: 2 });
    act(() => result.current.skip());
    advance(SLIDE_MS);
    advance(END_MS);
    advance(SLIDE_MS);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
  });

  it("advance() steps either way, wraps at both ends, and restarts the slide timer", () => {
    const { result } = setup({ count: 3 });
    act(() => result.current.advance(-1));
    expect(result.current.index).toBe(2);
    act(() => result.current.advance(1));
    expect(result.current.index).toBe(0);

    // A step resets the clock: 500ms in, a click, and the next automatic advance is a full
    // slideMs away, not 100ms.
    advance(500);
    act(() => result.current.advance(1));
    expect(result.current.index).toBe(1);
    advance(SLIDE_MS - 100);
    expect(result.current.index).toBe(1);
    advance(100);
    expect(result.current.index).toBe(2);
  });

  it("restart() replays from slide 0 and fires onFirstPass again at the end of that pass", () => {
    const { result, onFirstPass } = setup({ count: 2 });
    advance(SLIDE_MS);
    advance(END_MS);
    expect(onFirstPass).toHaveBeenCalledTimes(1);
    act(() => result.current.restart());
    expect(result.current.index).toBe(0);
    advance(SLIDE_MS);
    advance(END_MS);
    expect(onFirstPass).toHaveBeenCalledTimes(2);
  });

  it("does nothing with an empty run", () => {
    const { result, onFirstPass } = setup({ count: 0 });
    advance(5_000);
    expect(result.current.index).toBe(0);
    expect(onFirstPass).not.toHaveBeenCalled();
  });
});
```

  Keep the existing "survives a changing onDone identity" case, renamed for `onFirstPass`.

- [ ] **Step 2: Run — fails.** `bun run vitest run src/components/landing/use-slideshow.test.tsx`

- [ ] **Step 3: Rewrite the hook body.** In `use-slideshow.ts`, the interfaces:

```ts
export interface SlideshowOptions {
  count: number;
  slideMs: number;
  enabled: boolean;
  endDelayMs?: number;
  /** Fires exactly once per run: after the last slide of the first pass has held for
   *  `endDelayMs`, or immediately on `skip()`. What raises the sheet. */
  onFirstPass: () => void;
}

export interface Slideshow {
  index: number;
  /** Raise the sheet now — the reader tapped the glyph. Idempotent. The pictures keep moving. */
  skip: () => void;
  /** Start the run over from slide 0 (the reader collapsed the sheet); the first pass fires again. */
  restart: () => void;
  /** Step one slide either way, wrapping, and start the next automatic step from now. */
  advance: (dir: 1 | -1) => void;
}
```

  and the body (replacing everything from `const [index, setIndex]` to the return):

```ts
  const [index, setIndex] = React.useState(0);
  // The first pass is what raises the sheet, and it must fire exactly once — but the cycle goes on
  // forever underneath (09-10-26, docs/DESIGN_screen-structure.md §3), so "have we fired" can't
  // be "are we running" any more. A ref, for the same StrictMode reason as before: the check has
  // to be synchronous and outside a state updater.
  const firedRef = React.useRef(false);
  // Bumped by `advance`/`restart` so the timer effect re-arms from *now* — a manual step must not
  // be followed 100ms later by the automatic one that was already scheduled.
  const [epoch, setEpoch] = React.useState(0);

  const onFirstPassRef = React.useRef(onFirstPass);
  React.useEffect(() => {
    onFirstPassRef.current = onFirstPass;
  }, [onFirstPass]);

  const fire = React.useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onFirstPassRef.current();
  }, []);

  React.useEffect(() => {
    if (!enabled || count === 0) return;
    const last = index >= count - 1;
    // The last slide of an unfired pass holds for the handoff beat, then fires and moves on; every
    // other slide simply moves on. One setTimeout per slide, never setInterval (StrictMode).
    if (last && !firedRef.current) {
      const t = setTimeout(() => {
        fire();
        setIndex(0);
      }, endDelayMs);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), slideMs);
    return () => clearTimeout(t);
  }, [enabled, count, index, slideMs, endDelayMs, fire, epoch]);

  const advance = React.useCallback(
    (dir: 1 | -1) => {
      if (count === 0) return;
      setIndex((i) => (i + dir + count) % count);
      setEpoch((e) => e + 1);
    },
    [count],
  );

  const restart = React.useCallback(() => {
    firedRef.current = false;
    setIndex(0);
    setEpoch((e) => e + 1);
  }, []);

  return { index, skip: fire, restart, advance };
```

  Update the file's header comment: the run no longer ends; describe the first pass and `epoch`.
  Note the "does not fire onFirstPass again when the pass ends after a skip" case: after
  `skip()` the last slide has no hold (`firedRef` is already true), so it wraps after a plain
  `slideMs` — the test's `advance(END_MS)` is simply extra time, and the assertion holds.

- [ ] **Step 4: Run — passes.**

- [ ] **Step 5: The screen — failing tests first.** In `landing-screen.test.tsx`:
  - "raises the sheet when the imagery itself is tapped" becomes:

```tsx
  it("a click on the imagery advances one slide and does not raise the sheet", async () => {
    await renderScreen();
    const before = screen.getByTestId("landing-slideshow").querySelector("img[style*='opacity: 1']");
    act(() => screen.getByTestId("landing-slideshow").click());
    const after = screen.getByTestId("landing-slideshow").querySelector("img[style*='opacity: 1']");
    expect(after).not.toBe(before);
    expect(sheet()).toHaveAttribute("data-open", "false");
  });

  it("← and → step the slides", async () => {
    await renderScreen();
    const visible = () => screen.getByTestId("landing-slideshow").querySelector("img[style*='opacity: 1']")?.getAttribute("src");
    const first = visible();
    act(() => void fireEvent.keyDown(window, { key: "ArrowRight" }));
    expect(visible()).not.toBe(first);
    act(() => void fireEvent.keyDown(window, { key: "ArrowLeft" }));
    expect(visible()).toBe(first);
  });

  it("leaves the arrow keys alone while a form field has focus", async () => {
    await renderScreen();
    act(() => screen.getByRole("button", { name: "Open sign-in" }).click());
    const input = document.createElement("input");
    screen.getByTestId("auth-child").appendChild(input);
    input.focus();
    const visible = () => screen.getByTestId("landing-slideshow").querySelector("img[style*='opacity: 1']")?.getAttribute("src");
    const first = visible();
    act(() => void fireEvent.keyDown(window, { key: "ArrowRight" }));
    expect(visible()).toBe(first);
  });

  it("keeps the pictures moving behind the sheet", async () => {
    await renderScreen();
    for (let i = 0; i < SLIDES_PER_RUN - 1; i++) advance(SLIDE_MS);
    advance(END_MS);
    expect(sheet()).toHaveAttribute("data-open", "true");
    const visible = () => screen.getByTestId("landing-slideshow").querySelector("img[style*='opacity: 1']")?.getAttribute("src");
    const a = visible();
    advance(SLIDE_MS);
    expect(visible()).not.toBe(a);
  });

  it("renders the collapse glyph as a button on the server render and after hydration alike", async () => {
    // The hydration mismatch that made the glyph "do nothing" (log 09-08): reduced motion read in
    // a lazy initializer, so the server said button and the client said div. Reduced motion is
    // now read after hydration like `hydrated` itself, so both renders agree.
    stubEnvironment({ reduce: true });
    await renderScreen();
    expect(screen.getByRole("button", { name: "Back to the slideshow" })).toBeInTheDocument();
  });
```

  (`fireEvent` import from `@testing-library/react`.) Keep "raises the sheet on its own once the
  run finishes" and "collapses back to the slideshow and starts the run over" as they are. In the
  reduced-motion describe, "treats cycle mode as static" still holds (static = one slide, sheet
  up) — but the glyph is a button now (see above); adjust that test's assertion if it asserted
  the glyph's absence.

- [ ] **Step 6: Run — fails.** `bun run vitest run src/components/landing/landing-screen.test.tsx`

- [ ] **Step 7: The screen.** In `landing-screen.tsx`:
  - Replace `prefersReducedMotion()` + its use in the initializer with a store read after
    hydration:

```ts
// Reduced motion, read the same way `hydrated` is — after the boundary, never in the server's
// render. Reading it in the lazy initializer (until 09-10-26) is what made `onCollapse` differ
// across hydration: the server rendered the collapse glyph as a <button>, the client as an inert
// <div>, and the glyph "did nothing". A reduced-motion reader's static-ness now flips one frame
// after hydration, which is what the comment on `open` below already promises.
const subscribeToMotion = (cb: () => void) => {
  try {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  } catch {
    return () => undefined;
  }
};
const readMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};
```

  and in the component:

```ts
  const reduce = React.useSyncExternalStore(subscribeToMotion, readMotion, () => false);
  // `mode` is a prop and the same on both sides; `reduce` is false on the server and during
  // hydration, true only after — so the hydration render is identical for everyone.
  const isStatic = mode === "static" || reduce;
  const [run] = React.useState(() => pickRun(undefined, Math.random, mode === "static" ? 1 : undefined));
```

  (The run is picked for cycle mode even for a reduced-motion reader; static rendering shows
  its slide 0. `pickRun`'s third argument was the static count — keep the signature.)

  - `useSlideshow` call: `onDone` → `onFirstPass`.
  - `collapse` is always defined: `const collapse = () => { setOpened(false); show.restart(); };`
    and `<AuthSheet onCollapse={isStatic ? undefined : collapse}` becomes
    `onCollapse={mode === "static" ? undefined : collapse}` — a reduced-motion reader on `/` gets
    a working glyph; `/reset-password` still gets none.
  - The slideshow's `onTap`: `onTap={isStatic ? undefined : () => show.advance(1)}`.
  - Keys:

```ts
  // ←/→ step the slides — unless a form field has focus, where the arrows edit the field.
  React.useEffect(() => {
    if (isStatic) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") show.advance(1);
      else if (e.key === "ArrowLeft") show.advance(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isStatic, show]);
```

  `show` is a fresh object every render; destructure `const { advance } = show;` above and depend
  on `advance` (it is `useCallback`ed in the hook).

  - `landing-slideshow.tsx`: the `onTap` doc line becomes `/** Tapping the imagery steps to the
    next slide. Omitted in static mode. */`.
  - Delete the now-unused `prefersReducedMotion` function.

- [ ] **Step 8: Run — passes.** `bun run vitest run src/components/landing`

- [ ] **Step 9: e2e.** In `e2e/home.spec.ts` add:

```ts
test("clicking the imagery changes the slide, and the pictures keep moving behind the sheet", async ({
  page,
}) => {
  await page.goto("/");
  const visible = () =>
    page
      .locator("[data-testid='landing-slideshow'] img")
      .evaluateAll((imgs) => imgs.find((i) => getComputedStyle(i).opacity === "1")?.getAttribute("src"));
  await expect.poll(visible).toBeTruthy();
  const first = await visible();
  await page.locator("[data-testid='landing-slideshow']").click({ position: { x: 20, y: 20 }, force: true });
  await expect.poll(visible).not.toBe(first);

  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({ timeout: 15_000 });
  const behind = await visible();
  await expect.poll(visible, { timeout: 5_000 }).not.toBe(behind);
});

// The hydration regression test: this glyph was an inert <div> on the client until 09-10-26.
test("the sheet's glyph collapses it back to the slideshow", async ({ page }) => {
  await page.goto("/");
  await openAuthSheet(page);
  await page.getByRole("button", { name: "Back to the slideshow" }).click();
  await expect(page.getByRole("button", { name: "Open sign-in" })).toBeVisible();
});
```

  `force: true` on the imagery click because the slideshow is `aria-hidden` and Playwright's
  actionability check otherwise refuses it. Run `bun run e2e:prod` (the hydration case only means
  something against a production build) — green, and **no hydration warning in the console** for
  `home.spec.ts`'s first test.

- [ ] **Step 10: Commit.**

```bash
bun run format:write && bun run typecheck && bun run lint
git add src/components/landing e2e/home.spec.ts
git commit -m "feat(landing): the slideshow never stops — click and arrows step it; the glyph's hydration mismatch fixed"
```

---

### Task 11: Words — CLAUDE.md, SPEC, the handoff README, log; push

**Files:**
- Modify: `CLAUDE.md` — one bullet after the facets bullet: the merged screen, `/g/` retired,
  the down-flick, the New collection row, the living slideshow and the hydration fix; and edit
  the earlier note in the same file that says `gallery.spec.ts:193` is flaky — that spec is gone;
  point the note at `item.spec.ts`'s "from the feed: tile → item → swipe → Escape…" if it shows
  the same signature, else delete the note.
- Modify: `SPEC.md` §3.3 (the image card's tap → the merged screen; the gesture list: sideways =
  rail, down-flick at top = feed, tap = chrome), §3.5 (`/i/` is the only public route; `/g/`
  redirects), §8.1 (the route list: `/g/` retired), §8.2 (`GalleryScreen` → `ItemScreen`,
  `HeroRail`, `ItemFacts`), and wherever `/g/` or "details sheet" appears (`grep -n "/g/\|details sheet\|GalleryScreen" SPEC.md`).
- Modify: `docs/design_handoff_ambit_pwa_redesign/README.md` — one italic line under §4 and §5:
  "*Gallery and Item Image are one screen since 09-10-26 — `docs/DESIGN_screen-structure.md`.*"
- Modify: `log.md` — the day's entry per CLAUDE.md's format (the spend line from
  `python3 ~/.claude/scripts/session-spend.py --session <uuid>`, never estimated; omit it if the
  script exits non-zero).

- [ ] **Step 1: Make the edits.**
- [ ] **Step 2: `bun run check`** — green except the known-red invariants row.
- [ ] **Step 3: Commit; merge to main; push** (Ben's call at the time — ask if he is there).

```bash
git add CLAUDE.md SPEC.md docs/design_handoff_ambit_pwa_redesign/README.md log.md
git commit -m "docs: the merged item screen, /g/ retired, the New collection row and the living slideshow in CLAUDE.md, SPEC and the log"
```

---

## Self-review against the spec

- §1 merged screen: route (6), strip + height + placement (5), facts (2), gestures (3), chrome +
  mouse (4, 6), keyboard (6), leaving via `useLeaveToFeed` (6), URL follows the rail (6), data —
  `body`/`topicLabel` (1), wander as a client query with hydration (6), nothing marked seen (7's
  test), the deletions (6), `/g/` redirect (6). ✔
- §2 one row: `NewCollectionRow` (8), the three pickers + Share (9), the profile sheet reuses it
  (8). ✔
- §3 landing: wrap + `onFirstPass` + `advance` (10), click + keys + focus guard (10), the
  hydration fix (10), e2e regression test (10). ✔
- §4 tests: every unit and e2e named there has a task. ✔
- Out of scope: nothing here touches tile hover, the rail, list screens, landing copy, or image
  dimensions. ✔
- Names used across tasks: `RailItem.body`, `RailItem.topicLabel`, `railItemFrom`,
  `topicLabelsFor`, `ItemFacts`, `HeroRail`, `heroHeight`, `ItemScreen`, `useRailGestures`
  (`onTap`/`onAdvance`/`onExit`), `useChromeCycle.show`, `NewCollectionRow`
  (`onCreate`/`initiallyOpen`), `ItemSheet` (`appUrl`/`viewerName`/`onToast`),
  `useSlideshow` (`onFirstPass`/`advance`/`skip`/`restart`), test ids `hero-rail` /
  `gallery-track` / `gallery-chrome`, the list name "About this work". Each defined once, used
  with the same signature after. ✔
