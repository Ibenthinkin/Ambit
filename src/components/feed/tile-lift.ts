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
//     once page one has risen in — `Rise` fills *backwards* only (rise.tsx says why: Firefox
//     keeps a finished `both`-filled animation's stacking context), and the grid/column divs
//     carry no transform, opacity or z-index. Give one of them a `z-index` and the lift goes under.
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
