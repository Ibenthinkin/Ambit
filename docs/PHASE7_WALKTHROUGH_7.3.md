# Phase 7.3 walkthrough — proxy-with-cache, and the 35 MB the feed was dragging

**Executed 08-28-26** against `docs/PHASE7_PLAN_7.3.md` (decisions D1–D8 in the plan), on branch
`feat/7.3-images-perf` off the `main` that had just taken 7.2, unattended under
`docs/PHASE7_OVERNIGHT.md`.

---

## Baseline (T1)

`bun run bench:feed`, on this machine, before any change:

```
bench: ben-e2e@example.com · 12 pages

getFeedPage
  pages   12 (144 cards)
  min     133 ms
  p50     138 ms
  p95     174 ms
  max     174 ms

getTopicPools (all topics, one call)
  topics  18
  wall    144 ms
  rows    9848
  payload 35.8 MB (JSON, approximate)
```

The feed is comfortably inside SPEC §4's 300 ms bar and has been since 4.1 — so **T2 is hygiene,
not rescue** (D6). The number that justifies it is the last line: composing one page of twelve
cards pulls **9,848 full rows, about 35.8 MB**, out of Postgres, because `getTopicPools` did a bare
`select()`. Most of that weight is the `body` column — 2,169 rows carry one, averaging ~13 KB — and
`composePage` reads exactly five fields. On a laptop talking to Postgres over a local socket that
costs 144 ms and hides; on a small VPS with the database a hop away it is the whole latency budget.

*(The bench runs as the first non-`ambit-%@example.com` account, which on this box is
`ben-e2e@example.com`, and a page served is a page spent — 144 cards of that test account's corpus
went to producing this table. It is a test account; that is the intended cost.)*

## After T2 — pools carry a projection, winners hydrate by id

Same machine, same minute, same user, immediately after the change:

```
bench: ben-e2e@example.com · 12 pages

getFeedPage
  pages   12 (144 cards)
  min     22 ms
  p50     22 ms
  p95     51 ms
  max     51 ms

getTopicPools (all topics, one call)
  topics  18
  wall    15 ms
  rows    9848
  payload 1.6 MB (JSON, approximate)
```

| | before | after | |
|---|---|---|---|
| `getFeedPage` p50 | 138 ms | **22 ms** | 6.3× faster |
| `getFeedPage` p95 | 174 ms | **51 ms** | 3.4× faster |
| `getTopicPools` wall | 144 ms | **15 ms** | 9.6× faster |
| pool payload | 35.8 MB | **1.6 MB** | 22× smaller |
| pool rows | 9,848 | 9,848 | unchanged — the *rows* were never the problem |

The plan called T2 hygiene rather than rescue (D6), on the grounds that the feed was already
inside the 300 ms bar and the payload only really bites on a VPS. That turned out to understate it:
even over a local unix socket, serialising and shipping 35.8 MB to pick twelve items was **six
sevenths of the feed's latency**. The row count is identical — this is entirely about how wide each
row was.

The shape is now: `getTopicPools` returns `PoolItem` (`id`, `topicId`, `source`, `curationScore`,
`aestheticTags` — exactly what `composePage` reads), `composePage` returns `ComposedCard[]`, and
`getFeedPage` calls `getItemsByIds` once on the winners and swaps in the full rows. `FeedCard` —
the exported type the router and every component use — is untouched, which is why no client code
changed and the e2e feed specs never noticed.

Two new unit tests hold that seam: one asserts the hydrate is asked for **exactly the composed ids
in the composed order** and that the card's other fields survive the swap; the other covers the one
case where the two queries can legitimately disagree — an item deleted between them — and asserts
the card is dropped rather than thrown, with the cursor still naming it so the next page excludes
it.

## T3 — the cache, live

`bun run start` against the real corpus, on a LoC item (`tile.loc.gov` is the source whose per-IP
budget made the cache the decision — Phase 6.2), cache directory emptied first:

```
--- request 1 (cold) ---
x-ambit-cache: fill
200 image/webp 43664 bytes · 0.056190s

--- request 2 (warm) ---
x-ambit-cache: hit
200 image/webp 43664 bytes · 0.004508s
```

```
$ ls -l .cache/img
-rw-r--r--  43664  Fom4CiEzfyDGQF2lemd8K.webp
```

The second request never leaves the machine — 4.5 ms against 56 ms, and, far more to the point,
**zero upstream traffic**. `X-Ambit-Cache` exists precisely so that is observable with `curl -I`
rather than inferred from a stopwatch; the route test asserts on it too.

The shape that landed:

- **`src/server/services/image-cache.ts`** owns everything: `readCached` → in-flight dedupe →
  `fillCache` (fetch → `sharp` rotate/resize/WebP → temp file → `rename`). 13 unit tests, none of
  which touch the network — the "upstream" bytes are real images `sharp` makes on the spot, so the
  resize path is genuinely exercised.
- **The route is now thin**: rate-limit → resolve the id → `getOrFill` → answer. Its own tests grew
  from 11 to 13 and none were trimmed; the fetch-level assertions (the **no-`Referer`** contract,
  which is the whole reason the proxy exists) *moved* into `image-cache.test.ts` along with the
  fetch itself rather than being dropped.
- **D8**: `lib/image-filename.ts` derives the save/share extension from `blob.type`, so a WebP is
  no longer handed to iOS Files under a `.jpg` name. Used by both save-image paths (item page and
  gallery), with its own unit test.

**One bug the tests caught before it could reach a log.** The in-flight map is cleared in a
`.finally()`, and `.finally()` returns a *new* promise that rejects with the same reason — which
nothing was awaiting. Every failed fill would have raised an unhandled rejection. A trailing
`.catch(() => undefined)` on the derived promise fixes it; the caller still gets the rejection from
the original.

**Two deliberate choices worth knowing about:**

- **The request's abort signal is not plumbed into the upstream fetch.** A reader who scrolls past
  an image cancels their *response*; if that also cancelled the fetch, the museum would be asked
  again next time — the exact cost this cache exists to avoid. Only the 15 s timeout can abort a
  fill. A fill is worth finishing even when nobody is waiting for it.
- **Nothing about a failure is remembered, at any layer** (D4): no file is written, the response is
  `no-store`, *and* the in-flight entry is cleared on rejection — so a museum having a bad minute
  doesn't poison the item until a restart. There is a test for each of those three.

## T4 — the LoC warm, and what it says about the 6.2 finding

`bun run img:warm --source loc --rate 1`, the one piece of outbound traffic this run was allowed:

```
warm: 376 candidate images from loc · 1/s per host

──────────────────────────────────────────────────────────────────────────────
Warm totals
──────────────────────────────────────────────────────────────────────────────
source            filled  cached  upstream  decode  too-big  timeout
loc                  295      77         0       0        0        4

elapsed: 427.5s
```

**No 429. Not one.** Phase 6.2 recorded `tile.loc.gov` answering a sustained 429 to a 334-image
ingest from every User-Agent it tried, and the plan's script carries a give-up rule (three
consecutive 429s from one host and that host is abandoned) that never had to fire. The difference
is the rate: 6.2's failure was a *burst*, and one request per second is apparently inside whatever
LoC's unpublished budget is. That is a useful thing to know about a limit nobody documents — and it
is now a one-time cost regardless, because these 372 images never need fetching again.

Four timeouts out of 299 attempts, all `kind: "timeout"` and none cached (D4), so they retry on
whatever asks for them next.

**The full warm is Ben's to start**, deliberately not run overnight:

```bash
bun run img:warm --rate 2            # every live source; --dry-run first to see the count
```

**Disk, measured rather than estimated.** The plan projected ~120 KB per item and ~1.3 GB for the
corpus. The real cache, 560 files in (372 LoC plus whatever the e2e runs and manual curls filled):

```
files 560 · total 34.0 MB · mean 62 KB · median 52 KB · max 375 KB
projected for 11,366 items: 0.67 GB
```

**Half the plan's estimate** — 62 KB a file rather than 120, because WebP at quality 82 is that
much better than the JPEGs upstream. D3's "no eviction in 7.3, and 8.1 mounts the directory as a
volume" is comfortable at that size.

## The bug the warm run found

The first attempt died 50 images in:

```
TimeoutError: The operation timed out.
DOMException { code: 23, name: "TimeoutError", … }
error: script "img:warm" exited with code 1
```

Two mistakes, one symptom, both fixed and both now covered by tests:

1. **`AbortSignal.timeout` covers the whole exchange, headers *and* body** — so a host that answers
   its headers promptly and then trickles the bytes rejects at `await upstream.arrayBuffer()`,
   which was *outside* the try/catch around the fetch. The rejection escaped `fillCache` entirely.
   In the warm script that was a crash; through the route it would have been a **500 instead of a
   502**, on exactly the kind of slow museum morning this cache exists for.
2. **A `DOMException` is not an `instanceof Error` under Bun.** The obvious
   `err instanceof Error && err.name === "TimeoutError"` therefore mislabelled every timeout as a
   generic upstream failure — and it passes under Node, which is where the unit tests run, so no
   test would ever have caught it. The check is duck-typed on `.name` now, with the reason written
   down.

Neither is the kind of thing reading the code finds. Running it against a real museum for seven
minutes is.

## T5 — Lighthouse, throttled mobile, against the production build

`bunx lighthouse … --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate
--chrome-flags="--headless=new"`, before and after the cheap fixes. JSON reports for all four runs
are in `docs/phase7.3-evidence/` (the HTML is gitignored — a megabyte of inlined report viewer per
run, reproducible from the JSON).

| | `/` before → after | `/feed` before → after |
|---|---|---|
| **Performance** | 87 → 86 | 91 → 90 |
| **Accessibility** | 95 → 95 | 95 → 95 |
| **Best practices** | 96 → 96 | 96 → **100** |
| First Contentful Paint | 0.8 s → 0.8 s | 1.0 s → **0.9 s** |
| Largest Contentful Paint | 4.1 s → 4.2 s | 3.5 s → 3.6 s |
| Speed Index | 0.8 s → 0.8 s | 1.6 s → **0.9 s** |
| Total Blocking Time | 10 ms → **0 ms** | 0 ms → 0 ms |
| Cumulative Layout Shift | 0 → 0 | 0 → 0 |

**Read that honestly.** The one-point performance moves are run-to-run noise, not a regression —
the same page measured twice varies by more than that. What is real: **`/feed`'s Speed Index nearly
halved** (1.6 s → 0.9 s), and `/` dropped its remaining blocking time to zero. **LCP did not
move**, and the reports say exactly why (below).

**The fixes applied** (D7: behaviour-neutral, each well under 30 minutes, and only the ones the
reports actually named):

- `image-item-body.tsx` — `fetchPriority="high"` and `decoding="async"` on the hero, the LCP
  element of the public item page.
- `app/i/[itemId]/page.tsx` — `preload('/api/img/<id>', { as: "image", fetchPriority: "high" })`,
  so the hero's request starts with the HTML rather than after it. Verified in the served markup:
  `<link rel="preload" href="/api/img/…" as="image" fetchPriority="high"/>`.
- `image-tile.tsx` — `decoding="async"` on feed tiles. A feed page holds ~24 of them, and this is
  the change the Speed Index win is most likely attributable to.

### What Lighthouse said that we did *not* fix

1. **The landing slideshow is `/`'s LCP, and it is 1.6 MB of JPEG.** The report's image-delivery
   insight names `wheatfield-with-crows.jpg`: 199,057 bytes, of which it considers **181,623
   wasted** — "using a modern image format (WebP, AVIF) … could improve this image's download
   size." All eight slides are ~200 KB JPEGs. That is `/`'s 4.1 s LCP, essentially in full. The
   plan anticipated this exact case and said to note it rather than re-encode assets overnight,
   so: **a 9.x follow-up, and a cheap one** — the same `sharp` pipeline this phase just added would
   take those eight files to WebP in one script.
2. **Unused JavaScript**, 300 ms on `/` and 450 ms on `/feed`. Real, and not a 30-minute fix.
3. **Colour contrast**, on both pages — `text-ink/40`, `text-ink/34` and `text-accent` on the app
   background fail WCAG AA. It is why accessibility sits at 95 rather than 100. These are design
   tokens from the redesign handoff, so changing them is a design decision, not a perf fix.

### Two findings worth Ben's attention

**1. A production hydration error, visible only under Lighthouse's emulation.**

Three of the four runs logged:

```
Error: Minified React error #418  (hydration failed — the server-rendered HTML didn't match)
```

consistently on `/`, and on `/feed` before the change but not after. React #418 is the production,
minified form of the hydration mismatch that dev builds print in full. It is worth taking seriously
because **nothing else in the project can see it**: `bun run e2e:prod` asserts "no console errors"
on both these pages and passes, and plain Playwright against the same production server logs
nothing at 390 px or 1280 px.

Two attempts to pin it down, both negative: it is **not** CPU throttling (reproduced Lighthouse's
4× via CDP `Emulation.setCPUThrottlingRate`, plus 8×, and got a clean console every time, with
`data-accent` correctly `indigo` and localStorage empty), and it is not viewport. The remaining
Lighthouse-specific variables are its simulated network throttling and its two-pass load. The
`<html data-accent>` accent mechanism is the obvious suspect — it is the one thing on this app that
deliberately mutates the root element before hydration, and Phase 7.1 already found one bug in it —
but that is a hypothesis, not a diagnosis. **Recorded, not fixed**: fixing the accent architecture
is not a behaviour-neutral 30-minute change.

**2. `/i/[itemId]` cannot be measured by headless Lighthouse at all** — and the page is fine.

Every attempt returns `NO_FCP` ("The page did not paint any content"), including with
`--force-prefers-reduced-motion` and with occlusion/backgrounding detection disabled. `/` and
`/feed` measure normally in the same setup. The page itself is demonstrably healthy: it answers 200
with 26 KB of HTML, Playwright records `first-paint` at 72–88 ms, the hero comes through the cache
as a 640×432 WebP with `img.complete === true`, fonts load, `main.innerText` carries the title, and
a screenshot at 1280×720 shows the finished page exactly as designed.

The one structural difference is that every section of this page is wrapped in `<Rise>` —
`animation: rise 0.6s ease both`, which starts at `opacity: 0`, staggered 0/50/120/160 ms. With
`both` fill, the content is *fully transparent* until its animation starts, and Chrome does not
count a transparent paint as contentful. That explains a delayed FCP; it does not obviously explain
never recording one, and forcing reduced motion did not help — though note the reduced-motion block
in `globals.css` zeroes `animation-duration` but **not `animation-delay`**, so a reduced-motion
reader still waits out the 160 ms stagger. That one-line gap is worth closing regardless.

So `/i/[itemId]` has **no Lighthouse numbers in this evidence set**, deliberately, with the reason
written down rather than a fabricated figure. It is worth one pass in a real, non-headless Chrome.

## Verification (the done-bar)

| # | Bar | Result |
|---|---|---|
| 1 | `bun run check` green with `image-cache.test.ts` and the extended `route.test.ts` | ✅ 77 files / **820 tests** (was 797 after 7.2) |
| 2 | `bun run e2e:prod` green, `pwa.prod.spec.ts` included | ✅ **46 passed** |
| 3 | Two curls to the same `/api/img/<id>`: `fill` then `hit`, both WebP | ✅ 56 ms → 4.5 ms, 43,664 bytes both |
| 4 | `bun run bench:feed`: p50 < 300 ms and the pool payload in single-digit MB | ✅ **p50 22 ms**, payload **1.6 MB** |
| 5 | `docs/phase7.3-evidence/` has before/after JSON for at least `/` and `/i/[id]` | ⚠️ `/` and **`/feed`** — `/i/[itemId]` returns `NO_FCP` to headless Lighthouse (see T5) |
| 6 | BUILD_PLAN's gate table says the image decision is settled, and SPEC says how | ✅ gate row flipped; SPEC §8.1a, §11, §13, §15 |

## What the plan got wrong

1. **T2 was filed as hygiene. It was the phase's biggest win.** The plan's own reasoning was sound —
   the feed was already at 138 ms against a 300 ms bar, so the projection was "for the VPS". On a
   laptop over a local socket it still cut p50 by 6× and p95 by 3.4×, because serialising 35.8 MB is
   not free anywhere. The lesson is narrower than "measure": the plan measured *latency* in 7.3's
   research and concluded there was nothing to win, without measuring *payload*.
2. **The disk estimate was 2× too pessimistic** — 62 KB a file rather than 120, so ~0.67 GB for the
   corpus rather than 1.3. WebP at q82 is simply better than the source JPEGs.
3. **The plan's failure taxonomy for `fillCache` missed the one that actually happened.** It
   enumerated upstream / decode / too-large / timeout and had the route map each to a 502 — but it
   put the timeout only on the *fetch*, and the real timeout landed on the **body read**, outside
   the guard. Combined with `DOMException` not being `instanceof Error` under Bun, that is two
   compounding mistakes in code the plan specified almost line by line. Seven minutes against a real
   museum found both; no amount of re-reading would have.
4. **Nothing anticipated that `/i/[itemId]` would be unmeasurable.** T5 named it as one of the three
   URLs and gave a fallback only for `/feed` (if the cookie script failed). The page that *did* need
   a fallback was the one the plan was most confident about.
5. **`bun add sharp` cost more time than any code in this phase** — it silently staled Vite's dep
   cache, and the resulting non-deterministic, minutes-long test runs read exactly like the
   documented busy-machine flake. Now written down in CLAUDE.md so the next phase doesn't re-derive
   it.

## What to remember

- **`X-Ambit-Cache` is the cheapest observability in the codebase.** One header turned "is the cache
  working" from a stopwatch question into `curl -I`, and into an assertion in the route test.
- **The security boundary did not move.** The cache key is the item id, the URL still comes only
  from the DB, and nothing in this phase accepts a caller-supplied URL, path or size.
- **A fill is worth finishing even when nobody is waiting for it.** The request's abort signal is
  deliberately not plumbed into the upstream fetch — a reader scrolling past would otherwise cancel
  the one fetch this image was ever going to cost.
- **`img:warm --rate 1` is inside LoC's budget; a burst is not.** 372 images, zero 429s.

## A postscript on the e2e flake, now diagnosed

`e2e/gallery.spec.ts:248` ("a gallery session spends none of the reader's corpus") failed twice in a
row on the final gate, and the error is worth writing down because 7.2 recorded the same signature
without a cause:

```
Error: expect(received).toBe(expected)   // seen_item rows for this user
Expected: 12
Received: 10
```

**The count goes *down*.** The test asserts a signed-out gallery session adds no `seen_item` rows;
what actually happened is that two existing rows were *deleted* mid-test. Every spec seeds under
`source: "e2e"`, `fullyParallel` runs them in separate workers, and the feed draws from the whole
corpus — so the gallery user's feed page can legitimately be served another spec's fixtures, and
when *that* spec's `afterAll` runs `cleanupSeeded`, it deletes those items and the gallery user's
`seen_item` rows along with them.

That is the same root cause as the `seen_item_item_id_item_id_fk` teardown failure 7.2 recorded, seen
from the other side: one spec's cleanup reaching into another spec's state. It is a **harness**
defect, not an app one, and it is unrelated to this phase's changes — 7.2 saw it before `getFeedPage`
hydrated anything. Confirmed by running `gallery.spec.ts` alone: **5/5 green**, repeatedly, and the
full suite green on the next run.

A fix belongs in `e2e/support.ts` — either seed each spec under its own `source` rather than a shared
`"e2e"`, or have `cleanupSeeded` scope its `seen_item`/`saved_item` deletes to the spec's own user —
and is worth doing before it costs another phase an evening.
