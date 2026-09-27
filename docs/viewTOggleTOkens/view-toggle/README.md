# Ambit view toggle

This is the gallery view button. It sits in the floating pill between the logo and the bookmark, taking the place of the feed's layout picker while the gallery is open. Its glyph shows the current mode: one page in single view, or an open magazine in magazine view (called `spread` in the code). Tapping the button morphs the glyph and switches the view.

## Files
- `ambit-view-toggle.js`: a self-contained web component with no dependencies. It also exports `AMBIT_VIEW_TOKENS` and `viewGlyphSVG(mode)`.
- `view-toggle.tokens.json`: the same values as design tokens, plus the spread tokens (spine shading, page turn and folios).

## Use
```js
import './view-toggle/ambit-view-toggle.js';
document.querySelector('ambit-view-toggle')
  .addEventListener('viewchange', e => setMode(e.detail.mode)); // 'single' | 'spread'
```
```html
<ambit-view-toggle persist="ambit.galleryView.v1"></ambit-view-toggle>
```
In React, attach the listener in a ref callback or `useEffect`, because custom-element events aren't wired up automatically.

## Attributes and methods
- `value`: `single` or `spread` (default `spread`). Set it from your own state to make it controlled.
- `persist`: a localStorage key. The toggle reads it on mount and writes to it on each toggle.
- `hotkey`: the keyboard shortcut (default `m`). Set it to `""` to disable. It's ignored while the user is typing in a text field.
- `toggle()` switches the mode from code.
- The button uses `aria-pressed`, which is `true` in spread mode, and shows the 0.14 white background while it's pressed.

## Swapping it into the pill
When the gallery opens, render `<ambit-view-toggle>` in the pill slot the feed uses for `<ambit-layout-picker>`. Swap the layout picker back in when you return to the feed. Both are 36px buttons, so the pill doesn't shift.

## Glyph morph
The glyph is always two filled paths, one for each page. In single view they meet at x=12 and read as one page. In spread view they separate by a 1.4px gutter and their top and bottom edges curve like an open magazine. `d` transitions over 420ms with `cubic-bezier(.3,1.3,.5,1)`, which works in Chromium. Safari and Firefox swap the glyph instantly instead of morphing.

## Spread (host view)
- **Pages:** each page fills half the stage with `object-fit: contain`. The left page is aligned to the right and the right page to the left, so both images touch the spine.
- **Spine:** a 90px shaded strip centered over the gutter, using the gradient from the tokens.
- **Page turn:** a leaf the size of one page rotates 180° around the spine over 800ms (`cubic-bezier(.45,.05,.25,1)`). Its front shows the current page and its back shows the next one, both with `backface-visibility: hidden`. The page index moves by 2 at 820ms.
- **Folios:** a caption under each page with the page number, title and artist or source, aligned to the outer edges. They fade out during a turn.

The source design is `Ambit - Gallery Desktop.dc.html` in the project root.
