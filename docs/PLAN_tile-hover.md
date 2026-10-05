# Tile hover — the "Lift" — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 10-04-26 by Fable 5.1, from the design bundle below and a read of every file named
here at `main` = `f16b080`; re-checked against `main` 10-05-26 (fixtures, ring users, class
strings all still as stated). **For:** a cold session on a cheaper model, on a plain branch
`feat/tile-hover` off `main` (Ben's convention — no worktree, unless another session holds the
checkout).

**Goal:** on a desktop, hovering or keyboard-focusing a feed tile lifts it — a 3.5% scale, a
deep shadow, above its neighbours — over 350 ms; the dev-only tier tag fills with the accent; the
keyboard ring becomes the design's 2 px inset lavender. Phones see nothing new.

**Architecture:** the lift is one class string, `TILE_LIFT` (new leaf `tile-lift.ts`), applied to
the **wrapper** that already holds each card tile and its hover strip — `FeedGrid`'s
`group/tile relative` div, and `SavedTile`'s `relative` div — so the strip rides up with the
picture and every card kind lifts the same way, while Because and message tiles (no wrapper
class) stay still. Three new tokens in `globals.css` (`--shadow-lift`, `--ease-lift`,
`--color-focus-ring`), and the wrapper is exempted from the reduced-motion collapse the way the
landing's `.motion-gentle` is. No server change, no new dependency, no JavaScript.

**Tech Stack:** Next.js 16.2 App Router, React 19, Tailwind v4.3, Vitest 4 (+ jsdom), Playwright
1.62, Bun 1.4. **No new dependencies.**

**Spec:** `docs/tile-hover/tile-hover/README.md` (+ `ambit-tile.css`, `tile-hover.tokens.json`,
`demo.html` — open the demo in a browser to see the target). Read the README first; it is short.
The bundle is Ben's chosen option 1a from a Claude Design exploration. **Three of its details
were decided differently with Ben on 10-04-26** — see Decisions below; where the bundle and
this plan disagree, this plan wins.

## Decisions (with Ben, 10-04-26)

1. **The tier tag stays dev-only.** The design draws a `DRIFT` / `CORE` / `JUMP` tag on every
   tile and fills it with the accent on hover. In the app that tag is `DebugBadge`, rendered only
   when the server put `card.debug` on the card (FEED_DEBUG / dev). It takes the design's look and
   the accent fill; production tiles stay "the image and nothing else" (`image-tile.tsx` header).
2. **The Because tile stays inert and gets no hover.** The demo makes it a link to a topic route
   that does not exist; `BecauseTile` is inert on purpose (PHASE5_PLAN_5.6.md Decision 2). A hover
   state on something that does nothing would promise a click it can't honour. Not touched.
3. **The keyboard ring is the design's: 2 px, inset, `#A8AEFF`** (a fixed lavender, not the accent
   knob). This supersedes `docs/DESIGN_chrome-redesign.md` §4's 3 px off-white ring, which was
   Ben's 09-11-26 answer to a 2 px *indigo* ring vanishing on photographs — the lift and shadow
   now carry focus visibility, so the ring can be the design's.

Calls made here and stated rather than asked:

- **The lift runs under Reduce Motion**, as the design's README says ("a 3.5% scale isn't the kind
  of motion that setting is meant to stop"). Ben has Reduce Motion **on** on both his devices
  (CLAUDE.md, 09-26-26), so without this he would see the tile snap to size — and read it as a bug.
  Same route as the landing's reel: a class the global collapse exempts. The README's `.ambit-calm`
  opt-in is **not** built — nothing in the app would ever set it (YAGNI).
- **The lift is on the wrapper, not the tile.** The hover strip (`TileActions`) is a *sibling* of
  the tile inside the wrapper; scaling the tile alone would leave the strip's buttons stationary
  while the picture grew under them. The wrapper has no `overflow`, so nothing clips the lift.
- **Article cards and writing tiles lift too**, because they share the wrapper. `ArticleCard`
  keeps its one-step hover fill and its press-scale (nested transforms compose). The design's
  Because card scales a 0.5 px border, so the design already accepts a scaled hairline; whether
  the article card's hairline blurs at 1.035 is for Ben's 1440 look (Task 7).
- **Saved gets the same lift** (Task 5). It is literally the same tiles on the same wall; a wall
  that lifts beside one that doesn't would read as a bug. `/explore` gets it for free through
  `FeedGrid`.

## Global constraints

- TDD: the test first, watched to fail, then the code. `bun run test` per task, `bun run check`
  (typecheck + lint + prettier + tests) before each commit. Commit per task.
- Comment generously: Ben is a returning webdev and the repo teaches. Cite this plan's Decision
  numbers and the bundle path in comments, the way `image-tile.tsx` cites
  `docs/DESIGN_chrome-redesign.md`.
- **Tailwind v4's `scale-*` writes the standalone `scale` property, not `transform`** (the same
  family as the `translate-*` trap in CLAUDE.md). So the transition must name `scale`, not
  `transform` — `transition-[scale,box-shadow]` — and e2e asserts the computed `scale`
  property, which reads `"1.035"`, never `transform`.
- Tailwind v4's `hover:` variant is already wrapped in `@media (hover: hover)`, which is the
  design's "pointer devices only" rule for free. Do not add a media query of your own.
- Class strings must be **literal** in source — Tailwind's scanner reads text, so a template
  string that builds `scale-[${s}]` generates no rule. `TILE_LIFT` is one literal string.
- Every `<img>` of an item stays `/api/img/{id}` or a `data:` URL. This plan adds no image.
- Nothing below `md` changes visibly. The tile's touch gestures (`usePress`) are untouched.
- Prettier runs on commit: `bunx prettier --write <the files you touched>` before `bun run check`.
- Do not push or merge; Ben looks at 1440 first (Task 7).
- `bun run e2e:prod`, never `bun run e2e`, for the Playwright suite (CLAUDE.md: the dev overlay
  eats clicks at a phone width). It needs port 3000 free: `lsof -ti:3000` first.

## Review focus

Inputs the spec implies that no task's test exercises on its own, most likely to bite first.
Each line names where its check lives.

1. **A tile hovered during page one's 600 ms rise-in.** `Rise` animates `transform` with
   `fill-mode: both`; while it runs, the Rise div is a stacking context and a lifted tile inside
   it paints *under* the later columns. The keyframe ends at `transform: none` (verified), so
   after 600 ms the context is gone. Accepted: a half-second window on first paint. Task 7's
   look confirms a lifted tile's shadow overlaps its right-hand neighbour once the page is still.
2. **An iPad with a trackpad, or a touch laptop.** `(hover: hover)` is the only gate — a device
   that reports hover lifts on hover and a tap there lifts until the next tap, exactly as the
   design accepts. No stuck lift on a pure touch screen: Ben's phone look, Task 7 item 6 (the
   e2e phone project is a mouse at a phone width, so it cannot stand in — Task 6 says why).
3. **Reduce Motion on (Ben's machines).** The lift eases over 350 ms; the strip's 200 ms fade,
   the badge's fill and the ring's appearance still snap — only the wrapper itself is exempted
   (`.motion-lift`, not `.motion-lift *`), so the exemption cannot leak into the tile's children
   or the Rise above it. Task 1's selector pin.
4. **The strip's buttons after the wrapper has scaled.** They move ~2.5% with it; Playwright
   re-resolves a locator's box at click time, and the existing hover test clicks *after* hovering
   — Task 6 keeps that test green as the proof.
5. **A keyboard reader on a wall of photographs.** Focus must be visible on any picture: the lift
   plus shadow plus a lavender ring. Task 6's keyboard e2e asserts the lift; the ring colour is
   Ben's look.

---

### Task 1: Branch, the tokens and the reduced-motion exemption

**Files:**

- Modify: `src/styles/globals.css` (the `@theme` block near lines 76–87; the reduced-motion
  rule near line 406)
- Test: `src/styles/globals.test.ts`

**Interfaces:**

- Produces: three theme tokens and the utilities Tailwind derives from them — `shadow-lift`,
  `ease-lift`, `outline-focus-ring` (also `text-focus-ring`, unused) — and one plain class,
  `motion-lift`, that the reduced-motion collapse skips. Tasks 2–5 use all four.

- [ ] **Step 1: Branch**

The design bundle and this plan are already committed on `main` (10-04-26). Leave the untracked
`docs/first-exhibition-for-ambit/` alone — it is another thread's.

```bash
cd /Users/ben/Dev/ambit
git status -sb            # expect: main, clean apart from docs/first-exhibition-for-ambit/
git checkout -b feat/tile-hover
```

- [ ] **Step 2: Write the failing tests**

In `src/styles/globals.test.ts`, change the existing reduced-motion test and add one. The
existing assertion `toContain(":not(.motion-gentle, .motion-gentle *),")` will stop matching
once the selector gains `.motion-lift`, so it changes with the rule:

```ts
describe("globals.css reduced motion", () => {
  const css = readFileSync(join(__dirname, "globals.css"), "utf8");
  const block = css.slice(
    css.indexOf("@media (prefers-reduced-motion: reduce)"),
  );

  it("exempts the .motion-gentle subtrees from the 0.01 ms collapse", () => {
    expect(block).toContain(
      ":not(.motion-gentle, .motion-gentle *, .motion-lift),",
    );
    expect(block).toContain(":not(.motion-gentle, .motion-gentle *)::before");
    expect(block).toContain(":not(.motion-gentle, .motion-gentle *)::after");
    expect(block).not.toMatch(/^\s*\*,\s*$/m);
  });

  // The feed tile's lift (docs/PLAN_tile-hover.md, 10-04-26) runs under Reduce Motion by the
  // design's own rule: a 3.5% scale is not the motion that setting targets, and Ben — who has it
  // on — would read a snap as a bug. Only the element itself is exempt, never its subtree: the
  // strip's fade, the badge's fill and the ring still collapse.
  it("exempts the .motion-lift element itself, and not its children", () => {
    expect(block).toContain(".motion-lift)");
    expect(block).not.toContain(".motion-lift *");
  });
});
```

And in the second `describe`, a compile test for the tokens. Tailwind emits a theme variable
only when a utility uses it, so this passes only once Tasks 2–3 have put `shadow-lift`,
`ease-lift` and `outline-focus-ring` in source — **write it now, expect it to fail until Task 3,
and do not commit Task 1 with it red**: add it in this task's file but wrap it in `it.skip` until
Task 3, where Step 5 un-skips it.

```ts
  // The Lift's three tokens (docs/PLAN_tile-hover.md Task 1). A theme token Tailwind sees no
  // utility for is dropped from the build, so this fails if nothing in src uses them. The shadow
  // is INLINED by `shadow-*` (into `--tw-shadow`), so its value is what to look for, not its
  // variable name; the ease and colour come through as variables.
  it.skip("emits the tile lift's shadow, ease and focus-ring tokens", async () => {
    const from = join(__dirname, "globals.css");
    const out = await postcss([tailwind()]).process(
      readFileSync(from, "utf8"),
      { from },
    );
    expect(out.css).toContain("0 22px 44px");
    expect(out.css).toContain("--ease-lift");
    expect(out.css).toContain("--color-focus-ring");
  }, 60_000);
```

(Verified 10-04-26 by compiling the exact class strings of Tasks 2–4 through the repo's
`@tailwindcss/postcss` 4.3.3: `has-[:focus-visible]:` → `:has(:is(:focus-visible))`,
`group-has-[:focus-visible]/tile:` → `:is(:where(.group\/tile):has(:is(:focus-visible)) *)`,
`transition-[scale,box-shadow]` → `transition-property: scale,box-shadow`, `hover:` wrapped in
`@media (hover: hover)`, `hover:shadow-lift` → `--tw-shadow: 0 22px 44px …`. All emitted.)

- [ ] **Step 3: Run the tests to watch them fail**

Run: `bunx vitest run src/styles/globals.test.ts`
Expected: FAIL — "exempts the .motion-gentle subtrees" (the new selector text is absent) and
"exempts the .motion-lift element itself" (`.motion-lift)` absent); the compile test skipped.

- [ ] **Step 4: Add the tokens to `@theme`**

In `src/styles/globals.css`, after `--shadow-toolbar` (line ~80) add:

```css
  --shadow-lift: 0 22px 44px rgba(0, 0, 0, 0.6); /* a hovered or focused feed tile, risen above
                                       its neighbours (docs/tile-hover/, "Lift", 10-04-26) */
```

After `--ease-sheet` (line ~87) add:

```css
  /* The feed tile's lift (docs/tile-hover/): a fast start that settles — the whole 3.5% scale
     and shadow arrive in 350 ms without a bounce. */
  --ease-lift: cubic-bezier(0.2, 0.8, 0.2, 1);
```

In the colour section of the same `@theme` block, after `--color-ink-hi`'s comment ends, add:

```css
  --color-focus-ring: #a8aeff; /* the keyboard ring on a feed tile: 2 px, inset, a fixed lavender
                                   that is NOT the accent knob (docs/PLAN_tile-hover.md Decision 3).
                                   Replaced the 3 px off-white of DESIGN_chrome-redesign.md §4 on
                                   10-04-26, once the lift and shadow also marked focus. */
```

- [ ] **Step 5: Exempt `.motion-lift` from the collapse**

Change the first selector of the reduced-motion rule (line ~407) — **only the first**; the
`::before` and `::after` lines stay as they are:

```css
@media (prefers-reduced-motion: reduce) {
  :not(.motion-gentle, .motion-gentle *, .motion-lift),
  :not(.motion-gentle, .motion-gentle *)::before,
  :not(.motion-gentle, .motion-gentle *)::after {
```

And extend the comment above the rule (the paragraph that ends "the sheet is outside both
subtrees and still collapses.") with:

```
   A second opt-out (10-04-26, docs/PLAN_tile-hover.md): `.motion-lift`, the feed tile wrapper's
   hover lift. Deliberately the element alone and not `.motion-lift *` — the strip, badge and ring
   inside it still collapse; only the 350 ms scale-and-shadow runs, per the design's own rule
   that a 3.5% lift is not what the setting targets. */
```

- [ ] **Step 6: Run the tests to watch them pass**

Run: `bunx vitest run src/styles/globals.test.ts`
Expected: PASS (two reduced-motion tests, the two existing keyframe tests; one skipped).

- [ ] **Step 7: Check and commit**

```bash
bunx prettier --write src/styles/globals.css src/styles/globals.test.ts
bun run check
git add src/styles/globals.css src/styles/globals.test.ts
git commit -m "feat(tile-hover): lift tokens and the .motion-lift reduced-motion exemption

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `TILE_LIFT` and the feed grid's wrapper

**Files:**

- Create: `src/components/feed/tile-lift.ts`
- Modify: `src/components/feed/feed-grid.tsx:249-259` (the wrapper div)
- Test: `src/components/feed/feed-grid.test.tsx`

**Interfaces:**

- Consumes: `shadow-lift`, `ease-lift`, `motion-lift` from Task 1.
- Produces: `export const TILE_LIFT: string` — the wrapper's full class list, beginning with
  `relative`. Callers add `group/tile` themselves (Task 5 does for Saved).

- [ ] **Step 1: Write the failing test**

Append to the `describe("FeedGrid")` block in `src/components/feed/feed-grid.test.tsx`:

```tsx
  // The Lift (docs/tile-hover/, docs/PLAN_tile-hover.md Task 2): the hover state lives on the
  // wrapper, so the strip rides up with the picture and every card kind lifts alike. Tailwind
  // v4's `scale-*` writes the standalone `scale` property, so the transition names `scale`.
  it("lifts a card's wrapper on hover and keyboard focus, never a message tile", () => {
    const { container } = render(
      <FeedGrid
        {...baseProps}
        tiles={[
          image("i1"),
          { kind: "message", key: "message-0", message: "about" },
        ]}
        renderMessage={() => <p>m</p>}
      />,
    );
    const wrapper = container.querySelector('[data-feed-id="i1"]')!;
    expect(wrapper).toHaveClass(
      "group/tile",
      "relative",
      "motion-lift",
      "z-[1]",
      "transition-[scale,box-shadow]",
      "duration-[350ms]",
      "ease-lift",
      "hover:z-[2]",
      "hover:scale-[1.035]",
      "hover:shadow-lift",
      "has-[:focus-visible]:z-[2]",
      "has-[:focus-visible]:scale-[1.035]",
      "has-[:focus-visible]:shadow-lift",
    );
    // The message tile has no wrapper class at all, same as a Because tile.
    const message = screen.getByText("m").parentElement!;
    expect(message.className).toBe("");
  });
```

- [ ] **Step 2: Run the test to watch it fail**

Run: `bunx vitest run src/components/feed/feed-grid.test.tsx`
Expected: FAIL — the wrapper lacks `motion-lift` and the rest.

- [ ] **Step 3: Create `tile-lift.ts`**

```ts
// The feed tile's hover and keyboard-focus state — "Lift", Ben's option 1a from
// docs/tile-hover/ (10-04-26; docs/PLAN_tile-hover.md has the decisions). The tile grows 3.5%,
// rises above its neighbours under a deep shadow, over 350 ms on a fast-start curve. Keyboard
// focus looks the same (the ring itself is the tile's — image-tile.tsx, article-card.tsx).
//
// **Applied to the wrapper, not the tile.** In `FeedGrid` the wrapper holds the tile *and*, on a
// fine pointer, its hover strip (`TileActions`) as a sibling; lifting the wrapper carries both,
// where lifting the tile alone would leave the strip's buttons standing still over a growing
// picture. It also means every card kind — picture, writing, article — lifts identically, and
// Because / message tiles, which get no wrapper class, stay put (Decision 2).
//
// Why each piece:
//   - `relative z-[1]` → `hover:z-[2]`: the shadow has to paint OVER the neighbouring columns.
//     That works only because no ancestor between this wrapper and <main> is a stacking context
//     — `Rise`'s keyframe ends at `transform: none` on purpose, and the grid/column divs carry no
//     transform, opacity or z-index. Give one of them a `z-index` and the lift goes under.
//   - `transition-[scale,box-shadow]`, not `transition-transform`: Tailwind v4's `scale-*` sets
//     the standalone `scale` property (same family as the `translate` trap in CLAUDE.md).
//   - `hover:` is already `@media (hover: hover)` in Tailwind v4 — a touch screen never matches,
//     so a tap can't leave a tile stuck lifted (the design's gotcha #2).
//   - `has-[:focus-visible]:` lifts the wrapper when the focusable tile inside it has *keyboard*
//     focus; `focus-within` would also fire on a mouse click, which must not lift.
//   - `motion-lift`: globals.css exempts this element — and only this element, not its subtree —
//     from the reduced-motion collapse, so the lift eases under Reduce Motion as the design asks.
//
// One literal string: Tailwind's scanner reads source text, so nothing here may be composed.
export const TILE_LIFT =
  "relative z-[1] motion-lift transition-[scale,box-shadow] duration-[350ms] ease-lift hover:z-[2] hover:scale-[1.035] hover:shadow-lift has-[:focus-visible]:z-[2] has-[:focus-visible]:scale-[1.035] has-[:focus-visible]:shadow-lift";
```

- [ ] **Step 4: Apply it in `feed-grid.tsx`**

Import it (with the other `./` imports):

```ts
import { TILE_LIFT } from "./tile-lift";
```

Replace the wrapper's `className` (currently
`className={isCard ? "group/tile relative" : undefined}`) and its comment:

```tsx
                    // `group/tile` + `TILE_LIFT`: the hover strip below is a sibling overlay
                    // keyed on this wrapper's hover (docs/DESIGN_chrome-redesign.md §3), and the
                    // Lift (tile-lift.ts) scales the whole wrapper so tile and strip rise as one.
                    // Second child on purpose — e2e reaches the tile as `[data-feed-id] > *`
                    // `.first()`.
                    className={isCard ? cn("group/tile", TILE_LIFT) : undefined}
```

`cn` is already imported in this file.

- [ ] **Step 5: Run the tests to watch them pass**

Run: `bunx vitest run src/components/feed/feed-grid.test.tsx src/components/feed/feed-screen.test.tsx`
Expected: PASS. `feed-screen.test.tsx`'s "mounts a tile strip per card…" still passes — it
asserts `toHaveClass("group/tile", "relative")`, both of which the wrapper still carries.

- [ ] **Step 6: Check and commit**

```bash
bunx prettier --write src/components/feed/tile-lift.ts src/components/feed/feed-grid.tsx src/components/feed/feed-grid.test.tsx
bun run check
git add src/components/feed/tile-lift.ts src/components/feed/feed-grid.tsx src/components/feed/feed-grid.test.tsx
git commit -m "feat(tile-hover): the Lift on every feed card's wrapper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The 2 px lavender keyboard ring

**Files:**

- Modify: `src/components/feed/image-tile.tsx:103-110` (the wrapper `className` + comment)
- Modify: `src/components/feed/article-card.tsx:71-77` (the `className`)
- Test: `src/components/feed/image-tile.test.tsx:107-120`
- Test: `src/components/feed/article-card.test.tsx` (add one test)
- Test: `src/styles/globals.test.ts` (un-skip Task 1's compile test)

**Interfaces:**

- Consumes: `outline-focus-ring` from Task 1.
- Covers every focusable tile: `WritingTile` renders an `ImageTile` (`writing-tile.tsx:38`), so
  it takes the ring from there; `BecauseTile` is inert and has no ring (Decision 2). These two
  files are the only users of `outline-ink-hi` in `src` (verified 10-05-26) — a grep for it after
  Step 3 should find only tests.

- [ ] **Step 1: Change the failing tests**

In `src/components/feed/image-tile.test.tsx`, replace the test at lines ~107–120:

```tsx
// Decision 4 (docs/DESIGN_chrome-redesign.md §4): no hover zoom on the picture itself — the Lift
// (docs/PLAN_tile-hover.md) is on the wrapper, in feed-grid.tsx. The ring is the design's 2 px
// inset lavender (Decision 3 there), which replaced §4's 3 px off-white on 10-04-26.
it("has no hover zoom of its own and a 2px inset focus ring", () => {
  render(
    <ImageTile card={card("a")} aspectClass="aspect-square" onTap={vi.fn()} />,
  );
  const tile = screen.getByRole("button", { name: "A title" });
  expect(tile.querySelector("img")?.className).not.toMatch(/scale/);
  expect(tile.className).not.toMatch(/scale/);
  expect(tile).toHaveClass(
    "focus-visible:outline-focus-ring",
    "focus-visible:outline-2",
    "focus-visible:-outline-offset-2",
  );
  expect(tile).not.toHaveClass("focus-visible:outline-ink-hi");
});
```

In `src/components/feed/article-card.test.tsx`, add inside the
`describe("ArticleCard — desktop input")` block. The file already defines a `card(id)` fixture
whose item is titled `"A title"`, which is the accessible name the tile gets:

```tsx
  // The same ring as the picture tile (docs/PLAN_tile-hover.md Decision 3).
  it("wears the 2px inset focus ring", () => {
    render(<ArticleCard card={card("a")} onTap={vi.fn()} />);
    const tile = screen.getByRole("button", { name: "A title" });
    expect(tile).toHaveClass(
      "focus-visible:outline-focus-ring",
      "focus-visible:outline-2",
      "focus-visible:-outline-offset-2",
    );
  });
```

- [ ] **Step 2: Run the tests to watch them fail**

Run: `bunx vitest run src/components/feed/image-tile.test.tsx src/components/feed/article-card.test.tsx`
Expected: FAIL on both new/changed tests — the classes are still `outline-ink-hi` / `outline-[3px]`.

- [ ] **Step 3: Change the rings**

In `src/components/feed/image-tile.tsx`, the wrapper's comment and class (lines ~104–108) become:

```tsx
        // The `focus-visible` ring is so a keyboard reader can see where they are without the
        // phone ever showing one (`:focus-visible` never matches a touch). 2 px of lavender,
        // inside the edge — the Lift's ring (docs/tile-hover/; docs/PLAN_tile-hover.md
        // Decision 3). It replaced DESIGN_chrome-redesign.md §4's 3 px off-white on 10-04-26: the
        // lift and shadow on the wrapper (feed-grid.tsx) now mark focus too, so the ring no longer
        // has to be legible on its own against any photograph.
        "focus-visible:outline-focus-ring relative block w-full cursor-pointer touch-manipulation overflow-hidden outline-none select-none focus-visible:outline-2 focus-visible:-outline-offset-2",
```

In `src/components/feed/article-card.tsx`, in the `cn(...)` at line ~75 replace
`focus-visible:outline-ink-hi` with `focus-visible:outline-focus-ring`,
`focus-visible:outline-[3px]` with `focus-visible:outline-2`, and
`focus-visible:-outline-offset-[3px]` with `focus-visible:-outline-offset-2`. Extend the comment
above it:

```tsx
        // The hover lift is one step up the fill ladder, not a transform: this card has a border,
        // and scaling a hairline is how you get a blurry hairline. (Since 10-04-26 the *wrapper*
        // around it does scale — the Lift, feed-grid.tsx / tile-lift.ts — which Ben accepted at
        // 1.035 for the design's own bordered Because card; this fill stays as the card's own
        // hover.) `hover:` and `focus-visible:` are both pointer/keyboard-gated, so a phone sees
        // neither (see `image-tile.tsx`). The ring is the Lift's (docs/PLAN_tile-hover.md
        // Decision 3).
```

Also update the stale line in `image-tile.tsx`'s `<img>` comment (line ~150): change
"the tile's hover feedback is the strip `FeedScreen` lays over it" to "the tile's hover feedback
is the Lift on its wrapper (feed-grid.tsx) and the strip `FeedScreen` lays over it".

- [ ] **Step 4: Run the tests to watch them pass**

Run: `bunx vitest run src/components/feed/image-tile.test.tsx src/components/feed/article-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Un-skip the compile test and run it**

In `src/styles/globals.test.ts`, change `it.skip("emits the tile lift's shadow…` to `it(`.

Run: `bunx vitest run src/styles/globals.test.ts`
Expected: PASS — all three tokens are now used by a utility somewhere in `src` (`shadow-lift` and
`ease-lift` in `tile-lift.ts`, `outline-focus-ring` here), so Tailwind emits them. If
`--color-focus-ring` is missing, check that the class in `image-tile.tsx` is spelled exactly
`focus-visible:outline-focus-ring`.

- [ ] **Step 6: Check and commit**

```bash
bunx prettier --write src/components/feed/image-tile.tsx src/components/feed/article-card.tsx src/components/feed/image-tile.test.tsx src/components/feed/article-card.test.tsx src/styles/globals.test.ts
bun run check
git add src/components/feed/image-tile.tsx src/components/feed/article-card.tsx src/components/feed/image-tile.test.tsx src/components/feed/article-card.test.tsx src/styles/globals.test.ts
git commit -m "feat(tile-hover): the 2px inset lavender keyboard ring on picture and article tiles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The dev tier tag takes the design's look and the accent fill

**Files:**

- Modify: `src/components/feed/debug-badge.tsx`
- Create: `src/components/feed/debug-badge.test.tsx`

**Interfaces:**

- Consumes: the `group/tile` wrapper from `FeedGrid` (Task 2) and, after Task 5, `SavedTile`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FeedCard } from "~/server/services/feed";
import { DebugBadge } from "./debug-badge";

// Dev-only by construction: `card.debug` exists only when the server composed with FEED_DEBUG.
function card(debug: boolean): FeedCard {
  return {
    item: {
      id: "a",
      source: "met",
      sourceId: "a",
      type: "image",
      title: "A title",
      summary: null,
      body: null,
      imageUrl: "https://example.test/a.jpg",
      imageWidth: null,
      imageHeight: null,
      kind: null,
      readingMinutes: null,
      sourceUrl: "https://example.test/o",
      attribution: null,
      license: null,
      tags: [],
      topicId: "botany",
      curationScore: 8,
      aestheticTags: [],
      fetchedAt: new Date("2026-10-04T00:00:00Z"),
    },
    tier: "DRIFT",
    topicId: "botany",
    ...(debug ? { debug: { why: "drift from botany", curationScore: 8 } } : {}),
  } as FeedCard;
}

describe("DebugBadge", () => {
  it("renders nothing without card.debug — production never shows a tier", () => {
    const { container } = render(<DebugBadge card={card(false)} />);
    expect(container).toBeEmptyDOMElement();
  });

  // The design's tag (docs/tile-hover/ README "Behaviour" row "Tag"): bg → accent on the
  // wrapper's hover or keyboard focus, over 200 ms (docs/PLAN_tile-hover.md Decision 1).
  it("wears the design's tag look and fills with accent on the wrapper's hover/focus", () => {
    render(<DebugBadge card={card(true)} />);
    const tag = screen.getByText("DRIFT");
    expect(tag).toHaveAttribute("title", "drift from botany");
    expect(tag).toHaveClass(
      "bg-bg/72",
      "text-ink",
      "text-[10px]",
      "font-medium",
      "tracking-[0.6px]",
      "transition-colors",
      "duration-200",
      "group-hover/tile:bg-accent",
      "group-has-[:focus-visible]/tile:bg-accent",
    );
  });
});
```

`FeedCard.debug` is `{ why: string; curationScore: number }` (`src/server/services/feed.ts:133`);
if it has grown, fill the new fields in rather than widening the cast.

- [ ] **Step 2: Run the test to watch it fail**

Run: `bunx vitest run src/components/feed/debug-badge.test.tsx`
Expected: FAIL on the second test — the current classes are `bg-scrim/60 text-ink/70 … px-1`.

- [ ] **Step 3: Restyle the badge**

Replace `src/components/feed/debug-badge.tsx`'s body:

```tsx
import * as React from "react";

import type { FeedCard } from "~/server/services/feed";

// SPEC §9's standing "debug overlay + tuning knobs ship behind a dev flag throughout development"
// requirement, in its cheapest possible form: the tier that produced this card, in the corner of
// the tile, with the engine's own `why` string on hover.
//
// No flag check is needed here — `card.debug` is only ever populated when the *server* has
// FEED_DEBUG on (or is in dev), so its mere presence is the flag. In production the field is
// absent and this renders nothing. **That is a decision, not an accident** (docs/PLAN_tile-hover.md
// Decision 1, 10-04-26): the Lift design draws this tag on every tile, and Ben kept it dev-only —
// production tiles stay the picture and nothing else.
//
// Its look is the design's tag (docs/tile-hover/ambit-tile.css `.ambit-tile__tag`): 10 px medium,
// 0.6 px tracking, ink on the screen background at 72%, 3/6/3/5 padding. On the wrapper's hover
// or keyboard focus it fills with the accent over 200 ms — `group-hover/tile` is the same group
// the hover strip keys on (feed-grid.tsx), and `group-has-[:focus-visible]/tile` is the keyboard
// half of the Lift (tile-lift.ts). The fill snaps under Reduce Motion: only the wrapper itself is
// exempt from the collapse, by design.
export function DebugBadge({ card }: { card: FeedCard }) {
  if (!card.debug) return null;
  return (
    <span
      title={card.debug.why}
      className="bg-bg/72 text-ink absolute top-0 left-0 py-[3px] pr-[6px] pl-[5px] text-[10px] leading-[1.3] font-medium tracking-[0.6px] transition-colors duration-200 group-hover/tile:bg-accent group-has-[:focus-visible]/tile:bg-accent"
    >
      {card.tier}
    </span>
  );
}
```

- [ ] **Step 4: Run the test to watch it pass**

Run: `bunx vitest run src/components/feed/debug-badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
bunx prettier --write src/components/feed/debug-badge.tsx src/components/feed/debug-badge.test.tsx
bun run check
git add src/components/feed/debug-badge.tsx src/components/feed/debug-badge.test.tsx
git commit -m "feat(tile-hover): the dev tier tag in the design's dress, accent-filled on hover

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Saved lifts too

**Files:**

- Modify: `src/components/saved/saved-tile.tsx` (the `relative` wrapper, line ~52, and the header
  comment)
- Test: `src/components/saved/saved-screen.test.tsx`

**Interfaces:**

- Consumes: `TILE_LIFT` from Task 2.

- [ ] **Step 1: Write the failing test**

Find the test in `src/components/saved/saved-screen.test.tsx` around line 178 that asserts
`document.querySelectorAll("[data-saved-id]")).toHaveLength(2)`, and add after it in the same
test (or as a new `it` beside it, using the same render setup that test uses):

```tsx
    // The Lift (docs/PLAN_tile-hover.md Task 5): the same tiles as the feed, on the same wall —
    // Saved's wrapper carries the same classes as FeedGrid's, so one wall never lifts beside one
    // that doesn't. The unsave badge is inside the wrapper and rises with it.
    const wrapper = document.querySelector('[data-saved-id="img1"]')!;
    expect(wrapper).toHaveClass(
      "group/tile",
      "relative",
      "motion-lift",
      "hover:scale-[1.035]",
      "hover:shadow-lift",
      "has-[:focus-visible]:scale-[1.035]",
    );
```

- [ ] **Step 2: Run the test to watch it fail**

Run: `bunx vitest run src/components/saved/saved-screen.test.tsx`
Expected: FAIL — the wrapper's class is only `relative`.

- [ ] **Step 3: Apply `TILE_LIFT` in `saved-tile.tsx`**

Import:

```ts
import { TILE_LIFT } from "~/components/feed/tile-lift";
import { cn } from "~/lib/utils";
```

Change the wrapper (`<div className="relative" data-saved-id={item.id}>`) to:

```tsx
      {/* `group/tile` + the Lift (docs/PLAN_tile-hover.md Task 5): the same hover and keyboard
          lift as the feed's wrapper in feed-grid.tsx, so Saved is the same wall. The group name
          is what lets the dev tier tag (debug-badge.tsx) fill here too. The unsave badge below is
          inside this wrapper and rises with the picture. */}
      <div className={cn("group/tile", TILE_LIFT)} data-saved-id={item.id}>
```

Add to the header comment, after the paragraph about the badge being a sibling overlay:

```
// Since 10-04-26 the wrapper also carries the feed's Lift (`TILE_LIFT`): hover or keyboard focus
// scales wrapper, tile and badge together, 3.5% over 350 ms. docs/PLAN_tile-hover.md.
```

- [ ] **Step 4: Run the tests to watch them pass**

Run: `bunx vitest run src/components/saved/saved-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
bunx prettier --write src/components/saved/saved-tile.tsx src/components/saved/saved-screen.test.tsx
bun run check
git add src/components/saved/saved-tile.tsx src/components/saved/saved-screen.test.tsx
git commit -m "feat(tile-hover): Saved's tiles lift like the feed's

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end — the lift measured in a real browser

**Files:**

- Modify: `e2e/desktop.spec.ts` (the hover-strip test at line ~170, plus one new test after it)

**No phone-project assertion, on purpose.** The `chromium` project is `Desktop Chrome` at a
402 × 874 viewport — a *mouse*, not a touch device (playwright.config.ts says why) — so
`(hover: hover)` matches there and a hovered tile *would* lift. A test asserting it doesn't would
fail for the wrong reason, and emulating touch would change what every other spec in that project
exercises. The touch gate is Tailwind's documented `hover:` behaviour; Ben's phone look (Task 7
item 6) is its check.

**Interfaces:**

- Consumes: everything above, through a production build.

- [ ] **Step 1: Extend the desktop hover test**

In `e2e/desktop.spec.ts`'s test "hovering a tile reveals its strip; one click saves; the chevron
opens the picker beneath", directly after `await first.hover();` and before the strip's opacity
assertion, add:

```ts
    // The Lift (docs/PLAN_tile-hover.md): the WRAPPER scales and rises. Tailwind v4's `scale-*`
    // writes the standalone `scale` property, so that — never `transform` — is what to read.
    await expect(first).toHaveCSS("scale", "1.035");
    await expect(first).toHaveCSS("z-index", "2");
    // Tailwind's `shadow-*` composes five layers (inset, inset-ring, ring-offset, ring, shadow);
    // the computed value lists four transparent ones before ours, so match ours, not the whole.
    await expect(first).toHaveCSS(
      "box-shadow",
      /rgba\(0, 0, 0, 0\.6\) 0px 22px 44px 0px/,
    );
```

The rest of the test is unchanged and is the proof that the strip's buttons are still clickable
after the wrapper has scaled under them (Review focus 4).

- [ ] **Step 2: Add the keyboard test**

After that test, add:

```ts
  // The keyboard half of the Lift (docs/PLAN_tile-hover.md Task 6, Review focus 5): Tab onto a
  // tile and the wrapper lifts exactly as on hover. `:has(:focus-visible)` on the wrapper — a
  // programmatic `.focus()` may or may not count as "visible" focus in Chromium, so this uses the
  // real key. Tab lands on the toolbar first; the loop walks until a tile is focused.
  test("keyboard focus lifts the tile like a hover", async ({ page }) => {
    await page.goto("/feed");
    const first = page.locator("[data-feed-id]:has(img)").first();
    await expect(first).toBeVisible();
    // Park the mouse off the grid so no tile is hovered while we read the scale.
    await page.mouse.move(0, 0);

    await expect(async () => {
      await page.keyboard.press("Tab");
      const onTile = await page.evaluate(() => {
        const el = document.activeElement;
        return (
          el instanceof HTMLElement &&
          el.getAttribute("role") === "button" &&
          el.closest("[data-feed-id]") !== null
        );
      });
      expect(onTile).toBe(true);
    }).toPass({ timeout: 10_000 });

    const focused = page.locator("[data-feed-id]:has(:focus)");
    await expect(focused).toHaveCSS("scale", "1.035");
    await expect(focused).toHaveCSS("z-index", "2");

    // Tabbing away relaxes it.
    await page.keyboard.press("Shift+Tab");
    await expect(focused).toHaveCount(0);
    await expect(first).toHaveCSS("scale", "1");
  });
```

Note `first` may not be the tile Tab reaches first; the test reads the *focused* wrapper and
only uses `first` to wait for the grid and to assert the relaxed value on a tile that is not
hovered.

- [ ] **Step 3: Run the suite against a production build**

```bash
lsof -ti:3000 && echo "port 3000 is held — stop that process first"
bun run e2e:prod
```

Expected: all green (the suite was 61+ passing at `main`; the counts here add two). If the
keyboard test cannot land on a tile within 10 s, print `document.activeElement.outerHTML` in the
loop to see what Tab is walking; the toolbar and the dev drawer come first in document order.

- [ ] **Step 4: Commit**

```bash
bunx prettier --write e2e/desktop.spec.ts
bun run check
git add e2e/desktop.spec.ts
git commit -m "test(tile-hover): the lift measured — hover scale, shadow and z-index, keyboard focus

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Docs, the log, and Ben's look

**Files:**

- Modify: `docs/DESIGN_chrome-redesign.md:228-234` (§4 — a superseded note)
- Modify: `CLAUDE.md` (one sentence in the chrome-redesign Architecture bullet)
- Modify: `log.md` (extend today's entry — one heading per day)

- [ ] **Step 1: Mark §4 of the chrome redesign superseded**

After the §4 paragraph in `docs/DESIGN_chrome-redesign.md` (line ~234, ending "keeps its
one-step hover fill."), add:

```
> **Superseded 10-04-26 by the Lift** (`docs/tile-hover/`, `docs/PLAN_tile-hover.md`): the tile
> hover is back as a 3.5% scale + shadow on the *wrapper* (tile and strip rise together), and the
> ring is the design's 2 px inset lavender `--color-focus-ring`. Decision 4's reasoning — the old
> 3% zoom on the picture alone "barely visible and clunky" — stands; the Lift is a different thing.
```

- [ ] **Step 2: One sentence in CLAUDE.md**

In the Architecture bullet beginning "**The chrome redesign shipped 09-11-26**", after "The hover
zoom is gone; the focus ring is 3 px off-white." replace that sentence with:

```
The hover zoom went on 09-11; **the Lift replaced it 10-04-26** (`docs/tile-hover/`,
`docs/PLAN_tile-hover.md`): `TILE_LIFT` on the card *wrapper* in `FeedGrid` and `SavedTile` —
3.5% scale + `shadow-lift` over 350 ms, `hover:` and `has-[:focus-visible]:`, exempt from the
reduced-motion collapse as `.motion-lift` (the element, not its subtree); the ring is 2 px inset
`--color-focus-ring`; the tier tag stays dev-only and fills with accent. Tailwind v4's `scale-*`
is the standalone `scale` property, so transitions and e2e name `scale`, never `transform`.
```

- [ ] **Step 3: Log it**

Extend the `### [[10-04-26 Sun]]` entry in `log.md` (do not add a second heading for the day):
a `**Shipped:**` line for the Lift on `feat/tile-hover`, a `**Decisions:**` block with this
plan's three decisions in a line each, and `**Open / next:**` — Ben's 1440 look (the article
card's hairline under scale; a lifted tile's shadow over its right-hand neighbour; the ring on a
pale photograph), then merge. End with the session-spend line per CLAUDE.md
(`python3 ~/.claude/scripts/session-spend.py --session <uuid>`; omit the line if it exits
non-zero).

- [ ] **Step 4: Check and commit**

```bash
bunx prettier --write docs/DESIGN_chrome-redesign.md CLAUDE.md log.md
bun run check
git add docs/DESIGN_chrome-redesign.md CLAUDE.md log.md
git commit -m "docs(tile-hover): the Lift is built — superseded §4 note, CLAUDE.md, log

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Ben's look (Ben, not the executor)**

Dev server on `:3000` (`lsof -ti:3000` first), Firefox at 1440 and the phone over the tailnet:

1. `/feed`: hover a picture in the middle column — it grows, its shadow lies over both
   neighbours, nothing clips. Hover an article card — does the hairline blur? Hover a writing
   tile — the scrim and title rise with it.
2. Tab through the feed — each tile lifts with a 2 px lavender ring inside its edge; on the
   palest picture in view, is the ring enough together with the lift?
3. With FEED_DEBUG on, the tier tag fills indigo (or the chosen accent) on hover.
4. Reduce Motion stays on: the lift eases over 350 ms; the strip still appears at once.
5. `/profile` → Collections → a collection: the Saved wall lifts the same way.
6. Phone: nothing new — a tap opens the item, nothing grows.

Verdicts go in the log's **Open / next**; then merge to `main`.

---

## Self-review

**Spec coverage** — README "Behaviour" table: transform ✓ (Task 2), shadow ✓ (Task 1 token,
Task 2), z-index 1→2 ✓ (Task 2), tag rest/active ✓ (Task 4, dev-only per Decision 1), focus ring
✓ (Tasks 1, 3), Because card — deliberately not built (Decision 2), 350 ms + curve ✓ (Tasks 1, 2),
200 ms tag ✓ (Task 4). "Gotchas": don't clip ✓ (wrapper has no overflow; grid/column have none),
hover limited to pointer ✓ (Tailwind's `hover:` is `@media (hover: hover)`; no e2e stand-in — Task 6
says why — so Ben's phone look, Task 7 item 6, is the check), reduced motion ✓ (runs
by default, `.ambit-calm` dropped by decision), accent via `--ambit-accent` ✓ (the app's own
`bg-accent` knob).

**Type consistency** — `TILE_LIFT` (Task 2) is the name Task 5 imports; `--color-focus-ring` →
`outline-focus-ring` in Tasks 3; `motion-lift` is the class in Task 1's selector and Task 2's
string; the group name `group/tile` is what Task 4's `group-hover/tile` and
`group-has-[:focus-visible]/tile` resolve against, and Task 5 adds it to Saved.

**Review focus** — 1 → Task 7 look; 2 → Task 7 look item 6 (no e2e stand-in, by the reasoning in
Task 6); 3 → Task 1 tests; 4 → Task 6 Step 1 (the existing clicks after the scale); 5 → Task 6
Step 2 + Task 7 look.
