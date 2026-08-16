# Phase 5.4 — Design-system migration: detailed execution plan

> Companion to [`BUILD_PLAN.md`](BUILD_PLAN.md) Phase 5 (step 5.4, **re-baselined numbering** —
> the old "5.4 Feed" plan is preserved as
> [`PHASE5_PLAN_5.4_FEED_OLD_DESIGN.md`](PHASE5_PLAN_5.4_FEED_OLD_DESIGN.md); the Feed is now
> 5.6). Same format as [`PHASE5_PLAN_5.3.md`](PHASE5_PLAN_5.3.md). Written 08-16-26 on branch
> `phase-5.4-design-migration`, against the **redesign handoff**
> `docs/design_handoff_ambit_pwa_redesign/README.md`. This plan is self-contained: it names every
> file, every token change, and every test expected to change, and can be executed in a fresh
> session without re-reading the planning conversation.

**Scope: mechanical restyle only.** Migrate the token layer to the new design language and
restyle the already-built screens. **No new components, no layout changes, no flow changes.**
The regression signal is that the auth and onboarding test suites pass **unmodified** — if one
of those tests wants editing, the change went beyond restyling; stop and reconsider.

**Convention (recorded in BUILD_PLAN's Phase 5 preamble):** the redesign README is the token
authority, but **prototypes win over the README where they conflict**. The bundle's
`PROGRESS.md` describes an earlier design session (Newsreader/gold) — ignore it.

## Decisions already made with Ben (08-15-26) — do not relitigate

1. **Auth stays email+password + invite gate.** The new Landing prototype shows magic-link;
   we keep the built flow (same deliberate divergence 5.2 recorded). The landing gets only a
   typography/color pass here; the slideshow treatment is 5.11.
2. **Collections backend is 5.5**, not here.
3. **Sign-out will live in Settings (5.10).** Interim (from 5.6): `/dev/tokens`. In 5.4 the
   `/feed` placeholder and its `SignOutButton` are untouched.
4. **Feed gestures: prototype wins** (affects 5.6, recorded here for continuity).
5. **Accent names are renamed** to describe the new hues: `indigo` (default) / `amber` /
   `green` / `red`. Only `src/app/layout.tsx` and `/dev/tokens` reference the old names.

---

## Steps

Work top-down; run `bun run check` after steps 3, 5, and 8.

### 1. Font swap — `src/lib/fonts.ts`

Replace the Newsreader export with Sora:

```ts
import { Sora } from "next/font/google";

// Sora is a variable font (wght 100-800). `weight` is deliberately OMITTED — next/font/google
// serves the single variable file and per-element CSS `font-weight` covers the design's
// 400/500/600/700/800 usage (same rationale as the Newsreader setup this replaces). Sora has no
// optical-size axis and the design uses no italics, so neither `axes` nor `style` is needed.
// next/font self-hosts at build time, which satisfies the handoff's "self-host in production".
export const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sora",
});
```

Grep for `newsreader` afterwards — the only consumers are `layout.tsx` and `globals.css`.

### 2. Token migration — `src/styles/globals.css`

Line-by-line against the current file:

**File-top comment:** update the pointer from `docs/design_handoff_ambit_pwa/README.md` to
`docs/design_handoff_ambit_pwa_redesign/README.md`.

**`@theme inline`:**
- Replace `--font-serif: var(--font-newsreader);` (and its comment) with
  `--font-sans: var(--font-sora);` — same reasoning: a runtime-injected variable must live in
  `@theme inline`, not plain `@theme`. There is no serif in the new design; **`--font-serif`
  dies entirely.**
- `--color-accent: var(--accent-raw);` unchanged.

**`@theme`:**
- Delete the static `--font-sans: -apple-system, system-ui, sans-serif;` line and its
  "handoff ships no sans webfont" comment (no longer true — Sora is the app font).
- `--color-surface: #1b1813` → `#1b1815` (new sheet fill; update comment).
- Add below `--color-ink`:
  ```css
  --color-ink-hi: #f5f1e7; /* title tier (`text/primary` in the redesign README) — screen and
                               item titles only; --color-ink stays the body/high tier and the
                               alpha-ladder root */
  ```
- `--radius-sheet: 26px` → `22px`.
- Radii keep their values but their use-case comments change (the redesign reassigns them):
  `--radius-img-lg: 20px` → profile collection tiles; `--radius-tile: 18px` → item-page hero
  image; `--radius-img-md: 16px` → (unassigned — keep for now); `--radius-img-sm: 12px` →
  gallery slides (unchanged). Add a comment noting **feed/saved image tiles are now
  square-cornered full-bleed — radius 0 is the absence of a rounding class, not a token.**
- `--shadow-sheet` → `0 -20px 50px rgba(0, 0, 0, 0.45)`.
- Add `--shadow-toolbar: 0 10px 30px rgba(0, 0, 0, 0.28);` (the floating pill toolbar, built
  in 5.5). Update the "exactly three shadows" comment to four.
- Add alongside `--ease-settle`:
  ```css
  --ease-sheet: cubic-bezier(0.22, 0.9, 0.3, 1); /* pill-summoned bottom sheets (redesign
                                                     `sheetup`); the gallery details modal
                                                     keeps --ease-settle */
  ```
- Animations:
  - Rename `--animate-sheet-up: sheet-up 0.4s var(--ease-settle) both;` →
    `--animate-sheet-gallery: sheet-gallery 0.4s var(--ease-settle) both;` and rename its
    `@keyframes sheet-up` → `@keyframes sheet-gallery` (still 103% → 0). Comment: future
    consumer is the gallery details modal (5.8) only.
  - Add `--animate-sheet-up: sheet-up 0.26s var(--ease-sheet) both;` with a new
    `@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`
    (the redesign's `sheetup`: 100%, 240–300ms — 260ms chosen). `BottomSheet` already uses the
    `animate-sheet-up` class, so it picks up the new curve with no component change.
  - Everything else (`rise`, `chip-pop`, `pop-in`, `spinner`, `toast-in`, `scrim-in`,
    `drift`) is unchanged — all still match the redesign's motion table. `drift` and `pop-in`
    are consumed/deleted in 5.11.

**`@layer base` — accent knob (full replacement of the four rules):**
```css
:root,
[data-accent="indigo"] {
  --accent-raw: #4c5fe0; /* default */
}
[data-accent="amber"] {
  --accent-raw: #d9a73c;
}
[data-accent="green"] {
  --accent-raw: #3fa35c;
}
[data-accent="red"] {
  --accent-raw: #d9483f;
}
```
Keep the existing explanatory comment above the block (mechanism unchanged).

**`@layer utilities`:**
- `.border-hairline` unchanged. **Do not touch its tailwind-merge registration in
  `src/lib/utils.ts`.**
- Add:
  ```css
  /* The toolbar/profile avatar placeholder (redesign README "Color" table). A custom bg-*
     class, so it MUST be registered with tailwind-merge in src/lib/utils.ts — see the
     border-hairline precedent there; an unregistered custom bg- class gets silently dropped
     by cn() next to bg-* color utilities. */
  .bg-avatar-gradient {
    background-image: linear-gradient(150deg, #8e92f0, #6c7be8);
  }
  ```
- Add a reduced-motion block (deliberate spec-plus — the app has none today):
  ```css
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```

### 3. twMerge registration + root layout

- `src/lib/utils.ts`: register `bg-avatar-gradient` in the existing `extendTailwindMerge`
  config (alongside the `border-hairline` registration, in whatever class group prevents it
  colliding with `bg-*` colors — mirror how `border-hairline` was slotted into `border-w`;
  for a background-image utility the `bg-image` class group is the right home). Add a test in
  `src/lib/utils.test.ts` mirroring the existing `border-hairline` regression case:
  `cn("bg-avatar-gradient", "bg-ink/5")` must keep both classes.
- `src/app/layout.tsx`: import `sora` instead of `newsreader`; `className={sora.variable}`;
  `data-accent="gold"` → `data-accent="indigo"` (update the adjacent comment). Body classes
  stay `bg-bg text-ink font-sans antialiased` — `font-sans` now resolves to Sora.
  `viewport.themeColor` and `src/app/manifest.ts` are untouched (bg color didn't change).

**Checkpoint:** `bun run check` — expect failures only in `chip.test.tsx` (serif prop, fixed
in step 4) and any class assertions listed in step 8. Nothing else should be red.

### 4. Primitives — `src/components/ui/`, `src/components/icons/`

- **`chip.tsx`:** delete the `serif` prop, its ternary, and the Newsreader references in the
  header comment. Single style: inherited `font-sans` (Sora), keep the current 14px sizing —
  the redesign's 12.5px/500 chip is the *Saved filter chip* (5.9), and the onboarding chip's
  exact values get verified against `Ambit - Onboarding.dc.html` when that screen is next
  touched. Both call sites (`onboarding-screen.tsx`, `/dev/tokens`) drop the prop.
- **`bottom-sheet.tsx`:** token changes (22px radius, new shadow, new curve) flow through
  automatically. Two-line restyle: grabber `h-[5px] w-10 … bg-ink/24` → `h-1 w-9 … bg-ink/18`
  (redesign: 36×4, `rgba(239,235,224,0.18)`). **No structural change** — the title slot and
  exit animation are 5.5; the null-when-closed test must still pass here.
- **`toast.tsx`:** verify against the redesign spec — fill `overlay/92` + blur(12px) +
  hairline + 13px + `px-[18px] py-[11px]` + pill + 1800ms already match; change nothing
  unless a value is off.
- **`icons/index.tsx`:** `Logo` → stroke width 1.5 → **1.7**, and add the satellite dot
  `<circle cx={21} cy={7} r={1.9} fill="currentColor" />` (redesign mark spec: 26-viewBox
  circle r=11.5 stroke 1.7, inner dot r=3.6 filled, satellite r=1.9 at (21,7)). Audit the
  other icons' stroke widths toward the 1.7px spec (current set is 1.5–2; normalize any that
  visibly differ, keep authored viewBoxes — 5.1 Decision 5 stands).
- **`button/input/card/icon-button/segmented/glass-header/spinner`:** no changes; token
  updates flow through.

### 5. Screen restyles (typography/color pass only)

Grep `font-serif` across `src/` — every hit dies in this step. Known sites:

- **Landing** (`src/app/page.tsx`, `src/components/landing/landing-shell.tsx`,
  `auth-card.tsx`, `reset-password-card.tsx`): hero h1 and headings lose `font-serif` and
  the italic wordmark styling; retype per the new scale — screen-title-class text becomes
  Sora 600 with `text-ink-hi`; body/lede copy stays `text-ink/…` tiers at their current
  sizes unless clearly off-scale. Keep the orbs, the layout, and **every string, placeholder,
  label, and test id exactly as-is** (protects `auth-card.test.tsx` and `e2e/auth.spec.ts`).
  The wordmark "Ambit" drops italic (Sora has none) — Sora 600 is the new treatment.
- **Onboarding** (`src/components/onboarding/onboarding-screen.tsx`): drop the chip `serif`
  prop usage; heading `font-serif text-[34px]` → Sora 600 + `text-ink-hi`; eyebrow/CTA
  unchanged. All copy and test ids unchanged.
- **`/~offline`** (`src/app/~offline/page.tsx`): replace the leftover T3 purple gradient +
  `text-white` with the token system (`bg-bg`, `text-ink`/tiers) — a five-minute job kept out
  of scope until now.

### 6. `/dev/tokens` rewrite — `src/app/dev/tokens/page.tsx`

Near-total rewrite as the living style guide for the new system (keep the `notFound()`
production guard and the overall Section structure):

- Accent switcher: `ACCENTS` array becomes
  `[{ name: "indigo", hex: "#4C5FE0" }, { name: "amber", hex: "#D9A73C" }, { name: "green", hex: "#3FA35C" }, { name: "red", hex: "#D9483F" }]`
  (hexes deliberately duplicated here, as before — note stays).
- Swatch grid: add `ink-hi` and the new `surface` value; add `shadow-toolbar` to the shadow
  specimens; add an avatar-gradient specimen (`bg-avatar-gradient` on a 25px circle).
- Motion section: show both sheet easings side-by-side (`--ease-sheet` 260ms vs
  `--ease-settle` 400ms demo).
- Type specimens: replace the Newsreader/system-sans prose with the Sora scale (top rows of
  the redesign README's type table: screen title 26–28/600, item title 28/400, body 16/1.72,
  eyebrow 9.5–11/600/uppercase, metadata 12.5).
- Icons at their (now 1.7) stroke.
- Header comment: note this page is also the **5.5 backbone demo host** and the **interim
  sign-out home during 5.6–5.9**.

### 7. Docs sweep

- `SPEC.md` §10 (design tokens): update the accent set, the Sora decision, `ink-hi`, and the
  sheet radius/ease where they're recorded; keep the alpha ladder (unchanged — the redesign
  uses the same ink + opacity tiers).
- `docs/PHASE5_PLAN.md` (the 5.1 plan): add a one-line banner under the title — "Decisions 2
  (accent set), 3 (fonts), and the reference-files table are superseded by the redesign; see
  `PHASE5_PLAN_5.4.md`." Do not rewrite the body.

### 8. Test updates (the complete expected-changes list)

May change:
- `src/components/ui/chip.test.tsx` — remove the serif-prop cases; class assertions updated.
- `src/components/ui/button.test.tsx` / `input.test.tsx` — update class-string assertions
  only if a changed token/class breaks them (radius classes unchanged, so likely no-op;
  verify).
- `src/lib/utils.test.ts` — **add** the `bg-avatar-gradient` twMerge case.

Must pass **unmodified** (the regression signal):
- `auth-card.test.tsx` (9), `reset-password-card.test.tsx` (3), `onboarding-screen.test.tsx`
  (8), `toast.test.tsx` (5), `bottom-sheet.test.tsx` (4, incl. null-when-closed),
  `segmented.test.tsx` (3), `rise.test.tsx` (2), all server tests, `e2e/auth.spec.ts` (6),
  `e2e/home.spec.ts` (1).

## Verification

1. `bun run check` — all green (~218 tests: 217 + the new twMerge case, minus any deleted
   serif cases).
2. `bun run build` with CI's placeholder env — clean; `/`, `/feed`, `/onboarding`,
   `/reset-password` all still **dynamic** in the route table (check the output lines).
3. `bun run e2e` — all 7, **unmodified** (requires Mailpit + `bun run invite`, local only).
4. Live visual pass (`bun run dev`, Chrome DevTools MCP or a real device at 402×874):
   - `/dev/tokens`: accent switcher recolors every primitive live across indigo/amber/green/
     red with no rebuild; Sora renders at 400/500/600/700/800; hairlines still 0.5px; the
     sheet demo animates on the new 260ms curve; avatar gradient specimen renders.
   - `/`, `/onboarding`, `/reset-password`, `/~offline`: no serif anywhere, titles in
     `ink-hi`, everything else visually unchanged in structure.
5. `git grep -l "newsreader\|font-serif\|Newsreader"` → no hits under `src/`.

## Risks / sharp edges

- **twMerge dropping `bg-avatar-gradient`** — the exact 5.2 `border-hairline` regression
  class; the registration + test in step 3 is the guard.
- **Sora loading**: `next/font/google` needs the variable font available at build time; if
  the build environment blocks Google Fonts, `next/font` fails the build loudly (not
  silently) — acceptable; CI has network.
- **`/dev/tokens` accent names**: the old names (`gold` etc.) die; anything else referencing
  them would silently fall back to `:root` (indigo). Step 3's grep for `data-accent` should
  show only `layout.tsx` + `/dev/tokens`.
- **Do not touch** `viewport.themeColor` / `manifest.ts` (bg unchanged) or the
  `border-hairline` registration.

## What comes next (not this phase)

5.5 backbone + collections backend → 5.6 feed masonry → 5.7 item pages → 5.8 gallery →
5.9 saved → 5.10 profile/settings → 5.11 landing slideshow + install. Full sketches and
sequencing rationale live in BUILD_PLAN.md Phase 5; each gets its own plan doc, re-verified
against its prototype `.dc.html` at plan time.
