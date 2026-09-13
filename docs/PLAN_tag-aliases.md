# Tag aliases — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Test-first on every task (superpowers:test-driven-development): write the failing test, watch it fail for the right reason, then the code.

**Written:** 09-12-26 (late) by Fable 5.1. **For:** a cold session on a cheaper model, **after
Ben has answered §8 of `docs/DESIGN_tag-aliases.md`** — the plan assumes the recommended
answers (config file; applied at ingest; own-tag half included; a script, not boot). Where a
different answer changes a task, the task says so. Base: `main` at `3fc4203` or later.

**Goal:** a rejected synonym of an existing topic becomes a standing rule — every item carrying
that tag, past and future, is a member of the topic — instead of an unticked line that mining
re-proposes and nothing acts on; and a grown topic's own tag becomes a standing rule too.

**Architecture:** one hand-written config (`TOPIC_ALIASES`), one pure function
(`topicsFromTags`) that turns an item's tags into topic ids, called from two places: the ingest
(after classify, origin `tag`) and a backfill script (`bun run tags:apply`) that runs it over the
whole corpus. Mining treats alias tags as taken; promotion refuses them. No table, no migration.

**Tech Stack:** Bun, Drizzle over postgres.js, Vitest (integration suites self-skip without
`DATABASE_URL`), the repo's `db/test-fixtures.ts` helpers (`insertHomedItems` — read it first).

**Spec:** `docs/DESIGN_tag-aliases.md`. Every "why" is there; nothing below re-argues it.

## Global Constraints

- **Additive only.** Every membership write is `ON CONFLICT DO NOTHING`; `item.topic_id` is
  written only where NULL. Nothing here deletes an `item_topic` row or moves a display topic.
- **One normalisation.** A tag is compared after `toLowerCase().trim()` — the rule `tallyTags`
  in `services/topic-mining.ts` already uses. Do not introduce a second one.
- **One function.** The ingest and the script must call the same `topicsFromTags`. If they
  drift, the backfill and the nightly disagree about what an alias means.
- **No re-billing.** Nothing here calls the curator or reads the curation cache.
- **Comment generously** — this repo teaches (CLAUDE.md). The config file's header explains what
  an alias is and the one rule for adding one (§7 of the design: same thing or narrower, never a
  neighbour).
- **`bun run check` green before each commit** (`format:write`, not `format` — it does not
  exist). One commit per task, plain branch `feat/tag-aliases` off `main`.

## Before you start

```bash
cd ~/Dev/ambit
git status                    # clean, on main
git checkout -b feat/tag-aliases
docker compose up -d          # dev Postgres, for the integration tests and the dry run
bun run test src/server/services/topic-mining.test.ts   # green baseline
```

Read: `src/server/config/topic-facets.ts` (the shape of a hand-assigned config with a dated
block and a test), `scripts/promote-topics.ts` (`carriesTag`, the membership insert and the
NULL-only display fill — the semantics to copy), `src/server/services/topic-mining.ts`
(`tallyTags`, `rankCandidates`, `topicIdFor`), and the walk-source write in `scripts/ingest.ts`
around the two `addItemTopics(` calls (lines ~484 and ~516 at `3fc4203`).

---

### Task 1 — The initial alias set, enumerated from the round-2 file

- [ ] **1.1** From `docs/topic-proposals-round2.md`, list every unticked line whose tag is a
  synonym of a topic Ben kept — the design's §5 names the families (sci-fi spellings, soviet
  variants, comics variants, graffiti/public art, vintage advertising, oil painting,
  retrofuturism spellings). Grep, don't guess:
  ```bash
  grep -n "^- \[ \]" docs/topic-proposals-round2.md | grep -iE "sci[- ]?fi|science fiction|soviet|comic|graffiti|public art|advertis|oil paint|futur" | cut -c1-120
  ```
- [ ] **1.2** For each, confirm the target topic exists: `select id from topic where id in (…)`.
- [ ] **1.3** Measure each alias's carriers and how many lack the membership (the design's §2
  query, adapted). Keep the numbers — they go into the config's comments and the log.
- [ ] **1.4** If Ben's Q1 answer added or removed entries, apply it here. The output of this task
  is the list Task 2 writes down. No code yet.

### Task 2 — `TOPIC_ALIASES` config + test

- [ ] **2.1** Write `src/server/config/topic-aliases.test.ts` first:
  - every `tag` is already normalised (`tag === tag.toLowerCase().trim()`), non-empty, unique;
  - no `tag`'s `topicIdFor(tag)` equals a `TOPICS` id (`config/topics.ts`) — an alias must not
    be a topic's own slug (the design's §7);
  - every `except` entry is a registered `SourceId` (import the union from `sources/types.ts`
    the way `blogs.test.ts` or `suspended-sources` does);
  - the `nasa-images` exception is present on every alias targeting `science-fiction` or
    `retrofuturism` (pin the rehome lesson).
  Watch it fail on the missing module.
- [ ] **2.2** Write `src/server/config/topic-aliases.ts`:
  ```ts
  export interface TopicAlias {
    /** The tag as the world writes it, normalised: lowercase, trimmed. */
    tag: string;
    /** The topic id it is a synonym of. Must exist in `topic`; the script checks at run time. */
    topic: string;
    /** Sources the alias never touches — for look-tags the curator writes on things that are not the thing. */
    except?: readonly SourceId[];
  }
  export const TOPIC_ALIASES: readonly TopicAlias[] = [ /* dated block per family, Task 1's numbers in comments */ ];
  ```
  Header comment: what an alias is (design §1, two sentences), the one rule for adding one, and
  that the verdict lives here and not in the proposals file (design D6).
- [ ] **2.3** `bun run test src/server/config/` green. Commit:
  `feat(topics): TOPIC_ALIASES — a rejected synonym is a standing rule, not an unticked line`.

### Task 3 — `topicsFromTags`, the pure function

- [ ] **3.1** `src/server/services/tag-topics.test.ts` first. Cases:
  1. an alias tag in `tags` → its topic;
  2. the same alias in `aestheticTags` only → its topic (both columns, like `carriesTag`);
  3. mixed case / padded tag (`" Graffiti "`) → matches (normalisation);
  4. an aliased tag on a source in `except` → nothing;
  5. a tag whose `topicIdFor` is in `grownTopicIds` → that topic (the own-tag half; drop this
     case and the parameter if Ben's Q3 is no);
  6. a tag whose `topicIdFor` is an *original* topic id (`ceramics`) → nothing — originals are
     query-seeded, and a tag that happens to spell one is not evidence the way a promoted tag is
     (keep `grownTopicIds` exactly that: grown);
  7. two tags implying the same topic → returned once; order = first occurrence (deterministic —
     the display fill takes the first).
- [ ] **3.2** Implement `src/server/services/tag-topics.ts`:
  ```ts
  export interface TagVocabulary { aliases: readonly TopicAlias[]; grownTopicIds: ReadonlySet<string> }
  export function topicsFromTags(
    item: { source: string; tags: readonly string[]; aestheticTags?: readonly string[] | null },
    vocab: TagVocabulary,
  ): string[]
  ```
  Build the alias map once per call is fine (the list is short); no DB, no imports from `db/`.
- [ ] **3.3** Green. Commit: `feat(topics): topicsFromTags — the one function that reads tags as topics`.

### Task 4 — The ingest writes tag-origin memberships

- [ ] **4.1** Find where the walk-source path and the search-source path each call
  `addItemTopics(row.id, …, "curator" | "seed")` in `scripts/ingest.ts`. Load the vocabulary
  **once per run**, before the loop: `grownTopicIds` = `select id from topic where tier = 'grown'`
  (via `db/topics.ts` — add `listGrownTopicIds()` if nothing suitable exists), `aliases` =
  `TOPIC_ALIASES`.
- [ ] **4.2** After each existing membership write, `const fromTags = topicsFromTags(curatedItem, vocab)`
  and `addItemTopics(row.id, fromTags, "tag")`; add the count to `membershipsWritten` and to a
  new per-run counter `tagMemberships` that the summary prints on its own line
  (`memberships from tags:   N`). If the item stored with `topicId: null` and `fromTags[0]`
  exists, set the display topic to it — reuse whatever `upsertItem` / a small `setDisplayTopicIfNull`
  helper the promotion's step 3 already expresses; do not write a second UPDATE shape.
- [ ] **4.3** Test: the ingest's testable seam is `ingest-plan.ts` (pure) — if the display-fill
  decision can live there, pin it there; the `addItemTopics` call itself is proven by a
  `--dry-run` line in the acceptance run (design §9). Do not build an ingest harness for this.
- [ ] **4.4** `bun run ingest --source thisiscolossal --dry-run --quota 30` — the summary shows
  the new line, non-zero if the sample carries an aliased or grown tag (it will: Colossal's
  captions are where `street art` and `public art` live). Commit:
  `feat(ingest): tag-origin memberships on every stored item — aliases and grown topics' own tags`.
  *(Skip this task if Ben's Q2 is no; then `tags:apply` after each walk is the manual substitute
  and the design's §2 nightly gap stays.)*

### Task 5 — `bun run tags:apply`, the backfill

- [ ] **5.1** `scripts/apply-tag-topics.test.ts` (integration, self-skips without
  `DATABASE_URL`) first, on the planner: extract the per-item decision into
  `services/tag-topics.ts` as `planTagTopics(item, memberships, vocab) → { add: string[]; newDisplay?: string }`
  so the script is a loop over a pure plan (the `rehome-repair.ts` shape). Pin: adds only what is
  missing; fills display only when NULL; a second run plans nothing.
- [ ] **5.2** `scripts/apply-tag-topics.ts`: dry run by default, `--confirm` writes. Validates
  every alias target exists in `topic` (exit 1 naming the missing id — the `promote:topics`
  refusal shape). Streams `item` rows `(id, source, tags, aesthetic_tags, topic_id)` in one pass
  with its existing memberships (one `item_topic` read grouped by item, or a left join —
  measure; the corpus is ~165k rows and `mine:topics` already does a pass of this size), plans,
  then batch-inserts memberships (500 a statement, `ON CONFLICT DO NOTHING`) and updates display
  topics. Prints per-topic counts: `<topic>  +N memberships  +M display`, and a total line.
  Idempotent.
- [ ] **5.3** `package.json`: `"tags:apply": "bun run scripts/apply-tag-topics.ts"`.
- [ ] **5.4** Run it on the Mac: dry run first — the per-alias numbers should sit within a few
  percent of Task 1.3's "lacking" column and the design's own-tag table; then `--confirm`; then
  a second dry run reports 0. Record all three in the log. Commit:
  `feat(scripts): tags:apply — backfill alias and own-tag memberships, idempotent`.

### Task 6 — Mining and promotion respect aliases

- [ ] **6.1** `topic-mining.test.ts`: `rankCandidates(stats, existing, opts)` given an alias tag
  in `opts.aliases` never returns it, in either bucket. Add `aliases: string[]` to `MiningOpts`
  (default `[]`) and fold it into `taken`.
- [ ] **6.2** `scripts/mine-topics.ts`: pass `TOPIC_ALIASES.map(a => a.tag)`; append a footer to
  the proposal file — `## Aliased (n)` — one line per alias: `` `tag` → `topic` · N total ``
  (N from the same tally), so the verdict is visible where verdicts are made (design D5/D6).
- [ ] **6.3** `scripts/promote-topics.ts`: refuse a ticked line whose `tag` is in
  `TOPIC_ALIASES` — message names the alias's topic and says to untick it. Same exit-1 shape as
  the facet refusal.
- [ ] **6.4** `bun run mine:topics --out /tmp/proposals-check.md --rank total --min-total 300`
  proposes none of the alias tags and lists them in the footer. Commit:
  `feat(topics): mining and promotion know an alias when they see one`.

### Task 7 — Words

- [ ] **7.1** `SPEC.md` §6.2 (curation / classification): one paragraph — tag-origin
  membership at ingest, aliases, the config file, the script; link the design.
- [ ] **7.2** `CLAUDE.md`: one sentence inside the "vocabulary grows to fit the corpus" bullet —
  *"A rejected synonym is an alias (`config/topic-aliases.ts`, design
  `docs/DESIGN_tag-aliases.md`): applied at ingest and by `bun run tags:apply`, which joins the
  post-deploy list after `repair:rehome`."* Add `tags:apply` to the post-deploy sequence
  wherever CLAUDE.md states it.
- [ ] **7.3** `docs/topic-proposals-round2.md`: no edit — the footer arrives on the next mining
  run. (Do not hand-edit its tag comments.)
- [ ] **7.4** `log.md` entry per CLAUDE.md's format: what shipped, Task 5.4's three numbers, the
  measured before/after for `soviet`, `comics`, `street-art`; the spend line from the script.
  Commit: `docs: tag aliases — SPEC §6.2, CLAUDE.md, log`.

### Task 8 — Finish

- [ ] **8.1** `bun run check` green (1,279+ tests); `bun run e2e:prod` untouched by this work
  but run once anyway (the ingest and the feed share `item_topic`).
- [ ] **8.2** Merge `--no-ff` into `main`, push. Then production, after the next deploy, inside
  the container: `bun run tags:apply` dry run → read the numbers → `--confirm` → dry run again →
  numbers into the log. The nightly ingest carries the rule forward from there.

## Acceptance (from the design, §9)

- [ ] `tags:apply` dry run ≈ the design's §2 numbers; `--confirm` writes; second run 0.
- [ ] `mine:topics` proposes no alias and lists them in the footer.
- [ ] A dry-run ingest prints a non-zero `memberships from tags` line for a blog sample.
- [ ] `bun run check` green; the three new test files in.

## If Ben's answers differ

- **Q2 = no (not at ingest):** drop Task 4; keep everything else; add a line to CLAUDE.md that
  `tags:apply` runs after each walk on the Mac and after each nightly on production.
- **Q3 = no (aliases only):** remove `grownTopicIds` from `TagVocabulary` and cases 5–6 of
  Task 3; Task 5's own-tag numbers vanish.
- **Q4 = boot:** Task 5's planner stays; the loop moves into `db:seed` behind a fast "anything
  to do?" count query, and the script becomes the dry-run reporter only. Not recommended — see
  the design's D4.
