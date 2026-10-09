# How many readers can the current hosting take? — capacity estimate, 10-09-26

**Written:** 10-09-26 (overnight) by Fable 5.1, from Ben's ask before sleep: a plan to estimate
how many users the current architecture supports, executed as far as the night allowed. Every
number below was **measured tonight on production** (VM 202, commit `9f5b2b1`), read-only, with
the load generated from the Mac over the LAN (`http://192.168.1.202:3000`, bypassing Cloudflare
and the tunnel) and CPU sampled over ssh. The classifier refused copying a probe onto the VM, so
nothing ran on the host itself; the LAN path measures the same app and the same Postgres.

## Headline

**The wall is Postgres CPU on the feed's pool-sampling query, at about 2.5 feed pages per second
for the whole box.** Everything else — images, the tunnel, memory, disk, the item page — is an
order of magnitude further away.

| | estimate |
|---|---|
| Readers scrolling **at the same moment**, comfortable (p95 page under ~1.5 s) | **~20** |
| Readers scrolling at the same moment, saturated (pages 2–3 s, no errors) | ~40 |
| Invited accounts that produces, by the usual beta ratios (below) | **several hundred** |
| The next few dozen invites | nowhere near any of it |

The wall is a slow feed, not an outage: at saturation a page takes 2–3 s and nothing fails
(0 errors in every run). The first thing a reader would notice is the spinner after a scroll.

**Assumptions the number rests on** (change one, the estimate moves with it):

- An active reader consumes **one feed page (12 cards) per ~30 s** and opens an item every ~2 min.
  The client prefetches the next page early, which is the same page a moment sooner, not an extra
  one.
- A signed-in page costs **1.9× a signed-out one — measured 10-09 morning**, Ben's account in
  the production container: `bench:feed` over 12 real pages, **p50 1,190 ms, p95 1,429 ms,
  min 637 ms** (the `NOT EXISTS seen_item` filter over 4,610 seen rows and a real weight set),
  against explore's 637 ms p50. So the box composes ~1.3 signed-in pages/s at saturation, which at
  one page per 30 s per reader is ~40 readers saturated and ~20 comfortable. (The same run put
  `getTopicPools` over all 193 topics at 2,012 ms / 10,785 rows / 1.9 MB — the ceiling a page
  never pays since the 09-11 planned fetch.)
- Peak concurrency for a calm, evening-weighted app is **5–10 % of daily actives**, and daily
  actives are **30–50 % of invited** during a beta. 20–35 concurrent ≈ 200–500 daily actives ≈
  400–1,000 invited; with the signed-in cost measured, **~20 concurrent ≈ 200–400 daily actives
  ≈ 400–800 invited**. Treat the lower bound as the planning number.

## What was measured

VM 202: 4 vCPU (i5-8259U @ 2.3 GHz), 8 GB RAM (6.0 GB available), 116 GB disk / **34 GB free**,
Ubuntu 24.04, Docker. Postgres 17-alpine at defaults (`shared_buffers` 128 MB, `work_mem` 4 MB,
`max_connections` 100, 2 parallel workers per gather). App container 224 MiB idle / 364 MiB under
load; Postgres 162 / 312 MiB. Image cache **29 GB, 205,368 masters** (~150 KB each); database
367 MB (`item` 260 MB, `item_topic` 98 MB, `seen_item` 1 MB). Corpus 214,018 items, 678,004
memberships, 193 topics. Idle load average 0.26; Coolify itself ~6 % CPU. A second tenant
(`tmwkqzly…`) shares the VM and was idle.

Load from the Mac over the LAN, per-IP limiters sidestepped with a fresh `x-forwarded-for` per
request (valid only with nothing between probe and app). `busy` is the VM's whole-CPU busy mean
during the run (`top`).

| path | c | req/s | p50 | p95 | busy | note |
|---|---|---|---|---|---|---|
| `GET /api/health` | 4 | 353 | 11 ms | 16 ms | 30 % | the floor |
| `feed.explore` (a signed-out feed page) | 1 | 1.5 | 637 ms | 1,086 ms | 56 % | |
| `feed.explore` | 2 | 2.2 | 925 ms | 1,449 ms | 87 % | **saturated at two** |
| `feed.explore` | 4 | 2.5 | 1,498 ms | 3,260 ms | 88 % | Postgres 381 % CPU, app 15 % |
| `GET /i/[id]` (SSR item page + rail) | 1 | 2.2 | 313 ms | 1,144 ms | 46 % | |
| `GET /i/[id]` | 4 | 3.8 | 953 ms | 1,651 ms | 42 % | |
| `GET /api/img/[id]` (masters off disk) | 8 | 241 | 30 ms | 58 ms | 30 % | ~200 Mbit/s on the LAN |
| `GET /` (landing: reel + an explore page) | 1 | 1.3 | 711 ms | 1,238 ms | 58 % | |
| `GET /` | 4 | 2.6 | 1,325 ms | 2,989 ms | 84 % | same wall as explore |

Through Cloudflare and the tunnel, from the Mac: `/api/health` 108 ms, a feed page ~900 ms, a
master image 140 ms p50 / 310 ms p95; **120 uncached masters, 12 in parallel: 21.7 MB in 1.8 s =
≥ 100 Mbit/s** (the probe ran out of images before the link ran out of room). **Cloudflare
caches the images at its edge** (`cf-cache-status: HIT` on a repeat — the route's
`public, max-age=31536000, immutable` is honoured), so a picture crosses the tunnel once per
Cloudflare site, not once per reader.

## Where the time goes

`EXPLAIN (ANALYZE)` of `getTopicPools`'s query for the 35 biggest topics (the worst case; a real
page plans 30–40 topics, biased to the big ones — hence the 637 ms p50 against this 2.7 s):

```
Hash Join  … actual time=205..1,062 ms  rows=502,135      ← item_topic ⋈ item, seq scan of all 678k memberships
Sort       … external merge  Disk: 45,432 kB               ← work_mem 4 MB
WindowAgg  … actual time=2,591..2,760 ms  rows=6,662       ← row_number() over md5(id||key), per (topic, source)
WindowAgg  …                               rows=2,061      ← row_number() per topic, ≤ 60 kept
Execution Time: 2,733 ms
```

Half a million rows are joined, hashed with `md5`, sorted and numbered to keep two thousand.
The cost is **the shape of the sample, not the settings**: the same query with `work_mem` at
96 MB (the sort in memory) runs in 2,432 ms (−11 %); parallel workers off 2,507 ms; JIT off
2,445 ms. The planner also underestimates the join 4× (124k vs 502k), which does not change the
plan's shape. The 09-08 pool-sampling design made the cost O(topics × memberships) rather than
O(corpus); at 678k memberships the biggest topics *are* most of the corpus.

## The other ceilings, checked

- **Bandwidth.** A scrolling reader pulls ~1.8 MB per 30 s ≈ 0.5 Mbit/s. Tonight's ≥ 100 Mbit/s
  through the tunnel is 200+ concurrent scrollers before Cloudflare's edge cache is counted. Not
  a ceiling; the number to recheck if the ISP changes.
- **Images.** Off disk at 240 req/s on 30 % CPU; 20 req/s is a page a second for every reader at
  the feed wall. Not a ceiling. The 960 px renditions are derived on first request (sharp, one
  CPU-bound call each, cached after) — a burst of *new* questionnaire or hang pictures costs a
  little once.
- **Memory.** 6 GB free against ~700 MB used by app + Postgres under load. Not a ceiling. (The
  driver's default pool is 10 connections; `max_connections` 100.)
- **Disk.** 34 GB free; the weekly ingest adds ~5k pictures ≈ 0.75 GB a week → ~10 months of
  headroom at today's pace, **independent of readers** (a reader adds ~200 bytes per item seen).
  Watch this one in the usual `df -h`; it is the clock, not the user count.
- **Rate limits.** 120 tRPC calls/min and 600 images/min per reader or IP — a scroller uses ~4
  and ~24 a minute. Behind one office NAT, signed-out visitors share an IP bucket; signed-in
  readers key on their user id. Not a ceiling at beta scale.
- **The weekly ingest** (Mon/Tue pictures, Thu/Fri writing, 08:00 UTC, 70+ min) runs on the
  same four cores with the curator and sharp: feed capacity roughly **halves** for that hour.
  Fine at beta scale; the first lever below also makes it matter less.
- **Cloudflare free tunnel:** no bandwidth cap; the 100 MB single-upload cap is irrelevant here.
- **The other tenant** on VM 202 was idle tonight; its load subtracts from the same four cores.

## Levers, in order of return

1. **Do nothing until the first few dozen readers are in.** Tonight's three readers are 0.5 %
   of the comfortable number. Ship the usage report (`docs/PLAN_usage.md` Cut 0) and read
   *sittings per day* — the real concurrency is derivable from `seen_item` timestamps, and that
   measured number replaces the ratios above.
2. **Reshape the sample — the 10× lever** (a design task, ~a day): give `item_topic` an
   indexed random key (`rk real` or the first bytes of `md5(item_id)`, index `(topic_id, rk)`) and
   draw each topic's 60 as a range `WHERE rk >= seedOffset ORDER BY rk LIMIT n` per topic
   (`LATERAL`, wrap at 1.0), applying the per-source cap and the seen filter over ~120
   candidates in SQL or JS. O(topics × 60 index rows) instead of O(memberships). The cursor keeps
   its seed → offset determinism, so a page stays a pure function of its cursor. Expected: a page
   from ~640 ms to well under 100 ms, the wall from ~2.5 to ~25+ pages/s. Also what makes the
   explore/landing page cheap enough to leave public.
3. **Cache the signed-out page** (~2 h): `/` and `/explore` are persona-dealt by the cursor's
   seed and read nothing about the caller, so an in-process LRU keyed on the cursor (60 s) makes a
   shared link or a scraper cost one composition, not one per visit. Worth doing before the
   landing is ever shared widely; irrelevant to signed-in capacity.
4. **`work_mem` 4 → 64 MB** (one minute, Ben): −11 % on the worst case; the sort stops spilling
   to the container's disk. Script below. Harmless at ten connections; not worth a deploy on its
   own.
5. **More vCPUs** for VM 202 (the NUC's i5-8259U has 8 threads; the VM has 4; the other tenant
   and Coolify share them): roughly linear for Postgres, so +50–100 %. Proxmox, a reboot, no code.
6. **Move Postgres off the app host** or a bigger box: the step after 2 and 5 are spent.

## For Ben, in the morning

1. ~~The signed-in number~~ — **measured 10-09 morning** (`sh .cache/capacity-bench-prod.sh`):
   p50 1,190 ms, so the estimate above stands at its lower bound. (`bench:feed`'s header comment
   saying it writes `seen_item` rows is stale — `getFeedPage` writes nothing; fix it in Cut 0.)
2. **Re-run the LAN probe after any lever** (reads only; from the Mac):
   ```sh
   sh .cache/capacity-probe/stage.sh explore 2 16     # the saturation point today
   sh .cache/capacity-probe/stage.sh item 4 12
   ```
3. ~~`work_mem`~~ — **applied 10-09 morning**: `ALTER DATABASE ambit SET work_mem = '64MB'`.
   Not `ALTER SYSTEM`: the `ambit` role is not a superuser (`postgres` is), so the per-database
   form is the one it may run; it reaches new connections only, so the app's pool picks it up as
   connections recycle or on the next deploy. Reversible: `sh .cache/capacity-work-mem.sh 4MB`.
4. **Decide whether lever 2 becomes a design doc** (`docs/DESIGN_pool-sampling-by-key.md`). My
   recommendation: yes, scheduled after the usage Cut 0 and before the invite count passes ~50 —
   it is the one piece of work that changes the shape of every other number here.

## Caveats

- One night, one VM, the Mac as the load generator on the same LAN; `top`'s one-second samples
  every 2 s. Good to ±30 %, not better.
- The probe sidesteps the limiters by spoofing the last `x-forwarded-for` hop; through Cloudflare
  that is impossible (Cloudflare appends the real address), which is the limiter working.
- The worst-case EXPLAIN uses the 35 largest topics; a real page's planned set is smaller and the
  measured p50 (637 ms) is the honest per-page number.
- No measurement of a *mixed* load (pages + items + images at once); the components add, and
  images are so cheap the sum is the pages.
