# Ambit — brief for a Claude Design session: "More of this / Less of this"

_Written 10-08-26 to paste into Claude Design, continuing from the "1b" package
(`docs/ambit_Redesign_4/`, its `README.md` and `tokens.css` are the design system; everything
below is drawn in it). It describes the one feature, what the app already has where the feature
goes, the one question Ben wants to settle visually, and what the export should contain so it
drops onto the code. Companion: `docs/DESIGN_more-or-less.md` (the mechanics, which are fixed)._

---

## 1. The feature in one paragraph

Ambit learns a reader's taste from **saves**: a new save nudges the saved picture's topic up, and
the toast says so ("Saved to Art · Now drifting toward Cartography"). Saving is a curatorial act
— pick a list, maybe name one — and most readers don't do it, so for them the feed never learns.
**More or less** adds a quiet pair of one-tap reactions on every picture: **More of this** nudges
the topic up a smaller step than a save (and the picture joins an automatic "More of this" shelf
on Saved); **Less of this** nudges the topic down, cools it as a destination for the feed's drift
and jump, and the picture never comes back. Both are private, carry no counts, and are reversible
(tap again to undo; Profile → Topics shows what was cooled). **It is not a like.** No hearts, no
thumbs, nothing that reads as approval of the artwork — the two words are about the feed.

## 2. Decided already (draw inside these)

- **Wording:** "More of this" / "Less of this" wherever there is room for words.
- **Glyphs** where there isn't: a **plus** and a **minus**, in the icon set's 1.7–2 px round-capped
  stroke, square (no radius). **Marked state is inverted ink** — a filled `#F2F2F2` square with the
  glyph in `#0E0E0E` — exactly how a checked segment is drawn. **Not green**: the accent's seven
  jobs are pinned (6 px dot, progress tick / compass, focus ring, hover underline, the saved
  bookmark's fill, the "Proposed" tag, input focus / inline error) and this adds none.
- **Surfaces:** everywhere Save is — the feed tile's long-press sheet, the desktop tile's hover
  strip, the item screen's chrome (rail on desktop; **phone: open, §4**), plus a chip on Saved and
  a small section on Profile → Topics.
- **Ground rules from 1b stand:** the toolbars keep the production glass and geometry unless you
  decide to redraw the item pill (§4 option B); no header bars; no rounded corners except the nav
  pill/rail and circular things; the feed layout does not change; on-photo controls stay very
  low-opacity glass (`rgba(14,14,14,.30)`, `blur(10px)`, 0.5 px `white/18`).
- **Toasts** are the existing white mono block: "More of this · Now drifting toward Cartography",
  "Less of this · Drifting away from Cartography", "Undone".

## 3. What is already on each surface (so you start from the real thing)

**Feed tile, long-press / right-click sheet** (`item-sheet.tsx`): slides up; the item's title at
20 px over a rule; a 46 px white "Closer look" block; a **Share** row (18 px glyph, 15 px label,
`white/8` hairline, 13 px vertical padding); mono eyebrow "Save to collection"; hairline
collection rows with 38 px 2×2 thumbnails; "New collection…" at the foot. **Where do More / Less
go?** The natural slot is two rows beside Share (same anatomy, + and − glyphs), marked rows
inverted — confirm or improve.

**Feed tile, hover strip** (desktop only, `tile-actions.tsx`): fades in over the tile's top edge
(10 px inset): left, a glass chip "‹collection name› ⌄" (32 px tall, 0 × 11 padding, Hanken
14 px, max 70 % of the tile); right, a 32 px glass square with a 15 px bookmark (filled green
when saved). Tiles are ~270 px wide at 1440 (four columns in an 1120 px column). **Three squares
on the right (−, +, bookmark) at 32 px with 6 px gaps are 108 px; the chip must shrink to ~50 %.**
Decide the order and whether the pair sits with the bookmark or at the strip's bottom edge.

**Item screen, desktop** (`rail-toolbar.tsx`): a vertical glass rail fixed at the right edge —
Profile · Feed · (Magazine view toggle) · Save, 52 px buttons, 16 px gaps — and **Share as a
detached 68 px disc** below it. The rail has room: two more 52 px buttons. Confirm placement
(between the toggle and Save? below Save?) and whether marked state inverts a glass button.

**Item screen, phone** (`pill-toolbar.tsx`, `item-screen.tsx`): the picture fills the viewport;
the chrome starts hidden, a tap toggles it, scrolling past 24 px shows it and it stays. The chrome
is a frosted pill fixed 26 px from the bottom — Profile · Feed · Save, 48 px buttons at 28 px gaps
with 22 px end padding, **244 px wide** — in the middle column of a `1fr auto 1fr` grid, with
**Share as a detached 56 px disc centred in the right column** (79 px wide at 402). The left
column is empty. Below the fold (22 px gutters): the title at 32 px, "from _source_ ↗", summary,
fact rows (`92px | 1fr`, mono labels: From · By · License · Topic), a 40 px inline white
"Original source" button, "Where Ambit would wander next" rows.

**Saved** (`saved-screen.tsx`): a title block ("Saved", mono count), a row of square filter chips
(`sm`: 13.5 px, 8 × 12 padding — All · each collection), the masonry wall, and on each tile a
square low-opacity glass badge (30 px, filled green bookmark) that removes the item.

**Profile → Topics** (`topics-screen.tsx`): search; the stored exhibition; the reader's topics as
rows grouped under facet headings, each with a four-way segmented level control (a little · some ·
a lot · off); "Retake the questions".

## 4. The question: where does the pair live on the phone item screen?

Three 48 px buttons at today's gaps make the pill 244 px; five would make it **396 px on a 402 px
screen**, and the Share disc no longer fits beside it. Options Ben wants to see drawn, at 402 ×
874 with a real picture behind the chrome:

- **A. First row below the fold.** Two outline buttons, "More of this" / "Less of this", as the
  first row under the picture (above the title, or between the summary and the fact rows). No
  chrome change; one scroll away. The long-press sheet on the feed stays the phone's one-tap
  surface.
- **B. Redraw the item pill.** The item screen's pill becomes Feed · Save · More · Less (Profile
  is one tap away via Feed), or the gaps shrink so five fit — with the Share disc still beside it.
  This changes the chrome 1b just approved; show it anyway.
- **C. A disc in the empty left column.** Mirrors Share: a 56 px glass disc that opens a two-row
  popover / sheet ("More of this" / "Less of this"). Two taps, but one tap from the picture. What
  glyph is on the disc?
- **D. Something better.** A long-press on the picture is unused (a tap toggles chrome,
  double-tap zooms, pinch zooms); a swipe up from the pill; the pair riding the chrome as a second
  glass strip above the pill. If one of these is right, draw it and say what gesture it costs.

Judge each by: one tap or two from the picture; thumb reach at 874 px tall; how it reads when the
picture is dark vs bright (the glass); whether a reader could mistake it for a like.

## 5. Also design, briefly

- The **marked state** on glass (strip squares, rail buttons, any disc): inverted ink square as
  decided, or a variant that survives on a bright photograph — show both.
- **Saved:** the "More of this" chip in the filter row, and the shelf tile's badge (a + in place
  of the bookmark; tapping it undoes). The title block's count stays saves-only.
- **Profile → Topics:** a small "Showing less of" section under the grouped mix — the cooled
  topics' names, each with a "Warm up" text link — only when there is at least one.
- **The tile sheet's two rows** and whether a marked row reads clearly (trailing mono "ON"? the
  inverted glyph? the row's own fill?).
- **Reduced motion** is already handled globally; nothing here animates except the existing fades.

## 6. Export format that drops onto the code

- Screens as images or `.dc.html` at **402 × 874** (phone item, phone feed sheet, Saved, Topics)
  and **1440 × 900** (desktop item with the rail, the hover strip on a tile), in the 1b system.
- Component states as tables (rest · hover · focus-visible · pressed · marked · marked+hover),
  one row per state, columns fill / border / glyph colour / motion — not code.
- The phone placement decision stated in one sentence, with the geometry (sizes, gaps, offsets).
- Anything renamed, in one list. The two glyphs as SVG paths on a 24 or 26 grid.

What the code does with it: the mechanics (`docs/DESIGN_more-or-less.md`) and everything
underneath the surfaces are built first; the export settles Tasks 10–14 of
`docs/PLAN_more-or-less.md`, which are the surfaces.

