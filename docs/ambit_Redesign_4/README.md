# Handoff: Ambit redesign — "1b" (B&W + Kelly green, Diatype-simple)

## Overview
Sitewide visual refresh of Ambit (PWA, dark). It answers §6 of `docs/BRIEF_original.md`: one accent, a new button/chip model, a new type pairing, no radius, and onboarding (the "First exhibition" flow) designed at phone and desktop. Inspiration was Cargo templates and the NTS app: well-proportioned minimalism, hairline dividers instead of cards, small mono metadata, big plain images.

**Ground rules from Ben (non-negotiable):**
- **The feed layout must not change.** Tight masonry, 4px gutters, no captions, same loading/scroll/long-press mechanics. Only restyle its components (cards, "Because", intro card, sheets, toast).
- **Toolbars keep the production look** (frosted warm glass pill/rail, animated pastel profile glyph, detached share disc). Do not restyle them.
- **Feed tile hover stays as production** (3.5% zoom + lift, 350ms). On-photo save controls stay **very low opacity**.
- **No header bars** on screens.
- **No rounded corners** except the nav pill/rail and circular things (share disc, avatar, dots).

## About the design files
Everything in this folder is a **design reference built in HTML** (single-file "Design Components" that open directly in a browser via the bundled `support.js`). They show the intended look and behaviour. **Don't ship them.** Recreate them in the Ambit codebase's existing components and conventions (globals.css tokens + Button/Chip/Segmented primitives). Read the inline styles as the spec; the logic classes show behaviour only.

Open files from this folder's root so relative `assets/` and `uploads/` paths resolve. Files in `partial/` and `reference/` reference `../`-less asset paths, so images in them may not load; they're for type/spacing reference only.

## Fidelity
**High-fidelity** for colours, type, spacing, states and motion on the screens listed under *Final*. Copy is placeholder unless it already exists in production; new wording goes through `docs/COPY_onboarding.md`.

## Answers to the brief §6
1. **Accent:** one colour. `#2BB24C` Kelly green. On-accent text `#0E0E0E` (6.97:1). White on green fails (2.8:1), so never put white text on it. The accent knob is retired. It's used sparingly: 6px dots (Because, Proposed, list bullets, "invite-only"), the progress tick, focus rings, the 2px hover underline, the saved-bookmark fill, and "Proposed" tags. The default button is **white, not green**. The alternatives explored are in `reference/Ambit - Accent Options.dc.html` (option 2e).
2. **Button and chip model:** see the state tables below. Square everywhere. Labels are sentence case in Hanken (no uppercase buttons). Pills survive only on the nav toolbar.
3. **Type:** Sora is replaced by **Hanken Grotesk** for everything readable, with titles in **regular 400 weight, sentence case, tight tracking** (a Diatype-like look). **Geist Mono** is used for eyebrows, labels, counts and meta: uppercase, 9.5–12px, +0.4px tracking. Scale in `tokens.css`.
4. **Radius:** `none` everywhere. `pill` is for the nav toolbar only. `round` is for the share disc, avatars and dots. Image radii, card radii, input radii and sheet radii are all 0.
5. **Onboarding at 390 and 1440:** `Ambit - First Exhibition.dc.html`, with a `frame` prop for phone or desktop. Desktop has its own layouts (for example keep/pass is two columns) rather than an inflated phone layout.
6. **The reveal:** the "Quiet Gardens" exhibition page (results). The name format is "[Adjective] [Noun]", generated per user.
7. **Light theme:** none.

## Component state tables

### Button: primary (white block)
| State | Fill | Border | Text | Notes |
|---|---|---|---|---|
| Rest | `#F2F2F2` | none | `#0E0E0E`, Hanken 15–17px/400 | Heights 56 (lg), 46 (md). Full width in sheets. |
| Hover | `#FFFFFF` | none | same | `box-shadow: inset 0 -2px 0 #2BB24C`, 150ms |
| Focus-visible | same | — | — | `outline: 2px solid #2BB24C; outline-offset: 3px` (keyboard only) |
| Pressed | `#E6E6E6` | — | — | suggested |
| Disabled | `rgba(255,255,255,0.12)` | — | `#5A5A5A` | suggested |

### Button: outline (black)
| State | Fill | Border | Text |
|---|---|---|---|
| Rest | transparent | 1px `rgba(255,255,255,0.35)` | `#F2F2F2` 15px |
| Hover | `rgba(255,255,255,0.08)` | 1px `#F2F2F2` | same, plus a 2px green inset underline |
| Focus-visible | — | — | 2px green outline, offset 3px |

### Text link / tertiary
| State | Text | Underline |
|---|---|---|
| Rest | `#BDBDBD` (or `#F2F2F2` in body), 15px | underline, offset 3px |
| Hover | `#FFFFFF` | underline colour `#2BB24C` |
| Focus-visible | 2px green outline, offset 3px | — |

The `[Read..]` bracket form is acceptable for inline "read more". **External source links** always end in `↗` and are underlined white.

### Chip (toggle, e.g. "rather not see")
| State | Fill | Border | Text |
|---|---|---|---|
| Off | transparent | 1px `rgba(255,255,255,0.28)` | `#E6E6E6` 16px, padding 11×16 |
| Hover / arrow cursor | transparent | 1px `rgba(255,255,255,0.7)` | scale 1.05, 350ms ease-out |
| On | `#F2F2F2` | 1px `#F2F2F2` | `#0E0E0E` |
| Focus-visible | — | — | 2px green outline |

### Segmented (4-way level toggle: Off / A little / Some / A lot)
A single 1px `rgba(255,255,255,0.22)` outline containing joined cells, with a 1px divider between cells. It's a `role="radiogroup"` of `role="radio"` buttons.
| State | Fill | Text |
|---|---|---|
| Off cell | transparent | Geist Mono 10.5px uppercase `#9A9A9A`, padding 9×11 (phone 9.5px, 9×7) |
| Hover (unselected) | `rgba(255,255,255,0.08)` | `#F2F2F2`, 2px green inset underline |
| Selected | `#F2F2F2` | `#0E0E0E` |
| Focus-visible | — | 2px green outline, offset 2px |

Row layout: name block on the left (the green mono "PROPOSED" tag sits *above* the name, flush left), segmented control on the right, on one line, with a hairline below.

### Input
Underline only: no box, no radius. Mono label above (10.5px uppercase `#8A8A8A`), value at 18px `#F2F2F2`, placeholder `#5A5A5A`, underline 1px `rgba(255,255,255,0.28)`. Hover makes the underline 60% white. Focus makes the underline green with a `0 1px 0` green shadow (2px total). Errors show as green mono text right-aligned in the label row (e.g. "Needs 8+ characters").

### Picture / card focus (any series: onboarding picks, story cards, travel cards, collections)
Scale **1.035** over 350ms `cubic-bezier(.2,.8,.2,1)` on hover **or** arrow-key cursor. Enter picks the item. This is the same zoom as the feed.

### Cards (feed only)
Article, "Because" and intro cards: `#161616` fill, 1px `rgba(255,255,255,0.08)` border, 0 radius, padding 16×14.
- Eyebrow: Geist Mono 10px uppercase `#8A8A8A`, with a green 6px dot for Because/Ambit.
- Title: Hanken 19px/1.2/400, `#F2F2F2`.
- Lede: 13.5px `#9A9A9A`.
- "Because" target: `→ phrase`, 15px white. It is no longer blue.

### Sheets, popovers, toast
- **Bottom sheet:** `#141414`, square top edge with a 1px `rgba(255,255,255,0.2)` top border, a 36×3 `#444` grabber, a mono header row with a hairline, and hairline-divided rows. Slides up 240ms with the sheet easing.
- **Desktop dialog:** 520px wide, `#121212`, 1px border, dialog shadow.
- **Toast:** `#F2F2F2` block, `#0E0E0E` Geist Mono 11px uppercase, 0 radius.

### Toolbars (production, unchanged)
- **Phone:** pill 56px tall, `rgba(240,237,231,0.225)`, `blur(26px) saturate(180%)`, 0.5px white/28 border. Contents: Profile (person glyph, animated pastel gradient, 10s loop), Feed (orbit glyph; tap scrolls to top on the feed), Save. On item views, **Share** is a detached 56px glass disc beside the pill.
- **Desktop:** the same glass at `.14` as a vertical rail fixed at the right, centred vertically. Share is a 68px disc below it on item views.
- On image item views, the toolbar starts **hidden** and fades in on tap or scroll (see Item Image).

## Screens

### Final (implement these)
| File | Screen | Notes |
|---|---|---|
| `Ambit - Feed Masonry 4.dc.html` | Feed: phone | Layout and mechanics identical to production. Restyled intro card ("What is this?" with a white "Read how it works" block), article and Because cards, long-press sheet ("Closer look" white block plus collection rows), collections picker, spinner, toast. `showIntro` and `showSerendipity` props. |
| `Ambit - Feed Desktop 2.dc.html` | Feed: desktop | Four masonry columns (max 1112px), and the 4/2/1 layout picker in the rail. Hover: scale 1.035 and lift shadow over 350ms, and the DRIFT/JUMP/CORE tag hides while lifted. On-photo controls (fade in 250ms on hover): collection chip "posters ⌄" and a 32px bookmark, both `rgba(14,14,14,.30)` with blur(10) and a 0.5px white/18 border, **square**. Clicking the chip opens the **Save to collection** panel (340px): a mono header with count, then rows of 38px 2×2 thumbnail, name (15px) and mono count, a green dot on the current collection, and a "New collection… / Name it and it's made" row with a dashed + square. The saved bookmark fills green. |
| `Ambit - Item Image.dc.html` | Image item: phone | Opens as **only the image**, contained and centred on `#0A0A0A`, filling the viewport. Tap toggles the chrome. Scrolling past 24px reveals it and it stays. Below the fold: title 32px/400, "from **source ↗**" (an underlined link to the original), description 16px, then hairline rows (From ↗ / By / Date / License / Topic, with mono labels in a 92px column), a white "Read the original on [source] ↗" block, and "Where Ambit would wander next" rows with green dots, then the invite block. A horizontal swipe returns to the feed scrolled to this item. The "Shared by" line is removed. |
| `Ambit - Image View Desktop.dc.html` | Image item: desktop (gallery) | A 100vh hero with the image contained. Chrome (caption bottom-left, "↓ Information", rail) fades in on any input and out after 2.6s idle. Below: a mono label row (Ambit · No. · topic · source link), then three columns: mono kind label, the details stack (maker, *title*, medium, where, year, From link, rights), and a 28px body with a "[Read the post on …..]" link, followed by the wander-next rows. A **Spread** mode (rail toggle and `layout` prop) shows two works side by side as Fig. 01 and Fig. 02 columns. There's no big title and no footer. |
| `Ambit - Item Text.dc.html` | Article item: phone | Starts at the title (the "Today's reading" eyebrow is removed). Lede, a meta strip (Source / Reading / Kept in), then the article body. Production toolbar plus share disc. |
| `Ambit - Profile Desktop.dc.html` | Profile: desktop | No header row. Avatar and name at 64px/400, mono handle and count. Mono tabs (Collections / Topics / Edit profile / Settings), with the active tab white with a 1px underline. **Collections:** a four-column grid of square tiles (2×2 collage), name and mono count, plus a dashed "New collection". **Topics:** a search input (underline) and rows with a 4-way segmented control. **Edit:** underline inputs, a white "Save changes" block and a Discard link. **Settings:** mono group headers, hairline rows with mono values and an →, a green dot for attention items, and a small white "Install" block. |
| `Ambit - First Exhibition.dc.html` | Onboarding "First exhibition" | `frame` prop for phone (390) or desktop. Steps: **Intro** (centred 480px column with a mono label, a 30–40px title, intro, three green-bullet lines and a full-width 56px "Begin") → **4 × "Which would you look at longer?"** (4 pictures, keys 1–4 / N) → **"Same subject, different hands"** ×3 and **"…a different feeling"** ×3 (pairs, ← → / B) → **Keep or pass** ×10 (phone: card with Pass/Keep; desktop: two columns, a 10-tick progress bar with the current tick green, the question, the item label, 56px Pass/Keep, and the image contained at the right) → **"Which would you open?"** ×2 (story cards **with 4:3 pictures**) → **"Where would you go next?"** (pick up to 3, no coordinates) → **"Anything you would rather not see?"** (chips) → **Bonus** (free text mapped to topics, with green "Proposed" tags) → **Reveal "Quiet Gardens"** (hang of kept pictures, temperament bars, travel compass with green markers, "You'd open", **Your mix** level rows, Kept out with Allow, "Open my feed"). There's no header and no "Collected" strip. Arrow keys move a cursor through cards and chips, and Enter picks. |
| `Ambit - Sign Up.dc.html` | Sign-up / sign-in sheet | `frame` prop. Phone: a bottom sheet with a square top edge over a dimmed feed. Desktop: a 520px centred dialog. Header row: orbit glyph (green planet dot), mono "Ambit" and the mode. Title "A quieter way to be curious.", then the intro. Underline inputs: Name / Email / Password, with Name hidden in sign-in mode. A 56px white "Create account". A green dot with "Invite-only · no ads, no algorithm", and the "Already have an account? Sign in" link toggles the mode. Validation: email must contain @, password 8+ characters (inline green hint plus toast). |

### Partial (still use Barlow Condensed uppercase headings; switch to the Diatype-simple type when built)
`partial/Ambit - Profile.dc.html`, `partial/Ambit - Settings.dc.html` and `partial/Ambit - Onboarding v2.dc.html` (the earlier onboarding; First Exhibition supersedes it). Use them only for structure, and apply the type rules above.

### Not redesigned yet
Saved, Profile Edit (phone), Landing, Install, and the immersive Gallery (phone). Apply the tokens and component rules; there are no screen specs yet.

## Interactions & behaviour (summary)
- **Feed:** infinite scroll (sentinel plus a 600px threshold). Scroll position is restored from sessionStorage, and `?focus=id` scrolls to an item. Tap opens the item. A 450ms long-press opens the sheet (8ms haptic), and moving more than 10px cancels it. The tiles' hover lift is desktop only.
- **Item image (phone):** image-first, with the chrome hidden. Tap toggles the chrome, and scrolling past 24px shows it. A horizontal swipe of more than 70px returns to the feed with `?focus=`.
- **Image view desktop:** chrome wakes on mousemove, keydown, wheel, touch or scroll, and hides after 2600ms idle (fade 450ms).
- **Focus model:** keyboard focus is always visible (2px green ring, `:focus-visible` only). Series items get the zoom on arrow-key cursor as well as hover.
- **Toast:** 1.6–1.9s.

## State (per prototype; map onto the existing stores)
`saved: Set<itemId>`, `collections: {itemId → name}` and `collectionNames[]` (localStorage `ambit.saved.v1`, `ambit.collections.v1`, `ambit.collectionNames.v1`). Feed layout columns: `ambit.feedLayout.v1`. Profile: `ambit.profile.v1`. Onboarding: `step`, `sub`, `cursor`, `collected[]`, `kept[]`, `places[]`, `avoid[]`, `bonus`, `levels{}`.

## Renames / copy changes
- Onboarding is now called **"First exhibition"** (intro label: "First exhibition · About two minutes").
- The intro adds three bullets: "Ten quick picks between pictures and pieces of writing" · "Anything you would rather not see" · "Your first exhibition, and a feed tuned to it" (new copy; route it through the copy deck).
- On desktop, keep/pass is headed "Would you keep this one?" (mobile keeps "Keep or pass.").
- Item image: the "Shared by …" line is removed. Source links read "from [source] ↗" and "Read the original on [source] ↗".
- Item text: the "Today's reading" eyebrow is removed.
- The reveal title is "Quiet Gardens" (generated per user).

## Screenshots
`screenshots/`: `phone-*` captures are 390px phone frames, and `desktop-*` captures are the desktop layouts. Both were taken at 60% zoom from the prototypes.
- 01 feed (desktop includes hover and the Save to collection panel)
- 02 item / image view (hero, chrome visible, info below)
- 03 profile tabs (desktop) and item text (phone)
- 04a–j First Exhibition, every step
- 05 sign-up

Captures are DOM re-renders, so images hot-linked from Wikimedia, and some vh-sized hero images, show up **blank or dark**. Open the HTML for those. Spacing, type and colour are accurate.

## Tokens
`tokens.css` (CSS custom properties plus interaction recipes) and `tokens.json` (flat). Dark only.

## Assets
- `assets/`: `turner.jpg`, `wave.jpg`, `pillars.jpg`, `vanderbilt.jpg` (public domain), and `content.json` (item copy used by Item Image).
- `uploads/*.webp`: production feed images used by the desktop feed mock.
- Some prototypes hot-link Wikimedia Commons public-domain images (Vermeer, Haeckel, Van Gogh, Hubble).
- Icons are inline SVG: orbit/feed glyph, bookmark, share, and the person glyph with its animated radial gradient (stops cycle `#A8AEFF → #E0A184 → #7FC4B0 → #E8D48A`, 10s). Fonts are from Google Fonts: Hanken Grotesk and Geist Mono.

## Files
```
README.md               this brief
tokens.css / tokens.json
docs/BRIEF_original.md  the production brief this answers
Ambit - *.dc.html       final screens (open in a browser; needs support.js beside it)
partial/, reference/    older or partial screens, accent exploration
support.js, image-slot.js, ios-frame.jsx   prototype runtime only — not for production
assets/, uploads/       images
```
