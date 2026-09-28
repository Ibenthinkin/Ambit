# Spread mode — two pictures at a time on the desktop item screen — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Executed 09-27-26 by Opus 5.5 on `feat/spread-mode`; every box ticked.** **Written:** 09-27-26 by Fable 5.1, from the design doc below and a read of every file named
here at `main` = `9fd734a`. **For:** a cold session on a cheaper model, on a plain branch
`feat/spread-mode` off `main` (Ben's convention — no worktree).

**Goal:** at desktop, the item screen can show two consecutive rail pictures side by side and
turn them two at a time; a toggle in the rail flips it and the choice is remembered per device.
The feed is untouched.

**Architecture:** a pure `buildCells` turns the rail + index into three cells of one or two
pages; `HeroRail` renders a cell as a flex row of pages; `ItemScreen` gains a focus side and
derives `current` from it, so the URL, Save, Share, caption, facts and Wander next follow the
focused page with no further change; a `useSyncExternalStore` over localStorage holds the
preference; `SpreadToggle` sits in `RailToolbar`'s `extra` slot. No server change.

**Tech Stack:** Next.js 16.2 App Router, React 19, tRPC + React Query v5, Tailwind v4, Vitest 4
(+ jsdom), Playwright 1.62, Bun 1.4. **No new dependencies.**

**Spec:** `docs/DESIGN_spread-mode.md` — read it first. D1–D5 there are the spec; this plan is
how.

## Global constraints

- TDD: the test first, watched to fail, then the code. `bun run test` per task, `bun run check`
  before each commit. Commit per task.
- Comment generously: Ben is a returning webdev and the repo teaches. Cite the design's D-numbers.
- Every `<img>` of an item is `/api/img/{id}` or a `data:` URL (the CSP blocks raw museum URLs
  — copy `RailImage`'s branch in `hero-rail.tsx`).
- Nothing below `md` changes. The pill branch of `ItemScreen` is untouched.
- Do not push or merge; Ben looks at 1440 first.

## Task 1 — Docs first

- [x] `docs/DESIGN_spread-mode.md` and this file are on the branch (they were committed on
      `main` by the design session; verify).
- [x] `docs/layout-picker/README.md`: add a top note — the feed picker was not built (link
      `DESIGN_spread-mode.md` "Why"); the tokens' `"1"` and `"2"` bar sets are the placeholder
      for `components/icons/layout-glyph.tsx`.
- [x] Commit: `docs(spread): design + plan, layout-picker README note`.

## Task 2 — The preference store

- [x] Test first: `src/lib/hero-layout.test.ts` — reads `"single"` when unset, when the value is
      junk, and when `localStorage` throws; `writeHeroLayout("spread")` is read back and notifies
      a subscriber; the `storage` event notifies.
- [x] `src/lib/hero-layout.ts`, modelled line-for-line on `src/lib/last-collection.ts`:
      `HERO_LAYOUT_KEY = "ambit.heroLayout.v1"`, `type HeroLayout = "single" | "spread"`,
      `readHeroLayout()`, `writeHeroLayout(v)`, `useHeroLayout()` (server snapshot `"single"`).
      Header comment: why localStorage (D4), why per device.
- [x] Commit.

## Task 3 — Pure cell building

- [x] Test first: `src/components/item/rail-cells.test.ts` with the cases in D5 (single mode
      must equal today's `item-screen.tsx:398-401` for every case; spread at index 0, middle,
      index 1, odd tail, capped, atEnd).
- [x] `src/components/item/rail-cells.ts`:
      ```ts
      export type HeroPage = RailItem | "end";
      export type HeroCell = readonly HeroPage[];           // 1 or 2 pages
      export type HeroCells = readonly [HeroCell | undefined, HeroCell, HeroCell | undefined];
      export function buildCells(a: {
        items: readonly RailItem[]; index: number; pages: 1 | 2; capped: boolean; atEnd: boolean;
      }): HeroCells
      ```
      Spread: `before = items.slice(max(0, index - 2), index)`, `current = items.slice(index,
      index + 2)`, `after = capped ? ["end"] : items.slice(index + 2, index + 4)`; an empty
      slice is `undefined`; `atEnd` → `[current, ["end"], undefined]`. The caller guarantees
      `items[index]` exists (today's `?? entryItem` fallback stays in the screen).
- [x] Move `RailCell` out of `hero-rail.tsx`: grep for importers first; re-export `HeroPage` under
      the old name if anything outside these two files uses it.
- [x] Commit.

## Task 4 — Tap position

- [x] `src/hooks/use-rail-gestures.ts`: `onTap: (tap: { clientX: number }) => void`; in `up`,
      after `if (!hadMoved)`, call `cb.onTap({ clientX: e.clientX })`. Update the header's
      "tap" line and the hook's test if one exists (`grep -l use-rail-gestures src -r`).
- [x] Commit.

## Task 5 — `HeroRail` renders cells of pages

- [x] Tests first in `hero-rail.test.tsx`: a two-page cell renders two `<img>`s, each inside a
      page div with `p-[12px]`; a one-page cell in spread keeps its page on the left half (an
      empty `flex-1` sibling); existing tests updated to `cells` of arrays.
- [x] `HeroRailProps.cells: HeroCells`. A cell `<div className="flex" style={{ flex: "0 0
      33.3333%", height: "100%" }}>` maps its pages to
      `<div className="flex min-w-0 flex-1 items-center justify-center p-[12px]" style={{
      height: "100%", paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>` holding
      `RailImage` (`priority={i === 1}`) or the end card box (`w-full max-w-[360px]`). Cell key:
      `pages.map(p => p === "end" ? "end" : p.id).join("+")`, `empty-${i}` when undefined.
- [x] Rewrite the header comment's "Three cells, one screen wide each" paragraph: a cell holds
      one or two pages, cite D3.
- [x] Commit.

## Task 6 — The glyph and the toggle

- [x] `src/components/icons/layout-glyph.tsx`: `LayoutGlyph({ pages, size = 24, className })`.
      Four `<rect y={4} height={16} rx={1.2} fill="currentColor">` with `x`/`width` from the
      tokens' `bars["1"]` / `bars["2"]` (copy the numbers in, with a comment naming the token
      file), `style={{ transition: "x 320ms cubic-bezier(.3,1.3,.5,1), width 320ms
      cubic-bezier(.3,1.3,.5,1)" }}`. Comment: placeholder, Ben is replacing it; Firefox switches
      instantly. Export from `icons/index.tsx`. Test: the right rect set per `pages`.
- [x] `src/components/ui/rail-toolbar.tsx`: export `RailButton` with an optional
      `pressed?: boolean` (→ `aria-pressed`); move `{extra}` to between the Feed and Save
      buttons; update the header comment and `PillToolbarProps.extra`'s doc in
      `pill-toolbar.tsx` ("in the rail, between Feed and Save"). Test: order Profile / Feed /
      extra / Save.
- [x] `src/components/item/spread-toggle.tsx`: `SpreadToggle({ spread, onToggle })` →
      `<RailButton label="Two pictures at a time" pressed={spread} onClick={onToggle}>
      <LayoutGlyph pages={spread ? 2 : 1} size={30} className="text-white/82" /></RailButton>`.
      Test: `aria-pressed` follows `spread`.
- [x] Commit.

## Task 7 — Wire the screen

In `src/components/item/item-screen.tsx`:

- [x] Tests first in `item-screen.test.tsx` (use `src/test/match-media.ts`'s
      `stubMatchMedia(true)` for desktop and set `localStorage` before render): ArrowRight moves
      two; the toggle flips the mode and writes the key; a click on the right half (a
      `pointerdown`/`pointerup` pair with `clientX` > `innerWidth / 2` and no travel) moves the
      URL, the caption emphasis, `ItemFacts`'s `<h1>` and the Save sheet's `itemId`; a turn
      resets focus; toggling off from a right focus lands on that item; the explore cap counts
      two per turn; the tail extends at `PREFETCH_MARGIN * 2`.
- [x] `const desktop = …` moves above; `const layout = useHeroLayout(); const spread = desktop &&
      layout === "spread"; const pages = spread ? 2 : 1;`
- [x] `const [focusSide, setFocusSide] = React.useState<0 | 1>(0)`; `const cells =
      buildCells({ items, index, pages, capped, atEnd })`; `const pair = cells[1]`;
      `current`: in spread `pair[focusSide]` if it is a `RailItem`, else `pair[0]` if a
      `RailItem`, else `items[index] ?? entryItem`; in single, today's `items[index] ?? entryItem`.
      When `atEnd` keep today's rule (the picture before the card).
- [x] `advance`: `const next = index + dir * pages`; back clamps to `Math.max(0, next)` (and
      does nothing if already 0); forward refuses `next >= items.length`; `setFocusSide(0)`;
      explore writes `railCount + pages`.
- [x] Prefetch effect: `PREFETCH_MARGIN * pages` in both conditions; add `pages` to the deps.
- [x] `onTap: ({ clientX }) => { const side = clientX < window.innerWidth / 2 ? 0 : 1;
      const page = pair[side]; if (spread && side !== focusSide && page && page !== "end")
      setFocusSide(side); else chrome.toggle(); }`.
- [x] `toggleSpread = () => { if (spread && focusSide === 1) setIndex(i => i + 1);
      setFocusSide(0); writeHeroLayout(spread ? "single" : "spread"); }`. Plus an effect: when
      `spread` becomes false for any reason (window narrowed), `setFocusSide(0)`.
- [x] Caption: in spread, `<div className="grid grid-cols-2 gap-6">` with one caption block per
      page of `pair` (skip `"end"`), the unfocused at `opacity-55`; single mode renders today's
      block unchanged.
- [x] `RailToolbar` gets `extra={<SpreadToggle spread={spread} onToggle={toggleSpread} />}`.
- [x] Header comment: one bullet for spread mode, citing the design.
- [x] Commit.

## Task 8 — Playwright

- [x] `e2e/desktop.spec.ts`: the block in D5. Reuse the file's sign-in + seed helpers and the
      mouse-move summon from "the item page's picture fills the viewport height". Name the test
      `"spread mode: two pictures at a time, turned by two, the focused one is the item"`.
- [x] `bun run e2e:prod` green (the phone project ignores this spec).
- [x] Commit.

## Task 9 — Docs, log, gates

- [x] `docs/DESIGN_screen-structure.md` §1: one amendment paragraph (09-27-26) pointing at
      `DESIGN_spread-mode.md`. `docs/DESIGN_chrome-redesign.md` §2: `extra` sits between Feed
      and Save.
- [x] `CLAUDE.md`: one bullet under Architecture ("**Spread mode on the item screen — 09-27-26**")
      in the house style; the repository-status paragraph gets a sentence that the feed picker
      was rejected and why (one line, the design has the rest).
- [x] `log.md`: extend the 09-27 entry — **Shipped / Decisions / Open** (Ben's replacement glyph)
      — and the spend line from `python3 ~/.claude/scripts/session-spend.py --session <uuid>`.
- [x] Gates: `bun run check`, `bun run test`, `bun run e2e:prod`. Then the CI shape once — the new
      e2e block depends on the fixture rail:
      ```sh
      docker run -d --rm --name ambit-ci-pg -e POSTGRES_USER=ambit -e POSTGRES_PASSWORD=ambit \
        -e POSTGRES_DB=ambit -p 5433:5432 postgres:17-alpine
      export DATABASE_URL=postgres://ambit:ambit@localhost:5433/ambit
      bun run db:migrate && bun run db:seed && bun run build && E2E_PROD=1 bunx playwright test --workers 1
      docker stop ambit-ci-pg
      ```
- [x] Push the branch. Ben looks at 1440 and decides on merge. Not deployed by this session.

## Verification, end to end

1. `bun run dev` (clear port 3000 first: `lsof -ti:3000`), sign in, open a picture from `/feed`
   at ≥ 1280 px. Move the mouse; the rail shows Profile / Feed / **bars glyph** / Save, and the
   Share disc below. Click the glyph: two pictures side by side, each whole, 24 px apart; the
   glyph shows two bars.
2. → turns to the next pair; ← back. Click the right picture: the address bar and the title
   under the strip change to it; Save opens the picker for it. → resets focus to the left.
3. Click the glyph: one picture, the one you had focused. Reload: the mode is remembered.
4. Narrow the window below 768 px: single, pill toolbar, no toggle. Widen: spread again.
5. Signed out from `/`: the same, and after 100 pictures the end card takes the next cell.
6. Escape from any depth: the intact feed, no new page drawn (Network tab: no `feed.page`).
