# The landing redo (8.3) — an overture, a corpus reel in two tempos, a new profile mark — design

**Written:** 09-25-26 by Fable 5.1, from Ben's decisions across three sittings that day (log
09-25) and a read of `doorofperception.com/explore` — its source (`explore-core`, the `#intro`
block) and four frames of it running.
**Status:** design approved in chat 09-25-26 (Ben: "do it"); plan `docs/PLAN_landing-redo.md`,
ready to execute cold in a cheaper session on a plain branch off `main`.
**Supersedes:** the pacing half of 5.11 (`docs/PHASE5_WALKTHROUGH_5.11.md`), knowingly — see
BUILD_PLAN's 8.3 row for the four axes. The auth form, the sheet, the e2e hydration contract and
the reduced-motion rule are all kept.

## Why

`/` is the first thing an invited friend sees. Today it is eight committed Wikimedia JPEGs
(1.6 MB) cross-fading at 600 ms for five seconds into the sign-in sheet — it says nothing about
Ambit, it is the page's 4.1 s LCP in full (7.3's Lighthouse), and the pictures are placeholders
that never got replaced. The corpus now holds ~2,700 pictures scored 9 or better under licences
that permit exactly this use, all warm in the image cache.

The reference Ben pointed at is the opening of *DOPExplore*: a black screen, one line of type
whose tail collapses into the wordmark, then a hard cut into a full-bleed flicker of pictures with
the wordmark inverting whatever is behind it. "Look like that — but you don't have to zoom in on
the word, just play the images for a few seconds and bring up the sign-up." And, torn between the
reference's quick hard cuts and a slow dissolve: **build both, decide by looking.**

## Decisions

Numbered so the plan can cite them.

### D1 — The pictures come from the corpus, under an exact licence rule

The pool is every `item` with `type = 'image'`, `curation_score >= 9`, a source not in
`SUSPENDED_SOURCES`, and a `license` that is either **one of these exact strings**

| string | sources it covers (local counts, 09-25) |
|---|---|
| `CC0 1.0 (public domain)` | cma 826, met 456, aic 43 |
| `CC0` | smithsonian 245 |
| `Public Domain Mark` | wellcome 203 |
| `Public domain (NASA)` | nasa-images 142 |
| `No known restrictions on publication` | loc 101 |

or **starts with `Public domain —`** (PDR's per-collection variants: `PD Worldwide`, `PD U.S.`,
`No Known Restrictions`, `Various`, `PD GOV`, `PD 70 Years`, `PD 50 Years`, `Effectively PD`;
~742 rows). **~2,760 pictures locally**, about the same on production.

Excluded on purpose, each for a reason: `license IS NULL` (met 93, aic 3 — a missing rights
statement is not a permissive one); `CC BY 4.0` (wellcome 13 — attribution is a condition and the
landing renders no credit); PDR's `Rights retained by the author` (51); `archive`'s `unknown`;
`loupe`; and every blog (`Rights retained by original authors — displayed with credit and link`):
the link-card posture is display *with* a link to the original, which a full-bleed reel is not.

The rule lives in one file, `src/server/config/landing-pool.ts`, as data (`LANDING_LICENSES`,
`LANDING_LICENSE_PREFIXES`) with a pure `isLandingLicense(license)` beside it, so a new source's
licence string is one line and one test. Score floor `LANDING_SCORE_FLOOR = 9`.

### D2 — The server picks the reel; the pool is memoised in-process

`services/landing-pool.ts`:

- `getLandingPool()` — the pool's **ids only** (`~2,700 × 21 B`), loaded once and memoised
  module-level for `POOL_TTL_MS = 10 min`, then refreshed on the next call after expiry. A landing
  hit costs no query; the nightly ingest's additions appear within ten minutes. Same per-process
  shape as the rate limiters (SPEC §13: one instance).
- `pickReel(ids, n, rng)` — pure: Fisher–Yates over a copy, first `n`. `REEL_SIZE = 12`.
- Both wrapped by `getReel(n)` which `app/page.tsx` (already a dynamic RSC — it reads `headers()`)
  awaits and passes down as props. `/reset-password` asks for one.

**Empty pool** (a fresh install, CI's fixture-only database) → the reel is the one committed
fallback, `public/landing/fallback.webp` (~60 KB, a PD work re-encoded with `sharp`; the eight
JPEGs are deleted). The screen is never black, and CI exercises this branch every run.

**What this removes.** 5.11 could not put its random run in the server's HTML (the server would
pick one order, the client another), so it hid the imagery until hydration and gated everything
on a `useSyncExternalStore` hydration flag. With the server picking, the reel *is* the HTML: the
first pictures are `<link rel="preload">`s in `<head>`, the first `<img>` is in the markup, and
that hydration gymnastics goes. The one thing that still must not reach the server's markup is
the reduced-motion answer (D8).

### D3 — A second image rendition, derived, never fetched

`/api/img/[itemId]?w=960` serves a **960 px longest-edge WebP at quality 76**, derived by `sharp`
from the cached 1600 px master and stored beside it as `<itemId>.w960.webp`. Measured on 120
cached files: **p50 45 KB / p90 132 KB** (the master: 78 / 263).

Rules, in order of how much they matter:

1. **The rendition set is closed**: `RENDITIONS = [960] as const`. Any other `w` is a 400. No
   caller ever names a size the server did not already decide to offer — the route's "the item id
   is the whole key" boundary is intact.
2. **A rendition is never its own upstream fetch.** A miss on `w960` reads the master (filling it
   through `getOrFill` if it too is missing — one museum fetch, as today), resizes, writes
   atomically (temp + rename, as `fillCache`). `img:warm`'s "once, ever" promise holds.
3. Same headers as the master (`immutable`, `X-Ambit-Cache`); the SW's `/api/img/*` CacheFirst
   rule matches it unchanged (the predicate is a pathname prefix).
4. `bun run img:warm --rendition 960 --landing` pre-derives the pool's renditions: local CPU only,
   no network, ~2,700 files, so the first reader after a deploy is not the one paying for it.

The landing's `<img>` carries `srcset="/api/img/<id>?w=960 960w, /api/img/<id> 1600w"` with
`sizes="(min-width: 768px) 100vw, 50vw"`. Below `md` a phone takes the 960 (at 3× that is 0.8
device pixels per image pixel behind a moving, graded surface — invisible); from `md` the master.
The preloads carry the same `imagesrcset`/`imagesizes`. (The `1600w` descriptor is nominal — a
master smaller than 1600 is not enlarged; the browser only uses the number to choose.)

### D4 — The overture: the reference's opening, without the click

Copied from `#intro-text`'s timing (the reference's CSS and `runIntro`), on a black ground
(`#000`, not the app's warm near-black — the reference's cut from pure black into colour is part
of the effect):

| t | what |
|---|---|
| 0 | the line fades in over 0.5 s, centred: **`AMBIT — A quieter way to be curious.`** |
| 1.4 s | the tail (` — A quieter way to be curious.`) collapses over 2.2 s on `cubic-bezier(.4, 0, .2, 1)` and fades over 1.6 s; the line is centre-anchored, so **the wordmark drifts to centre as the tail shrinks** — one continuous motion |
| ≈ 3.6 s | **hard cut**: the line is dropped and the first picture snaps to full opacity in the same frame (the reference's `show-slideshow` moment). No fade. |

Then the reel (D5). The wordmark **stays on screen** at fixed size over the pictures, white,
`mix-blend-mode: difference`, until the sheet rises; it does not grow (the reference's
`dope-breathe` and `intro-logo-grow` are the "zoom on the word" Ben waived). The bottom gradient
that keeps the sheet's edge legible stays.

**Type.** The wordmark is tracked-out caps (`A M B I T`, `letter-spacing: .32em`, like the
reference's `D O P E`); the tail is sentence case with the reference's `.02em`. Size
`clamp(15px, 2vw, 25px)`, weight 400. **Face: Inter**, via `next/font/google`
(`weight: "400"`, `subsets: ["latin"]`, `display: "swap"`, `variable: "--font-inter"`), imported
by the landing components only — the reference is ABC Diatype, a commercial grotesque; Inter is
the nearest thing we can ship, and Sora (the app's one face) is geometric enough to read as a
different idea. Cost: one ~25 KB woff2, self-hosted, preloaded by next/font; `font-src 'self'`
already allows it. *Ben's escape hatch, recorded: Sora tracked out is a one-line change if a
second face offends.*

**Two rules that keep the reference's look and a clean score:**

- The collapse is **not** the reference's `width` transition. Lighthouse counts a `width`
  transition that moves siblings as layout shift (CLS ≈ 0.1 for nothing). The tail is clipped
  with `clip-path: inset(0 100% 0 0)` (from `inset(0)`) and faded; the wordmark moves by a
  `translateX(var(--drift))` where `--drift` is half the tail's measured width, set once on mount.
  Compositor-only; CLS stays 0.
- The reel's start gate is **"the overture has finished AND the tempo's first frames are
  decoded"** (D5). On a slow connection the wordmark holds a beat longer; it never cuts to a blank.

### D5 — One reel engine, two tempos; Ben picks by looking

`Tempo` is a plain object (`components/landing/tempos.ts`, a no-import leaf so it unit-tests in
node and the client reads it without the DB layer):

```ts
interface Tempo {
  id: "cut" | "dissolve" | "gentle";
  frameMs: number;        // how long a picture holds
  fadeMs: number;         // cross-fade; 0 = hard cut
  firstPass: number;      // pictures shown before the sheet rises
  gateFrames: number;     // decoded pictures required before the reel starts
  drift: boolean;         // slow 1.00 → 1.06 scale over the frame (transform only)
  softStart: boolean;     // the first frame fades in from black instead of cutting (09-26-26)
  behindSheet: Tempo["id"]; // which tempo runs once the sheet is up
}
```

| | **`cut`** | **`dissolve`** | `gentle` (09-26-26) |
|---|---|---|---|
| `frameMs` | **350** | **6000** | 6000 |
| `fadeMs` | 0 — a hard cut | **2500** | 2500 |
| `firstPass` | 12 (≈ 4.2 s) | 2 (≈ 8 s from the cut) | 2 |
| `gateFrames` | 4 | 1 | 1 |
| `drift` | no | yes | no |
| `softStart` | no | no | **yes** |
| `behindSheet` | `dissolve` | `dissolve` | `gentle` |
| prefetch | all 12 at once, streaming | one ahead | one ahead |

`gentle` is not a candidate: it is what a reduced-motion reader gets in place of either (D6). Its
own gear behind the sheet, because relaxing to `dissolve` would bring the drift back.

*Why 350 and not the reference's 320:* WCAG 2.3.1 caps flashing at three per second. 320 ms is
3.1 changes/s; 350 is 2.9. Same feel, one fewer thing to answer for.

*Why the cut tempo relaxes behind the sheet:* the reference's intro leaves once its grid arrives;
Ambit's pictures stay behind a form the reader is typing into, and a 3 Hz strobe under a text
field is hostile. The 09-10 "never stops" rule holds — the reel changes gear. Collapse the sheet
(the logo disc) and it is back to full speed from the top, as today's `restart`.

**Selection.** `DEFAULT_TEMPO: Tempo["id"]` in `tempos.ts` is what production runs.
`?tempo=cut|dissolve` on `/` overrides it **only when `feedDebugEnabled()`** (the same gate as
`/dev/feed`; a production build with `FEED_DEBUG` unset ignores the param). That covers local dev
and the tailnet device pass, which is where Ben looks. When he has chosen: flip `DEFAULT_TEMPO`,
and a follow-up task deletes the loser's branch and its tests — the `Tempo` object stays (it is
what makes `behindSheet` expressible), the second preset does not.

**Frame rules the hook enforces** (`use-reel.ts`, fake-timer tested):

- Under `cut`, a frame whose picture has not decoded is **skipped**, never shown blank; the tick
  keeps time. Under `dissolve` the next picture is decoded before its fade begins.
- At most **three `<img>` are mounted**: leaving, current, next — keyed by item id so the decoded
  bitmap survives re-renders. (5.11 mounted all eight because it needed them all for the fade;
  with one-ahead prefetch it needs three.)
- The reel wraps (`(i + 1) % n`); the first pass fires `onFirstPass` exactly once (a ref, for the
  StrictMode reason 5.11's hook records). `skip()`, `restart()`, `advance(±1)` keep their
  contracts — the glyph, the collapse, tap-to-next and ←/→ are unchanged.
- **The grade is gone.** 5.11's `saturate(.72) contrast(1.06)` made eight postcards read as one
  surface; the reference's effect is pictures in their own colour under a pure black cut. Full
  bleed, `object-fit: cover`.

### D6 — Skip, keys, reduced motion, offline: kept

- The floating "Open sign-in" glyph and the sheet's "Back to the slideshow" disc are unchanged
  (the e2e suite's `openAuthSheet` depends on the first). Tap on the imagery = next. ←/→ step.
- **Reduced motion (rewritten 09-26-26):** the reader gets the show, gently. The overture plays as
  a plain fade — the line fades in, holds, fades out as a whole, and the wordmark alone fades back
  in over the reel; nothing clips or translates. The reel runs the `gentle` tempo (D5): the
  dissolve's 6 s / 2.5 s clock with no drift and a soft start, so even the first frame fades in
  from black. Opacity is the only property that moves. The sheet rises on the gentle first pass
  (two frames). Still read after hydration through `useMediaQuery`, never in the server render
  (D8): the server renders phase `in` for everyone, which is now what every reader sees first,
  and the preference only changes what happens from the collapse on. `globals.css`'s 0.01 ms
  collapse exempts the reel and overture roots (`.motion-gentle`) and nothing else — the sheet
  still collapses. *History:* until 09-26 this bullet said "one still, sheet up"; that was what Ben
  saw on both his devices (Reduce Motion on) and reported as "no animation at all".
- **`Save-Data`** (`navigator.connection.saveData === true`): the reel stops after the first
  picture; the overture still plays. Cheap, and the honest thing on a metered connection.
- The service worker: `/api/img/*` is already CacheFirst (150 entries), so the reel's pictures
  cache like any tile's; `isStaticAsset`'s `/landing/` branch keeps matching the fallback file.
  Nothing in `sw.ts` changes.

### D7 — A new profile mark, chosen on a dev page

`AvatarChip` — a gradient disc with a hairline white ring — is Cosmos's avatar, and Ben wants a
mark of Ambit's own in the same quiet, abstract vein. It appears in four places (`PillToolbar`
28 px, `RailToolbar` 32 px, `ProfileHub` 88 px, `ProfileEditScreen` 104 px), so it is chosen
once and swapped everywhere.

Three candidates, each an SVG in `components/icons/marks.tsx` taking `size` and the per-user
`hue` (from `avatarHue(userId)`; `avatar-hue.ts` is unchanged):

1. **Orbit** — the `Logo`'s geometry made personal: a filled disc in the user's gradient with the
   Logo's small satellite dot on its rim, at an angle derived from the id (`hue` doubles as the
   angle: `hue°` around the disc). Every account differs in colour *and* in where its moon sits.
   *Recommended.*
2. **Terminator** — a disc split light/dark along a per-user angle, a planet's day side.
3. **Ring** — the user's hue as a thick ring around a dark centre; no fill.

`/dev/marks` (gated by `feedDebugEnabled()` like `/dev/feed`) renders all three beside the current
chip at the four sizes and for six sample ids, on both the app ground and over a picture. Ben
picks; the last task points `AvatarChip` at the winner, deletes the other two and the
`.bg-avatar-gradient` class if nothing else uses it. **Until he picks, production ships the
current chip** — the mark is not on the critical path of the reel.

### D8 — Hydration: what may and may not be in the server's markup

May: the reel (server-picked, D2), the overture's markup, the tempo (server-resolved from the
query + gate). May not: the reduced-motion answer, `saveData`, and anything from `Math.random` on
the client. `LandingScreen` keeps one `useSyncExternalStore` hydration flag for the two client-only
answers; the imagery no longer waits on it.

### D9 — Copy is untouched in this cut

The sheet's three lines ("A quieter way to be curious." / "No feeds engineered to keep you…" /
"Ambit") stay as they are. The overture's line reuses the first. The vault's "rewrite all copy"
item is its own small task once the tempo is chosen — settling a voice under a motion decision
that has not been made would be settling it twice.

## Amendment, 09-25-26 — tall pictures for phones, wide ones for computers

**Ben's first device look:** "the second image is a super blurry close up … I think we need to have
different image sets for phones screen sizes vs computer screen sizes, or crop them so they look
ok." Measured cause: the reel is full-bleed `object-fit: cover`, so a wide picture on an upright
phone is scaled to the screen's *height* and cropped to its middle; D3's `sizes="50vw"` then made
the browser choose the 960 rendition, stretched ~4× on a 3× iPhone. Cropping cannot help — it is
zooming — and the masters are small (the pool's tall pictures: median 893 px high; a 3× phone is
~2,550 device px tall). Ben chose **option A** of three offered (A: shape-matched sets; B: show
pictures whole, not full-bleed; C: A plus fetching bigger originals):

- **Each item records its cached master's size** — `item.image_width` / `image_height` (migration
  0009). `img:warm` writes them as it fills; `bun run img:dims [--landing]` backfills from the
  cache, header-only, and **runs non-fatally on every container boot**. An unmeasured row is not
  in the landing pool.
- **Two pools** (`landingShape`, config/landing-pool.ts): **tall** 0.4 ≤ w/h ≤ 0.8 and **wide**
  1.25 ≤ w/h ≤ 2, each with a long edge ≥ 800 px. The outer limits drop needles and panoramas that
  would cover a screen only by being blown up (the first 1440 look drew a 6 : 1 panorama). Square
  pictures sit out. Locally 387 tall / 396 wide of 1,616 measured (production ≈ 1.7× that).
- **Two reels per visit**, `getReels()` → `{ portrait, landscape }`. The server preloads the reel
  its user-agent guess needs (`guessShape`: a phone is upright; an iPad reports itself as a Mac and
  counts as wide); the screen picks by `(orientation: portrait)`, with the guess as the query's
  server snapshot so hydration agrees, and the real orientation replaces it one render later.
  Turning a phone swaps reels mid-run.
- **The master, not the 960 rendition** — every pixel is needed full-bleed. D3's rendition stays
  in the image route (closed set, tested) but nothing uses it. Without a `srcset`, React sends the
  preloads as an HTTP `Link` header rather than `<link>` tags.

Not done, recorded: **C** (bigger originals for the landing pool) is the only route to sharp
full-bleed on a 3× phone, and depends on each source offering one. Reduced motion was the cause of
the "no motion" reports on both his devices, confirmed 09-26-26; D6 is rewritten — the gentle
version — and `docs/PLAN_landing-reduced-motion.md` built it.

## The budget — stated honestly

The overture changes what Lighthouse's LCP *means* here: the largest paint is the first
full-bleed picture, and the choreography holds it back until the overture ends whatever the bytes
do. So the number will read **≈ 3.6 s by design**, and the line the build is held to is:

| line | target |
|---|---|
| First picture | paints **on the frame the overture ends** (≈ 3.6 s) on simulated 4G mobile — never later. The measure is *zero wait after the overture*: the preloads land inside it. |
| Preloaded from `<head>` | `cut`: 4 pictures (≈ 4 × 45 KB p50); `dissolve`: 1 |
| Bytes before the sheet rises | `cut`: ≤ 600 KB p50 (12 × 45); `dissolve`: ≤ 150 KB |
| Landing JS | ≤ 15 KB (the two hooks and the components; Inter is a font, not JS) |
| CLS | 0 (the collapse is clip-path + transform, D4) |
| Motion | `opacity` / `transform` / `clip-path` only, `will-change` on the moving layers |

Measured the way 7.3 measured: `bun run build && bun run start`, then `bunx lighthouse
http://localhost:3000/ --only-categories=performance --form-factor=mobile
--screenEmulation.mobile --throttling-method=simulate --chrome-flags="--headless=new"
--output=json --output-path=docs/phase8.3-evidence/<before|after>-landing`, JSON committed, HTML
gitignored. Before and after, both tempos after. If Ben would rather the metric stay under 2.5 s
the overture has to be ~2 s, which is too quick to read the slogan; the recommendation is the
honest number.

## What is deleted

`public/landing/*.jpg` (8 files, 1.6 MB), `components/landing/landing-slides.ts` and its test
(`LANDING_SLIDES`, `pickRun`, `preloadRun`, `SLIDE_MS`, the `uploads/` guard), the grade filter,
5.11's "imagery waits for hydration" branch. `use-slideshow.ts` is replaced by `use-reel.ts` (same
contract, plus the tempo and the decoded-frame rules) — replaced rather than edited, because the
timer shape changes (the fade now needs the next picture decoded first).

## What is not in this cut

The copy pass (D9). A caption naming the picture (the reference has none; a later idea if the
landing wants to *say* what Ambit does rather than show it). Any per-reader personalisation of the
reel (the landing is signed-out by definition). Lottie / video (the medium question was answered
09-25: stills). Growing the pool below score 9 (the floor is the point).

## Open questions for Ben, after the build

1. **Which tempo** — `cut` or `dissolve`, on the phone and at 1440.
2. **Which mark** — on `/dev/marks`.
3. Whether Inter earns its place or Sora tracked out is enough.
