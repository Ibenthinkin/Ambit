# Chrome redesign — the fatter pill and detached Share, the desktop rail, hover-to-save tiles — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-11-26 by Fable 5.1, from the design doc below and a read of every file named
here at `main` = `bbdccfd`. **For:** a cold session on a cheaper model, on a plain branch off
`main` (Ben's convention — no worktree).

**Goal:** the phone pill grows and Share becomes a detached round disc beside it; from `md` up
the toolbar is a vertical rail fixed at the right edge whose sheets float beside their button;
every feed tile gets a hover strip that saves in one click to the last-used collection and opens
the picker under a chevron; the hover zoom goes and the focus ring becomes visible; saves bump the
topic the card was served under; the onboarding stage headings stop being placeholders.

**Architecture:** `PillToolbar` keeps its file and its position rules, grows, and renders Share
as a sibling disc in the third column of a `1fr auto 1fr` grid. A new `RailToolbar` is the same
props vertically, with a `visible` fade; a new `Toolbar` picks one by `useMediaQuery`. `BottomSheet`
learns an `anchor` + `placement` that turns the desktop dialog into a popover with an invisible
scrim; the three sheets pass it through; both toolbars hand their button's rect to `onBookmark`
and `onShare`. A new `TileActions` is a sibling overlay in the feed's per-tile wrapper (the
`SavedTile` pattern), mounted only under `(hover: hover) and (pointer: fine)`, reading a new
`saves.ids` query and the last-used collection from a tiny localStorage store, saving
optimistically. The server's `saveToCollection` takes an optional `topicId` and honours it only
for a member. Nothing in the feed engine changes.

**Tech Stack:** Next.js 16.2 App Router, React 19, tRPC + React Query v5, Drizzle, Tailwind v4,
Vitest 4 (+ jsdom), Playwright 1.62, Bun 1.4. **No new dependencies.**

**Spec:** `docs/DESIGN_chrome-redesign.md` — read it first. Its six decisions are the spec; this
plan is how.

## Global Constraints

- **Branch off `main`, plain branch, no worktree:** `git switch -c feat/chrome-redesign main`.
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
- **The `pointer-events` split on the pill's wrapper is load-bearing** (`pill-toolbar.tsx`'s
  header comment): the full-width wrapper stays `pointer-events-none`; only the nav and the disc
  take pointer events. Keep the comment; the test guards it.
- **`visibility`, not `pointer-events`, hides the rail and the caption** (`hero-rail.tsx`'s
  chrome block explains why). Keep that comment where the rail copies the trick.
- **Tailwind v4's `translate-*` utilities write the standalone `translate` property**, and a
  keyframe that animates `transform` composes with it (CLAUDE.md, the 520 px dialog that landed
  260 px left of centre). The popover's vertical centring therefore uses the `translate`
  property, never `transform` — Task 4 says exactly where.
- **Never `preventDefault` on a pointer move**; the hero stays a plain `<img>`; nothing here
  touches `seen_item`. (Unchanged rules, restated because this plan edits `item-screen.tsx`.)
- **Every save/share control does `onPointerDown={(e) => e.stopPropagation()}`** — the handoff
  README's rule, and the reason a thumb resting on a control mid-scroll does not fire it.
- The design's pixel values are the spec. Where a number in this plan disagrees with the design
  doc, **the plan wins** (it was written second, against the code) and the executor notes the
  discrepancy in the log entry.

## File map

| file | task | responsibility |
|---|---|---|
| `src/hooks/use-media-query.ts`, `src/components/icons/index.tsx`, `src/lib/last-collection.ts` (+ test) | 1 | `HOVER_QUERY`; `ChevronDown`; the last-used-collection store |
| `src/components/ui/pill-toolbar.tsx` (+ test), `src/components/item/item-screen.tsx`, `e2e/item.spec.ts` | 2 | the bigger pill, the detached Share disc, rect-bearing callbacks |
| `src/components/ui/rail-toolbar.tsx` (+ test), `src/components/ui/toolbar.tsx` (+ test), `feed-screen.tsx`, `saved-screen.tsx`, `profile-screen.tsx`, `item-shell.tsx`, `item-screen.tsx`, `e2e/desktop.spec.ts` | 3 | the rail; `Toolbar`; the rail fades with the item chrome |
| `src/components/ui/bottom-sheet.tsx` (+ test), `collections-sheet.tsx`, `save-to-collection-sheet.tsx`, `share-sheet.tsx`, the five screens above, `e2e/desktop.spec.ts` | 4 | anchored popovers, transparent scrim, rects from the openers |
| `src/server/db/saves.ts`, `src/server/db/items.ts`, `src/server/api/routers/saves.ts`, `routers.integration.test.ts`, `src/components/sheets/item-sheet.tsx`, `sheets.test.tsx`, `feed-screen.tsx`, `src/app/feed/page.tsx` | 5 | `saves.ids`; `topicId` on the save; the tile sheet passes it |
| `src/components/feed/tile-actions.tsx` (+ test), `feed-screen.tsx` (+ test), `image-tile.tsx` (+ test), `article-card.tsx`, `save-to-collection-sheet.tsx`, `item-sheet.tsx`, `e2e/desktop.spec.ts` | 6 | the hover strip; zoom out, focus ring in; last-used written everywhere |
| `src/components/onboarding/onboarding-screen.tsx`, `docs/design_handoff_ambit_pwa_redesign/README.md`, `SPEC.md`, `CLAUDE.md`, `log.md` | 7 | the words |

---

### Task 1: Primitives — `HOVER_QUERY`, `ChevronDown`, the last-used collection

**Files:**
- Modify: `src/hooks/use-media-query.ts`
- Modify: `src/components/icons/index.tsx`
- Create: `src/lib/last-collection.ts`, `src/lib/last-collection.test.ts`

**Interfaces:**
- Produces: `HOVER_QUERY: string`; `ChevronDown` (an `IconProps` glyph, default 13);
  `LAST_COLLECTION_KEY`, `readLastCollectionId()`, `writeLastCollectionId(id)`,
  `pickLastCollection(collections, lastId)`, `useLastCollectionId()`, `useLastCollection(collections)`.

- [ ] **Step 1: Failing test.** Create `src/lib/last-collection.test.ts`:

```ts
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  LAST_COLLECTION_KEY,
  pickLastCollection,
  readLastCollectionId,
  useLastCollection,
  writeLastCollectionId,
} from "./last-collection";

const COLLECTIONS = [
  { id: "c1", name: "Articles" },
  { id: "c2", name: "Art" },
];

beforeEach(() => localStorage.clear());

describe("pickLastCollection", () => {
  it("returns the remembered collection when it still exists", () => {
    expect(pickLastCollection(COLLECTIONS, "c2")).toEqual(COLLECTIONS[1]);
  });
  it("falls back to the first collection when nothing is remembered, or the remembered one is gone", () => {
    expect(pickLastCollection(COLLECTIONS, null)).toEqual(COLLECTIONS[0]);
    expect(pickLastCollection(COLLECTIONS, "deleted")).toEqual(COLLECTIONS[0]);
  });
  it("returns null with no collections to choose from", () => {
    expect(pickLastCollection([], "c1")).toBeNull();
    expect(pickLastCollection(undefined, "c1")).toBeNull();
  });
});

describe("the store", () => {
  it("round-trips through localStorage under the documented key", () => {
    expect(readLastCollectionId()).toBeNull();
    writeLastCollectionId("c2");
    expect(localStorage.getItem(LAST_COLLECTION_KEY)).toBe("c2");
    expect(readLastCollectionId()).toBe("c2");
  });

  // Every tile on the feed reads this; a save from one of them has to move all of them.
  it("a write re-renders every subscribed hook", () => {
    const { result } = renderHook(() => useLastCollection(COLLECTIONS));
    expect(result.current?.id).toBe("c1");
    act(() => writeLastCollectionId("c2"));
    expect(result.current?.id).toBe("c2");
  });
});
```

- [ ] **Step 2: Run — fails** (cannot resolve `./last-collection`):
  `bun run vitest run src/lib/last-collection.test.ts`

- [ ] **Step 3: Implement.** Create `src/lib/last-collection.ts`:

```ts
"use client";

import * as React from "react";

// Which collection a one-click save goes into (docs/DESIGN_chrome-redesign.md §3, decision 2):
// the last one the reader saved into, on this device. Cosmos's hover strip has the same rule and
// it is what makes a hover save *one* click — the strip names the target and the glyph files it.
//
// localStorage rather than the database, deliberately: this is a device-local convenience, not a
// fact about the reader, and `install-store.ts` set the precedent (and the try/catch — Safari's
// Lockdown mode throws on every access).
//
// A `useSyncExternalStore` subscription rather than per-component state, because the feed mounts
// one strip per tile and a save from any of them has to rename the pill on all of them at once.

export const LAST_COLLECTION_KEY = "ambit.lastCollection";

const listeners = new Set<() => void>();

export function readLastCollectionId(): string | null {
  try {
    return localStorage.getItem(LAST_COLLECTION_KEY);
  } catch {
    return null;
  }
}

/** Remember `id`, and tell every mounted strip. Called after a successful save, never before. */
export function writeLastCollectionId(id: string): void {
  try {
    localStorage.setItem(LAST_COLLECTION_KEY, id);
  } catch {
    /* private mode etc. — the next save simply falls back to the first collection */
  }
  for (const cb of listeners) cb();
}

/**
 * The remembered collection if it is still in `collections`, else the first one (the seeded
 * "Articles" for a new reader), else null while the list is loading. Pure, for the tests.
 */
export function pickLastCollection<T extends { id: string }>(
  collections: readonly T[] | undefined,
  lastId: string | null,
): T | null {
  if (!collections || collections.length === 0) return null;
  return collections.find((c) => c.id === lastId) ?? collections[0]!;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Another tab saving should move this one's pills too.
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
const getServerSnapshot = () => null;

export function useLastCollectionId(): string | null {
  return React.useSyncExternalStore(
    subscribe,
    readLastCollectionId,
    getServerSnapshot,
  );
}

export function useLastCollection<T extends { id: string }>(
  collections: readonly T[] | undefined,
): T | null {
  return pickLastCollection(collections, useLastCollectionId());
}
```

  In `src/hooks/use-media-query.ts`, under `WIDE_QUERY`:

```ts
/**
 * A real hover and a fine pointer — a mouse or a trackpad. The feed's tile strip
 * (`tile-actions.tsx`) is mounted only where this matches: a strip that is merely invisible on a
 * phone would still catch taps across the top of every tile.
 */
export const HOVER_QUERY = "(hover: hover) and (pointer: fine)";
```

  In `src/components/icons/index.tsx`, directly after `ChevronRight`:

```tsx
/** ChevronDown — the tile strip's "choose a collection" affordance. Stroke 2.2 at 13px, the same
 *  exception `ChevronRight` documents above. */
export function ChevronDown({ size = 13, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
```

  Also add `ChevronDown` to the `/dev/tokens` icon gallery if that page enumerates icons by hand
  (`grep -n "ChevronRight" src/app/dev/tokens/page.tsx`; mirror whatever it does).

- [ ] **Step 4: Run — passes.** `bun run vitest run src/lib/last-collection.test.ts`. Commit.

```bash
git add src/hooks/use-media-query.ts src/components/icons/index.tsx src/lib/last-collection.ts src/lib/last-collection.test.ts src/app/dev/tokens/page.tsx
git commit -m "feat(chrome): HOVER_QUERY, ChevronDown, and the last-used collection store"
```

---

### Task 2: The phone pill — bigger, Share detached

**Files:**
- Modify: `src/components/ui/pill-toolbar.tsx`, `src/components/ui/pill-toolbar.test.tsx`
- Modify: `src/components/item/item-screen.tsx` (the caption's pill gets `-mx-6`)
- Modify: `e2e/item.spec.ts` (one geometry assertion)

**Interfaces:**
- Changes: `PillToolbarProps.onBookmark: (anchor: DOMRect) => void`,
  `onShare?: (anchor: DOMRect) => void`. Every existing call site passes a zero-arg arrow, which
  is assignable — nothing else has to change yet (Task 4 uses the rect).
- Produces: `TOOLBAR_GLASS` (exported string — the pill's surface recipe, reused by the disc
  and the rail).

- [ ] **Step 1: Failing tests.** In `pill-toolbar.test.tsx`, replace the `renders a page-specific
  extra action` test's neighbour set with these additions (keep every existing test; the
  four-controls test still passes because the disc is a button named Share):

```tsx
  // docs/DESIGN_chrome-redesign.md §1: Share is a detached disc beside the pill, not a fourth
  // glyph inside it — Cosmos's phone bar. A sibling of the nav, inside the same full-width
  // wrapper, so the grid can centre it in the space to the pill's right.
  it("renders Share as a disc outside the nav, in the same wrapper", () => {
    const { container } = renderPill();
    const share = screen.getByRole("button", { name: "Share" });
    const nav = screen.getByRole("navigation");
    expect(nav).not.toContainElement(share);
    expect(share.parentElement).toBe(container.firstElementChild);
    expect(share).toHaveClass("pointer-events-auto");
  });

  it("hands each control's own rect to its handler, for the desktop popovers", () => {
    const onBookmark = vi.fn();
    const onShare = vi.fn();
    renderPill({ onBookmark, onShare });
    fireEvent.click(screen.getByRole("button", { name: "Save to collection" }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    // jsdom's rects are all zeros, but they are DOMRects — the shape is the contract.
    expect(onBookmark.mock.calls[0]![0]).toHaveProperty("width");
    expect(onShare.mock.calls[0]![0]).toHaveProperty("width");
  });
```

- [ ] **Step 2: Run — fails** (Share is inside the nav; handlers called with no argument):
  `bun run vitest run src/components/ui/pill-toolbar.test.tsx`

- [ ] **Step 3: Implement.** Rewrite `pill-toolbar.tsx` from the `PillToolbarProps` interface
  down (keep the header comment, add the paragraph below it):

```tsx
// **09-11-26 (docs/DESIGN_chrome-redesign.md §1).** The pill grew — 56px tall, glyphs ~12%
// bigger, 48px hit areas — and Share left it: when a screen has something to share, the share
// control is a **detached 56px disc** on the same glass, centred in the space between the pill's
// right edge and the screen's right edge (Cosmos's phone bar). The wrapper is a three-column grid
// for exactly that: the pill in the middle column, the disc in the right one, the empty left
// column keeping the pill centred. Above `md` none of this renders — `Toolbar` picks
// `RailToolbar` there.

/** The toolbar's surface — white-on-anything translucency, because it floats over arbitrary
 *  photographic content and cannot tint with the page. Shared by the pill, the Share disc and the
 *  desktop rail; values from the handoff README's pill spec. */
export const TOOLBAR_GLASS =
  "shadow-toolbar border-[0.5px] border-white/28 bg-[rgba(240,237,231,0.225)] backdrop-blur-[26px] backdrop-saturate-[180%]";

export type BookmarkState = "idle" | "saved" | "on-saved";

export interface PillToolbarProps {
  bookmark?: BookmarkState;
  /**
   * Called with the control's own rect, so a desktop popover can float beside it (Task 4 /
   * design §2). Phone callers ignore the argument.
   */
  onBookmark: (anchor: DOMRect) => void;
  /** Optional; the Share disc is omitted entirely when absent (the feed has nothing to share). */
  onShare?: (anchor: DOMRect) => void;
  onProfile?: () => void;
  onHome?: () => void;
  /** A page-specific action, rendered in the pill's own row rather than a second bar. */
  extra?: React.ReactNode;
  className?: string;
}

/**
 * Each control is a 48px tap target wrapping a smaller glyph. The `-my-[6px]` keeps the pill at
 * 56px — the button's margin box is 36px, the pill's padding adds 20 — while the touch targets
 * overlap into the padding, exactly as the 44px/`-my-2` version did.
 */
function PillButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className="-my-[6px] inline-flex h-12 min-w-12 flex-none items-center justify-center transition-transform duration-150 active:scale-95"
    >
      {children}
    </button>
  );
}

export function PillToolbar({
  bookmark = "idle",
  onBookmark,
  onShare,
  onProfile,
  onHome,
  extra,
  className,
}: PillToolbarProps) {
  const router = useRouter();
  const goProfile =
    onProfile ??
    (() => {
      markProfileOrigin();
      router.push("/profile");
    });
  const goHome = onHome ?? (() => router.push("/feed"));

  return (
    <div
      // `fixed`, not `absolute` — see the header. A `1fr auto 1fr` grid: the pill in the middle
      // column is centred by the two flexible columns whether or not the disc is in the third.
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[26px] z-30 grid grid-cols-[1fr_auto_1fr] items-center",
        className,
      )}
    >
      <nav
        aria-label="Ambit toolbar"
        className={cn(
          TOOLBAR_GLASS,
          "pointer-events-auto col-start-2 flex items-center gap-[28px] rounded-full px-[22px] py-[10px]",
        )}
      >
        <PillButton label="Profile" onClick={goProfile}>
          <AvatarChip size={28} />
        </PillButton>

        <PillButton label="Feed" onClick={goHome}>
          <Logo size={34} className="text-white/95" />
        </PillButton>

        <PillButton
          label="Save to collection"
          onClick={(e) => onBookmark(e.currentTarget.getBoundingClientRect())}
        >
          <Bookmark
            size={26}
            filled={bookmark !== "idle"}
            className={cn(
              bookmark === "idle" && "text-white/82",
              bookmark === "saved" && "text-accent",
              bookmark === "on-saved" && "text-white",
            )}
          />
        </PillButton>

        {extra}
      </nav>

      {/* Omitted, not disabled: a greyed-out share on the feed would still be asking "share
          what?". A sibling of the nav on purpose — it is not in the pill, it is beside it. */}
      {onShare ? (
        <button
          type="button"
          aria-label="Share"
          onClick={(e) => onShare(e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            TOOLBAR_GLASS,
            "pointer-events-auto col-start-3 inline-flex size-[56px] items-center justify-center justify-self-center rounded-full transition-transform duration-150 active:scale-95",
          )}
        >
          <Share size={25} className="text-white/82" />
        </button>
      ) : null}
    </div>
  );
}
```

  In `item-screen.tsx`, the caption's pill: `className="static bottom-auto mt-[20px] -mx-6"` —
  the caption block pads 24px a side (`hero-rail.tsx`), and the disc has to measure to the true
  screen edge. Add above it:

```tsx
        // `-mx-6` undoes the caption's 24px inset so the Share disc centres between the pill and
        // the *screen's* edge, as the design measures it, not the caption's.
```

  `bookmark-state` test at line ~70 (`svgOf`) still resolves through `[aria-label="Save to
  collection"] svg` — unchanged.

- [ ] **Step 4: Run — passes.** `bun run vitest run src/components/ui/pill-toolbar.test.tsx`,
  then `bun run vitest run src/components/item` (the item-screen tests still find "Share").

- [ ] **Step 5: e2e — the disc's geometry, phone project.** In `e2e/item.spec.ts`, inside "a
  signed-in reader gets the pill, and can file the item", right after
  `await expect(page.getByRole("button", { name: "Share" })).toHaveCount(1);`:

```ts
    // The detached disc (docs/DESIGN_chrome-redesign.md §1): on the pill's axis, centred in the
    // remaining distance between the pill's right edge and the screen's right edge.
    const navBox = (await page
      .locator("nav[aria-label='Ambit toolbar']")
      .boundingBox())!;
    const shareBox = (await page
      .getByRole("button", { name: "Share" })
      .boundingBox())!;
    const { width } = page.viewportSize()!;
    const expectedX = (navBox.x + navBox.width + width) / 2;
    expect(Math.abs(shareBox.x + shareBox.width / 2 - expectedX)).toBeLessThan(2);
    expect(
      Math.abs(shareBox.y + shareBox.height / 2 - (navBox.y + navBox.height / 2)),
    ).toBeLessThan(2);
    expect(Math.round(navBox.height)).toBe(56);
```

  Run `E2E_PROD=1 bunx playwright test e2e/item.spec.ts --project=chromium`. Commit.

```bash
git add src/components/ui/pill-toolbar.tsx src/components/ui/pill-toolbar.test.tsx src/components/item/item-screen.tsx e2e/item.spec.ts
git commit -m "feat(chrome): the pill grows to 56px and Share becomes a detached disc beside it"
```

---

### Task 3: `RailToolbar`, `Toolbar`, and the rail on every screen

**Files:**
- Create: `src/components/ui/rail-toolbar.tsx`, `src/components/ui/rail-toolbar.test.tsx`,
  `src/components/ui/toolbar.tsx`, `src/components/ui/toolbar.test.tsx`
- Modify: `src/components/feed/feed-screen.tsx`, `src/components/saved/saved-screen.tsx`,
  `src/components/profile/profile-screen.tsx`, `src/components/item/item-shell.tsx`,
  `src/components/item/item-screen.tsx`
- Modify: `e2e/desktop.spec.ts`

**Interfaces:**
- Produces: `RailToolbar(props: RailToolbarProps)` where
  `RailToolbarProps = PillToolbarProps & { visible?: boolean }`; `Toolbar(props: PillToolbarProps)`.
- Test ids: `rail-toolbar` on the rail's `<nav>`; `aria-hidden` mirrors `visible`.

- [ ] **Step 1: Failing tests.** Create `src/components/ui/rail-toolbar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RailToolbar } from "./rail-toolbar";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("RailToolbar", () => {
  it("stacks the four controls top to bottom, Share last", () => {
    render(<RailToolbar onBookmark={vi.fn()} onShare={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "Ambit toolbar" });
    expect(nav).toHaveAttribute("data-testid", "rail-toolbar");
    expect(nav).toHaveClass("flex-col", "fixed");
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Profile", "Feed", "Save to collection", "Share"]);
  });

  it("omits Share without a handler, like the pill", () => {
    render(<RailToolbar onBookmark={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  // Decision 3: on the item screen the rail fades with the chrome. Hidden means hidden — the
  // `visibility` trick from hero-rail.tsx, so an invisible rail cannot be clicked.
  it("visible={false} hides it from pointers and assistive tech, with the fade transition", () => {
    render(<RailToolbar onBookmark={vi.fn()} visible={false} />);
    const nav = screen.getByTestId("rail-toolbar");
    expect(nav).toHaveAttribute("aria-hidden", "true");
    expect(nav.style.visibility).toBe("hidden");
    expect(nav.style.opacity).toBe("0");
    expect(nav.style.transition).toContain("visibility");
  });

  it("navigates like the pill by default, and hands rects to the handlers", () => {
    push.mockClear();
    const onBookmark = vi.fn();
    render(<RailToolbar onBookmark={onBookmark} />);
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(push).toHaveBeenCalledWith("/feed");
    fireEvent.click(screen.getByRole("button", { name: "Save to collection" }));
    expect(onBookmark.mock.calls[0]![0]).toHaveProperty("width");
  });
});
```

  Create `src/components/ui/toolbar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_QUERY } from "~/hooks/use-media-query";
import { stubMatchMedia } from "~/test/match-media";
import { Toolbar } from "./toolbar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

describe("Toolbar", () => {
  it("is the pill on a phone (and on the server)", () => {
    render(<Toolbar onBookmark={vi.fn()} />);
    expect(screen.queryByTestId("rail-toolbar")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Ambit toolbar" })).toBeInTheDocument();
  });

  it("is the rail from md up", () => {
    stubMatchMedia([DESKTOP_QUERY]);
    render(<Toolbar onBookmark={vi.fn()} />);
    expect(screen.getByTestId("rail-toolbar")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — fails** (modules missing):
  `bun run vitest run src/components/ui/rail-toolbar.test.tsx src/components/ui/toolbar.test.tsx`

- [ ] **Step 3: Implement.** Create `src/components/ui/rail-toolbar.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Bookmark, Logo, Share } from "~/components/icons";
import { markProfileOrigin } from "~/components/profile/profile-origin";
import { AvatarChip } from "~/components/ui/avatar-chip";
import { TOOLBAR_GLASS, type PillToolbarProps } from "~/components/ui/pill-toolbar";
import { cn } from "~/lib/utils";

// The desktop toolbar (docs/DESIGN_chrome-redesign.md §2): the pill's four controls stood on end,
// fixed at the right edge and vertically centred — "the buttons will be located down the right
// side" — a bit bigger and a bit further apart than on the phone. Same props as `PillToolbar`
// (`Toolbar` picks between them by breakpoint) plus `visible`, for the one screen where the
// toolbar belongs to something that fades: the item screen's chrome (decision 3).
//
// No full-width wrapper here, so none of the pill's `pointer-events` split: the nav *is* the
// element, 68px wide, and takes pointer events like any other control.
//
// **Hidden means `visibility: hidden`, not `pointer-events: none`** — the same reasoning as
// hero-rail.tsx's chrome block: `visibility` transitions discretely (visible at once, hidden only
// after the fade) and no descendant can override it. An invisible control that still takes clicks
// is worse than no control at all.

export type RailToolbarProps = PillToolbarProps & {
  /** Default true. False fades the rail out over the chrome's 600ms and takes it out of the tab order. */
  visible?: boolean;
};

/** 52px hit areas, glyphs up to 38 — bigger than the pill's 48/34, as the review asked. */
function RailButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className="inline-flex size-[52px] flex-none items-center justify-center transition-transform duration-150 active:scale-95"
    >
      {children}
    </button>
  );
}

export function RailToolbar({
  bookmark = "idle",
  onBookmark,
  onShare,
  onProfile,
  onHome,
  extra,
  className,
  visible = true,
}: RailToolbarProps) {
  const router = useRouter();
  const goProfile =
    onProfile ??
    (() => {
      markProfileOrigin();
      router.push("/profile");
    });
  const goHome = onHome ?? (() => router.push("/feed"));

  return (
    <nav
      aria-label="Ambit toolbar"
      data-testid="rail-toolbar"
      aria-hidden={!visible}
      // `-translate-y-1/2` writes the standalone `translate` property (Tailwind v4), so the
      // fade's `transform` nudge below composes with it instead of replacing it.
      className={cn(
        TOOLBAR_GLASS,
        "fixed top-1/2 right-[26px] z-30 flex -translate-y-1/2 flex-col items-center gap-[16px] rounded-full px-2 py-[14px]",
        className,
      )}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateX(10px)",
        visibility: visible ? "visible" : "hidden",
        transition: "opacity .6s ease, transform .6s ease, visibility .6s",
      }}
    >
      <RailButton label="Profile" onClick={goProfile}>
        <AvatarChip size={32} />
      </RailButton>

      <RailButton label="Feed" onClick={goHome}>
        <Logo size={38} className="text-white/95" />
      </RailButton>

      <RailButton
        label="Save to collection"
        onClick={(e) => onBookmark(e.currentTarget.getBoundingClientRect())}
      >
        <Bookmark
          size={29}
          filled={bookmark !== "idle"}
          className={cn(
            bookmark === "idle" && "text-white/82",
            bookmark === "saved" && "text-accent",
            bookmark === "on-saved" && "text-white",
          )}
        />
      </RailButton>

      {onShare ? (
        <RailButton
          label="Share"
          onClick={(e) => onShare(e.currentTarget.getBoundingClientRect())}
        >
          <Share size={27} className="text-white/82" />
        </RailButton>
      ) : null}

      {extra}
    </nav>
  );
}
```

  Create `src/components/ui/toolbar.tsx`:

```tsx
"use client";

import * as React from "react";

import { DESKTOP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import { PillToolbar, type PillToolbarProps } from "~/components/ui/pill-toolbar";
import { RailToolbar } from "~/components/ui/rail-toolbar";

// The toolbar every ordinary screen mounts: the phone pill below `md`, the desktop rail from it.
// The server snapshot is the pill; a desktop client re-renders before paint, the way the feed's
// column count does (`use-media-query.ts`). The item screen does not use this — it places the pill
// *inside* its fading caption and the rail *outside* it, so it renders each by hand.
export function Toolbar(props: PillToolbarProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  return desktop ? <RailToolbar {...props} /> : <PillToolbar {...props} />;
}
```

  **Call sites.** In `feed-screen.tsx`, `saved-screen.tsx`, `profile-screen.tsx` and
  `item-shell.tsx`: replace the `PillToolbar` import with
  `import { Toolbar } from "~/components/ui/toolbar";` and the `<PillToolbar` element with
  `<Toolbar` — props unchanged. (`grep -n PillToolbar src/components` afterwards should list only
  `pill-toolbar.tsx`, `toolbar.tsx`, `rail-toolbar.tsx`, `item-screen.tsx` and tests.)

  In `item-screen.tsx`: add `import { RailToolbar } from "~/components/ui/rail-toolbar";`. In the
  `caption`, gate the pill on the phone:

```tsx
      {authed && !desktop ? (
        // `static`, so the pill rides inside the fading chrome block instead of floating
        // independently of it — this is the one screen where it belongs to something. Above `md`
        // the rail below plays that part, outside the caption.
        <PillToolbar
          className="static bottom-auto mt-[20px] -mx-6"
          bookmark={saved.data?.saved ? "saved" : "idle"}
          onBookmark={() => setSaveOpen(true)}
          onShare={() => setShareOpen(true)}
          onHome={leave}
        />
      ) : null}
```

  and in the `<main>`, directly after `<HeroRail … />`:

```tsx
      {authed && desktop ? (
        // Decision 3: the rail is part of the chrome here — it fades with the caption, on the
        // same 600ms, and a mouse moving over the picture summons both.
        <RailToolbar
          visible={chrome.visible}
          bookmark={saved.data?.saved ? "saved" : "idle"}
          onBookmark={() => setSaveOpen(true)}
          onShare={() => setShareOpen(true)}
          onHome={leave}
        />
      ) : null}
```

- [ ] **Step 4: Run — passes.** The two new files, then `bun run test` (the screen tests that
  stub `DESKTOP_QUERY` now render the rail and still find the buttons by name).

- [ ] **Step 5: e2e — the rail, desktop project.** In `e2e/desktop.spec.ts`: raise
  `SEED_COUNT` to `100` (this plan adds three feed loads to the file). Add after the first test:

```ts
  // docs/DESIGN_chrome-redesign.md §2: from `md` the toolbar is a vertical rail, fixed at the
  // right edge and vertically centred. Three controls on the feed — no Share, as on the phone.
  test("the toolbar is a vertical rail hugging the right edge", async ({ page }) => {
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);

    const rail = page.getByTestId("rail-toolbar");
    await expect(rail).toBeVisible();
    await expect(page.locator("nav[aria-label='Ambit toolbar']")).toHaveCount(1);

    const box = (await rail.boundingBox())!;
    expect(Math.abs(box.x + box.width - (1440 - 26))).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - CENTRE_Y)).toBeLessThan(2);

    const buttons = rail.getByRole("button");
    await expect(buttons).toHaveCount(3);
    const tops = await buttons.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().top),
    );
    expect(tops).toEqual([...tops].sort((a, b) => a - b)); // stacked, top to bottom
    expect(tops[1]! - tops[0]!).toBeGreaterThan(52); // each below the last
  });
```

  And in the item-page test, after the `gallery-chrome` `aria-hidden` assertion:

```ts
    // The rail is chrome here too (decision 3): summoned by the same mouse move.
    await expect(page.getByTestId("rail-toolbar")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(1);
```

  Run `E2E_PROD=1 bunx playwright test --project=desktop`. Commit.

```bash
git add src/components/ui/rail-toolbar.tsx src/components/ui/rail-toolbar.test.tsx src/components/ui/toolbar.tsx src/components/ui/toolbar.test.tsx src/components/feed/feed-screen.tsx src/components/saved/saved-screen.tsx src/components/profile/profile-screen.tsx src/components/item/item-shell.tsx src/components/item/item-screen.tsx e2e/desktop.spec.ts
git commit -m "feat(chrome): the desktop rail — vertical, fixed right, fading with the item chrome"
```

---

### Task 4: Anchored popovers — `BottomSheet` floats beside its button

**Files:**
- Modify: `src/components/ui/bottom-sheet.tsx`, `src/components/ui/bottom-sheet.test.tsx`
- Modify: `src/components/sheets/collections-sheet.tsx`, `save-to-collection-sheet.tsx`,
  `share-sheet.tsx`
- Modify: `feed-screen.tsx`, `saved-screen.tsx`, `profile-screen.tsx`, `item-shell.tsx`,
  `item-screen.tsx` (anchor state from the rail's rects)
- Modify: `e2e/desktop.spec.ts`

**Interfaces:**
- Produces: `BottomSheetProps.anchor?: DOMRect | null`, `placement?: "left" | "below"`;
  exported `popoverStyle(anchor, placement, vw, vh): React.CSSProperties` and `POPOVER_W = 360`.
- The three sheets gain `anchor?: DOMRect | null; placement?: "left" | "below"` and pass them
  through.

- [ ] **Step 1: Failing tests.** Append to `bottom-sheet.test.tsx` (it already imports
  `DESKTOP_QUERY` and `stubMatchMedia`):

```tsx
import { POPOVER_W, popoverStyle } from "./bottom-sheet";

// A rect the way a rail button reports one at 1440×900: 52px square, 26px from the right edge.
const RAIL_RECT = {
  left: 1362, top: 424, width: 52, height: 52, right: 1414, bottom: 476, x: 1362, y: 424,
  toJSON: () => ({}),
} as DOMRect;

describe("popoverStyle — docs/DESIGN_chrome-redesign.md §2", () => {
  it("left: floats 14px left of the anchor, centred on it, with a symmetric height clamp", () => {
    const s = popoverStyle(RAIL_RECT, "left", 1440, 900);
    expect(s.right).toBe(1440 - 1362 + 14);
    expect(s.top).toBe(450);
    // `translate`, not `transform`: the entrance keyframe animates `transform` and would
    // otherwise replace the centring (CLAUDE.md, the dialog that landed 260px off).
    expect(s.translate).toBe("0 -50%");
    expect(s.transform).toBeUndefined();
    expect(s.maxHeight).toBe(Math.min(900 * 0.7, 2 * 450 - 32));
  });

  it("below: sits under the anchor when there is room, clamped to the viewport's right edge", () => {
    const pill = { ...RAIL_RECT, left: 1300, right: 1400, top: 100, bottom: 132, height: 32 } as DOMRect;
    const s = popoverStyle(pill, "below", 1440, 900);
    expect(s.top).toBe(140);
    expect(s.left).toBe(1440 - POPOVER_W - 16);
    expect(s.maxHeight).toBe(900 - 140 - 16);
  });

  it("below: flips above the anchor when fewer than 240px remain under it", () => {
    const low = { ...RAIL_RECT, left: 200, top: 760, bottom: 792, height: 32 } as DOMRect;
    const s = popoverStyle(low, "below", 1440, 900);
    expect(s.bottom).toBe(900 - 760 + 8);
    expect(s.top).toBeUndefined();
    expect(s.maxHeight).toBe(760 - 8 - 16);
  });
});

describe("BottomSheet — anchored (desktop popover)", () => {
  beforeEach(() => {
    stubMatchMedia([DESKTOP_QUERY]);
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("positions the panel from the anchor and paints no scrim (decision 5)", () => {
    render(
      <BottomSheet open onClose={vi.fn()} anchor={RAIL_RECT}>
        <p>Rows</p>
      </BottomSheet>,
    );
    const panel = screen.getByTestId("bottom-sheet-panel");
    expect(panel.style.right).toBe("92px");
    expect(panel.style.top).toBe("450px");
    expect(panel).toHaveClass("md:w-[360px]", "animate-menu-rise");
    expect(panel).not.toHaveClass("md:left-1/2");
    const scrim = screen.getByTestId("bottom-sheet-scrim");
    expect(scrim).not.toHaveClass("bg-scrim/66");
    expect(scrim).not.toHaveClass("backdrop-blur-[3px]");
  });

  it("still closes on the invisible scrim and on Escape", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} anchor={RAIL_RECT}>
        <p>Rows</p>
      </BottomSheet>,
    );
    fireEvent.click(screen.getByTestId("bottom-sheet-scrim"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("without an anchor the desktop dialog is exactly what it was", () => {
    render(
      <BottomSheet open onClose={vi.fn()}>
        <p>Rows</p>
      </BottomSheet>,
    );
    const panel = screen.getByTestId("bottom-sheet-panel");
    expect(panel).toHaveClass("md:w-[520px]", "md:left-1/2", "animate-dialog-in");
    expect(screen.getByTestId("bottom-sheet-scrim")).toHaveClass("bg-scrim/66");
  });
});
```

- [ ] **Step 2: Run — fails** (`popoverStyle` not exported; `anchor` unknown):
  `bun run vitest run src/components/ui/bottom-sheet.test.tsx`

- [ ] **Step 3: Implement.** In `bottom-sheet.tsx`:

  (a) After `PANEL_DESKTOP`, add:

```ts
// The desktop **popover** (docs/DESIGN_chrome-redesign.md §2, decision 5): with an `anchor` the
// panel stops being a centred dialog and floats beside the control that opened it — left of a
// rail button, under a tile's collection pill. 360px wide, the sheet radius, a full hairline
// border, the *menu* animation pair (a lift-and-fade; a dialog's scale would read as arriving
// from nowhere). Position is inline, computed by `popoverStyle` from the anchor's rect.
export const POPOVER_W = 360;
const PANEL_POPOVER =
  "md:inset-auto md:w-[360px] md:rounded-sheet md:border md:overscroll-contain";

const POPOVER_GAP = 14; // between a rail button and its panel
const BELOW_GAP = 8; // between a tile pill and its picker
const EDGE = 16; // the least the panel keeps from any viewport edge
const MIN_BELOW = 240; // under this much room, a `below` panel flips above

/**
 * Where a popover goes, as inline style. Pure, so the flip and the clamp are unit-testable.
 *
 * `left` centres the panel on the anchor vertically. **The centring is the `translate`
 * property, not `transform`**: `animate-menu-rise` animates `transform` with `fill-mode: both`,
 * and a `transform: translateY(-50%)` here would be replaced by the keyframe's own value the
 * moment it played — the same composition trap CLAUDE.md records for the 520px dialog, from the
 * other side. The max-height is twice the shorter distance to a viewport edge, less margins: a
 * panel centred on its anchor cannot then overflow either way.
 *
 * `below` drops the panel under the anchor's left edge (Cosmos's picker), flips above when
 * fewer than `MIN_BELOW`px remain, and keeps its left edge on screen.
 */
export function popoverStyle(
  a: DOMRect,
  placement: "left" | "below",
  vw: number,
  vh: number,
): React.CSSProperties {
  if (placement === "left") {
    const cy = a.top + a.height / 2;
    const room = 2 * Math.min(cy, vh - cy) - 2 * EDGE;
    return {
      right: vw - a.left + POPOVER_GAP,
      top: cy,
      translate: "0 -50%",
      maxHeight: Math.min(vh * 0.7, room),
      transformOrigin: "right center",
    };
  }
  const left = Math.max(EDGE, Math.min(a.left, vw - POPOVER_W - EDGE));
  const below = vh - a.bottom - BELOW_GAP - EDGE;
  if (below >= MIN_BELOW) {
    return {
      left,
      top: a.bottom + BELOW_GAP,
      maxHeight: below,
      transformOrigin: "top left",
    };
  }
  return {
    left,
    bottom: vh - a.top + BELOW_GAP,
    maxHeight: a.top - BELOW_GAP - EDGE,
    transformOrigin: "bottom left",
  };
}
```

  (b) In `BottomSheetProps`, after `onSwipeSide`:

```ts
  /**
   * Desktop only (09-11-26): the rect of the control that opened this sheet, captured at click
   * time (`e.currentTarget.getBoundingClientRect()`). With it, and above `md`, the panel is a
   * popover floating beside that control rather than the centred dialog; the scrim goes invisible
   * but keeps catching clicks. Ignored on the phone. See `popoverStyle`.
   */
  anchor?: DOMRect | null;
  /** Which side of the anchor the popover takes: `left` (rail buttons, default) or `below` (tile pills). */
  placement?: "left" | "below";
```

  Destructure `anchor = null, placement = "left"` in the component.

  (c) After `const isDesktop = useMediaQuery(DESKTOP_QUERY);`:

```ts
  // A popover only ever renders on a desktop client, so reading the viewport here is safe; the
  // dimensions are read per render, which is what keeps a resized window's panel on screen.
  const anchored = isDesktop && anchor !== null;
  const popover = anchored
    ? popoverStyle(anchor, placement, window.innerWidth, window.innerHeight)
    : null;
```

  (d) The animation pair: `const pair = anchored ? "menu" : isDesktop ? "dialog" : …` (keep the
  rest of the expression), with the comment: *"An anchored panel lifts and fades in place — it
  is a menu beside its button, not a surface arriving."*

  (e) The scrim: replace its `className` with

```tsx
        className={cn(
          "absolute inset-0",
          // Decision 5: a popover's scrim is an invisible click-catcher. The page stays fully
          // visible; click-outside, Escape and the focus trap all still work through it.
          !anchored && "bg-scrim/66 backdrop-blur-[3px]",
          !anchored && (leaving ? "animate-scrim-out" : "animate-scrim-in"),
        )}
```

  (f) The panel: `style={{ maxHeight: `${maxHeightPct}%`, ...popover }}` — the popover's own
  `maxHeight` (a px number) wins when present; and in its `className` replace `PANEL_DESKTOP`
  with `anchored ? PANEL_POPOVER : PANEL_DESKTOP`.

  (g) `EXIT_MS` is keyed by `variant` and the popover is `variant="pill"` with the menu pair
  (exit 150ms) — the 300ms fallback is longer than the animation, which is the safe direction.
  No change.

  **The three sheets.** In each of `collections-sheet.tsx`, `save-to-collection-sheet.tsx` and
  `share-sheet.tsx`: add to the props interface

```ts
  /** Desktop popover anchoring — passed straight to `BottomSheet`. See its `anchor` doc. */
  anchor?: DOMRect | null;
  placement?: "left" | "below";
```

  destructure them, and pass `anchor={anchor} placement={placement}` on the `<BottomSheet>`.

  **The openers.** Each screen keeps one `DOMRect | null` state per sheet it can open from the
  toolbar, set in the toolbar callback and passed to the sheet. `feed-screen.tsx`:

```tsx
  const [collectionsAnchor, setCollectionsAnchor] = React.useState<DOMRect | null>(null);
  …
      <Toolbar
        bookmark="idle"
        onBookmark={(anchor) => {
          setCollectionsAnchor(anchor);
          setCollectionsOpen(true);
        }}
        …
      />
      <CollectionsSheet
        open={collectionsOpen}
        onClose={() => setCollectionsOpen(false)}
        anchor={collectionsAnchor}
      />
```

  The same shape in `saved-screen.tsx` and `profile-screen.tsx` (their `CollectionsSheet`);
  `item-shell.tsx` and `item-screen.tsx` get two states, `saveAnchor` and `shareAnchor`, set by
  `onBookmark`/`onShare` on *both* of the item screen's toolbars (the phone pill's rects are
  harmless — `anchor` is ignored below `md`), passed to `SaveToCollectionSheet` and `ShareSheet`.

- [ ] **Step 4: Run — passes.** `bun run vitest run src/components/ui/bottom-sheet.test.tsx
  src/components/sheets`, then `bun run test`.

- [ ] **Step 5: e2e — the popover, desktop project.** In `e2e/desktop.spec.ts`, after the rail
  test:

```ts
  test("a rail button's sheet floats left of it, over an unblurred page", async ({ page }) => {
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);
    const rail = page.getByTestId("rail-toolbar");
    const railBox = (await rail.boundingBox())!;

    await rail.getByRole("button", { name: "Save to collection" }).click();
    const panel = page.getByTestId("bottom-sheet-panel");
    await expect(panel.getByRole("heading", { name: "Your collections" })).toBeVisible();
    await settle(panel);
    const box = (await panel.boundingBox())!;
    expect(Math.round(box.width)).toBe(360);
    expect(box.x + box.width).toBeLessThan(railBox.x); // beside the rail, not over it
    expect(Math.abs(box.y + box.height / 2 - CENTRE_Y)).toBeLessThan(2); // centred on the rail

    // Decision 5: no scrim is painted — the click-catcher is transparent.
    await expect(page.getByTestId("bottom-sheet-scrim")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });
```

  The existing right-click test (centred 520 px dialog) must still pass: the item sheet passes
  no anchor. Run `E2E_PROD=1 bunx playwright test --project=desktop`. Commit.

```bash
git add src/components/ui/bottom-sheet.tsx src/components/ui/bottom-sheet.test.tsx src/components/sheets/collections-sheet.tsx src/components/sheets/save-to-collection-sheet.tsx src/components/sheets/share-sheet.tsx src/components/feed/feed-screen.tsx src/components/saved/saved-screen.tsx src/components/profile/profile-screen.tsx src/components/item/item-shell.tsx src/components/item/item-screen.tsx e2e/desktop.spec.ts
git commit -m "feat(chrome): anchored popovers — a sheet floats beside the rail button that opened it"
```

---

### Task 5: Server — `saves.ids`, and a save bumps the topic the card was served under

**Files:**
- Modify: `src/server/db/saves.ts`, `src/server/db/items.ts`
- Modify: `src/server/api/routers/saves.ts`, `src/server/api/routers/routers.integration.test.ts`
- Modify: `src/components/sheets/item-sheet.tsx`, `src/components/sheets/sheets.test.tsx`,
  `src/components/feed/feed-screen.tsx`, `src/app/feed/page.tsx`

**Interfaces:**
- Produces: `getSavedItemIds(userId): Promise<string[]>`; `isItemInTopic(itemId, topicId):
  Promise<boolean>`; `saves.ids` query → `string[]`; `saves.saveToCollection` input gains
  `topicId?: string`.
- Changes: `ItemSheetProps.item: { id; title; topicId?: string | null } | null`.

- [ ] **Step 1: Failing tests.** In `routers.integration.test.ts`, inside the
  `"saves.collections + saveToCollection + list + unsave"` describe, after the un-homed test:

```ts
    // 09-11-26 (docs/DESIGN_chrome-redesign.md §5): the feed serves a card under any topic it is a
    // member of, so the save says which. Honoured only for a member — a client cannot bump an
    // arbitrary topic — and the display topic stays the fallback.
    it("saveToCollection bumps the slot topic when the item is a member of it, else the display topic", async () => {
      const { addItemTopics } = await import("~/server/db/items");
      const caller = createCaller(authedContext(userId));
      const [articles] = await caller.saves.collections();

      // itemFour is displayed under topicA; make it a member of topicB as well.
      await addItemTopics(itemFourId, [topicB], "curator");

      const served = await caller.saves.saveToCollection({
        itemId: itemFourId,
        collectionId: articles!.id,
        topicId: topicB,
      });
      expect(served.drift?.topicLabel).toBe("Test router topic B");
      expect(await caller.saves.ids()).toContain(itemFourId);
      await caller.saves.unsave({ itemId: itemFourId });

      const notAMember = await caller.saves.saveToCollection({
        itemId: itemFourId,
        collectionId: articles!.id,
        topicId: "test-router-not-a-member",
      });
      expect(notAMember.drift?.topicLabel).toBe("Test router topic A");
      await caller.saves.unsave({ itemId: itemFourId });
      expect(await caller.saves.ids()).not.toContain(itemFourId);
    });
```

  (`itemFourId` is one of the fixture's topicA articles; the afterAll sweep by topicA cleans it
  up, and `item_topic` cascades on the item.) If a `user_topic` row for `topicB` lingers from
  the bump, the existing afterAll already deletes `user_topic` for `BOTH_USERS` — check with
  `grep -n userTopic src/server/api/routers/routers.integration.test.ts`; if it does not, add
  `await db.delete(userTopic).where(inArray(userTopic.userId, BOTH_USERS));` there.

- [ ] **Step 2: Run — fails** (`ids` is not a procedure; `topicId` stripped by the zod object
  and label A both times): `bun run vitest run src/server/api/routers/routers.integration.test.ts`

- [ ] **Step 3: Implement.** In `db/saves.ts`, after `getSavedCount`:

```ts
/**
 * Every item id the user has saved, in no particular order — what the feed's tile strips read
 * to render a glyph lit (09-11-26, docs/DESIGN_chrome-redesign.md §3). One query for the whole
 * feed rather than a `saves.forItem` per tile; ids only, because a reader with a few hundred
 * saves must not pull a few hundred full rows to light up a few bookmarks.
 */
export async function getSavedItemIds(userId: string): Promise<string[]> {
  const { db } = await import("./client");
  const rows = await db
    .select({ itemId: savedItem.itemId })
    .from(savedItem)
    .where(eq(savedItem.userId, userId));
  return rows.map((r) => r.itemId);
}
```

  In `db/items.ts`, after `addItemTopics`:

```ts
/**
 * Whether `itemId` honestly belongs to `topicId` — an `item_topic` row exists. Backs the
 * server-side check on `saves.saveToCollection`'s `topicId`: the feed tells the client which
 * topic a card was served under, and the save says so back, but the server bumps that topic
 * only if the membership is real. Otherwise any client could bump any topic.
 */
export async function isItemInTopic(
  itemId: string,
  topicId: string,
): Promise<boolean> {
  const { db } = await import("./client");
  const [row] = await db
    .select({ itemId: itemTopic.itemId })
    .from(itemTopic)
    .where(and(eq(itemTopic.itemId, itemId), eq(itemTopic.topicId, topicId)))
    .limit(1);
  return row !== undefined;
}
```

  In `routers/saves.ts`: import `isItemInTopic` beside `getItemById`, `getSavedItemIds` beside
  `getSavedCount`. The input becomes
  `z.object({ itemId: z.string(), collectionId: z.string(), topicId: z.string().optional() })`.
  Replace the block from `if (item.topicId === null)` to the end of the mutation with:

```ts
      // The topic to bump. The feed draws on membership (09-11-26), so a card is routinely served
      // under a topic that is not its display topic; the client says which slot it saved from and
      // the server honours it **only for a member** (`isItemInTopic`) — the display topic is the
      // fallback, and a bogus `topicId` can bump nothing it shouldn't.
      const slotTopic =
        input.topicId && (await isItemInTopic(input.itemId, input.topicId))
          ? input.topicId
          : item.topicId;
      // An un-homed item with no slot — a walk post no current topic fits (Cut 1, design §5) —
      // has no topic to bump. The save itself is recorded above; the toast just reads "Saved to X".
      if (slotTopic === null) {
        return { collectionName: collection.name, drift: null } as const;
      }
      // Accepted race: two concurrent first-saves of the same item can both see `wasSaved ===
      // false` and double-bump. The client's in-flight guard makes that rare, and WEIGHT_CAP
      // bounds the damage — not worth a serializable transaction.
      const bumped = await bumpTopicWeight(ctx.user.id, slotTopic);
      const topicLabel = (await getTopicLabel(slotTopic)) ?? slotTopic;
      return {
        collectionName: collection.name,
        drift: { topicLabel, isNew: bumped.isNew },
      } as const;
```

  and update the procedure's doc comment: `topicId` is *"the topic the card was served under,
  bumped instead of the display topic when the item is a member of it"*. Add, after `count`:

```ts
  /** Every saved item id — the feed's tile strips light their glyphs from this one list. */
  ids: protectedProcedure.query(({ ctx }) => getSavedItemIds(ctx.user.id)),
```

  **The tile sheet.** In `item-sheet.tsx`: `item: { id: string; title: string; topicId?: string
  | null } | null;` with the doc line *"`topicId` is the slot the card was served under, for the
  bump (design §5)."* and `pick` sends
  `{ itemId: item.id, collectionId, topicId: item.topicId ?? undefined }`. In
  `sheets.test.tsx`'s `mutationOpts` type, `variables` gains `topicId?: string`; add one test in
  the `ItemSheet` describe:

```tsx
  it("passes the slot topic along with the save", () => {
    render(
      <ItemSheet
        open
        onClose={vi.fn()}
        item={{ id: "i1", title: "A tile", topicId: "surreal" }}
        onSaved={vi.fn()}
        onError={vi.fn()}
        appUrl="https://ambit.test"
        onToast={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Articles" }));
    expect(mutateMock).toHaveBeenCalledWith({ itemId: "i1", collectionId: "c1", topicId: "surreal" });
  });
```

  (Mirror however that describe already renders the sheet and finds a row — read the existing
  ItemSheet tests first and copy their render call.) In `feed-screen.tsx`, `pressedItem` gains
  `topicId: string | null` and `openItemSheet` is called with `{ id: item.id, title: item.title,
  topicId: tile.card.topicId }` from `renderTile`.

  **The prefetch.** In `src/app/feed/page.tsx`, beside the feed prefetch:

```ts
  // The tile strips' saved-state (09-11-26). Same contract: the client hook keys on (path, no
  // input), and so does this.
  void api.saves.ids.prefetch();
```

- [ ] **Step 4: Run — passes.** The router integration file, `src/components/sheets`,
  `src/components/feed`. Commit.

```bash
git add src/server/db/saves.ts src/server/db/items.ts src/server/api/routers/saves.ts src/server/api/routers/routers.integration.test.ts src/components/sheets/item-sheet.tsx src/components/sheets/sheets.test.tsx src/components/feed/feed-screen.tsx src/app/feed/page.tsx
git commit -m "feat(saves): saves.ids, and a save bumps the topic the card was served under"
```

---

### Task 6: The tile hover strip — one-click save; the zoom goes; the focus ring shows

**Files:**
- Create: `src/components/feed/tile-actions.tsx`, `src/components/feed/tile-actions.test.tsx`
- Modify: `src/components/feed/feed-screen.tsx`, `feed-screen.test.tsx`
- Modify: `src/components/feed/image-tile.tsx`, `image-tile.test.tsx`, `article-card.tsx`
- Modify: `src/components/sheets/save-to-collection-sheet.tsx`, `item-sheet.tsx` (write the
  last-used collection on success)
- Modify: `e2e/desktop.spec.ts`

**Interfaces:**
- Produces: `TileActions({ card: FeedCard; onToast: (message: string) => void })`; test id
  `tile-actions`; button names `"Choose collection"`, `"Save to {name}"` / `"Saved to {name}"`.
- Changes: the feed's per-tile wrapper is `<div data-feed-id className="group/tile relative">`
  with the strip as its **second child** — `[data-feed-id] > *` `.first()` is still the tile.

- [ ] **Step 1: Failing tests.** Create `src/components/feed/tile-actions.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeLastCollectionId } from "~/lib/last-collection";
import type { Item } from "~/server/db/items";
import type { FeedCard } from "~/server/services/feed";
import { TileActions } from "./tile-actions";

const {
  mutateMock,
  mutationOpts,
  idsData,
  setDataMock,
  getDataMock,
  invalidateMock,
} = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  mutationOpts: {
    current: undefined as
      | undefined
      | {
          onMutate: (vars: { itemId: string }) => Promise<{ previous?: string[] }>;
          onError: (err: unknown, vars: unknown, ctx?: { previous?: string[] }) => void;
          onSuccess: (
            result: { collectionName: string; drift: null },
            vars: { collectionId: string },
          ) => void;
        },
  },
  idsData: { current: [] as string[] },
  setDataMock: vi.fn(),
  getDataMock: vi.fn(() => ["z"]),
  invalidateMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      saves: {
        ids: {
          cancel: vi.fn().mockResolvedValue(undefined),
          getData: getDataMock,
          setData: setDataMock,
          invalidate: invalidateMock,
        },
        collections: { invalidate: invalidateMock },
        list: { invalidate: invalidateMock },
        count: { invalidate: invalidateMock },
      },
    }),
    saves: {
      collections: {
        useQuery: () => ({
          data: [
            { id: "c1", name: "Articles", createdAt: new Date(), itemCount: 2, cover: null },
            { id: "c2", name: "Art", createdAt: new Date(), itemCount: 0, cover: null },
          ],
          isLoading: false,
        }),
      },
      ids: { useQuery: () => ({ data: idsData.current }) },
      forItem: { useQuery: () => ({ data: undefined }) },
      createCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      saveToCollection: {
        useMutation: (opts: NonNullable<typeof mutationOpts.current>) => {
          mutationOpts.current = opts;
          return { mutate: mutateMock, isPending: false };
        },
      },
    },
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const card = (id: string): FeedCard => ({
  item: {
    id,
    source: "met",
    sourceId: `src-${id}`,
    type: "image",
    title: "A title",
    summary: null,
    body: null,
    imageUrl: "https://example.test/i.jpg",
    sourceUrl: "https://example.test/o",
    attribution: null,
    license: null,
    tags: [],
    topicId: "botany",
    curationScore: 8,
    aestheticTags: [],
    fetchedAt: new Date("2026-08-17T00:00:00Z"),
  } satisfies Item,
  tier: "DRIFT",
  topicId: "surreal", // the slot — not the display topic
});

const renderStrip = (id = "a") => {
  const onToast = vi.fn();
  render(
    <div className="group/tile relative">
      <TileActions card={card(id)} onToast={onToast} />
    </div>,
  );
  return { onToast };
};

beforeEach(() => {
  localStorage.clear();
  mutateMock.mockClear();
  setDataMock.mockClear();
  idsData.current = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("TileActions — docs/DESIGN_chrome-redesign.md §3", () => {
  it("names the last-used collection, falling back to the first", () => {
    renderStrip();
    expect(screen.getByRole("button", { name: "Choose collection" })).toHaveTextContent("Articles");
    expect(screen.getByRole("button", { name: "Save to Articles" })).toBeInTheDocument();
    act(() => writeLastCollectionId("c2"));
    expect(screen.getByRole("button", { name: "Save to Art" })).toBeInTheDocument();
  });

  it("one click saves to the target, naming the slot topic for the bump", () => {
    renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Save to Articles" }));
    expect(mutateMock).toHaveBeenCalledWith({
      itemId: "a",
      collectionId: "c1",
      topicId: "surreal",
    });
  });

  it("is optimistic: the id joins saves.ids at once, and comes back out on error", async () => {
    const { onToast } = renderStrip();
    await act(() => mutationOpts.current!.onMutate({ itemId: "a" }));
    expect(setDataMock).toHaveBeenCalledWith(undefined, ["z", "a"]);
    act(() => mutationOpts.current!.onError(new Error("x"), {}, { previous: ["z"] }));
    expect(setDataMock).toHaveBeenLastCalledWith(undefined, ["z"]);
    expect(onToast).toHaveBeenCalledWith("Couldn't save that. Try again.");
  });

  it("a success toasts through saveToastText and remembers the collection", () => {
    const { onToast } = renderStrip();
    act(() =>
      mutationOpts.current!.onSuccess(
        { collectionName: "Art", drift: null },
        { collectionId: "c2" },
      ),
    );
    expect(onToast).toHaveBeenCalledWith("Saved to Art");
    expect(localStorage.getItem("ambit.lastCollection")).toBe("c2");
  });

  it("a saved item shows a lit glyph, and clicking it opens the picker instead of re-saving", () => {
    idsData.current = ["a"];
    renderStrip();
    const glyph = screen.getByRole("button", { name: "Saved to Articles" });
    expect(glyph.querySelector("svg")).toHaveClass("text-accent");
    fireEvent.click(glyph);
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Save to collection" })).toBeInTheDocument();
  });

  it("the chevron opens the picker", () => {
    renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Choose collection" }));
    expect(screen.getByRole("heading", { name: "Save to collection" })).toBeInTheDocument();
  });
});
```

  In `image-tile.test.tsx`, add:

```tsx
// Decision 4: no hover zoom; a 3px off-white ring for keyboard focus (the 2px accent was
// invisible on a photograph — Ben's review).
it("has no hover zoom and an off-white focus ring", () => {
  render(<ImageTile card={card("a")} aspectClass="aspect-square" onTap={vi.fn()} />);
  const tile = screen.getByRole("button", { name: "A title" });
  expect(tile.querySelector("img")?.className).not.toMatch(/scale/);
  expect(tile).toHaveClass("focus-visible:outline-ink-hi", "focus-visible:outline-[3px]");
});
```

  In `feed-screen.test.tsx`: extend the `~/trpc/react` mock — under `useUtils().saves` add
  `ids: { cancel: vi.fn(), getData: vi.fn(), setData: vi.fn(), invalidate: invalidateMock }`;
  under `saves` add `ids: { useQuery: () => ({ data: [] }) }` and
  `forItem: { useQuery: () => ({ data: undefined }) }` (keep the existing `saveToCollection`
  and `collections` entries; `createCollection` if absent:
  `{ useMutation: () => ({ mutate: vi.fn(), isPending: false }) }`). Import `HOVER_QUERY`
  and add, wherever the file renders a populated feed (copy its own render helper):

```tsx
  it("mounts a tile strip per card only on a hover-capable fine pointer", () => {
    // jsdom: no matchMedia → no hover → no strip.
    renderFeed();
    expect(screen.queryAllByTestId("tile-actions")).toHaveLength(0);
    cleanup();
    stubMatchMedia([HOVER_QUERY]);
    renderFeed();
    expect(screen.getAllByTestId("tile-actions").length).toBeGreaterThan(0);
    // The strip is the wrapper's second child; the tile stays first (e2e's `> *` .first()).
    const wrapper = document.querySelector("[data-feed-id]")!;
    expect(wrapper).toHaveClass("group/tile", "relative");
    expect(wrapper.children[1]).toHaveAttribute("data-testid", "tile-actions");
  });
```

  (`cleanup` from `@testing-library/react`; `renderFeed` is whatever helper the file uses to
  render a populated page — read it.)

- [ ] **Step 2: Run — fails:** `bun run vitest run src/components/feed`

- [ ] **Step 3: Implement.** Create `src/components/feed/tile-actions.tsx`:

```tsx
"use client";

import * as React from "react";

import { Bookmark, ChevronDown } from "~/components/icons";
import { SaveToCollectionSheet } from "~/components/sheets/save-to-collection-sheet";
import { useLastCollection, writeLastCollectionId } from "~/lib/last-collection";
import { saveToastText } from "~/lib/save-toast";
import { cn } from "~/lib/utils";
import type { FeedCard } from "~/server/services/feed";
import { api } from "~/trpc/react";

// The hover strip (docs/DESIGN_chrome-redesign.md §3, decision 2 — Cosmos's feed): two controls
// across the top of a tile that appear on hover. Left, a pill naming the collection a save will go
// into (the last one used on this device); right, a save glyph that files the item there in **one
// click**. The pill's chevron opens the ordinary picker, floating under it.
//
// Mounted by `FeedScreen` only under `HOVER_QUERY` — a real hover and a fine pointer. A strip that
// is merely invisible on a phone would still catch taps across the top of every tile, so on touch
// it does not exist. It is a *sibling* of the tile inside the `group/tile relative` wrapper, never
// a child: the tile's own press handlers, `pointer-events-none` image and e2e selectors all stay
// exactly as they were (the `SavedTile` badge set this pattern).
//
// Saved-state comes from `saves.ids`, one list for the whole feed, and the save is optimistic on
// it — the glyph lights the instant it is clicked and rolls back if the write fails.

/** The unsave badge's glass (saved-tile.tsx), which is what a control over a picture needs. */
const GLASS =
  "border-hairline border-ink/16 bg-bg-app/62 backdrop-blur-[8px] text-ink-hi";

export interface TileActionsProps {
  card: FeedCard;
  /** The feed's toast — the strip has none of its own. */
  onToast: (message: string) => void;
}

const stop = (e: React.PointerEvent) => e.stopPropagation();

export function TileActions({ card, onToast }: TileActionsProps) {
  const utils = api.useUtils();
  // Shared by every strip on the page: React Query dedupes by key, so this is one request.
  const collections = api.saves.collections.useQuery();
  const ids = api.saves.ids.useQuery();
  const target = useLastCollection(collections.data);
  const saved = ids.data?.includes(card.item.id) ?? false;

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [anchor, setAnchor] = React.useState<DOMRect | null>(null);
  // Only asked when the picker opens — it tells the picker which row to mark "Already saved here".
  const forItem = api.saves.forItem.useQuery(
    { itemId: card.item.id },
    { enabled: pickerOpen },
  );

  const save = api.saves.saveToCollection.useMutation({
    // The topics-screen pattern: cancel, snapshot, patch, and let settle re-read the truth.
    onMutate: async ({ itemId }) => {
      await utils.saves.ids.cancel();
      const previous = utils.saves.ids.getData();
      utils.saves.ids.setData(undefined, [...(previous ?? []), itemId]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.saves.ids.setData(undefined, ctx.previous);
      onToast("Couldn't save that. Try again.");
    },
    onSuccess: (result, variables) => {
      writeLastCollectionId(variables.collectionId);
      onToast(saveToastText(result.collectionName, result.drift));
    },
    onSettled: () =>
      Promise.all([
        utils.saves.ids.invalidate(),
        utils.saves.collections.invalidate(),
        utils.saves.list.invalidate(),
        utils.saves.count.invalidate(),
      ]),
  });

  // Nothing to offer until the collections are known — a strip with no target has no verb.
  if (!target) return null;

  const openPicker = (e: React.MouseEvent<HTMLButtonElement>) => {
    setAnchor(e.currentTarget.getBoundingClientRect());
    setPickerOpen(true);
  };
  const saveHere = () => {
    if (save.isPending) return;
    save.mutate({
      itemId: card.item.id,
      collectionId: target.id,
      // The slot the card was served under, for the bump (design §5); null for a WILD card.
      topicId: card.topicId ?? undefined,
    });
  };

  return (
    <>
      <div
        data-testid="tile-actions"
        // `pointer-events-none` on the strip, `auto` on its two buttons: the strip spans the
        // tile's top edge, and the space between the controls must stay the tile's to press.
        // `focus-within` reveals it for a keyboard — its buttons are tab stops even when unseen.
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-[10px] opacity-0 transition-opacity duration-200 group-hover/tile:opacity-100 focus-within:opacity-100"
      >
        <button
          type="button"
          aria-label="Choose collection"
          onClick={openPicker}
          onPointerDown={stop}
          className={cn(
            GLASS,
            "rounded-pill pointer-events-auto flex h-8 max-w-[70%] items-center gap-[6px] px-[12px]",
          )}
        >
          <span className="truncate text-[12.5px] font-medium">{target.name}</span>
          <ChevronDown size={12} className="text-ink/70 flex-none" />
        </button>

        <button
          type="button"
          aria-label={saved ? `Saved to ${target.name}` : `Save to ${target.name}`}
          // Lit means "already kept": a second click is a move, so it opens the picker — what
          // the item screen's lit bookmark does — rather than re-saving into the same place.
          onClick={saved ? openPicker : saveHere}
          onPointerDown={stop}
          className={cn(
            GLASS,
            "pointer-events-auto flex size-8 items-center justify-center rounded-full",
          )}
        >
          <Bookmark
            size={15}
            filled={saved}
            className={saved ? "text-accent" : "text-ink-hi"}
          />
        </button>
      </div>

      <SaveToCollectionSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        itemId={card.item.id}
        currentCollectionId={forItem.data?.collectionId ?? undefined}
        anchor={anchor}
        placement="below"
        onSaved={(collection, drift) => {
          writeLastCollectionId(collection.id);
          onToast(saveToastText(collection.name, drift));
          void utils.saves.ids.invalidate();
        }}
        onError={onToast}
      />
    </>
  );
}
```

  **`SaveToCollectionSheet`'s `pick` carries no `topicId`** — the picker from a tile would need
  it for the bump. Add `topicId?: string | null` to `SaveToCollectionSheetProps` (doc: *"the slot
  the card was served under, when opened from a feed tile; the item screen passes none"*) and
  send `topicId: topicId ?? undefined` in its `mutate`. `TileActions` passes
  `topicId={card.topicId}`.

  **Last-used, everywhere.** In `save-to-collection-sheet.tsx`'s and `item-sheet.tsx`'s
  `onSuccess`, first line: `writeLastCollectionId(variables.collectionId);` (import from
  `~/lib/last-collection`). Every save on any surface then moves the strips.

  **The feed.** In `feed-screen.tsx`: import `TileActions`, `HOVER_QUERY`;
  `const hoverCapable = useMediaQuery(HOVER_QUERY);` beside `useColumnCount()`; and the wrapper:

```tsx
                const body = (
                  <div
                    data-feed-id={tile.kind === "because" ? undefined : key}
                    // `group/tile relative`: the hover strip below is a sibling overlay keyed
                    // on this wrapper's hover (docs/DESIGN_chrome-redesign.md §3). Second child
                    // on purpose — e2e reaches the tile as `[data-feed-id] > *` `.first()`.
                    className={tile.kind === "because" ? undefined : "group/tile relative"}
                  >
                    {renderTile(tile)}
                    {hoverCapable && tile.kind !== "because" ? (
                      <TileActions card={tile.card} onToast={setToast} />
                    ) : null}
                  </div>
                );
```

  **The tiles.** `image-tile.tsx`: the wrapper's class list loses `group` and swaps
  `focus-visible:outline-accent … focus-visible:outline-2 focus-visible:-outline-offset-2` for
  `focus-visible:outline-ink-hi focus-visible:outline-[3px] focus-visible:-outline-offset-[3px]`;
  the `<img>` becomes `className="pointer-events-none block h-full w-full object-cover"` and its
  comment reads: *"No hover effect on the picture (09-11-26, decision 4): the tile's hover
  feedback is the strip `FeedScreen` lays over it. The 3% zoom this used to carry read as
  'barely visible and clunky'."* Update the wrapper comment's ring sentence: *"the 3px off-white
  ring is for a keyboard reader — 2px of accent was invisible on a photograph."*
  `article-card.tsx`: the same outline swap; its hover fill stays.

- [ ] **Step 4: Run — passes.** `bun run vitest run src/components/feed src/components/sheets`,
  then `bun run test`.

- [ ] **Step 5: e2e — hover, save, picker; and the strict-mode fix.** In `e2e/desktop.spec.ts`:
  the item-page test's `await imageTile.locator("> *").click();` becomes
  `await imageTile.locator("> *").first().click();` (the wrapper now has two children). Add:

```ts
  // docs/DESIGN_chrome-redesign.md §3: hover a tile, the strip appears, one click saves to the
  // last-used collection, the chevron opens the picker under the pill.
  test("hovering a tile reveals its strip; one click saves; the chevron opens the picker beneath", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);
    const first = page.locator("[data-feed-id]:has(img)").first();
    await expect(first).toBeVisible();

    const strip = first.getByTestId("tile-actions");
    await first.hover();
    await expect(strip).toHaveCSS("opacity", "1");
    await strip.getByRole("button", { name: /^Save to / }).click();
    await expect(page.getByText(/^Saved to /)).toBeVisible();
    await expect(strip.getByRole("button", { name: /^Saved to / })).toBeVisible();

    const second = page.locator("[data-feed-id]:has(img)").nth(1);
    await second.hover();
    const pill = second.getByRole("button", { name: "Choose collection" });
    await pill.click();
    const panel = page.getByTestId("bottom-sheet-panel");
    await expect(
      panel.getByRole("heading", { name: "Save to collection" }),
    ).toBeVisible();
    await settle(panel);
    const pillBox = (await pill.boundingBox())!;
    const box = (await panel.boundingBox())!;
    expect(Math.round(box.width)).toBe(360);
    expect(box.y).toBeGreaterThanOrEqual(pillBox.y + pillBox.height); // under the pill

    await panel.getByRole("button", { name: /New collection/ }).click();
    const name = `From a hover ${Date.now()}`;
    await panel.getByLabel("Collection name").fill(name);
    await panel.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(`Saved to ${name}`, { exact: false })).toBeVisible({
      timeout: 15_000,
    });

    // The next strip names the collection just used.
    const third = page.locator("[data-feed-id]:has(img)").nth(2);
    await third.hover();
    await expect(third.getByRole("button", { name: "Choose collection" })).toHaveText(name);

    await page.goto("/saved");
    expect(await page.locator("[data-saved-id]").count()).toBeGreaterThanOrEqual(2);
  });
```

  Run `E2E_PROD=1 bunx playwright test --project=desktop`, then the full `bun run e2e:prod`.
  Commit.

```bash
git add src/components/feed/tile-actions.tsx src/components/feed/tile-actions.test.tsx src/components/feed/feed-screen.tsx src/components/feed/feed-screen.test.tsx src/components/feed/image-tile.tsx src/components/feed/image-tile.test.tsx src/components/feed/article-card.tsx src/components/sheets/save-to-collection-sheet.tsx src/components/sheets/item-sheet.tsx e2e/desktop.spec.ts
git commit -m "feat(feed): the tile hover strip — one-click save to the last-used collection; zoom out, focus ring in"
```

---

### Task 7: Words — onboarding copy, the README amendment, SPEC, CLAUDE.md, log; push

**Files:**
- Modify: `src/components/onboarding/onboarding-screen.tsx`
- Modify: `docs/design_handoff_ambit_pwa_redesign/README.md`, `SPEC.md`, `CLAUDE.md`, `log.md`

- [ ] **Step 1: Onboarding.** `STAGE_HEADINGS` becomes

```ts
/** Stage copy (09-11-26, docs/DESIGN_chrome-redesign.md §6). The facet order is `FACETS` and is
 *  not a copy decision. */
const STAGE_HEADINGS: Record<TopicFacet, string> = {
  subject: "What are you drawn to?",
  medium: "In what form?",
  look: "What should it feel like?",
  place: "Anywhere in particular?",
};
```

  `grep -rn "What do you want to see\|Made how\|What should it look like" src e2e` — update any
  test or spec that pinned the old strings (`e2e/support.ts`'s `completeOnboarding` clicks
  chips, not headings, but check).

- [ ] **Step 2: README amendment.** In `docs/design_handoff_ambit_pwa_redesign/README.md`, at
  the end of "### 1. Floating toolbar (the pill)", add:

```md
> **Amended 09-11-26 (`docs/DESIGN_chrome-redesign.md`).** The pill is 56 px tall
> (`padding: 10px 22px; gap: 28px`, glyphs 28 / 34 / 26, 48 px hit areas). **Share is no longer
> in the pill**: when a screen has something to share it is a detached 56 px disc on the same
> glass, centred between the pill's right edge and the screen's right edge — a detached button
> beside the pill, not a second bar. From `md` (768 px) the toolbar is a **vertical rail** fixed
> 26 px from the right edge, vertically centred (52 px controls, glyphs 32 / 38 / 29 / 27), and
> its sheets float 14 px to its left as 360 px popovers with no visible scrim. The measurements
> above this note describe the phone pill as first built and are superseded.
```

- [ ] **Step 3: SPEC.** In §7's table: `saves.saveToCollection` input becomes
  `{ itemId: string, collectionId: string, topicId?: string }` and its result
  `{ collectionName: string, drift: { topicLabel, isNew } | null }`; add the row
  `| \`saves.ids\` | query | — | \`string[]\` — every saved item id, for the feed's tile strips |`.
  Add a bullet under the table: *"`topicId` (09-11-26) is the topic the card was served under;
  the server bumps it only if the item is a member of that topic (`isItemInTopic`), else the
  display topic — a client cannot bump an arbitrary topic. `docs/DESIGN_chrome-redesign.md` §5."*
  In §8.1's `/feed` entry, one sentence: *"On a hover-capable fine pointer each tile carries a
  hover strip (last-used collection + one-click save; `docs/DESIGN_chrome-redesign.md` §3)."*

- [ ] **Step 4: CLAUDE.md.** After the "The item page *is* the immersive screen" bullet, add:

```md
- **The chrome redesign shipped <date>** (design `docs/DESIGN_chrome-redesign.md`, plan
  `docs/PLAN_chrome-redesign.md`; sub-project 3 of three from Ben's desktop review — list screens
  are sub-project 4, unwritten). Below `md` the pill is 56 px tall and **Share is a detached
  disc** beside it, centred in the space to the pill's right (`PillToolbar`'s `1fr auto 1fr`
  grid). From `md` the toolbar is **`RailToolbar`** — vertical, fixed at the right edge — and
  `Toolbar` picks one by `useMediaQuery`; the item screen renders the pill inside its fading
  caption and the rail outside it with `visible={chrome.visible}`. `BottomSheet` takes an
  `anchor` + `placement` and becomes a 360 px **popover** beside its opener with an invisible
  scrim (`popoverStyle` is pure; its centring is the `translate` property because the menu
  keyframe owns `transform`). Feed tiles carry **`TileActions`** — mounted only under
  `HOVER_QUERY`, a sibling of the tile in the `group/tile relative` wrapper — naming the
  last-used collection (`lib/last-collection.ts`, localStorage, `useSyncExternalStore`) with a
  one-click optimistic save against the new `saves.ids`. The hover zoom is gone; the focus ring
  is 3 px off-white. **`saves.saveToCollection` takes `topicId`** and bumps it only for a member
  — the feed-on-membership follow-up, closed.
```

- [ ] **Step 5: Log.** Extend the 09-11 entry in `log.md` (a second write the same day *extends*
  it — never a duplicate heading) with a `**Shipped (chrome redesign, executed <model>):**` block
  naming what landed, any number that diverged from the design doc, and any finding; end with
  the session-spend line from `python3 ~/.claude/scripts/session-spend.py --session <uuid>` if
  it exits zero.

- [ ] **Step 6: Verify and push.** `bun run format`, `bun run check` (green bar the known-red
  row), `bun run e2e:prod` (both projects). Then:

```bash
git add src/components/onboarding/onboarding-screen.tsx docs/design_handoff_ambit_pwa_redesign/README.md SPEC.md CLAUDE.md log.md
git commit -m "docs: the chrome redesign — onboarding copy, README amendment, SPEC, CLAUDE.md, log"
git switch main && git merge --no-ff feat/chrome-redesign -m "Merge: the chrome redesign — detached Share, the desktop rail, hover-to-save tiles"
git push
```

  (Merge to `main` only if Ben has said so for this branch; otherwise push the branch and stop
  with `git status -sb` clean.)

---

## Self-review against the spec

- §1 phone pill: sizes, the `1fr auto 1fr` wrapper, the detached disc as a nav sibling, the
  item caption's `-mx-6`, rect-bearing callbacks (2); phone geometry e2e (2). ✔
- §2 rail: `RailToolbar` with `visible` on the `visibility` trick, `Toolbar`, four call sites,
  the item screen's two placements (3); anchored `BottomSheet`, `popoverStyle`'s `left`/`below`
  and the flip, the transparent scrim, the three sheets' passthrough, every opener's anchor
  state (4); desktop e2e for the rail, the summon and the popover (3, 4). ✔
- §3 strip: `HOVER_QUERY` (1), `ChevronDown` (1), the store (1), `saves.ids` + prefetch (5),
  `TileActions` as a sibling under the hover gate, optimistic save, the picker `below`, last-used
  written on every surface (6); desktop e2e hover → save → picker → new collection (6). ✔
- §4 zoom out, 3 px ring on both tiles (6). ✔
- §5 `topicId` honoured for a member only, `isItemInTopic`, the tile sheet and the picker pass
  it (5, 6); integration test (5). ✔
- §6 onboarding copy (7). ✔
- §7 every named unit and e2e test has a task; the fragile contracts (`nav[aria-label]`, the four
  labels, `gallery-chrome`, the sheet test ids, the 520 px right-click dialog) are asserted
  unchanged in 2, 3, 4. ✔
- Decisions: D1 nothing here touches a list screen; D2 the pill is the target collection; D3
  `visible={chrome.visible}`; D4 no scale class; D5 `!anchored && "bg-scrim/66"`; D6
  `ArticleCard` is wrapped by the same `group/tile` wrapper and gets the same strip. ✔
- Names used across tasks: `TOOLBAR_GLASS`, `PillToolbarProps`, `RailToolbar`/`RailToolbarProps`
  (`visible`), `Toolbar`, `HOVER_QUERY`, `ChevronDown`, `writeLastCollectionId`/
  `useLastCollection`/`pickLastCollection`, `POPOVER_W`/`popoverStyle`, `BottomSheet` `anchor`/
  `placement`, `saves.ids`/`getSavedItemIds`, `isItemInTopic`, `TileActions`, test ids
  `rail-toolbar`/`tile-actions`, button names "Choose collection" / "Save to {name}" /
  "Saved to {name}". Each defined once, used with the same signature after. ✔
