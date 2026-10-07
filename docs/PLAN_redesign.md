# Plan: the sitewide redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Read `docs/DESIGN_redesign.md` in full before Task 1.1** — it holds every decision, the token mapping and the per-screen specs; this file is the order of work. Then read `docs/ambit_Redesign_4/README.md`.

**Goal:** Apply Ben's Claude Design package (`docs/ambit_Redesign_4/`, "1b": black and white, one Kelly-green accent, Hanken Grotesk + Geist Mono, square everything) to the whole app, as decided 10-06-26.

**Architecture:** One branch, `feat/redesign`, off `main` (which already holds Cut 1 and Cut 4's non-visual half). Seven phases. Phase 1 (tokens, fonts) and Phase 2 (primitives + a mechanical sweep) change every screen at once, roughly; Phases 3–6 finish each area against its prototype; Phase 7 audits. **Ben looks on the dev server after every phase.** Nothing merges or deploys until Phase 7 is done (decision 16).

**Tech stack:** Next.js 16.2 / React 19, Tailwind v4 (`@theme` in `src/styles/globals.css`), `next/font/google`, Vitest + Testing Library, Playwright (`bun run e2e:prod`, and the CI-shape run in CLAUDE.md's Local dev section).

**Spec:** `docs/DESIGN_redesign.md` (decisions and mapping — wins over any prototype), `docs/ambit_Redesign_4/` (the look: README state tables, `tokens.css`, the eight final prototypes — inline styles are the numbers), `docs/COPY_onboarding.md` (every reader-visible string; its New column is what is built).

## Global constraints

- **The feed's layout and mechanics do not change** — grid, gutters, column counts, loading, scroll restore, long-press, the lift's scale and timing. If a task seems to need a change there, stop and ask.
- **Toolbars are production.** `ui/pill-toolbar.tsx`, `ui/rail-toolbar.tsx`, `TOOLBAR_GLASS`, the profile glyph and the share disc are not restyled. Only the item screen's rules for _when_ they show change (Phase 4).
- **A prototype not drawing something is not a decision to remove it** (decision 13). DESIGN §7 is the keep list; DESIGN §8 is what the package shows that is _not_ built.
- **Recreate, never paste.** No prototype markup, no `support.js` / `ios-frame.jsx` / `image-slot.js`.
- **Copy comes from the deck.** For any string a task touches, use `docs/COPY_onboarding.md`'s New cell when it has one (`none` / `retired` mean the slot goes); otherwise keep the current string.
- **Every `<img>` of an item is `imageSrc()`** — the CSP blocks anything else. No font, style or script from outside `'self'`.
- **Tailwind v4 traps (CLAUDE.md):** `scale-*` / `translate-*` write the standalone properties, so transitions and tests name `scale`, not `transform`; a `@keyframes` inside `@theme` is emitted only if an `--animate-*` token uses it.
- **Reduced motion:** Ben's machines run Reduce Motion on. `globals.css` collapses every animation except `.motion-gentle` and `.motion-lift`. A hover zoom that must still ease (the series-picture zoom) needs `.motion-lift` on the element.
- **The e2e helper steers by `data-topics`**, never by label (`e2e/support.ts` `answerQuestionnaire`; `lib/interview/path.ts` is its pure mirror — change one, change the other).
- **`bun run check` green after every task.** `bun run e2e:prod` + the CI-shape run at the end of Phases 3, 4, 5, 6 and 7. Use `e2e:prod`, never `bun run e2e` (the dev overlay eats phone-width clicks).
- **Comment generously** — the repo teaches Ben the stack. Don't run `prettier --write` over `src/server`. After `bun add` / `bun remove`: `rm -rf node_modules/.vite node_modules/.cache/vite`.
- **One commit per task**, conventional messages, on `feat/redesign`. Do not merge, push `main` or deploy.

## Review focus

Inputs no single task's tests exercise, most likely to bite:

1. **A stored v1 taste** (`user_taste.taste` with `v: 1`, no `hang`) read by `/profile/topics` after Phase 6. It must render without the hang, never throw. _Pinned in Task 6.2._
2. **A stale tab** from before the deploy submitting bank v2 answers (an `amount` answer, a `read-watch` text) to the v3 server. `onboarding.complete` must accept and log them, not 400. _Pinned in Task 6.1._
3. **Segmented as a radiogroup inside a sheet** — arrow keys must move the selection without the sheet's own key handling (Escape, drag) swallowing them, and `Tab` must leave the group in one press. _Pinned in Task 2.3._
4. **The global `:focus-visible` rule against the tile's inset ring** — a feed tile must show one ring, inset, not two. _Pinned in Task 1.4._
5. **Auto-advance and Back** — pressing Back inside the 380 ms window after a pick must not then advance twice or land on the wrong question. _Pinned in Task 6.4._
6. **The chrome on a phone after a zoom** — a pinch must not be read as the tap that toggles the chrome (it is not today; the new rules must keep that). _Pinned in Task 4.1._
7. **White-on-green never happens** — anything that was `bg-accent text-on-accent` and is still green after the sweep must have dark text. _Audit in Task 2.9._

---

## Phase 1 — Foundations

After this phase the whole app is the new colours and fonts with old shapes mostly intact. Ben's look: `/dev/tokens`, then a scroll through `/feed`.

### Task 1.1 — Fonts

**Files:** `src/lib/fonts.ts`, `src/app/layout.tsx`, `src/styles/globals.css` (`@theme inline`), test mocks of `~/lib/fonts` (`landing/overture.test.tsx`, `landing/landing-screen.test.tsx`, `explore/explore-screen.test.tsx`).

- [ ] **Step 1:** Check the exports exist: `grep -n "Hanken_Grotesk\|Geist_Mono" node_modules/next/dist/compiled/@next/font/dist/google/index.d.ts`. If `Geist_Mono` is missing, `bun add geist` and import `GeistMono` from `geist/font/mono` instead (then clear the Vite cache).
- [ ] **Step 2:** In `fonts.ts` replace `sora` with `hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], display: "swap", variable: "--font-hanken" })` and add `geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--font-geist-mono" })`. Keep `inter`. Rewrite the file's header comment (why two faces; why Inter survives).
- [ ] **Step 3:** `layout.tsx`: `<html className={`${hanken.variable} ${geistMono.variable}`}>`. `globals.css` `@theme inline`: `--font-sans: var(--font-hanken); --font-mono: var(--font-geist-mono);`.
- [ ] **Step 4:** Update the three test mocks to export the new names. `grep -rn "sora\|Sora" src` → only comments left; fix those comments.
- [ ] **Step 5:** `bun run check`; `bun run build` (fonts download at build — confirm it succeeds offline-free). **Commit** `feat(design): Hanken Grotesk and Geist Mono replace Sora`.

### Task 1.2 — Colour, shape, shadow and scale tokens

**Files:** `src/styles/globals.css`, `src/styles/globals.test.ts`, `src/app/layout.tsx` (`themeColor`), `src/app/manifest.ts`, `src/components/icons/marks.tsx`, `src/lib/utils.ts` (tailwind-merge registration if a utility is renamed).

- [ ] **Step 1: Test first.** In `globals.test.ts` change the compiled-output assertions: the lift shadow string becomes `"0 14px 34px"`; add assertions that the output contains `--color-dialog`, `--color-card`, `--shadow-dialog`, `--shadow-popover`, `--font-mono`. Run → FAIL.
- [ ] **Step 2:** Apply DESIGN §3.1's surface table to `@theme` (values exactly as listed; add `--color-dialog`, `--color-card`, `--color-card-2`; keep `--color-ink-hi` as a name). Do **not** touch `--color-accent` yet (Task 1.3).
- [ ] **Step 3:** Radius: every `--radius-*` to `0` except `--radius-pill: 999px`. `.border-hairline { border-width: 1px }` with a comment saying why the name outlived the half-pixel. Shadows per DESIGN §3.4 (leave the old `--shadow-sheet` / `-toast` / `-banner` until their users are rewritten in Phase 2, then delete). `--animate-sheet-up` duration 0.24s. Add the `--text-*` scale of DESIGN §3.3 (Tailwind v4: `--text-display: clamp(30px, 4.2vw, 40px); --text-display--line-height: 1.1; --text-display--letter-spacing: -0.02em;` and so on).
- [ ] **Step 4:** `#161411` → `#0E0E0E` in `layout.tsx`, `manifest.ts`, `icons/marks.tsx`.
- [ ] **Step 5:** `bun run check` → PASS. **Commit** `feat(design): the 1b tokens — surfaces, ink, zero radius, 1 px lines`.

### Task 1.3 — One accent; the knob is retired

**Files — delete:** `src/lib/accent.ts`, `src/components/accent-sync.tsx`, `src/components/settings/accent-sheet.tsx`. **Modify:** `globals.css` (the `[data-accent]` block, `--accent-raw`, `--color-accent`, `--color-on-accent`, `--color-focus-ring`), `src/app/layout.tsx` (the `data-accent` attribute, `suppressHydrationWarning` if only the accent needed it, the inline pre-paint script, `<AccentSync />`), `src/components/settings/settings-screen.tsx` (the Appearance row, the `"accent"` sheet, `useAccent`), `settings-screen.test.tsx` (the accent test and the `removeAttribute("data-accent")` line), `src/no-dangerous-html.test.ts`, `src/config/security-headers.js` (the comment naming the script), `src/app/dev/tokens/page.tsx` (the accent picker section — the whole page is rebuilt in Task 1.5; here just make it compile), `e2e/settings.spec.ts:309-315`.

- [ ] **Step 1: Tests first.** `no-dangerous-html.test.ts`: the expected list of files using `dangerouslySetInnerHTML` becomes `[]`, and the block asserting on `layout.tsx`'s `__html` goes. `settings-screen.test.tsx`: delete "applies a picked accent…"; add `expect(screen.queryByText("Appearance")).toBeNull()`. Run → FAIL.
- [ ] **Step 2:** `globals.css`: move the accent out of `@theme inline` — `--color-accent: #2bb24c; --color-on-accent: #0e0e0e; --color-focus-ring: var(--color-accent);` in `@theme`; delete the `[data-accent]` block and its long comment (replace with three lines: one colour, why, where the alternatives are — `reference/Ambit - Accent Options.dc.html`, option 2e).
- [ ] **Step 3:** Delete the three files; remove their imports and uses. `layout.tsx` loses the script entirely — check whether anything else needed the nonce there. `settings-screen.tsx`: the "Other" group loses Appearance.
- [ ] **Step 4:** `e2e/settings.spec.ts`: remove the Appearance → Amber block (lines ~309–315) and assert the row is absent instead.
- [ ] **Step 5:** `grep -rn "data-accent\|accent-raw\|ambit.accent\|useAccent\|AccentSync" src e2e` → nothing. `bun run check`. **Commit** `feat(design): one accent, Kelly green — the knob is retired`.

### Task 1.4 — Focus, everywhere

**Files:** `globals.css` (`@layer base`), `src/components/feed/image-tile.tsx`, `feed/article-card.tsx`, `onboarding/face-card.tsx`, their tests.

- [ ] **Step 1: Test first** (Review focus 4). In `image-tile.test.tsx` keep the assertions for the inset ring classes and add that the element carries `outline-none` only via `focus-visible:` utilities — i.e. it does not also inherit a second outline: assert the class list contains `focus-visible:-outline-offset-2` and `focus-visible:outline-focus-ring`. In `globals.test.ts` assert the compiled CSS contains `:focus-visible` with `outline-offset: 3px`.
- [ ] **Step 2:** `@layer base { :focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; } :focus:not(:focus-visible) { outline: none; } }`. Utilities are a later layer, so a tile's `focus-visible:-outline-offset-2` overrides the offset — that is what makes one ring, inset. Comment it.
- [ ] **Step 3:** `face-card.tsx`: drop its own `outline-ink-hi outline-[3px]` (the base rule covers it). Remove now-redundant `outline-none` from elements that should show the ring (`question-step.tsx:115` — check what it was hiding).
- [ ] **Step 4:** Tab through `/feed`, a sheet, `/profile/settings` on the dev server: every stop shows a green ring. `bun run check`. **Commit** `feat(design): a visible keyboard ring on every control`.

### Task 1.5 — `/dev/tokens` as the new style guide; the radius guard

**Files:** `src/app/dev/tokens/page.tsx` (rewrite), new `src/no-rounded.test.ts`.

- [ ] **Step 1:** Rebuild `/dev/tokens` to show: surfaces and the ink ladder as swatches (each labelled with its package name and its `ink/NN` spelling from DESIGN §3.1), the accent and its seven jobs as live examples, the type scale in both faces, lines, shadows, and a section per primitive showing every state (rest / hover / focus / pressed / disabled / selected). Primitives are still old here — the page will fill in through Phase 2; leave clearly-labelled placeholders that Task 2.x replaces.
- [ ] **Step 2:** `no-rounded.test.ts`, modelled on `no-dangerous-html.test.ts`: walk `src/**/*.tsx`, find `rounded-` utilities, and fail on any file not in `ALLOWED` — an explicit list with a reason each: `ui/pill-toolbar.tsx`, `ui/rail-toolbar.tsx` (the nav), `ui/avatar-chip.tsx`, `ui/loader.tsx` (its dot), `item/spread-toggle.tsx` (lives in the rail), and a `DOTS` allowance for `rounded-full` on an element whose classes also include `size-[6px]`/`size-[7px]`/`size-[9px]`. **Add it as `it.todo` now** with the current offender count in a comment; Task 2.9 turns it on.
- [ ] **Step 3:** `bun run check`. **Commit** `feat(design): /dev/tokens is the 1b style guide; the radius guard, pending`.

**Phase 1 gate:** `bun run check`; Ben looks at `/dev/tokens` and `/feed` (dev server, 1440 and the tailnet phone).

---

## Phase 2 — Primitives, then the sweep

Each task: rewrite the primitive to DESIGN §4, rewrite its test to pin the new states, fix every call site, fill its `/dev/tokens` section. Tests first, as in Phase 1.

### Task 2.1 — Button

**Files:** `ui/button.tsx`, `ui/button.test.tsx`, the 15 files that render `<Button>` (list: `grep -rln "<Button" src --include="*.tsx"`).

- [ ] API: `variant: "primary" | "outline" | "link"` (default `primary`), `size: "lg" | "md" | "sm"` (default `md`). `shape` removed. States per DESIGN §4.1; hover underline is `hover:shadow-[inset_0_-2px_0_var(--color-accent)]`; 150 ms transitions on background, box-shadow, border-color, color.
- [ ] Test pins: primary rest/disabled classes; outline border; `link` renders no box; a caller's `className` survives `cn`; a disabled button does not fire.
- [ ] Call sites: `variant="accent"` (or none) → `primary`; `ghost` → `outline`; delete every `shape=`. The auth card's and install confirmation's `size="lg"` buttons become the 56 px block. Inline "Try again" buttons are `outline`.
- [ ] **Commit** `feat(ui): Button — white primary, outline, link; square`.

### Task 2.2 — Chip

**Files:** `ui/chip.tsx`, `ui/chip.test.tsx`, `onboarding/question-step.tsx`, `saved/collection-chips.tsx`, `globals.css` (delete `chip-pop`).

- [ ] DESIGN §4.2. Remove `mixed` and `animate-chip-pop` (and the keyframe + token). The zoom needs `.motion-lift` to ease under Reduce Motion.
- [ ] **Commit** `feat(ui): Chip — square, white when on`.

### Task 2.3 — Segmented becomes a radiogroup

**Files:** `ui/segmented.tsx`, `ui/segmented.test.tsx`, `settings/reading-sheet.tsx` + test, `topics/topic-levels.tsx` + test, e2e: `settings.spec.ts` (~266, 277, 300), `onboarding.spec.ts:103`, any other `pressed:` lookups of a segment (`grep -rn "pressed: true" e2e`).

- [ ] **Test first** (Review focus 3): `getByRole("radiogroup", { name })`; radios with `aria-checked`; ArrowRight/ArrowLeft move the checked radio and call `onChange`; only the checked radio is in the tab order (roving `tabIndex`); a click on the checked radio fires nothing (today's guard, kept); inside a `BottomSheet` an arrow key still moves it.
- [ ] Implement DESIGN §4.3, including the selected-"off" tone (`option.tone?: "muted"` on the option, set by `topic-levels`). `Segmented` takes `label` (the group's accessible name).
- [ ] Move every e2e and unit lookup from `button … pressed` to `radio … checked`.
- [ ] **Commit** `feat(ui): Segmented — joined cells, a real radiogroup`.

### Task 2.4 — Input, Textarea, Field

**Files:** `ui/input.tsx`, `ui/textarea.tsx`, new `ui/field.tsx` + test, `ui/input.test.tsx`; call sites: `landing/auth-card.tsx`, `landing/reset-password-card.tsx`, `profile/profile-edit-screen.tsx`, `profile/topics-screen.tsx`, `sheets/collection-rows.tsx`, `onboarding/question-step.tsx`.

- [ ] DESIGN §4.4. `Field({ label, hint?, error?, children })` renders the label row (label left; hint or error right, green mono) and wires `htmlFor` / `aria-describedby`. Inputs gain `size?: "md" | "lg"` (18 / 22 px).
- [ ] Call sites get **visible labels** through `Field` (the auth card's `sr-only` labels go). Do the minimum here — the screens are laid out properly in Phase 5.
- [ ] **Commit** `feat(ui): underline inputs and Field`.

### Task 2.5 — BottomSheet, dialog, popover

**Files:** `ui/bottom-sheet.tsx`, `ui/bottom-sheet.test.tsx`, `e2e/desktop.spec.ts` (panel widths 360 → 340; the scrim assertion).

- [ ] DESIGN §4.5. `title` renders as the mono header row; add `closeLabel?: string` for the sheets with no grabber. `POPOVER_W = 340`. Keep every behaviour (drag, anchor, flip, focus trap, `onSwipeSide`).
- [ ] Update the tests that pin `md:rounded-sheet`, `rounded-t-[26px]`, `bg-scrim/66`, `backdrop-blur-[3px]`, `md:w-[360px]`.
- [ ] **Commit** `feat(ui): square sheets, a mono header row, the 340 px popover`.

### Task 2.6 — Toast, Loader, IconButton

- [ ] `ui/toast.tsx` (DESIGN §4.6), `ui/loader.tsx` (ring `text-ink`, dot accent, mono label; update `loader.test.tsx`'s `text-accent` assertion and keep the `motion-gentle` ones), `ui/icon-button.tsx` (square).
- [ ] **Commit** `feat(ui): the white toast, the Reach loader in ink, square icon buttons`.

### Task 2.7 — Eyebrow and TextLink

- [ ] New `ui/eyebrow.tsx` (`<Eyebrow dot? as?>`; mono 10.5 px uppercase 0.4 px `text-ink/55`) and `ui/text-link.tsx` (`external`, `bracket`; works as `<a>` or Next `<Link>`), each with a test.
- [ ] **Commit** `feat(ui): Eyebrow and TextLink`.

### Task 2.8 — Delete Card and GlassHeader

- [ ] `ui/card.tsx` → its two users (`item/join-cta.tsx`, `/dev/tokens`) get plain markup for now (join-cta is laid out in Phase 4). `ui/glass-header.tsx` stays until Task 5.6 removes Saved's header — skip it here if Saved still imports it.
- [ ] **Commit** `refactor(ui): Card goes`.

### Task 2.9 — The mechanical sweep

**Files:** all of `src/components` and `src/app` (not `src/server`).

- [ ] **Weights:** remove every `font-semibold`, `font-bold`, and `font-medium` (`grep -rn "font-semibold\|font-medium\|font-bold" src --include="*.tsx"` → 0, except inside the toolbars if any). Titles are 400.
- [ ] **Eyebrows:** replace every uppercase-tracked label string (the six exact accent ones, the `KICKER` / `EYEBROW` constants, and the `tracking-[1.2px]` / `[1.3px]` / `[0.6px]` variants the inventory lists) with `<Eyebrow>`.
- [ ] **Radius:** clear every `rounded-*` outside the allow-list — `rounded-[NNpx]` on cards, rows, sheets, the install banner, `spread-toggle`'s pressed tile stays (it is in the rail). Turn `no-rounded.test.ts` from `todo` to a live test.
- [ ] **Accent audit** (Review focus 7): walk `grep -rn "text-accent\|bg-accent\|border-accent\|ring-accent\|accent/" src --include="*.tsx"`. Each use is either one of the seven jobs in DESIGN §3.2 (keep; make sure text on it is dark) or becomes ink: links → `TextLink`; icons → `text-ink` / `text-ink/78`; filled selections → `bg-ink`. Record the surviving list in the commit message.
- [ ] **Errors:** `text-error` → the green mono hint (`Field`'s `error`) or, in Settings, the attention dot (left for Task 5.5 — here just stop the token being needed). Delete `--color-error`.
- [ ] **Old shadow tokens** with no users left: delete.
- [ ] `bun run check`; fix the class-pinning tests DESIGN §9 lists as they fail. **Commit** `refactor(design): the sweep — weights, eyebrows, radii, the accent's seven jobs`.

**Phase 2 gate:** `bun run check`; `bun run e2e:prod` (expect the item-chrome and onboarding specs to still pass — nothing structural has changed yet). Ben looks: `/dev/tokens`, sign-in, a sheet, Settings.

---

## Phases 3–6 — the screens

From here each task is: **read the DESIGN section and the named prototype, restyle the listed files to match, keep everything DESIGN §7 lists, update the tests DESIGN §9 names.** Numbers not restated here are in the prototype's inline styles. Each task ends with `bun run check` and a commit; each phase ends with `e2e:prod`, the CI-shape run, and Ben's look at 402 px and 1440 px.

### Phase 3 — Feed, sheets, explore (DESIGN §6.1, §4.7)

Prototypes: `Ambit - Feed Masonry 4.dc.html`, `Ambit - Feed Desktop 2.dc.html`.

- [ ] **3.1 Cards.** `feed/article-card.tsx`, `feed/because-tile.tsx`, `explore/message-tile.tsx`, `feed/writing-tile.tsx` (badge as an `Eyebrow` on the scrim). Keep: the writing label eyebrow, the lede clamp, Because inert, the press scale.
- [ ] **3.2 Tile chrome.** `feed/tile-actions.tsx` (square low-opacity glass, 250 ms; the tile stays lifted while its picker is open — add the open state to the wrapper's lift), `feed/tile-lift.ts` (no change beyond the token), `feed/debug-badge.tsx` (mono; hides on lift) and their tests; `e2e/desktop.spec.ts:182-190,260-267` (the shadow string).
- [ ] **3.3 Collection rows and the save picker.** `sheets/collection-rows.tsx` (38 px 2 × 2 thumb, mono count, the 7 px dot, dashed `NewCollectionRow`), `sheets/save-to-collection-sheet.tsx` (header count), `profile/cover-mosaic.tsx` (gap and cell colours), tests (`ring-accent` → the dot).
- [ ] **3.4 Long-press, collections and share sheets.** `sheets/item-sheet.tsx`, `sheets/collections-sheet.tsx`, `sheets/share-sheet.tsx`.
- [ ] **3.5 States and install.** `feed/feed-screen.tsx` (loader row, end / empty / error), `explore/explore-screen.tsx` (about dialog, error), `install/install-banner.tsx`, `install-sheet.tsx`, `install-confirmation.tsx`, `settings/about-sheet.tsx`.
- [ ] **Gate.**

### Phase 4 — Item screens (DESIGN §6.2–6.4)

Prototypes: `Ambit - Item Image.dc.html`, `Ambit - Image View Desktop.dc.html`, `Ambit - Item Text.dc.html`.

- [ ] **4.1 The chrome rules** (decision 7; Review focus 6). **Test first:** a new `hooks/use-chrome.test.ts` with fake timers — phone: hidden at start; `toggle()` flips; `onScroll(25)` shows and a later `toggle()` still hides (a tap always toggles) but a scroll back above 24 does not hide; desktop: `wake()` shows, 2600 ms later hidden, a `wake()` at 2000 ms restarts the timer. Implement `hooks/use-chrome.ts` (pure reducer + a thin hook; which rule set comes from `useMediaQuery` at `md`), delete `use-chrome-cycle.ts` and its test, wire `item-screen.tsx` (the mouse-only `pointermove` wake becomes mousemove / keydown / wheel / scroll on desktop; the phone's tap path through `useRailGestures` stays the only toggle, so a pinch or pan never toggles). Fades: `PillToolbar` 350 ms + 12 px rise, `RailToolbar` and the desktop caption 450 ms. Update `e2e/item.spec.ts`'s `summonChrome` and `desktop.spec.ts`'s summon (`toPass` retry stays).
- [ ] **4.2 Phone picture, below the fold.** `item/item-facts.tsx` (title, credit, summary, fact rows, "By"), `item/credit-line.tsx` (`TextLink external`), `item/link-out-row.tsx` (the white block, on every item with a source URL), `item/wander-next.tsx` (hairline rows, dot, `→`), `item/join-cta.tsx` (no card), delete `item/shared-by-row.tsx` and its uses (`item-screen.tsx`, `i/[itemId]/page.tsx`). No caption over the hero below `md` (`hero-rail.tsx`'s caption block becomes `md:` only).
- [ ] **4.3 Desktop picture.** The caption (index, title, mono maker), "↓ Information", the full-width three-column information (`item-facts.tsx` gets a `layout: "column" | "wide"`, or a sibling `item-facts-wide.tsx` — keep one source of the rows), numbered wander rows. One `<h1>` still (the italic title).
- [ ] **4.4 Magazine view.** `Folio`s in the caption's type; below the fold, Fig. 01 / Fig. 02 columns for the two pages. Mechanics untouched — run `desktop.spec.ts`'s spread tests.
- [ ] **4.5 Article.** `item/reader-item-body.tsx` (no eyebrow, 32 px title, lede, the meta strip — "Kept in" from the item's saves query, "Reading" from the stored reading minutes), `item/reader-blocks.tsx` (p / h2 / h3), the bracket link-out, `i/[itemId]/page.tsx`.
- [ ] **Gate.**

### Phase 5 — Profile, Saved, sign-up (DESIGN §6.5–6.7)

Prototypes: `Ambit - Profile Desktop.dc.html`, `Ambit - Sign Up.dc.html`; structure for the phone from `partial/Ambit - Profile.dc.html`, `partial/Ambit - Settings.dc.html`.

- [ ] **5.1 Hub.** `profile/profile-hub.tsx` (identity, mono tabs), `ui/avatar-chip.tsx` (flat disc), the kept count: add `savedCount` to whatever `ProfileHub` already queries (`saves.collections` returns per-collection counts — if "Everything kept" is not among them, add a count to the user/profile procedure, with a router test).
- [ ] **5.2 Collections.** `profile/collections-tab.tsx`, `collection-tile.tsx`, `cover-mosaic.tsx`.
- [ ] **5.3 Topics.** `profile/topics-screen.tsx`, `topics/topic-levels.tsx`: facet headings (decision 3) — `TopicLevels` takes rows already carrying `facet` (`topics.list` returns it) and groups under the five headings of DESIGN §5.3 item 6; rename `suggested` → `proposed` and move the tag above the name; hairline rows. **Test first:** rows appear under the right heading; a heading with no row is not rendered; label order holds inside a group.
- [ ] **5.4 Edit.** `profile/profile-edit-screen.tsx`.
- [ ] **5.5 Settings.** `settings/settings-screen.tsx`, `settings-row.tsx` (no card, no icons, mono value, `→`, the attention dot — a `attention?: boolean` prop replacing `warnValue`), `reading-sheet.tsx`. Keep "Sign out"'s accessible name (e2e).
- [ ] **5.6 Saved.** `saved/saved-screen.tsx` (title block; delete `ui/glass-header.tsx` and the `column.test.tsx` assertion on it), `collection-chips.tsx`, `saved-tile.tsx`.
- [ ] **5.7 Sign-up.** `landing/auth-sheet.tsx`, `auth-card.tsx`, `reset-password-card.tsx`, `explore/auth-surface.tsx`, `app/reset-password/page.tsx`; `landing-screen.test.tsx`'s radius pins.
- [ ] **Gate.**

### Phase 6 — Onboarding, bank v3 (DESIGN §5)

Prototype: `Ambit - First Exhibition.dc.html` (read the script too — it is the behaviour).

- [ ] **6.1 The bank.** `lib/interview/bank.ts` (drop `amount` and `read-watch`; `look-at`'s prompt from the deck; `BANK_VERSION = 3`), `steps.ts`, `path.ts`, `picks.ts` (`readingAmountFrom` goes; add `isStarter(pick, scores)`), `bank.test.ts`, `path.test.ts`. Server: `api/routers/onboarding.ts` — `writingAmount` is already an input; **test first** (Review focus 2) that a v2-shaped submission (answers naming `amount` and `read-watch`, `bankVersion: 2`) is accepted and logged.
- [ ] **6.2 Faces, hang, taste v2.** `lib/interview/faces.ts` (`title`), `services/question-faces.ts`, `hang.ts` (six; keeps, then picks, then doors) + test, `taste.ts` (`TasteV2 = TasteV1 & { v: 2; hang: string[] }`; `tasteSchema` a union; the server checks the ids exist, as it does `opened`) + tests incl. a v1 row parsing (Review focus 1), `topics.taste`.
- [ ] **6.3 Keyboard.** New `lib/interview/keys.ts` + test — `keyAction(kind, key, cursor, count) → { type: "cursor" | "pick" | "none" | "both" | "keep" | "pass" | "ignore", index? }`.
- [ ] **6.4 The shell.** `onboarding/onboarding-screen.tsx`: container (`@container`), Back link, auto-advance (**test first**, fake timers, Review focus 5: pick → 380 ms → next; Back within the window cancels the pending advance), the keydown listener over `keyAction`, no StepBar (`step-bar.tsx` deleted), no "interpreting" phase, `layout.ts`'s `columnFor` goes (one width now).
- [ ] **6.5 The question screens.** `onboarding/question-step.tsx`, `face-card.tsx`, and new files as the layouts need (`keep-stack.tsx`, `story-card.tsx`, `place-card.tsx`): intro, rooms, pairs (+ Neither link), keep or pass (both layouts), reading, travel, rather-not, bonus (debounced `interpret`, the real-topics list, the disclosure). Every option still renders a `[data-topics]` element; the keep stack's Keep button carries the current card's.
- [ ] **6.6 The reveal.** `onboarding/reveal-step.tsx`, `exhibition-card.tsx` split into the pieces `/profile/topics` reuses (`exhibition-head.tsx`: eyebrow, title, subtitle, hang; `temperament.tsx`; `compass.tsx`; `opened.tsx`), the grouped mix (Task 5.3's `TopicLevels`), the Reading row, Kept out + Allow (`onAllow={(key) => setAnswers(allow(answers, key))}` — `kept-out.ts` and `reveal-draft.ts` exist), the explore line (`exploreShare(DEFAULT_KNOBS)` — a small pure function, tested), Open my feed / Start over.
- [ ] **6.7 e2e.** Rewrite `e2e/support.ts`'s `answerQuestionnaire` for auto-advance, the keep stack and the reveal's Reading row (sets "Some"); `onboarding.spec.ts`; the retake spec still steers to geology + music.
- [ ] **6.8 `/profile/topics`** shows the new exhibition pieces from the stored taste.
- [ ] **Gate** — and SPEC §3.2 / §5 updated for bank v3 and taste v2.

### Phase 7 — Leftovers, audit, docs

- [ ] **7.1** `app/~offline/page.tsx`, `/dev/faces`, `dev/marks-bench.tsx`, `feed/dev/knob-panel.tsx`, `/dev/landing` (tokens only).
- [ ] **7.2 Audit greps, all clean:** `font-semibold`, `Sora`, `data-accent`, `text-error`, `rounded-` outside the allow-list (the guard test), `bg-accent` with light text, `#161411`, `#1b1815`. `bun run check`, `bun run e2e:prod`, the CI-shape run.
- [ ] **7.3 Screenshots** of every screen at 402 and 1440 (Playwright, into the scratch dir) for Ben's pass beside the package's `screenshots/`.
- [ ] **7.4 Docs:** `SPEC.md` (design tokens; §3.2 onboarding; the item screen), `CLAUDE.md` (a redesign bullet under Architecture; correct every bullet this makes stale — the accent knob, the chrome loop, onboarding's nine steps, the reveal), `log.md`, and mark `docs/BRIEF_claude-design-redesign.md` answered.
- [ ] **7.5** Stop. Ben merges and deploys (migration 0014 runs at that boot — a quiet minute).

---

## Order and dependencies

1 → 2 → then 3, 4 and 5 in any order → 6 (needs 2, and 5.3's `TopicLevels`) → 7. Phases 3–5 touch disjoint files and can run as parallel subagents on the one branch if each commits only its own files.
