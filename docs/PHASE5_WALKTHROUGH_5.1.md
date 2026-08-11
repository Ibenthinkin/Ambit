# Phase 5.1 walkthrough — design system foundation

> Companion to `PHASE5_PLAN.md`. Executed 08-10-26 on branch `phase-5.1-design-system`, picked up
> straight after Phase 4.2 (tRPC surface) landed on `main`. The plan was written in a Fable
> planning session with docs verification already done; this session executed it cold, per
> Ben's plan-then-execute-cheaper workflow.

## What shipped

- **Test infrastructure first** (`vitest.config.ts`, `src/test/setup.ts`) — the project's first UI
  test layer. `@testing-library/react` + `@testing-library/jest-dom` + jsdom, added as
  devDependencies alongside `@vitejs/plugin-react` (needed for Vitest's own JSX transform,
  separate from Next's compiler). `environment: "node"` stays the *default* so the 172 existing
  server-side tests don't pay for a DOM they don't need; component test files opt into jsdom
  individually via a `// @vitest-environment jsdom` docblock on line 1. `globals: true` lets React
  Testing Library register its own `afterEach(cleanup)` automatically.
- **Tokens** (`src/styles/globals.css`, full rewrite) — Tailwind v4 `@theme`/`@theme inline`
  blocks, CSS-first (there's no `tailwind.config.ts`). Two things specifically require the
  `inline` form rather than plain `@theme`: `--color-accent` (points at `--accent-raw`, which a
  `[data-accent]` selector redefines at runtime) and `--font-serif` (points at whatever variable
  `next/font/google` injects for Newsreader). Plain `@theme` bakes the *outer* variable name into
  the generated utility and a scoped override on the inner variable never resolves — this was
  flagged in the plan as the single most likely failure, and it was worth the caution: it's the
  actual mechanism the whole accent system depends on.
  - Colors, radii, shadows, easing, and all eight named animations (`rise`, `chip-pop`, `pop-in`,
    `spinner`, `toast-in`, `sheet-up`, `scrim-in`, `drift`) ported per the plan's exact values,
    including the three prototype-collision normalizations: `ambitpop` split into `chip-pop`
    (selection feedback) / `pop-in` (checkmark entrance); rise distance normalized to 10px;
    sheet travel normalized to 103%.
  - The alpha ladder (one `--color-ink` token + 12 normalized opacity stops covering every
    muted-text/hairline/fill role in the handoff) replaced ~40 one-off prototype alphas. Recorded
    in `SPEC.md` §10, which this doc doesn't repeat — see there for the actual table.
  - `.border-hairline` utility (`border-width: 0.5px`) for the handoff's near-universal hairline
    border weight.
- **Fonts + layout** (`src/lib/fonts.ts`, `src/app/layout.tsx`) — Newsreader as a variable font
  (`weight` omitted so the full variable file loads; `axes: ['opsz']` opted in since only `wght`
  ships by default). Geist's import and `variable` deleted outright — the handoff has no sans
  webfont, so there was nothing to keep it alongside. `<html>` carries `data-accent="gold"` (the
  default and, as of 5.1, only reachable value — the picker is Phase 9.2) and the Newsreader
  variable class; `<body>` got its first-ever className (`bg-bg text-ink font-sans antialiased`)
  wiring the base surface/text tokens app-wide.
- **Icons** (`src/components/icons/index.tsx`, 11 glyphs) — `Bookmark`, `Share`, `Close`,
  `ChevronLeft`, `ChevronsUpDown`, `Envelope`, `Diamond`, `Logo`, `Check`, `Lock`, `Info`,
  `PlusSquare`, each kept on its own authored viewBox rather than rescaled onto one grid (the
  prototypes mix a 24×24 stroke set with several bespoke ones — bookmark 13×16, close 14×14,
  diamond 10×10, logo 26×26). All `currentColor`; `Bookmark`'s filled variant sets both `fill` and
  `stroke` (how the prototype fattens the glyph at this size) and `Diamond` is fill-only.
- **Primitives** (`src/components/ui/`, 11 files) — `Button`, `Chip`, `IconButton`, `Card`,
  `Toast`, `BottomSheet`, `GlassHeader`, `Segmented`, `Input`, `Spinner`, `Rise`, each matching the
  plan's interfaces exactly (5.2–5.8 depend on these names). Plain variant maps through the
  existing `cn()` — no `class-variance-authority` added. Three are `"use client"` (`Toast`,
  `BottomSheet`, `Segmented`) because they own state or effects; the rest are ordinary function
  components with no client-only APIs, safe to render from either boundary.
  - `Toast` owns its own dismiss timer (`setTimeout`, default 1800ms) rather than making every
    caller wire one up; centers via a static `left-1/2 -translate-x-1/2` wrapper instead of the
    prototype's `translate(-50%)`-in-a-keyframe trick, so the entrance animation only ever
    touches opacity/Y (the porting note the plan flagged).
  - `BottomSheet` closes on scrim click and Escape; drag-to-close is explicitly left as a comment
    for 5.5, not built here.
  - Where the alpha ladder didn't have an exact-match stop for a prototype's one-off value (e.g.
    `IconButton`'s default fill/border, `Input`'s border), the nearest ladder stop was used rather
    than reproducing the one-off — consistent with the plan's Decision 1 ("reproducing every
    one-off value is explicitly not the goal").
  - `IconButton`'s `glass`/default split maps directly onto two of the ladder's own named rows
    (`bg-ink/9` "chrome buttons", `border-ink/16` "glass buttons on imagery") — not a coincidence,
    the ladder's use-case labels were written with this component in mind.
- **`/dev/tokens`** (`src/app/dev/tokens/page.tsx`) — a `"use client"` page (plan's own
  instruction: keep it static, no DB/tRPC, so CI's placeholder-env `bun run build` is unaffected)
  rendering the accent switcher, the type scale, both halves of the alpha ladder as swatches, all
  11 icons, and every primitive with a few interactive states (chip multi-select, segmented
  toggle, toast trigger, bottom sheet trigger). Gated with
  `if (process.env.NODE_ENV === "production") notFound();` inside the component body — `src/
  proxy.ts` only matches `/feed`, `/saved`, `/onboarding`, so without this the route would
  otherwise be reachable in production.
- Tests: `button.test.tsx` (4), `chip.test.tsx` (3), `segmented.test.tsx` (3), `toast.test.tsx`
  (5, fake timers), `bottom-sheet.test.tsx` (4), `rise.test.tsx` (2) — 21 new, **193 total**, all
  green. `IconButton`, `Card`, `GlassHeader`, `Input`, `Spinner` have no dedicated test files (the
  plan's test list didn't call for them — they're pure prop→class mappings with no behavior to
  regress beyond what TypeScript already enforces).

## Verification

- `bun run check` (typecheck → lint → format:check → `vitest run`) clean.
- `bun run build`, run with CI's exact placeholder env (`DATABASE_URL`/`BETTER_AUTH_SECRET`/
  `BETTER_AUTH_URL` from `.github/workflows/ci.yml`), succeeds. Inspecting the build output
  directly confirmed the dev-gate works in the direction that matters most: `.next/server/app/
  dev/tokens.html` is `id="__next_error__"` — a genuine prerendered 404 — because `next build`
  runs with `NODE_ENV=production`.
- Live check with the opposite case: `bun run dev` (after `rm -rf .next`), `curl localhost:.../dev/
  tokens` → HTTP 200 with real page content (confirmed via a distinctive string from the Accent
  section, absent from the error shell).
- **The real gate — visual, against the handoff.** Loaded `/dev/tokens` in Chrome DevTools MCP at
  the 402×874 design viewport. Side-by-side against
  `docs/design_handoff_ambit_pwa/screenshots/03-feed.png`: background, wordmark italic weight/
  size, and the circular bookmark icon button all matched closely. Confirmed the accent mechanism
  is genuinely live (the plan's single highest-risk item) by clicking "Sage" in the switcher and
  reading `document.documentElement.dataset.accent` back after a tick — it changed, and a
  full-page screenshot showed every accent-colored element (buttons, chips, checkmark, segmented
  control) recolor with zero reload.

## Deviations from the plan

None structural. Minor judgment calls where the plan's alpha ladder didn't have an exact-alpha
match for a prototype one-off (documented inline in the affected primitives and above) — resolved
per Decision 1's stated intent rather than treated as open questions.

## Findings for later tasks

- **The grabber pill in `BottomSheet`** (`bg-ink/24`) is the one decorative value left off the
  ladder on purpose — it's a solid indicator bar, not text/border/fill, and the ladder has no
  category for that shape. Noted inline in the component; not expected to recur often.
- **`Segmented` guards against re-firing `onChange` on the already-active option** — a small
  divergence from the prototype's unconditional handler, made because a controlled component
  shouldn't ask every caller to no-op a redundant state update. Worth remembering if 5.3 (Saved)
  wires this up and expects the prototype's literal behavior.
- **Phase 5.1 is the dependency every later 5.x step draws its primitives/tokens from.** 5.2–5.8
  aren't planned yet on purpose (per PHASE5_PLAN.md's own scoping note) — now that the primitives
  exist and their interfaces are proven against `/dev/tokens`, planning the next step against the
  real API instead of an imagined one is unblocked.

## Next

Plan Phase 5.2 — Landing / sign-in (`docs/BUILD_PLAN.md`): `/` per handoff §1 plus its documented
divergence from the old magic-link flow (hero, drifting accent orbs, sign-in, invited sign-up,
forgot-password), built against the primitives this phase shipped.
