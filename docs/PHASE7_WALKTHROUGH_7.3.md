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
