# Phase 5.11 walkthrough — Landing slideshow + install + PWA polish

**Executed 08-24/25-26** against `docs/PHASE5_PLAN_5.11.md`, on branch
`feat/5.11-landing-install-pwa`, straight through with no mid-phase stop, as the plan prescribed.
`bun run check` green (735 vitest tests, 93 of them new), `bun run build` clean, `bun run e2e`
green across all six spec files on runs 2 and 3 of three (run 1's single failure was
`gallery.spec.ts:193`, the known dev-DB flake documented in CLAUDE.md — same test, passes in
isolation), and the production-build PWA verification passing as a new `e2e/pwa.prod.spec.ts`.

**Status: complete. Phase 5 is complete.** The plan's fourteen decisions all held. Four things
argued back — one lint rule that rejected the plan's React shape twice, one genuine regression the
plan's own verification step caught, one design detail the prototype hadn't had to face, and one
`sips` invocation that did the opposite of what was asked. All four are below.

---

## What shipped

**The landing is the redesign's `Landing 2`.** A full-bleed slideshow of eight public-domain works
cross-fading at 600ms, shuffled per load, which stops on its last slide and hands off to a sign-in
sheet 260ms later. Tapping the imagery or the floating glyph skips straight there. The sheet holds
5.2's `AuthCard` completely untouched — all four modes, same placeholders, same `data-testid` — so
the entire auth test surface survived the rebuild. `/reset-password` is the same screen in static
mode: one still image, sheet already up.

**5.2's `LandingShell` is gone**, and with it the two drifting blurred orbs, the 42px hero, and the
`drift` keyframe that had exactly one user.

**A real install flow.** A dismissible banner on the feed's second visit → the browser's own
`beforeinstallprompt` where one exists, or 5.10's instruction sheet where it doesn't → a
confirmation. Settings' "Add to home screen" row does the same thing and reports "Installed" when
the app already is.

**The service worker's caching strategy is written rather than inherited**, `start_url` points at
`/feed`, and signing out drops the cached feed document.

**Version → 0.5.0.**

---

## Where the corpus of files landed

| Area | Files |
|---|---|
| Landing | `components/landing/{landing-slides,use-slideshow,landing-slideshow,auth-sheet,landing-screen}` (+3 test files); `landing-shell.tsx` **deleted** |
| Slides | `public/landing/*.jpg` — 8 files, 1.6 MB |
| Install | `lib/install-store.ts` (+test); `components/install/{install-listener,install-banner,install-confirmation,install-flow}` (+1 test); `install-sheet.tsx` **moved** from `components/settings/` |
| Service worker | `lib/sw-rules.ts` (+test); `app/sw.ts` rewritten; `app/manifest.ts` |
| Wiring | `app/page.tsx`, `app/reset-password/page.tsx`, `app/layout.tsx`, `components/feed/feed-screen.tsx`, `components/settings/settings-screen.tsx`, `styles/globals.css` |
| Tests | `e2e/support.ts` (+`openAuthSheet`), `e2e/home.spec.ts`, five specs retargeted, `e2e/pwa.prod.spec.ts` **new**, `playwright.config.ts` |

---

## The four things that argued back

### 1. `react-hooks/set-state-in-effect` rejected the plan's React shape — twice

The plan wrote both new stateful components the ordinary way: a mount effect that reads
`localStorage` / `matchMedia` / a random shuffle and calls `setState` with what it found. That is
the textbook React pattern for client-only initialization, and the repo's lint config rejects it —
`react-hooks/set-state-in-effect` on `landing-screen.tsx`, then again on `install-flow.tsx`, plus
`react-hooks/refs` for `use-slideshow`'s latest-callback assignment during render.

These are errors, not warnings, and no existing file in the repo suppresses either rule, so the
honest move was to change the shape rather than the config. Both components now use the same
structure:

- **`useSyncExternalStore(subscribeToNothing, () => true, () => false)`** as the hydration
  boundary. It answers "has React hydrated?" without a setState anywhere, and it is the same
  primitive `use-notification-permission.ts` already uses for the same class of problem.
- **A lazy `useState` initializer** for the client-only decision (the shuffled run; the install
  eligibility verdict), which must contain **reads only** — StrictMode invokes initializers twice,
  and `InstallFlow`'s initializer would otherwise have counted every visit twice and brought the
  banner forward by a whole session. The corresponding *write* moved to an effect, where a repeat
  is harmless because it stores the same value.
- **Derived state instead of a second effect**: `install.installed && !confirmationClosed ? "done"
  : stage` replaced an effect that set the stage when the browser reported an install.

`use-slideshow`'s ref assignment moved into an effect. Its `finish()` is guarded by a
`runningRef` rather than by checking state inside an updater, for the same StrictMode reason —
`onDone` firing twice would raise the sheet twice.

This is worth recording because the pattern will come up again: **in this repo, "read it in a mount
effect and setState" is not available.** The replacement is hydration-gate + lazy-read + derive.

### 2. The plan's own verification caught a real regression: the offline page stopped working

Plan Decision 10 replaced `defaultCache` with a hand-written rule list and said, in as many words,
that anything unmatched should "go straight to the network". That is exactly what it did — and it
silently disabled the offline fallback page for every route except `/feed`.

The mechanism: **a request that matches no rule never enters Serwist's routing at all**, and
`fallbacks` only applies to requests Serwist itself handled. `defaultCache`'s first entry is
`{ matcher: /.*/i, handler: new NetworkOnly() }` — a catch-all that looks redundant and is not.
Dropping it meant an offline navigation to `/settings` got Chrome's own connection error instead of
the precached `~offline` shell.

Nothing in the unit tests could have caught this (the matchers were all individually correct), and
nothing in `bun run e2e` could either (the SW is production-only). It was caught by writing the
plan's §6.3 "manual" verification as a script, which is why that script is now a kept file rather
than a throwaway — see below.

`sw.ts` ends with an explicit terminating `{ matcher: () => true, handler: new NetworkOnly() }` and
a comment explaining that its apparent redundancy is the point.

### 3. `/reset-password` was showing the sales pitch above "This link has expired"

Decision 6 said the reset page should be the same screen in static mode, so it wouldn't look like a
different product. Rendering it revealed the flaw: the sheet's hero — *"A quieter way to be
curious. No feeds engineered to keep you…"* — sat directly above the reset form, selling the app to
someone who already has an account and is mid-task.

The prototype never had to face this, because its sheet only ever contained a sign-in form.

`AuthSheet` grew a `showHero` prop, keyed to the **route** rather than to the render mode: `/`
always shows the pitch (including for a reduced-motion reader, who gets static mode), and
`/reset-password` never does. The slideshow, the logo and the sheet itself are what carry the "same
app" signal; the pitch was never doing that work.

### 4. `sips` re-encoding made the largest file *bigger*

Haeckel's *Discomedusae* plate came down from Commons at 533 KB against a ~300 KB budget. The
plan's recompress line — `sips -s formatOptions 72` — produced a **626 KB** file. `sips`'
`formatOptions` on an already-compressed JPEG re-encodes rather than recompresses, and a numeric
quality is not the scale it looks like. `formatOptions low` gave 185 KB, and a 100%-crop comparison
of the dense engraving showed no visible blocking at the size it is actually displayed. Total slide
payload: **1.6 MB across 8 files**.

---

## Decisions confirmed in the build

- **The sheet is mounted from first paint**, translated off-screen, never unmounted. This is load-
  bearing: `waitForHydration(page, "form")` and every auth e2e selector depend on the form being in
  the DOM, and a password manager needs to see the fields. A component test pins it directly.
- **The glyph's accessible name is "Open sign-in"**, deliberately not "Sign in" — the form's submit
  button owns that name, and two controls sharing it would make `getByRole` ambiguous across the
  whole auth suite.
- **`preloadRun` resolves on the first slide's decode**, not on all eight — starting the cycle when
  slide 0 can paint, while the rest stream in behind. It also guards `decode` for existence:
  jsdom lacks it, some embedded webviews lack it, and calling a missing method in the mount effect
  would take down the one screen with no signed-in state to fall back on.
- **The confirmation never follows "Got it"** (Decision 9), and the code says why at the point of
  decision. Safari tells a page nothing about Add to Home Screen; the honest triggers are
  `appinstalled` and the first standalone launch, and the persisted `confirmed` flag makes it
  once-ever.

---

## Verification

**`bun run check`** — 735 tests across 66 files, 0 lint errors, formatting clean.

**`bun run e2e`** — three consecutive runs: 39/40 (one `gallery.spec:193`), 40/40, 40/40. The
retarget was wider than the plan expected: **five** specs drive the landing sign-up form directly,
not one, and all five needed `openAuthSheet`. The `/reset-password` site inside `auth.spec.ts`
deliberately kept plain `waitForHydration` — static mode has no glyph and no email field for the
helper to wait on.

**`e2e/pwa.prod.spec.ts`** — new, and excluded from the default suite via
`testIgnore: /\.prod\.spec\.ts$/` because it cannot pass against `next dev` (the SW is registered
in production builds only, deliberately). Run it with:

```sh
lsof -ti:3000 | xargs kill; bun run build && bun run start &
bunx playwright test pwa.prod.spec.ts --workers=1
```

What it observed against a real production build, signed in with a fresh user:

| Check | Result |
|---|---|
| Service worker | `activated` at `/serwist/sw.js` |
| Cache buckets | `serwist-precache-v2` 43 · `ambit-images` 22 · `ambit-pages` 1 · `ambit-next-static` 1 |
| `apis` bucket (the `defaultCache` leftover) | **absent** |
| Cached `/api/trpc/*` responses | **none** — asserted across every bucket |
| Offline reload of `/feed` | **12 tiles rendered** from the cached document |
| Offline navigation to `/settings` | `~offline` shell (this is the check that caught §2) |
| After sign-out | `ambit-pages` gone; images and static kept |

**Still needs Ben, and cannot be scripted here:**

1. **The Chromium install dialog.** Headless Chromium never fires `beforeinstallprompt`, so the
   `canPrompt` branch is covered by unit tests only. Desktop Chrome against `bun run start`: seed
   `ambit.install.v1` as the e2e test does, tap **Add**, and confirm the real dialog appears,
   that accepting shows the confirmation, and that a second launch shows neither it nor the banner.
2. **The iOS device pass**, over the tailnet (`https://macbook-air-m5.halley-morpho.ts.net`,
   `tailscale serve --bg 3000` — and clear port 3000 first). Slideshow → sheet; Share → Add to Home
   Screen; **first launch from the icon shows the confirmation once**; Settings' row reads
   "Installed"; airplane mode → reopen → feed shell + last page.

---

## Deferred / flagged

- **Item pages offline.** Only `/feed` is cached. `/i/*` is a one-line matcher away when there's a
  reason.
- **Slide credits are not rendered.** They live beside each entry in `LANDING_SLIDES`. Settings ›
  About is the natural home if they should ever be visible.
- **`SLIDE_MS` / `SLIDES_PER_RUN` are constants, not `/dev/tokens` knobs.** Tune by editing;
  promote only if the tuning drags on.
- **Ben's cleared images never arrived**, so the run ships as the 8 Wikimedia works. Adding more is
  a file in `public/landing/` and a line in `LANDING_SLIDES`; the run size is capped at 8, so the
  ~5s pacing holds however long the list grows. A test asserts no entry ever points into the design
  bundle's rights-uncleared `uploads/`.
- **The hero's size in the sheet** is the prototype's 16px. Ben expects to adjust it by eye ("easy
  to change, don't care on the first go").
- **`beforeinstallprompt` capture timing.** Listeners attach from a layout-mounted effect. If
  Chrome is ever found to fire it before hydration on a warm load, the fix is an inline `<head>`
  script stashing the event on `window`, mirroring the accent bootstrap.
- **Navigation preload + the catch-all `NetworkOnly`.** `navigationPreload: true` is still set;
  whether `NetworkOnly` consumes the preloaded response is unverified. A latency question only,
  not a correctness one.
