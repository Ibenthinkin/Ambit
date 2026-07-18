# Handoff: Ambit — anti-doomscroll discovery PWA

## Overview
Ambit is a calm, invite-only mobile web app for idle curiosity: a slow-paced feed of art, articles, and images that nudges "serendipitous" connections between items instead of optimizing for engagement. This bundle covers the full user journey: landing/sign-in → topic onboarding → main feed → fullscreen image gallery → saved items → a shareable public item page → PWA install prompt.

## About the Design Files
The `.dc.html` files in this bundle are **design references built as prototypes**, not production code to copy directly. Each is self-contained HTML/CSS/JS (React under the hood) meant to demonstrate exact look, motion, and interaction — not to be pasted into an app. **Recreate these designs in the target codebase's existing environment** (React Native, SwiftUI, Kotlin/Compose, or web React — whatever the project already uses) using its established components, navigation, and state patterns. If no environment exists yet, React (web) or React Native (mobile) is the natural fit given the source is JSX-like and the frame is an iOS mockup — but choose whatever suits the target repo.

Every screen is mocked inside an iPhone frame (`ios-frame.jsx`, `IOSDevice` component, dark mode) for presentation only — that chrome is not part of the product and should not be recreated; it's just how the designs are staged for review.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, and motion timings below are final and should be recreated pixel-for-pixel where feasible. Copy is final unless noted.

## Design Tokens

**Color** (warm soft-dark palette; use as CSS vars / a theme object):
- Background (screen): `#161411`. Background (outer/app chrome): `#0C0B09`.
- Elevated surface: `#1B1813` (sheets/modals), `#0F0D09` / `#221E17` (gradients on icon tiles).
- Primary text: `#EFEBE0` / `#F3EFE5` / `#F5F1E7` (near-white warm tones, used somewhat interchangeably for headlines vs body).
- Muted text: `rgba(239,235,224, 0.36–0.62)` — opacity varies by hierarchy (labels ~0.36–0.4, body/secondary ~0.5–0.6, disabled ~0.38).
- Hairlines/borders: `rgba(239,235,224, 0.07–0.16)`.
- Subtle fill surfaces (cards, chips, buttons): `rgba(239,235,224, 0.03–0.09)`.
- Error text: `#D98C6A`.
- **Accent** (single accent color, user-selectable — see Theming): default gold `#BFA06A`. Curated palette of 4 options, always swapped as a full set: `#BFA06A` (gold/default), `#8FA786` (sage), `#7E93AD` (slate blue), `#C08262` (terracotta). Accent is used on: CTAs (dark text `#17140E` on accent fill), selected chips, save-icon fill, focus rings, small connective/serendipity glyphs.

**Typography:**
- Serif (headlines, titles, body copy, italic wordmark): **Newsreader** (Google Font), weights 400/500/600, italic used for the "Ambit" wordmark and loading label. Sizes range ~14–42px depending on role (see per-screen notes).
- Sans (UI chrome — labels, buttons, meta text, nav): native `-apple-system, system-ui, sans-serif`. Sizes ~10.5–16px, weight 500/600 for buttons/labels.
- No other font families used.

**Shape:**
- Pills (999px radius): buttons, chips, toasts, filter segments.
- Cards/sheets: 18–26px radius (22px is the most common card radius; bottom sheets use 26px top-corners only).
- Images: 12–20px radius depending on context (gallery slides 12px, feed/saved cards 16–20px).
- Borders: hairline `0.5px solid`, always one of the border tokens above.

**Motion:** gentle, no bounce/aggressive easing except small "pop" on selection.
- Rise-in on load: `translateY(8–10px)→0`, opacity 0→1, `.5–.7s ease`, staggered ~0.05–0.16s per section.
- Chip select pop: `scale(1)→0.94→1`, `.22s ease`.
- Spinner: simple `360deg` rotation, `.8s linear infinite`.
- Toast: fades/slides up `8px`, `.22s ease`, auto-dismiss 1.6–1.9s.
- Sheets/modals: slide up from `translateY(103–105%)`, `.4s cubic-bezier(.22,.61,.36,1)`; scrim fades `.3s ease`.
- Chrome (gallery info overlay) auto-cycles: hidden → fades in after 10s on-screen → holds 10s → fades out, `.6s ease` opacity/transform, loops.

## Theming
Every screen exposes an `accent` prop (color, one of the 4 palette values above) — this is the single brand knob across the whole app. Recreate as one theme variable. `Feed` additionally exposes `showSerendipity` (boolean — toggles the "Because you saved X → Y" connective rows between cards). `Onboarding` exposes `minPicks` (number, default 3 — minimum topic chips required before continuing) and `serifChips` (boolean — chip label font).

## Shared local state (localStorage)
Two keys drive cross-screen state in this prototype; recreate as real app/user state:
- `ambit.saved.v1` — JSON array of saved item ids (shared by Feed, Gallery, Saved, Item).
- `ambit.topics.v1` — JSON array of onboarding topic labels the user picked.

## Screens

### 1. Landing / Sign-in (`Ambit - Landing.dc.html`)

> **⚠️ Design divergence (2026-07):** the product switched from magic-link to **email + password** auth (SPEC §3.1). The prototype below still shows the magic-link flow — when recreating this screen, replace the email-only form/sent-confirmation stages with sign-in (email + password) and first-time sign-up (invited emails only) states, plus a "forgot password" link. Keep the visual language (card, orbs, input/button styling) exactly as specced; the "no password, no algorithm" caption is obsolete.

**Purpose:** Invite-only sign-in; first thing a new/logged-out user sees.
**Layout:** Full-screen column, padding `0 30px 40px`, two soft blurred accent-colored orbs drifting in the background (decorative, `filter:blur(40–46px)`, opacity 0.07–0.1, 18–22s drift loop). Brand mark top (ring+dot logo + italic "Ambit" wordmark, 26px), hero headline centered vertically in remaining space, auth card pinned near the bottom.
**Components:**
- Hero: "A quieter way to be curious." — Newsreader 42px/1.08, followed by a 300px-max-width subhead at 18px/1.5, muted color.
- Email form stage: single email input (16px sans, rounded 14px, `rgba(239,235,224,0.045)` fill, `0.5px` border, focuses to accent color), full-width pill-ish button "Send me a magic link" (accent fill, `#17140E` text, 14px radius), inline error text in `#D98C6A` on invalid email, small lock-icon caption "Invite-only · no password, no algorithm".
- Sending state: button shows a spinning ring + "Sending link…" for ~1.1s (simulated), then transitions to:
- Sent stage: centered envelope icon in a circle, "Check your inbox" (23px serif), body naming the submitted email in accent color, "Use a different email" link to reset back to the form.
**Interactions:** Enter key submits. Email validated with a standard regex; invalid shows inline error and does not proceed. No real network call — timeout simulates send.
**State:** `email` (string), `stage` ('form' | 'sent'), `sending` (bool), `error` (string).

### 2. Onboarding topic picker (`Ambit - Onboarding.dc.html`)

> **⚠️ Design divergence (07-17-26):** v1 renders **16 chips, not the 32 below** — the validated topic-drift graph covers 16 topics and the feed's drift machinery needs a graph row per topic (see SPEC §3.2 / `docs/PHASE2_PLAN.md` step 3 for the label mapping: Cartography appears as "Maps"; Portraiture and Zoology are v1 chips despite not being in the list below). The grid grows toward the full 32 as later phases harvest and validate more topics. Layout, chip styling, and interactions are unchanged.

**Purpose:** First-run interest selection that seeds personalization language ("Ambit starts here — then wanders sideways...").
**Layout:** Scrollable column. Header block (eyebrow "Ambit · Setup" in accent color, 34px serif title, 16.5px serif subhead). Below it, a wrapping flex grid of 32 pill chips, `gap:10px`, padding `22px 24px 180px` (bottom padding reserves room for the sticky CTA). A sticky bottom bar (gradient-fade background) holds a left-aligned count label and a right-aligned pill CTA.
**Components:** Chips — Newsreader 16px/500 by default (or sans 14px if `serifChips=false`), pill radius 999px, unselected = subtle fill/border, selected = solid accent fill with `#17140E` text and a small pop animation. CTA pill — disabled/neutral state ("Pick N more") until `minPicks` chips are chosen, then flips to solid accent "Start exploring".
**Content:** 32 topic labels (Art & painting, Architecture, Astronomy, The ocean, Ancient history, Maps, Typography, Botany, Birds, Physics, Machines, Photography, Mythology, Textiles, Poetry, Ceramics, Geology, Aviation, Music, Cinema, Mathematics, Chess, Insects, The deep sea, Space exploration, Sculpture, Calligraphy, Fossils, Weather, Bridges, Manuscripts, Gardens).
**Interactions:** Tap toggles a chip (persisted to `ambit.topics.v1` on every change). CTA disabled until `minPicks` (default 3) are selected; tapping when enabled persists and navigates to the Feed.

### 3. Main feed (`Ambit - Feed.dc.html`)
**Purpose:** The core loop — an infinite, mixed-media, deliberately slow feed.
**Layout:** Sticky glass header (italic "Ambit" wordmark 28px + a small bookmark icon linking conceptually to Saved), blurred/translucent on scroll (`blur(18px) saturate(160%)`). Below it, a single vertical column of cards, `gap:28px`, `padding:22px 20px 12px`. An `IntersectionObserver` sentinel at the bottom triggers `loadMore()` (adds 4 more items after a simulated 600ms delay, with a spinner + italic "finding something interesting…" caption).
**Card types (cycled from a fixed pool, repeating as the feed grows):**
- **Serendipity connective** — a thin rule + diamond glyph + small caption reading "{From} → {To}" in accent color, sitting between two related cards. Only shown when `showSerendipity` is true.
- **Image card** — full-width rounded (20px) image (heights vary 224–300px per item), title (Newsreader 19px) + maker/date/source line (sans 12px muted) below, save (bookmark) and share icon buttons top-right of the meta row.
- **Article card** — bordered/filled card (22px radius), all-caps source eyebrow, Newsreader 24px title, 16px lede. Collapsed by default with a thin progress bar; expands in place to show full body text.
**Interactions:**
- Tap an image → navigates to the Gallery deep-linked to that item (`?start=<id>`), guarded by a ≤12px movement tolerance so scroll gestures never mis-fire it.
- Save/share icon taps use the same movement-guard + event-stop so a resting thumb during scroll never triggers them; share shows a toast ("Link copied · ambit.link/i/{id}").
- Article card: **hold ~480ms** (with a filling progress bar + a light haptic buzz) or **double-tap** expands the body in place; a single tap while collapsed shows a hint toast ("Hold, or double-tap, to read"); tapping while expanded collapses it again.
- Tapping an image opens a separate in-page fullscreen viewer (X to close) — distinct from the full Gallery screen; kept for quick preview without leaving the feed.
- On return navigation from the Gallery (`?focus=<id>` param), the feed auto-scrolls that card back into view.
**State:** `count` (loaded item count), `expanded` (map of article idx → bool), `saved` (Set, synced to localStorage), `fullscreenId`, `toast`, `loadingMore`, `pressingIdx`.

### 4. Fullscreen image gallery (`Ambit - Gallery.dc.html`)
**Purpose:** Immersive, chrome-free image viewer — an endless horizontal swipe through 8 public-domain artworks/photos, looping infinitely.
**Layout:** Full-bleed image track (prev/current/next slides, each `flex:0 0 33.33%` of a 300%-wide rail, dragged via `translateX`), `object-fit:contain`, 12px image radius. All other UI is overlaid chrome that fades in/out together (title block, save/share buttons, close X, top gradient) — hidden by default, auto-cycles visible for 10s then hidden for 10s.
**Components:**
- Bottom chrome: title (Newsreader 22px) + maker (sans 12.5px) on the left; save (bookmark, fills accent when saved) and share circular icon buttons on the right; a small hint row ("Tap again, or the title, for details").
- Top-right close **X** button — same visibility/opacity as the rest of the chrome (only rendered when the title is showing).
- Details modal — a bottom sheet (26px top radius) with a drag-grabber, title/maker, a 3-row fact list (Medium / Origin / Where it lives), a longer description paragraph, and a closing hint row.
- Toast for share confirmation, same style as other screens.
**Interactions (all pointer-gesture driven, no native scroll):**
- **Horizontal swipe** — cycles to the previous/next image (infinite loop via modulo indexing); threshold ~20% of screen width.
- **Single tap** on the image — if chrome is hidden, reveals it; if chrome is already visible, a second tap opens the details modal directly.
- **Tap the title** — always opens the details modal directly.
- **Hard swipe up, starting in the top two-thirds of the screen** (fast, or long-distance) — returns to the feed (`Ambit - Feed.dc.html?focus=<entryId>`, where `entryId` is the image the user entered the gallery on, not necessarily the one currently showing).
- **Slow (unhurried) swipe up, starting in the bottom third of the screen** — also opens the details modal.
- **Two-finger swipe** (any direction) — also returns to the feed.
- **Corner X tap** — returns to the feed (identical destination as the hard-swipe-up gesture).
- **Details modal close gestures** — tapping anywhere in the modal closes it; swiping down near the grabber closes it (live-follows the finger before release); swiping left/right closes it *and* cycles the gallery one image in that direction.
**Content pool (8 works):** The Great Wave off Kanagawa (Hokusai), The Starry Night (van Gogh), Rain, Steam and Speed (Turner), Wanderer above the Sea of Fog (Friedrich), The Vanderbilt Cup (1908 photo), A Sunday on La Grande Jatte (Seurat), The Pillars of Creation (NASA/ESA), The Milkmaid (Vermeer) — each with title, maker/date, medium, origin, home institution, and a short curatorial description. Images are sourced live from Wikimedia Commons (`Special:FilePath` URLs) in the prototype; production should use licensed/self-hosted assets.
**State:** `index` (virtual/unbounded, wrapped via modulo), `dragPx`, `dragging`, `chromeVisible`, `saved` (Set), `detailOpen`, `sheetDrag`, `toast`.

### 5. Saved items (`Ambit - Saved.dc.html`)
**Purpose:** A personal collection of everything bookmarked from the feed/gallery.
**Layout:** Sticky header (back-arrow to Feed, "Saved" title + count caption, a 3-way filter segmented control: All / Images / Reading, each showing a live count). Below, a 2-column CSS grid (`gap:14px`) — image tiles occupy one grid cell each; article tiles span the full width (`gridColumn: 1 / -1`).
**Components:**
- Image tile — rounded (16px) 150px-tall thumbnail, small circular unsave (filled bookmark) button top-right with a blurred dark backdrop, title (15px serif) + short attribution (11px sans) below.
- Article tile — bordered/filled card, source eyebrow, title (20px serif), lede (15px serif), unsave button top-right, "Open in reader →" link back to the Feed.
- Empty state — centered bookmark-outline icon, "Nothing kept yet" (23px serif), guidance copy, CTA back to the Feed.
**Interactions:** Filter segment switches the visible subset (all state kept in the same `saved` Set — filtering is purely a view concern). Tapping an image tile (movement-guarded, same as Feed) opens the Gallery deep-linked to that item. Unsave is immediate with a "Removed from Saved" toast. On first-ever visit (no localStorage data), seeds a demo collection of 6 items so the screen isn't empty for review.
**State:** `saved` (Set, shared key with Feed/Gallery/Item), `filter` ('all' | 'images' | 'reading'), `fullscreenId`, `toast`.

### 6. Public single-item page (`Ambit - Item.dc.html`)
**Purpose:** The page a shared link opens to for someone without an account — a read-only, single-item view with an invite CTA.
**Layout:** Minimal top bar (logo + Share button, no back nav — this is an external landing point), a "shared by" attribution row (avatar-initial circle + "{name} shared this with you"), the item itself (image or article layout, matching Feed's card typography), a "Where Ambit would wander next" teaser section (2 related-item rows, diamond bullet + reason caption), and a closing CTA card ("Curiosity, without the doomscroll.") with a primary "Get your invite" button (→ Landing) and a secondary "Keep browsing without an account" link (→ Feed).
**Interactions:** Tapping the item's image (movement-guarded tap, consistent with Feed/Saved) opens the full Gallery deep-linked to that work. Share button re-copies the same public link and shows a toast.
**Props:** `itemId` (enum: `turner` | `sky` — one image item, one article item in this prototype pool), `sharedBy` (text, default "Mara"), `accent`.

### 7. PWA install prompt (`Ambit - Install.dc.html`)
**Purpose:** iOS "Add to Home Screen" affordance, shown over a dimmed/blurred feed backdrop.
**Layout:** Three stacked states over the same dimmed feed skeleton background:
1. **Collapsed banner** — bottom-pinned rounded card (20px radius), app-icon tile, "Keep Ambit close" headline + one-line body, "Add" pill button, small X dismiss.
2. **Expanded bottom sheet** (26px top radius, scrim behind it) — larger app icon, "Install Ambit" headline, numbered 3-step instructions (Tap Share → "Add to Home Screen" → Tap Add), each with a matching icon; "Got it" primary button, "Maybe later" text dismiss.
3. **Installed confirmation** — full-screen blurred overlay, checkmark-in-circle pop animation, "Ambit is on your home screen" headline, "Start exploring" CTA into the Feed.
**Interactions:** Banner "Add" → expands to sheet. Sheet backdrop tap or "Maybe later" → collapses/dismisses. Sheet "Got it" → installed confirmation. Confirmation CTA → Feed. (This screen is a self-contained state machine — `stage`: `banner | sheet | done | hidden` — not wired to a real `beforeinstallprompt` event; a production build should use the real browser API where available and fall back to these manual instructions on iOS Safari, which has no install prompt API.)

## Assets
- **Font:** Newsreader (Google Fonts), loaded via `@import`/`<link>` at weights 400/500/600 + italics. Pair with system sans for UI chrome — no separate sans webfont.
- **Images:** all artwork/photos are fetched live from Wikimedia Commons (`Special:FilePath` URLs) for prototype purposes — public-domain works. Replace with production-hosted/licensed assets and a real CMS/data source.
- **Icons:** all hand-drawn inline SVG (bookmark, share, close, arrows, install/add glyphs, envelope, checkmark, diamond bullet, small ring-and-dot logo mark) — no icon font/library dependency. Recreate as an SVG icon set in the target codebase.
- `ios-frame.jsx` / `image-slot.js` in this bundle are prototyping scaffolding only (device bezel + drag-drop image placeholder) — not part of the product; do not port them.

## Files in this bundle
- `Ambit - Landing.dc.html`
- `Ambit - Onboarding.dc.html`
- `Ambit - Feed.dc.html`
- `Ambit - Gallery.dc.html`
- `Ambit - Saved.dc.html`
- `Ambit - Item.dc.html`
- `Ambit - Install.dc.html`
- `ios-frame.jsx`, `image-slot.js` — prototype scaffolding referenced by the files above (device frame + image placeholder), not product code.

Each `.dc.html` file opens directly in any browser for reference.

## Screenshots
`screenshots/` holds one reference capture per screen, in flow order: `01-landing`, `02-onboarding`, `03-feed`, `04-gallery`, `05-saved`, `06-item`, `07-install`. These show default states only — see the per-screen Interactions notes above for the other states (sent/sheet/expanded/etc.) each screen can be in.
