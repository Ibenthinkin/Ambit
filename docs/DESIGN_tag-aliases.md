# Tag aliases — design

**Written:** 09-12-26 (late) by Fable 5.1, from the follow-up the morning's round-2 entry in
`log.md` flagged. **Status: DRAFT — Ben has not read it.** The open questions in §8 are his;
the plan (`docs/PLAN_tag-aliases.md`) is written against the recommended answers and says which
tasks change if he answers differently. Every number below was measured on the Mac's database
on 09-12-26 (163 topics, 159 pickable; the corpus as of the 09-11 count, 164,423 items).

## 1. The problem, in one paragraph

Round 2 of the vocabulary rejected every synonym of an existing topic, by rule: `retro sci-fi`
(12,807 items), `sci-fi illustration`, `vintage sci-fi`, `space opera`, `soviet union` /
`soviet era` / `soviet illustration`, `comic art`, `graffiti` / `public art`,
`vintage advertising`, `oil painting`, the two spellings of retrofuturism. Right decision — a
synonym is not a second topic — but the decision has nowhere to live. An unticked line in the
proposals file is indistinguishable from a tag nobody looked at, so the next `mine:topics` run
proposes it again; and the items carrying the synonym reach the canonical topic's membership only
by luck: the classifier happened to name it, or the topic's own tag happened to be on the item
too, or a `REHOME_RULES` regex caught it. **Topics are the vocabulary Ambit asks with; tags are
the vocabulary the world answers in** (CLAUDE.md). An alias is the line between them that says
"this answer means that word."

## 2. Measured: what the missing line costs

Carriers of each rejected synonym (either tag column) that have **no** `item_topic` row for the
topic it is a synonym of:

| synonym tag           | canonical topic   | carriers | lacking membership |
| --------------------- | ----------------- | -------: | -----------------: |
| `comic art`           | `comics`          |    2,734 |          **1,747** |
| `soviet era`          | `soviet`          |    3,549 |          **1,671** |
| `soviet illustration` | `soviet`          |    1,895 |                735 |
| `vintage advertising` | `advertising`     |    2,103 |                598 |
| `graffiti`            | `street-art`      |      577 |                523 |
| `public art`          | `street-art`      |      420 |                268 |
| `soviet union`        | `soviet`          |    4,687 |                216 |
| `retro-futurism`      | `retrofuturism`   |    2,515 |                119 |
| `retro sci-fi`        | `science-fiction` |   12,807 |                 73 |
| `oil painting`        | `painting`        |      314 |                  9 |
| `vintage sci-fi`      | `science-fiction` |    2,347 |                  6 |
| `space opera`         | `science-fiction` |    1,995 |                  1 |
| `sci-fi illustration` | `science-fiction` |    5,654 |                  0 |

About **5,970 memberships** that the verdict already implies and nothing has written. The
science-fiction rows are near zero only because `repair:rehome`'s evidence regex already names
`sci-fi` and `space opera` — the rehome rule is doing an alias's job for one topic, by hand.

The same measurement for a grown topic's **own** tag turned up a second gap the alias work should
close in passing. Items fetched *after* Cut 2a (09-03 onward) that carry a grown topic's exact
tag and are not members of it:

| grown topic    | fetched after 09-03 with the tag | lacking membership |
| -------------- | -------------------------------: | -----------------: |
| `surreal`      |                           12,813 |          **1,296** |
| `illustration` |                           12,670 |                467 |
| `photography`  |                            3,684 |                 70 |
| `advertising`  |                              341 |                 19 |
| `fashion`      |                              377 |                 12 |

`promote:topics` writes tag-origin membership **once, at promotion**, for the items that exist
that day. Every item since has depended on the classifier naming the topic, and with `MAX_TOPICS`
keeping the first three homes it misses the exact tag on roughly one item in ten. The rule the
promotion states — "every item carrying this tag is a member" — is only true of the past.

## 3. What exists today, and why none of it is the answer

- **`promote:topics`** — tag → membership, both columns, additive, fills a NULL display topic.
  Exactly the semantics wanted, applied to one tag (the topic's own), on one day.
- **The classifier** (`curator.ts` classify mode) — an LLM over the whole vocabulary, capped at
  three homes. Probabilistic; the alias is a deterministic fact and should not be re-asked.
- **`REHOME_RULES`** (`config/topics.ts`) — evidence regex + `exceptSources`, and it **removes**
  a curator row and **moves** the display topic. A dated exception to additivity, argued per rule.
  An alias must not inherit that power; it adds and never takes.
- **`rankCandidates`'s `taken` set** — excludes existing topic ids and their tag text from the
  proposals. Aliases belong in it; today they are not, which is why the synonyms come back.

## 4. The design — six decisions

**D1 — An alias is config, not data.** `src/server/config/topic-aliases.ts` exports
`TOPIC_ALIASES: readonly { tag: string; topic: string; except?: readonly SourceId[] }[]`,
hand-written, with a dated comment per block like `topic-facets.ts`. **No table, no migration.**
Nothing reads an alias at request time — it is applied to items by the ingest and by a script —
so the config ships in the image and production has it on the next deploy with nothing copied.
(Facets became a column because both pickers read them per request; an alias is never read by
the app.)

**D2 — Semantics, fixed.** A tag matches an alias after the normalisation `tallyTags` uses
(lowercase, trim), in **either** tag column (`tags` or `aesthetic_tags`, as `carriesTag` does
since 09-06). A match writes one `item_topic` row at origin `tag` — an alias *is* a tag — with
`ON CONFLICT DO NOTHING`; it fills `item.topic_id` **only where NULL**, the promotion's rule; it
never removes a row and never moves a display topic. `except` lists sources the alias never
touches, for the reason `REHOME_RULES` learned on `nasa-images`: the curator writes look-words
(`retro sci-fi` on a 1983 shuttle crew portrait), and a look is not evidence of fiction.

**D3 — Applied at ingest, for aliases and for a grown topic's own tag, by one function.**
`topicsFromTags(item, vocab)` in `services/tag-topics.ts` — pure; takes an item's two tag
columns and source, and a vocabulary `{ aliases, grownTopicIds }`; returns the topic ids the tags
imply. A tag implies a grown topic when `topicIdFor(tag)` (the promotion's own slug rule) is that
topic's id, or when the alias list says so. The ingest calls it after classify for every stored
item and writes the result at origin `tag`, filling a NULL display topic with the first. This is
what closes the §2 own-tag gap for the future and makes the promotion's rule true in the present
tense. Search-shaped sources are not exempt — a Met object tagged `graffiti` honestly belongs to
`street-art` — and the seed query's `seed` row is unaffected.

**D4 — One script backfills the past: `bun run tags:apply`.** Dry run by default, `--confirm`
writes; reads every item's `(id, source, tags, aesthetic_tags, topic_id)` in one pass (the shape
`mine:topics` already streams), runs `topicsFromTags` on each, batch-inserts the memberships and
fills NULL displays; prints per-topic counts. Idempotent — a second run reports zero. It joins
the post-deploy list (`promote-prod.sh` → `trim` → `repair:periods` → `repair:rehome` →
`tags:apply`). The alternative — applying at boot from `db:seed` like facets — was considered
and rejected: seed is a boot step and must stay fast and free of item writes; a backfill that
touches 6,000 rows is a repair, and the repo's repairs are scripts a person runs and reads.

**D5 — Mining and promotion respect aliases.** `rankCandidates` adds every alias tag to `taken`,
so an aliased synonym is never proposed again; the proposal file gains a footer,
*Aliased (n)*, listing each alias, its target and its carrier count, so the verdict is visible
where the verdict is made. `promote:topics` refuses a ticked line whose tag is an alias, the way
it refuses a missing facet — a synonym cannot be both.

**D6 — The verdict lives in the config file.** Ben writes an alias into `topic-aliases.ts`, the
way he writes a facet into `topic-facets.ts`. Considered and not chosen: an
`<!-- alias: science-fiction -->` slot on the proposal line that `promote:topics` reads. It
keeps the verdict in one file, but it makes a Markdown comment the source of truth for something
the ingest runs every night, and it cannot express `except`. The footer in D5 is the compromise:
the proposal file *shows* aliases; the config *is* them.

## 5. The initial alias set, proposed from the 09-12 verdict

For Ben to confirm or edit (§8, Q1). Targets all exist as topics today.

| alias tag             | → topic           | `except`        | note                                |
| --------------------- | ----------------- | --------------- | ----------------------------------- |
| `retro sci-fi`        | `science-fiction` | `nasa-images`   | the rehome rule's own exception     |
| `sci-fi illustration` | `science-fiction` | `nasa-images`   |                                     |
| `vintage sci-fi`      | `science-fiction` | `nasa-images`   |                                     |
| `space opera`         | `science-fiction` |                 |                                     |
| `sci-fi`, `sci fi`, `science fiction` | `science-fiction` | `nasa-images` | the rest of "the dozen spellings" — the plan's first task enumerates them from the round-2 file |
| `retro-futurism`, `retro futurism` | `retrofuturism` | `nasa-images` |                                   |
| `soviet union`, `soviet era`, `soviet illustration` | `soviet` |    | Ben kept `soviet` as the canonical  |
| `comic art`           | `comics`          |                 | "comics over three" — the other two from the file |
| `graffiti`, `public art` | `street-art`   |                 |                                     |
| `vintage advertising` | `advertising`     |                 |                                     |
| `oil painting`        | `painting`        |                 |                                     |

Not proposed: `children` (rejected in round 2 as a synonym, but of what — Q1), and every period
tag (tag-only by standing rule; an alias to a period topic is allowed by the mechanism and is
Ben's call per tag).

## 6. What this does not do

- It does not remove or move anything. `REHOME_RULES` stays the only mechanism that retracts a
  curator row, and stays hand-argued per rule. An item the classifier filed under `science`
  gains `science-fiction` from an alias and keeps displaying as `science` — the rehome script is
  still what moves it.
- It does not make an alias visible: no chip, no credit line, nothing in the pickers.
- It does not change the feed's cost. Pools are sampled at 60 per topic; a topic with 2,000 more
  members draws the same 60 rows.
- It does not re-bill: nothing here calls the curator.

## 7. Risks, named

- **An alias broader than its target** (`space` → `science-fiction` would be wrong; `graffiti` →
  `street-art` is right). The rule for the file: an alias names the *same thing or a narrower
  thing* than its target, never a neighbour. The config test cannot check meaning; the dry run's
  per-alias count is what a reader sanity-checks before `--confirm`.
- **Curator look-tags as evidence.** `retro sci-fi` is written by the curator on 12,607 of its
  12,807 carriers. `except` is the guard the rehome rule already needed; the plan carries
  `nasa-images` on every sci-fi alias.
- **A tag that is already a topic id's own slug** (`topicIdFor(alias) === some topic.id`) is a
  contradiction the config test refuses.

## 8. Open questions for Ben

- **Q1** — The set in §5: confirm, edit, and say what `children` was a synonym of, if anything.
- **Q2** — D3, applying at ingest: recommended yes; if no, Task 4 of the plan is dropped and the
  nightly gap in §2 stays (`tags:apply` after each walk would be the manual substitute).
- **Q3** — D3's own-tag half: recommended yes (it is the same function and closes a measured
  1,296-item gap on `surreal` alone); if no, `grownTopicIds` is simply not passed.
- **Q4** — D4, script vs boot: recommended script.

## 9. Acceptance

- `bun run tags:apply` dry run on the Mac reports per-alias counts within a few percent of §2's
  "lacking" column, and the own-tag counts of its second table; `--confirm` writes them; a second
  run reports 0.
- `bun run mine:topics --out /tmp/x.md` proposes none of the §5 tags and lists them in the footer.
- A `bun run ingest --source <walk> --dry-run --quota 50` prints tag-origin memberships in its
  summary line, non-zero for a blog whose captions carry an aliased tag.
- `bun run check` green; the config test, the pure function's tests and the script's
  integration test all in.
- Production: `tags:apply --confirm` in the container after the deploy, numbers in `log.md`.

## 10. Files this touches

`src/server/config/topic-aliases.ts` (+ test) · `src/server/services/tag-topics.ts` (+ test) ·
`scripts/apply-tag-topics.ts` (+ integration test) · `scripts/ingest.ts` (the membership write
after classify) · `src/server/services/topic-mining.ts` (`rankCandidates`, the footer) ·
`scripts/mine-topics.ts` · `scripts/promote-topics.ts` (refuse an aliased tag) · `package.json`
(`tags:apply`) · `SPEC.md` §6.2 · `CLAUDE.md` (one bullet under the vocabulary principle) ·
`log.md`.
