# publicdomainreview.org walk adapter — Implementation Plan

> **Re-read against Cut 1 — done 09-02-26, this plan is live again.** The tagging rewrite that
> paused it is `docs/DESIGN_topic-vocabulary-growth.md` plus `docs/PLAN_topic-vocabulary-cut1.md`
> ("Cut 1"), both merged to `main`. The re-read found **no change needed in Tasks 1–5** — both
> projections' `tags` arrays (Task 3) are right as written and worth more under the new rules, and
> the only file both plans touch is `scripts/walk-stats.ts`, in disjoint regions. What changed is the **evidence and the verdict**
> (Tasks 6–7), plus one hard ordering rule. **Read §1a before starting; it is the whole delta.**

> **Cut 1 shipped and merged the same afternoon (`acd1437`), so this plan is runnable end to end.**
> Branch off today's `main` and Cut 1 comes with it — confirm in ten seconds with
> `grep -n "item_topic" src/server/db/schema.ts` and `ls drizzle/0004_item_topic.sql`. The one
> thing that survives as a rule rather than a gate: **no PDR row may be written to a database whose
> `item_topic` migration has not run** (§1a — correctness, not preference; it applies again to the
> first *production* ingest after the next deploy).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-02-26 by a planning session (Fable), from the live probe in
`docs/HANDOFF_publicdomainreview.md` plus two larger live samples taken while planning (§0).
**Revised the same day** after Ben widened the scope: *everything* PDR publishes about
public-domain works — Collections **and** Essays (with the Conjectures and Curator's Choice
series) — with each collection's body text shown under its image. **For:** a cold session on a
cheaper model. Every number, field name and string here was verified against the live site on
09-02-26 — re-probe only if a step's expected output disagrees with what you see.
**Re-read and revised 09-02-26 afternoon** against Cut 1 of the topic-vocabulary work: §1a is new,
Tasks 1–5 are unchanged, Tasks 6–7 and the Verification bar are amended.

**Goal:** One `CorpusWalkAdapter` (`pdr`) that walks The Public Domain Review's 1,255
Collections and 393 essay-route pieces from Gatsby's page-data JSON with a per-record disk
cache; collections become gallery-eligible image items carrying their body essay, CC BY-SA
essays become articles for the reader view, restricted essays become link cards; plus the one
item-page change that renders body text under an image. Sampled through the trial loop, stopped
at Ben's Keep/Park/Cut.

**Architecture:** Four one-shot indexes (collections, essays, conjectures, curator's choice) →
the cursor is `<phase>:<offset>` → each page hydrates its slice from
`/page-data/<kind>/<slug>/page-data.json` **once, ever** (cache-aside under `.cache/pdr/`,
because every detail response is 0.5–1.2 MB of which 8–30 KB is the record) → `toItem()` is a
pure projection over the hydrated record, switching on `raw.kind`. A rights policy in `walk()`
drops the ~5% of collections whose digital copy carries a Non-commercial claim; an essay's
`Publication_Rights` decides article-with-body versus link-card.

**Tech Stack:** Bun 1.4, TypeScript, Vitest (+ jsdom/testing-library for the two component
tests), the repo's own `fetchJson` / `htmlToText` / `toLede` / `uniqueTags` /
`assertCrawlAllowed` / `parseReaderBlocks`. No new dependencies.

**Spec:** `docs/HANDOFF_publicdomainreview.md` §1 (Ben's three decisions — settled) and this
document's §1 (the four decisions Ben took on 09-02-26 afternoon — also settled). Recipe and
conventions: `docs/HANDOFF_sources-round2.md` §3–§4. Ingestion rules this plan runs under:
`docs/DESIGN_topic-vocabulary-growth.md` and `docs/PLAN_topic-vocabulary-cut1.md`, distilled in §1a.

## Global Constraints

- **Settled by Ben, do not re-open:** missing `robots.txt` is permission; PDR's CC BY-SA text is
  reproduced verbatim (revisit if Ambit ever goes public); every collection medium is in;
  **Essays are in**, including the two series; a collection is an **image item that also carries
  its Preamble as `body`**, rendered on the item page under the blurb (feed and gallery unchanged);
  essays whose text PDR does not license (`Publication_Rights` ≠ `CC-BY-SA`) are **link cards**;
  the PDR **Blog is out** (organisation news, no images).
- `toItem` is pure and synchronous. No LLM call inside an adapter. Thin summaries floor.
- Never render or store source HTML: every text field goes through `plainText()` (this plan's
  wrapper over `htmlToText()`), and stored bodies are plain paragraphs the reader parser already
  understands.
- Politeness: 500 ms sequential, `noRetryOn: [401, 403]`, robots checked at the start of every
  walk. Never run a full walk from a laptop on battery with the lid closed.
- **Plain branch off `main`** (`feat/pdr-walk`), `--no-ff` merge after the verdict. No worktrees.
  **Other sessions share this checkout**, and two sessions cannot execute two plans in one working
  tree — a `git checkout -b` in either moves the files under the other (log.md 09-02-26). So
  **before you create the branch**, run `git branch --show-current && git status` in `~/Dev/ambit`:
  it must be a clean `main`. If it is on someone else's branch or carries edits you did not make,
  **stop and say so** — wait for that session rather than working around it. Then, throughout:
  `git branch --show-current && git status` immediately before every `git add`; stage by name;
  never `git add -A`. `.cache/` and the local Postgres are shared with whoever else is working —
  harmless for Tasks 1–6, which write no rows (and `.cache/pdr` and `.cache/curation` are keyed per
  source).
- Gates before every commit: `bunx eslint <files> && bunx prettier --check <files>`, plus
  `bun run typecheck` wherever the task says it is expected to pass (see Task 1's note), and
  `bun run test` at task ends (~35 s; a red Postgres test on a busy machine is not your change).
- Comment generously — this repo doubles as Ben's teaching vehicle (explain the discriminated
  union, `??=`, cache-aside, `new URL(path, base)`, why page-data is an API).

---

## 0. What the planning session verified live (09-02-26) — read, don't redo

### 0.1 The site

Gatsby 5.14.3 on Netlify; `robots.txt` → 404; images on `https://pdr-assets.b-cdn.net` (Bunny
CDN), which served every probed path including ones with spaces and apostrophes. Not WordPress.
Sections with content about public-domain works: **Collections** (1,255), **Essays** (343),
**Conjectures** (21, an essay series) and **Curator's Choice** (29, another). Also present and
**out of scope**: Blog (76 org-news posts, no images), Shop, Sources (an institution table —
used below only as evidence), Explore/Index (navigation over the same records), "Best of" pages
(tags — they reach us through each record's `Tags`, e.g. `best of images`, 86 collections).

### 0.2 The four indexes (one request each, no pagination)

| phase key | kind | URL (under `https://publicdomainreview.org`) | rows live at | count | bytes |
|---|---|---|---|---|---|
| `c` | collection | `/page-data/collections/page-data.json` | `result.data.collections.edges[].node.data` | 1,255 | 348,811 |
| `e` | essay | `/page-data/essays/page-data.json` | `result.data.allAirtable.edges[].node.data` | 343 | 262,464 |
| `x` | essay | `/page-data/series/conjectures/page-data.json` | `result.data.essays.edges[].node.data` | 21 | 12,416 |
| `k` | essay | `/page-data/series/curators-choice/page-data.json` | `result.data.essays.edges[].node.data` | 29 | 18,622 |

The two series are **not** in the essays index (verified: neither `warburgs-werewolf-an-anamnesis`
nor `sharing-photographs` appears in the 343), and every one of the 393 has a detail at
`/page-data/essay/<slug>/page-data.json`. Every index row carries `Slug`; the walker needs nothing
else from an index — **no index carries `Excerpt`/`Intro` for collections** (the handoff §5 was
wrong about that), so the blurb needs the detail. Collections appear newest-first
(`atlantic-city-sand-sculpture`, published 2026-07-29, is `edges[0]`). One collection slug is
non-ASCII (`d-a-rovinskiis-collection-of-russian-lubki-18th–19th-century`, an en-dash) — the
reason detail URLs `encodeURIComponent` the slug and the cache path validates it.

### 0.3 The details — and why there is a cache

`GET /page-data/collection/<slug>/page-data.json` → **~1.19 MB** every time;
`GET /page-data/essay/<slug>/page-data.json` → **~470 KB**. Both embed site-wide data
(`allCollections` 630 KB / `allEssays` 266 KB, `sources` 436 KB, `indexCategories` 187 KB); the
record itself (`result.data.collection.data` / `result.data.essay.data`) is 8.5 KB / ~29 KB.
Uncached, a full walk is ≈ 1.5 GB + 185 MB from a non-profit's CDN. So each hydrated record is
written to `.cache/pdr/<kind>/<slug>.json` the first time and read from disk forever after —
≈ 22 MB on disk; a nightly walk is four index fetches plus the handful of new pieces. No
revalidation: Netlify's ETags change on every detail whenever anything is published (the embedded
index changes), so conditional GETs would not save the transfer. `rm -rf .cache/pdr` is the
refresh. `site.siteMetadata.imageHost` (`https://pdr-assets.b-cdn.net`) is in every detail.

### 0.4 `collection.data` — fields `toItem` reads (40 sampled, all seven media)

```
Title                string    — Markdown emphasis (*Title of Work*) on ~25%, embedded "\n" on some
Slug                 string
Excerpt              string|null — one sentence, median 110 chars, max 249; EMPTY on 5/40 (12%),
                                  under 60 chars on 6/40; can carry <em>, <a href>, *x*
Preamble             string|null — the body essay; present on 40/40; median first paragraph 685
                                  chars; 8–48 paragraphs; markup seen: HTML tags (25/40),
                                  Markdown links (16), *emphasis* (16), {image … endimage}
                                  blocks (12), no headings, no footnote markers
Featured_Image_Path  string|null — null on exactly 2 of 1,255 (hands-1944, a-midsummer-schottische);
                                  21 paths carry spaces, apostrophes or existing %XX escapes
Medium, Theme, Style, Epoch     — string | string[] | null; tag material
Sources[].data        — { Title, Umbrella_Title: string[]|null, Rights_Summary, Rights_Details_Group,
                          Rights_License_URL, Rights_Prose }; 0 sources on 4/40, 1 on 27, 2 on 9
Rights_Profiles[].data — { Group: "Underlying Work" | "Digital Copy", Label }
Tags[].data.Label     — 0–12 per collection
Published_Date        — ISO string;  Primary_Author_Name — absent on 21/40 (unusable)
```

**Rights across the 40** (answers handoff §6.3): the underlying work is PD on every row
(`Underlying Work` → PD Worldwide 28 · PD U.S. 5 · PD GOV 2 · PD 70 Years 2). The *digital copy*
varies: `Sources[].Rights_Summary` = No Additional Rights 24 · Unclear 14 · null 3 ·
**Non-commercial 2** · No Known Copyright 1 · Attribution-ShareAlike 1. Both Non-commercial rows
are Bibliothèque nationale de France (its row in PDR's own institution table: `"Marked “public
domain” but restricts to non-commercial use"`, Open_Ranking 2/10; 5 of 246 institutions carry
that category). **Policy:** exclude a collection when any source's `Rights_Summary` is
`"Non-commercial"` or `Rights_Details_Group` is `"Non-Commercial"`; keep everything else.

### 0.5 `essay.data` — fields `toItem` reads (32 sampled: 30 random + one per series)

```
Title                string     — Markdown emphasis on some
Slug                 string
Intro                string     — the teaser, 135–590 chars (median 342), never empty; Markdown emphasis
Special_Intro        string|null — an editor's note (1/32); ignored
Body                 string     — 5,700–33,600 chars (median 19,300), 8–48 paragraphs; markup seen:
                                 {image} blocks (32/32, 2–15 per essay), <i>/<em> (26), <a> (25),
                                 <blockquote> (21), footnote markers [^n] (13), <br> (12),
                                 Markdown links (3), "## " headings (2), <p class=…>, <span>
Footnotes            string|null — "[^1]: …" lines; dropped
Publication_Rights   string|null — "CC-BY-SA" 28 · "Custom License" 3 · null 1
License_Note         string|null — the restriction's wording on Custom License essays
Featured_Image_Path  string     — never null in the 343-row index
Categories           string[]|null — 12 values (Culture & History 149, Books 122, Art & Illustration 113 …)
Series               string|null — "Conjectures" | "Curator’s Choice" on series pieces, else null
Tags[].data.Label    — 2–13 per essay
Contributors[].data.{Name, Slug} — 1–2 authors
Published_Date       — ISO string
```

PDR's reuse page, verbatim on essays: *"While most of the pieces in our Essays series are also
published under a CC BY-SA licence, some are published under more restrictive terms (usually the
case for book excerpts)"*, and the historical material in essays *"is not accompanied by rights
labels, just links to the original source."* **Policy:** `Publication_Rights === "CC-BY-SA"` →
an article whose `body` is the essay; anything else (Custom License, null) → a link card, `body`
null, "rights retained".

### 0.6 Image paths and the reader parser

`new URL(path, imageHost).href` is the whole encoding story (spaces → `%20`; apostrophes and
existing `%2C` / `%CC%88` untouched; all three shapes fetched 200 `image/jpeg`). Featured thumbs
are 60–290 KB. `src/lib/reader-blocks.ts` splits a stored body on `"\n"`, skips blank lines,
reads `== Heading ==` / `=== Sub ===` markers, and drops apparatus sections ("References",
"Notes" …) — so a body stored as plain paragraphs separated by blank lines, with Markdown `## `
headings rewritten to `== … ==`, renders correctly with no parser change.

### 0.7 Fixture rows (recorded by the script in Task 2)

| kind | slug | why |
|---|---|---|
| collection | `atlantic-city-sand-sculpture` | the plain case: LoC source (`Umbrella_Title` "Library of Congress"), excerpt 85 chars, 4-paragraph Preamble |
| collection | `marnameh` | Markdown `*…*` inside the title; two "Unclear" sources; Books |
| collection | `fixed-stars` | **Non-commercial** source → excluded by the rights policy; `\n` inside the title |
| collection | `presidents-and-turkeys` | `Excerpt` null → blurb falls back to the Preamble's first ≥60-char paragraph ("Happy Thanksgiving!" is the first) |
| collection | `the-little-book-of-love` | `<em>` inside the Excerpt |
| collection | `hands-1944` | `Featured_Image_Path` null → `toItem` throws |
| essay | `ars-notoria` | **Custom License** (book excerpt) → link card; `*…*` in title and Intro; author "Anne Lawrence-Mathers" |
| essay | `warburgs-werewolf-an-anamnesis` | CC-BY-SA, series **Conjectures**; body opens with `## Panel 1: *Verflucht*</br><p class=…>…<br/>…</p>` — the heading + `<br>` + `<p>` case; has `<blockquote class=…>` |
| essay | `sharing-photographs` | `Publication_Rights` **null**, series **Curator’s Choice**, `Categories` null, two authors → link card |
| essay | `stories-of-a-hollow-earth` | plain CC-BY-SA essay with a bare `<blockquote>` paragraph ("I declare that the earth is hollow…") |

---

## 1. Decisions (Ben's, 09-02-26 afternoon) and the planner's calls under them

**Ben's:**
1. **Collections: image item + text below.** `type: "image"` (gallery and wander rail keep them),
   `body` = the Preamble as plain paragraphs, rendered on the item page under the blurb. Feed
   tiles and `/g/` do not change.
2. **Essays are in**, series included. CC BY-SA ones are `type: "article"` with the essay as
   `body` (the existing reader view); Custom License / unlabelled ones are link cards (`type:
   "image"`, `body` null, Intro as blurb, credit and link).
3. **Blog out.**
4. (from the morning) Silence is permission; verbatim CC BY-SA text; every medium.

**Planner's calls under those — flip before executing, not during:**
- **The reuse notice is rendered.** PDR's CC BY-SA terms ask that reused text be introduced by
  a note naming the original and PDR. Once we show the text in full, the honest move is a
  one-line `ReuseNotice` above it on both item variants: *"Text originally published on The
  Public Domain Review under CC BY-SA 4.0."*, linked to the piece. Keyed on data (`source ===
  "pdr" && body`), not on type.
- **`LinkOutRow` learns `pdr`** with the copy *"See it on The Public Domain Review"* — a
  collection's page holds the full gallery and an essay card's page holds the essay, so the
  prominent row earns its place there as it does on blogs.
- **The walk-source invariant is rescoped to blogs.** "Walk rows carry no body" was true only
  because every walker so far was a blog; the invariant (6.3's D5) is about *blogs*. Both halves
  of `source-invariants.test.ts` now iterate `BLOGS`, and SPEC §5.1's `body` row says so.
- **Rights policy in `walk()`, not `toItem()`** for the Non-commercial collections: they never
  become raws, so they neither eat `--quota` nor print sixty `toItem failed` lines nightly; one
  `console.warn` per page with the count. (Absent from `seenSourceIds` either way, so `--prune`
  treats a rights change as a removal — correct.) The no-image case throws in `toItem` per the
  wp-rest convention.
- **Blurb fallback:** a collection whose Excerpt is empty or under 60 chars takes its Preamble's
  first ≥60-char paragraph, `toLede`-cut at 400 (PDR's own text, not synthesis).
- **`sourceId` is `collection/<slug>` / `essay/<slug>`** — one source, two namespaces, no
  collision if a collection and an essay share a slug.
- **Attribution:** collections credit the holding institution(s) (`Umbrella_Title[0] ?? Title`,
  deduped, ` · `-joined; PDR's own name when none); essays credit their authors (`Contributors[].Name`,
  `, `-joined). **License:** collections
  `Public domain — <PD profile> · text CC BY-SA 4.0 (The Public Domain Review)`; CC BY-SA essays
  `Text CC BY-SA 4.0 (The Public Domain Review) · images public domain`; link-card essays
  `Rights retained by the author — displayed with credit and link`.
- **Essay apparatus dropped:** footnote markers stripped, `Footnotes` / `Bibliography` /
  `Public_Domain_Resources` / `Special_Intro` not stored; image blocks (and their captions)
  removed from bodies — the pictures cannot be shown inline, and the link-out reaches them.
- **`pdr` is a walk source but not a designated blog.** Its own `config/pdr.ts`, no `BLOGS`
  row; `blogs.test.ts`'s "every walk source is a blog" names `pdr` as the exception.

---

## 1a. Cut 1 (topic vocabulary growth) — what it changes here

Written 09-02-26 afternoon, re-reading this plan against the two documents that paused it:
`docs/DESIGN_topic-vocabulary-growth.md` (the principle and its evidence) and
`docs/PLAN_topic-vocabulary-cut1.md` (what was built). Read the design's §1–§2 for the why if you
want it; **this section is the operational delta and is sufficient on its own.**

**The principle, in one line.** Walk sources ingest their whole corpus and the topic vocabulary
grows to fit them. Ingest no longer drops a walk item because none of the sixteen topics is an
honest home: it stores it **un-homed** (`item.topic_id` NULL, no `item_topic` membership rows) and
prints a tag histogram over what those items are about. The quality bar is untouched —
`structuralFloor` and the curation score still decide what is stored at all. "Everything" means
everything that clears *quality*, never a relaxed floor.

**What that does not change in this plan.** Tasks 1–5 stand exactly as written. `toItem` is still
pure and synchronous; `NormalizedItem` is unchanged; the `CorpusWalkAdapter` contract is unchanged;
the rights policy, the disk cache, the phased cursor, the body / link-card split and the item-page
rendering are all independent of topics. Both projections' `tags` arrays are unchanged and are now
worth *more* (below). The design's §12 warned that this plan "rewrites the same walk lane in
`scripts/ingest.ts`" — **it does not.** This plan never edits `scripts/ingest.ts`; it only asserts
that lane's output in a dry run. The one file both plans touch is `scripts/walk-stats.ts`, in
disjoint regions. (That is why Tasks 1–5 were cleared to run alongside Cut 1's execution while it
was still in flight; it merged the same afternoon, so the question is now moot.)

**The one hard ordering rule.** Cut 1's migration backfills `item_topic.origin` from a **source
list frozen in the SQL**, and `pdr` is not in it — correctly, because no PDR rows existed when it
was written. Any PDR row written to a database *before* that migration runs would therefore be
backfilled `origin='seed'` when it is in fact curator-classified: a silent lie in the one column
Cut 2's promotion audits. Tasks 1–6 write no rows, so this bites only on a Keep full walk.
**Never full-walk PDR into a database whose `item_topic` migration has not run.** Task 7 opens with
the check.

**What changes in the evidence (Tasks 6–7).** The number that was going to decide this source has
changed meaning.

- `stats:walk` now reports `stored X of offered · un-homed Y of stored` plus an `un-homed tags:`
  line. The word *refused* is gone from the script; it should be gone from your report too.
- `bun run ingest --dry-run` now prints `(un-homed — stored)` in the classification block,
  `would store un-homed (walk): N` with a `top tags among them: …` line, and
  `memberships written: 0 (--dry-run)`. Nothing is dropped for topic fit.
- **A high un-homed share is not an argument against PDR.** It was the argument against
  streetartnews, and the design (§13) explicitly retired it: un-homed items are stored, and their
  tags are the raw material for new topics. The verdict question is now *"is what this source
  publishes worth having, and what vocabulary does it bring?"* — not *"does it fit the sixteen?"*
- Un-homed items are **invisible to the feed** (SQL `NULL` matches neither `inArray` nor `eq`) and
  reachable only by direct link `/i/<id>` and the gallery rail's wildcard slots, until Cut 2's
  promotion path exists. Intended, not a defect to fix here.

**Why PDR is the strongest vocabulary source in the corpus — and the trap that comes with it.**
Every other walk source brings free-text blog tags, unreliably (two of streetartnews' three newest
posts had none at all). PDR brings **controlled vocabularies**: `Medium`, `Theme`, `Style`, `Epoch`
and curated `Tags`, 4–12 per record, across all 1,648 pieces. That is the best promotion material
Cut 2 will ever see, and it is a real argument in this source's favour.

The trap is in the same fact. Task 3 lowercases all four taxonomies into one `tags` array, so the
un-homed histogram will surface `film`, `book`, `18th century` alongside subject terms — but
**medium and epoch are different axes** from the sixteen subject topics, and promoting them would
give the drift graph nodes that are not *about* anything. Whether Ambit's vocabulary grows along
one axis or several is a Cut 2 decision, not this plan's. **Say so in the verdict report (Task 6
step 8)** so it is decided deliberately rather than by whichever term happens to top a histogram.

**Never `--skip-llm` on a walk source.** Under Cut 1 it writes nothing for the walk lane at all —
an unscored, unclassified row would be skipped as "already in DB" by every later real run and so
block its own curation forever. It is not a cheap sample; `--dry-run` is.

**Cut 1 is already in `main`** (merged `acd1437`, 09-02-26 afternoon — `docs/WALKTHROUGH_topic-
vocabulary-cut1.md` has the run numbers), so a branch cut from today's `main` has it and there is
nothing to rebase. Confirm before Task 6 anyway, since every expected output below assumes it:

```bash
grep -n "item_topic" src/server/db/schema.ts     # the table and its origin type
ls drizzle/0004_item_topic.sql                   # the migration, backfill included
grep -n "unhomed" scripts/walk-stats.ts          # the counter, renamed from `refused`
```

If you ever *do* rebase this branch, the only file that can conflict is `scripts/walk-stats.ts` —
Cut 1 rewrote its counters (around lines 70–72 and 106–121) while Task 6 step 1 adds a `--cursor`
flag at the `let cursor` declaration and in the usage block. Both edits are wanted; keep both.

---

## 2. File map

| path | responsibility |
|---|---|
| `src/server/config/pdr.ts` — **create** | plain data: id, label, hosts, robots-check date; the two essay license strings. Client-safe (no I/O) |
| `src/server/services/sources/pdr.ts` — **create** | the adapter: wire types, pure helpers, disk cache, phased `walk`, `toItem` |
| `src/server/services/sources/pdr.test.ts` — **create** | fixture tests for both kinds + pure helpers + cache round-trip |
| `src/server/services/sources/__fixtures__/pdr.json` — **create** | ten hydrated `PdrRaw` rows, trimmed |
| `scripts/record-pdr-fixture.ts` — **create, run, delete** (never commit) | records the fixture |
| `src/server/services/sources/types.ts` — modify (Task 4) | `SourceId` gains `"pdr"` |
| `src/server/config/topics.ts` — modify (Task 4) | `WALK_SOURCES` gains `"pdr"` |
| `src/server/services/sources/index.ts` — modify (Task 4) | `walkers` gains `pdr` |
| `src/server/services/sources/source-invariants.test.ts` — modify (Task 4) | fixture map gains `pdr`; both invariants iterate `BLOGS` |
| `src/server/config/blogs.test.ts` — modify (Task 4) | the walk-sources ⊇ blogs assertion learns `pdr` |
| `src/lib/source-label.ts`, `.test.ts` — modify (Task 1) | `pdr: "The Public Domain Review"` |
| `src/components/item/reader-blocks.tsx` — **create** (Task 5) | the block list extracted from `reader-item-body.tsx`, shared by both variants |
| `src/components/item/reuse-notice.tsx` — **create** (Task 5) | the CC BY-SA line for PDR text |
| `src/components/item/reader-item-body.tsx`, `image-item-body.tsx`, `link-out-row.tsx` — modify (Task 5) | wire the two components; `pdr` copy on the link-out |
| `src/components/item/item-sections.test.tsx`, `link-out-row.test.tsx` — modify (Task 5) | the rendering tests |
| `scripts/walk-stats.ts` — modify (Task 6) | a `--cursor` start flag so the essay phases can be sampled on their own |
| `CLAUDE.md`, `docs/source-candidates.md`, `docs/HANDOFF_publicdomainreview.md`, `log.md` — modify (Task 6) | evidence + status |
| `SPEC.md` §5.1 `body` row (Task 5), §6.1 bullet (after Keep) | the contract |

---

### Task 1: Config row and credit-line label

**Files:**
- Create: `src/server/config/pdr.ts`
- Modify: `src/lib/source-label.ts`, `src/lib/source-label.test.ts`

**Interfaces:**
- Produces: `PDR` (`{ id: "pdr"; label; baseUrl; imageHost; reusePolicyUrl; robotsCheckedOn }`, `as const`), `PDR_ESSAY_LICENSE`, `PDR_CARD_LICENSE` — read by Tasks 2–5.

**Typecheck note for Tasks 1–3:** the repo keys two registries on complementary halves of
`SourceId` (`adapters` on the search half, `walkers` on the walk half), so no state in which
`"pdr"` is in `SourceId` but not fully registered typechecks. The `SourceId` member is therefore
added in **Task 4** with `WALK_SOURCES` and `walkers`; Task 3 runs Vitest, ESLint and Prettier but
**not** `bun run typecheck` — `pdr.ts`'s `source: "pdr"` is a type error until Task 4, by
construction. Tasks 1 and 2 typecheck clean on their own.

- [ ] **Step 1: Branch**

```bash
git branch --show-current && git status --short   # expect main, and only files you recognise
git checkout -b feat/pdr-walk
```

- [ ] **Step 2: Write the failing label test** — append inside `describe("sourceLabel")` in `src/lib/source-label.test.ts`:

```ts
  it("names The Public Domain Review the way its masthead does", () => {
    // Without the table entry the fallback prints "Pdr" — a wrong claim on the credit line.
    expect(sourceLabel("pdr")).toBe("The Public Domain Review");
  });
```

- [ ] **Step 3: Run it, watch it fail**

Run: `bunx vitest run src/lib/source-label.test.ts`
Expected: FAIL — `expected 'Pdr' to be 'The Public Domain Review'`

- [ ] **Step 4: Create `src/server/config/pdr.ts`**

```ts
// The Public Domain Review as a source (sources round 2, 09-02-26; docs/HANDOFF_publicdomainreview.md
// is the probe, docs/PLAN_publicdomainreview.md the design). Plain data, no I/O — this file is
// imported by src/lib/source-label.ts, which client components render, so it must stay
// import-safe there.
//
// **Why this is not a row in blogs.ts.** BLOGS is the registry of *designated blogs*: content whose
// rights are retained by its authors and which Ambit shows only as a link card under the one
// honest BLOG_LICENSE string. PDR is a different case — a publication whose featured images are
// public domain and whose own text it licenses CC BY-SA 4.0 — so it is a walk source (no search
// API; the whole corpus is walked, docs/PHASE6_DESIGN_6.3.md §4) that is NOT a blog. Its license
// strings are built per item in services/sources/pdr.ts from each record's own rights fields;
// the two constants below are the essay cases that are the same on every row.
//
// **robots.txt:** none — 404 on 09-02-26 (and no sitemap.xml). Ben's call, recorded in the handoff
// §1: silence is permission. `assertCrawlAllowed` already treats a 404 as "no policy"; the walker
// calls it on every run like every other walk source, so a policy file appearing later is honoured
// the night it appears.
export const PDR = {
  id: "pdr",
  /** The credit line's text, and the attribution fallback when a collection names no institution. */
  label: "The Public Domain Review",
  /** Origin only — no path, no trailing slash. The walker builds every URL from it. */
  baseUrl: "https://publicdomainreview.org",
  /** Where Featured_Image_Path resolves. Also sent in every detail response as
   *  `site.siteMetadata.imageHost`; the walker prefers the live value and falls back to this. */
  imageHost: "https://pdr-assets.b-cdn.net",
  /** PDR's own reuse terms — the CC BY-SA 4.0 grant the license strings point at. */
  reusePolicyUrl: "https://publicdomainreview.org/reusing-material/",
  /** ISO date of the last human check of /robots.txt (404 — no policy). */
  robotsCheckedOn: "2026-09-02",
} as const;

/** An essay PDR publishes under CC BY-SA 4.0: the text is stored and shown in full. The
 *  historical images in an essay carry no rights labels on PDR's side, "just links to the
 *  original source" (reusing-material) — hence the second clause. */
export const PDR_ESSAY_LICENSE =
  "Text CC BY-SA 4.0 (The Public Domain Review) · images public domain";

/** An essay under "Custom License" (book excerpts, reprints) or with no label: the same posture
 *  as a designated blog — one image, PDR's own teaser, a credit and a link, never the text. */
export const PDR_CARD_LICENSE =
  "Rights retained by the author — displayed with credit and link";
```

- [ ] **Step 5: Add the label** — in `src/lib/source-label.ts`:

```ts
import { BLOGS } from "~/server/config/blogs";
import { PDR } from "~/server/config/pdr";
```

and inside `SOURCE_LABELS`, after the `...Object.fromEntries(BLOGS…)` spread:

```ts
  // Sources round 2 (09-02-26): a walk source that is not a blog — its label lives in its own
  // config row for the same reason the blogs' do (one source of truth for the credit line).
  [PDR.id]: PDR.label,
```

- [ ] **Step 6: Run the test, then the gates**

Run: `bunx vitest run src/lib/source-label.test.ts`
Expected: PASS (4 tests)

Run: `bun run typecheck && bunx eslint src/server/config/pdr.ts src/lib/source-label.ts src/lib/source-label.test.ts && bunx prettier --check src/server/config/pdr.ts src/lib/source-label.ts src/lib/source-label.test.ts`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git status --short   # only the three files above
git add src/server/config/pdr.ts src/lib/source-label.ts src/lib/source-label.test.ts
git commit -m "feat(sources): pdr config row, license strings and credit-line label"
```

---

### Task 2: Fixture and the pure helpers (TDD)

**Files:**
- Create: `scripts/record-pdr-fixture.ts` (temporary), `src/server/services/sources/__fixtures__/pdr.json`
- Create: `src/server/services/sources/pdr.ts` (types + pure helpers only in this task)
- Create: `src/server/services/sources/pdr.test.ts`

**Interfaces:**
- Produces (all exported from `pdr.ts`):
  - `interface PdrCollection`, `interface PdrEssay`, `type PdrRaw` (a discriminated union on `kind`)
  - `plainText(s: string): string`
  - `bodyText(markup: string): string`
  - `leadParagraph(preamble: string, min?: number): string | undefined`
  - `passesRightsPolicy(c: PdrCollection): boolean`
  - `collectionAttribution(c: PdrCollection): string`, `collectionLicense(c: PdrCollection): string`
  - `essayIsOpen(e: PdrEssay): boolean`, `essayAttribution(e: PdrEssay): string`
  - `imageUrlFor(host: string, path: string | null): string | null`
  - `parseCursor(cursor?: string): { phase: number; offset: number }`, `nextCursor(phase: number, offset: number, taken: number, total: number): string | undefined`

- [ ] **Step 1: Record the fixture** — create `scripts/record-pdr-fixture.ts`:

```ts
#!/usr/bin/env bun
// One-off: records src/server/services/sources/__fixtures__/pdr.json from the live site — ten
// records chosen in docs/PLAN_publicdomainreview.md §0.7, trimmed to the fields toItem reads,
// long bodies cut to their first eight blank-line-separated chunks. Delete this file after use;
// the fixture is the artifact.
import { writeFile } from "node:fs/promises";

const COLLECTIONS = [
  "atlantic-city-sand-sculpture",
  "marnameh",
  "fixed-stars",
  "presidents-and-turkeys",
  "the-little-book-of-love",
  "hands-1944",
];
const ESSAYS = [
  "ars-notoria",
  "warburgs-werewolf-an-anamnesis",
  "sharing-photographs",
  "stories-of-a-hollow-earth",
];

type Rec = Record<string, unknown>;
const cut = (s: unknown, n: number) =>
  typeof s === "string" ? s.split(/\n\s*\n/).slice(0, n).join("\n\n") : null;
const pick = (c: Rec, k: string) => c[k] ?? null;
const labels = (xs: unknown) =>
  ((xs as { data: { Label: string } }[] | null) ?? []).map((t) => ({ data: { Label: t.data.Label } }));

async function page(kind: "collection" | "essay", slug: string) {
  await new Promise((r) => setTimeout(r, 500));
  const res = await fetch(
    `https://publicdomainreview.org/page-data/${kind}/${encodeURIComponent(slug)}/page-data.json`,
    { headers: { "User-Agent": "Ambit/0.1 (fixture recorder)" } },
  );
  if (!res.ok) throw new Error(`${kind}/${slug}: HTTP ${res.status}`);
  return (await res.json()) as {
    result: { data: { site: { siteMetadata: { imageHost: string } } } & Record<string, { data: Rec }> };
  };
}

const out: unknown[] = [];
for (const slug of COLLECTIONS) {
  const p = await page("collection", slug);
  const c = p.result.data.collection!.data;
  out.push({
    kind: "collection",
    imageHost: p.result.data.site.siteMetadata.imageHost,
    collection: {
      Title: pick(c, "Title"),
      Slug: pick(c, "Slug"),
      Excerpt: pick(c, "Excerpt"),
      Preamble: cut(c.Preamble, 4),
      Featured_Image_Path: pick(c, "Featured_Image_Path"),
      Medium: pick(c, "Medium"),
      Theme: pick(c, "Theme"),
      Style: pick(c, "Style"),
      Epoch: pick(c, "Epoch"),
      Sources: ((c.Sources as { data: Rec }[] | null) ?? []).map((s) => ({
        data: {
          Title: s.data.Title ?? null,
          Umbrella_Title: s.data.Umbrella_Title ?? null,
          Rights_Summary: s.data.Rights_Summary ?? null,
          Rights_Details_Group: s.data.Rights_Details_Group ?? null,
          Rights_License_URL: s.data.Rights_License_URL ?? null,
          Rights_Prose: s.data.Rights_Prose ?? null,
        },
      })),
      Rights_Profiles: ((c.Rights_Profiles as { data: { Group: string; Label: string } }[] | null) ?? []).map(
        (p) => ({ data: { Group: p.data.Group, Label: p.data.Label } }),
      ),
      Tags: labels(c.Tags),
      Published_Date: pick(c, "Published_Date"),
    },
  });
  console.log(`collection/${slug}: ok`);
}
for (const slug of ESSAYS) {
  const p = await page("essay", slug);
  const e = p.result.data.essay!.data;
  out.push({
    kind: "essay",
    imageHost: p.result.data.site.siteMetadata.imageHost,
    essay: {
      Title: pick(e, "Title"),
      Slug: pick(e, "Slug"),
      Intro: pick(e, "Intro"),
      Body: cut(e.Body, 8),
      Publication_Rights: pick(e, "Publication_Rights"),
      License_Note: pick(e, "License_Note"),
      Featured_Image_Path: pick(e, "Featured_Image_Path"),
      Categories: pick(e, "Categories"),
      Series: pick(e, "Series"),
      Tags: labels(e.Tags),
      Contributors: ((e.Contributors as { data: Rec }[] | null) ?? []).map((c) => ({
        data: { Name: c.data.Name ?? null, Slug: c.data.Slug ?? null },
      })),
      Published_Date: pick(e, "Published_Date"),
    },
  });
  console.log(`essay/${slug}: ok`);
}
await writeFile(
  "src/server/services/sources/__fixtures__/pdr.json",
  JSON.stringify(out, null, 2) + "\n",
);
console.log(`wrote ${out.length} rows`);
```

Run: `bun run scripts/record-pdr-fixture.ts`
Expected: ten `ok` lines and `wrote 10 rows`; the file is ~40–60 KB. Open it and confirm:
`fixed-stars` has a source with `"Rights_Summary": "Non-commercial"`; `presidents-and-turkeys`
has `"Excerpt": null` and a Preamble starting `Happy Thanksgiving!`; `hands-1944` has
`"Featured_Image_Path": null`; `the-little-book-of-love`'s Excerpt contains `<em>`;
`ars-notoria` has `"Publication_Rights": "Custom License"`; `warburgs-werewolf-an-anamnesis` has
`"Series": "Conjectures"` and a Body starting `## Panel 1: *Verflucht*</br><p class=`;
`sharing-photographs` has `"Publication_Rights": null`; `stories-of-a-hollow-earth`'s Body
contains `<blockquote>I declare that the earth is hollow`.

Then: `rm scripts/record-pdr-fixture.ts` (never commit it).

- [ ] **Step 2: Write the failing tests** — create `src/server/services/sources/pdr.test.ts`:

```ts
// Fixture tests for the Public Domain Review walker — see __fixtures__/pdr.json: six collections
// and four essays recorded 09-02-26 from Gatsby's page-data JSON (docs/PLAN_publicdomainreview.md
// §0.7 says why each one is there), trimmed to the fields toItem reads.
//
// Pinned here: the two item shapes (a collection is an image item that also carries its body
// essay; an essay is an article when PDR licenses its text and a link card when it doesn't), the
// blurb rules, the rights policy, the license strings, attribution, and that PDR's Markdown/HTML
// dialect never reaches a reader. No walk() test — I/O is not the unit-test surface; `bun run
// probe:walk pdr` is the live check. The cache helpers ARE tested, on a temp dir, because a cache
// that silently misses would cost 1.5 GB a night.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PDR_CARD_LICENSE, PDR_ESSAY_LICENSE } from "~/server/config/pdr";
import fixtures from "./__fixtures__/pdr.json";
import {
  bodyText,
  cachePath,
  collectionAttribution,
  collectionLicense,
  essayAttribution,
  essayIsOpen,
  imageUrlFor,
  leadParagraph,
  nextCursor,
  parseCursor,
  passesRightsPolicy,
  pdr,
  plainText,
  readCached,
  writeCached,
  type PdrRaw,
} from "./pdr";

const raws = fixtures as unknown as PdrRaw[];
const collection = (slug: string) => {
  const found = raws.find((r) => r.kind === "collection" && r.collection.Slug === slug);
  if (!found || found.kind !== "collection") throw new Error(`fixture missing: collection/${slug}`);
  return found;
};
const essay = (slug: string) => {
  const found = raws.find((r) => r.kind === "essay" && r.essay.Slug === slug);
  if (!found || found.kind !== "essay") throw new Error(`fixture missing: essay/${slug}`);
  return found;
};

describe("plainText", () => {
  it("strips PDR's Markdown emphasis and links, HTML tags and entities, and collapses whitespace", () => {
    expect(plainText("Karel Čapek’s *Letters from England* (1925)")).toBe(
      "Karel Čapek’s Letters from England (1925)",
    );
    expect(plainText("Behold:\n‘Abd al-Sūfī’s **Book** (ca. 1430)")).toBe(
      "Behold: ‘Abd al-Sūfī’s Book (ca. 1430)",
    );
    expect(
      plainText('found in the <a href="http://x" target="_blank">Library of Congress</a>.'),
    ).toBe("found in the Library of Congress.");
    expect(plainText("Holly Metz [reports](https://x.pdf) that &amp; more")).toBe(
      "Holly Metz reports that & more",
    );
    expect(
      plainText("Before {image\n\tpath={/a.jpg}\n  alt={x}\n  caption={y}\nendimage} after[^1]"),
    ).toBe("Before after");
  });
});

describe("bodyText", () => {
  it("keeps paragraphs apart, turns block HTML into breaks, rewrites ## headings as wiki markers", () => {
    const markup = [
      "## Panel 1: *Verflucht*</br><p class=\"left-pad\">Sanatorium Bellevue<br/>Michaelistag, 1922</p>",
      "",
      "First <i>real</i> paragraph.[^1]",
      "",
      "{image\n  path={/a.jpg}\n  alt={x}\n  caption={A caption that must not survive.}\nendimage}",
      "",
      "<blockquote>I declare that the earth is hollow.</blockquote>",
      "",
      "### A subsection",
      "",
      "Last one.",
    ].join("\n");
    expect(bodyText(markup)).toBe(
      [
        "== Panel 1: Verflucht ==",
        "Sanatorium Bellevue",
        "Michaelistag, 1922",
        "First real paragraph.",
        "I declare that the earth is hollow.",
        "=== A subsection ===",
        "Last one.",
      ].join("\n\n"),
    );
    expect(bodyText("")).toBe("");
  });
});

describe("leadParagraph", () => {
  it("returns the first paragraph of at least 60 plain characters, lede-cut at 400", () => {
    const preamble = collection("presidents-and-turkeys").collection.Preamble!;
    const lead = leadParagraph(preamble);
    expect(lead).toMatch(/^The pictures below are from the National Thanksgiving Turkey Presentation/);
    expect(lead!.length).toBeLessThanOrEqual(400);
  });
  it("is undefined when no paragraph reaches the floor", () => {
    expect(leadParagraph("Happy Thanksgiving!\n\nShort.")).toBeUndefined();
    expect(leadParagraph("")).toBeUndefined();
  });
});

describe("rights, attribution, license", () => {
  it("keeps PD, Unclear, null and Attribution copies; drops a Non-commercial one", () => {
    expect(passesRightsPolicy(collection("atlantic-city-sand-sculpture").collection)).toBe(true);
    expect(passesRightsPolicy(collection("marnameh").collection)).toBe(true);
    expect(passesRightsPolicy(collection("presidents-and-turkeys").collection)).toBe(true);
    expect(passesRightsPolicy(collection("fixed-stars").collection)).toBe(false);
  });
  it("credits a collection's umbrella institution, deduped, and PDR only when none is named", () => {
    expect(collectionAttribution(collection("atlantic-city-sand-sculpture").collection)).toBe(
      "Library of Congress",
    );
    expect(collectionAttribution(collection("marnameh").collection)).toBe(
      "Public Library of India · Internet Archive",
    );
    expect(collectionAttribution({ ...collection("marnameh").collection, Sources: null })).toBe(
      "The Public Domain Review",
    );
  });
  it("states both regimes on a collection: the work's PD profile and PDR's CC BY-SA text", () => {
    expect(collectionLicense(collection("atlantic-city-sand-sculpture").collection)).toBe(
      "Public domain — PD Worldwide · text CC BY-SA 4.0 (The Public Domain Review)",
    );
    expect(collectionLicense({ ...collection("marnameh").collection, Rights_Profiles: null })).toBe(
      "Public domain · text CC BY-SA 4.0 (The Public Domain Review)",
    );
  });
  it("opens an essay only on an explicit CC-BY-SA label, and credits its authors", () => {
    expect(essayIsOpen(essay("stories-of-a-hollow-earth").essay)).toBe(true);
    expect(essayIsOpen(essay("ars-notoria").essay)).toBe(false); // "Custom License"
    expect(essayIsOpen(essay("sharing-photographs").essay)).toBe(false); // null
    expect(essayAttribution(essay("sharing-photographs").essay)).toBe(
      "Dr. Antje Schmidt, Dr. Esther Ruelfs",
    );
    expect(essayAttribution({ ...essay("ars-notoria").essay, Contributors: null })).toBe(
      "The Public Domain Review",
    );
  });
});

describe("imageUrlFor", () => {
  it("resolves against the host and encodes only what needs encoding", () => {
    const host = "https://pdr-assets.b-cdn.net";
    expect(imageUrlFor(host, "/collections/a/sand-sculptor-thumb.jpg")).toBe(
      "https://pdr-assets.b-cdn.net/collections/a/sand-sculptor-thumb.jpg",
    );
    expect(imageUrlFor(host, "/collections/a/postcard of a snowman%2C 1918-thumb.jpg")).toBe(
      "https://pdr-assets.b-cdn.net/collections/a/postcard%20of%20a%20snowman%2C%201918-thumb.jpg",
    );
    expect(imageUrlFor(host, "/collections/a/Fool's_Cap.jpg")).toBe(
      "https://pdr-assets.b-cdn.net/collections/a/Fool's_Cap.jpg",
    );
    expect(imageUrlFor(host, null)).toBeNull();
  });
});

describe("cursors", () => {
  it("parses <phase>:<offset>, starting at the collections phase", () => {
    expect(parseCursor(undefined)).toEqual({ phase: 0, offset: 0 });
    expect(parseCursor("c:50")).toEqual({ phase: 0, offset: 50 });
    expect(parseCursor("e:0")).toEqual({ phase: 1, offset: 0 });
    expect(parseCursor("k:20")).toEqual({ phase: 3, offset: 20 });
    expect(() => parseCursor("z:0")).toThrow(/pdr: bad cursor/);
    expect(() => parseCursor("c:-1")).toThrow(/pdr: bad cursor/);
    expect(() => parseCursor("50")).toThrow(/pdr: bad cursor/);
  });
  it("advances within a phase, rolls into the next phase at its end, ends after the last", () => {
    expect(nextCursor(0, 0, 50, 1255)).toBe("c:50");
    expect(nextCursor(0, 1250, 5, 1255)).toBe("e:0");
    expect(nextCursor(0, 0, 0, 0)).toBe("e:0"); // an empty index still moves on
    expect(nextCursor(2, 0, 21, 21)).toBe("k:0");
    expect(nextCursor(3, 0, 29, 29)).toBeUndefined();
  });
});

describe("record cache", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a record by kind, misses on absence, and treats a torn file as a miss", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "pdr-cache-"));
    const raw = collection("marnameh");
    expect(await readCached(dir, "collection", "marnameh")).toBeNull();
    await writeCached(dir, "collection", "marnameh", raw);
    expect(await readCached(dir, "collection", "marnameh")).toEqual(raw);
    expect(await readCached(dir, "essay", "marnameh")).toBeNull(); // kinds never collide
    await writeFile(cachePath(dir, "collection", "torn"), "{not json");
    expect(await readCached(dir, "collection", "torn")).toBeNull();
  });

  it("refuses a slug that could escape the directory", () => {
    expect(() => cachePath("/tmp/x", "essay", "../etc/passwd")).toThrow(/pdr: unsafe slug/);
    expect(() => cachePath("/tmp/x", "essay", "a/b")).toThrow(/pdr: unsafe slug/);
    expect(() => cachePath("/tmp/x", "essay", "")).toThrow(/pdr: unsafe slug/);
    // The one real non-ASCII slug in the index is fine — it is a name, not a path.
    expect(cachePath("/tmp/x", "collection", "russian-lubki-18th–19th-century")).toBe(
      "/tmp/x/collection/russian-lubki-18th–19th-century.json",
    );
  });
});

describe("pdr.toItem — collections", () => {
  it("maps a collection to an image item carrying its body essay, institution credit", () => {
    const item = pdr.toItem(collection("atlantic-city-sand-sculpture"));
    expect(item.source).toBe("pdr");
    expect(item.sourceId).toBe("collection/atlantic-city-sand-sculpture");
    expect(item.type).toBe("image");
    expect(item.title).toBe("Photographs of Atlantic City Sand Sculpture (ca. 1880–1920)");
    expect(item.summary).toBe(
      "Photographs from when Atlantic City beaches featured artists ornately sculpting sand.",
    );
    // The Preamble, as plain paragraphs — this is what the item page renders under the picture.
    expect(item.body).toMatch(/^New Jersey’s Atlantic City emerged as a booming Edwardian seaside destination/);
    expect(item.body!.split("\n\n").length).toBeGreaterThanOrEqual(3);
    expect(item.imageUrl).toBe(
      "https://pdr-assets.b-cdn.net/collections/atlantic-city-sand-sculpture/sand-sculptor-thumb.jpg",
    );
    expect(item.sourceUrl).toBe(
      "https://publicdomainreview.org/collection/atlantic-city-sand-sculpture/",
    );
    expect(item.attribution).toBe("Library of Congress");
    expect(item.license).toBe(
      "Public domain — PD Worldwide · text CC BY-SA 4.0 (The Public Domain Review)",
    );
    expect(item.tags).toEqual(
      expect.arrayContaining(["images", "music & arts", "photography", "20th century", "sand"]),
    );
    expect(new Set(item.tags).size).toBe(item.tags.length);
    for (const t of item.tags) expect(t).toBe(t.trim().toLowerCase());
  });

  it("strips Markdown emphasis from a title", () => {
    expect(pdr.toItem(collection("marnameh")).title).toBe(
      "“The Persian Mâr-Nâmeh or, The Book for Taking Omens from Snakes” (1892)",
    );
  });

  it("falls back to the Preamble's first substantial paragraph when the Excerpt is empty", () => {
    const item = pdr.toItem(collection("presidents-and-turkeys"));
    expect(item.summary).toMatch(/^The pictures below are from the National Thanksgiving/);
    expect(item.summary.length).toBeGreaterThanOrEqual(60);
  });

  it("throws on a collection with no featured image, naming it", () => {
    expect(() => pdr.toItem(collection("hands-1944"))).toThrow(
      /pdr: collection "hands-1944" has no featured image/,
    );
  });
});

describe("pdr.toItem — essays", () => {
  it("maps a CC-BY-SA essay to an article with the essay as body, authors as attribution", () => {
    const item = pdr.toItem(essay("stories-of-a-hollow-earth"));
    expect(item.type).toBe("article");
    expect(item.sourceId).toBe("essay/stories-of-a-hollow-earth");
    expect(item.title).toBe("Stories of a Hollow Earth");
    expect(item.summary).toMatch(/^In 1741 the Norwegian-Danish author Ludvig Holberg published Klimii Iter Subterraneum,/);
    expect(item.body).toMatch(/^In 1818 John Cleves Symmes, Jr, issued his “Circular Number 1,”/);
    // The <blockquote> became its own paragraph.
    expect(item.body).toMatch(/\n\nI declare that the earth is hollow and habitable within/);
    expect(item.imageUrl).toBe(
      "https://pdr-assets.b-cdn.net/essays/stories-of-a-hollow-earth/nielsklimsjourne00holb_0139-540.jpg",
    );
    expect(item.sourceUrl).toBe("https://publicdomainreview.org/essay/stories-of-a-hollow-earth/");
    expect(item.attribution).toBe("Peter Fitting");
    expect(item.license).toBe(PDR_ESSAY_LICENSE);
    expect(item.tags).toEqual(expect.arrayContaining(["books", "literature", "hollow earth"]));
  });

  it("rewrites a Markdown heading as a wiki marker and tags a series piece with its series", () => {
    const item = pdr.toItem(essay("warburgs-werewolf-an-anamnesis"));
    expect(item.type).toBe("article");
    expect(item.body).toMatch(/^== Panel 1: Verflucht ==\n\nSanatorium Bellevue, Kreuzlingen, Switzerland\n\nMichaelistag, 1922\n\n/);
    expect(item.tags).toContain("conjectures");
    expect(item.attribution).toBe("Kevin Dann");
  });

  it("makes a link card of a Custom License essay: image item, Intro as blurb, no body", () => {
    const item = pdr.toItem(essay("ars-notoria"));
    expect(item.type).toBe("image");
    expect(item.body).toBeNull();
    expect(item.title).toBe(
      "Artificial Intelligence: Ars Notoria and the Promise of Instant Knowledge",
    );
    expect(item.summary).toMatch(/^Centuries before Neo instantly mastered Kung Fu in The Matrix, medieval scholars/);
    expect(item.attribution).toBe("Anne Lawrence-Mathers");
    expect(item.license).toBe(PDR_CARD_LICENSE);
  });

  it("treats an unlabelled essay as a link card too", () => {
    const item = pdr.toItem(essay("sharing-photographs"));
    expect(item.type).toBe("image");
    expect(item.body).toBeNull();
    expect(item.license).toBe(PDR_CARD_LICENSE);
    expect(item.tags).toEqual(expect.arrayContaining(["photography", "curator’s choice"]));
  });
});

describe("pdr.toItem — safety, every fixture row", () => {
  it("never lets HTML or Markdown through in title, summary or body", () => {
    for (const raw of raws) {
      let item;
      try {
        item = pdr.toItem(raw);
      } catch {
        continue; // hands-1944
      }
      for (const field of [item.title, item.summary, item.body ?? ""]) {
        expect(field).not.toMatch(/<[^>]+>|&[#a-z0-9]+;|\]\(|\{image|\[\^/i);
      }
      expect(item.body ?? "").not.toMatch(/\*[^*\n]+\*/);
    }
  });
});
```

- [ ] **Step 3: Run it, watch it fail on the missing module**

Run: `bunx vitest run src/server/services/sources/pdr.test.ts`
Expected: FAIL — `Cannot find module './pdr'` (or an equivalent resolution error).

- [ ] **Step 4: Create `src/server/services/sources/pdr.ts` — header, types and pure helpers** (the cache, `walk` and `toItem` are appended in Task 3; end the file after `nextCursor` for now):

```ts
// The Public Domain Review as a corpus-walk source (sources round 2, 09-02-26;
// docs/HANDOFF_publicdomainreview.md is the probe, docs/PLAN_publicdomainreview.md the design).
// The third walker family after WordPress REST (wp-rest.ts) and Tumblr (things-organized-neatly.ts):
// ONE-SHOT INDEXES plus PER-RECORD HYDRATION, over two kinds of record.
//
// **The API that isn't one.** publicdomainreview.org is a static Gatsby build. Gatsby writes, for
// every route `/foo/`, a sibling `/page-data/foo/page-data.json` holding exactly the props the page
// was rendered with — so the site's own build output is a structured JSON API nobody has to
// maintain. Four listing pages hand over the whole archive in four requests (1,255 collections;
// 343 essays; the Conjectures and Curator's Choice series, 21 + 29, which the essays listing does
// not include); every record's own page-data carries its full text and rights fields — inside a
// 0.5–1.2 MB envelope, because Gatsby also embeds the site's whole index and institution list in
// each one.
//
// **Hence the cache.** Hydrating everything is ~1.7 GB from Netlify's CDN; doing that nightly
// would be a real bandwidth bill on a non-profit. So each hydrated record (the 8–30 KB we need, not
// the envelope) is written to `.cache/pdr/<kind>/<slug>.json` the first time and read from disk
// forever after — the same cache-aside shape as the curator's `.cache/curation` (and, in
// production, the same persistent `/app/.cache` volume). A nightly walk is then four index fetches
// plus detail fetches for the handful of new pieces. There is no revalidation: the indexes carry
// no modified date, and Netlify's ETags change on every detail whenever *anything* is published
// (the embedded index changes), so conditional GETs would not help. `rm -rf .cache/pdr` is the
// refresh, and it costs one polite fifteen-minute walk.
//
// **What one item is — two kinds, one source.**
//   - A COLLECTION → one `image` item, whatever its Medium (Ben's decision: Images, Books, Film,
//     Audio, Animated GIF, Class of..., Mixed — the featured image is a poster or cover for the
//     non-image media). PDR's one-sentence Excerpt is the blurb (the Preamble's first substantial
//     paragraph stands in when the Excerpt is empty or thin), and the Preamble itself — PDR's own
//     text, CC BY-SA 4.0 — is stored as `body` and rendered on the item page UNDER the picture
//     (components/item/image-item-body.tsx). The item stays an image item so it keeps its place
//     in the gallery and the wander rail. A collection whose digital copy an institution marks
//     Non-commercial is dropped in walk() by passesRightsPolicy() (~5%, all Bibliothèque nationale
//     de France in the planning sample).
//   - An ESSAY → an `article` item whose `body` is the essay when PDR labels it `CC-BY-SA` (28 of
//     32 sampled), else a LINK CARD — an `image` item with the Intro as blurb and no body — the
//     same posture as a designated blog, because a book excerpt's text is not ours to reproduce.
//     Footnotes, bibliography and the inline image blocks (with their captions) are dropped: the
//     link-out reaches all of it.
//
// **Etiquette.** robots.txt (absent — 404, Ben's decision) is checked at the start of every walk;
// requests are 500 ms apart and sequential; a 401/403 ends the walk on the first response.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PDR, PDR_CARD_LICENSE, PDR_ESSAY_LICENSE } from "~/server/config/pdr";
import { fetchJson } from "./http";
import { htmlToText, toLede, uniqueTags } from "./normalize";
import { assertCrawlAllowed } from "./robots";
import type {
  CorpusWalkAdapter,
  FetchOpts,
  NormalizedItem,
  WalkPage,
} from "./types";

/** Records hydrated per walk() page. 50 detail fetches at 500 ms is ~25 s a page, uncached. */
const PAGE_SIZE = 50;
const DELAY_MS = 500;
/** structuralFloor's thin-summary line (curator.ts): an Excerpt shorter than this would floor,
 *  so toItem reaches for the Preamble instead. */
const EXCERPT_MIN = 60;
/** How much of a Preamble paragraph becomes a blurb. */
const LEAD_MAX = 400;
/** Where hydrated records live. Relative to the process's cwd like the curator's cache — the
 *  project root in dev, `/app` (the persistent volume) in production. */
export const PDR_CACHE_DIR = path.join(process.cwd(), ".cache", "pdr");

// ── the wire shapes, as much of them as toItem reads ─────────────────────────────────────────

export type PdrKind = "collection" | "essay";

/** One institution named on a collection, with PDR's rights taxonomy for it. */
export interface PdrSourceData {
  Title: string | null;
  Umbrella_Title: string[] | null;
  Rights_Summary: string | null;
  Rights_Details_Group: string | null;
  Rights_License_URL: string | null;
  Rights_Prose: string | null;
}

/** `result.data.collection.data` from a collection's detail page — Airtable-style field names,
 *  kept as-is so the cache on disk and the fixture are the same shape as the wire. */
export interface PdrCollection {
  Title: string;
  Slug: string;
  Excerpt: string | null;
  Preamble: string | null;
  Featured_Image_Path: string | null;
  Medium: string | null;
  Theme: string[] | null;
  Style: string[] | null;
  Epoch: string[] | null;
  Sources: { data: PdrSourceData }[] | null;
  Rights_Profiles: { data: { Group: string; Label: string } }[] | null;
  Tags: { data: { Label: string } }[] | null;
  Published_Date: string | null;
}

/** `result.data.essay.data` from an essay's detail page. */
export interface PdrEssay {
  Title: string;
  Slug: string;
  Intro: string | null;
  Body: string | null;
  /** "CC-BY-SA" | "Custom License" | null — the only value that opens the text is the first. */
  Publication_Rights: string | null;
  License_Note: string | null;
  Featured_Image_Path: string | null;
  Categories: string[] | null;
  Series: string | null;
  Tags: { data: { Label: string } }[] | null;
  Contributors: { data: { Name: string | null; Slug: string | null } }[] | null;
  Published_Date: string | null;
}

/**
 * What walk() returns and the cache stores: the record plus the image host it resolves against,
 * so toItem() is a pure projection with nothing left to look up. A DISCRIMINATED UNION: `kind`
 * is the tag, and narrowing on it (`if (raw.kind === "essay") raw.essay…`) is how TypeScript lets
 * one adapter carry two record shapes without casts.
 */
export type PdrRaw =
  | { kind: "collection"; imageHost: string; collection: PdrCollection }
  | { kind: "essay"; imageHost: string; essay: PdrEssay };

/** The walk's phases, in order. Each is one listing page whose rows carry a Slug, and the kind
 *  of detail page those slugs hydrate from. The essays listing does not include the two series,
 *  so they are phases of their own. */
const PHASES = [
  { key: "c", kind: "collection", url: "/page-data/collections/page-data.json", list: "collections" },
  { key: "e", kind: "essay", url: "/page-data/essays/page-data.json", list: "allAirtable" },
  { key: "x", kind: "essay", url: "/page-data/series/conjectures/page-data.json", list: "essays" },
  { key: "k", kind: "essay", url: "/page-data/series/curators-choice/page-data.json", list: "essays" },
] as const;

type PdrIndexPage = {
  result: { data: Record<string, { edges: { node: { data: { Slug: string } } }[] }> };
};

interface PdrDetailPage {
  result: {
    data: {
      site: { siteMetadata: { imageHost: string | null } };
      collection?: { data: PdrCollection };
      essay?: { data: PdrEssay };
    };
  };
}

// ── pure helpers (the unit-test surface) ─────────────────────────────────────────────────────

/**
 * Pure: PDR's text as one line of plain text. PDR writes a house dialect — Markdown emphasis and
 * links, `{image … endimage}` embed tokens, footnote markers — *and* inline HTML, sometimes in the
 * same sentence. The Markdown goes first (a link's text survives, its URL does not; an emphasis
 * pair drops its stars), then htmlToText() does what it does for every adapter: tags out,
 * entities decoded, whitespace collapsed. Order matters: htmlToText would leave the stars.
 */
export function plainText(s: string): string {
  return htmlToText(
    s
      .replace(/\{image[\s\S]*?endimage\}/g, " ")
      .replace(/\[\^[^\]]+\]/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // `*x*` or `**x**` → `x`. The backreference (\1) makes the closing marker match the opening
      // one, so a lone asterisk in prose is left alone.
      .replace(/(\*{1,2})(\S(?:[^*\n]*?\S)?)\1/g, "$2"),
  );
}

/**
 * Pure: a body (Preamble or essay) as plain paragraphs separated by blank lines — the shape
 * src/lib/reader-blocks.ts already typesets. Three moves, in this order:
 *   1. block-level HTML (`<p>`, `<blockquote>`, `<br>`) becomes a paragraph break, so a quotation
 *      stands on its own and a `<p>` glued to a heading line is pried off it;
 *   2. a Markdown `## Heading` becomes the reader parser's `== Heading ==` (deeper levels `===`),
 *      which is the only heading form the app stores;
 *   3. every paragraph goes through plainText() — which also removes the image blocks, since
 *      their captions describe pictures the reader view cannot show.
 * Returns "" for an empty body, so callers can store null without a special case.
 */
export function bodyText(markup: string): string {
  return markup
    .replace(/\{image[\s\S]*?endimage\}/g, "\n\n")
    .replace(/<\/?blockquote\b[^>]*>|<\/?p\b[^>]*>|<br\s*\/?>|<\/br>/gi, "\n\n")
    .split(/\n\s*\n/)
    .map((p) => {
      const heading = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/.exec(p);
      if (heading) {
        const [, hashes = "", text = ""] = heading;
        const marks = hashes.length <= 2 ? "==" : "===";
        return `${marks} ${plainText(text)} ${marks}`;
      }
      return plainText(p);
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Pure: the first paragraph of a Preamble that is at least `min` plain characters, cut to a lede.
 * "Happy Thanksgiving!" is a real first paragraph on one collection; the second one is the blurb.
 */
export function leadParagraph(
  preamble: string,
  min = EXCERPT_MIN,
): string | undefined {
  const paragraph = bodyText(preamble)
    .split("\n\n")
    .find((p) => !p.startsWith("==") && p.length >= min);
  return paragraph ? toLede(paragraph, LEAD_MAX) : undefined;
}

/**
 * Pure: the rights policy for collections. The underlying work is public domain on every PDR
 * collection (that is the site's premise, and its Rights_Profiles say so per collection); what
 * varies is the DIGITAL COPY, which an institution may mark Non-commercial. Ambit's bar is public
 * domain or openly licensed, so those are excluded. "Unclear" (an aggregator that does not mark
 * its copies) and a null summary are kept — PDR has already judged the work PD, and that is the
 * judgment Ambit is borrowing.
 */
export function passesRightsPolicy(c: PdrCollection): boolean {
  return !(c.Sources ?? []).some(
    (s) =>
      s.data.Rights_Summary === "Non-commercial" ||
      s.data.Rights_Details_Group === "Non-Commercial",
  );
}

/** Pure: the holding institution(s) — the umbrella name where PDR records one ("Library of
 *  Congress" over "Library of Congress (Prints+Photos+Maps)"), deduped, ` · `-joined — or PDR's
 *  own name when a collection lists no source, in which case the credit line already says it
 *  and image-item-body.tsx suppresses the duplicate maker line. */
export function collectionAttribution(c: PdrCollection): string {
  const names = uniqueTags(
    (c.Sources ?? []).map((s) => s.data.Umbrella_Title?.[0] ?? s.data.Title),
  );
  return names.length ? names.join(" · ") : PDR.label;
}

/** Pure: one honest string for two regimes — the work's PD profile (PDR's own label for it:
 *  "PD Worldwide", "PD U.S.", "PD GOV", "PD 70 Years") and PDR's CC BY-SA 4.0 grant on the text. */
export function collectionLicense(c: PdrCollection): string {
  const underlying = (c.Rights_Profiles ?? [])
    .map((p) => p.data)
    .find((p) => p.Group === "Underlying Work")?.Label;
  const work = underlying ? `Public domain — ${underlying}` : "Public domain";
  return `${work} · text CC BY-SA 4.0 (${PDR.label})`;
}

/** Pure: is this essay's text ours to store? Only an explicit CC-BY-SA label says yes; "Custom
 *  License" (book excerpts, reprints — PDR's reusing-material page) and a missing label both
 *  mean a link card. */
export function essayIsOpen(e: PdrEssay): boolean {
  return e.Publication_Rights === "CC-BY-SA";
}

/** Pure: the essay's author(s), as PDR names them, or PDR itself when none is recorded. */
export function essayAttribution(e: PdrEssay): string {
  const names = uniqueTags((e.Contributors ?? []).map((c) => c.data.Name));
  return names.length ? names.join(", ") : PDR.label;
}

/**
 * Pure: the image URL. `new URL(path, base)` is the encoder: it percent-encodes what a URL
 * cannot carry (spaces) and leaves alone what it can (apostrophes, and escapes that are already
 * there — 21 of PDR's 1,253 collection paths arrive pre-encoded, and encodeURI would double
 * them). All three shapes were fetched from the CDN on 09-02-26 and returned image/jpeg.
 */
export function imageUrlFor(host: string, p: string | null): string | null {
  return p ? new URL(p, host).href : null;
}

/** Pure: a cursor is `<phase key>:<offset into that phase's index>`; absent means the start. */
export function parseCursor(cursor?: string): { phase: number; offset: number } {
  if (cursor === undefined) return { phase: 0, offset: 0 };
  const m = /^([a-z]):(\d+)$/.exec(cursor);
  const phase = m ? PHASES.findIndex((p) => p.key === m[1]) : -1;
  const offset = m ? Number(m[2]) : NaN;
  if (phase < 0 || !Number.isInteger(offset) || offset < 0) {
    throw new Error(`pdr: bad cursor "${cursor}"`);
  }
  return { phase, offset };
}

/** Pure: the cursor after a page that started at `offset` in `phase` and took `taken` of its
 *  `total` rows: the next offset while the phase has more; the next phase's start when it is
 *  spent (an empty index moves on the same way); undefined after the last phase. */
export function nextCursor(
  phase: number,
  offset: number,
  taken: number,
  total: number,
): string | undefined {
  const next = offset + taken;
  if (taken > 0 && next < total) return `${PHASES[phase]!.key}:${next}`;
  const following = PHASES[phase + 1];
  return following ? `${following.key}:0` : undefined;
}
```

- [ ] **Step 5: Run the helper tests**

Run: `bunx vitest run src/server/services/sources/pdr.test.ts -t "plainText|bodyText|leadParagraph|rights|imageUrlFor|cursors"`
Expected: those describe blocks PASS; the `record cache` and `pdr.toItem` blocks still fail on missing exports. If a `bodyText`/`plainText` expectation disagrees with the fixture text by a character (a curly quote), the fixture is the truth — fix the test string, not the helper, unless the helper is leaving markup behind.

- [ ] **Step 6: Gates and commit** (typecheck is expected to pass here — nothing yet says `source: "pdr"`)

Run: `bun run typecheck && bunx eslint src/server/services/sources/pdr.ts src/server/services/sources/pdr.test.ts && bunx prettier --write src/server/services/sources/pdr.ts src/server/services/sources/pdr.test.ts`
Expected: clean (Prettier re-wraps long lines; fine).

```bash
git status --short   # pdr.ts, pdr.test.ts, __fixtures__/pdr.json — and NOT scripts/record-pdr-fixture.ts
git add src/server/services/sources/pdr.ts src/server/services/sources/pdr.test.ts src/server/services/sources/__fixtures__/pdr.json
git commit -m "feat(sources): pdr fixture and pure helpers — text, body, rights, license, cursors"
```

---

### Task 3: The cache, the phased `walk()` and `toItem()`

**Files:**
- Modify: `src/server/services/sources/pdr.ts` (append)

**Interfaces:**
- Consumes: everything Task 2 exported.
- Produces: `cachePath(dir, kind, slug)`, `readCached(dir, kind, slug): Promise<PdrRaw | null>`, `writeCached(dir, kind, slug, raw): Promise<void>`, `export const pdr: CorpusWalkAdapter<PdrRaw>` (`source: "pdr"`).

- [ ] **Step 1: Run the remaining tests, watch them fail**

Run: `bunx vitest run src/server/services/sources/pdr.test.ts -t "cache|toItem"`
Expected: FAIL — `cachePath is not a function` / `pdr` undefined.

- [ ] **Step 2: Append to `pdr.ts`**

```ts
// ── the disk cache (cache-aside: look, miss, fetch, write, return) ───────────────────────────

/**
 * Where a record's hydrated copy lives. **The slug is the whole key, and this is the boundary**:
 * it comes off the wire, so it is checked before it can become a path. PDR's slugs are names
 * (one carries an en-dash), not paths — anything with a separator, or a bare `.`/`..`, is refused
 * rather than joined. Same rule as image-cache.ts, for the same reason. Kinds get their own
 * subdirectory so a collection and an essay with the same slug never share a file.
 */
export function cachePath(dir: string, kind: PdrKind, slug: string): string {
  if (!slug || slug === "." || slug === ".." || /[/\\\0]/.test(slug)) {
    throw new Error(`pdr: unsafe slug "${slug}"`);
  }
  return path.join(dir, kind, `${slug}.json`);
}

/** The cached record, or null on absence — and on a torn or unparseable file, which is a miss
 *  worth one refetch rather than a crash worth a night. */
export async function readCached(
  dir: string,
  kind: PdrKind,
  slug: string,
): Promise<PdrRaw | null> {
  try {
    return JSON.parse(
      await readFile(cachePath(dir, kind, slug), "utf8"),
    ) as PdrRaw;
  } catch {
    return null;
  }
}

export async function writeCached(
  dir: string,
  kind: PdrKind,
  slug: string,
  raw: PdrRaw,
): Promise<void> {
  const file = cachePath(dir, kind, slug);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(raw));
}

// ── the walk ─────────────────────────────────────────────────────────────────────────────────

/** Each phase's slugs, fetched the first time the walk reaches the phase and paged from memory
 *  for the rest of it. Cleared at the start of every walk so a new walk sees new pieces. */
const indexes = new Map<string, string[]>();

async function loadIndex(phase: (typeof PHASES)[number]): Promise<string[]> {
  const page = (await fetchJson(`${PDR.baseUrl}${phase.url}`, {
    delayMs: DELAY_MS,
    noRetryOn: [401, 403],
  })) as PdrIndexPage;
  const edges = page.result.data[phase.list]?.edges ?? [];
  return edges.map((e) => e.node.data.Slug);
}

/** One record — from disk if it has ever been fetched, else from the site (and then to disk).
 *  The slug is encoded for the URL because one of them is not ASCII. */
async function hydrate(
  kind: PdrKind,
  slug: string,
  dir = PDR_CACHE_DIR,
): Promise<PdrRaw> {
  const cached = await readCached(dir, kind, slug);
  if (cached) return cached;
  const page = (await fetchJson(
    `${PDR.baseUrl}/page-data/${kind}/${encodeURIComponent(slug)}/page-data.json`,
    { delayMs: DELAY_MS, noRetryOn: [401, 403] },
  )) as PdrDetailPage;
  const imageHost = page.result.data.site.siteMetadata.imageHost ?? PDR.imageHost;
  const record = kind === "collection" ? page.result.data.collection : page.result.data.essay;
  if (!record) throw new Error(`pdr: ${kind}/${slug} has no record in its page-data`);
  const raw: PdrRaw =
    kind === "collection"
      ? { kind, imageHost, collection: record.data as PdrCollection }
      : { kind, imageHost, essay: record.data as PdrEssay };
  await writeCached(dir, kind, slug, raw);
  return raw;
}

async function walk(
  cursor?: string,
  opts?: FetchOpts,
): Promise<WalkPage<PdrRaw>> {
  const { phase, offset } = parseCursor(cursor);
  const current = PHASES[phase]!;
  // The very start of a walk: check the policy file, and forget the indexes a previous walk in
  // this process left behind.
  if (phase === 0 && offset === 0) {
    await assertCrawlAllowed(PDR.baseUrl);
    indexes.clear();
  }
  // "Load it if we haven't": a Map has no `??=`, so this is the two-line spelling of the same idea.
  let slugs = indexes.get(current.key);
  if (!slugs) {
    slugs = await loadIndex(current);
    indexes.set(current.key, slugs);
  }

  // `limit` bounds this page's size so `--quota N` hydrates N records, not fifty.
  const size = Math.max(1, Math.min(PAGE_SIZE, opts?.limit ?? PAGE_SIZE));
  const slice = slugs.slice(offset, offset + size);

  const raw: PdrRaw[] = [];
  let excluded = 0;
  for (const slug of slice) {
    const record = await hydrate(current.kind, slug);
    if (record.kind === "collection" && !passesRightsPolicy(record.collection)) {
      excluded++;
      continue;
    }
    raw.push(record);
  }
  if (excluded > 0) {
    console.warn(
      `  pdr: ${excluded} collection(s) excluded on rights (a source marks the digital copy Non-commercial)`,
    );
  }
  return { raw, next: nextCursor(phase, offset, slice.length, slugs.length) };
}

// ── the projections ──────────────────────────────────────────────────────────────────────────

function collectionToItem(imageHost: string, c: PdrCollection): NormalizedItem {
  const imageUrl = imageUrlFor(imageHost, c.Featured_Image_Path);
  if (!imageUrl) {
    // Thrown, not null: ingest counts a toItem failure per item and prints it. Two collections
    // in 1,255 (an audio piece and a film) have no featured image, and a silent skip would hide
    // the count.
    throw new Error(`pdr: collection "${c.Slug}" has no featured image`);
  }
  // PDR's own one-sentence Excerpt is the blurb. When it is empty (12% of the sample) or would
  // floor as thin (another 15%), the Preamble's first substantial paragraph stands in — PDR's own
  // text under the same CC BY-SA grant, never a synthesis. If neither reaches the floor, the item
  // floors like any museum stub.
  const excerpt = plainText(c.Excerpt ?? "");
  const summary =
    excerpt.length >= EXCERPT_MIN
      ? excerpt
      : (leadParagraph(c.Preamble ?? "") ?? excerpt);
  return {
    source: "pdr",
    // `collection/<slug>`: one source, two kinds, no collision. (source, sourceId) is the
    // idempotency key, so this choice is permanent for the corpus.
    sourceId: `collection/${c.Slug}`,
    // An IMAGE item that also carries text: the gallery and wander rail keep it, and the item
    // page renders the body under the picture (image-item-body.tsx).
    type: "image",
    title: plainText(c.Title),
    summary,
    body: bodyText(c.Preamble ?? "") || null,
    imageUrl,
    sourceUrl: `${PDR.baseUrl}/collection/${encodeURIComponent(c.Slug)}/`,
    attribution: collectionAttribution(c),
    license: collectionLicense(c),
    // Medium and the three taxonomies first (they tell the curator what a poster is *of* — a
    // film, a book), then the collection's own tags. uniqueTags trims and dedupes.
    tags: uniqueTags(
      [
        c.Medium,
        ...(c.Theme ?? []),
        ...(c.Style ?? []),
        ...(c.Epoch ?? []),
        ...(c.Tags ?? []).map((t) => t.data.Label),
      ].map((t) => t?.toLowerCase()),
    ),
  };
}

function essayToItem(imageHost: string, e: PdrEssay): NormalizedItem {
  const imageUrl = imageUrlFor(imageHost, e.Featured_Image_Path);
  if (!imageUrl) throw new Error(`pdr: essay "${e.Slug}" has no featured image`);
  const open = essayIsOpen(e);
  return {
    source: "pdr",
    sourceId: `essay/${e.Slug}`,
    // Open text reads in the reader view; anything else is a link card in the blog posture.
    type: open ? "article" : "image",
    title: plainText(e.Title),
    // The Intro is PDR's own teaser — 135–590 chars, never empty in the sampled index.
    summary: plainText(e.Intro ?? ""),
    body: open ? bodyText(e.Body ?? "") || null : null,
    imageUrl,
    sourceUrl: `${PDR.baseUrl}/essay/${encodeURIComponent(e.Slug)}/`,
    attribution: essayAttribution(e),
    license: open ? PDR_ESSAY_LICENSE : PDR_CARD_LICENSE,
    tags: uniqueTags(
      [
        e.Series,
        ...(e.Categories ?? []),
        ...(e.Tags ?? []).map((t) => t.data.Label),
      ].map((t) => t?.toLowerCase()),
    ),
  };
}

function toItem(raw: PdrRaw): NormalizedItem {
  // Narrowing on the discriminant: inside each branch TypeScript knows which record is present.
  return raw.kind === "collection"
    ? collectionToItem(raw.imageHost, raw.collection)
    : essayToItem(raw.imageHost, raw.essay);
}

export const pdr: CorpusWalkAdapter<PdrRaw> = { source: "pdr", walk, toItem };
```

- [ ] **Step 3: Run the whole test file**

Run: `bunx vitest run src/server/services/sources/pdr.test.ts`
Expected: PASS, every block. Things that can legitimately differ from the plan and how to settle them: (a) the `marnameh` title's quotes — match the fixture byte for byte; (b) the `warburgs` body's first three paragraphs depend on the `<br/>` inside the `<p>` being a break — if the fixture shows `<br />` (with a space) the regex already covers it; (c) `sharing-photographs`'s series tag is `curator’s choice` with a curly apostrophe — copy it from the fixture; (d) **the safety test's `&[#a-z0-9]+;` clause fails on an entity `decodeEntities()` does not know** (it decodes a fixed list — `normalize.ts` explains why). If a fixture body carries, say, `&eacute;`, extend `decodeEntities` test-first in `normalize.test.ts` — that is exactly how `&rsquo;` got there — rather than weakening this test; (e) if `stories-of-a-hollow-earth`'s blockquote is not inside the fixture's first eight chunks, raise the recorder's `cut(e.Body, 8)` and re-record.

- [ ] **Step 4: Gates (no typecheck yet — Task 1's note)**

Run: `bunx eslint src/server/services/sources/pdr.ts src/server/services/sources/pdr.test.ts && bunx prettier --write src/server/services/sources/pdr.ts src/server/services/sources/pdr.test.ts && bunx prettier --check src/server/services/sources/pdr.ts src/server/services/sources/pdr.test.ts`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/services/sources/pdr.ts src/server/services/sources/pdr.test.ts
git commit -m "feat(sources): pdr walker — phased walk over Gatsby page-data, cache-aside hydration, two projections"
```

---

### Task 4: Register the walker and rescope the walk-source invariant to blogs

**Files:**
- Modify: `src/server/services/sources/types.ts` (`SourceId`), `src/server/config/topics.ts` (`WALK_SOURCES`), `src/server/services/sources/index.ts` (`walkers`), `src/server/services/sources/source-invariants.test.ts`, `src/server/config/blogs.test.ts`

- [ ] **Step 0: Add the `SourceId` member** — in `src/server/services/sources/types.ts`, at the end of the `SourceId` union (after whatever the last member is — another session may have added `"streetartnews"` and `"spoon-tamago"`):

```ts
  // The Public Domain Review (docs/PLAN_publicdomainreview.md): a walk source over Gatsby
  // page-data JSON, and the first walk source that is NOT a designated blog — its images are
  // public domain and its text is CC BY-SA 4.0 (config/pdr.ts). Also the first walk source whose
  // rows may carry a `body`.
  | "pdr";
```

- [ ] **Step 1: Write the failing registry test change** — in `src/server/config/blogs.test.ts`, add the import and replace the first `it(...)`:

```ts
import { PDR } from "./pdr";
```

```ts
  // Every blog is a walk source, and every walk source is a blog — except the one publication
  // that walks without being a blog (config/pdr.ts says why). Named here so a second non-blog
  // walker is a deliberate edit to this list, not a silent hole in the registry.
  it("lists every walk source that is not the Public Domain Review", () => {
    expect([...BLOGS.map((b) => b.id), PDR.id].sort()).toEqual(
      [...WALK_SOURCES].sort(),
    );
  });
```

Run: `bunx vitest run src/server/config/blogs.test.ts`
Expected: FAIL — the arrays differ by `pdr`.

- [ ] **Step 2: `WALK_SOURCES`** — in `src/server/config/topics.ts`, add `"pdr"` as the last member and extend the doc comment's last sentence:

```ts
 *  SEED_SOURCES and SeedQueries. Blogs live here; loupe will too. `pdr` (09-02-26) is the first
 *  walk source that is not a blog — see config/pdr.ts. */
```

- [ ] **Step 3: `walkers`** — in `src/server/services/sources/index.ts`, add the import (keep the imports alphabetical — `./pdr` sorts after `./nasa-images`) and the entry:

```ts
import { pdr } from "./pdr";
```

```ts
export const walkers: Record<WalkSourceId, CorpusWalkAdapter<unknown>> = {
  // …the existing entries, whatever the other session left here…
  pdr,
};
```

- [ ] **Step 4: Rescope `source-invariants.test.ts`** — the file's whole premise is 6.3's D5, which is about *blogs*; until now every walker was one. Change the header comment's first sentence and both halves:

Header (replace the first paragraph):

```ts
// D5, as something CI refuses (docs/PHASE6_DESIGN_6.3.md §7): a BLOG item is an image item with
// NO body, always — which is what makes "Ambit never renders blog article text" an invariant
// rather than a policy. Two halves: every designated blog's walker normalizes that way, and no
// blog row in the DB says otherwise. Walk sources that are not blogs (`pdr`, whose text is
// CC BY-SA and whose collections carry their body essay by design) are outside D5 and are
// deliberately not iterated here — their contract is their own adapter test.
```

Imports: add `import { BLOGS, isBlogSource } from "~/server/config/blogs";` and `import pdrFixtures from "./__fixtures__/pdr.json";`; drop the `WALK_SOURCES` import if nothing else uses it.

Fixture map: add `pdr: pdrFixtures,`.

Unit half — keep the "every registered walker has a fixture here" test as is; change the second test to skip non-blogs:

```ts
  it("every blog walker normalizes to type image with body null", () => {
    for (const [id, walker] of Object.entries(walkers)) {
      if (!isBlogSource(id)) continue;
      for (const raw of fixturesByWalker[id] ?? []) {
        let item;
        try {
          item = walker.toItem(raw);
        } catch {
          continue; // a fixture row that toItem rejects (no featured image) is not an item
        }
        expect(item.type, id).toBe("image");
        expect(item.body, id).toBeNull();
      }
    }
  });
```

Integration half — the `where` becomes:

```ts
        .where(
          and(
            inArray(item.source, BLOGS.map((b) => b.id)),
            isNotNull(item.body),
          ),
        )
```

(The HTML-tag test underneath is unchanged and now also covers PDR bodies — which is the point.)

- [ ] **Step 5: Run the touched test files, then typecheck and the full suite**

Run: `bunx vitest run src/server/config/blogs.test.ts src/server/config/topics.test.ts src/server/services/sources/source-invariants.test.ts src/server/services/sources/pdr.test.ts`
Expected: PASS.

Run: `bun run typecheck && bunx eslint src/server/services/sources/types.ts src/server/config/topics.ts src/server/services/sources/index.ts src/server/services/sources/source-invariants.test.ts src/server/config/blogs.test.ts && bunx prettier --check src/server/services/sources/types.ts src/server/config/topics.ts src/server/services/sources/index.ts src/server/services/sources/source-invariants.test.ts src/server/config/blogs.test.ts`
Expected: clean — this is the first point since Task 2 where `bun run typecheck` is expected to pass, and it must.

Run: `bun run test`
Expected: all green (~35 s). A red Postgres-backed test → check `ps` for another `bun run test` or dev server first (CLAUDE.md).

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/server/services/sources/types.ts src/server/config/topics.ts src/server/services/sources/index.ts src/server/services/sources/source-invariants.test.ts src/server/config/blogs.test.ts
git commit -m "feat(sources): register pdr as a walk source; body-null invariant rescoped to blogs"
```

---

### Task 5: The item page renders body text under an image, with the reuse notice

**Files:**
- Create: `src/components/item/reader-blocks.tsx`, `src/components/item/reuse-notice.tsx`
- Modify: `src/components/item/reader-item-body.tsx`, `src/components/item/image-item-body.tsx`, `src/components/item/link-out-row.tsx`
- Modify: `src/components/item/item-sections.test.tsx`, `src/components/item/link-out-row.test.tsx`
- Modify: `SPEC.md` §5.1 (the `body` row)

**Interfaces:**
- Produces: `ReaderBlocks({ body: string })` — the typeset block list; `ReuseNotice({ item: Item })` — null unless `item.source === PDR.id && item.body`.

- [ ] **Step 1: Write the failing rendering tests** — append to `src/components/item/item-sections.test.tsx` (inside the file, as new `describe` blocks; `makeItem` and the mocks at the top are reused):

```ts
describe("ImageItemBody with a stored body (Public Domain Review collections)", () => {
  it("typesets the body under the blurb and introduces it with the CC BY-SA notice", () => {
    render(
      <ImageItemBody
        item={makeItem({
          source: "pdr",
          type: "image",
          title: "Photographs of Atlantic City Sand Sculpture",
          summary: "Photographs from when Atlantic City beaches featured sand sculptors.",
          body: "New Jersey’s Atlantic City emerged as a seaside destination.\n\nTheir medium was ephemeral.",
          imageUrl: "https://pdr-assets.b-cdn.net/collections/x/thumb.jpg",
          sourceUrl: "https://publicdomainreview.org/collection/atlantic-city-sand-sculpture/",
        })}
      />,
    );
    expect(
      screen.getByText("New Jersey’s Atlantic City emerged as a seaside destination."),
    ).toBeInTheDocument();
    expect(screen.getByText("Their medium was ephemeral.")).toBeInTheDocument();
    const notice = screen.getByText(/Text originally published on/);
    expect(notice).toHaveTextContent(/under CC BY-SA 4\.0/);
    // Two links carry the publication's name: the credit line's and the notice's. Both point at
    // the piece, which is the assertion — not which one comes first.
    const links = screen.getAllByRole("link", { name: "The Public Domain Review" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute(
        "href",
        "https://publicdomainreview.org/collection/atlantic-city-sand-sculpture/",
      );
    }
  });

  it("renders neither text nor notice when the item has no body — every museum object, every blog card", () => {
    render(
      <ImageItemBody
        item={makeItem({
          source: "met",
          type: "image",
          body: null,
          imageUrl: "https://images.metmuseum.org/x.jpg",
        })}
      />,
    );
    expect(screen.queryByText(/Text originally published on/)).not.toBeInTheDocument();
  });
});

describe("ReaderItemBody for a Public Domain Review essay", () => {
  it("introduces the essay with the CC BY-SA notice", () => {
    render(
      <ReaderItemBody
        item={makeItem({
          source: "pdr",
          type: "article",
          title: "Stories of a Hollow Earth",
          summary: "In 1741 Ludvig Holberg published a satirical novel.",
          body: "In 1818 John Cleves Symmes issued his circular.",
          sourceUrl: "https://publicdomainreview.org/essay/stories-of-a-hollow-earth/",
        })}
      />,
    );
    expect(screen.getByText(/Text originally published on/)).toBeInTheDocument();
    expect(screen.getByText("In 1818 John Cleves Symmes issued his circular.")).toBeInTheDocument();
  });

  it("shows no notice on a Wikipedia article", () => {
    render(<ReaderItemBody item={makeItem({ body: "Found in 1846." })} />);
    expect(screen.queryByText(/Text originally published on/)).not.toBeInTheDocument();
  });
});
```

And in `src/components/item/link-out-row.test.tsx`, a third case:

```ts
  it("renders the link-out for a Public Domain Review item with its own copy", () => {
    render(
      <LinkOutRow
        source="pdr"
        sourceUrl="https://publicdomainreview.org/collection/atlantic-city-sand-sculpture/"
      />,
    );
    expect(
      screen.getByRole("link", { name: /See it on The Public Domain Review/ }),
    ).toHaveAttribute(
      "href",
      "https://publicdomainreview.org/collection/atlantic-city-sand-sculpture/",
    );
  });
```

Run: `bunx vitest run src/components/item/item-sections.test.tsx src/components/item/link-out-row.test.tsx`
Expected: FAIL — the notice text is not found; the pdr link-out renders nothing.

- [ ] **Step 2: Create `src/components/item/reader-blocks.tsx`** — the block list lifted out of `reader-item-body.tsx` unchanged:

```tsx
import { parseReaderBlocks } from "~/lib/reader-blocks";

// The typeset block list a stored `body` becomes — headings, subheadings, paragraphs — shared by
// the reader variant (an article's whole read) and, since the Public Domain Review landed
// (09-02-26), by the image variant too: a PDR collection is a picture that also carries its own
// essay, and the same parser and the same type ramp serve both. Server-safe: no hooks, no
// handlers. See src/lib/reader-blocks.ts for what the parser accepts.
export interface ReaderBlocksProps {
  body: string;
}

export function ReaderBlocks({ body }: ReaderBlocksProps) {
  const blocks = parseReaderBlocks(body);
  return (
    <div>
      {blocks.map((block, index) => {
        // Index keys are safe here and only here: the block list is derived from an immutable
        // column, rendered once on the server, and never reordered or spliced.
        if (block.kind === "heading") {
          return (
            <h2
              key={index}
              className="text-ink-hi mt-[26px] mb-[10px] text-[19px] leading-[1.3] font-semibold"
            >
              {block.text}
            </h2>
          );
        }
        if (block.kind === "subheading") {
          return (
            <h3
              key={index}
              className="text-ink/72 mt-[26px] mb-[10px] text-[15px] font-semibold tracking-[0.4px]"
            >
              {block.text}
            </h3>
          );
        }
        return (
          <p key={index} className="text-ink/78 mb-4 text-[16px] leading-[1.72]">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/item/reuse-notice.tsx`**

```tsx
import { PDR } from "~/server/config/pdr";
import type { Item } from "~/server/db/items";

// The line PDR's reuse terms ask for when its CC BY-SA text is shown in full: name the original,
// name The Public Domain Review, link back (publicdomainreview.org/reusing-material). Rendered
// above the stored body on both item variants — an essay in the reader view, a collection's
// preamble under its picture. Keyed on DATA, not on type: a PDR item with a body is exactly the
// set of items that reproduce PDR's text, and a PDR link card (no body) correctly gets nothing.
// Server-safe: a plain paragraph and an anchor.
export interface ReuseNoticeProps {
  item: Item;
}

export function ReuseNotice({ item }: ReuseNoticeProps) {
  if (item.source !== PDR.id || !item.body) return null;
  return (
    <p className="text-ink/50 mt-[18px] text-[12.5px] leading-[1.5]">
      Text originally published on{" "}
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener"
        className="text-accent underline-offset-2 hover:underline"
      >
        {PDR.label}
      </a>{" "}
      under CC BY-SA 4.0.
    </p>
  );
}
```

- [ ] **Step 4: Wire the reader variant** — in `reader-item-body.tsx`: remove the `parseReaderBlocks` import and the `const blocks = …` line; add `import { ReaderBlocks } from "./reader-blocks";` and `import { ReuseNotice } from "./reuse-notice";`; replace the `<div className="mt-[20px]">{blocks.map(…)}</div>` element with:

```tsx
      <ReuseNotice item={item} />

      <div className="mt-[20px]">
        {item.body ? <ReaderBlocks body={item.body} /> : null}
      </div>
```

(The divider line above it stays; the notice sits between the lede and the divider's text.)

- [ ] **Step 5: Wire the image variant** — in `image-item-body.tsx`: add `import { ReaderBlocks } from "./reader-blocks";` and `import { ReuseNotice } from "./reuse-notice";`; between the summary `<p>` and `<LinkOutRow …/>` insert:

```tsx
      {/* An image item that also carries text — a Public Domain Review collection's own essay
          (docs/PLAN_publicdomainreview.md §1). Everything else has `body` null and renders exactly
          as before. The reader variant's parser and type ramp are reused so the two pages read as
          one app; the notice above it is what PDR's CC BY-SA terms ask for. */}
      {item.body ? (
        <>
          <ReuseNotice item={item} />
          <div className="bg-ink/10 mt-[14px] h-[0.5px] w-full" />
          <div className="mt-[20px]">
            <ReaderBlocks body={item.body} />
          </div>
        </>
      ) : null}
```

Also extend the file's header comment with one sentence after "then the least text that makes it legible — title, who made it, where it came from, and the summary.": *"Since 09-02-26 an image item may also carry a stored `body` — a Public Domain Review collection's own essay — which renders under the summary; see the block below."*

- [ ] **Step 6: Teach `LinkOutRow` about `pdr`** — in `link-out-row.tsx`, add `import { PDR } from "~/server/config/pdr";` and change the guard and the copy:

```tsx
export function LinkOutRow({ source, sourceUrl, className }: LinkOutRowProps) {
  // Blogs, and the one publication that earns the same prominent row without being a blog: a
  // PDR collection's page holds the full gallery, an essay card's page holds the essay.
  const isPdr = source === PDR.id;
  if (!isBlogSource(source) && !isPdr) return null;
  const copy = isPdr
    ? `See it on ${PDR.label}`
    : `Read the post on ${sourceLabel(source)}`;
```

and use `{copy}` in the `<span>` in place of `Read the post on {sourceLabel(source)}`. Add to the header comment: *"(09-02-26: also rendered for `pdr` — see the guard.)"*

- [ ] **Step 7: Run the tests, then the gates**

Run: `bunx vitest run src/components/item/`
Expected: PASS, including the pre-existing `ReaderItemBody` tests (the extraction changed no markup).

Run: `bun run typecheck && bunx eslint src/components/item/reader-blocks.tsx src/components/item/reuse-notice.tsx src/components/item/reader-item-body.tsx src/components/item/image-item-body.tsx src/components/item/link-out-row.tsx src/components/item/item-sections.test.tsx src/components/item/link-out-row.test.tsx && bunx prettier --write src/components/item/reader-blocks.tsx src/components/item/reuse-notice.tsx src/components/item/reader-item-body.tsx src/components/item/image-item-body.tsx src/components/item/link-out-row.tsx src/components/item/item-sections.test.tsx src/components/item/link-out-row.test.tsx`
Expected: clean.

- [ ] **Step 8: SPEC §5.1 `body` row** — replace the row's text with:

```
| `body` | **Settled 08-25-26 (6.3): `body` is `null` for every blog item, always.** The blurb is `summary` (the blog's own excerpt). Blog items are `type: "image"`, so the reader view is unreachable for them by construction; `source-invariants.test.ts` asserts it — both halves, iterating the designated blogs. **Widened 09-02-26 (PDR):** a walk source that is not a blog may carry a body — a Public Domain Review *collection* is an image item whose `body` is its own CC BY-SA preamble, rendered on the item page under the picture (`image-item-body.tsx` → `ReaderBlocks`, introduced by `ReuseNotice`); a CC BY-SA *essay* is an article. Full blog article text is still used at ingest only and never stored. |
```

- [ ] **Step 9: Regression eyeball** — `bun run dev` (clear port 3000 first, CLAUDE.md), open one existing article page (`/i/<a wikipedia id>`) and one image page (`/i/<a met id>`): both render exactly as before — no notice, no extra divider. No PDR rows exist yet; the PDR rendering itself is eyeballed on real rows in Task 7 after a Keep. The two component tests above are the check until then.

- [ ] **Step 10: Commit**

```bash
git status --short
git add src/components/item/reader-blocks.tsx src/components/item/reuse-notice.tsx src/components/item/reader-item-body.tsx src/components/item/image-item-body.tsx src/components/item/link-out-row.tsx src/components/item/item-sections.test.tsx src/components/item/link-out-row.test.tsx SPEC.md
git commit -m "feat(item): image items may carry a body — PDR collections read under the picture, with the CC BY-SA notice"
```

---

### Task 6: Live checks, the trial samples, and the evidence

> **Every expected output below assumes Cut 1** (merged `acd1437`; §1a). It is in `main`, so a
> branch cut from `main` has it — but run §1a's three-command check first, because if this branch
> somehow predates it, the numbers here will not match what you see and the fix is a rebase, not a
> re-probe of the site.

Everything here is polite and writes nothing to the DB. Lid open, power attached.

- [ ] **Step 1: A `--cursor` flag for `stats:walk`** — the walk runs collections first, so a `--quota 150` sample never reaches an essay. In `scripts/walk-stats.ts`: change `let cursor: string | undefined;` to `let cursor: string | undefined = flag("cursor");`, extend the usage lines to `bun run stats:walk <source> [--quota N] [--cursor C]`, and add a usage example `bun run stats:walk pdr --cursor e:0 --quota 60   # the essays phase on its own`. Cut 1 rewrote this file's counters (`refused` is now `unhomed`, and it prints an `un-homed tags:` line), so **locate the `let cursor` declaration and the usage block by name, not by line number** — your edit is in a different region and both are wanted. Run `bunx eslint scripts/walk-stats.ts && bunx prettier --check scripts/walk-stats.ts`, then commit:

```bash
git add scripts/walk-stats.ts && git commit -m "feat(scripts): stats:walk takes a --cursor start so a phased walker can be sampled per phase"
```

- [ ] **Step 2: Probe one page of each kind**

Run: `bun run probe:walk pdr --limit 5`
Expected: five collection lines, each `img:y`, `sum:` ≥ 60 on most, `tags:` 4–12, URLs under `/collection/`; `next cursor: c:5`; ~4 s. `ls .cache/pdr/collection | wc -l` → 5. Run it again: well under a second — the cache working.

Run: `bun run probe:walk pdr --limit 3 --cursor e:0` → three essay lines under `/essay/`, `next cursor: e:3`. Then `--cursor x:0 --limit 2` and `--cursor k:0 --limit 2` → two lines each. Then `--cursor k:27 --limit 5` → 2 raw and `next cursor: (end)`.

- [ ] **Step 3: Probe the non-ASCII slug and a Non-commercial collection**

```bash
bun -e 'const r=await (await fetch("https://publicdomainreview.org/page-data/collections/page-data.json",{headers:{"User-Agent":"Ambit/0.1"}})).json();const s=r.result.data.collections.edges.map(e=>e.node.data.Slug);console.log("lubki at", s.findIndex(x=>x.includes("lubki")), "fixed-stars at", s.indexOf("fixed-stars"))'
```

`bun run probe:walk pdr --limit 1 --cursor c:<lubki offset>` → one item whose title contains "Lubki"; `bun run probe:walk pdr --limit 1 --cursor c:<fixed-stars offset>` → `0 raw` plus the `excluded on rights` warning. Both prove the encoding and the policy live.

- [ ] **Step 4: Structural dry-run through ingest** (cheap, ~20 records)

Run: `bun run ingest --source pdr --dry-run --quota 20`
Expected: the walk lane runs, the floor breakdown prints, classify-mode curation of ~20 items, then the Cut 1 summary — a classification block ending in `(un-homed — stored)`, a `would store un-homed (walk): N` line with `top tags among them: …` beneath it, `memberships written: 0 (--dry-run)`, and `0` writes. **Nothing is dropped for topic fit** (§1a). This proves the adapter fits the ingest loop (the cursor round-trips through it opaquely). Note the un-homed count and its tags: over ~20 collections that is your first read on what PDR brings to the vocabulary.

- [ ] **Step 5: The trial samples** (bill cents; write nothing)

Run: `bun run stats:walk pdr --quota 150` — the newest 150 collections.
Run: `bun run stats:walk pdr --cursor e:0 --quota 60` — the newest 60 essays (expect ~6 link cards among them).
Run: `bun run stats:walk pdr --cursor x:0 --quota 50` — all 21 Conjectures then the first 29 of Curator's Choice (the phase rolls over).

**Paste all three stats blocks into the evidence below.** Note in particular: whether Film/Audio posters score like images; whether essays (articles, hero as bytes) score near the collections or near Wikipedia's 5.27; the **un-homed share per kind and which tags dominate the un-homed pile** — under Cut 1 that pile is stored and is this source's contribution to the vocabulary, not waste (§1a).

- [ ] **Step 6: Record the evidence**

In `docs/source-candidates.md`, the `**Public Domain Review**` row of the "Designated blogs" table: status cell → `🔵 **Adapter built + sampled 09-0X-26** (`pdr` on `feat/pdr-walk`; verdict pending)`; notes cell → the shape (Gatsby page-data walk over four indexes, 1,255 collections + 393 essays, cache-aside hydration, rights policy excluding Non-commercial copies, CC BY-SA essays as articles / others as cards, collections' preamble under the picture), the three stats blocks verbatim, one line noting the Blog is deliberately out, and — the trial loop's post-Cut-1 eyeball question — one line on **what the un-homed items are about**, taken from the three blocks' `un-homed tags:` lines.

In `docs/HANDOFF_publicdomainreview.md`, replace the status blockquote under the title with:

```markdown
> **Status 09-0X-26:** built to `docs/PLAN_publicdomainreview.md` on `feat/pdr-walk` — adapter
> `src/server/services/sources/pdr.ts`, sampled (numbers in `docs/source-candidates.md`'s row).
> Scope widened by Ben on 09-02-26: Essays and both series are IN; §6.1 is closed; §6.2 is
> answered by `ReuseNotice`; §6.3 by the plan's §0.4 rights table. Verdict pending.
```

In `CLAUDE.md`'s local-dev bullets, extend the `.cache/img` note with one sentence: *`.cache/pdr` (one JSON per Public Domain Review record) is the same kind of thing: safe to delete, but refilling it is a 1.7 GB polite walk, so don't.*

- [ ] **Step 7: Commit the evidence**

```bash
git status --short   # only the three docs
git add docs/source-candidates.md docs/HANDOFF_publicdomainreview.md CLAUDE.md
git commit -m "docs(sources): pdr adapter sampled — collections and essays, evidence recorded, verdict pending"
```

- [ ] **Step 8: STOP. Ben's verdict.** Report the three stats blocks, the excluded-on-rights count, the two no-image throws, the link-card share among essays, and anything odd in the top/bottom titles. Then the two Cut 1 additions (§1a):

  - **The un-homed share per kind, and the top tags among the un-homed.** Frame it as the source's vocabulary contribution, not a refusal rate — a high share is not an argument against PDR, and saying so is part of the report.
  - **The axis question.** Say whether `Medium` / `Epoch` terms (`film`, `book`, `18th century`) dominate the un-homed histogram over subject terms. Ambit's sixteen topics are a *subject* axis; growing the vocabulary along medium or period instead is a real choice, and it is Cut 2's to make deliberately rather than by histogram rank.

  Ask for Keep / Park / Cut. Do not merge, do not full-walk.

---

### Task 7: After the verdict

**Keep:**
- [ ] **Precondition (§1a) — the migration first, always.** This is the first step of the first PDR run against any database, local or production:

```bash
bun -e 'import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!);
console.log(await sql`select count(*)::int as memberships from item_topic`); await sql.end()'
```

  Expected: a count (the table exists). If it errors with `relation "item_topic" does not exist`, **stop** — PDR rows written before Cut 1's migration are backfilled `origin='seed'` when they are curator-classified, and that is a lie Cut 2's promotion audits. Run the migration, then continue. The same check belongs in the first *production* ingest of `pdr` after the next deploy.
- [ ] Full walk, detached, lid open: `nohup bun run ingest --source pdr > .cache/pdr-walk.log 2>&1 & disown`. Expect ~15 min of hydration (1.7 GB; silence between pages is normal — judge liveness by `netstat -anv -p tcp | grep bun:<pid>`), then curation of ~1,640 thumbs. **Every curated item is stored** under Cut 1, so expect the row count to be the curated count — not curated-minus-refused — with the un-homed among them counted and characterised in the summary. Then `bun run stats:walk pdr --quota 1700` is free and gives the corpus numbers per phase.
- [ ] **Eyeball three real rows** in `bun run dev`: a collection `/i/<id>` (picture, blurb, notice, paragraphs, "See it on The Public Domain Review" row; the hero still opens `/g/`), a CC BY-SA essay `/i/<id>` (reader view with the notice), a Custom License essay `/i/<id>` (card: picture, Intro, link-out, no text). Find ids with `psql`/`bun run probe:feed` or `select id, source_id, type from item where source='pdr' limit 20`.
- [ ] **Eyeball one un-homed row** (new under Cut 1): `select id, title, tags from item where source='pdr' and topic_id is null order by curation_score desc limit 5;` — open the best one at `/i/<id>`. It renders fully and is **absent from the feed**; that is Cut 1 working, not a bug. Put its title and tags in the log entry — a strong un-homed piece is the clearest evidence for what PDR adds to the vocabulary.
- [ ] `SPEC.md` §6.1: a `pdr` bullet in the walk-sources list, in the shape of the `thisiscolossal` bullet (what it is, the four indexes, the cache, the rights policy, the two projections, the item-page change, the sample and full-walk numbers, what is deliberately out: the Blog, footnotes, inline images).
- [ ] `docs/source-candidates.md` row → ✅ with the full-walk numbers; `CLAUDE.md` status paragraph gains one sentence naming `pdr` as kept (local rows only until the next deploy — the nightly cron walks it then, and its first server walk is the 1.7 GB one).
- [ ] `log.md`: a block in today's entry (**Shipped / Findings / Decisions / Open**) ending with the spend line from `python3 ~/.claude/scripts/session-spend.py --session <uuid>` — never estimated.
- [ ] `git checkout main && git merge --no-ff feat/pdr-walk -m "Merge branch 'feat/pdr-walk' — Keep: The Public Domain Review's collections and essays as a walk source"` — after `git status` shows main clean and no other session's edits.

**Park:** add `"pdr"` to `SUSPENDED_SOURCES` with a comment in the shape of mossandfog's (the sample numbers and Ben's reason); row → ⏸️; merge the same way (the item-page change is harmless with no PDR rows). **Cut:** revert the branch; row → ❌ with the reason; nothing merges.

---

## Verification (the done bar before the verdict)

- `bunx vitest run src/server/services/sources/pdr.test.ts src/components/item/` green; `bun run test` green; `bun run typecheck` green from Task 4 on.
- `bun run probe:walk pdr --limit 5` twice: the second run answers from disk. All four phases probed; the phase roll-over and the end-of-walk both seen.
- The rights exclusion and the non-ASCII slug proven live (Task 6 step 3).
- Three `stats:walk` blocks pasted into `docs/source-candidates.md`.
- Nothing written to the DB before the verdict; `git log --oneline main..feat/pdr-walk` shows seven commits.
- §1a's gate honoured: Tasks 6–7 ran only after Cut 1 merged and this branch was rebased onto it, and `item_topic` existed before any PDR row was written.
- The verdict report carries the un-homed share, the un-homed tag histogram, and the axis question.

## Self-review (done by the planner, 09-02-26)

- **Re-read against Cut 1 (09-02-26 afternoon, a second session).** Every file this plan touches
  was checked against `docs/PLAN_topic-vocabulary-cut1.md`'s file map: the overlap is
  `scripts/walk-stats.ts` alone, in disjoint regions. This plan does not edit `scripts/ingest.ts`,
  so the design's §12 "biggest planning risk" (both plans rewriting the walk lane) does not hold —
  recorded in §1a so nobody re-derives it. Tasks 1–5 needed no change; Tasks 6–7's expected outputs,
  the verdict question and one ordering precondition did. The `item_topic.origin` hazard in §1a was
  found by reading Cut 1's Q1 (the frozen source list in the migration SQL) against Task 7's full
  walk; it is the only correctness issue the re-read turned up.

- **Spec coverage:** handoff §1 decisions → Task 2 header, `passesRightsPolicy`, no medium filter; Ben's afternoon decisions → collections carry `body` + Task 5's image variant; essays in with both series → `PHASES` and `essayToItem`; Custom License → `essayIsOpen` + `PDR_CARD_LICENSE`; Blog out → not a phase, recorded in the row. Handoff §5's index-then-hydrate → Task 3; §6.2 → `ReuseNotice`; §6.3 → §0.4 + policy; §6.4 → `DELAY_MS`; §6.5 → Tasks 1 and 4; §7 recipe → Task 6.
- **Placeholders:** none — every code step is complete, every expected value comes from the live samples.
- **Type consistency:** `PdrRaw`/`PdrCollection`/`PdrEssay`, `cachePath/readCached/writeCached(dir, kind, slug)`, `parseCursor`/`nextCursor(phase, offset, taken, total)`, `imageUrlFor(host, path)`, `collectionAttribution`/`collectionLicense`/`essayIsOpen`/`essayAttribution`, `ReaderBlocks({ body })`, `ReuseNotice({ item })` are named identically across Tasks 2–5 and the tests.
