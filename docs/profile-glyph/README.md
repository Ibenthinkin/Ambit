# Ambit profile glyph (6f)

This is the profile button glyph, the left item in the floating toolbar pill: a rounded head and shoulders (3c) filled with a slow four-color flow that moves outward from the chest. A tap fast-forwards through one full color cycle in 900ms, then fades back into the slow flow.

## Files
- `ambit-profile-glyph.js`: a self-contained web component with no dependencies. It works in React, Vue, Svelte or plain HTML, and also exports `AMBIT_PROFILE_GLYPH_TOKENS`.
- `profile-glyph.tokens.json`: the same values as design tokens (colors, timing, keyframes, geometry).

## Use
```js
import './profile-glyph/ambit-profile-glyph.js';
```
```html
<a href="/profile" aria-label="Profile" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center">
  <ambit-profile-glyph size="29"></ambit-profile-glyph>
</a>
```
In React, `<ambit-profile-glyph size="29" />` works as is. For TypeScript, declare it in `JSX.IntrinsicElements`.

## Attributes
- `size`: size in px (default 29, drawn inside the pill's 31px slot).
- `speed`: multiplier for the slow flow (default 1, a 10-second loop).
- `static`: turns the slow flow off.
- `tap`: `rush` (default, 6f), `flash` (6d's outline swell and rim flash) or `none`.

## Behavior
- **Slow flow:** periwinkle, terracotta, sage, then butter, each moving outward from the chest.
- **Tap (rush):** a second layer plays one full cycle over 900ms. It fades in over the first 10% and out over the last 15%, so the slow flow underneath never restarts. Tapping again restarts the fast cycle.
- A tap doesn't block the normal `click`, so routing stays with your app.
- **Reduced motion** (`prefers-reduced-motion`): a still periwinkle fill, and taps don't animate.

The source explorations are in `Ambit - Glyph Options.dc.html` and `Ambit - Profile Glyph Test.dc.html` (6f) in the project root.
