# Feed pool sampling — corroboration and proposal

**Written:** 09-08-26 evening by Fable 5.1, corroborating the finding recorded in `log.md`'s
09-08 entry ("A reload loop on `/feed`, chased and not caught — but it turned up a real one").
**Status:** shipped 09-08-26 as the plain sample (Ben's call); plan `docs/PLAN_feed-pool-sampling.md`.

## What was claimed, and what holds

The afternoon's entry said `getTopicPools` pulls the whole corpus per page and that `feed.page`
takes 1.5–9.2 s. Re-measured this evening against Ben's real account (`architecture, portraiture,
zoology`), with the `thisisnthappiness` top-up ingest running throughout (it was also running,
along with walk 4 and a sovietpostcards top-up, through the whole window the afternoon's numbers
came from — a confounder that entry did not account for):

| | measured |
|---|---|
| Topics in the vocabulary | 104 |
| Topics reachable in two graph hops from three picks (`reachableTopics`) | **101** |
| Rows `getTopicPools` returns for one page | **133,698 · 22.4 MB** |
| `getTopicPools` in-process, bare Bun script | **~175 ms** |
| `getFeedPage` end-to-end, in-process | **~200 ms** |
| `feed.page` inside the dev server, fresh process, first load | 850 ms |
| `feed.page` inside the dev server, loads 2–8 | alternating **~0.9 s / ~4.2 s** |
| Dev-server RSS after those eight loads | **2.6 GB** (from fresh) |
| `feed.markSeen` (one insert) while a compose was in flight | **1,709 ms**; `proxy.ts` alone 827 ms |

**Structural claim: corroborated, and it is worse than "the bench's worst case".** The bench's
"all topics, one call" is not synthetic — `reachableTopics` expands the user's picks by two hops on
a graph whose sixteen core rows are dense, so from any three picks it reaches 101 of 104 topics.
Every page fetches every eligible item in the vocabulary. The cost is the row *count*, and the row
count is the corpus: 9,848 when 7.3 tuned this, 122,458 now, ~89,500 more budgeted for the Tumblr
walks alone.

**Latency claim: the numbers were right, the attribution was not.** The query is a tenth of it.
In a bare process the whole compose is 200 ms; inside the long-lived dev server the same compose
is 0.9–4 s, *unrelated* requests stall behind it (a one-row insert at 1.7 s, a nonce-minting
proxy at 827 ms), and the process grows ~300 MB per page load. That is the signature of
materialising 133,698 objects per request in a single-threaded process — GC and event-loop
blocking — not of a slow SELECT. Not profiled at the GC level; the fix below removes the
allocation regardless, and the before/after will say.

One thing this may connect to, offered as a hypothesis only: Next's dev HMR client reloads the
page when its websocket drops and reconnects. A dev server whose event loop stalls for seconds is
a dev server whose HMR socket can drop. The reload loop Ben saw was never reproduced, but a
Firefox console with *Persist Logs* on would show an `[HMR]` / `[Fast Refresh]` line before each
reload if this is it. Worth one look next time; not a finding.

## The proposal: sample the topic pools the way the wild pool already does

`getWildPool` (09-06-26, `db/feed.ts:187`) faced this exact problem — "loading every un-homed row
per request is exactly the 9,848-rows-and-35.8-MB-per-page problem Phase 7.3 fixed" — and solved
it with a deterministic sample: `ORDER BY md5(id || sampleKey) LIMIT 200`, where `sampleKey` is
`${seed}:${page}` from the cursor. SPEC §7's "same cursor → same page" survives because the
sample is a pure function of the cursor; `feed.integration.test.ts` pins it. The topic pools
should adopt the same mechanism, per topic:

```sql
SELECT id, topic_id, source, curation_score, aesthetic_tags
FROM (
  SELECT …,
    row_number() OVER (PARTITION BY topic_id
                       ORDER BY md5(id || :sampleKey))          AS n,
    row_number() OVER (PARTITION BY topic_id, source
                       ORDER BY md5(id || :sampleKey))          AS n_src
  FROM item
  WHERE topic_id IN (:reachable) AND <eligibilityConditions>
) s
WHERE n <= :K AND n_src <= :K_SRC
ORDER BY topic_id, id;
```

> **Correction, 09-08-26, from the implementation.** The sketch above is wrong in one way that
> matters, and it shipped before it was caught: those two `row_number()`s both rank over the
> *whole* eligible set, so `n <= :K AND n_src <= :K_SRC` is an **intersection** — a row must make
> the topic's global sixty *and* its own source's twenty. That shrinks the sample without giving
> a minority source a single extra slot, because a minority row still only enters if it would
> have placed in the global sixty anyway; measured on the corpus, `japan` kept 30 rows from 3 of
> its 8 sources and `activism` 23 from 3 of 5. The bullet below ("minority sources are guaranteed
> candidates") describes what the cap is *for*, and getting it needs **two stages**: cap each
> source to `:K_SRC` first, then rank the survivors within the topic and take `:K`. Those two
> topics then return 60 rows from all 8 and 46 from all 5. Shipped that way; see `db/feed.ts`.

- **`K` per topic, ~60.** A page draws at most twelve items and retries on an empty pool; a topic
  is rarely drawn more than four times on one page. Sixty leaves room for `sourceCap` and
  `lastSource` filtering to reject most of a sample and still find a card.
- **`K_SRC` per (topic, source), ~20.** A blog-captured topic (`illustration` is 17,500 items,
  most of them one blog) would otherwise fill its sixty with one source and hand `pickItem` a
  sample that `sourceCap` empties after three. Capping per source inside the sample is the
  diversity constraint applied where it is cheapest, and it makes the cap *more* effective, not
  less: minority sources are guaranteed candidates.
- **Rows per page: ≤ 101 × 60 ≈ 6,000, in practice far fewer** (most grown topics have under
  sixty eligible items). From 133,698. And it stops tracking the corpus: O(topics × K).
- **The engine is untouched.** `composePage` / `pickItem` / `weightedPick` still receive
  `Map<topicId, PoolItem[]>` and do exactly what they do now; `getFeedPage` passes the
  `sampleKey` it already builds for the wild pool. `ORDER BY topic_id, id` on the outer query
  keeps the "arrays arrive in a stable order" property `weightedPick` depends on.
- **Postgres still scans every eligible row** to hash and rank it — the same scan as today, on
  the same index (`idx_item_topic_score`). What collapses is the transfer and the JS
  materialisation, which the measurements say is where the cost is. md5 over ~130k rows is
  milliseconds (the wild pool's comment measured the same thing).

### The one trade-off, stated plainly

Today the curated-weighted draw runs over the *whole* eligible pool; after this it runs over a
uniform sample of sixty. For a pool of thousands, an individual top-scored item is less likely
to be *in* the sample at all, so served cards regress slightly toward the pool's mean score.
Three ways to think about that, in the order I'd try them:

1. **Measure it before worrying.** `bun run probe:feed` reports the tier and score mix of a run.
   Compare mean and p10 `curation_score` of served cards before and after over a few hundred
   cards. The floor (`scoreFloor` 4) and the walk verdicts (most sources ≥ 8 for 85–97 % of rows)
   already compress the score range, so the shift may be invisible.
2. **If it isn't, tilt the sample toward score** without porting `drawWeight` to SQL: order the
   window by `md5(…)` but partition the top band separately — e.g. take up to 20 of the sample
   from `curation_score >= 9` and the remaining 40 from the rest. Keeps one weighting
   implementation (the JS one) while making sure the best rows are always candidates.
3. **Exact weighted sampling in SQL** (Efraimidis–Spirakis: order by `-ln(u)/w` with `u` from
   the md5 hash and `w` from a SQL port of `drawWeight`). Correct, but `drawWeight` reads the
   user's taste-tag overlap, so this means two implementations of the weight function that must
   not drift — the house rule the wild pool's `eligibilityConditions` refactor exists to enforce.
   Last resort.

I would not do (3) up front. (1) is a two-command experiment.

### What is deliberately not proposed

- **Shrinking `reachableTopics` to one hop.** Halves the rows at best, still O(corpus), and
  changes what DRIFT can reach. No.
- **Caching pools.** They are per `(user, anchor)` and every `markSeen` invalidates them. Wrong
  shape.
- **A slot-plan-then-fetch refactor of the engine** (fetch only the topics the draws land on).
  The right long-term shape, but it turns one query into a round-trip per retry and reopens
  `composePage`, which is the most-tested code in the repo. Sampling gets ~95 % of the win for
  ~5 % of the change. Revisit if K-sampling ever shows bias that (2) can't fix.

## Tests the plan would carry

- `db/feed.test.ts` (or the integration suite): same `sampleKey` → identical rows; different key →
  different sample; no topic exceeds `K`; no `(topic, source)` exceeds `K_SRC`; every topic in
  `topicIds` is present as a key (the empty-array-not-missing contract).
- `feed.integration.test.ts`'s cursor-stability test must keep passing unchanged — it is the
  SPEC §7 guarantee.
- `bun run bench:feed` before and after, recorded in the log: rows, MB, `getFeedPage` p50/p95.
- The dev-server experiment above, repeated: eight loads on a fresh process, RSS before/after.

## Why it matters beyond a laptop

8.1's VPS puts Postgres a network hop from the app; 7.3 said 35 MB per page there "is the whole
latency budget". Production's corpus follows local after every deploy and nightly walk, so this
is a deploy blocker in all but name — and the Tumblr budgets add ~89,500 rows on top of the
122,458 now.
