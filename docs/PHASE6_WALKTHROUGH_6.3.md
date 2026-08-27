# Phase 6.3 walkthrough — blog adapters, doorofperception live as link cards

**Executed 08-27-26** against `docs/PHASE6_PLAN_6.3.md` (design: `docs/PHASE6_DESIGN_6.3.md`), on
branch `feat/6.3-blog-adapters`.

**Status: complete on the Ambit side (T1–T13); D2's production sweep on VM 202 outstanding** —
see *D2 — archive retirement*, Step 3.

---

## The histogram — all 390 posts, before any write

The phase's gate (plan T7, design D4): the curator's classify mode over every doorofperception
post, `--dry-run`, nothing written. Recorded verbatim from
`bun run ingest --source doorofperception --dry-run` (181.9s; ~386 curator calls, all cached
from here on).

```
  doorofperception: toItem failed — Error: doorofperception: post "terence-mckenna-cyber-culture" has no featured image

────────────────────────────────────────────────────────────────────────
Per-source
────────────────────────────────────────────────────────────────────────
source      searched  offered   errors  collisions  no-image

────────────────────────────────────────────────────────────────────────
Walk sources (Phase 6.3)
────────────────────────────────────────────────────────────────────────
source            pages   offered   errors  complete
doorofperception  4       389       1       no

classification:
  mythology                109
  portraiture              59
  botany                   47
  architecture             30
  astronomy                17
  machines                 13
  zoology                  9
  the-ocean                8
  ancient-history          7
  geology                  5
  music                    5
  typography               5
  textiles                 2
  cartography              1
  poetry                   1
  (no honest topic — dropped) 68

────────────────────────────────────────────────────────────────────────
Pipeline totals
────────────────────────────────────────────────────────────────────────
already in DB (skipped):  0
no-topic dropped (walk):  68
structural floor dropped: 3 (dup-title 0, bare-title 0, thin-summary 3)
curated:                  386
would insert: 318 (--dry-run, no writes made)

────────────────────────────────────────────────────────────────────────
Per-topic would-insert
────────────────────────────────────────────────────────────────────────
  test-feed-topic-jdty8p4U 0
  machines                 13
  test-feed-topic-So2EKoPn 0
  ancient-history          7
  architecture             30
  botany                   47
  music                    5
  mythology                109
  poetry                   1
  portraiture              59
  textiles                 2
  the-ocean                8
  typography               5
  zoology                  9
  astronomy                17
  cartography              1
  ceramics                 0
  geology                  5

elapsed: 181.9s
```

**Reading it.** 389 posts normalized (the 390th, `terence-mckenna-cyber-culture`, has no featured
image and is correctly an error, not a silent zero); 3 dropped at the structural floor for a thin
summary; of the 386 curated, **318 (82%) received one of the sixteen topics and 68 (18%) were
honestly refused** — well above the ~30% yield the plan set as the stop-and-show line. The
distribution is lopsided on purpose: `mythology` takes 109 (the blog's visionary/psychedelic core
has no better home among the sixteen, and the curator was told to say "none" rather than force-fit
— it did so 68 times), `portraiture` 59, `botany` 47, `architecture` 30. `ceramics` got nothing.
The null bucket is the input to the separate topic-expansion job the design names, not a defect
here.

**Hero fetchability.** T6's walk table had no `no-image` column when this ran (fixed in the next
commit), and the curator cache hides the answer on a re-run — so it was checked directly: 20 of
the first page's hero URLs fetched through the curator's own path (`USER_AGENT`, `image/*` mime
check) → **20 OK, 0 failed**. The classification above was image-informed, not blind.

## The ingest — 318 rows, idempotent on the second pass

`bun run ingest --source doorofperception`, three times in a row on 08-27-26, each ~16s (every
curator call a cache hit from the histogram run — the LLM cost of the real ingest was ≈ $0):

| run | walk | complete | already in DB | curated | inserted | prune section |
| --- | ---- | -------- | ------------- | ------- | -------- | ------------- |
| 1 — first write | 4 pages · 389 offered · 1 error · no-image **0** | no* | 0 | 386 | **318** | none |
| 2 — re-run | same | no* | **318** | 68 | **0** | none |
| 3 — after the completeness fix | same | **yes** | 318 | 68 | 0 | none (nothing gone) |

\* **What run 2 exposed.** The plan expected `complete yes` on the re-run and got `no`. As T6
specified it, `complete` required `errors === 0` — and doorofperception has one post
(`terence-mckenna-cyber-culture`) with no featured image that `toItem` rejects on *every* walk. So
a walk of that blog could never be complete, and `--prune` could never act on it. Fixed by
splitting `pageErrors` out of `errors`: a failed **page** voids completeness (the cursor past it
cannot be trusted); a single rejected **post** does not. The total still prints in the table.
Related and deliberate: a rejected raw is *not* added to `seenSourceIds` — it was never a row, so
`planPrune` cannot name it; and if a post once had a hero and lost it, it *should* go.

The 68 null-topic posts pass through the curator on every run (68 cache hits, free) because a
refused item is dropped, not stored — there is nothing in the DB to skip them by. Expected, and
what "never force-fit" costs: one cached read per refused post per run.

**Scores, against the corpus it will partly replace** (D2 retires the archive's doorofperception
scrape; the `archive` row is the pre-retirement baseline):

| source | rows | avg | min–max | ≥8 | rows with `body` |
| --- | --- | --- | --- | --- | --- |
| **doorofperception** | **318** | **8.64** | 4–10 | 292 (92%) | **0** |
| archive (baseline, 310 of which most are doorofperception images) | 310 | 8.56 | 7–10 | 291 (94%) | 0 |

Corpus total after the ingest: 11,617 items; the blog is 2.7% of it. Five random rows, as
classified — every one a defensible filing, none a force-fit:

- *Daniel Stier Ways Of Knowing* → `machines` · 9 · scientific diagram, mid-century modern, color theory  <!-- /i/sKsRRpdmeuF2YaGWFzN1N -->
- *Aldous Huxley The Doors Of Perception* → `portraiture` · 8 · round glasses, striking portrait, intellectual  <!-- /i/XXvB9vz6bK90NrAxJcF3K -->
- *Paul Laffoley The visionary* → `mythology` · 9 · visionary art, diagrammatic, psychedelic science  <!-- /i/29WT33DzikfCg8vOtV6xl -->
- *Vipassana Meditation* → `mythology` · 8 · quiet portrait, meditative, monochrome  <!-- /i/KGBSAv02FgUdH7np6Gv4f -->
- *Aldous Huxley The Gravity of Light* → `portraiture` · 7 · quiet portrait, intense gaze  <!-- /i/gsuneqpO30CWimaTy5ooM -->

## Feed check

`bun run probe:feed --uniform --pages 4`: **5 doorofperception cards in 4 pages**, all filed under
`mythology` (the 109-row bucket, so the likeliest to surface), reached by every tier — one CORE,
three DRIFT (`astronomy → mythology`, `poetry → mythology`, `portraiture → mythology`), one JUMP
(`music → mythology`). Nothing in the draw path filters on source; the integration test added in
T8 pins that.

## D2 — archive retirement (attended)

Recorded in Ambit-Admin first (T11: `log.md` 08-27-26 entry, `Roadmap & Backlog.md` ticks,
`Ecosystem Architecture.md` corpus-walk + DoP paragraphs, status table) — per that project's rule
that contract changes and private-source integrations are written down there before they happen.

**Step 1 — provenance export (archive side, read-only).** `archive_provenance.external_id LIKE
'%/storage/sources/doorofperception/%'` → **11,496 distinct archive items** (the scrape had 11,572
files; content-hash dedupe collapsed 76). Ids written to the session scratchpad.

**Step 2 — Ambit's retire script, dry.** `bun run retire --source archive --ids <file>`:
**251 matching item rows** for source `archive` out of its 310 — the doorofperception images Ambit
has been showing under `attribution: "Personal archive"` with no post link — and **0 `saved_item`
rows** would go with them (nobody has saved one). The other 59 archive rows are personal material
and stay.

**Step 3 — the sweep (archive side), run 08-27-26 on the Mac's dev copy.** Two things the plan
did not know, both found by trying to do what it said:

- **There was no `DISK_ROOTS` entry to remove.** The plan wrote "remove the
  `…/storage/sources/doorofperception` entry (colon-separated; leave the others)", but `.env` held
  the single root `./storage/sources`, and `doorofperception/` is its *only* subfolder. An empty
  `DISK_ROOTS` is rejected at startup (`DISK_ROOTS is empty — nothing to walk`), and a root that
  does not exist is recorded as a connector *problem*, which blocks the sweep with no override —
  so neither "blank it" nor "point it somewhere missing" can produce a sweep. Mechanism used:
  `DISK_ROOTS=./storage/sources/personal`, a new **empty sibling** of the scrape folder, which is
  also where future loose personal files go. Nothing moved, nothing deleted — the folder still
  holds 392 entries and `index.csv` (3.26 MB, 08-08) is untouched.
- **The zero guard fires, not the ratio guard.** `bun run sync --connector=disk` →
  `disk: seen 0 · created 0 · linked 0 · skipped 0 · failed 0 (0.0s)` then `sweep blocked: run saw
  0 assets — an empty source is indistinguishable from a broken one — re-run with --force-sweep if
  the source really is empty`, exit 1. The plan predicted the 20% mass-drop guard ("85% > 20%"),
  which assumed other roots would still yield files; with the walk empty the zero guard is
  reached first. Either way the archive's safety worked and asked for a human. Then
  `bun run sync --connector=disk --force-sweep` → **`sweep: retired 11568 provenance · withdrew
  11496 items`**, exit 0.

  After, in `archive.db`: disk provenance 11,572 rows, **all** `removed_at` set (4 had been
  retired before D2); immich 2,018 live; `archive_item` 13,514 total, **11,496 withdrawn**, and
  the join `provenance LIKE '%/doorofperception/%' AND withdrawn_at IS NULL` = **0**.
  `connector_run.disk` re-baselined to `asset_count 0`. Served, on a throwaway `bun src/server.ts`
  at :3011: `/health` → `{"ok":true,"items":1993}` (was 13,380-class), and `/search` for
  *visionary art*, *psychedelic poster* and *botanical illustration* returns personal material
  only — the ranked list still fills to `limit`, as the plan said it would.

- **But that is the dev copy, and Ambit does not read it.** Before touching anything I checked
  where Ambit's 310 archive rows point: **all 310 carry `https://archive.home.benreilly.io` image
  URLs** — the A.6 deployment on VM 202 (`ARCHIVE_URL` in `.env`), whose Coolify volume holds its
  own `archive.db` and `/app/storage/sources/doorofperception/` (rsynced 08-23) under
  `DISK_ROOTS=/app/storage/sources` in the Coolify env. Production still answers `/health` with
  **13,380 items** and ranks scrape images for *visionary art*. SSH to `ben@192.168.1.202` refuses
  the agent's key (`publickey,password`), so **the production half of D2 is not done** and is the
  one attended step that remains. What it needs, in-container on VM 202 (`C=$(docker ps -q
  --filter name=tmwkqzly5mr8svazskcqtyvn)`): `mkdir` the empty subdirectory in the volume,
  repoint the Coolify `DISK_ROOTS` to `/app/storage/sources/personal`, redeploy, then
  `docker exec "$C" bun run sync --connector=disk` (expect the zero-guard block) and
  `… --force-sweep` (expect the same line, ± the two 08-24 purges). One consequence to decide
  there: with an empty root the **weekly Sunday `sync --connector=disk` task will exit 1 on the
  zero guard every week** — disable the scheduled task, or accept a standing red.

**Step 4 — Ambit's delete, run 08-27-26.** `bun run retire --source archive --ids <file>
--confirm` → `251 matching item row(s) for source "archive"; 0 saved_item row(s)` →
**`deleted 251 item(s) and their seen/saved rows`**. Dry re-run: `0 matching item row(s)`.
Counts after: **`archive` 59** (310 − 251), **`doorofperception` 318**; `body IS NOT NULL` for
doorofperception = 0. `bun run ingest --source archive --quota 5 --dry-run --skip-llm` against
production: 1.9 s, no errors — the adapter is unaffected by the slimmer archive it will meet.

**Hazard until the production sweep runs:** a default `bun run ingest` includes `archive`, and
production still ranks the scrape, so an unqualified ingest can re-insert miscredited rows. Run
with `--source <x>` until VM 202 is swept; the retire script is idempotent and the ids file is
`archive_provenance.external_id LIKE '%/storage/sources/doorofperception/%'`, so a second pass
costs one command.

## The done-bar, item by item

1. `bun run test` green including `source-invariants`, `blogs.test`, `robots.test`, `http.test`,
   the walker fixtures, curator classify, `topicHistogram`/`planPrune` — ✅ (T13's `bun run check`
   run is recorded in `log.md`).
2. `bun run ingest --source doorofperception` idempotent, `complete yes`, no prune — ✅ (above).
3. `/i/<blog item>` shows title · maker line once · `from:` · blurb · link-out row · no reader
   sections — ✅, e2e-asserted.
4. `select count(*) from item where source in (WALK_SOURCES) and body is not null` = 0 — ✅.
5. `/search` on the archive returns no doorofperception image; Ambit holds 0 archive rows with DoP
   provenance; `index.csv` and files untouched — ✅ on the **dev copy** and in Ambit; **⏳ on
   production** (VM 202), see Step 3.
6. Ambit-Admin log carries the D2 and contract entries, dated before the sweep — ✅.

## What to remember

- **The 800 px hero.** `featured_media` is a purpose-made crop — tile- and hero-grade, not
  gallery-grade. Full-resolution originals for these posts exist only in the archive's
  `index.csv` + files, which is why those stay on disk.
- **The 68-post null bucket is the topic-expansion input**, not a defect. The curator's "none" is
  honest; a psychedelia post force-fit into `botany` would teach the drift graph something false.
- **A cached curator run cannot tell you whether images fetched.** The `no-image` column is only
  readable on a first pass; re-runs answer from the cache.
- **A walk that can never be complete is a `--prune` that can never run** — `pageErrors` vs
  `errors`, and a rejected post is not a row, so `planPrune` cannot name it.
- **Before an ops step, check which instance a URL points at.** The plan's D2 targeted the Mac
  `.env`; every row Ambit holds points at VM 202. Reading `image_url` hosts first cost one query
  and would have cost a wasted "done" otherwise. Corollary for the archive's disk connector: a
  single-root `DISK_ROOTS` has no entry to remove — repoint it at an empty sibling, never blank it.
- **50watts is cut** (`Disallow: /`, REST 403 regardless of UA). Blog #2 is Public Domain Review
  (RSS walk) or thingsorganizedneatly (Tumblr JSON walk) — each its own adapter on the same
  `CorpusWalkAdapter` contract; no third shape.

