# Ambit layout picker

> **Not built as a feed picker (09-27-26).** Thinking this through against the code moved the
> magazine idea to the desktop item screen instead — `docs/DESIGN_spread-mode.md` has the why
> (the tiles' cycled crops, the remount on repack, the server's fixed two columns). What survives
> from here: the tokens' `"1"` and `"2"` bar sets are the **placeholder** glyph for
> `src/components/icons/layout-glyph.tsx`, a plain toggle in the rail; Ben is drawing a
> replacement. The rest of this file describes the prototype as drawn.

This is the feed layout button that sits in the floating pill, between the logo and the bookmark. The glyph shows the current layout: four thin bars, two wide bars or one wide bar. Tapping it opens a Layout pick list, and choosing an option smoothly morphs the glyph and tells your feed to reflow.

## Files
- `ambit-layout-picker.js`: a self-contained web component with no dependencies. It also exports `AMBIT_LAYOUT_TOKENS` and `layoutGlyphSVG(cols)`.
- `layout-picker.tokens.json`: the same values as design tokens.

## Use
```js
import './layout-picker/ambit-layout-picker.js';
const picker = document.querySelector('ambit-layout-picker');
picker.addEventListener('layoutchange', e => setColumns(e.detail.cols)); // 4 | 2 | 1
```
```html
<ambit-layout-picker placement="left" persist="ambit.feedLayout.v1"></ambit-layout-picker>
```
In React, attach the listener in a ref callback or `useEffect`, because `onLayoutchange` isn't wired up automatically for custom elements.

## Attributes and methods
- `value`: `4`, `2` or `1` (default `4`). Set it from your own state to make it controlled.
- `placement`: `left` (default, for the vertical desktop pill), `right`, `top` or `bottom` (for the horizontal mobile pill).
- `persist`: a localStorage key. The picker reads it on mount and writes to it on each pick.
- `open()`, `close()` and `toggle()` control the list from code.
- The list closes when you click outside it or press Escape.

## Feed
The feed is a grid with `repeat(cols, minmax(0,1fr))` and a 4px gap. Its maximum width is 1112px, 820px or 560px depending on the column count, and it's centered. Masonry places each item in the currently shortest column, using the image's aspect ratio for height.

## Glyph morph
The glyph always draws 4 rects. In the 2-column and 1-column layouts they overlap, so they read as fewer, wider bars. `x` and `width` transition over 320ms with `cubic-bezier(.3,1.3,.5,1)`, which needs CSS geometry properties (Chromium and Safari 17+). In older browsers the glyph switches instantly instead of morphing.

The source design is `Ambit - Feed Desktop.dc.html` in the project root.
