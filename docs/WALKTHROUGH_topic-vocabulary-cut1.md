# Walkthrough — topic vocabulary growth, Cut 1

What actually happened when `docs/PLAN_topic-vocabulary-cut1.md` was executed, with the numbers a
later session would otherwise have to re-derive. Design: `docs/DESIGN_topic-vocabulary-growth.md`.

## Baseline

Taken on the **local** dev database immediately before the first edit (09-02-26). Production is
behind local — it has neither `thingsorganizedneatly` nor `thisiscolossal` yet (design §10), so its
backfill is much smaller than the numbers here.

```
items: 18332   null_topics: 0        (topic_id is still NOT NULL at this point)
```

Per source:

| source | rows |
|---|---:|
| aic | 1338 |
| archive | 59 |
| cma | 1528 |
| **doorofperception** | **318** |
| e2e | 1 |
| loc | 376 |
| met | 1545 |
| nasa-images | 520 |
| smithsonian | 1529 |
| **thingsorganizedneatly** | **891** |
| **thisiscolossal** | **6075** |
| wellcome | 1952 |
| wikipedia | 2200 |

Walk sources (bold) total **7,284**, so the migration's backfill should write 7,284 rows with
`origin = 'curator'` and 11,048 with `origin = 'seed'` — 18,332 in all, one per item. There are no
`streetartnews` rows in this checkout's database (the plan's §0 Q1 anticipated up to 87 from the
trial branch; that branch's rows were written to a different local state). The frozen source list in
the migration still names it, which is harmless: the `CASE` simply never matches.

## Task 1 — migration

`bunx drizzle-kit generate --name=item_topic` produced exactly the five statements the plan
predicted — nothing else moved, and `idx_item_topic_score` on `item` survived. The backfill was
hand-appended to the same file so production's boot path (`drizzle-kit migrate`, and nothing else)
picks it up. After `bun run db:migrate`:

```
counts: {"items":18332,"memberships":18332}
origin curator 7284
origin seed 11048
missing: 0
stray: 0
```

One membership per item, and the `curator` count is exactly the three walk sources' baseline rows
(318 + 891 + 6,075). Both integrity checks are zero.

The typechecker's worklist was **the same 15 sites** the plan captured on 09-02-26 — `main` had not
moved under it, so Tasks 2 and 3 apply verbatim:

```
src/app/g/[itemId]/page.tsx(59,5)
src/components/saved/saved-screen.tsx(94,11)
src/components/sheets/item-sheet.tsx(72,9)
src/components/sheets/save-to-collection-sheet.tsx(70,9)
src/server/api/routers/saves.ts(110,57)   src/server/api/routers/saves.ts(111,47)
src/server/db/feed.ts(126,37)
src/server/services/gallery-rail.ts(228,32)  (294,34)  (313,5)
src/server/services/wander.ts(109,39)  (131,45)  (132,38)  (141,16)  (141,46)
```

## Task 7 — dry run

`bun run ingest --source doorofperception --dry-run`, the whole run in **17.9 s** — the 318 rows
already in the DB were skipped before curation, and the 69 that survived the floor were curated
**from the on-disk cache**, which is the read-forward working. Nothing was re-billed.

```
Walk sources (Phase 6.3)
source            pages   offered   errors  complete  no-image
doorofperception  4       390       1       yes       0

classification (memberships — an item filed under two topics counts in both):
  architecture             1
  portraiture              1
  (un-homed — stored)      68

Pipeline totals
already in DB (skipped):  318
would store un-homed (walk): 68
  top tags among them:    art 49 · psychedelic 26 · consciousness 23 · photography 23 ·
                          science 21 · colorful 18 · surreal 18 · nature 17 · perception 17 ·
                          videos 17 · abstract 16 · books 14
structural floor dropped: 3 (dup-title 0, bare-title 0, thin-summary 3)
curated:                  69
would insert: 69 (--dry-run, no writes made)
memberships written:      0 (--dry-run)
```

68 un-homed against the plan's estimate of ~70; the two that *did* land a topic are posts the blog
published since Phase 6.3's run, so they were the only real LLM calls in the batch.

**The tag histogram is the point of the exercise** and it reads as a coherent cluster on the first
try: `psychedelic 26 · consciousness 23 · perception 17 · surreal 18` is a candidate topic staring
back — exactly the "evidence for a new topic, not against the source" the design predicted. Under
6.3 all 68 of these were destroyed on the way in.

## Task 8 — first real run

`bun run ingest --source doorofperception` (14.8 s):

```
already in DB (skipped):  318
stored un-homed (walk): 68
  top tags among them:    art 49 · psychedelic 26 · consciousness 23 · photography 23 · …
curated:                  69
inserted:               69
memberships written:      2
```

`memberships written: 2` is the read-forward proving itself: 67 of the 69 came back from the
curation cache as `topics: []` (they were Phase 6.3's null-topic drops), so they wrote a row and
no membership. The two that *did* get a topic — one `architecture`, one `portraiture` — are posts
published since 6.3 and were the only LLM calls the run made.

Database after:

```
unhomed: 68
totals: {"items":18401,"memberships":18334}     (18,332 + 69 rows, 18,332 + 2 memberships)
missing: 0
```

Top un-homed by score, and why the tag histogram is the interesting artifact:

```
10 image  Santiago Ramón y Cajal The Beautiful Brain   ["scientific illustration","organic abstraction","vintage diagram"]
 9 image  Sophy Hollington Carving New Realities       ["linocut","surreal folk art","cosmic and terrestrial"]
 9 image  Lachlan Turczan Synesthetic Resonance        ["surreal landscape","light sculpture","ethereal"]
 9 image  Nick Brandt The Day May Break Chapter I & II ["surreal","evocative","stark","symbolic"]
 9 image  Micah Ofstedahl The Invisible Force          ["surreal landscape","bare trees","golden hour"]
```

A score-10 Cajal plate was among the items 6.3 threw away.

**Eyeballed against the running dev server** (`/i/CAmeSvmqHN8pzcpBUds4q` and `/g/…`, both HTTP 200,
no error markers in either response):

- The item page renders title and summary, and the **wander teaser is simply absent** — none of
  `a drift from` / `a longer leap` / `more from` appears in the HTML.
- The gallery rail came back **all-wildcard against the live app, not just in the unit test**: the
  anchor serializes as `topicId: null` and all eight cells carry `via: "wildcard"`, landing in
  mythology, botany, ceramics, architecture, astronomy, zoology, ceramics, machines — eight
  unrelated topics, which is exactly what "no walk to start" looks like.

**The feed did not move.** `bun run probe:feed --uniform --pages 3`: 16 distinct topics across 36
cards, **zero `(none)` topic columns**, 0 source-adjacency violations, tier mix 36/47/17. No
un-homed item reached a card. `items.integration.test.ts`'s "an un-homed item is never drawn"
passes.
