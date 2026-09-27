# Magazine view — the page turn, and making the spread read as a magazine — design + plan

**Written:** 09-27-26 evening by Opus 5.5, from Ben's two Claude Design packages
(`docs/turnpackage/page-turn/`, `docs/viewTOggleTOkens/view-toggle/`) and a read of
`hero-rail.tsx`, `rail-cells.ts`, `item-screen.tsx` and `use-rail-gestures.ts` on
`feat/spread-mode` at `696f756`. **Status: proposed — not built.** Three questions for Ben
were answered the same evening (end of file).

**Already done in the same session (not part of this plan):** the view-toggle button swap —
`icons/view-glyph.tsx` replaces `layout-glyph.tsx`, label "Magazine view", `M` flips it
(`DESIGN_spread-mode.md` D4, amended).

## What "more like a magazine" means here

Today the spread is two pictures touching at the middle, a slide between spreads borrowed from
the single rail, and the single view's caption split in two. It reads as *two pictures*. Five
things make it read as *a magazine*, in order of how much they carry:

1. **The turn** (Ben's package). A leaf swings 180° around the spine instead of the track
   sliding. This is the one that changes the feel; everything else supports it.
2. **The leaf follows your hand.** A horizontal drag on a spread lifts the leaf and rotates it
   with the pointer; let go past the existing threshold and it finishes the turn from where it
   is, short of it and it falls back. A turn you can hold halfway is what makes it paper rather
   than an animation.
3. **Light on the paper.** The leaf darkens as it stands up (darkest at 90°, where a real page
   is edge-on to the light) and throws a soft shadow onto the page it is about to cover. Without
   this a 3D rotation of a flat image reads as a card flip.
4. **The binding.** The package's 90 px spine gradient over the seam — shadow into the gutter, a
   hairline highlight, shadow out. The pictures already touch (Ben's note this afternoon), so
   the spine is what turns "two images butted together" into "one bound spread".
5. **Folios.** The split caption becomes a magazine's folio line: page number (`03`, tabular,
   tracked, muted), then title and maker, aligned to each page's *outer* edge. The dimmed
   unfocused folio stays as the "which one will Save act on" signal.

And one small one if there's appetite: **the book opens.** Toggling into magazine view swings
the right page open from the spine (the same leaf, 180° → 0); toggling out folds it shut before
the single view fades in (the tokens' `single.enter`, 350 ms opacity). Task 6, droppable.

**Deliberately not proposed:** paper margins or a page colour (Ben asked for the pictures to
fill as much as possible and touch — margins would undo both); a page-curl mesh (the package's
flat leaf plus lighting is the right weight; a real curl needs WebGL); sound; a table of
contents.

## Decisions

**D1. The turn is a visual layer over a committed index.** `advance()` still sets `index` at
once, as today — the URL, `document.title`, Save, Share, `ItemFacts`, Wander next and the
pre-fetch effect all move on the keypress and learn nothing about animation. Alongside it,
`advance` records a **turn**: `{ dir, from: [A, B], to: [C, D], fromAngle }`. While a turn is
live, `HeroRail` draws the current cell from the turn instead of from `cells[1]`:

| forward (A B → C D) | backward (C D → A B) |
|---|---|
| under-left **A**, under-right **D** | under-left **A**, under-right **D** |
| leaf on the right half, hinged on its left edge | leaf on the left half, hinged on its right edge |
| front **B**, back **C**, rotates 0 → −180° | front **C**, back **B**, rotates 0 → +180° |

When the turn ends the cell is `[C, D]` (or `[A, B]`) — exactly what `buildCells` already says
— and the leaf goes. The package commits the index *after* the turn; that would make every
existing test and the URL wait 820 ms for no reader-visible gain, so it is not copied. The
pages the leaf needs are already mounted in `cells[0]`/`cells[2]`, so they are decoded before
the turn starts.

- A pure `turnLayers(turn)` in `rail-cells.ts` returns `{ under: [L, R], front, back, hinge }`
  — the table above, unit-tested, including a lone last page (a forward turn onto `[C]` has an
  empty under-right; the blank verso) and a backward turn from index 1 (one page before).
- **The end state is drawn one frame before the leaf is removed**: set the cell to its final
  pages, then drop the leaf on the next `requestAnimationFrame`, so the swap of under-left
  A → C happens beneath the leaf's back face, never in view.

**D2. Driven by the Web Animations API, not a CSS transition.** `leaf.animate()` on
`transform` (and the two shade layers' `opacity`) from `fromAngle` to ±180°, 800 ms,
`cubic-bezier(.45,.05,.25,1)`, `perspective: 2800px` on the stage — the tokens. `finished`
ends the turn. Why WAAPI: a drag hands over a *starting angle*, which a CSS transition can't
start from without a style flush dance; `animation.finished` is a promise where `transitionend`
is an event that doesn't fire if anything interrupts; and **jsdom has no `Element.animate`**, so
`finishTurn()` runs immediately there — the existing item-screen tests keep asserting
`currentPages()` straight after `key("ArrowRight")` without fake timers. Guard it as
`typeof leaf.animate === "function"`.

The remaining time for a released drag scales with the remaining angle
(`800 × (180 − |fromAngle|) / 180`, floor 200 ms) so a half-turned page doesn't crawl.

**D3. Input while a page is turning is ignored** (the package's rule). `advance` returns early
while a turn is live; so does the drag. Holding → therefore turns once per 800 ms, which is
paper's pace. The toggle and `M` are also ignored mid-turn.

**D4. The drag drives the leaf in spread mode; the track no longer slides.** In spread mode
`HeroRail` ignores `dragPx` for the track's transform and hands it to the leaf instead:
`angle = clamp(dragPx / (innerWidth / 2) × 180, −180, 180)`, dragging left lifts the right page
(forward), right lifts the left page (back). `useRailGestures` needs no change — it already
reports `dragPx` live and calls `onAdvance` on release past its far-or-fast threshold. What
changes is `advance`: it reads the drag angle at release and passes it as `fromAngle`. A drag
past a loaded end (the rubber-band) lifts nothing — `turnLayers` returns no leaf when there is
no next spread. **Single mode keeps its slide, untouched.**

**D5. Lighting.** Each face carries an absolutely positioned shade layer:
- on the leaf, a linear gradient darkest at the hinge (`rgba(0,0,0,.35)` → 0), its opacity
  `sin(angle)` — 0 flat, 1 edge-on;
- on the page being covered, a shadow band next to the spine that widens and darkens as the
  leaf approaches it (opacity `max(0, (|angle| − 90) / 90)` × 0.4).
For a drag these are set from the angle each frame; for an animated turn they are keyframed in
the same `animate()` call (three offsets: 0, 0.5, 1). Numbers are starting points for Ben's eye.

**D6. The spine.** A `pointer-events-none` 90 px strip centred on the current cell's seam,
`z` above the pages and below the leaf, the tokens' gradient verbatim. Present on every spread
including a lone last page (the binding doesn't vanish because the facing page is blank).

**D7. Folios replace the spread caption.** In spread mode the caption row becomes two folios,
each `flex items-baseline gap-3.5`, left one `justify-start`, right one `justify-end` with its
number on the outside: number `text-[11px] font-semibold tracking-[1.2px] tabular-nums
text-ink/40`, title `text-[14px] text-ink-hi truncate`, maker `text-[11.5px] text-ink/46`
(`attribution ?? sourceLabel(source)`, as today). The unfocused folio keeps `opacity-55`. The
title stays an `<h2>` (the page's one `<h1>` is `ItemFacts`'s). The folios live in the same
`gallery-chrome` overlay as today's caption and fade with the chrome — a tap still gives a clean
spread. **During a turn they fade to 0 over 300 ms** and return with the new pages.

- **Page numbers count from the entry picture as `01`.** Forward is 02, 03…; the number is
  `index − entryIndex + 1`, where `entryIndex` is `items.findIndex(i => i.id === entryItem.id)`
  (a head prepend shifts both, so the difference is stable). **Pages before the entry count
  down through zero into negatives** (Ben, 09-27-26): `00`, `−01`, `−02`… — two digits after
  the sign, with a true minus (U+2212) so it sits on the same width as the digits in tabular
  figures.

**D8. Reduced motion: the turn plays anyway** (Ben, 09-27-26 — the profile glyph's precedent,
not the landing's). `globals.css` collapses CSS transitions and animations under reduced
motion, **but not WAAPI animations**, so driving the turn with `animate()` (D2) is also what
lets it play there; nothing needs `.motion-gentle`. The shade layers and the folio fade must be
in the same `animate()` calls for the same reason — a CSS-transitioned folio fade would snap.
Say so in a comment where the turn starts, since it is the one exemption from the rule.

**D9. Desktop only, as the spread is.** Nothing below `md` changes; the pill branch is
untouched.

## Tasks

Branch: stay on `feat/spread-mode` (not merged yet, and this is the same feature). TDD per the
repo's convention; `bun run test` per task, `bun run check` before each commit; commit per task;
comment generously and cite the D-numbers above.

### Task 1 — `turnLayers`, pure
- [ ] Test first in `rail-cells.test.ts`: forward and backward from a middle spread; forward onto
      a lone last page; backward from index 1; no leaf when there is no next/previous spread;
      no leaf in single mode.
- [ ] `export type Turn` and `turnLayers()` in `rail-cells.ts`, per the D1 table.

### Task 2 — The spine and the folios (no motion yet)
- [ ] `hero-rail.test.tsx`: a spread cell renders a `data-testid="spread-spine"`; a single cell
      doesn't.
- [ ] `item-screen.test.tsx`: in a spread the caption shows `01` / `02` at entry, `03` / `04`
      after ArrowRight; titles still `<h2>`; the unfocused folio is dimmed.
- [ ] Build D6 and D7 (numbers from `entryIndex`). Look at it at 1440 before going on —
      this task alone should already read more like a magazine.

### Task 3 — The turn, keyboard and click
- [ ] `ItemScreen`: `const [turn, setTurn] = useState<Turn | null>(null)`; `advance` sets it
      in spread mode (not on the end card, not past a loaded end) and ignores input while it's
      set (D3). `finishTurn` clears it.
- [ ] `HeroRail` gains `turn` + `onTurnEnd` props and a `Leaf` component: two faces, each a
      `RailImage` with the side-correct `object-position` (front hugs the spine from its own
      side, back from the other), `backface-visibility: hidden`, back pre-rotated 180°; the
      stage gets `perspective: 2800px`. `useLayoutEffect` starts `leaf.animate()`; `finished` →
      draw the end state, then `onTurnEnd` on the next frame (D1).
- [ ] Tests: jsdom has no `animate`, so existing tests pass unchanged — verify that first. New:
      stub `Element.prototype.animate` with a controllable fake; assert the under-pages and leaf
      faces mid-turn, that a second ArrowRight mid-turn does nothing, and that the cell is
      `[C, D]` after `finished` resolves.
- [ ] Folios fade during a turn (D7).

### Task 4 — The drag lifts the leaf
- [ ] `HeroRail` in spread mode: the track's transform ignores `dragPx`; while `dragging` and
      there is a next/previous spread, render the leaf at the drag angle with the D5 shades set
      inline.
- [ ] `advance(dir, fromAngle?)` — the gesture's `onAdvance` passes the angle it released at;
      the remaining duration scales (D2).
- [ ] A drag released short: the leaf animates back to 0 (a second, shorter `animate()`), then
      goes. `useRailGestures` resets `dragPx` to 0 on release — the fall-back must start from
      the last angle, so `HeroRail` keeps the last non-zero angle in a ref.
- [ ] Tests: drag half-way and hold — leaf present at ~90°; release far → index +2; release
      short → index unchanged, no leaf after the fall-back.

### Task 5 — Light, and reduced motion
- [ ] D5's shade layers, keyframed in the turn's `animate()` and set per-frame for the drag.
- [ ] D8: the turn plays under reduced motion — test with `stubMatchMedia` including the reduce
      query that the leaf still animates.
- [ ] Ben tunes the numbers by eye (shade peak, shadow width, duration). Leave them as named
      constants at the top of `hero-rail.tsx` with the token they came from.

### Task 6 — The book opens and closes (optional)
- [ ] Toggle on: after the spread renders, the right page's leaf animates 180° → 0 around the
      spine (it starts folded onto the left page). Toggle off: it folds shut (0 → 180°), then
      single mode renders with the tokens' `single.enter` fade. Plays under reduced motion, as the
      turn does (D8).
- [ ] The `prevSpread` render-time adjustment in `ItemScreen` must still land on the focused
      page — run the existing "toggling off from a right focus" test.

### Task 7 — e2e and docs
- [ ] `e2e/desktop.spec.ts`'s spread block: add `page.emulateMedia({ reducedMotion:
      "no-preference" })` (Playwright inherits the Mac's setting — the profile-glyph lesson),
      press ArrowRight, assert a `[data-testid="spread-leaf"]` is visible mid-turn and gone after,
      and that the pages advanced. Keep the existing assertions (they auto-retry past the turn).
- [ ] `bun run e2e:prod` green; the CI-shape run from CLAUDE.md if the fixtures were touched.
- [ ] `DESIGN_spread-mode.md` amendment pointing here; CLAUDE.md's spread bullet; `log.md`.
- [ ] Do not merge or push until Ben has looked at 1440.

## Answered by Ben, 09-27-26

1. Reduced motion: **play the turn anyway** (D8).
2. Pages before the entry: **negative numbers** (D7).
3. Task 6 (the book opens and closes): **in** — "if i don't like it we can just take it out".
