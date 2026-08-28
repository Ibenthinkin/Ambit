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
