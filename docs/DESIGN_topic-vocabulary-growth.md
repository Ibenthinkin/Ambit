# Design — the topic vocabulary grows to fit the corpus

**Written:** 09-02-26, in the session that built the streetartnews adapter and stopped when its
42% refusal rate stopped looking like a defect.
**Status:** **Cut 1 built 09-02-26** — plan `docs/PLAN_topic-vocabulary-cut1.md`, walkthrough `docs/WALKTHROUGH_topic-vocabulary-cut1.md`; Cuts 2–3 (§11) unbuilt. Four structural decisions taken (§3), each
by an explicit choice between stated alternatives.
**For:** Fable, writing the execution plan for Cut 1 in a fresh session, and the cheaper session
that executes that plan afterwards. Both should be able to work from this file alone — it names
files and line numbers rather than describing them, and §11 lists what it deliberately leaves out.

> **Read §12 before planning.** Two threads are in flight in this repo that touch the same code,
> and one of them (`docs/PLAN_publicdomainreview.md`) rewrites the exact function Cut 1 rewrites.

---

## 1. The principle

This is the thing to write into `SPEC.md` and `CLAUDE.md`. It is a **core project principle**, not
a phase's implementation note.

> **Walk sources ingest their whole corpus; the topic vocabulary grows to fit them, never the
> reverse.**
>
> A blog is designated because the *blog* was judged worth having. Every post that clears the
> structural floor and the curator's quality bar is stored, whether or not Ambit currently has a
> topic that fits it. An item's source tags and the curator's aesthetic tags are always stored, and
> are the raw material from which new topics are proposed.
>
> **Search-shaped sources are the exception and stay bound to the topic list** — a search source
> needs a query, and the topic list is where queries come from.
>
> The short form: **topics are the vocabulary Ambit _asks_ with; tags are the vocabulary the world
> _answers_ in.** Museums are pulled by topic. Blogs push their own vocabulary in.

**The bar that still applies.** "Everything" means everything that clears **quality**, not
literally every post. `structuralFloor` (thin summary, bare title, dup-title with the walk-source
exemption) and the curation score are untouched. Ben's ask was about *subjects*, not standards —
confirmed explicitly in the session.

**The sixteen were always a floor.** `src/server/config/topics.ts`'s own header already says so:
*"the chip grid grows toward the handoff's thirty-two in Phase 6, once new harvests land and the
graph is recomputed."* This principle is that plan catching up with itself, not a reversal of it.

---

## 2. Why — the evidence that forced it

Ambit currently **destroys** good items at ingest for one reason only: no topic fits them.

| walk source | curated | written | dropped for topic fit |
|---|---:|---:|---:|
| thisiscolossal (full walk, local) | 8,732 | 6,075 | **2,657 (30%)** |
| thingsorganizedneatly (full walk, local) | 1,720 | 891 | **829 (48%)** |
| doorofperception (production) | ~390 | 318 | ~70 (~18%) |
| streetartnews (sample of 150, 09-02-26) | 150 | 87 | **63 (42%)** |

That is **~3,500 items** already discarded locally, and the rate is rising as the blogs get better.

**The refusals are not a tail.** The streetartnews sample is the clearest case yet: the refused
pile averages **7.62** against the classified pile's **7.95** — a 0.33 gap — and contains two 9s
(Snik's *"Still Life"*, Ai Weiwei's *"Don Quixote"*). These are not weak items being correctly
filtered. They are strong items with nowhere to live, because street art is a genre the sixteen
topics have no shelf for.

**Nothing is permanently lost.** Blogs are walkable at any time and `.cache/curation` keys on
`(source, sourceId)`, so recovering the ~3,500 is a re-walk, not a re-purchase. This is why the
work can be done properly rather than urgently.

**The mechanical cause is one line.** `src/server/db/schema.ts:185` —

```ts
topicId: text("topic_id").notNull().references(() => topic.id),
```

One mandatory topic per item. The curator's `CLASSIFY_PROMPT` only has a "or null" clause, and
`scripts/ingest.ts` only has a drop path, because the schema will not accept an item without a
home. Everything downstream follows from that `notNull()`.

**The tags are already there.** `schema.ts:181` stores `tags text[]` (GIN-indexed at `:210`) and
`:191` stores `aestheticTags text[]`. Every adapter already normalizes source tags through
`toItem`. streetartnews' `Yves Gallard`, `Ghent`, `Mural`, `Chromatic Vibration` are computed and
then thrown away with the item. **Harvesting blog tags is not new machinery — it is stopping a
deletion.**

---

## 3. The four decisions

Each was put to Ben as an explicit choice. The alternatives are recorded because a later session
will be tempted by them.

### D1 — Two tiers, with a promotion path

**Chosen.** Tags stay unbounded and source-derived (thousands). Topics stay the curated drift axis,
growing deliberately to hundreds. A tag becomes a topic when it has enough good items behind it.

*Rejected: one flat vocabulary* (every harvested tag is a topic) — because a topic in this codebase
is not a label, it is a contract with the drift graph. `topics.ts`'s header names the contract:
`topics.ts → topic table → topic-graph.json keys → item.topic_id → user_topic.topic_id`, and warns
that *"seeding a graph-less topic would give the feed somewhere to go and no way back out."*
Today's two probes produced `Ajuinlei` (a street in Ghent), `Wallin'` (an arts organisation), `The
Current` (a mural's name) and `family mart`. Excellent descriptors; dead ends as drift nodes.

*Rejected: derived clusters* (topics computed by clustering, the 16 as seeds) — topic ids would stop
being stable slugs, and `user_topic.topic_id`, saved-item history and the `/feed?topic=` URL space
all depend on that stability.

### D2 — Many topics per item

**Chosen.** A new `item_topic` join table; `item.topic_id` retired (see §5 for the deliberate
phasing of that retirement).

The one-topic constraint actively destroys information. In the streetartnews sample, *"David de la
Mano's 'Sea Skin' Connects Women, the Sea, and the Land"* scored 9 and was filed under **`poetry`**
— but `the-ocean` was equally honest, and once `street-art` exists it is a third. The classifier had
to pick one and discard the rest.

Many-to-many also makes promotion cheap: a new topic simply gains rows, with no re-decision about
which single topic wins.

*Rejected: keep one topic, make it nullable* — smallest change, but every promotion needs a
per-item re-decision and an item can only ever reach one audience.
*Rejected: one primary + a secondaries array* — two mechanisms means two sources of truth for
"what is this item about".

### D3 — Hybrid assignment: LLM multi-label at ingest, plus free tag backfill

**Chosen.** Two mechanisms, each covering the other's blind spot:

- **At ingest (LLM, cached):** classify mode returns an **array** of honest topics — possibly
  empty — instead of one-or-null.
- **On promotion (SQL, free, retroactive):** a topic owns a set of tags; membership is backfilled
  by a plain array-overlap query over `item.tags` and `item.aesthetic_tags`.

The evidence for needing both: **blog tags are unreliable** — two of streetartnews' three newest
posts had *zero* tags, and Tumblr captions barely tag at all — while `aesthetic_tags` (the
curator's own 2–4 descriptors, e.g. `[monochromatic, figurative mural, silhouette art]`) exist on
**every** item already.

*Rejected: purely tag-derived, retire classify* — cheapest and always-retroactive, but leaves
tagless posts leaning entirely on 2–4 aesthetic tags to find any home.
*Rejected: LLM multi-label only* — conceptually cleanest, but every vocabulary change re-bills the
whole corpus, and would require `cacheKey` to include a hash of the topic list.

### D4 — Cut 1 is principle + schema + ingest only

**Chosen.** Stop the dropping and make the data model right. **The feed, the topic graph and
onboarding do not move**, and still operate on the existing sixteen. Reachability of un-homed items
follows in Cut 2 via promotion.

*Rejected: through to reachable content* (Cut 1 + promotion + a first vocabulary expansion + graph
rebuild) and *full expansion* (+ onboarding hierarchy, `topicCap` redesign) — both sketched in §11.

---

## 4. What this overturns, and what it explicitly does not

### Overturned: Phase 6.3's D4

`src/server/services/curator.ts:62-64` currently reads:

> *"'or null' is the important clause (D4): a post with no honest home among the sixteen is dropped
> by ingest, never force-fitted — topic_id is the feed's unit of drift, and a psychedelia post filed
> under botany teaches the drift graph something false."*

**Half of this survives and is strengthened; half reverses.**

- *"never force-fitted"* — **kept, and made cheaper.** With an array answer the model no longer has
  to choose a least-bad home, so refusing a topic costs the item nothing. The reasoning about a
  psychedelia post under botany is still exactly right.
- *"is dropped by ingest"* — **reversed.** The item is stored with zero topic rows.

This is a documented decision being overturned, so it gets a **dated reversal note** in
`docs/PHASE6_DESIGN_6.3.md` and in the curator comment — not a quiet edit. Anyone reading the 6.3
design later must find out that D4 changed and why.

### Not touched: Phase 0.4's rejection of item-level embeddings

**This design adds no embeddings and no vectors.** `phase0/topic-graph.ts`'s header is the reason,
and it is worth quoting to whoever is tempted:

> *"Phase 0.4 killed item-level nearest-neighbour recommendation: embedding a museum item's
> `title + summary` mostly embeds catalog boilerplate (Met titles are a median of 4 words; 580 of
> our 3168 items share a title with another item — 67 are just "textile"). Cosine similarity over
> that text degenerates into string matching... There is no pgvector, no per-item vector in the
> database, no embedding call at request time."*

Verified 09-02-26: **there is no embedding code anywhere in `src/` or `scripts/`, and no vector
column in the schema.** Embeddings exist only in `phase0/`, used once, offline, to build the 16×16
graph.

One nuance a later phase may want to test, recorded so it is not mistaken for settled: the Phase 0
failure was about *what* was embedded. A Met title is 4 words; a streetartnews excerpt is 380
characters of written prose. Blog text may well embed fine where catalog text did not. **That is a
claim to test in a spike, not an assumption to build on**, and it is out of scope here.

### Also unchanged

The curated-weighted random draw; `structuralFloor` and every floor rule; the link-card rights
posture and `BLOG_LICENSE`; every source adapter; the `wp-rest` factory; the `SourceAdapter` /
`CorpusWalkAdapter` contracts (a cross-service agreement with ambit-archive and loupe — see
CLAUDE.md's ecosystem section).

---

## 5. Data model

### The new table

```sql
CREATE TABLE item_topic (
  item_id   text NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  topic_id  text NOT NULL REFERENCES topic(id),
  origin    text NOT NULL,          -- 'seed' | 'curator' | 'tag'
  PRIMARY KEY (item_id, topic_id)
);
CREATE INDEX idx_item_topic_topic ON item_topic (topic_id);
```

`ON DELETE CASCADE` on `item_id` because `--prune` deletes items (`scripts/ingest.ts:504`), and
membership is meaningless without the item. **No cascade on `topic_id`** — deleting a topic should
fail loudly while items still reference it.

**`origin` records how membership was decided**, and is what makes Cut 2's promotion auditable:

- `seed` — a search source's seed query surfaced it under this topic (the museum path).
- `curator` — classify mode named it.
- `tag` — a promotion backfilled it from tag overlap.

**There is no `confidence` column, deliberately.** An earlier sketch had one. An LLM's
self-reported confidence is not calibrated, and Phase 0's whole lesson was to stop trusting
similarity numbers; `origin` records a fact that can be acted on, a confidence would record a
number nobody can act on. If a later phase wants weighting, derive it from `origin` plus the
item's `curation_score`, both of which are real.

### The deliberate deviation: `item.topic_id` survives Cut 1

D2 says the column is retired. **It is — in Cut 2, not Cut 1.** Ben approved this phasing
explicitly. The reason is that retiring it in Cut 1 would break D4's "the feed does not move":

- `schema.ts:207` — `idx_item_topic_score` on `(topic_id, curation_score)` is the feed's draw index.
- `src/server/db/feed.ts:96` — `getTopicPools` filters `inArray(item.topicId, topicIds)`. This is
  the function Phase 7.3 optimised from 138 ms to 22 ms; moving it to a join is a performance
  change that deserves its own bench run, not a side effect.
- `src/server/db/items.ts:198` — `drawFromTopic` filters `eq(item.topicId, topicId)`.
- `src/components/gallery/gallery-details-sheet.tsx:35` and `src/components/feed/masonry.ts:83`
  render a topic label from the id.

So Cut 1:

1. Makes `item.topic_id` **nullable** (drops the `NOT NULL`, keeps the FK and the index).
2. Adds `item_topic`, backfilled with exactly one `origin='seed'|'curator'` row per existing item.
3. Treats the surviving column as **the display/primary topic**, nullable for un-homed items.

Cut 2 moves the feed onto the join table and drops the column.

**A happy consequence: un-homed items are invisible to the feed with no guard at all.** Both draw
paths use `inArray` / `eq` against `topic_id`; SQL `NULL` matches neither. Verified 09-02-26. No
`WHERE topic_id IS NOT NULL` needs adding anywhere.

**They are still reachable by direct link.** `items.byId` / `/i/[itemId]` is the one public,
topic-free surface (CLAUDE.md's auth boundary), so a stored un-homed item can be opened and
eyeballed before Cut 2 exists. That is how the executor should sanity-check the first run.

### Additivity rule

`upsertItem` (`src/server/db/items.ts:19-20`) deliberately does **not** rewrite `topicId` on
conflict: *"reassigning an existing item's topic on a later ingest run would reshuffle which users'
feeds it can appear in, out from under them, for no product reason."*

`item_topic` inherits the spirit with a sharper rule: **membership is additive and never
retracted by an automated process.** Every write is `INSERT ... ON CONFLICT DO NOTHING`. Adding a
topic can only widen an item's reach; removing one silently takes items out of feeds. Removal is a
deliberate, human-triggered operation, and Cut 1 does not build one.

---

## 6. Curator changes — `src/server/services/curator.ts`

### The prompt

`CLASSIFY_PROMPT` (`:66-71`) is built by slicing `CURATOR_PROMPT`, and **that slicing must stay** —
the base string carries Ben's taste calibration and is a product artifact, not implementation
detail (SPEC §15). Only the appended block changes:

- from: *"file this item under exactly ONE of these topics ... or null if none is an honest home"*
- to: list **every** topic that is an honest home; the list may be **empty**; never force a fit.

Response shape becomes `{"score": <1-10>, "tags": [...], "topics": [<id>, ...]}`.

Parsing (`:197-234`) keeps the existing discipline — only ids present in `TOPIC_IDS` survive, so a
hallucinated topic is dropped rather than trusted. It now filters an array instead of checking one
value.

### The cache is NOT invalidated

This is the part that makes the change cheap, and the executor should not "fix" it.

`cacheKey` (`:244-254`) hashes `model | promptVersion | mode | source:sourceId`. It does **not**
include the topic list — which would be a bug if classification had to be re-run on vocabulary
change, but under D3 it does not: **tag backfill is what widens old items, for free.**

So old cache entries are **read forward** rather than discarded:

- a cached `topicId: "botany"` → `topics: ["botany"]`
- a cached `topicId: null` → `topics: []`

`PROMPT_VERSION` **stays put** and the `classify|` cache namespace is **reused**. Zero items are
re-billed by Cut 1. Bumping the version here would re-purchase the entire walk corpus for no
benefit.

The consequence to state plainly in the code comment: items curated before Cut 1 keep their single
topic until a Cut 2 promotion widens them. That is correct and intended, not a migration gap.

---

## 7. Ingest changes — `scripts/ingest.ts`

The drop is `:489-502`:

```ts
let noTopic = 0;
for (const curatedItem of curatedWalk) {
  if (curatedItem.topicId === null) {
    noTopic++;
    continue;                     // <- the deletion
  }
  ...
}
```

It becomes: insert every curated walk item; write one `item_topic` row per topic in the array;
count the un-homed instead of discarding them. The header comment at `:21` (*"a null topic is
dropped and counted, never force-fitted"*) must be rewritten in the same commit.

### The summary line becomes the promotion evidence

This is the highest-value small piece of Cut 1. The current output ends a thought:

```
no-topic dropped (walk):  63
```

It should instead start one — the tag histogram over un-homed items is exactly the input Cut 2's
promotion needs, produced as a free side effect of ordinary ingest:

```
stored un-homed:          63
  top tags among them:  mural 41 · street art 38 · graffiti 22 · urban art 19 · ...
```

Draw the histogram from `item.tags` **and** `aestheticTags` (the latter is the only signal for
tagless posts — see D3). `--dry-run` must print it too, since that is how a blog gets sampled
before a verdict.

---

## 8. What Cut 1 must NOT change

The feed engine (`src/server/services/feed.ts`), the topic graph
(`src/server/config/topic-graph.json`), `topicCap` (`feed.ts:417`), onboarding
(`src/app/onboarding/page.tsx`), and the sixteen entries in `TOPICS`.

`src/server/config/topics.test.ts:24` — *"holds exactly the 16 graph-validated topics"* — **should
still pass unchanged at the end of Cut 1.** If it fails, the cut has grown beyond its scope.

### The typechecker is the worklist

Making `item.topic_id` nullable changes Drizzle's inferred type from `string` to `string | null`,
and **`bun run typecheck` will then enumerate every place in the codebase that assumed otherwise**
— including `FeedCandidate` (`src/server/db/feed.ts:33`), which picks `topicId` into the feed's
hot path.

Tell the executor to run `bun run typecheck` immediately after the schema edit and **treat the
error list as the task list**, rather than hunting for call sites by hand. Each error is a real
decision about what a null topic means at that point; none should be silenced with `!` or `as`.

---

## 9. Testing

Non-negotiable per SPEC §12. New or changed:

- **Migration:** the backfill produces exactly one `item_topic` row per pre-existing item, with
  `origin` matching how that item got its topic. Row counts before and after must agree.
- **Curator, unit:** the multi-label prompt parses an array; unknown ids are filtered against
  `TOPIC_IDS`; an empty array is a legal answer and is not an error.
- **Curator, cache:** an existing single-topic cache entry yields a one-element array **with no
  LLM call**, and a cached `null` yields `[]`. This is the test that protects the "no re-billing"
  property from a later well-meaning `PROMPT_VERSION` bump.
- **Ingest:** a walk item whose topic array is empty is **inserted** and counted as un-homed, not
  dropped. (Directly inverts the current behaviour — find and rewrite the existing test.)
- **Feed, property:** over a corpus containing un-homed items, `composePage` never returns one.
  Cheap to write and it is the guard on D4's "the feed does not move".
- **UI:** the gallery sheet and masonry render an item with a null topic without crashing
  (`gallery-details-sheet.tsx:35`, `masonry.ts:83` both do `?? id`, which is null-unsafe if the id
  itself is null).
- **Unchanged and must stay green:** `source-invariants.test.ts`, `topics.test.ts`.

---

## 10. Migration and operations

- Drizzle: `bun run db:generate` produces `drizzle/0004_*.sql`; `bun run db:migrate` applies. The
  Dockerfile boot path already runs migrate then seed (Phase 8.1 T2), so production picks it up on
  deploy with no new step.
- **The backfill must be in the generated migration**, not a separate script — production's boot
  path runs migrations only.
- **Production is behind local.** Nine sources / 11,313 items as of the 08-31-26 cron run;
  `thingsorganizedneatly` and `thisiscolossal` have local rows but are **not yet on production**
  (they walk after the next deploy). So production's backfill is small; local's is not.
- **Recovering the ~3,500 dropped items is a re-walk after Cut 1 ships** — `bun run ingest --source
  <id>`, with `.cache/curation` making the scores free. Do this *after* the migration, and expect
  the un-homed count to be large and correct.
- **Coolify records every healthy ingest as `failed`** (CLAUDE.md — its `ScheduledTaskJob` times
  out at 5 minutes and discards output while the `docker exec` runs on). The database is the only
  honest witness. Do not use task status as evidence that the first post-deploy ingest worked.

---

## 11. Explicitly out of scope

**Cut 2 — promotion, and making un-homed items reachable.** Tag-frequency mining over the corpus;
a proposed-topic list for Ben to verdict; a `topic_edge` table replacing the dense
`topic-graph.json` (16 topics = 240 cells; 1,000 topics ≈ 1M cells and ~100 MB of JSON imported at
module load in `feed.ts:16` — it stops being a checked-in artifact); a graph rebuild job computing
truncated top-K drift / bottom-K jump rows; the SQL backfill; moving the feed onto `item_topic` and
dropping `item.topic_id`.

**Cut 3 — scale surfaces.** Topic hierarchy; onboarding for hundreds of topics (a chip grid does
not scale, though a curated top tier of chips probably remains the answer); `topicCap` redesign —
at `topicCap: 3` per 12-card page, hundreds of topics means two cards essentially never share a
topic, so the page-diversity constraint silently stops constraining and needs to move up a level.

**Not planned at all:** item embeddings, pgvector, clustering (§4).

---

## 12. Threads in flight that collide with this

**Read both before writing the plan.**

1. **`docs/PLAN_publicdomainreview.md`** (untracked as of 09-02-26 11:52, written by a live Fable
   session). It rewrites **the same walk lane in `scripts/ingest.ts`** that §7 rewrites, and it
   changes adjacent invariants: PDR collections become image items **carrying a `body`**, essays
   become articles with a body, and *"the walk-source body-null invariant is rescoped to blogs"*.
   Cut 1 and that plan must not be executed blind of each other — sequence them, or merge the
   ingest changes into one task. **This is the single biggest planning risk in this document.**

2. **`feat/wp-rest-streetartnews`** (branch, one commit `027c993`, unmerged). Adapter, fixture and
   trial sample are done and green; **Ben's Keep/Park/Cut verdict is deliberately on hold**,
   because this design changes what its evidence means (§13).

Also live: `docs/HANDOFF_sources-round2.md` §0's queue (spoon-tamago next, probed read-only this
session — canonical host is the **bare** domain, correcting §0's `www.`; robots clean; 4,075 posts;
heroes as small as 640×480).

---

## 13. Consequences for decisions already taken or pending

- **streetartnews' verdict changes meaning.** Its 42% refusal rate was the main argument *against*
  keeping it. Under this principle that number is not a defect — it is 63 stored items whose tags
  (`mural`, `street art`, `graffiti`, `urban art`) are precisely the raw material for a `street-art`
  topic. The verdict should be taken **after** Cut 1, on re-read evidence.
- **thisiscolossal gains 2,657 items** on its next walk, and `thingsorganizedneatly` 829 —
  without re-curation.
- **mossandfog's park stands.** That was a *quality* verdict (6.60 avg, 41% ≥ 8, a 36-item cluster
  at score 4, an advertorial tail), not a topic-fit one. This principle does not disturb it, and a
  later session must not read it as un-parked.
- **The trial loop's eyeball step gets a new question.** `docs/source-candidates.md`'s step 3 asks
  for the score distribution; after Cut 1 a walk source's verdict should also weigh *what the
  un-homed items are about*, since that is now a source's contribution to the vocabulary rather
  than waste.

---

## 14. Open questions for the plan

None block Cut 1. Recorded so the planner decides them deliberately rather than by accident:

1. **`origin` for backfilled museum rows.** Every existing item got its topic from a seed query
   (`seed`) except walk items, which got it from classify (`curator`). The backfill can tell them
   apart by `source IN (walk sources)`. Confirm that is the rule, and that it is right for
   `doorofperception`'s 318 production rows.
2. **Does the classify array need a cap?** An unbounded list risks the model naming eight topics
   for one mural. A cap of ~3 keeps `topicCap` meaningful in Cut 2. Recommend capping in the
   prompt, not the parser, so refusals stay honest.
3. **Should `--dry-run` write nothing but still report un-homed tags?** Yes, per §7 — but confirm
   it does not need DB access to do so (it should not; the histogram is computed from in-memory
   curated items).

---

## 15. Files this touches

| path | what changes |
|---|---|
| `SPEC.md` | the §1 principle; §5.1/§5.6 for `item_topic`; a dated note in §6.2 and §9 that the feed still reads `topic_id` until Cut 2 |
| `CLAUDE.md` | the §1 principle, in the architecture section beside "The corpus is the product" |
| `src/server/db/schema.ts` | `topic_id` nullable (`:185`); new `item_topic` table + index |
| `drizzle/0004_*.sql` | generated migration **including the backfill** |
| `src/server/services/curator.ts` | `CLASSIFY_PROMPT` (`:66`), the parse (`:197-234`), the D4 reversal note (`:62`), cache forward-read (`:280-292`) |
| `scripts/ingest.ts` | the walk lane (`:489-502`), the header comment (`:21`), the summary (`:666-683`) |
| `src/server/db/items.ts` | an additive `item_topic` writer beside `upsertItem`; the additivity comment |
| `docs/PHASE6_DESIGN_6.3.md` | dated reversal note on D4 |
| `docs/source-candidates.md` | the trial loop's eyeball step (§13) |
| tests | per §9 |

Untouched, and a red flag if they appear in a diff: `src/server/services/feed.ts`,
`src/server/config/topic-graph.json`, `src/app/onboarding/`, the sixteen `TOPICS` entries.
