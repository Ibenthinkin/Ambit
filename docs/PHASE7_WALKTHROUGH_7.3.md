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
