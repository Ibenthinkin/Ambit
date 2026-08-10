# Phase 5.1 — Design system foundation: detailed execution plan

> Companion to [`BUILD_PLAN.md`](BUILD_PLAN.md) Phase 5 (step 5.1), same format as
> [`PHASE4_PLAN.md`](PHASE4_PLAN.md). Written 08-10-26. Check the BUILD_PLAN box when the
> *Done =* line is met. Assumes Phase 4 complete (feed engine + full tRPC surface on `main`,
> populated dev DB).
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or
> superpowers:subagent-driven-development) to implement this plan step-by-step.
>
> **Workflow note (Ben's plan-then-execute-cheaper):** written in a planning session with docs
> verification done (findings inlined below); the executing session works cold from this file.
> When live docs contradict this plan, re-verify against docs before trusting either.
>
> **Scope:** this doc covers **5.1 only**. 5.2–5.8 get planned once the primitives exist and their
> API is proven — planning screens against imaginary primitives goes stale.

**Goal:** the design system every Phase 5 screen consumes — Tailwind v4 tokens from the handoff,
the 4-accent runtime knob, Newsreader via `next/font`, an 11-glyph icon set recreated from the
prototypes, and eleven shared primitives — proved by a `/dev/tokens` page rendering all of it in
all four accents. Also establishes the project's **first UI testing layer**.

**Architecture:** tokens live in `src/styles/globals.css` as Tailwind v4 `@theme` (there is no
config file — v4 is CSS-first). The accent is one CSS variable redefined by a `data-accent`
attribute on `<html>`, exposed through `@theme inline` so utilities resolve it at runtime.
Primitives are plain function components in `src/components/ui/`, composing classes through the
existing `cn()` helper — no `class-variance-authority`, keeping the repo's low-dependency posture.
Icons are inline SVG in `src/components/icons/`, each on its authored viewBox, colored by
`currentColor`.

**Tech stack:** five new devDependencies, all for testing (§Decision 4). No runtime dependencies —
`clsx` and `tailwind-merge` are already installed.

---

## Decisions settled during planning (record in SPEC §10 as noted)

1. **One ink color, not forty-one alphas.** The prototypes contain 19 distinct muted-text alphas,
   12 border alphas, and 10 fill alphas. That is hand-authoring noise — the handoff README itself
   specifies *ranges* ("muted text `rgba(239,235,224, 0.36–0.62)`"). Tailwind v4's opacity modifier
   works on any `--color-*` value via `color-mix()`, so the whole system collapses to
   `--color-ink: #EFEBE0` plus a **normalized alpha ladder** (table in Step 2). Reproducing every
   one-off value is explicitly *not* the goal. → Step 2, and record the ladder in SPEC §10 as the
   rule for 5.2–5.8.
2. **Accent = `@theme inline` + `data-accent` on `<html>`.** Verified pattern; plain `@theme`
   silently fails for runtime-swapped vars. 5.1 ships default gold + the mechanism only —
   **the per-user accent picker is Phase 9.2**, do not build a settings UI here. → Step 2/3.
3. **Geist is removed.** The handoff ships no sans webfont (native `-apple-system, system-ui,
   sans-serif`), so 5.1 deletes the Geist import rather than adding Newsreader beside it. → Step 3.
4. **UI testing = jsdom + Testing Library, opted into per file.** Vitest keeps `environment:
   "node"` as the default so the existing 172 server tests stay fast; component files opt in with a
   `// @vitest-environment jsdom` docblock. This is the project's first UI test layer and the
   precedent for 5.2–5.8. → Step 1.
5. **Icons keep their authored viewBoxes.** The prototypes mix a 24×24 stroke set with bespoke
   grids (bookmark 13×16, X 14×14, diamond 10×10, logo 26×26). Hand-rescaling onto one grid
   introduces visual drift for no benefit. → Step 4.
6. **Three prototype collisions resolved:** `ambitpop` is two *different* animations under one name
   → split into `chip-pop` (chip select, `1→0.94→1`) and `pop-in` (checkmark entrance,
   `0.6→1.08→1`); rise distance normalizes to **10px** (README says 8–10; Landing and Item use 10,
   only Saved uses 8); sheet travel normalizes to **103%** (Gallery's, the richer implementation).
   → Step 2.
7. **`/dev/tokens` must 404 outside development.** `src/proxy.ts` gates only `/feed`, `/saved`,
   `/onboarding` — a `/dev/*` route would be publicly reachable. → Step 6.
8. **Gallery's darker background is intentional, not drift.** `#0B0A08` vs the standard `#161411`
   — it ships as its own token (`--color-immersive`), used only by 5.5. → Step 2.

**Known-stray values to ignore** (do not faithfully reproduce): Feed's props JSON declares
`"default":"#7E93AD"` for accent — every other file and the README say gold `#BFA06A`, and Feed's
own JS fallback is gold. Header glass alpha varies 0.66/0.72 across screens; card fills vary
0.028/0.03/0.035. Normalize per the ladder.

---

## Docs findings (verified 08-10-26 — do not re-derive, but re-check if anything looks off)

- **`@theme` vs `@theme inline`.** A token whose value is a `var()` that gets redefined at runtime
  **requires `@theme inline`**, otherwise the generated utility keeps the indirection and scoped
  overrides never resolve. Applies to `--color-accent` *and* to `--font-serif` (which points at
  `next/font`'s injected variable). This is also the pattern in Next.js's own font docs.
- **Opacity modifiers changed in v4.** `bg-ink/60` works on any `--color-*` value via `color-mix()`.
  **Do not** use v3's `rgb(var(--x) / <alpha-value>)` channel trick — a model trained on v3 will
  reach for it reflexively. Fractional alphas use arbitrary syntax: `bg-ink/[2.8%]`.
- **`theme()` is legacy in v4.** In custom CSS use `var(--color-x)` directly.
- **`@custom-variant` is not needed** for the accent knob (it creates variant *prefixes* like
  `dark:`; we always write plain `bg-accent` and let the scoped var resolve).
- **Variable fonts: omit `weight`.** `next/font/google` serves the full variable file when `weight`
  is absent. Only `wght` is included by default — **`opsz` must be opted into via `axes: ['opsz']`**.
  Omitting `weight` also sidesteps an unresolved question (whether the loader errors on
  `weight: ['400','500','600']` + `style: ['normal','italic']` when Newsreader has no italic-600).
  **Do not reconstruct a weight array from the BUILD_PLAN line** — control weight in CSS instead.
- **React 19:** `act` moved to the `react` package (`import { act } from "react"`);
  `react-dom/test-utils` is deprecated. RTL handles this internally — you should not need `act` at all.
- **RTL 16+** makes `@testing-library/dom` an explicit peer dependency.
- ⚠️ **Flagged as NOT verified — test, do not assume:** (a) whether `--z-*` is a real `@theme`
  namespace (evidence says no; use arbitrary `z-[50]` and a documented comment instead of inventing
  a namespace); (b) whether `@vitejs/plugin-react` is strictly required for the JSX transform under
  Vitest 4 (every current example includes it; include it, but if install friction appears, try
  without before fighting it); (c) jsdom vs happy-dom currency (jsdom chosen as the spec-complete
  default). If any of these behaves differently, follow reality and note it in the walkthrough.

---

## Global constraints (unchanged from Phase 4 — the short version)

- **Runtime:** Bun. Tests `bun run test`; full gate `bun run check` must pass before the PR.
- **Branch/PR per BUILD_PLAN step. Never push main directly** (CI only runs on PRs). Branch:
  `phase-5.1-design-system`. Squash merge.
- **Teaching comments:** comment generously in the established style (see `src/server/db/items.ts`,
  and the existing comment at the top of `src/styles/globals.css`) — what each piece is *for*, and
  which handoff token/prototype line it implements. Ben is a returning webdev and the repo doubles
  as a teaching artifact; Tailwind v4's CSS-first model in particular deserves explanation.
- **Type imports must be `import type { X }`, never `import { type X }`** —
  `@typescript-eslint/consistent-type-imports` is set to `fixStyle: "separate-type-imports"`
  because Turbopack's bundle tracer treated the inline form as a real module edge and dragged the
  `postgres` driver into the client bundle. This bites Phase 5 components importing `RouterOutputs`.
- **CI gate is `bun run check` + `bun run build` with placeholder env** — no DB, no browser.
  `bun install --frozen-lockfile` means **`bun.lock` must be committed** with the new deps.
- **Docs updates ride with the PR:** BUILD_PLAN checkbox (rewrite the `*Done =*` into a retrospective
  paragraph, as 4.1/4.2 did), `docs/PHASE5_WALKTHROUGH_5.1.md` (style of
  `docs/PHASE4_WALKTHROUGH_4.2.md`), SPEC §10 edits, `log.md` entry (incl. the session-spend line
  via `python3 ~/.claude/scripts/session-spend.py --session <session-uuid>`; never estimate; omit
  the line entirely on non-zero exit).

---

## Reference files (read before the step that uses them)

| File | What it holds |
|---|---|
| `docs/design_handoff_ambit_pwa/README.md` | **The token source of truth.** Color/typography/shape/motion sections; the `accent` theming note; per-screen specs §1–§7. |
| `docs/design_handoff_ambit_pwa/Ambit - Onboarding.dc.html` | Canonical **chip** and **pill CTA** — both as readable JS style objects (lines ~112–155). |
| `docs/design_handoff_ambit_pwa/Ambit - Gallery.dc.html` | Canonical **26px bottom sheet** + scrim + grabber + drag-follow (lines ~82–86, 374). |
| `docs/design_handoff_ambit_pwa/Ambit - Feed.dc.html` | Canonical **glass sticky header** (line ~32), **card** (~386–395), **icon button** (~60), **toast** (~163), and most icon paths. |
| `docs/design_handoff_ambit_pwa/Ambit - Saved.dc.html` | Canonical **segmented control** (~249–262). |
| `docs/design_handoff_ambit_pwa/Ambit - Landing.dc.html` | Canonical **text input** + primary button (~124–151); the orb `drift` keyframe. |
| `docs/design_handoff_ambit_pwa/screenshots/` | Seven PNGs, default states — the visual check. |
| `src/lib/utils.ts` | The existing `cn()` helper. Every primitive composes classes through it. |
| `src/styles/globals.css` | Current theme (one token). Its header comment already explains v4's CSS-first model — extend that voice. |

**Porting notes:**
- **Recreate, don't port.** The `.dc.html` files are a template dialect (`<x-dc>`, `{{ }}`,
  `<sc-if>`) whose runtime (`support.js`) **is not in the bundle** — they will not run
  interactively, and reading them as static source is the intended use.
- **`ios-frame.jsx` and `image-slot.js` are NOT to be ported** — both are `@ds-adherence-ignore`
  staging scaffolding. Two facts inside them *are* worth keeping: the design viewport is
  **402×874**, and `image-slot`'s `radius=` attributes encode the real image radii (feed 20, saved
  16, gallery 12, item hero 18).
- The **toast keyframe bakes `translate(-50%)` into its centering transform.** Do not copy that —
  center with a wrapper (`left-1/2 -translate-x-1/2`) and animate opacity + Y on an inner element,
  so the transform is not load-bearing for layout.

---

### Task 1 — 5.1 Design system foundation (branch `phase-5.1-design-system`)

**Files:**
- Modify: `vitest.config.ts` — `.test.tsx` in `include`, React plugin, setup file
- Create: `src/test/setup.ts` — jest-dom matchers
- Rewrite: `src/styles/globals.css` — the whole token layer
- Create: `src/lib/fonts.ts` — Newsreader loader
- Modify: `src/app/layout.tsx` — Geist out, Newsreader in, `data-accent`, body classes
- Create: `src/components/icons/index.tsx` — 11 glyphs
- Create: `src/components/ui/{button,chip,icon-button,card,toast,bottom-sheet,glass-header,segmented,input,spinner,rise}.tsx`
- Create: `src/app/dev/tokens/page.tsx` — the proof page (dev-only)
- Tests: co-located `*.test.tsx` beside the primitives they cover
- Docs: BUILD_PLAN 5.1 checkbox; `docs/PHASE5_WALKTHROUGH_5.1.md`; SPEC §10; `log.md`
- Ride-along: **`CLAUDE.md` still says "Repository status: Pre-scaffold."** — four phases stale.
  Fix it to describe the real state (Phases 0–4 complete, Phase 5 UI in progress).

---

**Steps:**

- [ ] **Step 1: Test infrastructure — first, so everything after is testable.**
  `bun add -d @testing-library/react @testing-library/dom @testing-library/jest-dom jsdom @vitejs/plugin-react`

  ```ts
  // vitest.config.ts — additions only; keep the existing loadEnvFile block and resolve.alias
  import react from "@vitejs/plugin-react";

  export default defineConfig({
    plugins: [react()],
    test: {
      globals: true,                    // lets RTL auto-register its afterEach(cleanup)
      environment: "node",              // stays node: the 172 server tests don't need a DOM
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      setupFiles: ["./src/test/setup.ts"],
    },
  });
  ```
  ```ts
  // src/test/setup.ts
  import "@testing-library/jest-dom/vitest";
  ```
  Component test files opt into a DOM with a first-line docblock: `// @vitest-environment jsdom`.
  *Verify:* `bun run test` — all existing tests still green, count unchanged.

- [ ] **Step 2: Tokens (`src/styles/globals.css`).** Note the two separate blocks — `inline` is
  required only for tokens whose value is a runtime-swapped `var()`.

  ```css
  @import "tailwindcss";

  /* Tokens whose value is a var() redefined at runtime MUST live in `@theme inline`, or the
     generated utility keeps the indirection and the swap silently never resolves. */
  @theme inline {
    --color-accent: var(--accent-raw);
    --font-serif:   var(--font-newsreader);
  }

  @theme {
    /* Surfaces */
    --color-bg:        #161411;  /* every screen except the gallery */
    --color-bg-app:    #0C0B09;  /* outer app chrome */
    --color-surface:   #1B1813;  /* sheets, modals */
    --color-immersive: #0B0A08;  /* gallery only — deliberate, see Decision 8 */
    --color-overlay:   #1E1C18;  /* toast / install banner fill, used at /92 */
    --color-scrim:     #090806;  /* sheet scrims, used at /60–/66 */
    --color-tile-hi:   #221E17;  /* app-icon tile gradient stops */
    --color-tile-lo:   #0F0D09;

    /* Ink — EVERY muted text, hairline and subtle fill derives from this one color via
       opacity modifiers (Tailwind v4 does the color-mix for us). See the ladder below. */
    --color-ink:       #EFEBE0;
    --color-on-accent: #17140E;  /* text on an accent fill — always this, never white */
    --color-error:     #D98C6A;

    /* The handoff ships no sans webfont — UI chrome uses the native stack. */
    --font-sans: -apple-system, system-ui, sans-serif;

    /* Shape */
    --radius-pill:  999px;  --radius-sheet:  26px;  --radius-card:   22px;
    --radius-img-lg: 20px;  --radius-tile:   18px;  --radius-img-md: 16px;
    --radius-input:  14px;  --radius-img-sm: 12px;

    /* Elevation — exactly three shadows exist in the handoff */
    --shadow-toast:  0 8px 30px rgba(0,0,0,0.4);
    --shadow-banner: 0 12px 40px rgba(0,0,0,0.45);
    --shadow-sheet:  0 -12px 50px rgba(0,0,0,0.5);

    /* The one non-default curve in the system: sheets, banners, settle. */
    --ease-settle: cubic-bezier(.22,.61,.36,1);

    --animate-rise:     rise .6s ease both;
    --animate-chip-pop: chip-pop .22s ease;
    --animate-pop-in:   pop-in .5s var(--ease-settle) both;
    --animate-spinner:  spinner .8s linear infinite;
    --animate-toast-in: toast-in .22s ease both;
    --animate-sheet-up: sheet-up .4s var(--ease-settle) both;
    --animate-scrim-in: scrim-in .3s ease both;
    --animate-drift:    drift 18s ease-in-out infinite;

    @keyframes rise      { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:none; } }
    @keyframes chip-pop  { 0%{transform:scale(1);} 40%{transform:scale(.94);} 100%{transform:scale(1);} }
    @keyframes pop-in    { 0%{transform:scale(.6);opacity:0;} 55%{transform:scale(1.08);} 100%{transform:scale(1);opacity:1;} }
    @keyframes spinner   { to { transform:rotate(360deg); } }
    @keyframes toast-in  { from { opacity:0; transform:translateY(8px);} to { opacity:1; transform:none; } }
    @keyframes sheet-up  { from { transform:translateY(103%);} to { transform:translateY(0);} }
    @keyframes scrim-in  { from { opacity:0;} to { opacity:1;} }
    @keyframes drift     { 0%{transform:translate(0,0) rotate(0);} 50%{transform:translate(14px,-18px) rotate(8deg);} 100%{transform:translate(0,0) rotate(0);} }
  }

  @layer base {
    /* The single brand knob. Phase 9.2 adds the per-user picker; 5.1 ships gold + the mechanism. */
    :root, [data-accent="gold"] { --accent-raw: #BFA06A; }
    [data-accent="sage"]        { --accent-raw: #8FA786; }
    [data-accent="slate"]       { --accent-raw: #7E93AD; }
    [data-accent="terracotta"]  { --accent-raw: #C08262; }
  }

  @layer utilities {
    /* Every border in the handoff is a 0.5px hairline. */
    .border-hairline { border-width: 0.5px; }
  }
  ```

  **The alpha ladder** — the whole muted/border/fill system. Use these, not the prototypes'
  one-off values. Record this table in SPEC §10.

  | Role | Class | Notes |
  |---|---|---|
  | Primary text | `text-ink` | headlines, wordmark, toast |
  | Secondary text | `text-ink/82` | chip labels (unselected) |
  | Body / muted | `text-ink/62` | secondary copy, meta |
  | Meta / attribution | `text-ink/55` | source lines, captions |
  | Faint label | `text-ink/40` | eyebrows, loader label |
  | Disabled | `text-ink/38` | inactive CTA text |
  | Hairline strong | `border-ink/16` | glass buttons on imagery |
  | Hairline default | `border-ink/12` | sheets, toasts, chips |
  | Hairline faint | `border-ink/8` | cards, headers |
  | Fill raised | `bg-ink/9` | chrome buttons |
  | Fill default | `bg-ink/5` | chips, ghost buttons |
  | Fill subtle | `bg-ink/3` | cards, tiles |

  *Verify:* `bun run build` succeeds; no `theme()` calls anywhere; `--z-*` not invented (use
  `z-[50]` with a comment — see the flagged docs item).

- [ ] **Step 3: Fonts + layout.**
  ```ts
  // src/lib/fonts.ts
  import { Newsreader } from "next/font/google";

  // Variable font: `weight` is deliberately omitted so the full variable file is served and
  // weight is controlled in CSS. `opsz` (optical size) must be opted into — only `wght` ships
  // by default — and Newsreader's design calls for it across a 14→42px range.
  export const newsreader = Newsreader({
    subsets: ["latin"],
    axes: ["opsz"],
    style: ["normal", "italic"],
    display: "swap",
    variable: "--font-newsreader",
  });
  ```
  In `layout.tsx`: **delete the Geist import and its `variable`**, put
  `className={`${newsreader.variable}`}` and `data-accent="gold"` on `<html>`, and give `<body>`
  `className="bg-bg text-ink font-sans antialiased"` (it currently has no className at all).
  Leave `viewport.themeColor` and `manifest.ts`'s colors as the literal `#161411` — metadata
  exports cannot read CSS vars — but add a comment cross-referencing `--color-bg`.
  *Verify:* `bun run dev`, confirm Newsreader renders (italic wordmark especially) and no Geist
  request remains in the network tab.

- [ ] **Step 4: Icons (`src/components/icons/index.tsx`).** Eleven glyphs, each on its authored
  viewBox, all `currentColor` so accent flows via `text-accent`:
  `Bookmark` (`filled?: boolean`), `Share`, `Close`, `ChevronLeft`, `ChevronsUpDown`, `Envelope`,
  `Diamond`, `Logo` (ring-and-dot), `Check`, `Lock`, `Info`, `PlusSquare`.
  Shared props: `{ size?: number; className?: string }`. Two exceptions to call out in comments:
  **filled bookmark sets `fill` AND `stroke`** (that is how the prototype fattens the shape), and
  **`Diamond` is fill-only**. Exact paths are in the prototypes — `Feed.dc.html` has most of them.

- [ ] **Step 5: Primitives (`src/components/ui/`).** Plain variant maps through `cn()`.
  ```ts
  // Interfaces (5.2–5.8 depend on these exact names)
  export function Button(p: { variant?: "accent" | "ghost"; size?: "sm" | "md" | "lg";
    shape?: "pill" | "rounded"; disabled?: boolean } & React.ComponentProps<"button">): JSX.Element;
  export function Chip(p: { selected?: boolean; serif?: boolean } & React.ComponentProps<"button">): JSX.Element;
  export function IconButton(p: { size?: 28 | 30 | 34 | 36 | 38 | 42; glass?: boolean } & React.ComponentProps<"button">): JSX.Element;
  export function Card(p: { as?: "div" | "article"; radius?: "card" | "tile" } & React.ComponentProps<"div">): JSX.Element;
  export function Toast(p: { text: string; open: boolean; onDone: () => void; durationMs?: number }): JSX.Element | null;
  export function BottomSheet(p: { open: boolean; onClose: () => void; children: React.ReactNode }): JSX.Element | null;
  export function GlassHeader(p: React.ComponentProps<"header">): JSX.Element;
  export function Segmented<T extends string>(p: { options: { key: T; label: string }[];
    value: T; onChange: (v: T) => void }): JSX.Element;
  export function Input(p: React.ComponentProps<"input">): JSX.Element;
  export function Spinner(p: { size?: number; className?: string }): JSX.Element;
  export function Rise(p: { delayMs?: number; children: React.ReactNode }): JSX.Element;
  ```
  `BottomSheet` renders scrim + 26px top-radius panel + grabber, closes on scrim click and on
  Escape. Drag-to-close is **5.5's** problem — leave a comment, don't build it. `Toast` owns its
  own dismiss timer (default 1800ms) and calls `onDone`.

  ***Tests*** (co-located `*.test.tsx`, each starting `// @vitest-environment jsdom`) — test
  behavior, **not** that Tailwind classes are strings:
  - *toast.test.tsx*: renders text when open; calls `onDone` after the duration (fake timers); does not fire when closed; custom duration honored.
  - *bottom-sheet.test.tsx*: renders nothing when closed; scrim click calls `onClose`; Escape calls `onClose`; children render.
  - *chip.test.tsx*: selected vs unselected apply different classes; click handler fires; serif variant switches font class.
  - *segmented.test.tsx*: renders one control per option; clicking a non-active option calls `onChange` with its key; the active option does not re-fire.
  - *button.test.tsx*: disabled blocks the click handler; variant/size/shape maps produce distinct class strings; `className` passed in survives the `cn()` merge (the real regression risk).
  - *rise.test.tsx*: `delayMs` lands as an inline `animation-delay`.

- [ ] **Step 6: `/dev/tokens` proof page.** Renders every primitive, every icon, the full alpha
  ladder, and the type scale — with a four-way accent switcher that sets `data-accent` on
  `document.documentElement`. **Must 404 outside development** (`src/proxy.ts` does not gate
  `/dev/*`):
  ```tsx
  import { notFound } from "next/navigation";
  if (process.env.NODE_ENV === "production") notFound();
  ```
  Keep it a static client page — no DB, no tRPC — so CI's `bun run build` with placeholder env is
  unaffected.

- [ ] **Step 7: Docs.** BUILD_PLAN 5.1 checked with a retrospective `*Done =*` paragraph; SPEC §10
  rewritten to carry the token model + alpha ladder (it currently says only "Minimal, calm,
  high-contrast-on-neutral"); `docs/PHASE5_WALKTHROUGH_5.1.md`; `log.md` entry; the `CLAUDE.md`
  "Pre-scaffold" fix.

  Note for SPEC §10: it also claims `@tailwindcss/typography` for expanded article text — that is
  **not installed and not 5.1's job**. Leave it; **5.4** adds it when article expand is built.

***Done =*** `/dev/tokens` renders every primitive and icon correctly in all four accents, matching
the handoff (checked against `docs/design_handoff_ambit_pwa/screenshots/`); Newsreader loads and
Geist is gone; `bun run check` green with the new component tests included; `bun run build` green;
BUILD_PLAN 5.1 checked.

---

## Verification approach

- `bun run check` + `bun run build` green before the PR; CI green before merge.
- **The real gate is visual.** Open `/dev/tokens` on a phone (iOS Safari — BUILD_PLAN's stated
  verification approach for every UI step) at the 402×874 design viewport, cycle all four accents,
  and compare against the handoff screenshots. Tokens that look wrong here look wrong on eight
  screens later.
- Confirm the accent swap is genuinely live: change `data-accent` in devtools and watch every
  accent-colored element update without a rebuild. If they don't, `@theme inline` is missing —
  that's the single most likely failure in this task.
- Confirm the existing 172 server tests still pass at their original speed (i.e. the jsdom
  environment did not leak into them via a global config change).
