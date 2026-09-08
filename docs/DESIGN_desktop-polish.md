# Desktop polish — design

**Decided:** 09-07-26 evening, Ben + Fable 5.1, from four 1440 px screenshots of the app as it
stands (`desktop-onboarding.jpeg`, `desktop-feed.jpeg`, `desktop-item.jpeg`,
`desktop-profile.jpeg`, taken with Playwright against the local dev server; deleted once the
plan ships). **Plan:** `docs/PLAN_desktop-polish.md`.

## The problem

The redesign handoff is explicit: "Design viewport: 402 × 874. Everything is mobile-only; there
is no tablet or desktop layout" (`docs/design_handoff_ambit_pwa_redesign/README.md`). The app
honours that exactly, which means in a 1440 px browser every screen is the phone layout
stretched edge to edge:

- **Feed** — two 715 px columns, each image a wall. A 12-card page is six tiles deep and
  scrolls for metres.
- **Onboarding** — the topic chips run across the whole viewport in a single line and a half;
  the fixed action bar spans 1440 px for one button.
- **Item** — a 1400 px-wide hero at a hard 300 px tall (`object-cover` crops it to a letterbox),
  and the body text runs at a 1400 px measure.
- **Profile / Settings / Saved** — two-column tile grids and settings rows at full width.

Ambit is a PWA whose first home is a phone, and that stays true. But Ben reads it on a laptop
too, and the invite list will. The bar is "looks deliberate on a desktop", not "is a desktop
app".

## Three decisions (Ben's, 09-07-26)

1. **Shape: grow to fit, per screen.** Not a phone frame centered on a dark ground, and not a
   sidebar/two-pane app. Each screen keeps its phone composition and simply stops stretching:
   the feed masonry goes to three then four columns inside a capped container; reading pages
   get a book-width measure; every list-shaped screen centers in a narrow column. The phone
   layout is untouched below the breakpoint.
2. **Sheets become centered dialogs above the breakpoint.** Same component, same content,
   same keyboard contract; the panel caps at 520 px, centers both ways, and fades-and-scales
   in rather than sliding up. Below the breakpoint, byte-for-byte what ships today.
3. **Input: layout plus the basics.** Tiles are keyboard-focusable (Enter/Space opens), show a
   subtle hover on fine pointers, and **right-click opens the item sheet** because a desktop
   has no long-press. The gallery gains Escape to leave and arrow keys to move. Nothing more —
   no j/k navigation, no shortcut sheet, no visible focus-ring redesign beyond the accent
   outline.

## The design

### 1. Mechanism: one breakpoint, one column primitive

- **The breakpoint is Tailwind's `md` (768 px).** Nothing below it changes. Two bands above it
  exist only for the feed's column count (three from 768, four from 1280); everything else has
  exactly one desktop state.
- **`Column`** (`src/components/ui/column.tsx`) carries the three widths the whole design
  needs: `narrow` **600 px** (onboarding, saved, profile, edit profile, settings, reset
  password), `reader` **720 px** (the item page), `wide` **1120 px** (the feed). It is a `div`
  with `mx-auto w-full` and a `md:max-w-[…]` — nothing else — so below `md` it is invisible.
- Each screen's `<main>` wraps its content in one `Column`. Screens keep their own horizontal
  padding *inside* the column (the `px-5` / `px-6` / `px-[22px]` they have today), so at the
  breakpoint the content simply stops growing.
- **Fixed and sticky bars** that are full-width today keep their full-width chrome (the glass
  blur, the gradient) but put their *content* in the same `narrow` column, so the header's
  back button sits above the body's left edge rather than at the viewport's. Concretely:
  `GlassHeader` moves its padding and flex layout onto an inner `Column`, and onboarding's
  fixed action bar wraps its row in one.
- The pill toolbar is already `fixed inset-x-0 … flex justify-center` and does not change.
- The dev drawer on `/dev/feed` keeps its `lg:pr-[340px]`; the feed's column centers in what
  remains.

### 2. Feed: N-column packer, hydration-safe

- `packColumns(tiles, columnCount = 2)` generalizes the greedy shortest-column pack from a
  hard-coded pair to N stacks. Same algorithm, same tie rule (lowest index wins), same
  append-only guarantee per column, still pure and unit-tested. `Saved` keeps calling it with
  the default.
- **`useMediaQuery(query, serverValue)`** (`src/hooks/use-media-query.ts`) is the one
  primitive: `useSyncExternalStore` over `window.matchMedia`, server snapshot = `serverValue`,
  and a guarded `false` where `matchMedia` is absent (jsdom, old stubs). **`useColumnCount()`**
  builds on it: `(min-width: 1280px)` → 4, `(min-width: 768px)` → 3, else 2.
- **Why `useSyncExternalStore` and not a `useEffect` + state:** the first feed page is
  server-rendered (`app/feed/page.tsx` prefetches and `HydrateClient` dehydrates it), so the
  server has to commit to a column count. React hydrates with the server snapshot (2) and, if
  the client snapshot differs, re-renders synchronously *before paint* — so a desktop reader
  never sees two columns snap to four. A `useEffect` would paint the two-column layout first.
- The feed's grid class is chosen from a literal map (`grid-cols-2` / `-3` / `-4`), never
  computed, for the same reason `IMAGE_ASPECTS` are literal strings: Tailwind's scanner reads
  source text.
- Page size stays 12. At four columns a page is three tiles deep; the scroll sentinel simply
  fires sooner. The server composer (tier draw, `sourceCap`, Because cadence) is untouched.

### 3. Sheets become dialogs at `md`

`BottomSheet` keeps its API. It reads `useMediaQuery("(min-width: 768px)")` once and, when
true:

- **Panel:** `w-[520px]`, centered both ways (`left-1/2 top-1/2 -translate-x-1/2
  -translate-y-1/2`), rounded on **all** four corners at the sheet radius (22 px), a full
  hairline border, still capped at 80 % of the viewport with its own scroll.
- **Animation:** a new `dialog-in` / `dialog-out` pair (fade + scale 0.97 → 1, 200 ms in,
  150 ms out) replaces the slide for every variant, gallery included. The scrim pair is
  unchanged. The exit fallback timer keeps working because the pair is selected in JS, not
  CSS.
- **Grabber hidden, drag off.** `gestureEnabled` becomes `!isDesktop && (dragToClose ||
  Boolean(onSwipeSide))`; the grabber gets `md:hidden`. Backdrop click and Escape already close
  it; Tab already stays inside.
- **Every sheet inherits this** — item, save-to-collection, collections, share, and the
  gallery's details sheet. The landing's `AuthSheet` is deliberately *not* a `BottomSheet` (see
  its header comment); it gets the same treatment by hand: at `md`, a 520 px centered card that
  fades and scales instead of translating up.

### 4. Item, gallery, and input basics

- **Item page:** the content sits in a `reader` (720 px) column. The hero image drops its
  fixed 300 px height at `md`: `h-auto w-auto max-h-[70vh] max-w-full mx-auto object-contain`,
  so a tall plate is shown whole and a wide one fills the column. Below `md`, the 300 px
  `object-cover` crop stays exactly as shipped (it is the LCP element of the one public page;
  nothing about its `fetchPriority` / preload changes).
- **Tiles** (`ImageTile`, `ArticleCard`): `tabIndex={0}`, `role="button"`, an accessible name
  (the item title), Enter/Space call `onTap`, and an `onContextMenu` handler that — only when
  `onLongPress` is provided **and** the pointer is fine — calls `preventDefault()` and opens
  the item sheet. The `(pointer: fine)` guard is what stops Android's synthesized
  `contextmenu` at the end of a long-press from opening the sheet twice. Hover: the image
  tile zooms its `<img>` 3 % inside its clipped box over 300 ms; the article card lifts its
  fill one step. Both under Tailwind's `hover:` (already `@media (hover: hover)`-gated in v4),
  so touch never sees them. Focus: `focus-visible:outline-2 outline-accent -outline-offset-2`.
- **Gallery:** one `keydown` listener while mounted — `Escape` → `exit()`, `ArrowLeft` /
  `ArrowRight` → `advance(∓1)`. Ignored while the details sheet is open (the sheet's own
  Escape closes it first).

### 5. Tests, and what stays out

- **Unit (Vitest, jsdom):** `Column` renders the right `md:max-w` per width; `useMediaQuery`
  reads and re-subscribes; `useColumnCount` maps the two queries; `packColumns` with N;
  `BottomSheet` at desktop (dialog classes, no grabber, no drag arming, dialog animation pair);
  tile Enter/Space/right-click and the fine-pointer guard; gallery keys.
- **E2E:** a `desktop` Playwright project at **1440 × 900** running only `e2e/desktop.spec.ts`,
  which signs a fresh user up and asserts: four tile stacks; the feed container is ≤ 1120 px and
  centered; right-click opens the item sheet; that sheet is 520 px wide and centered; Escape
  closes it. The existing `chromium` project ignores the desktop spec.
- **Out of scope:** any sidebar or two-pane layout; keyboard-first navigation (j/k, s to save);
  tablet tuning beyond the three-column band; image `srcset` work (the proxy serves one ≤ 1600
  px rendition and the widest tile is ~280 px — a later pass could add a 600 px rendition);
  the `/dev/tokens` page; and re-shooting the design handoff — the prototypes stay the
  authority for the phone, and this document is the authority for what happens above 768 px.

## Copy and tokens

No new copy. No new colour, radius or shadow tokens: the dialog reuses `--radius-sheet`,
`--shadow-sheet` and the surface/border ladder. Two new named animations in `globals.css`
(`--animate-dialog-in`, `--animate-dialog-out`) beside the sheet pairs.
