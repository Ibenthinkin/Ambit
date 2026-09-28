# Ambit page turn: `<ambit-spread>`

This is a magazine-style image viewer. It shows two pages side by side that meet at a shaded spine, and turning a page swings the page 180° around the spine in 3D. It also has a single-image mode that crossfades between images.

## Files
- `ambit-spread.js`: a self-contained web component with no dependencies. It also exports `AMBIT_SPREAD_TOKENS`.
- `demo.html`: a minimal working example, paired with `<ambit-view-toggle>`.

## Use
```js
import './page-turn/ambit-spread.js';
const spread = document.querySelector('ambit-spread');
spread.items = [
  { src: 'a.jpg', title: 'The Great Wave', maker: 'Hokusai · c. 1831' },
  { src: 'b.jpg', title: 'The Starry Night', maker: 'Van Gogh · 1889' },
];
spread.addEventListener('pagechange', e => console.log(e.detail)); // { index, mode }
```
```html
<ambit-spread folios keyboard style="width:100%; height:100vh"></ambit-spread>
```
The component fills whatever box you give it, so size it with CSS.

## Attributes
- `mode`: `spread` (default) or `single`.
- `index`: the current page. In spread mode it's the left page.
- `folios`: shows a caption under each page with the page number, title and artist or source.
- `keyboard`: turns pages with ← and → (Space also turns forward). It's ignored while the user is typing in a text field.
- `clickzones`: clicking the left or right half turns back or forward. It's on by default; set it to `off` to disable.
- `loop`: wraps around at the ends. It's on by default; set it to `off` to stop at the first and last page.
- `duration`: the page turn length in ms (default 800).

## Methods
- `next()` and `prev()` turn forward and back. In spread mode each turn moves 2 pages.
- `goTo(i)` jumps to a page.
- `setMode('single' | 'spread')` switches mode.

Calls made while a page is turning are ignored.

## Theming
- CSS variables: `--ambit-spread-bg`, `--ambit-spread-ink`, `--ambit-spread-muted` and `--ambit-spread-font`.
- Shadow parts: `stage`, `page`, `spine` and `folios`.

## Pairing with the view toggle
```js
toggle.addEventListener('viewchange', e => spread.setMode(e.detail.mode));
```

## How the turn works
1. The pages underneath swap first. For a forward turn, the right page becomes the one after the next spread.
2. A leaf the size of one page appears over the current page. Its front shows the current page and its back shows the next one. Both faces use `backface-visibility: hidden`, and the back face is rotated 180° in advance.
3. The leaf rotates `0 → -180deg` around its spine edge (`+180deg` for a backward turn), using `cubic-bezier(.45,.05,.25,1)` and a 2800px perspective.
4. When the turn finishes, the index moves by 2 and the leaf is hidden. Every image is already in place, so there's no flicker at the swap.

Each page uses `object-fit: contain`, aligned toward the spine: the left page to the right and the right page to the left. Images with different shapes still meet at the gutter.

The source design is `Ambit - Gallery Desktop.dc.html` in the project root.
