# Design: the sitewide redesign ("1b" — black and white, Kelly green, Hanken + Geist Mono)

_Decided with Ben 10-06-26. The plan that builds it is `docs/PLAN_redesign.md`; the package it
applies is `docs/ambit_Redesign_4/` (start with its `README.md`). This document is what the
package cannot tell you: **which of its choices Ambit takes, which it does not, and how each lands
on the code that exists.** Where this document and a prototype disagree, this document wins —
every disagreement below is a decision Ben made on purpose._

## 0. What the package is, and how to read it

Ben ran the redesign through Claude Design from `docs/BRIEF_claude-design-redesign.md` and exported
`docs/ambit_Redesign_4/`:

- `README.md` — the brief's answer: ground rules, state tables, per-screen notes. **Authoritative
  for look.**
- `tokens.css` / `tokens.json` — the flat token list.
- Eight **final** prototypes at the folder root (`Ambit - *.dc.html`). Single-file HTML; **the
  inline styles are the spec.** Open them from the folder root in a browser (they need
  `support.js` beside them), or just read the markup.
- `partial/` — earlier phone Profile / Settings / Onboarding v2: **structure only**, their Barlow
  Condensed headings are superseded.
- `reference/` — the accent exploration (the chosen one is option 2e, Kelly green).
- `screenshots/` (git-ignored, on Ben's machine) — DOM re-renders at 60% zoom; hot-linked images
  come out blank. Spacing, type and colour are accurate.

**Recreate, never paste.** The prototypes are reference; the app's own components are rebuilt to
match. `support.js`, `ios-frame.jsx`, `image-slot.js` are prototype runtime and are not ported —
the same convention as every earlier handoff.

**Known flaws in the package** (so nobody copies them):

1. **Barlow Condensed survives in two "final" prototypes** — Item Text's title, section heads and
   drop cap, and the save/share sheets in Item Text and Item Image. The README's type rule
   (Hanken 400, sentence case) wins. No drop cap.
2. The desktop feed prototype shows a **4 / 2 / 1 layout picker**, a **lavender** selected row, and
   the **tier tag on every tile**. None is adopted (§2, §8).
3. The README says the segmented order is "Off / A little / Some / A lot"; its own Profile
   prototype and screenshot say **a little / some / a lot / off**, which is also the app's. The
   app's order stays.
4. The README's "tile hover stays as production" sits beside a different lift shadow in
   `tokens.css`. The token is taken (§3).

## 1. Ground rules (the README's, non-negotiable)

- **The feed layout does not change.** Tight masonry, 4 px gutters, no captions, the same loading,
  scroll and long-press mechanics, 2 / 3 / 4 columns by width. Only its components are restyled.
- **Toolbars keep the production look** — the frosted warm-glass pill and rail, the animated
  pastel profile glyph, the detached share disc. Not restyled. (Their *visibility rules* on the
  item screen do change — decision 7.)
- **Feed tile hover stays** — 3.5% zoom + lift over 350 ms. On-photo save controls stay very low
  opacity.
- **No header bars** on any screen.
- **No rounded corners** except the nav pill / rail and circular things (share disc, avatar, 6 px
  dots, the loader's dot).
- **Dark only.** No light theme.

## 2. Decisions (Ben, 10-06-26)

| #   | Question                             | Answer                                                                                                                                                                              |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Onboarding navigation                | The prototype's: a pick advances by itself after 380 ms, no bottom bar, no step count — **plus a small "Back" text link** so a mis-tap can be undone                                  |
| 2   | Reading amount                       | **Moves to the reveal** as a "Reading mixed in" row, still preselected from the article cards. The `amount` question leaves the bank → `BANK_VERSION = 3`                            |
| 3   | "Your mix" headings                  | **Grouped** — Subjects / Mediums & traditions / Looks / Places / Writing — on the reveal _and_ on Profile → Topics. This reverses the 10-02-26 flat-list ruling for these two screens |
| 4   | "Proposed"                           | **Real topics only.** Bonus lists the real topics the words mapped to (no "why", no score). The green tag marks rows Ambit added itself (starter top-ups)                             |
| 5   | Phone picture, sideways swipe        | **Shipped gestures stay**: sideways walks the wander rail, down-flick / Escape / the pill leaves, pinch zoom stays. (The prototype's "swipe returns to the feed" is not taken)        |
| 6   | Desktop feed 4 / 2 / 1 layout picker | **Left out.** Rejected 09-27-26 (`docs/DESIGN_spread-mode.md`), and it breaks ground rule 1                                                                                          |
| 7   | Item chrome (toolbar, caption)       | **The prototype's rules.** Phone: starts hidden, a tap toggles, scrolling past 24 px shows it and it stays. Desktop: any input wakes it, 2.6 s idle hides it, 450 ms fade, plus a "↓ Information" link. The 10 s show/hide loop goes |
| 8   | Desktop item information             | **The three-column layout, with the fields Ambit has.** The title stays in the page as its `<h1>`                                                                                     |
| 9   | Pairs                                | "Both, equally" as the outline button **and a quiet "Neither" link**. Scoring unchanged                                                                                               |
| 10  | Keep or pass                         | One picture at a time. **Pass scores nothing** — the same arithmetic as the old grid's un-kept picture                                                                                |
| 11  | Captions under pictures              | **A number and the picture's own title** (the item's title, in mono) — never the wing's name                                                                                          |
| 12  | Copy                                 | **Prototype wording pre-fills the copy deck's New column** where Ben had not written; anything he writes there wins. `docs/COPY_onboarding.md` is still the verdict                    |
| 13  | Shipped features a prototype omits   | **Keep them all, restyled.** A prototype not drawing a thing is not a decision to remove it (§7 lists them)                                                                           |
| 14  | Profile → Topics, "off"              | **The row goes, as today.** Search brings a topic back; at least one must stay                                                                                                        |
| 15  | Saved (no design yet)                | **A title block, no sticky bar.** The back chevron goes; the toolbar's Feed leaves                                                                                                    |
| 16  | Delivery                             | **One branch, `feat/redesign`.** Ben looks after each phase; it merges and deploys once, when every screen is done                                                                    |

Earlier open decisions this closes: the critique plan's D1 (one accent, knob retired), D2 (the
button model), D3 (Keep is one-at-a-time; pass scores nothing), D5 (one free-text question), D6
(**the exhibition frame stays** — the reveal is still "Your first exhibition"), D7 (the reading
amount is a control on the reveal, reversing the recommendation there), D8 (no "Collected" strip).
D4 (wing names) is moot on screen — the names are no longer printed over pictures — and survives
only in the reveal's subtitle; Ben renames in the copy deck if he wants.

## 3. Tokens — how the package lands on `src/styles/globals.css`

### 3.1 Colour: keep the alpha ladder

The app tones everything as `ink` at a fixed opacity (`text-ink/62`, `border-ink/12`, …: ~250 uses,
25 distinct steps). The package names nine greys and seven hairlines instead. **They are the same
ladder**: once `--color-ink` is `#F2F2F2` on `#0E0E0E`, each alpha step lands within a shade of a
named grey. So the ladder stays, the whole app re-tones from two tokens, and this table is the
vocabulary for anything new:

| Package token                        | Value                   | Use                              | Write it as                         |
| ------------------------------------ | ----------------------- | -------------------------------- | ----------------------------------- |
| `ink`                                | `#F2F2F2`               | Titles, primary text, white fill | `text-ink` / `bg-ink`               |
| `ink-1`                              | `#E6E6E6`               | Body on dark                     | `text-ink/95` (or plain `text-ink`) |
| `ink-2`                              | `#BDBDBD`               | Secondary, text links            | `text-ink/78`                       |
| `ink-3`                              | `#A8A8A8`               | Intro / lede                     | `text-ink/68`                       |
| `ink-4`                              | `#9A9A9A`               | Card lede, mono labels           | `text-ink/62`                       |
| `ink-5`                              | `#8A8A8A`               | Meta, counts, most eyebrows      | `text-ink/55`                       |
| `ink-6`                              | `#7A7A7A`               | Mono row labels                  | `text-ink/48`                       |
| `ink-7`                              | `#6A6A6A`               | Hints                            | `text-ink/40`                       |
| `ink-8`                              | `#5A5A5A`               | Placeholders, disabled           | `text-ink/34`                       |
| `line-faint`                         | `white / 8%`            | Row dividers, card border        | `border-ink/8`                      |
| `line-soft`                          | `white / 12%`           |                                  | `border-ink/12`                     |
| `line`                               | `white / 14%`           | Section dividers                 | `border-ink/14`                     |
| `line-strong`                        | `white / 16%`           | Header rules                     | `border-ink/16`                     |
| `line-ctrl`                          | `white / 22%`           | Segmented outline                | `border-ink/22`                     |
| `line-input`                         | `white / 28%`           | Input underline, chip off        | `border-ink/28`                     |
| `line-btn`                           | `white / 35%`           | Outline button                   | `border-ink/35`                     |

Existing steps that are close enough (`/82`, `/72`, `/60`, `/58`, `/50`, `/45`, `/42`, `/38`,
`/32`, `/30`, `/28`) are **left alone** unless a screen spec below gives a value. Nobody
mass-rewrites 250 class strings.

Surfaces:

| Token today         | Was       | Becomes                | Note                                                           |
| ------------------- | --------- | ---------------------- | -------------------------------------------------------------- |
| `--color-bg`        | `#161411` | `#0E0E0E`              | App background, feed                                           |
| `--color-bg-app`    | `#0c0b09` | `#060606`              | Behind a screen's content                                      |
| `--color-immersive` | `#0b0a08` | `#0A0A0A`              | Behind a picture on the item screen                            |
| `--color-surface`   | `#1b1815` | `#141414`              | Bottom sheets, popovers                                        |
| _(new)_             |           | `--color-dialog #121212` | The centred desktop dialog and the sign-up sheet             |
| _(new)_             |           | `--color-card #161616`, `--color-card-2 #1E1E1E` | Article / Because / intro cards, image placeholder; empty thumb cells |
| `--color-overlay`   | `#1e1c18` | _removed_              | The toast is a white block now                                 |
| `--color-scrim`     | `#090806` | `#000000`              | Used at `/60`, **no blur**. Sign-up's scrim is `rgba(6,6,6,.62)` |
| `--color-tile-hi/lo` | warm     | `#161616` / `#0E0E0E`  | Tile placeholder gradient → flat card colour                   |
| `--color-ink`, `--color-ink-hi` | `#efebe0`, `#f5f1e7` | both `#F2F2F2` | `ink-hi` stays as a name so 48 uses need no edit; pure `#FFFFFF` appears only as a hover state |
| `--color-accent`    | knob      | `#2BB24C`              | A plain `@theme` token. §3.2                                   |
| `--color-on-accent` | `#17140e` | `#0E0E0E`              | 6.97 : 1 on the accent. **Never white on green** (2.8 : 1)     |
| `--color-focus-ring` | `#a8aeff` | `var(--color-accent)` | One ring colour                                                |
| `--color-error`     | `#d98c6a` | _removed_              | Errors are green mono hints (§4.4); attention is the green dot |

The toolbar glass is production and **does not move**: `TOOLBAR_GLASS` in `ui/pill-toolbar.tsx`
already equals the package's `--glass-phone`. The rail's `.14` variant likewise.

Hard-coded `#161411` outside CSS: `app/layout.tsx` (`themeColor`), `app/manifest.ts`,
`components/icons/marks.tsx` → `#0E0E0E`.

### 3.2 The accent has seven jobs, and the knob is gone

One colour, used sparingly. **The default button is white, not green.** Green appears only as:

1. the 6 px dot (Because, the Ambit intro card, list bullets, "invite-only", wander rows, the
   current collection, an attention item in Settings);
2. the current tick of a progress bar (keep or pass) and the compass markers;
3. the 2 px keyboard focus ring;
4. the 2 px inset underline on a hovered button or segment, and a hovered link's underline colour;
5. the saved bookmark's fill;
6. the "Proposed" tag;
7. an input's focus underline, and an inline error hint.

Everything else that is accent-coloured today — eyebrows, links, icons, filled buttons, selected
chips and segments, the loader ring — becomes ink.

Retired with the knob: `src/lib/accent.ts`, `components/accent-sync.tsx`,
`components/settings/accent-sheet.tsx`, the `[data-accent]` block and `--accent-raw`, the
`data-accent` attribute and the pre-paint script in `app/layout.tsx`, Settings → Appearance.
`localStorage["ambit.accent.v1"]` is simply never read again.

### 3.3 Type

- **Hanken Grotesk** (400, 500, italic 400) replaces Sora for everything readable →
  `--font-sans`. **Titles are regular weight, sentence case, tight tracking** (−0.02em; −0.025em on
  display sizes). There is no semibold title anywhere any more. Italic is new to the app: it marks
  a secondary half-sentence ("_Mostly photography and scientific drawing._", "_Changes save as you
  go._") and an artwork's title in the desktop details.
- **Geist Mono** (400, 500) → `--font-mono`, for eyebrows, labels, counts and meta: uppercase,
  9.5–12 px, +0.4 px tracking, almost always `ink-5` grey. **The accent-coloured Sora eyebrow —
  the old app's one typographic signature — is gone.**
- Both through `next/font/google`, which self-hosts at build time, so the CSP's `font-src 'self'`
  is untouched. Inter stays loaded for the parked landing overture alone.

Scale (add as `@theme` tokens; use them in rewritten components, do not mass-migrate the 239
`text-[NNpx]` already in the code):

| Token            | Size / leading / tracking                | Where                                              |
| ---------------- | ---------------------------------------- | -------------------------------------------------- |
| `--text-display` | `clamp(30px, 4.2vw, 40px)` / 1.1 / −0.02em | Page titles: onboarding intro, sign-up (26–32)   |
| `--text-title`   | 32 px / 1.08 / −0.02em                   | Item title (phone)                                 |
| `--text-h2`      | 24 px / 1.35 / −0.01em                   | Section heads; the Topics summary line             |
| `--text-card`    | 19 px / 1.2 / −0.01em                    | Article card title                                 |
| `--text-lg`      | 17 px / 1.4                              | Rows, list items, the primary button's label       |
| `--text-body`    | 16 px / 1.5                              | Body; inputs are 18                                |
| `--text-sm`      | 15 px / 1.4                              | Buttons, links, row values                         |
| `--text-xs`      | 13.5 px / 1.48                           | Card lede                                          |
| `--text-eyebrow` | 10.5 px mono, uppercase, 0.4 px          | Range 9.5–12                                       |

Screen-specific display sizes are given where they occur: onboarding questions
`clamp(34px, 6cqw, 72px)` / 1.04 / −0.025em; the reveal title `clamp(64px, 14cqw, 200px)` / 0.92 /
−0.04em; the profile name 64 px / 1; the desktop item summary 28 px / 1.32. `cqw` is a
container-query unit — the onboarding column is the container (`@container` in Tailwind v4).

### 3.4 Shape, elevation, motion

- **Radius:** every `--radius-*` token becomes `0` except `--radius-pill` (the nav toolbar only).
  Round is written `rounded-full` and is allowed only on circular things. A guard test pins the
  allow-list (`src/no-rounded.test.ts`).
- **Lines are 1 px.** `.border-hairline` (0.5 px today) becomes 1 px; the on-photo glass and the
  toolbar keep an explicit 0.5 px.
- **Shadows:** `--shadow-lift` → `0 14px 34px rgba(0,0,0,0.45)` (was `0 22px 44px / .6`); new
  `--shadow-dialog 0 30px 80px rgba(0,0,0,0.60)` and `--shadow-popover 0 20px 50px rgba(0,0,0,0.50)`;
  `--shadow-toolbar` unchanged; `--shadow-sheet`, `--shadow-toast`, `--shadow-banner` removed with
  their users (a square sheet has a top border, not a shadow).
- **Motion:** easings unchanged (`--ease-lift` = the package's `ease-out`; `--ease-sheet` equal).
  Button and segment hover 150 ms; on-photo controls fade 250 ms; sheets slide 240 ms; the tile
  and every "series" picture zoom **1.035 over 350 ms**; a chip's cursor zoom is 1.05. `chip-pop`
  is removed.
- **Focus:** keyboard focus is always visible — `:focus-visible { outline: 2px solid accent;
  outline-offset: 3px }` as one base rule (2 px offset inside a segmented control; **inset, −2 px**
  on feed tiles, as today). Most controls have no focus style today; this gives every one a ring.

## 4. Primitives (`src/components/ui/`)

State tables are the README's, restated against the tokens above.

### 4.1 Button

| Variant   | Rest                                             | Hover                                              | Pressed    | Disabled                         |
| --------- | ------------------------------------------------ | -------------------------------------------------- | ---------- | -------------------------------- |
| `primary` | `bg-ink` (`#F2F2F2`), no border, `text-on-accent` | `#FFFFFF` + `box-shadow: inset 0 -2px 0 accent`    | `#E6E6E6`  | `bg-white/12`, `text-ink/34`     |
| `outline` | transparent, 1 px `ink/35`, `text-ink`           | `bg-white/8`, border `ink`, the same green underline | —        | border `ink/16`, `text-ink/34`   |
| `link`    | no box; `text-ink/78`, underlined, offset 3 px   | `#FFFFFF`, underline colour accent                 | —          | `text-ink/34`, no underline      |

Sizes: `lg` 56 px tall, 17 px; `md` 46 px, 15 px (the default); `sm` no fixed height, 14 px,
padding 6 × 14 (Settings' "Install", the intro card). Weight 400. Sentence case — **no uppercase
buttons.** 150 ms transitions. `shape` is gone; `accent` → `primary`, `ghost` → `outline`. Full
width inside sheets.

### 4.2 Chip (a toggle — "rather not see", Saved's filters)

Off: transparent, 1 px `ink/28`, `text-ink/95` 16 px, padding 11 × 16. Hover or keyboard cursor:
border `ink/70`, scale 1.05 over 350 ms ease-out. On: `bg-ink`, border `ink`, dark text. `sm`
(Saved's filters): 13.5 px, 8 × 12. `aria-pressed` stays. The `mixed` state and the pop animation
are removed (nothing has used `mixed` since the group pickers went on 10-02).

### 4.3 Segmented (the four-way level control; the reading amount)

One 1 px `ink/22` outline around joined cells, a 1 px `ink/22` divider between cells. Cell: Geist
Mono 10.5 px uppercase `text-ink/62`, padding 9 × 11 (below `md`: 9.5 px, 9 × 7). Hover
(unselected): `bg-white/8`, `text-ink`, the 2 px green inset underline. Selected: `bg-ink`, dark
text — **except a selected "off"**, which is `#2A2A2A` with `text-ink/78` (the Profile prototype;
"off" is not an achievement). **`role="radiogroup"` of `role="radio"` buttons with `aria-checked`
and arrow-key movement** — a change from today's `aria-pressed` buttons, so every test that finds
a segment by `button … pressed` moves to `radio … checked`.

The row it lives in: name block left (the green mono "PROPOSED" tag sits **above** the name, flush
left), control right, one line, a `ink/8` hairline below.

### 4.4 Input, Textarea, Field

Underline only — no box, no radius. Value 18 px `text-ink`; placeholder `text-ink/34`; underline
1 px `ink/28`; hover `ink/60`; focus: underline accent + `box-shadow: 0 1px 0 accent` (2 px
total). A new `Field` wraps it: a **visible** Geist Mono label above (10.5 px uppercase
`text-ink/55`) with a right-aligned slot in the same row for a hint or error in **green mono**
("Needs 8+ characters"). This replaces the `sr-only` labels on the auth card. Two display sizes:
22 px on the profile's desktop tabs, 20–28 px (`clamp(20px, 2.4cqw, 28px)`) on onboarding's Bonus.

### 4.5 Bottom sheet, dialog, popover

- **Sheet (below `md`):** `bg-surface` (`#141414`), square, 1 px `ink/20` top border, no shadow;
  grabber 36 × 3 `#444`, square; then a **mono header row, left-aligned, with a `ink/14` hairline
  under it** (and "Close" in ink on the right where the sheet has no grabber). Hairline-divided
  rows. Slides up 240 ms on `--ease-sheet`. Scrim `black/60`, **no blur**.
- **Dialog (`md`+, centred):** 520 px, `bg-dialog` (`#121212`), 1 px `ink/20` border,
  `--shadow-dialog`.
- **Popover (`md`+, anchored):** **340 px** (was 360), `rgba(18,18,18,.94)` + `blur(20px)`, 1 px
  `ink/16` border, `--shadow-popover`. No scrim, as today.
- The `gallery` variant's 26 px top radius goes; everything else about `BottomSheet`'s behaviour
  (drag to close, `anchor` / `placement`, the flip-above logic, focus handling) is untouched.

### 4.6 Toast, loader, links, labels

- **Toast:** a `bg-ink` block, dark Geist Mono 11 px uppercase (0.3 px), padding 10 × 14, square,
  no blur, no shadow. 1.6–1.9 s. Positions unchanged.
- **Loader:** the **Reach** mark stays (Ben's, 10-04-26) — ring in ink, orbiting dot in the
  accent; the label becomes Geist Mono 10.5 px uppercase `text-ink/48`. The prototype's plain
  spinner is not adopted (decision 13).
- **Text link** (new `ui/text-link.tsx`): underlined, offset 3 px, `text-ink/78` (or `text-ink` in
  body copy); hover `#FFFFFF` with the underline in accent. Two forms: `external` appends `↗`
  ("from _source_ ↗"), `bracket` wraps a "read more" as `[Read on Wikipedia..]`.
- **Eyebrow** (new `ui/eyebrow.tsx`): the one mono label — replaces six copies of
  `text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase` and about fifteen
  near-variants. Optional leading 6 px green dot.
- **IconButton** goes square. `ui/card.tsx` and `ui/glass-header.tsx` are deleted with their last
  users.

### 4.7 Cards (feed only), and "series" pictures

- Article, Because and intro cards: `bg-card` (`#161616`), 1 px `ink/8`, square, padding 16 × 14.
  Eyebrow: mono 10 px uppercase `text-ink/55`, with the green dot for Because / Ambit. Title 19 px
  / 1.2 / 400. Lede 13.5 px `text-ink/62`. The Because target reads `→ phrase` in ink, 15 px.
- Any picture in a series — onboarding picks, story cards, travel cards, collection tiles — scales
  **1.035 over 350 ms** on hover **or** on the arrow-key cursor. Enter picks.

## 5. Onboarding — "First exhibition", bank v3

Spec: `Ambit - First Exhibition.dc.html` (`frame` prop: phone 390 / desktop). Mechanics stay
except where a decision moved them.

### 5.1 What changes in the engine

- **`BANK_VERSION = 3`.** The `amount` question leaves the bank (decision 2); `read-watch` is
  retired and `look-at` becomes the one Bonus question (D5). Eight steps of questions; `steps.ts`
  loses its printed labels' purpose (no progress line) but `STEP_OF` still groups questions for
  the playoff and tests.
- **The reading amount is set on the reveal.** `defaultReadingAmount(opened, skipped)` still
  computes the preselect; the reveal's "Reading mixed in" row opens on it; `onboarding.complete`'s
  `writingAmount` is that row's value. `readingAmountFrom(bank, answers)` goes.
- **Captions:** `QuestionFace` gains `title` (the item's) — `services/question-faces.ts` already
  selects it for article cards.
- **The hang is six of the reader's kept pictures** (keeps first, then picks newest-first, then
  wing doors) — `hang.ts` was built 10-06 with three and picks first; it changes to match. The
  taste becomes `v: 2` with `hang: itemId[]`, validated server-side like `opened`. v1 rows already
  stored must still parse (`/profile/topics` reads them).
- **"Proposed":** a proposed row whose score is not positive is a starter top-up
  (`picks.ts`'s second and third passes) — that is the tag.
- **Keyboard:** arrows move a cursor through cards and chips, Enter picks; `1`–`4` pick directly
  on the four-card screens; `N` is "None of these"; `←` `→` pick a side on pairs and `B` is both;
  `←` `→` are Pass and Keep. A pure reducer (`keys.ts`), so the rules are tested without a DOM.
- **Unchanged:** `score.ts`, `show.ts` (the playoff), `compass.ts`, `temperament.ts`, the rather-not
  arithmetic, "None of these" scoring starters down, `picksFrom`'s caps. A pass is not an answer:
  Keep's answer is still the kept keys (decision 10).

### 5.2 The screen

No header, no bottom bar, no step count (`step-bar.tsx` goes). Everything sits in one container,
max 1120 px, padding `clamp(36px, 6cqw, 72px)` top; questions set in
`clamp(34px, 6cqw, 72px)` / 1.04 / −0.025em, left-aligned, with a `clamp(16px, 1.8cqw, 19px)`
`text-ink/62` sub-line. A pick is outlined (1.5 px `ink`, offset 3 px) and the screen advances
after **380 ms**. A quiet **"Back"** text link sits top-left on every question and on the reveal
(decision 1); it returns to the previous question with its answer shown, as `back()` does today.
Screens rise in (`Rise`, 600 ms) as now.

| Step                  | Phone (390)                                                                                  | Desktop                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intro**             | Centred column, max 480 px: mono label, display title, 16 px intro, a `ink/14` rule, three lines each behind a green dot, a full-width 56 px white "Begin" | The same column, centred in the page |
| **Rooms** ×3 + playoff | 2 × 2 grid of 4:5 pictures, 4 px gap; under each, mono `1  title`. Below: outline "None of these" + mono key hint | Four across                                                                                                                 |
| **Pairs** ×6          | Two 4:5 pictures side by side, 4 px gap; mono `←  title` / `→  title`. Outline "Both, equally", then a "Neither" link (decision 9) | Same, max 900 px wide                                                                               |
| **Keep or pass** ×10  | Heading "Keep or pass." One 4:5 card, max 440 px, centred; mono title left, source right; a row of outline "← Pass" · `01 / 10` · white "Keep →" | **Two columns** (`minmax(260px,1fr) minmax(0,1.25fr)`, gap up to 96 px, min-height ~76vh). Left, max 400 px: a mono header row "Keep or pass" / `01 / 10` over a rule; **ten 2 px ticks** (done = ink, current = accent, to come = `ink/16`); "Would you keep this one?" at 30–40 px; a sub-line; a rule, the picture's title (17 px) and source (mono); 56 px Pass / Keep side by side; mono "Arrow keys work too". Right: the picture **contained**, up to 72vh |
| **Which would you open?** ×2 | One column of story cards                                                              | Up to four across (`minmax(240px, 1fr)`, 24 px column gap). Each: a **4:3 picture**, a `ink/22` rule, mono kicker left / number right, title `clamp(22px, 2.6cqw, 30px)`, 15 px dek. Outline "I’d rather look at pictures" |
| **Where would you go next?** | One column of text cards                                                               | `auto-fill, minmax(240px, 1fr)`. Each card: a top rule (`ink/18`; `ink` when chosen or under the cursor), mono country left / "● Chosen" right, the place at 22 px, a 14 px line. Up to three; the rest dim to 40% once three are chosen. White "Continue", a "Nowhere in particular" link, mono "_n_ of 3 chosen" |
| **Rather not**        | Square chips, wrapping, 8 px gap                                                             | Same, max 900 px. White "Continue" + a "Show me everything" link (clears the list and moves on)                                                                  |
| **Bonus**             | Mono "Bonus question"; the question; an underline input at `clamp(20px, 2.4cqw, 28px)`, max 720 px; once the words are mapped, a line "Mapped to _n_ topics." over hairline rows of **real** topic names (decision 4 — no why, no score, no unlisted ideas). White "Continue to your exhibition" + "Clear and try again" | Same |
| **Reveal**            | See 5.3                                                                                      |                                                                                                                                                                 |

Card pictures that fail to load keep today's text-card fallback (label large on `bg-card`).

**Bonus mapping:** `onboarding.interpret` is called when the reader pauses (debounced ~800 ms, 3+
characters) and again on Continue if the text changed; a failure or timeout shows nothing and
blocks nothing, as today. The "Putting it together…" phase is no longer needed and goes. The
disclosure sentence keeps its two facts on screen (sent to OpenRouter; stored) — SPEC §3.2.

### 5.3 The reveal (and what `/profile/topics` shares with it)

Top to bottom, in the 1120 px container:

1. Mono eyebrow "Your first exhibition" (`FRAME.eyebrow`).
2. **The title** — adjective, line break, noun — at `clamp(64px, 14cqw, 200px)` / 0.92 / −0.04em.
3. The subtitle sentence (`exhibitionSubtitle`), `clamp(18px, 2.2cqw, 26px)` `text-ink/78`, max
   760 px, its "Mostly …" half in italics.
4. **The hang:** `auto-fill, minmax(min(46%, 180px), 1fr)`, 4 px gap, 4:5 pictures, each over a
   mono `01 · title` caption. Up to six. Fewer than two pictures available → no hang.
5. Two columns (`auto-fit, minmax(320px, 1fr)`, 48 px gap):
   - **Temperament** — mono header with `05` on the right over a rule; the one-line intro; five
     rows: name 17 px left, gloss 13 px `text-ink/55` right, then a 1 px `ink/14` line carrying a
     **3 px ink bar** to the value.
   - **Travel compass** — mono header / `04`; the compass sentence; four rows
     `64px | 1fr | 64px`: the leaning pole in ink, the other `text-ink/40` (`activePole`), a 1 px
     line with a **9 px green dot** at the value. Then **You’d open** — mono header / count; the
     reading sentence (`readingSummary`); each opened card as a mono kicker over a 20 px title.
     (The prototype's italic "tone" word is not data Ambit has; omitted.)
6. **Your mix** — heading `clamp(34px, 5cqw, 56px)`; a 15 px lede; then, under mono **facet
   headings** each with a rule (decision 3), the level rows of 4.3. Heading for each facet that
   has a row: `subject` → Subjects · `medium` + `tradition` → Mediums & traditions · `look` → Looks
   · `place` → Places · `form` → Writing. Last, **Reading mixed in**: one row, "How much writing in
   the feed", a four-way segmented None / A little / Some / A lot.
7. **Kept out** — mono heading; one hairline row per rather-not choice: label 17 px, an "Allow"
   link. Allow edits the answer (`kept-out.ts`), the proposal recomputes, and the draft re-seeds
   without losing hand-set rows (`reveal-draft.ts` — built 10-06). No row → no section.
8. The explore line, 14 px italic `text-ink/48`: "About one post in _n_ comes from outside this
   mix…", with _n_ computed from the feed's knobs (JUMP + WILD share), never a literal.
9. White "Open my feed" + a "Start over" link (clears the answers, back to the intro).

`/profile/topics` shows items 1–5 from the stored taste (hang included once stored), then its own
search and the same grouped level rows; "Retake the questions" is a text link. A v1 taste has no
hang and simply shows none.

## 6. Every other screen

Values are in the prototypes; this section is the decisions and the mapping.

### 6.1 Feed (`Ambit - Feed Masonry 4`, `Ambit - Feed Desktop 2`)

- **Grid, tiles, lift mechanics, press timing, scroll restore: unchanged.** Only: the lift shadow
  token, the focus ring colour, and a `bg-card` placeholder behind a loading picture.
- **Article card / Because / intro (`MessageTile`):** 4.7. The Diamond glyph becomes the 6 px
  round dot. The article card's eyebrow stays the **writing label** ("CURIOSITY · 4 MIN", DESIGN
  writing D5) — the prototype shows the source there; not taken. Its lede clamp stays. Because
  stays inert (the desktop prototype makes it a link; not taken) with its one fixed sentence.
- **The intro card stays on `/` (explore), not `/feed`.** Its buttons: the first a full-width
  white block, the rest outline.
- **Hover strip (`tile-actions.tsx`):** a square chip (32 px tall, padding 0 × 11, Hanken 14 px,
  9 px chevron) and a square 32 px bookmark, both `rgba(14,14,14,.30)` + `blur(10px)` + 0.5 px
  `white/18`; fade 250 ms. Saved = bookmark filled accent. Behaviour unchanged: a saved bookmark
  opens the picker, it never un-saves. The tile stays lifted while its picker is open.
- **Debug tier tag:** dev-only as today (`FEED_DEBUG`). Restyled mono 9.5 px on
  `rgba(14,14,14,.78)`, and it **hides while the tile is lifted** rather than filling with accent.
- **Save picker (`collection-rows.tsx`, popover on desktop / sheet on phone):** mono header "Save
  to collection" with the collection count on the right (`07`); rows: a **38 px 2 × 2 thumbnail**
  (1 px gaps on `bg-card-2`), name 15 px, mono count, and a **7 px green dot** on the collection
  the item is already in (replaces the accent ring). `NewCollectionRow`: a 38 px dashed box with a
  mono `+`, "New collection…", mono sub "Name it and it’s made" — **it keeps its naming form**; a
  collection is never auto-named.
- **Long-press sheet (`item-sheet.tsx`):** slides up; the item's title left-aligned at 20 px over a
  rule; a 46 px white "Closer look" block; the **Share** row kept; mono "Save to collection"
  label; hairline collection rows; `NewCollectionRow` at the foot.
- **"Your collections" (`collections-sheet.tsx`):** mono header; 17 px rows with a mono sub and a
  mono `→`.
- **Share sheet:** square link field (1 px `ink/20`), a white "Copy link" block, 52 px **square**
  targets with mono labels, the Save-image row with hairlines.
- **Loader row, end / empty / error states, the install banner / sheet / confirmation, the about
  dialog:** tokens and primitives; "Try again" is an outline button.

### 6.2 Picture item — phone (`Ambit - Item Image`)

- **Gestures, zoom, the rail, exits: unchanged** (decision 5). The 12 px hero inset stays (the
  zoom measures `data-page-box`).
- **Chrome (decision 7):** starts hidden; a tap toggles it; scrolling past 24 px shows it and it
  then stays. Fade 350 ms with a 12 px rise. **There is no caption over the hero on a phone** —
  the chrome is the toolbar and share disc only.
- **Below the fold** (22 px gutters): title 32 px / 1.08 / 400; "from _source_ ↗" 14 px
  `text-ink/55` with the source an underlined ink link; summary 16 px / 1.55 `text-ink/78`; fact
  rows — `92px | 1fr`, mono 10.5 px label, 15 px value, `ink/14` rules: **From ↗ · By · License ·
  Topic** (plus Debug under the flag; "Date" and "Held at" are not stored and are absent); a white
  block "Read the original on _source_ ↗" **on every item with a source URL** (**overruled
  10-08-26 after Ben's phone look: a 40 px inline white button, "Original post" for a blog or
  publication, "Original source" otherwise, no arrow** — `link-out-row.tsx`) (today only blog
  and PDR items have a link-out row); "Where Ambit would wander next" as hairline rows — green
  dot, 18 px title, 13 px reason, mono `→`; the join block for strangers — left-aligned, no card,
  26 px title, 14.5 px body, a 50 px white "Get your invite" block.
- **"Shared by …" is removed** (`shared-by-row.tsx` deleted). The PDR essay body and the reuse
  notice stay, restyled.

### 6.3 Picture item — desktop (`Ambit - Image View Desktop`)

- **Chrome (decision 7):** any input (mouse move, key, wheel, touch, scroll) shows it and restarts
  a 2.6 s idle timer; fade 450 ms. Over the hero: a 180 px `black/75 → transparent` gradient; the
  caption bottom-left (left 40, bottom 34) — a mono index, the title at 22 px / 400, a mono
  uppercase maker line; and "↓ Information" centred at the bottom, which scrolls to the details.
- **Information (decision 8),** full width with 40 px gutters: a mono label row (Ambit · the
  topic · the source link) over a rule; then `1fr 1fr 2fr`: **(1)** the topic as a mono label;
  **(2)** a 16 px stack — maker, the title in italics — then mono lines "From _source_ ↗" and the
  licence; **(3)** the summary at 28 px / 1.32 with `[Read the post on _source_..]` under it. The
  `<h1>` is the italic title in column 2's stack — visually modest, still the page's one heading
  (an e2e test counts it).
- **Wander next:** numbered rows, `60px | 1.3fr | 1fr | 30px`: mono `01`, a 24 px title, a 15 px
  reason, mono `→`; the count on the right of the header.
- **Magazine view keeps all its mechanics** — the turn, the spine, the drag lift, focus side, the
  dimmed unfocused folio, relative folio numbers, `M` (decision 13). Restyled only: folios take
  the caption's type. **New:** below the fold, a spread shows both pages' details side by side as
  **Fig. 01** and **Fig. 02** (left and right page), each a column of the stack above with a 40 px
  title. Save, Share, the URL and the caption's emphasis still follow the focused page.
- The join block for strangers stays, restyled as on the phone.

### 6.4 Article item (`Ambit - Item Text`)

Starts at the title — no eyebrow above it. Title **Hanken 32 px / 1.08 / 400** (not the
prototype's Barlow). Lede 17 px / 1.45. A **meta strip**: three columns between `ink/14` rules —
mono labels Source / Reading / Kept in over 13 px values (the source's name; the stored reading
time as "_n_ min"; the collection it is saved in, or "—"). Body 16 px / 1.65 `text-ink/78`; `h2`
24 px / 400 with a top rule; `h3` mono 11 px uppercase. `[Read on _source_..]`. **Wander-next
stays under articles** (decision 13), then the join block. Swipe-back and the always-visible
toolbar are unchanged. The reuse notice stays.

### 6.5 Profile (`Ambit - Profile Desktop`; phone structure from `partial/`)

- **Hub:** no header row. A flat `#2A2A2A` avatar disc (88 px; the per-user gradient and white
  ring go); the name at 64 px / 1 / −0.025em from `md` (34 px below); a mono line
  `@handle · N kept`. Mono tabs — 12 px uppercase, `text-ink/48`; the active one ink with a 1 px
  ink underline. Bio stays on the phone, 14.5 px `text-ink/78`.
- **Collections:** four columns at `xl`, gaps 40 (row) / 20 (column); the dashed "New collection"
  tile first (1 px dashed `ink/28`, no fill); names 17 px, counts mono 11 px uppercase; the cover
  mosaic's gaps on `#141414` with `#1A1A1A` cells; tiles take the 1.035 zoom. New collections
  still open the naming sheet.
- **Topics** (max 720 px): the summary at 24 px — "_n_ on. _Changes save as you go._" (second
  sentence italic `text-ink/62`); mono "Add a topic" over an underline search at 22 px; results as
  outline buttons; then the exhibition block (5.3 items 1–5) and the grouped level rows — names
  18 px. Off removes the row (decision 14). "Retake the questions" is a text link.
- **Edit:** at `md`, two columns (`1fr 2fr`, 40 px gap): the avatar left, fields right (max
  560 px, 30 px apart) — `Field`s at 22 px: Name, Handle, About, Email. Email stays read-only with
  its mono hint; a handle conflict shows as the green hint in the label row. A white "Save
  changes" block (14 × 28 padding, not full width) with a "Discard" link beside it. No "Change
  photo" (there is no upload).
- **Settings** (max 720 px): **no cards and no row icons.** A mono group header over an `ink/16`
  rule; rows 18 px with `ink/8` hairlines, a mono value, a mono `→`; a small white square action
  where a row acts ("Install"); the **green 6 px attention dot** replaces the error-coloured value
  (Notifications denied). The app's real rows stay (Account, Invite a friend, Add to home screen,
  What you see, Reading, Serendipity, Notifications, About, Get in touch) — the prototype's stubs
  (Muted sources, Camera roll, Language) are not added, and **Appearance is removed** with the
  knob. Sign out: its own row between two `ink/16` rules. The version line is mono, left-aligned.

### 6.6 Saved (no design; decision 15)

A title block in place of the sticky glass header: "Saved" at the profile-name scale's phone size
with a mono count under it, scrolling with the page; no back chevron. Square filter chips (4.2,
`sm`). The wall and its lift unchanged; the on-photo unsave control goes square on the low-opacity
glass. The empty state: no disc, a 24 px title, an outline "Back to exploring".

### 6.7 Sign-up and sign-in (`Ambit - Sign Up`)

- **Phone:** a bottom sheet, square, `bg-dialog`, 1 px `ink/20` top border, padding 22 / 24 / 34,
  over the feed dimmed by `rgba(6,6,6,.62)`. **Desktop:** a 520 px centred dialog with the border
  on all sides and `--shadow-dialog`, padding 26 / 32 / 30.
- A **header row** over a rule: the orbit glyph (22 px, ink, with a **green satellite dot**) and
  mono "Ambit" on the left; the mode in mono on the right ("Create account" / "Sign in"). The
  glyph is still the collapse control on the landing.
- Title "A quieter way to be curious." at `clamp(26px, 3vw, 32px)`; the intro at 16 px
  `text-ink/68`.
- `Field`s 22 px apart: Name (sign-up only), Email, Password — the password hint "Needs 8+
  characters" appears in green in the label row.
- A 56 px white button. A footer row: a green dot + mono "Invite-only · no ads, no algorithm" on
  the left; the mode-switch link on the right.
- **Kept** (decision 13): the default mode (sign-in), name required, zod email validation, server
  errors (shown as a green mono line under the button), the busy loader, **forgot password**, the
  "check your inbox" state and the reset-password page — all in the same pieces. No success toast;
  the app navigates.

### 6.8 The rest

`/~offline`, `/dev/tokens` (rebuilt as the style guide), `/dev/faces`, `/dev/marks`, the knob
panel, and the parked `/dev/landing` (tokens only — it is parked, not designed).

## 7. Kept though no prototype draws it (decision 13)

The Share row and `NewCollectionRow` in the long-press sheet · named collections everywhere · the
Reach loader · the article card's writing label · the inert Because tile · the writing tile's
badge and title scrim · image retry and "Image unavailable" · end / empty / error states · the
install flow · the right-click item sheet on desktop · the toast after a save · the popover's
flip-above logic · the wander rail, zoom, down-flick, Escape and arrow keys on the item screen ·
the 12 px hero inset · the PDR essay and reuse notice · wander-next under articles · the explore
end card and its cap · the sign-up surface for strangers · magazine view's mechanics · forgot /
reset password · the three-column feed between 768 and 1279 px · `Rise` entrances · the dev knob
panel and tier tag.

## 8. In the package, not adopted

The feed layout picker and its `ambit.feedLayout.v1` · the lavender selected row · the tier tag in
production · the plain spinner · sideways-swipe-to-feed on the picture screen · the static
two-work spread · un-saving from the hover bookmark · auto-named "Collection N" · the Because link
· the source as the article card's eyebrow · the intro card on `/feed` · Barlow Condensed and the
drop cap · fields Ambit does not store (medium, where, year, "No.", date, held-at, an item
"tone") · editable email and "Change photo" · the stub settings rows · "Proposed" topics that are
not in Ambit · the bonus mapping's "why" and score columns · success toasts on sign-up · greyed
"off" rows that stay on Profile → Topics · the README's off-first segment order.

## 9. Tests this is known to move

Unit: `ui/button.test` (shape classes), `ui/chip.test` (accent, pop), `ui/segmented.test` and
`settings/reading-sheet.test` (button → radio), `ui/input.test`, `ui/bottom-sheet.test` (radii,
scrim blur, 360 → 340), `ui/loader.test` (`text-accent`), `ui/column.test` (GlassHeader),
`sheets/collection-rows.test` + `sheets/sheets.test` (`ring-accent` → the dot),
`feed/debug-badge.test`, `feed/feed-grid.test` + `saved/saved-screen.test` (`shadow-lift` string is
a token — only if the class list changes), `feed/image-tile.test` + `feed/article-card.test` (ring
class), `settings/settings-screen.test` (accent test removed; `text-error`), `landing/landing-screen.test`
(radii), `no-dangerous-html.test` (no user left), `styles/globals.test` (shadow string),
`onboarding/*` (rewritten with the screen), `lib/interview/bank.test`, `path.test`, `taste.test`,
`hang.test`.

e2e: `settings.spec` (accent lines removed; segments as radios), `desktop.spec` (lift shadow
string, popover 360 → 340, `aria-pressed` on the spread toggle is unaffected), `onboarding.spec` +
`support.ts`'s `answerQuestionnaire` (auto-advance, the keep stack, the reveal's reading row),
`item.spec` (chrome rules: `summonChrome`, the phone's tap-to-toggle, no caption on the phone),
`explore.spec`, `feed.spec` (the article-card and Because selectors if they key on classes),
`security.spec` must stay green untouched.
