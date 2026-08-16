# Phase 5.4 walkthrough — design-system migration

> Companion to `PHASE5_PLAN_5.4.md`. Executed 08-16-26 on branch `phase-5.4-design-migration`,
> immediately after the same session's planning pass wrote that plan (an exception to Ben's usual
> plan-then-execute-cheaper split — the plan doc is still written to be executable cold). Followed
> the plan's 8 numbered steps in order.
>
> This is the phase that re-pointed the whole app at the redesign handoff
> (`docs/design_handoff_ambit_pwa_redesign/`). Scope was deliberately *mechanical restyle only* —
> no new components, no layout changes, no flow changes — with the regression signal being that
> the auth and onboarding suites pass **unmodified**. They did.

## What shipped

- **`src/lib/fonts.ts`** — Newsreader replaced by **Sora** (`next/font/google`, variable, `weight`
  omitted so one variable file covers the design's 400–800). No `axes` (Sora has no `opsz`) and no
  `style` (the redesign has no italics — the serif wordmark's italic treatment died with it).
- **`src/styles/globals.css`** — the migration proper:
  - `--font-serif` **deleted**; `--font-sans` moved into `@theme inline` pointing at
    `--font-sora`, since it's now a runtime-injected var (same reason the accent token lives
    there). Tailwind v4's own default `--font-serif` still resolves, but nothing references it.
  - Accent set replaced *and renamed*: `gold/sage/slate/terracotta` →
    **`indigo` (`#4c5fe0`, default) / `amber` / `green` / `red`**. The old names described hues
    that no longer exist; only `layout.tsx` and `/dev/tokens` referenced them.
  - New `--color-ink-hi: #f5f1e7` — a second opaque stop *above* `--color-ink`, for titles only.
    `--color-ink` stays the body tier and the root of the alpha ladder, so the 5.1 ladder is
    untouched (the redesign uses the same ink and the same opacity tiers).
  - `--color-surface` `#1b1813` → `#1b1815`; `--radius-sheet` 26 → 22; `--shadow-sheet` →
    `0 -20px 50px rgba(0,0,0,.45)`; new `--shadow-toolbar` for 5.5's pill.
  - **Two sheet curves now.** The original 400ms/103%/`--ease-settle` animation was *renamed* to
    `--animate-sheet-gallery` (reserved for the gallery details modal, 5.8), and
    `--animate-sheet-up` was rebuilt as the redesign's snappier 260ms/100% `sheetup` on a new
    `--ease-sheet` curve. `BottomSheet` keeps its `animate-sheet-up` class and picked up the new
    curve with no component change.
  - New `.bg-avatar-gradient` utility, plus a global `prefers-reduced-motion: reduce` block —
    the app had no reduced-motion handling at all; all its motion is decorative, so collapsing
    every duration is safe. A deliberate addition beyond the handoff, which specifies none.
- **`src/lib/utils.ts`** — `bg-avatar-gradient` registered in tailwind-merge's `bg-image` group.
  This is the exact trap `border-hairline` fell into in 5.1 (silently dropped app-wide, not caught
  until 5.2): an unregistered custom `bg-` class is misclassified as a background-*color* and
  dropped next to `bg-ink/NN`. `utils.test.ts` gained regression cases for **both** utilities —
  the `border-hairline` one turned out never to have been written despite that bug's history.
- **Primitives** — `Chip` lost its `serif` prop (one typeface now; its Saved-filter size variant
  waits for 5.9 rather than being guessed at); `BottomSheet`'s grabber went 40×5/`ink/24` →
  36×4/`ink/18`; `Logo` is now the redesign's exact mark spec (ring stroke 1.5→1.7, inner dot
  r 3.4→3.6, satellite r 1.8→1.9). Icon strokes were audited against the handoff's stated
  "1.7–2px" band: every 24-grid icon already sat inside it, `Envelope` was nudged 1.6→1.7, and
  **`Bookmark` deliberately keeps its lighter 1.3** — on its bespoke 13×16 grid that is
  proportionally *heavier* than 1.7 on a 24 grid, so matching the number would fatten the app's
  most-repeated glyph.
- **Screens** — landing (`page.tsx`, `landing-shell.tsx`, `auth-card.tsx`,
  `reset-password-card.tsx`, `reset-password/page.tsx`) and onboarding got a typography/color pass
  only: `font-serif` gone everywhere, titles on `text-ink-hi` + Sora 600, and **negative** letter
  spacing where the serif wanted positive (a geometric sans reads loose at display sizes). Every
  string, placeholder, label, and test id was left untouched, which is what kept the auth suites
  green. The wordmark loses its italic — Sora ships none — and carries on weight instead.
- **`/~offline`** — finally brought onto the design system. It had carried the T3 starter's purple
  gradient and `text-white` since Phase 1, being the one screen no route links to.
- **`/dev/tokens`** — rewritten as the living style guide for the new system: new accent switcher,
  a Sora type-scale specimen replacing the Newsreader/system-sans prose, `ink-hi` added to the
  text ladder, a new surfaces-and-elevation section (opaque fills, all four shadows, the avatar
  gradient), and a **side-by-side replay of the two sheet curves** — they are easy to confuse in
  code and very distinct in motion, and this is the only reliable way to check the right one is
  wired to the right surface. Its header comment now records its two upcoming jobs: 5.5's backbone
  demo host, and the interim home of sign-out from 5.6 until Settings lands in 5.10.
- **Docs** — `SPEC.md` §10 updated (accent set, Sora, `ink-hi`, the two easings, the
  square-cornered-tile note, reduced motion) and §8.3's stale `next-pwa` mention corrected to
  Serwist; `PHASE5_PLAN.md` (the 5.1 plan) got a banner marking its Decisions 2 and 3 superseded
  while noting every *mechanism* it established still stands.

## Verification

`bun run check` — **219 tests green** (217 + 2 new twMerge cases, with chip's serif-variant test
replaced by an `aria-pressed` one). `bun run build` on CI's placeholder env — clean, with `/`,
`/feed`, `/onboarding`, `/reset-password` all still `ƒ (Dynamic)`. `bun run e2e` — **all 7 green,
unmodified**, which was the phase's whole regression signal.

Live pass in Chrome at 402×874: the accent knob was driven through all four hues and `bg-accent`
repainted live with no rebuild (`#4c5fe0` → `#d9a73c` → `#3fa35c`); Sora resolves as the body font
app-wide; landing, onboarding and `/~offline` render correctly.

## Two false alarms worth recording

**Hairlines "computing to 1px".** A DOM probe reported every one of the 54 `.border-hairline`
elements at `border-top-width: 1px` — apparently the exact 5.2 regression, resurrected. It is not.
A raw inline `border-width: 0.5px` measures 1px too: **Chrome snaps sub-pixel borders up to one
whole device pixel, and `getComputedStyle` returns that used value.** At the DPR 1 of a desktop
browser window a 0.5px border cannot report as anything else; on a phone at DPR 2–3 it is a true
hairline. (A first probe made this look worse than it was by failing to recurse into the `@layer`
block, so it also wrongly reported the rule as missing from the stylesheet entirely. It is there.)
Anyone re-measuring this in future: check `window.devicePixelRatio` first.

**A failing e2e run.** The invited-sign-up test timed out for 30s waiting on `/onboarding` while
sitting at `/feed`, which reads exactly like a broken redirect guard. The captured page snapshot
showed the dev server still mid-render — a cold first compile of `/feed`, slow because this
phase's font and CSS changes had invalidated the build cache. Warm, the same test passes in 3.1s.
Nothing was changed to "fix" it.

## Known issue, deliberately not fixed here

`src/server/services/feed.test.ts`'s tier-ratio test is **flaky**: it draws 1000 cards through
`rng: Math.random` (unseeded) and asserts the CORE share is within ±0.05 of 0.4. It failed once
during this phase at 0.46 and passed on every rerun. It is pure server logic, untouched by this
restyle, and fixing it (seeding the rng, or widening the tolerance to match the real sampling
distribution) is a genuine change to a test's meaning — out of scope for a mechanical restyle, so
it is flagged here rather than quietly patched.

## Deferred to 5.11, not a defect

The landing hero's bounding box now touches the wordmark's (measured gap: 0px). It measured
essentially the same before — Sora 600 at 42px is very close in height to Newsreader 400 at 42px
— but the heavier face makes the crowding read. 5.11 replaces this screen wholesale with the
slideshow-and-sheet treatment, so tuning the hero-and-orbs layout now would be discarded work.
