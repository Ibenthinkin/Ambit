# Ambit — build progress

A calm, anti-doomscroll PWA. Full requirements in `uploads/SPEC.md`.

## Design system (keep consistent across all views)
- **Frame:** iOS phone frame via `ios-frame.jsx` (`IOSDevice`, dark=true). Outer bg `#0C0B09`, screen bg `#161411`.
- **Type:** Newsreader serif for content/headlines (incl. italic wordmark); native `-apple-system` sans for UI chrome/labels/buttons.
- **Palette:** warm soft-dark. Text `#EFEBE0`/`#F3EFE5`; muted `rgba(239,235,224,0.4–0.62)`; hairlines `rgba(239,235,224,0.08–0.14)`; surfaces `rgba(239,235,224,0.03–0.06)`.
- **Accent:** default `#BFA06A` (gold). Curated swatches everywhere: `['#BFA06A','#8FA786','#7E93AD','#C08262']`. Exposed as a `color` prop.
- **Shape:** pill buttons/chips (999px); cards radius 20–22px. 0.5px hairline borders. Glass headers = blur + translucent bg.
- **Motion:** gentle — spring pop on chip select, rise-in on load, spin loaders. No aggressive gradients/emoji.
- **Images:** `image-slot.js` (user-droppable). Feed prefilled with public-domain works via `Special:FilePath` Wikimedia URLs.
- **Serendipity:** shown as an optional connective label between feed cards ("Because you saved X → Y"), toggle via `showSerendipity` prop. Both modes supported.

## localStorage keys
- `ambit.saved.v1` — array of saved item ids
- `ambit.topics.v1` — array of chosen onboarding topics

## Checklist (from SPEC)
- [x] Feed — infinite mixed image/article cards (`Ambit - Feed.dc.html`) — real images, save/share, tap-to-fullscreen, inline article expand, serendipity toggle
- [x] Onboarding topic-chip grid (`Ambit - Onboarding.dc.html`) — 32 chips, min-pick gate, persists + links to feed
- [x] Landing / magic-link sign-in (`Ambit - Landing.dc.html`) — invite-only, email validation, sending → check-inbox → reset
- [x] Fullscreen image gallery (`Ambit - Gallery.dc.html`) — immersive, chrome-free by default; endless images-only swipe (8 public-domain works, infinite loop); single tap toggles info chrome (auto-cycles: fades in after 10s on screen, holds 10s, fades out same rate); double-tap (image or title) opens the details modal (medium / origin / where it lives + description); slow swipe up starting in the bottom third also opens details; hard swipe up starting in the top two-thirds returns to the feed; X (visible with title chrome, top-right) closes back to feed; save/share; shares ambit.saved.v1. No counter, no dots.
- [x] Article expand — long-press (with filling progress bar + haptic) & double-tap to expand; single tap nudges with a hint; save/share shielded from press. In `Ambit - Feed.dc.html`
- [x] Saved items view (`Ambit - Saved.dc.html`) — grid of saved images + full-width article cards, All/Images/Reading filter, unsave, empty state, seeds a demo collection on first visit, reuses `ambit.saved.v1`
- [x] Public single-item page (`Ambit - Item.dc.html`) — read-only share target, shared-by attribution, image/article layouts, "where Ambit would wander next" related teaser, get-invite CTA. Props: itemId (turner/sky), sharedBy, accent
- [x] PWA install prompt affordance (`Ambit - Install.dc.html`) — dismissible banner → bottom sheet with iOS Add-to-Home-Screen steps → installed confirmation, over dimmed feed backdrop

## Conventions
- Feed AND Saved image tap → opens Gallery deep-linked to that work (`?start=<id>`). Guarded by a movement-slop tap (≤12px drift), so scrolling never launches it; feed save/share use the same guard + stopPropagation so a thumb resting on them during a scroll never fires them.
- Gallery → feed: hard swipe up starting in the top two-thirds of the screen, OR two-finger swipe (any direction), returns to `Ambit - Feed.dc.html?focus=<entryId>`; feed reads `focus` and scrolls that card back into place. Gallery remembers the entry id (the `start` param), not the current image. The corner X (visible whenever title chrome is up) does the same.
- Gallery details modal: single tap toggles title chrome; double-tap (image or title) or a slow swipe up starting in the bottom third opens it. No close button — swipe down on/near the top grabber closes it (live-follows the drag); swipe left/right closes it AND cycles the gallery one image in that direction (dir: left = next).
- One DC per view. `dc_write` for new, `dc_js_str_replace`/`dc_html_str_replace` for edits.
- Screenshot tool can't rasterize cross-origin images or honor inner-scroll offset — verify those via `eval_js` on the DOM instead.
## Status: all 8 spec checklist items complete. Currently in polish/refinement phase (post-launch gesture tuning).

- Share sheet (Item Image + Item Text): Share button opens a custom bottom sheet (z 26/27, above save-to-collection sheet) — copy-link pill row, horizontal social circles (Messages/Stories/X/Pinterest/WhatsApp/Email; toast "Opening …"), and on the image page a "Save image" camera-roll row. Kept separate from the save popup per user choice. Item Text got a share icon added to the bottom pill (4th slot).

## Open thread / suggested next
- Done: public item page (`Ambit - Item.dc.html`) now has the same guarded tap-to-open-gallery entry point on its image (turner → `Ambit - Gallery.dc.html?start=turner`), matching Feed/Saved's slop-tolerant tap pattern.
- No outstanding bugs known.
