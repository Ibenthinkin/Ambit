# Handoff: Ambit — a calm, anti-doomscroll discovery PWA

## Overview

Ambit is an invite-only mobile PWA for unhurried discovery. It hands the user one interesting
thing at a time — public-domain art, photography, science imagery, short encyclopedic reads —
and then gets out of the way. There is no like count, no follower graph, no infinite
engagement loop, and no notification bait. The product's whole personality is *restraint*:
imagery first, chrome only when asked for.

Twelve screens are covered here, from magic-link sign-in through the feed, an immersive
gallery, item detail pages, saved collections, profile and settings.

## About the design files

**The files in this bundle are design references created in HTML — prototypes showing intended
look and behavior, not production code to copy.** They are "Design Components" (`.dc.html`)
that run in a bespoke authoring runtime (`support.js`), with all styling inline. Do not port
that runtime, the `<x-dc>` / `<sc-for>` / `<sc-if>` template syntax, or the `.dc.html` structure.

Your task is to **recreate these designs in the target codebase's existing environment** —
React, Vue, SwiftUI, React Native, whatever is already established — using its patterns,
component library and state management. If no codebase exists yet, pick the framework that
best fits a mobile-first installable PWA (React + Vite + a router is a sound default) and
implement the designs there.

Two helper files *are* worth reading as behavior specs rather than code:

- `ios-frame.jsx` — the iPhone bezel/status-bar wrapper used to present each screen. **This is
  presentation scaffolding for the mockups only.** The real app is the screen content; it
  should fill the device viewport. Do not build a phone frame into the product.
- `image-slot.js` — a droppable image placeholder web component used so the designer could
  swap imagery. In production this is just an `<img>` with `object-fit: cover` (feed, tiles)
  or `contain` (gallery, fullscreen).

## Fidelity

**High fidelity.** Colors, type, spacing, radii, motion timings and copy are all final and
should be matched closely. Exact values are listed in **Design tokens** below, and every
number in this README was taken from the shipped prototypes.

The one deliberate exception: item metadata for the 20 user-supplied gallery images is
*placeholder copy* (title / maker / medium / origin / "where it lives" / description). It is
plausible but not researched — real attributions must be supplied before launch.

---

## Global design system

### Frame and canvas
- Design viewport: **402 × 874** (iPhone 14/15 Pro logical size). Everything is mobile-only;
  there is no tablet or desktop layout.
- App background: `#161411` (warm near-black). Immersive gallery background: `#0B0A08`.
  Mockup page background outside the device: `#0C0B09`.
- Safe-area top padding used throughout: **56–68px** from the top of the viewport for first
  content, so nothing collides with the status bar / dynamic island.

### Typography
- **Sora** (Google Fonts, weights 400/500/600/700/800) for essentially all text — headings,
  body, labels, buttons.
- `-apple-system, system-ui, sans-serif` appears on some small UI chrome labels (11–13px
  captions, toasts, sheet labels) in a few screens. **Normalize to Sora** when rebuilding;
  the mixed usage is legacy drift, not intent.
- Scale actually in use:

| Role | Size / line-height / weight |
|---|---|
| Screen title (Saved, Profile name) | 26–28px / 1.0–1.1 / 600 |
| Item title (image page) | 28px / 1.16 / 400 |
| Article headline (reader) | 30px / 1.16 / 600 |
| Gallery title (chrome) | 22px / 1.24 / 400 |
| Detail-sheet title | 25px / 1.18 / 400 |
| Card / tile headline (feed, saved) | 19–20px / 1.25 / 600 |
| Body copy (reader) | 16px / 1.72 / 400 |
| Lede / secondary body | 13.5–17px / 1.5–1.6 / 400 |
| Sheet row label | 15px / — / 400 |
| Metadata, maker line | 12.5px / — / 400, letter-spacing 0.15px |
| Eyebrow / source label | 9.5–11px / — / 600, letter-spacing 1.2–1.4px, uppercase |
| Micro caption, hint text | 10.5–11.5px / — / 400 |

### Color
| Token | Value | Use |
|---|---|---|
| `bg/app` | `#161411` | Scrolling screens |
| `bg/immersive` | `#0B0A08` | Gallery |
| `bg/page` | `#0C0B09` | Outside the device frame |
| `bg/sheet` | `#1B1815` (sometimes `#1B1813`) | Bottom sheets |
| `text/primary` | `#F5F1E7` | Titles |
| `text/high` | `#EFEBE0` | Body, list labels |
| `text/body` | `rgba(239,235,224,0.72–0.82)` | Long-form body |
| `text/secondary` | `rgba(239,235,224,0.5–0.62)` | Ledes, values |
| `text/muted` | `rgba(239,235,224,0.34–0.45)` | Captions, eyebrows |
| `line/hairline` | `rgba(239,235,224,0.06–0.14)` | 0.5px borders and rules |
| `surface/raised` | `rgba(239,235,224,0.03–0.06)` | Cards, chips, icon buttons |
| `accent` (default) | `#4C5FE0` indigo | Primary actions, saved state, active chip |
| Accent alternates | `#D9A73C`, `#3FA35C`, `#D9483F` | Exposed as a themeable prop |
| Accent foreground | `#17140E` | Text/icon on an accent fill |
| Avatar placeholder | `linear-gradient(150deg, #8E92F0, #6C7BE8)` | Profile chip in the toolbar |

All borders are **0.5px** hairlines. Never use 1px.

### Shape and elevation
- Pills / chips / toolbars: `border-radius: 999px`
- Cards, sheets: `18–22px` (sheets: `22px 22px 0 0`)
- Image tiles in feed/saved: **square corners (0)** — full-bleed masonry
- Gallery / item images: `12–18px`
- Sheet shadow: `0 -20px 50px rgba(0,0,0,0.45)`
- Toolbar shadow: `0 10px 30px rgba(0,0,0,0.28)`
- Glass surfaces: `backdrop-filter: blur(18–26px) saturate(160–180%)` over a translucent fill

### Motion
| Name | Definition | Used for |
|---|---|---|
| `rise` | `opacity 0→1, translateY(8–10px→0)`, 400–600ms ease, staggered 50–160ms | Content entering a screen |
| `sheetup` | `translateY(100%→0)`, 240–300ms `cubic-bezier(.22,.9,.3,1)` | Bottom sheets |
| `sheet` (gallery) | `translateY(103%→0)`, 400ms `cubic-bezier(.22,.61,.36,1)` | Details modal |
| `fade` (toast) | `opacity 0→1, translate(-50%, 8px→0)`, 220ms ease | Toasts |
| `scrim` | `opacity 0→1`, 300ms ease | Modal backdrops |
| chrome fade | `opacity`/`transform` 600ms ease | Gallery UI summon/dismiss |
| spin | 800ms linear infinite | Loading spinners |

No aggressive gradients, no emoji, no bouncy overshoot beyond the sheet curve.

---

## The two shared UI patterns

These two components appear on nearly every screen and are the backbone of the system.
**Build them once and reuse.**

### 1. Floating toolbar ("the pill")

A single translucent pill floating over content, horizontally centered, `bottom: 26px`,
z-index above content and below sheets.

- Container: `display:flex; align-items:center; gap:26px; padding:8px 20px;`
  `border-radius:999px;` `background: rgba(240,237,231,0.225);`
  `backdrop-filter: blur(26px) saturate(180%);` `border: 0.5px solid rgba(255,255,255,0.28);`
  `box-shadow: 0 10px 30px rgba(0,0,0,0.28);`
- Wrapper row is `pointer-events: none`; the pill itself is `pointer-events: auto`.
- Items, left to right (each a 31×31 or 36×36 flex-centered hit area):
  1. **Profile** — 25px circle, `linear-gradient(150deg,#8E92F0,#6C7BE8)`, 1.5px white-75%
     border. → Profile screen.
  2. **Ambit mark** — 31px logo: 26-viewBox circle `r=11.5` stroke 1.7, inner dot `r=3.6`
     filled, small satellite dot `r=1.9` at (21,7), all `rgba(255,255,255,0.95)`.
     → Feed (or, in Gallery, back to the feed anchored on the current item).
  3. **Bookmark** — 24px outline bookmark, `rgba(255,255,255,0.82)`. Opens the
     *Save to collection* sheet. Rendered **filled white** when the current screen is Saved,
     or **filled accent** when the current item is already saved.
  4. **Share** — 23px share-up arrow, `rgba(255,255,255,0.82)`. Opens the *Share* sheet.
- Icon strokes: 1.7px, round caps and joins.
- Screens with a page-specific extra action put it in this same row; never add a second bar.
- Hit areas are ≥31px; keep them ≥44px in production where the platform allows.

### 2. Bottom sheets

Two sheets, same shell, summoned from the pill.

**Shell:** `position:absolute; left:0; right:0; bottom:0;` `background:#1B1815;`
`border-radius:22px 22px 0 0;` `border-top:0.5px solid rgba(239,235,224,0.1);`
`padding:10px 0 26–30px;` shadow as above; `sheetup` animation. Scrim behind:
`rgba(9,8,6,0.5)`, tap to dismiss. Grabber: 36×4px, `rgba(239,235,224,0.18)`, radius 4,
centered, 14px bottom margin. Centered title: Sora 600 15px `#F3EFE5`.

**a. Save to collection**
- Title: "Save to collection". Max height 72% with the list scrolling.
- Rows (14px vertical padding, 12px horizontal, 14px radius, hairline bottom border):
  9px dot + name (Sora 15px `#EFEBE0`) + sub-label (Sora 12px, 38% opacity).
- Dot is **accent** for the collection this item is currently in, else
  `rgba(239,235,224,0.25)`; that row's sub-label reads "Already saved here".
- Other rows' sub-label is the collection's item count ("1 item" / "N items").
- Default collections: **Articles, Art, Photos**, plus any user-created names.
- Picking a row writes the mapping, marks the item saved, closes the sheet, and toasts
  "Saved to {name}".

**b. Share**
- Title: "Share" (on Saved: "Share this collection").
- **Copy-link row:** pill, `rgba(239,235,224,0.045)` fill + hairline, 18px side margins.
  Monospace 12.5px truncating URL on the left (`ambit.link/i/{itemId}`, or
  `ambit.link/c/{collection}` on Saved) + an accent-filled "Copy link" button
  (Sora 600 12.5px, `#17140E`, radius 999, padding 8×16). Writes to the clipboard, closes,
  toasts "Link copied · {url}".
- **Targets row:** horizontally scrollable, 14px gaps, 18px side padding. Each target is a
  52px circle (`rgba(239,235,224,0.06)` + hairline) above a 10.5px 50%-opacity label.
  Order: **Messages, Stories (Instagram), X, Pinterest, WhatsApp, Email**. X / Pinterest /
  WhatsApp use a Sora 700 19px letter glyph (X / P / W); Messages, Stories and Email use
  1.7px outline icons. Tapping closes the sheet and toasts "Opening {name}…".
  *In production, wire these to the platform share sheet or each service's share
  intent/deep link; the mock only toasts.*
- **Save image** (image contexts only — item image page and gallery): hairline rule, then a
  row with accent download icon, "Save image" (Sora 500 14.5px) and the sub-line
  "Adds the full-resolution image to your camera roll". Toasts "Saved to camera roll".
  Needs a real camera-roll/download permission path per platform.

### Toast
Centered pill, `left:50%` + `translateX(-50%)`, `bottom: 46–120px` depending on screen,
`rgba(30,28,24,0.92)` + `blur(12px)` + hairline, `#EFEBE0`, 13px, `padding:11px 18px`,
`border-radius:999px`, `white-space:nowrap`, `fade` in, auto-dismiss after **1700–1900ms**.
One toast at a time; a new one clears the previous timer.

---

## Screens

### 1. Landing / magic-link sign-in — `Ambit - Landing 2.dc.html`
**Purpose:** invite-only entry. A rapid slideshow of the kind of thing Ambit shows you,
which resolves into a sign-in sheet.

- **Background slideshow:** full-bleed images cycling one after another, cross-fading.
  Interval is a prop (`slideMs`, default 1200ms, floor 320ms; the designer has been
  auditioning 400–1000ms). Fade duration = `min(520, slideMs × 0.55)`.
- The list is **shuffled (Fisher–Yates) on every load**, and when it reaches the last image
  the cycle stops and, 260ms later, the sign-in sheet rises.
- Slide list is data, not markup: `assets/landing-slides.json` → `{ slides: [url|path, …] }`,
  28 entries (8 Wikimedia public-domain works + 20 supplied images). Falls back to a built-in
  list if the fetch fails. All slides are preloaded via `new Image()`.
- **Sign-in sheet:** email field + submit. Validation `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`.
  States: `form` → `sending` (spinner) → `check inbox`, with reset. Invite-only framing in
  the copy.
- **State:** `email`, `stage`, `sending`, `error`, `slide`, `modalOpen`.

### 2. Onboarding topic picker — `Ambit - Onboarding.dc.html`
- Grid of **32 topic chips**; user must pick a minimum before continuing (gated CTA).
- Selection has a gentle spring pop.
- Persists to `ambit.topics.v1`, then continues to the feed.

### 3. Feed — `Ambit - Feed Masonry 3.dc.html`
**Purpose:** the home surface. Imagery-led, silent, endlessly scrollable but never urgent.

- **Layout:** two-column masonry — a CSS grid `1fr 1fr` with `gap: 4px`,
  `padding: 58px 4px 0`, `align-items: start`; each column is its own
  `flex-direction: column; gap: 4px` stack, so tiles pack independently.
  **Not** a spanning grid — that leaves dead space.
- **Image cards:** full-bleed, square corners, varying heights.
- **Article cards:** `rgba(239,235,224,0.03)` fill + hairline, `padding: 16px 13px`;
  uppercase source eyebrow (9.5px/600/1.3px), Sora 600 19px headline, 13.5px lede.
- **Serendipity link cards** (optional, prop-toggled): a small card reading "BECAUSE" with
  `{saved thing}` → `{new thing}` in accent — the connective tissue between recommendations.
- **Gestures:** tap an image → Gallery deep-linked to that work. Tap an article → reader.
  **Long-press** an article (with a filling progress bar + haptic) or **double-tap** expands
  it inline; a single tap nudges with a hint.
- All taps use a **movement-slop guard**: the tap only fires if the pointer drifted ≤12px, so
  scrolling never triggers navigation and a thumb resting on a control during a scroll never
  activates it.
- Accepts `?focus={id}` and scrolls that card back into place (used when returning from the
  gallery).
- Pill toolbar with the Ambit mark wired to "scroll to top".

### 4. Immersive gallery — `Ambit - Gallery.dc.html`
**Purpose:** the heart of the product. *Images only, zero UI, until you ask for it.*

- **Background** `#0B0A08`, `overflow: hidden`, no scrolling.
- **Track:** a three-cell rail (prev / current / next), each cell `flex: 0 0 33.3333%`,
  swiped horizontally with pointer events and `touch-action: none`; the pool wraps
  infinitely (28 works). Threshold to advance: **20% of screen width**.
- **Image placement:** each cell is `height: 66.6667%` with `padding: 56px 16px 0` and
  centered content, so the image's optical center sits at **1/3 of screen height** — i.e.
  raised one sixth of the screen above center, leaving the lower third for summoned UI.
  Images are `fit: contain`, radius 12.
- **Chrome (all of it) is hidden by default** and fades as one unit over 600ms:
  - top gradient scrim (120px, `rgba(11,10,8,0.55)` → transparent)
  - bottom block: title (22px), maker (12.5px, 52% opacity), hint line
    "Tap again, or the title, for details", and **the pill toolbar**, over a
    `linear-gradient(to top, rgba(11,10,8,0.94) 42%, transparent)` scrim
  - `pointer-events` are disabled while hidden, so an invisible control can never be hit
- **Summoning rules:**
  - **single tap** toggles the chrome
  - the chrome also auto-cycles on its own: fades in after 10s on screen, holds 10s, fades out
  - **double-tap** (image or title) opens the **details modal**
  - **slow swipe up starting in the bottom third** also opens details
  - **hard swipe up starting in the top two-thirds**, or a **two-finger swipe** in any
    direction, returns to the feed anchored on the entry item
- **Details modal:** bottom sheet, `#1B1813`, radius 26px top corners, `padding: 8px 26px 40px`,
  max-height 80%, `sheet` animation, scrim `rgba(9,8,6,0.66)` + `blur(3px)`.
  Title 25px, maker 12.5px in accent, then a fact table — rows with an 88px uppercase label
  column (11px/600/0.6px) and a 15.5px value, separated by hairlines: **Medium, Origin,
  Where it lives** — then a 16px/1.6 description. Footer hint: "Tap or swipe down to close ·
  swipe sideways to keep browsing".
  **No close button.** Swipe down on/near the grabber closes it and live-follows the drag;
  swipe left/right closes it *and* cycles the gallery one image in that direction.
- **No page counter, no dots, no progress bar** — deliberately.
- Bookmark and share in the pill open the two shared sheets. Save writes through to the same
  collections store as everywhere else.
- Content pool lives in the component (`POOL`): 8 Wikimedia public-domain works + the 20
  supplied images, each with `id, title, maker, src, placeholder, medium, origin, home, detail`.

### 5. Item — image — `Ambit - Item Image.dc.html`
**Purpose:** the public share target for an image. Read-only; no top bar at all.

- No header. Content starts at `padding-top: 68px` with the **shared-by attribution**:
  24px accent circle holding the sharer's initial (Sora 600 12px, `#17140E`) + 
  "{Name} shared this with you" (12.5px, 50% opacity).
- Image: full-width, 300px tall, radius 18. Tapping it (slop-guarded) opens the Gallery on
  that work.
- Then title 28px/1.16, maker 13px 50%, body 17px/1.6 72%.
- **"Where Ambit would wander next":** a small accent rule + uppercase eyebrow, then related
  teaser rows — accent diamond, 16px title, 11.5px reason — in `rgba(239,235,224,0.03)` cards
  with 14px radius.
- **Join CTA card:** radius 22, hairline, centered. "Curiosity, without the doomscroll." (24px)
  + supporting copy, an accent pill "Get your invite" (15px/600, `#17140E`, 15px padding), and
  a quiet text link "Keep browsing without an account →".
- **Horizontal swipe anywhere** (>70px, <70px vertical drift) returns to the feed anchored on
  this item, with a live `translateX(dx × 0.35)` rubber-band follow.
- Pill toolbar: profile, mark, bookmark, share. Share sheet includes **Save image**.
- Props: `itemId` (`wave|turner|gp|nebula`, also readable from `?itemId=`), `sharedBy`, `accent`.
- Content is fetched from `assets/content.json` → `images[id]`.

### 6. Item — article / reader — `Ambit - Item Text.dc.html`
- Header block at `padding-top: 68px`: accent uppercase source label (10.5px/600/1.4px),
  Sora 600 30px/1.16 title, 17px/1.5 lede, then a hairline rule.
- **Body is fetched live from the Wikipedia API** (`action=query&prop=extracts&explaintext`)
  for the article's `wiki` slug, with a spinner reading "fetching the full article…" and a
  fallback to bundled body copy on failure.
- The extract is parsed into blocks: `== Heading ==` → 19px/600 section head, deeper levels →
  15px/600 subhead; sections matching
  `see also|references|further reading|external links|notes|bibliography|citations`
  are dropped, as are degenerate formula fragments (<3 significant characters).
  Body paragraphs: 16px/1.72, 78% opacity, 16px bottom margin.
- "Read on Wikipedia →" link in accent, then the same quiet CTA card as the image page.
- Same horizontal-swipe-back gesture, same pill (with share), same share sheet
  (no *Save image* — it's text).
- Props: `itemId` (`sky|engine|wayfinding`, also `?itemId=`), `accent`.

### 7. Saved — `Ambit - Saved.dc.html`
**Purpose:** the user's quiet collection. Same visual language as the feed.

- No header chrome and no back button — the pill navigates. Title block:
  `padding: 58px 16px 0`, "Saved" (Sora 600 26px) + count line
  ("N things kept", or "Your quiet collection" when empty).
- **Collection chips:** horizontally scrollable row, 8px gaps, `padding: 16px 16px 4px`.
  Chips are `All · N` plus one per collection with items (`Art · 3`, `Articles · 2`, …).
  Active chip = accent fill with `#17140E` text; inactive =
  `rgba(239,235,224,0.05)` + hairline + 62% text. 12.5px/500, `padding: 8px 15px`, radius 999.
- **Grid:** same two-column masonry as the feed (`gap: 4px`, `padding: 12px 4px 120px`),
  items distributed alternately into two independent flex columns.
  Image tiles are full-bleed square-cornered, heights varying 140–244px.
  Article tiles are feed-style cards linking to the reader
  (`Ambit - Item Text.dc.html?itemId=…`).
- **Unsave:** filled accent bookmark badge on each tile — 30px circle,
  `rgba(12,11,9,0.5)` + `blur(8px)`, top/right 8px. Toasts "Removed from Saved".
- Image tap → Gallery (slop-guarded), as in the feed.
- **Empty state:** 66px circle with an accent bookmark outline, "Nothing kept yet" (23px),
  "Tap the bookmark on anything that catches you. It'll wait for you here — no rush,
  no expiry." (16px/1.5), and an accent pill "Back to exploring".
- Pill toolbar with the bookmark shown **filled white** (current section); share opens the
  share sheet scoped to the visible collection.
- Seeds a small demo collection on first visit so the screen is never empty in review.

### 8. Profile — `Ambit - Profile.dc.html`
- Top row: search and settings icon buttons (38px circles, `rgba(239,235,224,0.06)` + hairline).
- Identity: 88px avatar (circle image slot, or gradient placeholder) + name (Sora 600 28px) +
  handle (15px, 45% opacity).
- Outline pill "Edit profile" — 46px tall, radius 999, hairline `rgba(239,235,224,0.18)`.
- **Collections grid:** square (`aspect-ratio: 1`) cover tiles, radius 20, with an empty
  variant; tapping opens that collection.
- Pill toolbar (bookmark → Saved).
- Preview size hint: 466 × 938.

### 9. Profile edit — `Ambit - Profile Edit.dc.html`
Editable name / handle / avatar, writing back to the profile store.

### 10. Settings — `Ambit - Settings.dc.html`
- Sticky glass header (`blur(18px) saturate(160%)`, translucent, hairline bottom) with a
  back chevron to Profile.
- Two shortcut cards at the top (`1fr 1fr`, 12px gap, radius 18, hairline): **Edit profile**
  and **Saved** (with the current save count).
- Grouped rows with a 1.7px outline icon, label, and a right-hand value or action:
  - **Account** — Account details; Invite a friend (`2 left`); Add to home screen (action:
    "Install" → install screen)
  - **Your feed** — What you see (`Art, science, history`); Muted sources (`None`);
    Serendipity (`Often`)
  - **Permissions** — Camera roll (`Not determined`); Notifications (`Off`, warning-styled)
  - **Other** — Appearance (`Dark`); Language (`English`); About Ambit; Get in touch

### 11. Install / add-to-home-screen — `Ambit - Install.dc.html`
Dismissible banner → bottom sheet with the iOS Add-to-Home-Screen steps → installed
confirmation, over a dimmed feed backdrop.

---

## Interactions & behavior — summary

| Gesture | Where | Result |
|---|---|---|
| Tap image | Feed, Saved, Item image | Open Gallery at that work (`?start={id}`) |
| Tap article | Feed | Open reader |
| Long-press / double-tap article | Feed | Expand inline (progress bar + haptic) |
| Single tap | Gallery | Toggle chrome |
| Double-tap image or title | Gallery | Open details modal |
| Slow swipe up from bottom third | Gallery | Open details modal |
| Hard swipe up from top two-thirds, or two-finger swipe | Gallery | Back to feed, anchored |
| Swipe left/right | Gallery | Previous / next image (20%-width threshold) |
| Swipe down on grabber | Gallery details | Close, following the drag |
| Swipe left/right | Gallery details | Close **and** cycle one image that way |
| Horizontal swipe anywhere | Item pages | Back to feed, anchored, with rubber-band follow |
| Tap bookmark | Everywhere | Save-to-collection sheet |
| Tap share | Everywhere | Share sheet |

**Slop guard (implement once, use everywhere):** record pointer-down position; cancel the tap
if movement exceeds **12px** in either axis before pointer-up. Save/share controls also
`stopPropagation` on pointer-down so a resting thumb during a scroll can't fire them.

---

## State & persistence

The prototypes use `localStorage`; production should back these with the user's account and
sync, keeping the same shapes.

| Key | Shape | Meaning |
|---|---|---|
| `ambit.saved.v1` | `string[]` of item ids | Everything saved |
| `ambit.collections.v1` | `{ [itemId]: collectionName }` | Which collection an item is in |
| `ambit.collectionNames.v1` | `string[]` | Collection names, default `["Articles","Art","Photos"]` |
| `ambit.topics.v1` | `string[]` | Topics chosen at onboarding |

Notes:
- Saving to a collection writes **both** the collection mapping and the saved list.
- Collection names are derived defensively: any name appearing in the mapping but missing from
  the names array is appended, so no item is ever orphaned.
- Per-screen ephemeral state: `toast`, sheet open flags (`pickOpen`, `shareOpen`,
  `detailOpen`), gallery `index` and chrome visibility/timer, feed expansion, form
  `stage`/`sending`/`error`.

## Themeable props

Each screen exposes an `accent` color prop (default `#4C5FE0`, alternates `#D9A73C`,
`#3FA35C`, `#D9483F`). Other props: `itemId` and `sharedBy` (item pages), `slideMs`
(landing), serendipity toggle (feed). Treat accent as a real theme token in the rebuild.

## Assets & content

- **Fonts:** Sora via Google Fonts. Self-host in production.
- **`assets/content.json`** — item content for the item pages (`images{}`, `articles{}` with
  title, maker, body/lede, `wiki` slug, related teasers).
- **`assets/landing-slides.json`** — ordered landing carousel list (28 entries).
- **`uploads/*.webp`** (40 files, ~20 distinct images in two hash variants) — user-supplied
  imagery used by the landing carousel and the gallery pool. **Licensing for these has not
  been cleared — confirm rights before shipping.**
- **Wikimedia Commons `Special:FilePath` URLs** — 8 public-domain works (Hokusai, Van Gogh,
  Turner, Friedrich, Seurat, Vermeer, the 1908 Vanderbilt Cup photo, NASA/ESA Pillars of
  Creation). Public domain, but proxy/cache them rather than hot-linking Commons.
- **Wikipedia API** — the reader fetches live article extracts client-side with `origin=*`.
  Move this server-side, cache it, and handle failure and rate limits properly.
- **Icons** are hand-rolled inline SVG at 1.7–2px stroke, round caps/joins. Substitute your
  icon library at matching weight rather than copying the paths.
- Gallery metadata for the 20 supplied images is **placeholder copy** — replace with real
  attributions.

## Files in this bundle

| File | Screen / role |
|---|---|
| `Ambit - Landing 2.dc.html` | Landing + magic-link sign-in (shuffled carousel) |
| `Ambit - Onboarding.dc.html` | Topic picker |
| `Ambit - Feed Masonry 3.dc.html` | Feed (current masonry version) |
| `Ambit - Gallery.dc.html` | Immersive gallery |
| `Ambit - Item Image.dc.html` | Public item page — image |
| `Ambit - Item Text.dc.html` | Public item page — article / reader |
| `Ambit - Saved.dc.html` | Saved collections |
| `Ambit - Profile.dc.html` | Profile |
| `Ambit - Profile Edit.dc.html` | Profile editing |
| `Ambit - Settings.dc.html` | Settings |
| `Ambit - Install.dc.html` | PWA install flow |
| `ios-frame.jsx` | Mockup-only device frame — do not ship |
| `image-slot.js` | Mockup-only droppable image placeholder — becomes `<img>` |
| `support.js` | Prototype runtime — **do not port** |
| `assets/content.json` | Item content data |
| `assets/landing-slides.json` | Landing carousel list |
| `uploads/*.webp` | Supplied imagery |
| `PROGRESS.md` | Build log and conventions from the design sessions |

To view a prototype, open its `.dc.html` in a browser (they are self-contained apart from the
sibling helper files and `assets/`).

## Suggested build order

1. Design tokens, then the **pill toolbar** and **sheet shell** (+ toast) as shared primitives.
2. Feed masonry with the slop-guarded tap layer.
3. Gallery — the hardest screen; the gesture matrix and chrome auto-cycle are the product's
   signature. Budget real time here.
4. Item pages (image + article), sharing the CTA and swipe-back.
5. Saved + collections store, then Profile / Profile edit / Settings.
6. Landing, onboarding, install.
