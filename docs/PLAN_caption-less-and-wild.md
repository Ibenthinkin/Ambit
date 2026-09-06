# Caption-less pictures and the WILD slot — letting picture blogs in, and letting un-homed items out

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-06-26 by Fable 5.1, from three read-only explorations (feed engine, curator +
mining scripts, vocabulary design docs) and three decisions Ben made the same evening.
**For:** a cold session on a cheaper model. Branch off `main` (merge `feat/tumblr-blogs-round3`
first — it holds the nine Tumblr walkers this plan ingests; it is committed, not pushed).
**Companion docs:** `docs/HANDOFF_tumblr-round3.md` (the blogs and their numbers),
`docs/DESIGN_topic-vocabulary-growth.md` (the principle this extends),
`docs/PLAN_topic-vocabulary-cut2.md` (the scripts this changes), `docs/PLAN_dev-knob-panel.md`
(the panel this adds two sliders to).

**Goal:** two of the three Tumblr blogs the round-3 handoff called "structurally poor"
(`thevaultoftheatomicspaceage`, `thisisnthappiness`) — plus the two keeps (`70sscifiart`,
`sovietpostcards`) — get ingested to the budgets Ben set (the newest half, or quarter for
thisisnthappiness, resumable later),
with **every picture of a post and its caption** stored, and their pictures reach the feed. Today they cannot, for two separate reasons that need
two separate fixes:

1. **They are dropped before any LLM call.** `structuralFloor()` (`curator.ts:122-151`) drops any
   item whose summary is under 60 characters — a rule written for museum records ("below ~60 chars a
   museum summary is just a department name"). A caption-less Tumblr photo has `summary: ""`. The
   vault floors 137 of 150 on that rule alone; thisisnthappiness 140 of 140; toiich 84%. These posts
   are never stored, so no feed change can surface them.
2. **What does clear the floor is often un-homed, and un-homed is invisible.** The classifier only
   knows the sixteen core topics (`TOPIC_IDS`, `curator.ts:53`); `mine:topics`, `promote:topics` and
   `graph:rebuild` read **source tags only** (`item.tags`), never the curator's `aesthetic_tags`; and
   the feed's pool query is `inArray(item.topicId, …)`, which a NULL never matches
   (`db/feed.ts:101`). A tag-less picture blog therefore has **no route out of un-homed by any
   current tooling**, even though every curated item already carries 2–4 aesthetic tags written
   from the image itself.

**Three facts from a live 50-post probe of each blog (09-06-26, `/api/read/json?num=50`) that
reshaped the plan after Ben's second round of answers:**

| blog | post types | multi-picture posts | pictures / 50 posts | caption median (chars) | empty captions |
|---|---|---:|---:|---:|---:|
| toiich | 50 regular | **21** | **100** | 49 | 0 |
| sovietpostcards | 47 regular · 2 photo · 1 answer | 7 | 67 | 56 | 2 |
| 70sscifiart | 30 regular · 20 photo | 9 | 73 | 70 | 2 |
| thisisnthappiness | 50 photo | 0 | 50 | 28 | 0 |
| thevaultoftheatomicspaceage | 50 regular | 0 | 50 | **0** | 44 |

- **The captions are there; the floor was throwing them away.** toiich's median caption is 49
  characters ("Eros + Massacre (1969), dir. Yoshishige Yoshida"), sovietpostcards' 56,
  thisisnthappiness's 28 — all under the 60-character rule. Only the vault is truly caption-less.
- **Multi-picture posts are common and share one caption.** toiich packs two pictures per post on
  average, sovietpostcards and 70sscifiart about 1.4. In a `regular` post the pictures are `<img>`
  tags inline in the body and the caption is the body's text; in a `photo` post a photoset is a
  `photos[]` array (each entry carries its own `photo-url-*` set and an empty per-photo `caption`)
  under the post-level `photo-caption`. Today `picture()` takes only the first image either way.
- **Every rendition exists.** `photo` posts carry `photo-url-1280/500/400/250/100/75`; inline
  `<img>` tags carry a `srcset` with the same ladder. This is what makes the optional
  `curationImageUrl` idea in T6 cheap.

**Architecture — six moves, in dependency order:**

- **T1 Floor + captions + fan-out.** A walk source's *image* items pass the structural floor
  unconditionally; the curator becomes their whole quality bar. The Tumblr walker **expands a
  multi-picture post into one item per picture**, every one carrying the post's caption as its
  summary, its first line as the title, and the post's tags. The last-resort title for a truly
  caption-less post becomes the **blog label** (Ben's call) instead of `Untitled post <id>`, with
  summary `""` — honest, and every renderer already guards `item.summary ?`. The feed tile stays
  image-only (design handoff: "the image and nothing else"); captions reach the reader on the item
  page and as the image's alt text.
- **T1b Walk budgets.** Ben is self-hosting and wants the archive sizes manageable: **the newest
  half of 70sscifiart, sovietpostcards and the vault, the newest quarter of thisisnthappiness.**
  (`toiich` is parked — Ben's verdict, 09-06-26, after the probe; it stays in `SUSPENDED_SOURCES`.) A per-blog `walkQuota` in `blogs.ts` bounds the *default* (nightly) walk so
  un-suspending a blog does not trigger a full-archive walk; the walk is newest-first already
  (`start=0`), and ingest prints the **resume cursor** where it stopped and accepts `--cursor`, so
  "the rest" is one command later.
- **T2 WILD tier.** A fourth feed tier, `WILD`, weight `10` against `40/35/25` (≈ 1 card in 12),
  draws from the **un-homed pool** — curated, unseen, un-suspended items with `topic_id IS NULL` —
  using the same `pickItem`/`drawWeight` every other tier uses, with its own `wildTagBoost` so the
  reader's recent saves' aesthetic tags are the slot's *only* personalization axis (Ben's call:
  "learn from its aesthetic/vibe"). The pool is a deterministic per-page sample of 200 rows, so a
  cursor still reproduces its page byte-for-byte.
- **T3 Mining reads aesthetic tags.** `mine:topics` tallies `tags ∪ aesthetic_tags` per item and
  says how much of each candidate came from the curator; `promote:topics` and `graph:rebuild` match
  on either column. Ben's tick in `docs/topic-proposals.md` stays the verdict.
- **T4 Classify sees grown topics.** The classify prompt lists every topic in the database (16 core
  + 83 grown today), not the compile-time sixteen, so a new post homes at ingest into a topic that
  exists rather than waiting for the next manual promote. The curation cache is not keyed on the
  topic list (by design, `curator.ts:271-277`) so **nothing already curated is re-billed**.
- **T5 Panel + readouts.** Two sliders (`tierWild`, `wildTagBoost`) and a `wild` bucket in the
  readout, so the 1-in-12 is tuned, not argued.

Then **T6** walks the four blogs one at a time with a stop and a readout after each.

**Tech stack:** unchanged — Next.js 16 App Router, tRPC, Drizzle over Postgres, Vitest, Playwright,
Bun. **No new dependencies.** One Drizzle migration (two indexes).

---

## Scope

**In:** T1–T6 above; the photoset fan-out and per-blog walk budgets with a resumable cursor; tests
at every layer (curator floor, tumblr fan-out and title fallback, ingest quota/cursor, feed engine,
pool query, mining/promote/graph scripts, classify prompt builder, panel stats, router zod); the
docs listed in *Docs to update*; one e2e assertion on `/dev/feed`.

**Out:** the four blogs Ben parked by verdict on 09-05 (`nemfrog`, `humanoidhistory`,
`dreamsrecurring`, `vintagegeekculture`) and `toiich`, parked by verdict on 09-06 after the probe
— settled, do not re-open; move `toiich` from the "pending a verdict" group of
`suspended-sources.ts` to the "parked by verdict" group with the date, nothing else; `streetartnews` (parked on
sequencing, its own note); Cut 2b (`topic_edge`, feed onto the `item_topic` join); any per-source
cap *inside* a topic (a known follow-up if T6's readouts show topic capture — see *Risks*); a
persisted per-user taste table (the existing last-24-saves window is the mechanism Ben chose to
learn through; revisit only if it proves too short); visual embeddings (parked, SPEC §15).

---

## Decisions settled (09-06-26)

**Ben's three, in order asked:**

- **D1 — Learning.** A save on a WILD card should teach the feed the item's *aesthetic/vibe*, not
  "I like this blog" and not nothing. Mechanism: the existing taste keywords (`getTasteKeywords`,
  `db/saves.ts:148-166` — the last 24 unique `aesthetic_tags` across the reader's most recent saves,
  derived at feed time, never stored) already include un-homed saves with no topic predicate. The
  WILD draw weights by overlap with them through `wildTagBoost`. **No new table.**
- **D2 — Caption-less cards.** Title = the blog's label, summary empty, no extra LLM output. (The
  alternative — the curator writing a short title for ~$0.00025/item — was offered and declined.)
- **D3 — Reachability.** Both: grow the vocabulary from aesthetic tags (T3/T4) *and* a small WILD
  slot for the residue (T2). Not "wild only" (tag-less blogs would stay un-homed forever, and the
  pool would grow to dominate the slot) and not "promotion only" (between rounds nothing un-homed is
  ever seen).

**Design calls made in this plan, for the executor to follow rather than re-decide:**

- **D4 — The tier is named `WILD`** and it is *not* the gallery rail's "wildcard". The rail's
  wildcard (`gallery-rail.ts:131`, `drawImageAnywhere`) is public, unpersonalized, ignores topics
  *and* the un-homed distinction, and writes no `seen_item` rows. `WILD` is personalized (taste
  boost), draws **only** un-homed items, and burns seen rows like every feed tier. The doc comment on
  the tier must say this in one sentence; the names differ on purpose.
- **D5 — The floor exemption is `walk && image`, not `walk`.** A walk source's *articles* (pdr's)
  keep the thin-summary rule: a 40-char article summary is still nothing to read. `bare-title` is
  already image-only and is also lifted for walk images (two blog labels are one word — `nemfrog`,
  `Colossal` — and would otherwise floor every caption-less card). Search-shaped sources are
  untouched: the rule was written for them and still fits them.
- **D6 — The WILD pool is sampled in SQL, deterministically.** `ORDER BY md5(item.id || '<seed:page>')
  LIMIT 200`. Loading the whole un-homed set per request would recreate the 35 MB-per-page problem
  Phase 7.3 fixed (`db/feed.ts:60-71`); a `random()` sample would break "same cursor ⇒ identical
  page" (`feed.integration.test.ts` pins it). `md5` over ~50k rows is milliseconds; a partial index
  on `(curation_score) WHERE topic_id IS NULL` keeps the filter cheap as the pool grows.
- **D7 — Un-homed means `topic_id IS NULL`, no type filter.** Ben said "images", and the pool is
  overwhelmingly images, but excluding an un-homed pdr article from the slot would be a rule with no
  reason behind it. If a wild article card reads wrong in practice, add `eq(item.type, "image")` to
  `getWildPool` — one line, noted here so nobody has to rediscover the choice.
- **D8 — `tierWild` ships at `10`, not `0`.** Ben's intent is that these pictures pop in now; the
  slider exists to tune the rate, not to turn it on. `wildTagBoost` ships at `1.0` (double the
  ordinary `tagBoost` of `0.5`) because in this slot it is the only signal.
- **D9 — This amends design D4 of `DESIGN_topic-vocabulary-growth.md`** ("the feed does not move";
  "reachability of un-homed items follows via promotion") and flips its §9 property test
  ("`composePage` never returns an un-homed item"). Record the amendment in that doc (see *Docs to
  update*); do not silently contradict it.
- **D10 — Grown topics enter the classify prompt at ingest; the cache key does not change.** An
  item classified before this plan keeps its cached `topics`; `promote:topics` remains the backfill
  for those. `PROMPT_VERSION` stays `1` — bumping it would re-bill the whole corpus for a change to
  the *list*, which the cache was explicitly designed not to key on.
- **D11 — Fan-out happens in `walk()`, not `toItem()`, and `sourceId` is `${postId}:${n}` (1-based)
  for every picture including the first.** `CorpusWalkAdapter.toItem` is one raw → one item, pure
  and fixture-tested; keeping that means the walker yields one *raw per picture* (`TumblrRaw` plus
  `pictureUrl`, `pictureIndex`, `pictureCount`), expanded by a pure `expandPictures(post)` that is
  itself fixture-tested. Uniform ids so a caller never has to know whether a post was a photoset.
  `sourceUrl` is the post URL for all of them (the link card still links to the original post).
  The frozen `things-organized-neatly.ts` keeps bare post ids — no rows move. Each picture is
  curated on its own (its own score and aesthetic tags), which is why the cost line counts pictures.
- **D12 — `walkQuota` is in items offered (pictures), applied by ingest exactly like `--quota`.**
  So a budgeted walk is never `complete`, `--prune` can never act on it, and no contract changes
  (`WalkPage`/`CorpusWalkAdapter` are cross-service). The config comment on each row states the
  post count it was derived from and the measured pictures-per-post multiplier. `--quota` on the
  command line still overrides.
- **D13 — Captions reach the reader on the item page and in `alt`, not on the tile.** The tile is
  image-only per the design handoff and this plan does not reopen that. Title = the caption's first
  non-attribution line (first sentence within 80 chars), summary = the whole caption capped at 600
  (`capSummary`), tags = the post's tags minus `selfTags` — the existing `toItem` rules, now applied
  to every picture of the post.

---

## Verified facts the executor should not re-derive

- **Floor:** `structuralFloor` at `src/server/services/curator.ts:122-151` — one if/else chain,
  dup-title → bare-title → thin-summary. Only dup-title is walk-aware (`isWalkSource`, `:95-97`).
  Tests: `curator.test.ts:89` ("exempts walk sources from dup-title"), `:103` ("still applies
  bare-title and thin-summary to walk sources") — the second is the one T1 rewrites.
- **Curator output:** exactly `{score, tags, topics}` (`parseCuratorResponse`, `curator.ts:203-255`).
  `tags` are free text, lowercased, max 4, produced **for every item** from the image — three
  exceptions: 4 failed retries → `[]`, `--skip-llm` → `[]`, model returns none. Stored as
  `aesthetic_tags text[] NOT NULL DEFAULT '{}'` (`schema.ts:214-217`), **no index**.
- **`itemAsText`** (`curator.ts:159-168`): `Type / Title / Tags (if any) / Text`. For a caption-less
  post today that is `Text: ` with nothing after it.
- **Classify:** `CLASSIFY_PROMPT` (`curator.ts:72-77`) is a string constant built from `TOPICS`
  (config, 16). Validation set `TOPIC_IDS` (`:53`). Callers: `scripts/ingest.ts:478`
  (`curateItems(keptWalk, {...curateOpts, classify: true})`), `scripts/walk-stats.ts:75`.
  `curateItems`'s opts interface is at `curator.ts:~450`; `scoreItem` passes the prompt at `:389`
  and the validation set at `:408`.
- **Cache key** (`curator.ts:278-289`): `sha256(model|v1|classify?|source:sourceId)`. Content and
  topic list are deliberately not in it.
- **Tumblr title:** `deriveTitle(captionHtml, slug, id)` at `tumblr.ts:172-187`, three fallbacks —
  first non-attribution caption line → humanized slug → `Untitled post ${id}`. Tumblr sends an
  *empty* slug on a caption-less post, so the placeholder is the usual outcome. The doc comment at
  `:169-171` says the placeholder can never reach a reader *because the floor drops it* — that
  sentence becomes false in T1 and must be rewritten. `toItem` at `:274-302`; `blog.label` is in
  scope there.
- **Feed engine:** `composePage` at `src/server/services/feed.ts:412-485` (guard loop, per-slot
  `weightedPick` over three tiers at `:439-446`, `pickItem` at `:349-380`). `ComposedCard.topicId:
  string` (`:88-93`) with a comment asserting the engine never produces null. `FeedCard.topicId:
  string | null` (`:104-122`). `Tier` union at `:80`. `getFeedPage` at `:543-634` fetches pools
  once via `getTopicPools(reachableTopics(...))` at `:583`.
- **Pools:** `getTopicPools` at `src/server/db/feed.ts:73-138`; `PoolItem` at `:27-38` with a
  comment saying NULL can't enter. The not-seen subquery (`:88-98`), suspended-source and
  `excludeIds` guards (`:104-114`, note the empty-`IN` footgun) are exactly what `getWildPool` reuses.
- **Knobs:** `src/server/services/feed-knobs.ts` (no-import leaf; `FeedKnobs` + `DEFAULT_KNOBS`);
  zod mirror `src/server/api/routers/feed.ts:21-38`; slider specs
  `src/components/feed/dev/use-dev-knobs.ts` (entries like `{ key: "tierJump", label, section:
  "Tier mix", min: 0, max: 100, step: 1 }`); `tierTotal` at `knob-panel.tsx:115` and the share line
  at `:178`; `pageStats` at `src/components/feed/dev/feed-stats.ts:20-46` treats a null `topicId`
  as "a bug worth seeing" and counts it in neither bucket; `DebugBadge` renders `card.tier`
  verbatim, so `WILD` needs no change there.
- **Downstream null-safety already in place:** `masonry.ts:49-53` `isBecause` requires
  `tier === "JUMP" && topicId !== null`; `saved-screen.tsx` already dresses un-homed items as cards
  with `topicId: null`; `saves.ts:107-113` early-returns `drift: null` for a null topic (stays).
- **Mining:** `scripts/mine-topics.ts:45-55` selects `{tags, source, topicId}` only;
  `tallyTags`/`rankCandidates`/`DEFAULT_MINING` in `src/server/services/topic-mining.ts:30-139`;
  `topicIdFor` slugifies spaces to hyphens (`:142-148`, so `film still` → `film-still`).
  `scripts/promote-topics.ts:104-128` matches `item.tags @> ARRAY[tag]` for both memberships and the
  NULL-only display-topic write. `scripts/rebuild-topic-graph.ts:63-73` builds profiles from
  `item.tags` via `item_topic`. The ingest summary's un-homed histogram (`ingest-plan.ts:117-134`)
  already unions both tag fields — it is the *scripts* that lag it.
- **Tripwire tests to flip on purpose:** `src/server/db/items.integration.test.ts:335` ("an
  un-homed item is never drawn: drawFromTopic and getTopicPools both skip it" — stays true for those
  two functions; add the `getWildPool` counterpart beside it); `feed.test.ts` composePage suite
  (tier mix ≈ 40/35/25 becomes ≈ 40/35/25/10 over 110); `routers.integration.test.ts:318` (saving an
  un-homed item reports no drift — unchanged, still true).
- **Migrations:** `bun run db:generate` (drizzle-kit) writes `drizzle/000N_*.sql`; the last is
  `0005_topic_tier.sql`. Partial and GIN indexes are declared in `schema.ts` on the table's index
  list (see `idx_item_tags_gin` at `:233` and `idx_item_topic_score` for the pattern).
- **Blog labels** (`src/server/config/blogs.ts`): `70s Sci-Fi Art`, `Soviet Postcards`, `Questi
  giorni quando vieni il bel sole` (toiich), `The Vault of the Atomic Space Age`, `this isn't
  happiness`. All five are in `SUSPENDED_SOURCES` under the "pending a verdict" group
  (`suspended-sources.ts:96-111`).
- **Cost basis:** curation measured at **$0.000235/item** (round 3, OpenRouter's own accounting),
  ~2,300 prompt tokens, mean image **649 KB** at the `photo-url-1280` rendition the walker stores.

---

## Global constraints

- **`/feed`'s tRPC query key is `{}` and must stay `{}`** (`src/app/feed/page.tsx`); new knobs are
  server defaults, never sent by the production client.
- **Same cursor ⇒ identical page.** Every new randomness must come from the page `rng` or from a
  deterministic SQL expression seeded by `${seed}:${page}`.
- **No `seen_item` writes in `getFeedPage`** — the client acks. Unchanged.
- **Nothing already curated is re-billed.** `PROMPT_VERSION` and `CURATOR_MODEL` do not change;
  the cache key does not change.
- **Additive membership.** `item_topic` rows are never retracted by code (design §5). T3's
  aesthetic-tag matching only *adds*.
- **`SUSPENDED_SOURCES` is the only switch** keeping a registered walker out of the nightly ingest.
  `--source <id>` still runs a suspended source (that is how the samples were taken).
- **`--quota` makes a walk incomplete, so never combine it with `--prune`.**
- **Comment generously** — Ben is a returning web developer and the repo teaches. Every new
  function gets a why-comment in the house style you can see in `feed.ts`.
- Keep the shipped `/feed` composing **exactly as before except for the WILD slot**: the three
  existing tier weights, `topicCap`, the graph and the taste boost on topic draws do not move.

---

## Task 1 — The floor, the captions, the fan-out and the walk budgets

**Files:** `src/server/services/curator.ts` + test, `src/server/services/sources/tumblr.ts` +
test + two new fixtures, `src/server/services/sources/things-organized-neatly.ts` (header comment
only), `src/server/config/blogs.ts` (`walkQuota` field + row comments), `scripts/ingest.ts`
(+ a small test), `scripts/walk-stats.ts` (comment only).

- [ ] In `structuralFloor` (`curator.ts:122-151`), compute `const walkImage = isWalkSource(item.source) && item.type === "image";` once per item and lift **both** `bare-title` and `thin-summary` for it. Keep the chain order. Rewrite the rule comments at `:111-120`: the thin-summary rationale is museum-shaped ("a department name"); a picture blog's caption-less post is a different case, and for walk images the curator — which sees the picture — is the whole bar. Cite `docs/DESIGN_topic-vocabulary-growth.md` §1 ("everything that clears *quality*").
- [ ] `curator.test.ts`: change `:103` to assert the new asymmetry — a walk **image** with a one-word title and empty summary is kept; a walk **article** with a 40-char summary is still floored on thin-summary; a search-shaped image with an empty summary is still floored. Keep `:89`.
- [ ] `itemAsText` (`curator.ts:159-168`): omit the `Text:` line when `item.summary.trim()` is empty, the way `Tags:` is already omitted. A trailing `Text: ` with nothing after it is noise to the model.
- [ ] `tumblr.ts`: give `deriveTitle` a fourth parameter `fallback: string` and return it instead of `` `Untitled post ${id}` ``; `toItem` passes `blog.label`. Rewrite the doc comment at `:169-171` — the placeholder no longer exists, and the blog label *does* reach readers, as "image + `from: <blog>` + link" (the 08-20-26 rights posture's link-card shape, with no caption to excerpt). Keep the slug fallback in between; it still fires for captioned posts whose first line is an attribution.

**Fan-out (D11):**
- [ ] `tumblr.ts`: add `export function allImageUrls(html: string): string[]` beside `firstImageUrl` (`:112`) — every `<img>` in document order, each resolved to its largest `srcset` candidate exactly as `firstImageUrl` does (refactor so both share one per-tag resolver). Add `photoUrls(raw): string[]` for `photo` posts: `raw.photos?.length > 1 ? raw.photos.map(p => p["photo-url-1280"]) : [raw["photo-url-1280"]]` — extend `TumblrRaw` with `photos?: { "photo-url-1280"?: string; "photo-url-500"?: string; caption?: string }[]` and `"photo-url-500"?: string`.
- [ ] Add a pure `export function expandPictures(post: TumblrRaw, blogId: string): TumblrPicture[]` where `TumblrPicture = TumblrRaw & { pictureUrl: string; pictureIndex: number; pictureCount: number }`. A post with zero pictures throws the same error `picture()` throws today (ingest counts it; nothing is silently skipped). `walk()` returns `raw: page.posts.flatMap(p => expandPictures(p, blog.id))` — but a post that *throws* in `expandPictures` must still be counted by ingest as one `toItem` error rather than abort the page: catch per post inside the `flatMap`, and yield a single sentinel raw `{ ...post, pictureUrl: "", pictureIndex: 0, pictureCount: 0 }` that `toItem` rejects with the original message. Comment why (ingest's error count is signal; a page that dies on one `answer` post is not).
- [ ] `toItem(raw: TumblrPicture)`: `imageUrl = raw.pictureUrl`, `sourceId = \`${raw.id}:${raw.pictureIndex}\``, everything else exactly as now — the caption (`photo-caption` or the `regular-body` text with images stripped by `htmlToText`), title, tags, `sourceUrl`. `picture()` collapses into "caption HTML by post type" only.
- [ ] Record two new fixtures live (the recorder exists; see how the nine were recorded in `HANDOFF_tumblr-round3.md` §1): a sovietpostcards page containing a multi-image `regular` post (7 of its first 50 are; "Tajikistan, 1981" is a 6-image one), and a 70sscifiart `photo` post with a `photos[]` array of ≥ 2. Keep them small (≤ 5 posts each).
- [ ] `tumblr.test.ts`: "a 6-image regular post yields 6 items, sourceIds `id:1..id:6`, identical title/summary/tags, distinct imageUrls in document order"; "a photoset yields one item per `photos[]` entry"; "a single-picture post yields `id:1`"; "a picture-less post yields one toItem error, and the rest of the page still yields"; "a caption-less post is titled with the blog label and has an empty summary"; the equivalence test with `things-organized-neatly.ts` is **retired for `sourceId`** (it now differs by design — assert equivalence on every other field and say why in the test name).
- [ ] `things-organized-neatly.ts` header: one note that the factory now fans out photosets and ids differently; this file stays frozen (Ben's standing call for shipped code with real rows). Its 1,720 rows are single-picture by construction — if it is ever moved onto the factory, that is a row migration, not a flag.

**Walk budgets (D12):**
- [ ] `blogs.ts`: add `walkQuota?: number` to `BlogConfig` with a doc comment: "Newest-first bound on a *default* walk, in items offered (pictures after fan-out). Present ⇒ the nightly ingest walks only this many, is never `complete`, and `--prune` can never act on it. Absent ⇒ walk to exhaustion." Update the header's YAGNI note — this is the per-blog walk option it said to wait for, and here is why it arrived (self-hosted disk). Set per row from the table in T6.
- [ ] `scripts/ingest.ts`: `processWalker(sourceId, quotaItems ?? BLOG_CONFIG_FOR(sourceId)?.walkQuota)` — look up through the same registry `sources/index.ts` uses; pdr/doorofperception have no row or no quota and are unaffected. Track the last cursor handed to `walk()` and the page it produced; when the walk stops on quota, print `  ${sourceId}: stopped at ${offered} offered · resume cursor ${cursor}` and include `resumeCursor` in `WalkRunStats`. Add `--cursor <c>` (walk-stats already has it) so `bun run ingest --source sovietpostcards --cursor 12900` continues an archive from where a bounded walk stopped; a `--cursor` run is also never `complete`.
- [ ] Tests: `ingest-plan.test.ts` or a new `ingest-walk.test.ts` with a fake walker — quota from config applies when no flag; flag overrides; a quota'd or cursor'd walk reports `complete: false`; `resumeCursor` is the page cursor at which the loop stopped.
- [ ] `blogs.ts`: on each of the four rows, add the measured pictures-per-post and the `walkQuota` derivation; after T6, the post-floor `stats:walk` numbers. On `toiich`'s row: parked 09-06-26 by verdict, probe numbers kept.
- [ ] Run `bun run test -- curator tumblr ingest` and the source-invariants test (walk rows carry no body — unchanged).

*Done =* `bun run stats:walk sovietpostcards --quota 150` reports `floored 0 (…thin-summary 0)`, `curated 150`, sample lines whose titles are the captions ("Tajikistan, 1981") and whose sourceIds carry `:n` suffixes; `bun run stats:walk thevaultoftheatomicspaceage --quota 150` shows blog-label titles. (Each bills ~150 × $0.000235 ≈ $0.04.)

---

## Task 2 — The WILD tier

**Files:** `src/server/services/feed-knobs.ts`, `src/server/services/feed.ts`,
`src/server/services/feed.test.ts`, `src/server/db/feed.ts`,
`src/server/db/feed.integration.test.ts`, `src/server/db/items.integration.test.ts`,
`src/server/db/schema.ts` + one migration, `src/server/api/routers/feed.ts`,
`src/server/services/feed.integration.test.ts`.

- [ ] `feed-knobs.ts`: add `tierWild: number` (default `10`) beside the three tier weights and `wildTagBoost: number` (default `1`) under a new "WILD" comment block that states D4 (WILD ≠ the rail's wildcard) and D8 (why 10 and why 1.0).
- [ ] `schema.ts`: add a partial index `idx_item_unhomed_score` on `item (curation_score) WHERE topic_id IS NULL` (Drizzle: `index(...).on(item.curationScore).where(sql\`${item.topicId} IS NULL\`)`) and a GIN index `idx_item_aesthetic_tags_gin` on `aesthetic_tags` (T3 needs it; one migration for both). `bun run db:generate`, read the SQL, `bun run db:migrate`.
- [ ] `db/feed.ts`: widen `PoolItem.topicId` to `string | null` and rewrite its comment (NULL now *does* enter, through `getWildPool` only). Add:
  ```ts
  export async function getWildPool(opts: {
    userId: string; anchor: Date; scoreFloor: number; excludeIds: string[];
    /** `${seed}:${page}` — makes the sample a pure function of the cursor. */
    sampleKey: string; limit?: number; // default WILD_POOL_SIZE = 200
  }): Promise<PoolItem[]>
  ```
  Same not-seen subquery, suspended-source and `excludeIds` guards as `getTopicPools` (factor the shared `conditions` builder out into a small private helper rather than copy it), plus `isNull(item.topicId)`, `gte(item.curationScore, opts.scoreFloor)`, `orderBy(sql\`md5(${item.id} || ${opts.sampleKey})\`)`, `limit`. Comment: D6 verbatim, and why `md5` rather than `random()`.
- [ ] `feed.ts`: `Tier` gains `"WILD"`. `ComposedCard.topicId` becomes `string | null` — rewrite the comment (`:88-93`): null means a WILD card, and only a WILD card. `ComposePageOpts` gains `wildPool?: PoolItem[]` (default `[]`). In `composePage`: add `["WILD", knobs.tierWild]` to the tier draw; for WILD, skip the topic step and `topicCap`, draw with `pickItem(workingWild, lastSource, { ...knobs, tagBoost: knobs.wildTagBoost }, tasteKeywords, rng)`, splice the winner out of the working copy, set `lastSource`, push `{ item, tier: "WILD", topicId: null, ...(debug ? { debug: { why: \`WILD · un-homed (${workingWild.length} left in sample)\`, curationScore } } : {}) }`. No `driftPath`.
- [ ] `getFeedPage`: fetch `getWildPool` in parallel with `getTopicPools` (`Promise.all`), `sampleKey: \`${seed}:${page}\``, and pass `wildPool` to `composePage`. Skip the query entirely when `knobs.tierWild <= 0`.
- [ ] Router zod (`routers/feed.ts:21-38`): `tierWild: z.number().min(0)`, `wildTagBoost: z.number().min(0)`.
- [ ] `feed.test.ts`: tier mix test now expects ≈ 40/35/25/10 over 110; "a WILD card has `topicId: null`, no `driftPath`, and its item came from `wildPool`"; "no WILD card when `wildPool` is empty (the slot is skipped, the page still fills)"; "`tierWild: 0` never draws WILD and composes byte-identically to before"; "a WILD item is never drawn twice on a page"; "same rng + same pools + same wildPool ⇒ identical page"; "`wildTagBoost` moves the draw: with taste keywords matching one wild item's tags it wins measurably more often"; "`topicCap` does not count WILD cards".
- [ ] `db/feed.integration.test.ts`: `getWildPool` returns only `topic_id IS NULL` rows above the floor; excludes seen-before-anchor, `excludeIds` and suspended sources; same `sampleKey` ⇒ same order, different key ⇒ different order; respects `limit`.
- [ ] `items.integration.test.ts:335`: keep the assertion for `drawFromTopic`/`getTopicPools`, retitle it, and add the sentence "…and `getWildPool` is the one draw that returns it (plan 09-06-26)". Update the comment that cites design §5.
- [ ] `feed.integration.test.ts`: one end-to-end case — a user whose corpus holds one un-homed item above the floor sees it within N pages at `tierWild: 10`; after acking, it is not served again.

*Done =* `bun run test -- feed` green; `bun run dev`, open `/feed` with `FEED_DEBUG` on: a tile shows a `WILD` badge roughly once a page and its tooltip reads `WILD · un-homed (…)`.

---

## Task 3 — Mining, promotion and the graph read aesthetic tags

**Files:** `scripts/mine-topics.ts`, `src/server/services/topic-mining.ts` + test,
`scripts/promote-topics.ts`, `scripts/rebuild-topic-graph.ts`, `docs/topic-proposals.md`
(regenerated, not hand-edited).

- [ ] `topic-mining.ts`: `tallyTags` input becomes `{ tags, aestheticTags, source, homed }`; per item, fold the **union** (dedupe, lowercase, trim — mirror `tagHistogram` in `ingest-plan.ts:117-134`), and count separately how many of a tag's items carried it **only** as an aesthetic tag (`TagStat.aestheticOnly`). Extend `DEFAULT_MINING.stopwords` with look-only descriptors that fail the "a kind of thing a person could be curious about" test and that the curator emits constantly: `vintage`, `retro`, `black and white`, `monochrome`, `colorful`, `muted palette`, `lurid palette`, `high contrast`, `grainy`, `minimal`, `minimalist`, `moody`, `quiet`, `striking`, `bold`, `soft`, `warm palette`, `cool palette`. Keep `hand-drawn`, `hand-lettered`, `brutalist`, `botanical plate` and the like **out** of the stopwords — those name things a person could be curious about. Comment the list: the stopwords trim noise, Ben's tick is the verdict.
- [ ] `mine-topics.ts`: select `aestheticTags` too; the proposal row gains `· via curator ${aestheticOnly}` so Ben can see a candidate that exists only because the curator keeps writing it. Header text: add one paragraph saying aesthetic tags are now mined and what `via curator` means. Regenerate `docs/topic-proposals.md` **only in T6** (after the blogs land) — regenerating now would clobber the 83 ticks for nothing.
- [ ] `promote-topics.ts`: membership select and the NULL-only display-topic update match `item.tags @> ARRAY[tag] OR item.aesthetic_tags @> ARRAY[tag]`. The dry-run over-count caveat (CLAUDE.md) gets worse with two columns — restate it in the script's header.
- [ ] `rebuild-topic-graph.ts:63-73`: profiles fold both columns (union per row). Note in the header that grown-topic edges now reflect the curator's vocabulary too, and that `--grown-scale` is still the lever if drift softens.
- [ ] Tests: `topic-mining.test.ts` — union dedupes a tag present in both fields; `aestheticOnly` counts correctly; new stopwords excluded. Promote/graph scripts have no unit tests today; run each with no `--confirm` against the local DB and read the counts.

*Done =* `bun run mine:topics` (do **not** commit the regenerated file yet) lists candidates with a `via curator` figure, and `bun run promote:topics` (dry run) reports memberships for a known aesthetic-only tag.

---

## Task 4 — The classifier lists every topic in the database

**Files:** `src/server/services/curator.ts` + test, `scripts/ingest.ts`, `scripts/walk-stats.ts`.

- [ ] `curator.ts`: replace the `CLASSIFY_PROMPT` constant with `classifyPrompt(topics: {id: string; label: string}[]): string` (same text, the block built from the argument); keep a `CLASSIFY_PROMPT = classifyPrompt(TOPICS)` export so existing tests and the prompt-slicing comment still hold. `curateItems`' opts gain `topics?: {id; label}[]`; `scoreItem` uses `classifyPrompt(topics ?? TOPICS)` and validates against `new Set(topics.map(t => t.id))` instead of `TOPIC_IDS`. Rewrite the `TOPIC_IDS` comment (`:51-55`): it is now the *fallback* vocabulary.
- [ ] Prompt line "Usually one or two, never more than three" stays. Add, after the list: "The list is long; most of it will not apply — pick only honest homes." (Keep it to one sentence; the rubric is calibrated.)
- [ ] `ingest.ts` and `walk-stats.ts`: `const topics = (await listAllTopics()).filter(t => !t.id.startsWith("test-feed-topic"))` (the same filter `rebuild-topic-graph.ts:57-59` uses) and pass `{ classify: true, topics }`. Print `classify vocabulary: N topics` in the ingest header.
- [ ] `curator.test.ts`: `classifyPrompt` lists exactly the ids given; a returned id outside the given list is dropped; the cache key is unchanged by the topic list (assert `curationCacheKey` has no `topics` input — it already doesn't; the test pins D10).
- [ ] D10 in a comment on the cache: "the topic list is not in the key, so an item classified under sixteen topics keeps that answer; `promote:topics` is the backfill."

*Done =* `bun run stats:walk 70sscifiart --quota 150` prints `topics (k/99)` and homes into grown topics (expect `science-fiction`-shaped ids if such a topic exists; if none does yet, that is T6's mining round).

---

## Task 5 — Panel sliders and readouts

**Files:** `src/components/feed/dev/use-dev-knobs.ts`, `knob-panel.tsx`, `feed-stats.ts` + test,
`e2e/dev-feed.spec.ts`.

- [ ] Slider specs: `{ key: "tierWild", label: "WILD — un-homed pool", section: "Tier mix", min: 0, max: 100, step: 1, note: "Draws items no topic fits, weighted by your recent saves' aesthetic tags." }` after `tierJump`; `{ key: "wildTagBoost", label: "WILD taste boost", section: "Taste", min: 0, max: 3, step: 0.1 }` after `tagBoost`.
- [ ] `knob-panel.tsx:115` `tierTotal` includes `tierWild`; the share line at `:178` prints four shares.
- [ ] `feed-stats.ts`: `Record<Tier, number>` gains `WILD` via `emptyTiers`; add `wild: number` to `PageStats` (cards with `topicId === null`), counted in neither `core` nor `grown`; rewrite the comment at `:33-42` — null is now expected and named. `sumStats` sums it. Readout shows `core / grown / wild`.
- [ ] `feed-stats.test.ts`: a WILD card increments `wild` and neither bucket.
- [ ] `e2e/dev-feed.spec.ts`: the panel renders a "WILD" slider; setting it to 0 and applying yields a page with no `WILD` badge.

*Done =* `/dev/feed` shows the two sliders and the readout's `wild` count moves with `tierWild`.

---

## Task 6 — Ingest the four blogs, one at a time

**Do not batch.** Each blog is a stop: read its ingest summary (topic histogram, un-homed count +
tag histogram, error count) before starting the next. Order is by confidence, cheapest lesson first.

Ben's budgets (09-06-26), applied to **posts** and converted to `walkQuota` in **items** with the
pictures-per-post multiplier from the 50-post probe (round up; the budget is a ceiling, and the
last post of a photoset should not be cut in half):

| order | blog | archive (posts) | budget | posts walked | pictures/post | **`walkQuota` (items)** | curation | curator download @1280 | `.cache/img` |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `sovietpostcards` | 25,784 | 50% | 12,900 | 1.34 | **17,500** | ~$4 | ~11 GB | ~2.6 GB |
| 2 | `70sscifiart` | 34,836 | 50% | 17,400 | 1.46 | **25,500** | ~$6 | ~17 GB | ~3.8 GB |
| 3 | `thevaultoftheatomicspaceage` | 37,494 | 50% | 18,750 | 1.0 | **19,000** | ~$4.5 | ~12 GB | ~2.8 GB |
| 4 | `thisisnthappiness` | 108,982 | 25% | 27,250 | 1.0 | **27,500** | ~$6.5 | ~18 GB | ~4.1 GB |
| | **total** | | | **76,300** | | **~89,500 items** | **~$21** | **~58 GB** | **~13.4 GB** |

Multipliers are from one page each and will move; the `walkQuota` numbers are the thing to keep,
the post counts are what they *mean*. Curation is $0.000235 × items; curator download is 649 KB ×
items at the 1280 rendition (see the optional `curationImageUrl` note below — it would cut that
column to roughly a fifth); `.cache/img` is ~150 KB × items on the VM volume, paid by
`bun run img:warm`. The handoff's "~43,600 rows / ~$10" was computed under the old floor and
without fan-out and is superseded. Every one of the four carries a `walkQuota`, so none of these
walks is ever `complete` and `--prune` can never act on them — the rest of each archive is a
later `--cursor` run.

**Corpus after all four: ~111,000 items against today's 21,892 — a 5× corpus, four-fifths of it
these blogs.** That is Ben's call, made knowing the number; the stop after each blog is where it
gets looked at on real pages.

Per blog:
- [ ] `bun run stats:walk <id> --quota 150` — the post-floor-change sample. Record `curated avg`, `≥8`, `un-homed %`, `topics (k/99)` in `blogs.ts`'s row comment and in the handoff table (§2, new column "post-floor").
- [ ] Remove the id from `SUSPENDED_SOURCES` (the "pending a verdict" group); update the comment block to say kept-and-walked with the date.
- [ ] Set the row's `walkQuota` from the table, then `bun run ingest --source <id>` with **no `--quota` flag** — the config bound applies, and the summary prints the resume cursor. Copy that cursor into the row's comment (`resume from --cursor N for the rest of the archive`). Expect wall-clock ≈ posts/50 s of walking plus curation at 8 concurrent.
- [ ] Read the summary. **Two things to check before the next blog:** (a) the topic histogram — if one topic took a large share of the blog (the streetartnews failure, `suspended-sources.ts`: "'Mythology' would stop meaning classical art"), stop and tell Ben; the fix is a per-source cap inside a topic, which is out of scope here and needs its own decision; (b) the un-homed line and its tag histogram.
- [ ] After blogs 1–2 and again after 4: `bun run mine:topics` → Ben ticks `docs/topic-proposals.md` → `bun run promote:topics --confirm` → `bun run graph:rebuild --confirm` → commit all three artifacts together.
- [ ] `bun run img:warm --dry-run`, then `bun run img:warm --rate 2` for the new source (Tumblr's CDN has not throttled in any round so far; if it 429s, chunk it the way the wikipedia note in CLAUDE.md describes).

*Done =* four rows in `SUSPENDED_SOURCES` gone (toiich moved to the parked-by-verdict group); `bun run stats:walk` numbers recorded on each `blogs.ts` row and in the handoff; `/dev/feed`'s session readout shows WILD cards from the new sources and, after promotion, grown topics carrying them.

**Before blog 1, one optional task that Ben should be asked about, not assumed:** the curator
fetches the stored `photo-url-1280` (mean 649 KB) purely to score it. Tumblr's v1 API also serves
`photo-url-500`, ~a fifth the bytes and plenty for a 1–10 score and four tags. Wiring it means an
optional `curationImageUrl?: string` on `NormalizedItem` (`sources/types.ts`), read by `scoreItem`
before `imageUrl`. That is an *additive* change to the cross-service `SourceAdapter` contract, which
CLAUDE.md says must be recorded in the Ambit-Admin log before it lands. It would cut the four blogs'
curator download from ~58 GB to ~12 GB, and a `regular` post's `srcset` offers the same ladder
(`s500x750`-class candidates), so both post types can supply it. Not required for correctness; a politeness and time
saving. Present the numbers, let Ben decide, do it only if he says so.

---

## Risks and the standing product question

- **Corpus balance — the one that matters.** After the four budgets the corpus is ~111,000
  items, ~89,500 of them from these blogs. The feed draws topic-first, and `topicCap` bounds any
  *topic* to three cards a page, so on `/feed` this shows up as *what each topic contains* rather
  than as raw share — a grown topic like `photography` or `illustration` can come to mean
  "thisisnthappiness" for every reader who drifts into it. There is no per-source cap inside a
  topic. Ben has said he is curating the pool by choosing the blogs and expects to like most of it;
  the stop after each blog in T6 is where that gets tested against real pages. If it bites, the
  follow-up is a per-source share cap within `pickItem` — a knob, one afternoon, its own plan.
- **Disk on the self-hosted VM is the constraint Ben named.** ~13 GB of `.cache/img` for the four
  budgets, on top of what the nine existing sources hold. Check the volume's free space before T6
  blog 1 (`df -h` on the cache mount; the volume name is in `PHASE8_WALKTHROUGH_8.1.md`) and put
  the number in the log. Lowering a budget is one number in `blogs.ts`; the resume cursor makes
  raising one later free.
- **Photoset near-duplicates.** Four stills from one film can now be four items. The
  no-adjacent-same-source rule keeps two of them from sitting side by side; nothing keeps two from
  landing on the same page. With pools of thousands the odds are small; if it shows up in the
  readout, a per-page "same post" guard (`sourceId` prefix before `:`) is a five-line addition to
  `composePage` — noted, not built.
- **The floor change is retroactive for the four already-walked blogs.** `doorofperception`,
  `thingsorganizedneatly`, `thisiscolossal` and `pdr` will, on their next walk, curate every image
  post the old floor dropped (a caption-less TON post was floored exactly like a vault post). That
  is the principle working ("walk sources ingest their whole corpus"), and it costs once through the
  cache — but the first nightly ingest on production after deploy will bill it. Run
  `bun run ingest --source thingsorganizedneatly --dry-run` locally before deploying and put the
  count in the log.
- **Look-descriptor topics.** Mining aesthetic tags will propose things like `muted palette`. The
  stopwords catch the obvious ones; Ben's tick catches the rest; the "kind of thing a person could
  be curious about" test in `topic-proposals.md` is the rule. Do not auto-promote anything.
- **WILD pool drift.** Between promotion rounds the un-homed pool is dominated by whichever blog
  landed last. The no-adjacent-same-source rule and the ~1-in-12 rate keep that from reading as a
  takeover; if it does, `tierWild` is the slider.
- **D10's split brain.** Items classified before T4 keep their sixteen-topic answers. `promote:topics`
  (tag containment, both columns after T3) is the backfill and it is manual. Say so in the log.

---

## Docs to update (same branch, same PR)

- `SPEC.md` §9: the tier list gains WILD with one sentence (draws the un-homed pool, taste-boosted,
  ~1 in 12), the Cut 1 note ("un-homed items are drawable only in the gallery rail's wildcard and
  by direct link") is rewritten; §6.2: the structural floor's walk-image exemption; §6.1: the
  caption-less card shape (image + blog credit + link, empty summary).
- `docs/DESIGN_topic-vocabulary-growth.md`: a dated **Amendment** block under §3 D4 and §5 — the
  feed *does* move for un-homed items (WILD), promotion remains the primary route; flip the §9
  property to "`composePage` returns an un-homed item **only** as a WILD card". Add mining of
  aesthetic tags to §11's Cut 2 bullet.
- `docs/PLAN_topic-vocabulary-cut2.md`: one line in Scope noting T3/T4 of this plan superseded
  "grown topics are never in the classifier's vocabulary".
- `docs/HANDOFF_tumblr-round3.md`: §0 status (five verdicts: four walked under the new floor to
  budgets, `toiich` parked 09-06),
  §2 table gets the post-floor column, §2.3's open question is **answered** (floor lifted for walk
  images) — say so and point here.
- `CLAUDE.md`: the Cut 1 sentence "the feed still reads `topic_id`, so un-homed items are invisible
  to it until Cut 2" → "…invisible except through the WILD tier (09-06-26)"; the local-dev note about
  `.cache/img` size; the dev-knob-panel bullet mentions the two new sliders.
- `src/server/config/suspended-sources.ts`: the five rows removed, the group comment rewritten.
- `docs/HANDOFF_tumblr-walk.md` (the Tumblr walk's own handoff): a dated note that the factory
  now fans out photosets (`sourceId` = `post:n`) and honours `walkQuota`; SPEC §6.1's blog bullet
  says the same in one sentence, plus that ingest prints a resume cursor and takes `--cursor`.
- `log.md` 09-06-26 entry: **Shipped / Decisions (D1–D10 in short) / Findings (the floor was the
  gate, not the topic step; mining never read aesthetic tags) / Open (corpus balance, per-source
  cap, `curationImageUrl`)**, plus the session-spend line per the CLAUDE.md rule.

---

## Verification (end to end)

1. `bun run test` — full suite green (expect the feed tier-mix test and `items.integration.test.ts:335` to have been rewritten on purpose; anything else red is a bug).
2. `bun run e2e` — including the new `/dev/feed` assertion. (Remember the `gallery.spec:193` flake note in CLAUDE.md; check `main` before believing it.)
3. `bun run build` — `/dev/feed` still 404s under a production build.
4. Manual, `FEED_DEBUG` on: `/feed` shows a `WILD` badge about once a page; save a WILD card → toast reads "Saved to X" with no drift line (unchanged, correct); the next pages' WILD cards skew toward that item's aesthetic tags (check tooltips / the panel's session readout).
5. `bun run bench:feed` — page compose stays in the ~22 ms band; `getWildPool` must not add more than a few ms (the partial index is what keeps it there — `EXPLAIN` it once and paste the plan in the walkthrough).
6. Refetch a cursor twice → identical page (the integration test does this; do it once by hand with a WILD card on the page).
7. After T6 blog 1: `/dev/feed` session readout over ~8 pages — note `wild` count, the core/grown split, and the source histogram; paste into the log.

---

## Handoff notes for the executing session

- Merge `feat/tumblr-blogs-round3` into `main` first (it is committed, not pushed; a
  tumblr-round3 session held the checkout on 09-05 — check nothing else is running on it).
- `.cache/curation` is warm for the 150-post samples of all nine blogs *under the old floor's
  survivors only*; the caption-less posts have never been curated and will bill.
- Never estimate the session spend line; run `python3 ~/.claude/scripts/session-spend.py --session <uuid>`.
- Write `docs/PHASE_WALKTHROUGH`-style notes only if something surprised you; the plan is the
  record otherwise.
