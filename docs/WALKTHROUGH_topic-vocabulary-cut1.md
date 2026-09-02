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
