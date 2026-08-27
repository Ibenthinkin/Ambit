# Phase 6.3 walkthrough — blog adapters, doorofperception live as link cards

**Executed 08-27-26** against `docs/PHASE6_PLAN_6.3.md` (design: `docs/PHASE6_DESIGN_6.3.md`), on
branch `feat/6.3-blog-adapters`.

**Status: in progress.** Sections are appended as each task lands its evidence.

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

**Steps 3–4 (the sweep and the delete) are attended** — `DISK_ROOTS` edit in ambit-archive, a sync
whose 20% mass-drop guard is *expected* to block, `--force-sweep` with Ben reading the number, then
`--confirm` here. Recorded below when run.

