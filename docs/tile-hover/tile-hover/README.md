# Ambit feed tile hover ("Lift")

This is the hover and keyboard-focus state for feed tiles on desktop, chosen as option 1a. The tile grows slightly, rises above its neighbours with a deep shadow, and its tag fills with the accent colour. Keyboard focus looks the same, plus a 2px indigo ring drawn inside the tile.

## Files
- `ambit-tile.css`: drop-in styles. Everything is driven by `:hover` and `:focus-visible`, so no JavaScript is needed.
- `tile-hover.tokens.json`: the same values as design tokens.
- `demo.html`: a 4-column slice of the feed using the styles. It loads images from `demo-assets/`.

## Markup
```html
<a class="ambit-tile" href="/gallery?item=…">
  <img src="…" alt="…" style="aspect-ratio: 0.73">
  <span class="ambit-tile__tag">DRIFT</span>
</a>

<a class="ambit-tile ambit-tile--link" href="/topic/alien">
  …Because eyebrow + “you’ve been exploring …”
  <span class="ambit-tile__to">alien</span>
</a>
```
Use an `<a>` or `<button>` for each tile, or a `<div>` with `tabindex="0"`, so that it can receive keyboard focus.

## Behaviour
| | Rest | Hover / focus-visible |
|---|---|---|
| Transform | none | `scale(1.035)` |
| Shadow | none | `0 22px 44px rgba(0,0,0,.6)` |
| z-index | 1 | 2, so the tile sits above its neighbours |
| Tag | `rgba(22,20,17,.72)` | `var(--ambit-accent, #4C5FE0)` |
| Focus ring | none | inset 2px `#A8AEFF`, keyboard only |
| Because card | `#1C1916`, link `#7B89EA` | `#24201C`, link `#A8AEFF` |

Transform and shadow animate over 350ms with `cubic-bezier(.2,.8,.2,1)`. The tag and colour changes take 200ms.

## Gotchas
- **Don't clip the lift.** Columns and the grid must not set `overflow: hidden`. Only the tile itself clips its own image.
- **Hover is limited to pointer devices** with `@media (hover: hover)`, so a tap on touch screens doesn't leave a tile stuck in the lifted state. The mobile feed keeps its long-press behaviour.
- **Reduced motion (opt-in):** by default the lift runs even when the user has turned on reduced motion, because a 3.5% scale isn't the kind of motion that setting is meant to stop. To respect it, add `.ambit-calm` to an ancestor element. The tile then doesn't grow, but the shadow, tag fill and focus ring still show the state.
- **Accent:** set `--ambit-accent` on a parent element to change the tag colour along with the app's theme.

The source exploration is `Ambit - Tile Hover Options.dc.html` (option 1a) in the project root.
