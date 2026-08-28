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
