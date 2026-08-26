# Phase 6.3 — blog source adapters: design-session handoff

**Written 08-25-26, mid-session, to hand off to another model.** Self-contained: assume the
reader has none of the prior conversation. Nothing has been implemented; no files changed.

---

## 1. What this is

`docs/BUILD_PLAN.md` step **6.3 — Blog source adapters** is gated on a design session
("⚖️ design session first — decided 08-20-26, undesigned") with **seven open questions** that must
be settled before any code. This session is that design session. It is being run under the
`superpowers:brainstorming` skill on the **architectural path**.

**Where the session stopped:** four of the seven questions are answered by Ben (§4 below). The
fifth was asked and Ben declined it to clarify something first — what he wanted to clarify is
unknown, so **re-open §5's question by asking him that first.**

### Process state (brainstorming skill, architectural path)

| Step | State |
|---|---|
| 1. Explore project context | ✅ done — §3 |
| 2. Offer visual companion | not offered; no visual question has arisen. Offer only if one does, as its own message |
| 3. Clarifying questions, one at a time | 🔶 in progress — 4 answered, ≥3 remain |
| 4. Propose 2–3 approaches w/ trade-offs | not started |
| 5. Present design in sections, approval after each | not started |
| 6. Write spec → `docs/superpowers/specs/2026-08-25-blog-source-adapters-design.md`, commit | not started |
| 7. Spec self-review (placeholders / contradictions / scope / ambiguity) | not started |
| 8. User reviews written spec | not started |
| 9. Invoke `writing-plans` skill — **the only skill to invoke next** | not started |

**HARD GATE, from the skill:** do not write code, scaffold, or invoke any implementation skill
until Ben has approved the design. Ask questions **one at a time**; prefer multiple choice
(`AskUserQuestion`). The repo's own convention is that a plan doc is *cold-executable* — Ben
executes plans in a separate, cheaper-model session.

**Session constraints in effect:** do not use the Agent tool, workflows, or deep-research unless
Ben asks. Ambit must own port 3000 (`lsof -ti:3000`).

---

## 2. Repo state

`main` @ `07f66ec`, clean, pushed to `origin`. **Phases 0–5 complete**, 6.1 and 6.2 complete.
6.3 is the next unstarted step; the alternative next step is Phase 7 (hardening/e2e/perf).

---

## 3. Context gathered (verified this session — file paths and real numbers)

### 3.1 The adapter contract — `src/server/services/sources/types.ts`

```ts
export type SourceId = "wikipedia" | "met" | "aic" | "cma" | "wellcome" | "archive"
                     | "smithsonian" | "loc" | "nasa-images" | "poetrydb";

export interface NormalizedItem {
  source: SourceId; sourceId: string;
  type: "image" | "article";
  title: string; summary: string;      // summary is ALWAYS a real string — curator + embedding
  body: string | null;                 // "Full article text. Articles only."
  imageUrl: string | null; sourceUrl: string;
  attribution: string; license: string; tags: string[];
}

export interface SourceAdapter<Raw = unknown> {
  source: SourceId;
  search(query: string, opts?: FetchOpts): Promise<Raw[]>;   // return ORDER is load-bearing = rank
  toItem(raw: Raw): NormalizedItem;                          // pure + sync, fixture-tested
}
```

This file is a **cross-service agreement** — ambit-archive built to it verbatim. CLAUDE.md:
changing it requires reading the Ambit-Admin doc and recording the decision in its log.

Adapters present: `wikipedia, met, aic, cma, wellcome, archive, smithsonian, loc, nasa-images,
poetrydb` — each with a `.test.ts` and a recorded fixture in `__fixtures__/`.

### 3.2 The item table — `src/server/db/schema.ts`

`id` (nanoid, app-side) · `source` · `sourceId` · `type` `$type<"image"|"article">` (described in
the file as "a genuinely closed set") · `title` · `summary` · `body` ("full article text; articles
only") · `imageUrl` · `sourceUrl` · `attribution` · `license` · `tags text[]` · **`topicId` NOT
NULL FK → topic** · `curationScore real NOT NULL` · `aestheticTags text[]` · `fetchedAt`.
Constraints: `unique(source, source_id)` (this is what makes ingest idempotent), plus indexes on
type, source, `(topic_id, curation_score)`, and a GIN index on tags.

`topic`: `id` (hand-assigned slug) · `label` · `seedQueries jsonb`.

### 3.3 The ingest pipeline — `scripts/ingest.ts` (423 lines)

Seed cells → `search()` → `toItem()` → **claims** (topic + rank + item) → `resolveCollisions()`
(`src/server/services/ingest-plan.ts`, highest search rank wins, order-independent) → skip rows
already present by `(source, sourceId)` → `structuralFloor()` then `curateItems()` (LLM;
`src/server/services/curator.ts`) → `upsertItem()` → structured summary table.
Flags: `--quota --topic --source --dry-run --skip-llm`.

**Everything in it assumes seed cells** — quota, collision resolution and the summary table all
key off `(topic × source)`. That is the surface a corpus-walk shape has to extend.

### 3.4 Topics — `src/server/config/topics.ts`

Sixteen, and the id is a join key across four systems (config → `topic` table →
`topic-graph.json` keys → `item.topic_id` → `user_topic.topic_id`);
`src/server/config/topics.test.ts` enforces the agreement.

```
ancient-history  architecture  astronomy  botany  cartography  ceramics  geology  machines
music  mythology  poetry  portraiture  textiles  the-ocean  typography  zoology
```

**Adding a topic is not a config edit.** The adjacency graph was built offline in Phase 0 from
mean-centered topic centroids; the file's own comment says a graph-less topic gives the feed
"somewhere to go and no way back out", and that the grid grows toward the handoff's 32 "in Phase
6, once new harvests land and the graph is recomputed."

### 3.5 The image proxy already exists — `src/app/api/img/[itemId]/route.ts`

Built in Phase 5. Fetches every item image **server-side by item id**; it never accepts a URL from
a caller (that would be an SSRF gadget). No `Referer` sent — that omission is the point (AIC's
Cloudflare 403s any `localhost` referer, 20/20). Rate-limited 600/min, separate limiter from
tRPC's. Its own header comment says **7.3 owns** resizing/IIIF sizing and a CDN cache layer.

→ **BUILD_PLAN's open question 5 ("image hosting") is largely already answered.** Blog images ride
this route like every other image. Only the cache layer is open, and it belongs to 7.3.

### 3.6 Display surfaces

- `src/app/i/[itemId]/page.tsx:102` — `const variant = item.type === "image" ? "image" : "article"`
  → `ImageItemBody` or `ReaderItemBody`.
- `src/components/item/reader-item-body.tsx` — the only surface that renders `item.body`
  (via `parseReaderBlocks`). `ImageItemBody` never touches `body`.
- `src/components/item/credit-line.tsx` — `from: <source>` linking out, **generalized to every
  source in 5.7**. Its comment: the blog-specific extras (standing blurb, heavier link-out
  treatment that makes the card read as a link preview) are "6.3's, deliberately not here."

### 3.7 Corpus census (dev DB, this session)

| source | rows |
|---|---|
| wikipedia | 2200 |
| wellcome | 1952 |
| met | 1545 |
| smithsonian | 1529 |
| cma | 1528 |
| aic | 1338 |
| nasa-images | 520 |
| loc | 376 |
| archive | 310 |
| e2e | 1 |

**≈ 11,300 total.**

---

## 4. Findings from live probes (all verified 08-25-26)

### F1 — doorofperception is WordPress, and its REST API is live and permissive

`GET https://doorofperception.com/wp-json/wp/v2/posts` → **HTTP 200**, `x-wp-total: 390`.
Available per post: `id, slug, link, title.rendered, excerpt.rendered, date, categories[],
tags[], featured_media`.

- `excerpt.rendered` is **a written one-paragraph blurb**, not a truncation. Example:
  *"The Geologic Atlas of the Moon looks like abstract painting, but only as a byproduct of
  classifying the lunar surface into type and age. The palette exists so that four billion years
  can be told apart at a glance."*
- `featured_media` is **present and distinct on every post sampled** → the blog itself names the
  hero image; no heuristic needed.
- `robots.txt` is `User-agent: * / Disallow:` (empty = allow all) plus a Yoast block and a
  sitemap. **No AI block list** — unlike artvee, which was cut 08-20-26 for exactly that.

→ **Corpus #1 needs no HTML scraping at all.** BUILD_PLAN's "shared scraper core plus per-blog
config" is more accurately a **WordPress REST corpus-walk adapter**. Whether blogs #2+
(50watts.com, thingsorganizedneatly, Public Domain Review) are also WP is **unchecked** — worth a
probe before generalizing the "core".

### F2 — the existing scrape, on disk

`~/Dev/ambit-archive/storage/sources/doorofperception/`
- `index.csv` — 11,584 rows, columns `file, post_slug, post_url, original_url, mime, downloaded`.
  **Do not delete or regenerate it** (it is the attribution source of record).
- **11,572 images across 390 post folders.**
- Images per post: **min 1 · p50 29 · p90 58 · max 123.**
- `README.txt` confirms it was pulled from the WordPress REST media library.

→ Image-per-image ingestion would add 11,572 items to an ~11,300-item corpus: **one blog would be
half of Ambit.** This is what forced the item-unit decision in §5.

### F3 — archive rows carry no blog provenance, which is a live rights problem

Ambit's 310 `archive` rows look like:

```
attribution: "Personal archive"
license:     "unknown"
source_url:  https://archive.home.benreilly.io/img/<sha256>.webp
```

There is **no post URL and no doorofperception credit anywhere**. So any doorofperception image
already in the corpus is being displayed *right now* with the wrong credit and no link to the
post — precisely what the 08-20-26 rights posture exists to prevent. That moves the overlap
question from housekeeping to **correction**.

ambit-archive *can* answer it: its `src/db/schema.ts` has an **`archive_provenance`** table with
`originalName`, so it knows which of its items came from `sources/doorofperception/`.

### F4 — the blog's subject matter is largely orthogonal to Ambit's 16 topics

Categories: `Art 299 · Consciousness 149 · Psychedelic 119 · Science 105 · Books 80 · Videos 75 ·
Horizons 74 · Lectures 38 · Personal 20 · Deutsch 16 · Friends 11 · Mixtapes 2`.

Top tags: `art 278 · consciousness 148 · psychedelic 133 · photography 121 · nature 117 ·
illustration 113 · science 108 · painting 93 · books 82 · videos 81 · horizons 78 · colorful 77 ·
perception 76 · visions 72 · surreal 69 · documentary 68 · body 66 · design 65 · spiritual 65 ·
humanity 63 · black & white 61 · forest 53 · botany 53 · americas 51 · counterculture 51 ·
light 50 · healing 46 · anthropology 45 · abstract 45 · sculpture 44`.

Some land cleanly (botany 53, forest 53, sculpture 44). Psychedelia / consciousness /
counterculture have **no honest home** among the sixteen, and `item.topic_id` is NOT NULL and must
be a topic with a graph row. Hence the reject-rather-than-force decision in §5.

---

## 5. Decisions locked (Ben, this session)

> These are answered. Do not re-litigate them; build the design on top.

**D1 — Item unit: one item per post, hero image.**
390 items, ≈3% of corpus. The card is: hero image (`featured_media`), title, blurb, `from:
doorofperception` credit, prominent link out. The other ~28 images of a post never become items.
Rejected: capped N-per-post; one-per-image; post-item-plus-in-app-gallery.

**D2 — Archive overlap: ambit-archive stops serving doorofperception.**
Those items are excluded from the archive's `/search` (files stay on disk as the scrape of
record); Ambit deletes the archive rows that came from there. Result: every doorofperception image
in Ambit carries the blog credit and links to the post, **or isn't there at all** — one rights
posture, no exceptions. Retires ~85% of the archive's search corpus, which BUILD_PLAN already
anticipated. **Decision recorded in Ambit; executed in ambit-archive** — and per CLAUDE.md it must
also be recorded in the Ambit-Admin vault doc, since it changes a private-source integration.
Rejected: Ambit-side skip-at-ingest; hash dedupe with both paths live; deferring it.

**D3 — Adapter shape: corpus-walk, as a second blessed shape.**
A **sibling** contract next to `SourceAdapter`, which stays untouched:

```ts
interface CorpusWalkAdapter<Raw> {
  source: SourceId;
  walk(cursor?: string, opts?: FetchOpts): Promise<{ raw: Raw[]; next?: string }>;
  toItem(raw: Raw): NormalizedItem;
}
```

`scripts/ingest.ts` learns two shapes: search-shaped → topic×source seed cells (unchanged);
corpus-walk → walk to exhaustion, topic assigned per item. **loupe inherits this contract**
(CLAUDE.md already blesses corpus-walk for it; this is its first implementation).
Rejected: fake `search()` over a local post index; a separate `scripts/ingest-blogs.ts`.

**D4 — Topic assignment: LLM classification with an honest reject.**
Fold it into the curator's existing per-item LLM call — it already returns `curation_score` +
`aesthetic_tags`, so adding *"which of these 16, or none"* costs no second pass. `null` → the post
is **dropped, counted, and reported** (never force-fitted, which would teach the drift graph
something false). **The plan must include measuring the histogram over all 390 first**, so the
real yield is known rather than estimated. Rejected: expanding the topic set first (that's a
separate offline graph recompute); hand-written per-blog tag→topic mapping; force-fitting.

---

## 6. The question that was interrupted — ask this next

**Q: What text does a blog link card carry, and which column holds it?**

Ben declined this question to clarify something first. **Start by asking him what he'd like to
clarify**, then re-put the question if it still stands.

Context that makes it sharp: the handoff asks for *two* texts (Ambit's own description of the
image **and** a 1–2 sentence blurb about the article) where the blog has already written one good
one (`excerpt.rendered`). And because `/i/[itemId]` routes on `type === "image"`, a blog item
typed `image` can never reach `ReaderItemBody`.

Options as they were framed:

- **A (recommended) — one text in `summary`; `body` always null.**
  `summary` = the blurb (WP excerpt, cleaned; LLM-written where a blog has none). `body = null`,
  always, for every blog item. No migration, no new column, no new type. "Ambit never renders blog
  article text" stops being a policy and becomes an **invariant a test can assert**
  (`source ∈ BLOGS ⇒ body === null`). Collapses the two texts into one on the grounds that the
  excerpt already says what the post is about.
- **B — two texts: `summary` = image description, `body` = blurb.** BUILD_PLAN's original sketch.
  Honours the handoff literally; inverts what `body` means everywhere else, and "never a reader
  surface" stays a rule to remember rather than something the types prevent.
- **C — two texts, new `item.blurb` column.** Most honest schema; costs a migration and a column
  only one source family populates.
- **D — new `type: "link"`.** Clearest conceptually; `type` is a deliberately closed set and a
  third value ripples through feed, gallery, share sheet, seen-tracking and their tests.

Sketch of the mapping under A, for reference:

```
type:        "image"
title:       post title (strip the <br> WP puts in title.rendered)
summary:     excerpt.rendered, HTML-stripped        ← the blurb, shown
body:        null                                    ← always
imageUrl:    featured_media → its source URL
sourceUrl:   post permalink (link)
attribution: "doorofperception.com"
license:     "Rights retained by original authors — displayed with credit and link"
tags:        WP tag names (resolved from numeric ids)
```

---

## 7. Questions still unasked

- **Scrape etiquette (BUILD_PLAN Q6).** Largely defused for corpus #1 by F1 (WP REST + allow-all
  robots), but a rule set is still owed for blogs #2+: robots.txt check before ingest, request
  rate, re-crawl cadence, and an identifying User-Agent. Note `src/server/services/sources/http.ts`
  already exports a `USER_AGENT`. Precedent to honour: **artvee was cut** for a machine-readable
  AI block list, so "check robots and obey it" is policy, not politeness.
- **Curation (BUILD_PLAN Q7).** Confirm rather than assume that blog items go through
  `structuralFloor` + the LLM curator. Presumed yes. Watch for `thin-summary` firing on short
  excerpts, and note SPEC §15's open "the curator has no rubric for text items" (the reason
  PoetryDB was parked) — a link card is image-led, so this is probably fine, but say so explicitly.
- **Re-crawl / update semantics.** A corpus walk over a *live* blog is not a one-shot: posts get
  added and edited. `unique(source, sourceId)` + `upsertItem`'s insert-or-refresh already handles
  it, but the walk needs a defined cadence and a cursor story, and D4's LLM classification cost is
  re-paid on refresh unless it's skipped for already-present rows (the existing pipeline already
  skips present rows *before* curation — confirm the walk path does the same).
- **`SourceId` growth.** BUILD_PLAN's sketch says one `SourceId` per blog. Confirm, and decide
  where the designated-blog registry lives (`src/server/config/blogs.ts`?) — it needs to carry per
  blog: id, display name, base URL, license string, and whichever of D4/§6's knobs apply. It is
  also what `source ∈ BLOGS` in option A's invariant would read.
- **Which blog is #2, and is it WP?** `docs/source-candidates.md` lists 50watts.com,
  thingsorganizedneatly.tumblr.com (the deliberate edge case — Tumblr posts have little or no
  article text, so "a blog with nothing to blurb still has to render as an honest link card"),
  openculture.com (parked — an aggregator, so crediting it for a Library of Congress image is the
  wrong credit; BUILD_PLAN says decide at 6.3), and Public Domain Review (parked).
- **Scope check.** BUILD_PLAN's done-bar is *"a design session's decisions recorded in a plan doc;
  then one blog live end to end, displaying as a link card with credit and link-out, and no
  article text rendered by Ambit."* D2 adds a cross-repo change to that. Decide explicitly whether
  6.3 ships as one plan or splits (e.g. 6.3a adapter + display, 6.3b archive retirement).

---

## 8. Rights posture — the non-negotiable frame

From CLAUDE.md and BUILD_PLAN 6.3, both recording the 08-20-26 Ambit-Admin decision:

- A blog item is a **link card**, in the shape of a social link preview: image or short excerpt +
  Ambit's own description + a visible `from: <blog>` credit + a **prominent link to the original**.
- **Never a republished article.** `body` is not a display surface for blog items. Full article
  text is used **at ingest only** (to derive topics/tags/blurb) and never stored for display.
- **No fair-use claim anywhere.** License strings stay honest ("Rights retained by original
  authors"). Removal on request is the standing policy.
- The point of the link-out is to **drive readers to the blog**.
- Tenable because Ambit is invite-only and non-monetized.

---

## 9. Reference

- `docs/BUILD_PLAN.md` — step 6.3 carries the full seven-question text and the v1 sketch.
- `docs/source-candidates.md` §"Designated blogs (08-20-26)" — the blog list and per-blog notes.
- `SPEC.md` §6.1 (sources), §5.1 (item schema), §9 (feed), §15 (open questions).
- `CLAUDE.md` §"Ecosystem coordination (Ambit-Admin)" — the two blessed integration shapes and the
  rule against inventing a third; the `SourceAdapter` contract as a cross-service agreement.
- `~/vaults/Memory-Palace/05 Projects/Ambit-Admin/` — `Ecosystem Architecture.md`,
  `Roadmap & Backlog.md`. **D2 must be recorded in its log.**
- `~/Dev/ambit-archive/` — `src/db/schema.ts` (`archive_provenance`),
  `storage/sources/doorofperception/index.csv`.
