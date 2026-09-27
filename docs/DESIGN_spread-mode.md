# Spread mode — two pictures at a time on the desktop item screen — design

**Written:** 09-27-26 by Fable 5.1, from Ben's ask for a feed layout picker
(`docs/layout-picker/`) and five questions answered in chat the same afternoon.
**Status:** design approved 09-27-26; plan `docs/PLAN_spread-mode.md`, ready to execute cold on
a plain branch `feat/spread-mode` off `main` (`9fd734a`).

## Why

Ben's opening ask was a **feed** layout picker: 1 / 2 / 4 columns on a computer, 1 / 2 on a
phone, the desktop 2-column a "magazine" of big pictures side by side, the 1-column a plain
infinite-scroll feed. He drew the control — a bars glyph that morphs between four, two and one
bar, a "Layout" pick list, tokens in `docs/layout-picker/layout-picker.tokens.json`, and a
self-contained web component as the prototype.

Thinking it through against the code killed the feed version, for four reasons that compound:

- **The crop.** Every feed tile is `object-cover` into one of eight cycled fake aspect ratios
  (`IMAGE_ASPECTS` in `components/feed/masonry.ts`, written before migration 0009 gave `item`
  real `image_width/height`). A crop is fine for a 270 px thumbnail and wrong for a 560 px page:
  a painting cropped to a made-up 100:142 is a wrong picture. Fixing it means inline aspect
  ratios from the dimensions, with a fallback for rows not yet cached.
- **Switching layouts remounts every tile.** `packColumns` places tiles under column `<div>`s
  keyed by index; a repack moves them to new parents, React remounts them, images reflash, retry
  state resets, and the saved `scrollY` means nothing in the new layout.
- **The server always packs page one at two columns.** A localStorage pick can't be read on the
  server, so every document load would paint at two and jump. The accent knob's pre-paint
  script trick works for a CSS variable, not for JS packing.
- **`useColumnCount` is shared** by the feed, `/`, Saved and the profile Collections tab
  (square covers, where one column would be odd).

Every one of those is work the **item screen** has already done. At desktop `/i/[itemId]`
shows the picture full-viewport, whole, `object-contain`, centred in a 12 px inset
(`DESIGN_screen-structure.md` §1, amended 09-11-26); the wander rail is already its sequence;
←/→, Escape, the down-flick and `useLeaveToFeed` already exist. So the magazine moved there.

## Decisions (with Ben, 09-27-26)

1. **No feed picker.** The feed, Saved and Collections are untouched.
2. **The magazine is a mode of the item screen, desktop only** (`md`, the one breakpoint —
   `DESIGN_desktop-polish.md` §1): two consecutive rail pictures side by side, like an open
   magazine. Ben: "make the magazine view an option in the gallery view on desktop only. i feel
   like it makes more sense there anyway."
3. **Turn the page: step by two.** Pairs are stable — 1-2, then 3-4 — never a sliding window.
4. **A plain toggle, not a pick list.** Two states need no menu.
5. **Ben's bars glyph is a placeholder.** He is drawing another; the icon is one swappable
   component so the new mark drops in.
6. Picture shape was also decided for the feed version ("real shape in 1 and 2 columns only,
   today's crops at 4") and is moot now: the hero is already uncropped.

## D1. What a spread is

The hero track keeps its three cells (before / current / after). In spread mode each cell holds
**two pages** instead of one. The current cell is `items[index]` and `items[index + 1]`; the
cell after is `items[index + 2 .. index + 3]`; the cell before is `items[index - 2 .. index - 1]`.
Pairing is **relative to the current index**, never a global odd/even rule — the entry item is
always the left page of the first spread, and a head extension that prepends an odd batch
changes nothing.

- `advance(±1)` moves the index by `pages` (1 or 2), clamped at the loaded ends as today
  (`max(0, index - 2)` going back; going forward refuses past `items.length - 1`, the same
  rubber-band).
- The pre-fetch margin is `PREFETCH_MARGIN * pages`, so a turn never lands on an unloaded pair.
- If the rail ends on an odd count, the right page is **blank** (`bg-immersive`), a magazine's
  last verso. Never a repeat, never a wrap.
- Explore (signed-out from `/`): the end card takes the cell after the current pair when
  `capped`, as it takes the next cell today; standing on it is `atEnd` with the cells
  `[current pair, ["end"], undefined]`. The 100-picture cap counts **`pages` per turn**
  (`writeRailCount(railCount + pages)`), so a spread reader sees the same number of pictures.

## D2. Which page is "the item"

Step-by-two with a fixed left focus would make the right page's picture impossible to save or
share — it is never the left page. So there is a focus.

- `focusSide: 0 | 1`, **left by default**, reset to 0 on every turn and whenever spread turns
  off.
- `current = spread ? (pair[focusSide] ?? pair[0]) : items[index]`. Everything single-item —
  the URL (`replaceState`), `document.title`, Save, Share, the caption, `ItemFacts`,
  `WanderNext` — already reads `current` and learns nothing about spreads.
- **Click rule:** a tap on the *unfocused* page focuses it (chrome untouched); a tap on the
  focused page, or on a blank right half, toggles the chrome as a tap does today.
  `useRailGestures`' `onTap` gains the tap's `clientX`; the side is
  `clientX < innerWidth / 2 ? 0 : 1` (the current cell fills the viewport).
- **Turning spread off lands on the focused page:** if `focusSide === 1`, `setIndex(index + 1)`
  first. Turning it on keeps the index (the picture you were on becomes the left page).
- Back-to-feed is unchanged: `useLeaveToFeed(entryItem.id)` is keyed on the entry item, so ten
  turns later Back still pops to the intact feed.

## D3. The strip

- A cell is a flex row of its pages. Each page is `flex-1 min-w-0 h-full`, `flex items-center
  justify-center`, with the **12 px inset moved from the cell to the page** (safe-area top
  inset included), so two pictures meet across a 24 px gutter and nothing else is on screen. A
  single-page cell is exactly today's cell.
- Both pages of the current cell load with `fetchPriority="high"`; the neighbours' pages `auto`.
- The caption row in spread mode is `grid grid-cols-2 gap-6`, one caption (title `<h2>` +
  attribution) under each page, the unfocused one at `opacity-55`. The `<h2>` rule stays: the
  page's one `<h1>` is `ItemFacts`'s.
- Keyboard and gestures are unchanged in kind: ←/→ and a horizontal drag call `advance`,
  Escape and the down-flick leave.

## D4. The control and the preference

- **`SpreadToggle`**, a `RailButton` in the desktop rail **between Feed and Save** — where Ben
  put it — rendered through `RailToolbar`'s unused `extra` slot, which moves from after Save to
  between Feed and Save (no caller passes `extra` today, so the move is free). Only the item
  screen passes it, so the feed's rail keeps its three buttons (`e2e/desktop.spec.ts` "rail sits
  at the right edge" is unchanged).
- `aria-label="Two pictures at a time"`, `aria-pressed={spread}`. One click flips the mode.
- **`LayoutGlyph`** (`components/icons/layout-glyph.tsx`): the placeholder, drawn from
  `docs/layout-picker/layout-picker.tokens.json` — four `<rect>`s, the `"1"` bar set for single
  and the `"2"` set for spread, `x`/`width` transitioned over 320 ms with the token easing.
  Firefox does not animate SVG geometry properties, so it switches instantly there (Ben uses
  Firefox — not a bug). Reduce Motion collapses the transition through `globals.css`'s global
  rule. One `pages: 1 | 2` prop; swapping the mark later touches this file only.
- **Preference:** `src/lib/hero-layout.ts`, localStorage key `ambit.heroLayout.v1`, values
  `"single" | "spread"`, default `"single"`; `readHeroLayout` / `writeHeroLayout` /
  `useHeroLayout` on `useSyncExternalStore` with a `"single"` server snapshot, try/catch on every
  access — a copy of `lib/last-collection.ts`'s shape. Per device, deliberately (the accent and
  last-collection precedent): a phone and a computer want different answers, and no DB column
  or migration.
- **Effective mode:** `spread = desktop && layout === "spread"`, where `desktop` is the existing
  `useMediaQuery(DESKTOP_QUERY)`. The server renders single; both stores are corrected during
  hydration the same way the desktop rail already is. Nothing is server-rendered differently
  and no cookie is needed. The second page's image is not server-preloaded (the server can't
  know the mode); it loads with high priority on mount, as a neighbour does today.
- Strangers get it too: a localStorage pick needs no account.

## D5. Testing

Unit (Vitest):

- `rail-cells.test.ts`: `buildCells` — single mode reproduces today's three cells exactly
  (start of rail, middle, end, capped, atEnd); spread at index 0, middle, index 1 (one-page
  prev cell), odd tail (one-page current cell), capped (end card as next cell), atEnd.
- `hero-layout.test.ts`: read/write/subscribe, invalid values read as `"single"`, throwing
  storage.
- `hero-rail.test.tsx`: a two-page cell renders two `<img>`s each with the 12 px inset; a
  one-page cell is today's; existing tests updated to the cell-of-pages shape.
- `item-screen.test.tsx` (with `stubMatchMedia` at desktop + a seeded localStorage): ArrowRight
  moves two; the toggle flips and persists; a click on the right page moves the URL, title,
  facts and Save target to it; a turn resets focus; toggling off from a right focus lands on
  that item; the explore cap counts two per turn; the pre-fetch margin doubles.
- `use-rail-gestures`: a tap passes `clientX`.
- `rail-toolbar` (if tested): `extra` sits between Feed and Save.

Playwright (`desktop` project, 1440 × 900) — one new block in `e2e/desktop.spec.ts`:

- From `/feed`, open a tile. Move the mouse to summon the rail. Click "Two pictures at a time".
- Two `<img>`s in the current cell; the left one's box ends at or before x = 720, the right
  one's starts at or after 720; both inside `hero-frame`.
- ArrowRight: the left page's `alt` is neither of the two previous alts; the URL changed.
- Click the right page (x ≈ 1080, y ≈ 450): the `<h1>` text equals that page's `alt`.
- Click the toggle again: one `<img>` in the current cell, the `<h1>` unchanged.
- Reload: two pages again (the preference survived).
- Escape returns to `/feed` — the existing intact-feed test already covers the tiles.
- The seeded rail: the e2e corpus already serves ArrowRight × 3 in `item.spec.ts`; the initial
  server rail is 9 items (entry + 8), enough for the one turn above at a margin of 6.

## What this leaves open

- Ben's replacement glyph (D4 makes it a one-file swap).
- A phone spread. Landscape phones and iPad portrait get it at ≥ 768 px already; nothing below.
- Focusing a page from the keyboard (↑/↓ or Tab) — not asked for; the click rule is enough.
- The feed picker's tokens stay in `docs/layout-picker/` as the record of what was drawn.
