# Phase 5.11 — Landing slideshow + install + PWA polish: detailed execution plan

**Status: ready to execute.** Companion to BUILD_PLAN.md Phase 5, same format as
PHASE5_PLAN_5.10.md. Written to be executed cold, by a session that has not read the research
behind it, straight through on `feat/5.11-landing-install-pwa` — plain branch off `main`, merged
back when green. Where it says "verified", the claim was checked against the repo at plan time
(08-24-26, `main` @ 47eb0f9); re-verify line numbers if the repo has moved — the *shapes* are
the contract, not the line numbers.

**Prerequisites (Ben):**
1. **Cleared landing images (optional, non-blocking).** Ben is clearing a set of his own images
   for the slideshow. Drop them in `public/landing/` and add one entry each to
   `LANDING_SLIDES` (§5 Task 1). Recompress first so no file exceeds ~300 KB:
   `sips -Z 1200 -s format jpeg -s formatOptions 78 in.png --out public/landing/<name>.jpg`.
   If none have arrived when execution starts, **ship with the 8 Wikimedia works** — the code is
   identical, the list is just shorter. Nothing else in this plan depends on them.
2. Local Postgres up (`docker compose up -d`); clear port 3000 (`lsof -ti:3000`) before dev,
   e2e, or the production-build verification in §8.

**No mid-phase stop.** Every scope and design call below was settled with Ben at plan time.

**What this phase is:** the last Phase 5 step. The landing becomes the redesign's `Landing 2`
— a full-bleed cross-fading slideshow that resolves into a sign-in sheet holding the existing
`AuthCard`; the app gets a real install flow (banner → native prompt where the browser has one,
the 5.10 instruction sheet where it doesn't → confirmation); and the service worker's caching
strategy is written deliberately instead of inherited from `defaultCache`, so reopening the
installed app offline shows the shell and the last feed page without ever caching a
personalized API response. Phase 5 closes with this merge.

---

## 1. Context

- **Where this sits:** 5.10 ✅ → **5.11** → Phase 6.3 (blog design session) / Phase 7.
  Source of truth is the redesign bundle (`docs/design_handoff_ambit_pwa_redesign/`):
  `Ambit - Landing 2.dc.html` and `Ambit - Install.dc.html`. Prototypes win over the README
  (recorded convention). §4 distils both — **do not open them during execution.**
- **What exists already (verified):**
  - `src/app/page.tsx` — Server Component: session → `redirect("/feed")`, else
    `LandingShell` + 42px hero + `AuthCard`. `src/app/reset-password/page.tsx` uses the same
    `LandingShell` with `ResetPasswordCard` / an expired-link message.
  - `src/components/landing/landing-shell.tsx` — two blurred accent orbs on `animate-drift` +
    the brand mark. **Deleted by this phase**, with `--animate-drift` and `@keyframes drift`
    (`src/styles/globals.css:133`, `:258-268`).
  - `src/components/landing/auth-card.tsx` — chromeless `<form>` with all four modes
    (sign-in / sign-up / forgot / forgot-sent). **Unchanged.** Its placeholders, button names
    and `data-testid="auth-error"` are what `e2e/auth.spec.ts` and `e2e/support.ts` target.
  - `src/components/settings/install-sheet.tsx` — 5.10's iOS + Android "Add to home screen"
    instruction sheet. Its header comment says 5.11 should *import* it as the fallback. It moves
    to `src/components/install/` (git mv) and is otherwise unchanged.
  - `src/app/sw.ts` — Serwist worker on `runtimeCaching: defaultCache`. **Verified problem:**
    `@serwist/turbopack`'s `defaultCache` (`node_modules/@serwist/turbopack/dist/index.worker.mjs`
    :155-161) routes every same-origin `/api/*` request except `/api/auth/*` through
    `NetworkFirst` into an `apis` bucket (16 entries, 24 h). tRPC queries travel as GET, so the
    personalized feed pages *are* being cached today, and `/api/img/*` shares those 16 slots.
  - `src/app/manifest.ts` — `start_url: "/"`. `/` is a redirect when signed in, so an installed
    app launched offline hits the `~offline` fallback instead of the cached feed. Fixed below.
  - `src/app/layout.tsx` — `SerwistProvider` in production only; `SwCleanup` in dev. Unchanged
    policy: the SW is never registered against a dev server.
  - `e2e/support.ts` — `waitForHydration(page, selector = "form")` and `signIn()`.
    `e2e/auth.spec.ts` has four direct `goto("/")` → click sequences (lines 55-63, 76-84,
    134-138, 146-150) that assume the form is on screen.
- **The 8 Wikimedia works** in the prototype's slide list were HEAD-checked at plan time at
  `?width=900`: all 200, JPEG, 133–534 KB (≈2.0 MB total). Public domain. They are fetched
  **once** into `public/landing/` and committed — no runtime dependence on Commons, and the
  BUILD_PLAN gate ("proxied/cached, not hot-linked") is met by not hot-linking at all.
- **Licensing gate stands:** the bundle's `uploads/*.webp` are uncleared and **must not** be
  copied into the app. Slides are the 8 works plus whatever Ben clears (prerequisite 1).

## 2. Decisions locked in this plan

| # | Decision | Rationale |
|---|---|---|
| 1 | **Slides are static files in `public/landing/`**, listed in a typed `LANDING_SLIDES` array with a credit string each. | Zero runtime dependence on Commons; the SW's static-asset rule caches them; credits live next to the files that need them. |
| 2 | **`slideMs = 600`, random subset of 8 per load, stop on the last → 260 ms → sheet.** (Ben: "faster, ~5 s".) | 8 × 600 ms ≈ 4.8 s before sign-in regardless of how many images get cleared; fade = `min(520, 0.55·slideMs)` = 330 ms per the README formula. |
| 3 | **Tap anywhere, or the floating glyph, skips to the sheet.** `prefers-reduced-motion` → one static slide, sheet open on load. | The e2e suite and impatient readers need a deterministic way in; reduced motion is a 4-line branch. |
| 4 | **`AuthSheet` is bespoke, not a `BottomSheet` variant.** | The landing sheet is *persistent* (a `translateY` toggle with its own 550 ms curve, 28 px radius, non-interactive scrim), not a summoned/unmounting sheet. A third `BottomSheet` variant would cost more than ~60 lines. |
| 5 | **Hero moves into the sheet at the prototype's sheet size** (16 px headline). | Prototype wins. Ben: "easy to change, don't care on the first go." |
| 6 | **`/reset-password` uses the same screen in `static` mode** (one random slide, sheet already open, no glyph). | `LandingShell` is deleted; the reset page must not look like another product. |
| 7 | **Install banner: second feed visit; "Not now" snoozes 30 days; the X is permanent; never when running standalone.** A "visit" is a feed mount ≥ 6 h after the last counted one. (Ben's pick.) | Never on the onboarding-day session. One versioned localStorage key, `ambit.install.v1`, same try/catch discipline as `lib/accent.ts`. |
| 8 | **"Add" → native `beforeinstallprompt` where captured; otherwise the 5.10 `InstallSheet`.** Settings' row does the same. | The sheet's own header comment planned exactly this. |
| 9 | **Prototype deviation: the "Ambit is on your home screen" confirmation shows on `appinstalled` (Chromium) or on the *first standalone launch* (iOS) — never after "Got it".** | Safari gives no install signal; showing the confirmation after reading instructions would be a lie. The first `display-mode: standalone` launch is the honest moment, and iOS readers still get the designed one. Recorded as a deviation in a code comment. |
| 10 | **SW strategy is hand-written** (`src/lib/sw-rules.ts` + `sw.ts`), not `defaultCache`: `/api/auth/*` and `/api/trpc/*` **NetworkOnly**; `/api/img/*` **CacheFirst** (150 entries, 7 d); the `/feed` **document** NetworkFirst (never a redirected response); `/_next/static/*` CacheFirst; `/landing/*` + icons StaleWhileRevalidate; everything else straight to the network. | BUILD_PLAN's "deliberate strategy, not `defaultCache`". `/feed` is an RSC page with the first feed page dehydrated into the HTML, so caching the *document* gives "last cached feed" without caching a single tRPC response. |
| 11 | **`start_url: "/feed"`.** | `/feed` bounces signed-out readers to `/` server-side, so the landing still works; signed-in + offline gets the cached document instead of the `~offline` fallback. |
| 12 | **Sign-out purges the pages cache** (`caches.delete("ambit-pages")`, best-effort). | A cached personalized `/feed` must not survive the account that produced it on a shared device. |
| 13 | **Offline verification is manual against a production build** (`bun run preview`), plus unit tests on the pure matchers. | The SW is production-only by policy; Playwright runs against the dev server. Same approach Phase 1 took for installability. |
| 14 | **`package.json` → `0.5.0`.** Phase 5 complete. `e2e/settings.spec.ts:220` and `settings-screen.test.tsx:106,190` assert the footer string — update to `v0.5`. | Minor bump per phase, as 5.10 did. |

## 3. Files

### One-time asset fetch (first)

```sh
mkdir -p public/landing && cd public/landing
B="https://commons.wikimedia.org/wiki/Special:FilePath"
UA="Ambit/0.5 (benjamin.reilly@gmail.com)"
curl -sL -A "$UA" -o great-wave.jpg              "$B/Great%20Wave%20off%20Kanagawa2.jpg?width=900"
curl -sL -A "$UA" -o pillars-of-creation.jpg     "$B/Pillars%20of%20Creation.jpg?width=900"
curl -sL -A "$UA" -o rain-steam-and-speed.jpg    "$B/Rain%20Steam%20and%20Speed%20the%20Great%20Western%20Railway.jpg?width=900"
curl -sL -A "$UA" -o vanderbilt-cup-1908.jpg     "$B/Vanderbilt%20Cup%201908.jpg?width=900"
curl -sL -A "$UA" -o hubble-ultra-deep-field.jpg "$B/Hubble%20ultra%20deep%20field%20high%20rez%20edit1.jpg?width=900"
curl -sL -A "$UA" -o wheatfield-with-crows.jpg   "$B/Vincent%20van%20Gogh%20-%20Wheatfield%20with%20crows%20-%20Google%20Art%20Project.jpg?width=900"
curl -sL -A "$UA" -o haeckel-discomedusae.jpg    "$B/Haeckel%20Discomedusae%2088.jpg?width=900"
curl -sL -A "$UA" -o the-milkmaid.jpg            "$B/Johannes%20Vermeer%20-%20Het%20melkmeisje%20-%20Google%20Art%20Project.jpg?width=900"
file *.jpg   # every line must say "JPEG image data" — a Commons rate-limit page saves as HTML
```
Haeckel is 534 KB; recompress it to ≤300 KB: `sips -s format jpeg -s formatOptions 72 haeckel-discomedusae.jpg --out haeckel-discomedusae.jpg`. Commit the files.

### New files

| File | Responsibility |
|---|---|
| `src/components/landing/landing-slides.ts` | The slide list + the pure pacing/shuffle helpers (`SLIDE_MS`, `SLIDES_PER_RUN`, `END_TO_SHEET_MS`, `fadeMs`, `shuffle`, `pickRun`, `preloadRun`). |
| `src/components/landing/landing-slides.test.ts` | Pure tests. |
| `src/components/landing/use-slideshow.ts` | The cycle as a hook: index, stop-on-last → `onDone`, `skip`, `restart`. |
| `src/components/landing/use-slideshow.test.tsx` | Fake-timer tests. |
| `src/components/landing/landing-slideshow.tsx` | Presentational: the stacked `<img>` layers + gradient scrim. |
| `src/components/landing/auth-sheet.tsx` | The persistent bottom panel: scrim, logo-circle collapse button, hero copy, `children`. |
| `src/components/landing/landing-screen.tsx` | Client orchestrator for `/` and `/reset-password`: picks the run, owns `open`, renders slideshow + glyph + sheet. |
| `src/components/landing/landing-screen.test.tsx` | jsdom tests (glyph opens, tap skips, static mode, reduced motion). |
| `src/lib/install-store.ts` | `beforeinstallprompt`/`appinstalled` capture (module store + `useInstall()`), `isStandalone()`, and the persisted eligibility state (`readInstallState`, `recordFeedVisit`, `bannerEligible`, `snooze`, `dismissForever`, `markConfirmed`). |
| `src/lib/install-store.test.ts` | Pure-state tests + store tests with a stubbed `window`. |
| `src/components/install/install-listener.tsx` | Zero-render client component mounted by `layout.tsx` so the store's listeners attach on every page. |
| `src/components/install/install-sheet.tsx` | **Moved** from `components/settings/` (git mv; imports updated; content unchanged). |
| `src/components/install/install-banner.tsx` | The collapsed "Keep Ambit close" card. |
| `src/components/install/install-confirmation.tsx` | The full-screen "Ambit is on your home screen" overlay with the `pop-in` check. |
| `src/components/install/install-flow.tsx` | The `hidden \| banner \| sheet \| done` state machine the feed mounts. |
| `src/components/install/install-flow.test.tsx` | jsdom tests over the machine with stubbed store/state. |
| `src/lib/sw-rules.ts` | Pure route matchers + cache names for the worker (**no `serwist` import** — testable in node). |
| `src/lib/sw-rules.test.ts` | Matcher tests. |

### Modified files

| File | Change |
|---|---|
| `src/app/page.tsx` | Keep the session redirect; render `<LandingScreen mode="cycle"><AuthCard /></LandingScreen>`. Hero markup and `Rise` wrappers go (the hero now lives in the sheet). |
| `src/app/reset-password/page.tsx` | `<LandingScreen mode="static">` around the existing card / expired-link block. |
| `src/components/landing/landing-shell.tsx` | **Delete.** |
| `src/styles/globals.css:133, :258-268` | Delete `--animate-drift` and `@keyframes drift`. |
| `src/app/layout.tsx` | Mount `<InstallListener />` as the first child of `<body>` in **both** branches. |
| `src/app/manifest.ts` | `start_url: "/feed"` with the Decision 11 comment. |
| `src/app/sw.ts` | `runtimeCaching` built from `sw-rules.ts` (§5 Task 8); `defaultCache` import removed; comments updated. |
| `src/components/feed/feed-screen.tsx` | Mount `<InstallFlow />` next to the sheets (after `ItemSheet`, before `Toast`). |
| `src/components/settings/settings-screen.tsx:36, :203-207, :336-346` | Import path for `InstallSheet`; the row's behaviour per Decision 8; sign-out purge per Decision 12. |
| `src/components/settings/settings-screen.test.tsx:106, :190` | `v0.4` → `v0.5`; the install row's three states (§6.1). |
| `e2e/support.ts` | `openAuthSheet(page)`; `signIn()` calls it. |
| `e2e/auth.spec.ts:55-63, :76-84, :134-138, :146-150` | `await openAuthSheet(page)` replaces `waitForHydration(page)` at each site. |
| `e2e/home.spec.ts` | Two landing tests added. |
| `e2e/feed.spec.ts` | Two install-banner tests appended to the serial block. |
| `e2e/settings.spec.ts:220` | `v0.4` → `v0.5`. |
| `package.json` | `"version": "0.5.0"`. |
| `SPEC.md` §8.1 `/`, §8.2 `InstallPrompt.tsx`, §8.3 | See §9. |
| `docs/BUILD_PLAN.md:255`, `CLAUDE.md` status paragraph, `log.md` | See §9. |

## 4. UI spec (distilled from the two prototypes — do not open them during execution)

Tokens: `bg-app` `#0C0B09` (the slideshow's ground), `surface` `#1B1815` (the sheet), `ink-hi`,
`ink/60`, `accent`. All are existing `globals.css` tokens (verified: `--color-bg-app`,
`--color-surface`).

### `/` — cycle mode

Layers, bottom to top, all `fixed inset-0` inside a `relative min-h-dvh overflow-hidden` root:

1. **Slideshow** — `bg-bg-app`. One absolutely-positioned `<img>` per slide in the run:
   `absolute inset-0 size-full object-cover`, `alt=""`, `aria-hidden`, `decoding="async"`,
   inline `style={{ opacity: i === index ? 1 : 0, transition: \`opacity ${fade}ms ease\`,
   filter: "saturate(0.72) contrast(1.06)" }}`. Over the images one gradient div:
   `linear-gradient(180deg, rgba(12,11,9,.62) 0%, rgba(12,11,9,.3) 30%, rgba(12,11,9,.55) 66%, rgba(12,11,9,.85) 100%)`.
   The whole layer is a `div onClick={skip}` (not a button — the glyph is the accessible
   control; two buttons named "Open sign-in" would break `getByRole` strict mode).
2. **Floating glyph** — shown only while the sheet is closed:
   `<button type="button" aria-label="Open sign-in">` at `fixed left-1/2 bottom-[28px]
   -translate-x-1/2 z-20 size-[54px] rounded-full` with
   `bg-[rgba(27,24,21,0.72)] backdrop-blur-[14px] border border-ink/14
   shadow-[0_10px_30px_rgba(0,0,0,0.4)]`, containing `<Logo size={30} className="text-accent" />`.
3. **Scrim** — `fixed inset-0 z-30 bg-[rgba(9,8,6,0.35)] transition-opacity duration-[400ms]`,
   `opacity-0 pointer-events-none` when closed. Non-interactive (the prototype's scrim has no
   handler; collapse is the logo circle only).
4. **`AuthSheet` panel** — `fixed inset-x-0 bottom-0 z-40 bg-surface rounded-t-[28px]
   border-t border-ink/10 shadow-[0_-20px_60px_rgba(0,0,0,0.45)] px-[26px] pt-[14px]
   pb-[calc(36px+env(safe-area-inset-bottom))] max-h-[88dvh] overflow-y-auto
   transition-transform duration-[550ms] ease-[cubic-bezier(.2,.9,.25,1)]`, toggling
   `translate-y-full` / `translate-y-0`. **Always mounted** — the form inside is in the DOM
   from first paint, which is what `waitForHydration(page, "form")` relies on.
   Contents, top to bottom:
   - Centered logo circle `size-[54px] rounded-full bg-ink/6 border border-ink/12 mb-5`
     with `<Logo size={30} className="text-accent" />`. In cycle mode it is a
     `<button type="button" aria-label="Back to the slideshow">` (collapse); in static mode a
     plain `div`.
   - Headline `text-ink-hi text-[16px] leading-[1.2] tracking-[0.1px] whitespace-nowrap`:
     **A quieter way to be curious.**
   - Subhead `text-ink/60 text-[14.5px] leading-[1.55] mt-[10px] max-w-[320px]`:
     **No feeds engineered to keep you. Ambit hands you one interesting thing at a time, then
     quietly steps back.**
   - Wordmark `text-ink-hi text-[16px] tracking-[0.1px] mt-[14px]`: **Ambit**
   - `mt-[26px]` then `children` — `<AuthCard />` exactly as it renders today.

Behaviour: on mount the run is picked and preloaded; the cycle starts when the first slide has
decoded (or after 1500 ms, whichever first). Index advances every 600 ms; on the last slide the
cycle stops, and 260 ms later `open` flips true. Tap on the slideshow or the glyph → `open`
immediately (cycle stopped). Logo circle → `open=false`, cycle restarts from slide 0 of the same
run (prototype behaviour). Reduced motion → behaves as static mode.

### `/reset-password` — static mode

Same layers; `run` is a single slide (rng pick); `open` is true from the first client render;
no glyph; the logo circle is decorative. `children` is the existing `ResetPasswordCard` or the
expired-link block, unchanged.

### Install flow (feed)

- **Banner** (`data-testid="install-banner"`): `fixed inset-x-[14px] bottom-[96px] z-20`
  (clears the pill, which sits at `bottom-[26px]` — verified `pill-toolbar.tsx:107`) —
  `rounded-[20px] bg-surface border border-ink/10 shadow-[0_10px_30px_rgba(0,0,0,0.4)]
  px-4 py-[14px] flex items-center gap-3 animate-rise`. Left: app-icon tile
  (`<img src="/icon-192.png" alt="" className="size-10 rounded-[10px]" />`). Middle:
  **Keep Ambit close** (`text-ink-hi text-[14.5px] font-semibold`) over
  **Add it to your home screen — opens full-screen, works offline.**
  (`text-ink/55 text-[12.5px] leading-[1.45]`). Right: `<Button size="sm" shape="pill">Add</Button>`
  and `<IconButton aria-label="Not now"><Close size={14} /></IconButton>`.
- **Sheet**: the moved `InstallSheet`, unchanged (title "Add to home screen"). Closing it —
  scrim, Escape — snoozes.
- **Confirmation** (`data-testid="install-done"`): `fixed inset-0 z-50 bg-bg/85 backdrop-blur-[6px]
  flex flex-col items-center justify-center px-8 text-center`. A `size-[72px] rounded-full
  bg-accent text-on-accent flex items-center justify-center animate-pop-in` with
  `<Check size={34} />`; `mt-6` headline **Ambit is on your home screen**
  (`text-ink-hi text-[22px] font-semibold tracking-[-0.2px]`); `mt-2` body **Open it anytime
  for one interesting thing — no browser, no noise.** (`text-ink/60 text-[14.5px]
  leading-[1.55] max-w-[300px]`); `mt-7` `<Button shape="rounded" size="lg">Start exploring</Button>`.

### Settings row — "Add to home screen" (`settings-screen.tsx:203-207`)

- Running standalone → `value="Installed"`, no `action`, no `onClick`.
- `canPrompt` → `action="Install"`, `onClick` calls `prompt()`; on `"accepted"` nothing more
  (the `appinstalled` listener flips `installed`, and `InstallFlow` on the feed owns the
  confirmation).
- Otherwise → `action="Install"`, opens the sheet (today's behaviour).

## 5. Implementation order

Comment generously throughout, in the repo's explanatory house style (why, not what). Commit at
the end of every task; run the named test command before each commit.

### Task 1 — Slides + pure helpers

**Files:** `public/landing/*.jpg` (§3 fetch), create `src/components/landing/landing-slides.ts`,
`landing-slides.test.ts`.

```ts
// landing-slides.ts
export interface LandingSlide {
  /** Path under public/ — served same-origin, cached by the SW's static rule. */
  src: string;
  /** Attribution kept next to the file it credits. Not rendered; the list is the record. */
  credit: string;
}

export const LANDING_SLIDES: readonly LandingSlide[] = [
  { src: "/landing/great-wave.jpg", credit: "Hokusai, The Great Wave off Kanagawa (c. 1831) — public domain, via Wikimedia Commons" },
  { src: "/landing/pillars-of-creation.jpg", credit: "NASA/ESA, Pillars of Creation (Hubble, 1995) — public domain, via Wikimedia Commons" },
  { src: "/landing/rain-steam-and-speed.jpg", credit: "J. M. W. Turner, Rain, Steam and Speed (1844) — public domain, via Wikimedia Commons" },
  { src: "/landing/vanderbilt-cup-1908.jpg", credit: "Vanderbilt Cup, 1908 (photograph) — public domain, via Wikimedia Commons" },
  { src: "/landing/hubble-ultra-deep-field.jpg", credit: "NASA/ESA, Hubble Ultra-Deep Field (2004) — public domain, via Wikimedia Commons" },
  { src: "/landing/wheatfield-with-crows.jpg", credit: "Vincent van Gogh, Wheatfield with Crows (1890) — public domain, via Wikimedia Commons" },
  { src: "/landing/haeckel-discomedusae.jpg", credit: "Ernst Haeckel, Discomedusae, Kunstformen der Natur pl. 88 (1904) — public domain, via Wikimedia Commons" },
  { src: "/landing/the-milkmaid.jpg", credit: "Johannes Vermeer, The Milkmaid (c. 1658) — public domain, via Wikimedia Commons" },
  // Ben-cleared images go here, one line each (plan §Prerequisites 1).
];

/** Cadence per slide. Ben's call at plan time: "faster, ~5 s" → 8 × 600 ms. */
export const SLIDE_MS = 600;
/** A run is a random subset, so the sequence stays ~5 s however long LANDING_SLIDES grows. */
export const SLIDES_PER_RUN = 8;
/** Prototype: the sheet rises this long after the last slide lands. */
export const END_TO_SHEET_MS = 260;
/** Cap the first-slide wait so a slow network can't hold the screen black indefinitely. */
export const FIRST_SLIDE_TIMEOUT_MS = 1500;

/** README formula: fade = min(520, slideMs × 0.55). */
export function fadeMs(slideMs: number): number {
  return Math.min(520, Math.round(slideMs * 0.55));
}

/** Fisher–Yates. `rng` is injectable so tests are deterministic. Returns a copy. */
export function shuffle<T>(list: readonly T[], rng: () => number = Math.random): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function pickRun(
  list: readonly LandingSlide[] = LANDING_SLIDES,
  rng: () => number = Math.random,
  size = SLIDES_PER_RUN,
): LandingSlide[] {
  return shuffle(list, rng).slice(0, size);
}

/**
 * Warms every slide's bytes into the browser cache and resolves when the FIRST has decoded
 * (or the timeout passes) — the cycle starts then, so slide 0 is never a blank frame while
 * the rest keep loading behind it. Client-only: `Image` doesn't exist on the server.
 */
export function preloadRun(run: readonly LandingSlide[], timeoutMs = FIRST_SLIDE_TIMEOUT_MS): Promise<void> {
  if (run.length === 0) return Promise.resolve();
  const images = run.map((s) => { const img = new Image(); img.src = s.src; return img; });
  const first = images[0]!.decode().catch(() => undefined);
  const cap = new Promise<void>((r) => setTimeout(r, timeoutMs));
  return Promise.race([first, cap]).then(() => undefined);
}
```

Tests (`landing-slides.test.ts`, node env): `fadeMs(600) === 330`, `fadeMs(1200) === 520`;
`shuffle` with `rng = () => 0` returns a rotation, never mutates the input, same multiset;
`pickRun` returns `SLIDES_PER_RUN` distinct entries from a 12-item list and the whole list
when it's shorter; `LANDING_SLIDES` has ≥ 8 entries, every `src` starts with `/landing/`, and
no `src` contains `uploads/` (the licensing gate, as a test).

Run: `bun run test -- landing-slides`. Commit: `feat(landing): slide list + pacing helpers`.

### Task 2 — `useSlideshow`

**Files:** create `src/components/landing/use-slideshow.ts`, `use-slideshow.test.tsx`.

```ts
"use client";
import * as React from "react";
import { END_TO_SHEET_MS } from "./landing-slides";

export interface SlideshowOptions {
  /** Slides in the run. 0 → nothing ever happens. */
  count: number;
  slideMs: number;
  /** false until the first slide has decoded (see preloadRun); the cycle waits. */
  enabled: boolean;
  endDelayMs?: number;
  /** Fires once per run: on the last slide + endDelay, or on skip(). */
  onDone: () => void;
}

export interface Slideshow {
  index: number;
  running: boolean;
  skip: () => void;
  restart: () => void;
}

export function useSlideshow({ count, slideMs, enabled, endDelayMs = END_TO_SHEET_MS, onDone }: SlideshowOptions): Slideshow {
  const [index, setIndex] = React.useState(0);
  const [running, setRunning] = React.useState(true);
  // `runningRef` mirrors `running` so skip() can be idempotent without putting a side effect
  // inside a state updater (StrictMode runs updaters twice; onDone must fire exactly once).
  const runningRef = React.useRef(true);
  // Latest-callback ref: the effect below must not restart the cycle just because the parent
  // re-rendered with a new onDone identity.
  const onDoneRef = React.useRef(onDone);
  onDoneRef.current = onDone;

  const finish = React.useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    setRunning(false);
    onDoneRef.current();
  }, []);

  React.useEffect(() => {
    if (!enabled || !running || count === 0) return;
    if (index >= count - 1) {
      const t = setTimeout(finish, endDelayMs);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setIndex((i) => i + 1), slideMs);
    return () => clearTimeout(t);
  }, [enabled, running, count, index, slideMs, endDelayMs, finish]);

  const skip = finish;
  const restart = React.useCallback(() => {
    runningRef.current = true;
    setIndex(0);
    setRunning(true);
  }, []);

  return { index, running, skip, restart };
}
```

Tests (`// @vitest-environment jsdom`, `renderHook` + `act` from `@testing-library/react`,
`vi.useFakeTimers()`): (1) with `count: 3, slideMs: 600, enabled: true` the index is 0, then
1 after 600 ms, 2 after 1200 ms; `onDone` not yet called; called exactly once 260 ms later;
`running` false. (2) `enabled: false` → index stays 0 after 5 s; flipping `enabled` true via
`rerender` starts it. (3) `skip()` at index 1 → `onDone` once, synchronously; advancing 5 s
calls nothing further and index stays 1. (4) `skip()` twice → still once. (5) `restart()`
after done → index 0, running true, and the cycle completes again (second `onDone`).
(6) `count: 0` → no timers, no `onDone`.

Run: `bun run test -- use-slideshow`. Commit: `feat(landing): useSlideshow hook`.

### Task 3 — `LandingSlideshow`, `AuthSheet`, `LandingScreen`; wire `/` and `/reset-password`

**Files:** create `landing-slideshow.tsx`, `auth-sheet.tsx`, `landing-screen.tsx`,
`landing-screen.test.tsx`; modify `src/app/page.tsx`, `src/app/reset-password/page.tsx`;
delete `landing-shell.tsx`; edit `globals.css` (drift).

`landing-slideshow.tsx` (client) — props `{ run: readonly LandingSlide[]; index: number;
fade: number; onTap?: () => void }`; renders layer 1 of §4 exactly.

`auth-sheet.tsx` (client) — props `{ open: boolean; onCollapse?: () => void; children }`;
renders layers 3 + 4 of §4. `onCollapse` undefined → the logo circle is a `div`.

`landing-screen.tsx` (client):

```tsx
"use client";
import * as React from "react";
import { Logo } from "~/components/icons";
import { AuthSheet } from "./auth-sheet";
import { LandingSlideshow } from "./landing-slideshow";
import { fadeMs, pickRun, preloadRun, SLIDE_MS, type LandingSlide } from "./landing-slides";
import { useSlideshow } from "./use-slideshow";

export interface LandingScreenProps {
  /** "cycle" for `/`; "static" for `/reset-password` (one slide, sheet open, no glyph). */
  mode: "cycle" | "static";
  children: React.ReactNode;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LandingScreen({ mode, children }: LandingScreenProps) {
  // The run is random, so it cannot be chosen during render: the server would pick one order and
  // the client another, and React would flag the mismatch. The first client render paints only
  // the dark ground; the run lands in an effect a frame later.
  const [run, setRun] = React.useState<LandingSlide[]>([]);
  const [ready, setReady] = React.useState(false);
  const [isStatic, setIsStatic] = React.useState(mode === "static");
  const [open, setOpen] = React.useState(mode === "static");

  React.useEffect(() => {
    const reduced = prefersReducedMotion();
    const staticMode = mode === "static" || reduced;
    const picked = pickRun(undefined, Math.random, staticMode ? 1 : undefined);
    setRun(picked);
    setIsStatic(staticMode);
    if (staticMode) setOpen(true);
    let cancelled = false;
    void preloadRun(picked).then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [mode]);

  const show = useSlideshow({
    count: isStatic ? 0 : run.length,
    slideMs: SLIDE_MS,
    enabled: ready,
    onDone: () => setOpen(true),
  });

  const collapse = isStatic ? undefined : () => { setOpen(false); show.restart(); };

  return (
    <div className="bg-bg-app relative min-h-dvh overflow-hidden">
      <LandingSlideshow run={run} index={show.index} fade={fadeMs(SLIDE_MS)} onTap={isStatic ? undefined : show.skip} />
      {!isStatic && !open ? (
        <button type="button" aria-label="Open sign-in" onClick={show.skip} className="…§4 layer 2…">
          <Logo size={30} className="text-accent" />
        </button>
      ) : null}
      <AuthSheet open={open} onCollapse={collapse}>{children}</AuthSheet>
    </div>
  );
}
```

`page.tsx` keeps its session redirect and returns
`<LandingScreen mode="cycle"><AuthCard /></LandingScreen>`; the header comment gains a line on
why the hero moved into the sheet (Decision 5). `reset-password/page.tsx` wraps its existing
card/expired block in `<LandingScreen mode="static">`. Delete `landing-shell.tsx`; remove
`--animate-drift` and `@keyframes drift` from `globals.css` (the comment on `:133` goes too).
`bun run typecheck` must be clean — nothing else imported `LandingShell` (verified).

Tests (`landing-screen.test.tsx`, jsdom; stub `window.matchMedia` per test; stub
`HTMLImageElement.prototype.decode` to resolve; fake timers): (1) cycle mode: first render
has no `<img>`; after effects + `decode`, 8 `<img>` layers render, the glyph
`getByRole("button", { name: "Open sign-in" })` is present, and the form (`children` =
`<form data-testid="child" />`) is in the DOM inside a `translate-y-full` panel.
(2) clicking the glyph → panel has `translate-y-0`, glyph gone. (3) clicking the slideshow
layer (`getByTestId("landing-slideshow")`) does the same. (4) after
`8 × 600 + 260` ms of fake time the panel opens by itself. (5) the collapse button
(`"Back to the slideshow"`) closes it and the glyph returns. (6) static mode: exactly one
`<img>`, open from first effect, no glyph, no collapse button. (7) reduced motion in cycle
mode behaves as (6).

Run: `bun run test -- landing`, `bun run typecheck`. Commit:
`feat(landing): Landing 2 — slideshow that resolves into the auth sheet`.

### Task 4 — e2e retarget for the sheet

**Files:** `e2e/support.ts`, `e2e/auth.spec.ts`, `e2e/home.spec.ts`.

```ts
// support.ts — add; signIn() calls this instead of waitForHydration(page).
/**
 * The landing (5.11) runs a ~5 s slideshow before the sign-in sheet rises on its own. The sheet
 * is in the DOM from first paint but translated off-screen, so a click on anything inside it
 * fails actionability until it's up. The glyph is the reader's own skip — tests take the same
 * path rather than waiting the slideshow out.
 */
export async function openAuthSheet(page: Page) {
  await waitForHydration(page);
  const glyph = page.getByRole("button", { name: "Open sign-in" });
  // The sheet may already have risen (slow machine, or a second call) — then there is no glyph.
  if (await glyph.isVisible()) await glyph.click();
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({ timeout: 15_000 });
}
```

`auth.spec.ts`: at each of the four sites replace `await waitForHydration(page);` with
`await openAuthSheet(page);` (import it; drop the `waitForHydration` import if unused).

`home.spec.ts` — keep the console-errors test; add:
```ts
test("the slideshow resolves into the sign-in sheet on its own", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({ timeout: 15_000 });
});
test("the glyph opens the sign-in sheet early", async ({ page }) => {
  await page.goto("/");
  await openAuthSheet(page);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeInViewport();
});
```

Run: `bun run e2e -- home.spec.ts auth.spec.ts` (dev server on 3000, Mailpit on 8025 as the
auth spec already needs). Commit: `test(e2e): landing sheet — openAuthSheet helper`.

### Task 5 — `install-store.ts`

**Files:** create `src/lib/install-store.ts`, `install-store.test.ts`;
`src/components/install/install-listener.tsx`; modify `src/app/layout.tsx`.

```ts
"use client";
import * as React from "react";

// ---- persisted eligibility state (pure; every function returns a new object) ----
export interface InstallState {
  v: 1;
  feedVisits: number;
  lastVisitAt: number;
  snoozedUntil?: number;
  dismissed?: boolean;
  /** The "on your home screen" confirmation has been shown once. */
  confirmed?: boolean;
}
export const INSTALL_KEY = "ambit.install.v1";
export const VISIT_GAP_MS = 6 * 60 * 60 * 1000;
export const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_VISITS = 2;
const EMPTY: InstallState = { v: 1, feedVisits: 0, lastVisitAt: 0 };

export function readInstallState(): InstallState {
  try {
    const raw = localStorage.getItem(INSTALL_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || (parsed as { v?: unknown }).v !== 1) return EMPTY;
    return { ...EMPTY, ...(parsed as Partial<InstallState>), v: 1 };
  } catch { return EMPTY; }
}
export function writeInstallState(state: InstallState): void {
  try { localStorage.setItem(INSTALL_KEY, JSON.stringify(state)); } catch { /* Lockdown mode etc. */ }
}
export function recordFeedVisit(state: InstallState, now: number): InstallState {
  if (now - state.lastVisitAt < VISIT_GAP_MS) return state;
  return { ...state, feedVisits: state.feedVisits + 1, lastVisitAt: now };
}
export function bannerEligible(state: InstallState, now: number, standalone: boolean): boolean {
  if (standalone || state.dismissed) return false;
  if (state.snoozedUntil !== undefined && state.snoozedUntil > now) return false;
  return state.feedVisits >= MIN_VISITS;
}
export function snooze(state: InstallState, now: number): InstallState { return { ...state, snoozedUntil: now + SNOOZE_MS }; }
export function dismissForever(state: InstallState): InstallState { return { ...state, dismissed: true }; }
export function markConfirmed(state: InstallState): InstallState { return { ...state, confirmed: true }; }

// ---- display mode ----
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// ---- the prompt event store (module-level: the event fires once per page load, possibly
//      before any component that wants it has mounted) ----
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export interface InstallSnapshot { canPrompt: boolean; installed: boolean }
export type PromptResult = "accepted" | "dismissed" | "unavailable";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let snapshot: InstallSnapshot = { canPrompt: false, installed: false };
let attached = false;
const listeners = new Set<() => void>();
function emit() {
  snapshot = { canPrompt: deferred !== null, installed };
  for (const l of listeners) l();
}
export function attachInstallListeners(target: Window = window): void {
  if (attached) return;
  attached = true;
  target.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // suppress Chrome's own mini-infobar; we show the designed banner
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  target.addEventListener("appinstalled", () => { installed = true; deferred = null; emit(); });
}
/** Test seam — resets module state. */
export function resetInstallStoreForTests(): void { deferred = null; installed = false; attached = false; emit(); }
const SERVER_SNAPSHOT: InstallSnapshot = { canPrompt: false, installed: false };

export function useInstall(): InstallSnapshot & { prompt: () => Promise<PromptResult> } {
  const snap = React.useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => snapshot,
    () => SERVER_SNAPSHOT,
  );
  const prompt = React.useCallback(async (): Promise<PromptResult> => {
    const ev = deferred;
    if (!ev) return "unavailable";
    deferred = null; // the event is single-use
    emit();
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    return outcome;
  }, []);
  return { ...snap, prompt };
}
```

`install-listener.tsx`:
```tsx
"use client";
import * as React from "react";
import { attachInstallListeners } from "~/lib/install-store";
/** Renders nothing; exists so the listeners attach on every page, not only where a banner lives. */
export function InstallListener() {
  React.useEffect(() => { attachInstallListeners(); }, []);
  return null;
}
```
Mount `<InstallListener />` as the first child of `<body>` in both branches of `layout.tsx`.

Tests (node env for the pure part; jsdom describe for the store): `recordFeedVisit` counts once
per 6 h window; `bannerEligible` false on visit 1, true on visit 2, false when snoozed/dismissed/
standalone, true again once the snooze expires; `readInstallState` tolerates missing key, bad
JSON, wrong `v`; store: dispatch a fake `beforeinstallprompt` (an `Event` with `prompt` +
`userChoice` attached) → `useInstall().canPrompt` true; `prompt()` resolves `"accepted"` and
`canPrompt` falls back to false; `appinstalled` → `installed` true; no event → `"unavailable"`.

Run: `bun run test -- install-store`. Commit: `feat(install): prompt store + eligibility state`.

### Task 6 — Install UI: move the sheet, banner, confirmation, flow; mount in the feed

**Files:** `git mv src/components/settings/install-sheet.tsx src/components/install/install-sheet.tsx`
(update the import in `settings-screen.tsx:36`); create `install-banner.tsx`,
`install-confirmation.tsx`, `install-flow.tsx`, `install-flow.test.tsx`; modify
`feed-screen.tsx`.

`install-banner.tsx` — props `{ onAdd: () => void; onDismiss: () => void }`, §4 markup.
`install-confirmation.tsx` — props `{ onDone: () => void }`, §4 markup.

`install-flow.tsx`:
```tsx
"use client";
import * as React from "react";
import {
  bannerEligible, dismissForever, isStandalone, markConfirmed, readInstallState,
  recordFeedVisit, snooze, useInstall, writeInstallState,
} from "~/lib/install-store";
import { InstallBanner } from "./install-banner";
import { InstallConfirmation } from "./install-confirmation";
import { InstallSheet } from "./install-sheet";

type Stage = "hidden" | "banner" | "sheet" | "done";

// Prototype deviation (Decision 9): "Got it" on the instruction sheet does NOT reach "done" —
// on iOS nothing tells the page whether the reader actually installed. "done" is reached from
// `appinstalled` (Chromium) or on the first launch in standalone mode (everyone), once.
export function InstallFlow({ now = () => Date.now() }: { now?: () => number }) {
  const [stage, setStage] = React.useState<Stage>("hidden");
  const install = useInstall();

  React.useEffect(() => {
    const t = now();
    const standalone = isStandalone();
    let state = recordFeedVisit(readInstallState(), t);
    if (standalone && !state.confirmed) {
      state = markConfirmed(state);
      setStage("done");
    } else if (bannerEligible(state, t, standalone)) {
      setStage("banner");
    }
    writeInstallState(state);
    // Mount-only by design: eligibility is a per-visit question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!install.installed) return;
    writeInstallState(markConfirmed(readInstallState()));
    setStage("done");
  }, [install.installed]);

  const onAdd = async () => {
    if (!install.canPrompt) { setStage("sheet"); return; }
    const outcome = await install.prompt();
    if (outcome === "dismissed") { writeInstallState(snooze(readInstallState(), now())); setStage("hidden"); }
    // "accepted" → appinstalled → the effect above; "unavailable" can't happen once canPrompt was true.
  };
  const onSnooze = () => { writeInstallState(snooze(readInstallState(), now())); setStage("hidden"); };
  const onDismiss = () => { writeInstallState(dismissForever(readInstallState())); setStage("hidden"); };

  return (
    <>
      {stage === "banner" ? <InstallBanner onAdd={() => void onAdd()} onDismiss={onDismiss} /> : null}
      <InstallSheet open={stage === "sheet"} onClose={onSnooze} />
      {stage === "done" ? <InstallConfirmation onDone={() => setStage("hidden")} /> : null}
    </>
  );
}
```
Mount `<InstallFlow />` in `feed-screen.tsx` after `<ItemSheet …/>` and before `<Toast …/>`.

Tests (`install-flow.test.tsx`, jsdom; `vi.mock("~/lib/install-store")` keeping the pure
functions real via `importOriginal` and stubbing `isStandalone` + `useInstall`; seed
`localStorage` per test; `now` injected): (1) fresh state → nothing rendered, `feedVisits`
becomes 1. (2) `feedVisits: 1, lastVisitAt: now − 7 h` → banner visible, `feedVisits` 2.
(3) same but `lastVisitAt: now − 1 h` → no banner (not a new visit). (4) banner "Not now" →
hidden, `dismissed: true`. (5) banner "Add" with `canPrompt: false` → the sheet title
"Add to home screen" renders; closing it → `snoozedUntil ≈ now + 30 d`. (6) "Add" with
`canPrompt: true` and `prompt` resolving `"dismissed"` → snoozed, hidden. (7) `useInstall`
returning `installed: true` → confirmation with `getByTestId("install-done")`, `confirmed: true`;
"Start exploring" hides it. (8) `isStandalone: true` with `confirmed` unset → confirmation on
mount; with `confirmed: true` → nothing; and a standalone reader is never shown the banner.

Run: `bun run test -- install`, `bun run typecheck`. Commit:
`feat(install): banner → prompt/instructions → confirmation, mounted on the feed`.

### Task 7 — Settings row + sign-out purge; version bump

**Files:** `settings-screen.tsx`, `settings-screen.test.tsx`, `package.json`, `e2e/settings.spec.ts:220`.

Row (replaces `:203-207`):
```tsx
<SettingsRow
  icon={<Download size={17} />}
  label="Add to home screen"
  value={standalone ? "Installed" : undefined}
  action={standalone ? undefined : "Install"}
  onClick={standalone ? undefined : install.canPrompt ? () => void install.prompt() : () => setOpenSheet("install")}
/>
```
where `const install = useInstall();` and `standalone` comes from a tiny
`useSyncExternalStore(() => () => {}, isStandalone, () => false)` in the screen (client-only
read, `false` on the server — same shape as `use-notification-permission.ts`).

`SignOutRow` (`:336-346`): before `authClient.signOut()`, `void purgePagesCache()` where
`purgePagesCache` lives in `sw-rules.ts` (Task 8) as
`export async function purgePagesCache() { try { if ("caches" in globalThis) await caches.delete(PAGES_CACHE); } catch {} }`.
(Task 8 creates the file; do Task 7's row first, then wire the purge after Task 8 if executing
strictly in order — or write the one-liner module first. Either is fine; both compile.)

`package.json` → `0.5.0`; `settings-screen.test.tsx:106,190` and `e2e/settings.spec.ts:220`
→ `v0.5`. Add three screen tests: standalone → row value "Installed" and no "Install" pill;
`canPrompt` → tapping the row calls `prompt`; neither → the sheet opens (existing behaviour).

Run: `bun run test -- settings`. Commit: `feat(settings): install row uses the real prompt; v0.5.0`.

### Task 8 — Service worker strategy

**Files:** create `src/lib/sw-rules.ts`, `sw-rules.test.ts`; modify `src/app/sw.ts`,
`src/app/manifest.ts`.

```ts
// sw-rules.ts — pure. No `serwist` import: this file is unit-tested in node and also imported
// by page code (purgePagesCache), and serwist's runtime assumes a worker global.
export const PAGES_CACHE = "ambit-pages";
export const IMAGES_CACHE = "ambit-images";
export const STATIC_CACHE = "ambit-static";
export const NEXT_STATIC_CACHE = "ambit-next-static";

/** The subset of Serwist's RouteMatchCallbackOptions these rules read. */
export interface MatchInput {
  url: URL;
  sameOrigin: boolean;
  request: { mode: RequestMode; destination: RequestDestination };
}

export const isAuthApi = ({ url, sameOrigin }: MatchInput) => sameOrigin && url.pathname.startsWith("/api/auth/");
export const isTrpc = ({ url, sameOrigin }: MatchInput) => sameOrigin && url.pathname.startsWith("/api/trpc/");
export const isImageProxy = ({ url, sameOrigin }: MatchInput) => sameOrigin && url.pathname.startsWith("/api/img/");
/** Only the feed document. `/` redirects when signed in and item pages are public and plentiful. */
export const isFeedDocument = ({ url, sameOrigin, request }: MatchInput) =>
  sameOrigin && request.mode === "navigate" && url.pathname === "/feed";
export const isNextStatic = ({ url, sameOrigin }: MatchInput) => sameOrigin && url.pathname.startsWith("/_next/static/");
export const isStaticAsset = ({ url, sameOrigin }: MatchInput) =>
  sameOrigin && (url.pathname.startsWith("/landing/") || /^\/icon-\d+(-maskable)?\.png$/.test(url.pathname));

/** Sign-out calls this from page context so a cached personalized /feed doesn't outlive its account. */
export async function purgePagesCache(): Promise<void> {
  try { if ("caches" in globalThis) await caches.delete(PAGES_CACHE); } catch { /* best effort */ }
}
```

`sw.ts` — replace the `defaultCache` import and the `runtimeCaching: defaultCache` line:
```ts
import { CacheFirst, CacheableResponsePlugin, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";
import { IMAGES_CACHE, isAuthApi, isFeedDocument, isImageProxy, isNextStatic, isStaticAsset, isTrpc, NEXT_STATIC_CACHE, PAGES_CACHE, STATIC_CACHE } from "~/lib/sw-rules";

const DAY = 24 * 60 * 60;
// Order matters: first match wins. Anything no rule matches goes straight to the network — which
// is the deliberate default here (RSC payload fetches, item pages, everything unlisted).
runtimeCaching: [
  { matcher: isAuthApi, handler: new NetworkOnly() },
  // Never cached, by design: every tRPC response is personalized, and a stale feed page is worse
  // than no feed page (BUILD_PLAN 5.11). defaultCache would have put these in an `apis` bucket.
  { matcher: isTrpc, handler: new NetworkOnly() },
  { matcher: isImageProxy, handler: new CacheFirst({ cacheName: IMAGES_CACHE, plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 7 * DAY, maxAgeFrom: "last-used" }),
  ] }) },
  // The feed *document* — the RSC HTML with the first page dehydrated into it. NetworkFirst with no
  // timeout: a live network always wins; the cache is only for genuinely offline. A redirected
  // response (signed-out → `/`) is never stored: it would be served back for a navigation whose
  // redirect mode forbids it, and it's the wrong page anyway.
  { matcher: isFeedDocument, handler: new NetworkFirst({ cacheName: PAGES_CACHE, plugins: [
      { cacheWillUpdate: async ({ response }) => (response.status === 200 && !response.redirected ? response : null) },
      new ExpirationPlugin({ maxEntries: 4 }),
  ] }) },
  { matcher: isNextStatic, handler: new CacheFirst({ cacheName: NEXT_STATIC_CACHE, plugins: [
      new ExpirationPlugin({ maxEntries: 96, maxAgeSeconds: 30 * DAY }),
  ] }) },
  { matcher: isStaticAsset, handler: new StaleWhileRevalidate({ cacheName: STATIC_CACHE, plugins: [
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 30 * DAY }),
  ] }) },
],
```
Keep `precacheEntries`, `skipWaiting`, `clientsClaim`, `navigationPreload`, `fallbacks`
as they are; rewrite the `runtimeCaching` comment block to describe the above (the old one
says "Phase 1 keeps the default"). `sw.ts` importing `~/lib/sw-rules` through the `~` alias:
the Serwist route compiles with esbuild via `useNativeEsbuild: true` — if the alias does not
resolve there, switch the import to the relative `../lib/sw-rules` and note it in the
walkthrough.

`manifest.ts`: `start_url: "/feed"` + a comment carrying Decision 11.

Tests (`sw-rules.test.ts`, node): a `mk(path, { mode, sameOrigin })` helper; `isTrpc` true for
`/api/trpc/feed.page?batch=1`, false for `/api/img/x`; `isImageProxy` true for `/api/img/abc`;
`isFeedDocument` true for `/feed` navigate, false for `/feed` non-navigate, `/feed/`, `/`,
`/i/abc`, and cross-origin; `isAuthApi`; `isNextStatic`; `isStaticAsset` for
`/landing/great-wave.jpg` and `/icon-192-maskable.png` but not `/favicon.ico`;
`purgePagesCache` resolves without a `caches` global and calls `caches.delete("ambit-pages")`
with a stubbed one. Cross-check: for a `/api/trpc/…` request **no** cache-writing matcher
returns true (the invariant, as a test).

Run: `bun run test -- sw-rules`, `bun run typecheck`, `bun run build` (the worker compiles
in the build). Commit: `feat(pwa): deliberate SW strategy — feed document + images cached, tRPC never`.

### Task 9 — e2e for the banner

**Files:** `e2e/feed.spec.ts` — append to the serial block (the user is signed in and on `/feed`):

```ts
test("install banner: second visit shows it, Add opens the instructions, X dismisses for good", async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem("ambit.install.v1", JSON.stringify({ v: 1, feedVisits: 1, lastVisitAt: Date.now() - 7 * 60 * 60 * 1000 })),
  );
  await page.reload();
  await waitForHydration(page, "main");
  const banner = page.getByTestId("install-banner");
  await expect(banner).toBeVisible({ timeout: 15_000 });
  // Headless Chromium never fires beforeinstallprompt, so Add takes the instruction path.
  await banner.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Add to home screen")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Add to home screen")).toBeHidden();
  // Closing the sheet snoozed; make the reader dismiss for good and prove it sticks.
  await page.evaluate(() =>
    localStorage.setItem("ambit.install.v1", JSON.stringify({ v: 1, feedVisits: 2, lastVisitAt: Date.now() })),
  );
  await page.reload();
  await waitForHydration(page, "main");
  await page.getByTestId("install-banner").getByRole("button", { name: "Not now" }).click();
  await expect(page.getByTestId("install-banner")).toHaveCount(0);
  await page.reload();
  await waitForHydration(page, "main");
  await expect(page.getByTestId("install-banner")).toHaveCount(0);
});
```

Run: `bun run e2e -- feed.spec.ts`. Commit: `test(e2e): install banner lifecycle`.

### Task 10 — Full verification + docs

`bun run check`; `bun run e2e` three consecutive runs (house convention; `gallery.spec:193`
is a known dev-DB flake — check `main` before believing it); `bun run build`; §8's manual
passes; then §9. Commit docs as `docs: 5.11 walkthrough, BUILD_PLAN tick, SPEC §8, log`.

## 6. Testing

### 6.1 Unit / component (vitest)

Listed per task above. Expected new tests ≈ 45: `landing-slides` (7), `use-slideshow` (6),
`landing-screen` (7), `install-store` (~12), `install-flow` (8), `settings-screen` (+3),
`sw-rules` (~10). Component tests carry `// @vitest-environment jsdom`; the pure ones stay in
the node default. `window.matchMedia` is not in jsdom — stub it per test:
`vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))`.
`HTMLImageElement.prototype.decode` likewise: `vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue()`.

### 6.2 E2E (Playwright, dev server)

`home.spec.ts` +2, `auth.spec.ts` retargeted through `openAuthSheet`, `feed.spec.ts` +1,
`settings.spec.ts` string bump. Six spec files still; no new file, no new user. 15 s allowances
on server-bound waits as before.

### 6.3 Manual — production build (the SW is production-only)

```sh
lsof -ti:3000 | xargs kill; bun run preview   # next build && next start on :3000
```
1. Chrome (desktop): sign in → `/feed` loads → DevTools › Application › Service Workers shows
   `/serwist/sw.js` **activated**; Cache Storage shows `ambit-pages` (1 entry: `/feed`),
   `ambit-images` (≈24 entries after one page), no `apis` bucket. Network › Offline → reload
   `/feed` → the page renders with its tiles and images (the last page); scrolling shows the
   loader or nothing, never a crash. Navigate to `/settings` offline → the `~offline` fallback.
   Back online → reload → fresh feed.
2. Chrome (desktop): `beforeinstallprompt` path — with the state seeded as in Task 9's test,
   the banner's **Add** opens Chrome's real install dialog; accepting shows the confirmation;
   the app opens in its own window; a second launch shows no confirmation and no banner.
   Sign out → `ambit-pages` is gone from Cache Storage.
3. iPhone over the tailnet (`https://macbook-air-m5.halley-morpho.ts.net`, `tailscale serve`
   fronting 3000): landing slideshow plays and resolves; Share → Add to Home Screen; the
   first launch from the icon shows the confirmation once; the row in Settings says
   "Installed"; airplane mode → reopen → feed shell + last page.
4. Android if a device is to hand; otherwise item 2 stands in (same Chromium prompt API).

## 7. Deferred / flagged (record in the walkthrough)

- **Item pages offline** — only `/feed` is cached. Caching `/i/*` documents is a one-line
  matcher change once there's a reason.
- **Slide credits are not rendered.** They live in `LANDING_SLIDES`; an "imagery" line in
  Settings › About is the natural home if it's ever wanted.
- **`slideMs`/`SLIDES_PER_RUN` are constants, not `/dev/tokens` knobs.** Tune by editing;
  promote to a knob only if the tuning drags on.
- **Hero size in the sheet** — prototype's 16 px shipped; Ben expects to adjust by eye.
- **`beforeinstallprompt` capture timing** — attached from a layout-mounted effect. If Chrome
  ever fires it before hydration on a warm load, the fix is an inline `<head>` script that
  stashes the event on `window`, mirroring the accent bootstrap.
- **Prototype's "Got it" → done** — deliberately not implemented (Decision 9).
- **Old landing bundle** (`docs/design_handoff_ambit_pwa/`) — still referenced by `CLAUDE.md`'s
  "Authoritative documents"; the redesign bundle has been authoritative since 08-16. Fix the
  pointer in §9's CLAUDE.md edit.

## 8. Done-bar verification

BUILD_PLAN's line: *auth e2e still green (same fields inside the sheet); installable on iOS +
Android; reopening offline shows shell + last cached feed.*

- `bun run check` green (typecheck, eslint, prettier, vitest).
- `bun run e2e` green across all six spec files, three consecutive runs.
- `bun run build` clean — the worker compiles with the `~/lib/sw-rules` import.
- §6.3 items 1–3 done and recorded in the walkthrough with what was observed (cache bucket
  names and entry counts, the confirmation appearing once).
- `public/landing/` contains no file from the bundle's `uploads/`.

## 9. Wrap-up (house conventions)

- `docs/PHASE5_WALKTHROUGH_5.11.md` (5.10's format), including §7's deferred list and the
  §6.3 observations.
- `docs/BUILD_PLAN.md:255-256`: check off 5.11; record Decisions 2, 7, 9, 10, 11 in the
  *Done =* line. Phase 5 is complete — say so in the Phase 5 preamble.
- `SPEC.md` §8.1 `/`: "Built Phase 5.11 — the Landing 2 slideshow resolving into a persistent
  `AuthSheet` holding 5.2's `AuthCard`; `/reset-password` shares the screen in static mode."
  §8.2: replace `InstallPrompt.tsx` with the built names (`components/install/` — `InstallFlow`,
  `InstallBanner`, `InstallSheet`, `InstallConfirmation`; `lib/install-store.ts`). §8.3: the
  Decision 10 strategy in two sentences, `start_url: "/feed"`, and the sign-out purge.
- `CLAUDE.md`: status paragraph → Phase 5 complete (5.1–5.11), next is 6.3 / Phase 7; the
  "Authoritative documents" pointer → `docs/design_handoff_ambit_pwa_redesign/`.
- `log.md` extended per its format — session-spend line via
  `python3 ~/.claude/scripts/session-spend.py --session <session-uuid>` (never estimate;
  omit on non-zero exit).
- Merge `feat/5.11-landing-install-pwa` to `main` when green; delete the branch both sides.

### Critical files for implementation
- `src/components/landing/auth-card.tsx` — the form that goes inside the sheet, untouched;
  its selectors are the e2e contract.
- `src/components/settings/install-sheet.tsx` — moves to `components/install/`; its header
  comment is the rationale for Decision 8.
- `src/lib/accent.ts` — the localStorage discipline `install-store.ts` copies (try/catch,
  allow-list, client-only reads).
- `src/components/settings/use-notification-permission.ts` — the `useSyncExternalStore`
  shape `useInstall()` and the standalone read follow.
- `src/app/sw.ts` + `src/app/serwist/[path]/route.ts` — the worker and how it's compiled.
- `e2e/support.ts` — `waitForHydration`'s comment explains the pre-hydration trap
  `openAuthSheet` must respect.
