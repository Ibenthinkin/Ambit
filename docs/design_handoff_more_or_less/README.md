# Handoff: Ambit — "More of this / Less of this"

## Overview
Adds a two-button feedback pair — **Less of this** / **More of this** — to every Ambit item view (article, single image, magazine spread) on phone and desktop. "More" boosts the item's topic and adds it to a new auto shelf on Saved; "Less" cools the topic and suppresses the item. The chosen direction is **1a: a worded pair placed as the first row after the content**. It sits on the page (not on glass), so it never competes with the production toolbar.

## About the design files
The `.dc.html` files here are **design references built in HTML** — they show intended look and behaviour, not production code. Recreate them in Ambit's existing codebase using its components, patterns and tokens. Open them directly in a browser (they need `support.js` beside them).

## Fidelity
**High-fidelity.** Colours, type, sizes, spacing and placement are final. **Placement and size of the pair on desktop single and magazine views matter most** — match them exactly.

## Decisions (locked 10-09-26)
1. **Option 1a** chosen over 1b (redraw pill), 1c (± disc), 1d (strip above pill). Toolbars/pill/Share disc are **unchanged**.
2. **Order is always Less → More** (left → right), then Save lives in the toolbar.
3. **Placement rule: the pair follows the thing it's about.**
   - Phone single image: first row directly under the image.
   - Phone magazine (stacked): one pair under each figure's image, above its title.
   - Phone + desktop article: at the end of the text, after the source link, under a `FINISHED · N MIN READ` label, above "Where Ambit would wander next". Never mid-text.
   - **Desktop single image: directly under the work's title** in the right (wide) info column, between the 28px title and `[Read the post..]`.
   - **Desktop magazine spread: one pair per figure, directly under each figure's 40px title**, above the maker line. Each work can belong to a different topic, so each gets its own pair.
4. Only one of the pair can be on at a time per item. Tapping the on button again undoes.
5. Feed layout does not change.

## Component: the pair

| | Phone | Desktop single + spread | Desktop article |
|---|---|---|---|
| Layout | 2-col grid, `1fr 1fr`, full content width (402 − 2×22 padding) | `grid-template-columns: 220px 220px` (fixed, left-aligned) | 2-col `1fr 1fr`, full 720 reader width |
| Height | 48px | 48px | 52px |
| Gap | 8px | 10px | 10px |
| Glyph | 16px, 26-grid, stroke 2, round caps | 16px | 16px |
| Label | Hanken Grotesk 400, 15px | 16px | 16px |
| Icon–label gap | 9px | 10px | 10px |
| Spacing | 18px below image (single); 14px (magazine) | 22–24px below title | 16px below FINISHED label; 48px above it |

Glyph paths (viewBox 0 0 26 26): **Less** `M6 13h14` · **More** `M13 6v14M6 13h14`.

### States
| State | Fill | Border | Text/glyph | Motion |
|---|---|---|---|---|
| Rest | transparent | 1px `rgba(255,255,255,.32)` | `#F2F2F2` | — |
| Hover | `rgba(255,255,255,.06)` | 1px `rgba(255,255,255,.6)` | `#FFFFFF` + 2px inset bottom `#2BB24C` | 120ms ease |
| Focus-visible | as hover | + 2px `#2BB24C` outline, 3px offset | | none |
| Pressed | — | — | — | scale .97, 90ms |
| On (marked) | `#F2F2F2` | 1px `#F2F2F2` | `#0E0E0E` | fill swap 120ms |
| On + hover | `#FFFFFF` | — | `#0E0E0E` + green inset underline | 120ms |

Square corners. `aria-pressed` reflects on/off. Green is used only for hover underline and focus ring.

### Feedback after a tap
- **Toast** (existing component): `#F2F2F2` bg, `#0E0E0E` Geist Mono 11px uppercase, 0.3px tracking, 10×14 padding, centred above the toolbar (phone: bottom 96px).
  - More: `MORE OF THIS · NOW DRIFTING TOWARD {Topic}`
  - Less: `LESS OF THIS · DRIFTING AWAY FROM {Topic}`
  - Undo: `UNDONE`
- **Note line under the pair while on** (Geist Mono 10.5px uppercase, `#8A8A8A`, line-height 1.5, 10px top margin):
  - More: `Added to your "More of this" shelf on Saved. Tap again to undo.`
  - Less: `This one won't come back. {Topic} is cooled — Profile → Topics to warm it up. Tap again to undo.`

## State / data
- Per-item value: `'more' | 'less' | null`. Prototype persists to `localStorage['ambit.moreless.v1']` as `{ [itemId]: 'more'|'less' }` — replace with the real API.
- Each item needs a **topic** for toast copy and ranking (prototype `DRIFT` map).
- `more` → raise topic weight; add item to the Saved "More of this" shelf.
- `less` → lower topic weight; exclude item from future loads; add topic to Profile → Topics "Showing less of" (with `[Warm up..]`).
- On a spread, state is **per figure**, not per spread.

## Related surfaces (from exploration page, not yet locked — see `reference/`)
- Feed long-press sheet gets "Less of this" / "More of this" rows after Share; marked row shows `ON · TAP TO UNDO`.
- Saved: new filter chip **More of this** after All, hairline before collections.
- Profile → Topics: new section **Showing less of** with `[Warm up..]` per row.
- Desktop feed hover strip (−, +, Save squares) and veil-in-place for "Less" on a tile.
Confirm these with design before building.

## Tokens
- Ink `#0E0E0E` · page `#0E0E0E` / image bg `#0A0A0A` · white block `#F2F2F2` · text `#E6E6E6` / `#BDBDBD` / muted `#8A8A8A` / `#9A9A9A`
- Accent Kelly green `#2BB24C` (hover underline, focus ring only)
- Hairlines `0.5px rgba(255,255,255,.14–.16)`
- Type: Hanken Grotesk (body, labels, titles — regular weight, sentence case); Geist Mono (small uppercase meta)
- Radius 0 everywhere except toolbar pill/disc.

## Files
- `Ambit - More or Less 1a Screens.dc.html` — **the spec**: P1 article, P2 single, P3 magazine (phone 402×874); D1 article, D2B single, D3B spread (desktop).
- `Ambit - Item Image 1a.dc.html` — working phone prototype (tap, toast, note, undo, persistence). `?itemId=cedar|tiger|patience|gate|wheat|sunland|temple|wave|turner|gp|nebula`.
- `reference/Ambit - More or Less (explorations).dc.html` — 1a–1d options, glass marked-state study, sheet/Saved/Topics, desktop hover strip, state tables.
- `reference/BRIEF_more-or-less.md` — original brief.
- `assets/ml/*.webp` — sample imagery only (not production content). Titles/captions on the new samples are invented.
