# Ambit loader ("Reach")

This replaces the 800ms ring spinner (`ambitspin`). It's built from the Ambit mark, the ring with a dot in its centre. In each 2.4s cycle the dot moves out to the ring's edge, travels once around it, and returns to the centre, while the ring's opacity pulses.

## Files
- `ambit-loader.js`: a self-contained web component with no dependencies. It also exports `AMBIT_LOADER_TOKENS` and `loaderSVG(opts)`, which returns a static frame.
- `loader.tokens.json`: the same values as design tokens.
- `demo.html`: shows the sizes, labels, accents and the paused state.

## Use
```js
import './loader/ambit-loader.js';
```
```html
<ambit-loader label="finding something interesting…"></ambit-loader>
```

## Attributes
- `size`: in px, default `18`. Use 18 inline next to text, 26 for a block, 64 for a full-screen or hero load. Below 22px the ring stroke thickens from 1.7 to 2 so it stays legible.
- `label`: optional text shown to the right of the loader (Sora 14px, 40% cream, 10px gap). It is also used as the accessible name; without it the name is "Loading".
- `color`: defaults to `var(--ambit-accent, #4C5FE0)`, so it follows the app's accent theme if you set that variable on a parent.
- `duration`: the length of one cycle in ms, default `2400`.
- `paused`: freezes the animation.
- `calm`: if the user has reduced motion turned on, the dot stays in the centre and only the ring pulses. This is opt-in. By default the loader animates fully, because a small, slow orbit isn't the kind of motion the setting is meant to stop.

The element has `role="status"` and `aria-live="polite"`.

## Where it replaces the spinner
- **Feed** (`Ambit - Feed Masonry 3`), the infinite-scroll footer: `<ambit-loader label="finding something interesting…">`
- **Article reader** (`Ambit - Item Text`), while the Wikipedia fetch runs: `<ambit-loader label="fetching the full article…">`
- **Install** sign-in sheet, `sending` state: `<ambit-loader size="16">` inside the button
- Remove the `ambitspin` keyframes and the `spin` motion token from the README.

## Motion
| Phase | Cycle | What happens |
|---|---|---|
| Reach out | 0–22% | The dot moves from the centre to x+11.5 and scales down to 0.55 |
| Orbit | 22–78% | The group rotates 360° about the centre |
| Reach in | 78–100% | The dot returns to the centre at full size |

All three phases use `cubic-bezier(.65,0,.35,1)`. Throughout the cycle the ring's opacity eases from 0.28 to 0.75 and back.

The source exploration is `Ambit - Loader Options.dc.html` (option 1a) in the project root.
