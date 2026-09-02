# Handoff — source-candidates round 2, mid-execution

**Written:** 09-01-26, end of the session that probed every remaining candidate and built the
first of them. **Updated the same night** by the session that took the verdicts and built the
WordPress factory — §1 and §2.1 are current as of that update; the rest of §2 is untouched.
**For:** a cold session continuing the work. **Status:** three blog adapters on `main`
(thingsorganizedneatly kept and walked, thisiscolossal kept and walked, mossandfog parked), the
`wp-rest` factory built, `bun run stats:walk` in `scripts/`; **no decisions outstanding**. Next
in the queue: streetartnews and spoon-tamago (§2.1, config rows now), then §2.2 onward. Read §1
and §2 before touching anything; §4 is the recipe that worked.

---

## 0. Start here — the next session's task: streetartnews and spoon-tamago

> **09-02-26:** Cut 1 of the vocabulary-growth design has merged. streetartnews' 42% "refusal" is now 63 *stored* items with a tag histogram; take its verdict on re-read evidence (`bun run ingest --source streetartnews --dry-run` on its branch after rebasing onto main), per the design's §13.

Two WordPress blogs, each a config row on the `wp-rest` factory. Everything below is
cold-executable in a cheaper session; the only stop is Ben's verdict on each sample. Read §3
(conventions) once; §1 and §2 are background.

**Model files** — copy, don't invent: `src/server/services/sources/mossandfog.ts` (the one-line
adapter), `mossandfog.test.ts` (the fixture test, including the HTML-safety loop), the
`mossandfog` row in `src/server/config/blogs.ts` (the robots comment's shape), and
`__fixtures__/mossandfog.json` (what a trimmed fixture row contains — only the fields `toItem`
reads, plus `tagNames`).

**Per blog, in this order** (do streetartnews first, then spoon-tamago; stop for the verdict
after each `stats:walk`):

1. **Robots, by hand, today.** `curl -s -A "Ambit/0.1" https://<host>/robots.txt`. Record what
   you saw and the date in the `blogs.ts` row comment. Probe facts from 09-01-26: streetartnews
   had no named-bot section at all (just `/wp-admin/`); spoon-tamago sits behind a Sucuri WAF
   that passed clean at 500 ms sequential. A `Disallow: /` for `*` is a Cut, never a workaround.
2. **Host.** streetartnews: pin the **bare** host (`https://streetartnews.net`) — `www` and bare
   are both live as separate canonicals; check which one `Location:` headers prefer before
   choosing. spoon-tamago: `https://www.spoon-tamago.com` — verify the redirect direction too.
3. **Fixture.** Fetch `/wp-json/wp/v2/posts?per_page=3&_embed=wp:featuredmedia` and the
   matching `/wp-json/wp/v2/tags?include=<ids>&_fields=id,name`, trim to the mossandfog shape,
   save as `__fixtures__/<id>.json`. Note `x-wp-total` / `x-wp-totalpages` from the posts
   response for the row comment (spoon-tamago 4,075 posts, streetartnews 9,505 at probe time).
4. **Registrations, five lines:** `SourceId` in `sources/types.ts`; `WALK_SOURCES` in
   `config/topics.ts`; the `BLOGS` row; `walkers` in `sources/index.ts` (plus its import);
   the fixture map in `source-invariants.test.ts`. Label: "StreetArtNews", "Spoon & Tamago".
5. **TDD:** write `<id>.test.ts` from the mossandfog one (assert the real title, link, host,
   attribution; keep the HTML-safety loop) — watch it fail on the missing module — then the
   one-line `<id>.ts`. `bunx vitest run src/server/services/sources/` then `bun run typecheck`,
   `bunx eslint <files>`, `bunx prettier --write <files>`.
6. **Live, politely:** `bun run probe:walk <id> --limit 5`, then
   `bun run ingest --source <id> --dry-run --quota 150` (cents), then
   `bun run stats:walk <id>` (free — reads the cache). Paste the stats block into the blog's
   `docs/source-candidates.md` row.
7. **Stop. Ben's verdict.** Keep → full walk `bun run ingest --source <id>` (lid open, plugged
   in, `nohup … & disown`; judge liveness by `netstat -anv -p tcp | grep bun:<pid>`, not the
   log — §1's findings), SPEC §6.1 bullet, row to ✅. Park → add to `SUSPENDED_SOURCES` with a
   comment like mossandfog's. Cut → delete the files, row to ❌ with the reason.

**Watch for:** streetartnews' topic drift (skateboarding news at probe time — the classify mode
refuses off-topic items; if the dry-run shows them classified anyway, say so at verdict time);
spoon-tamago's small images (`full` as low as 640×480 — fine for tiles, not heroes; the
`stats:walk` top/bottom titles won't show it, so open two `/i/` pages after a Keep). Both blogs
are excerpt-style WordPress like doorofperception, so expect the thin-summary floor to take
under 10%, not Tumblr's 60%.

**Commit shape:** plain branch `feat/wp-rest-<id>`, one commit per blog, `--no-ff` merge after
the verdict; `log.md` block with the spend line. Check `git branch --show-current` and
`git status` immediately before staging — another session may be on this checkout.

## 1. Where things stand

**Done, on `main`:** `docs/source-candidates.md` now carries a live probe result for every
candidate that was untried this morning — API sources and blog leads both, with a verdict
recommendation per row (`Round 2 (09-01-26)` in that file's trial-loop section is the summary).
Nothing was promoted to SPEC §6.1; the trial loop's own rule is adapter → sample → eyeball →
Ben's verdict, and only the first candidate has reached the sample.

**Done, on `main` (09-01-26, second session) — both decisions taken by Ben, both built:**
- **thingsorganizedneatly: Keep.** Branch merged `--no-ff` (`7bdac6e`), full walk written
  locally: 5,267 offered → 891 rows @ 7.90 avg, 71.8% ≥ 8 (SPEC §6.1 has the breakdown). Below
  the sample's projection because the archive thins with depth. Not yet on production — the
  nightly ingest there will walk it after the next deploy.
- **Walk sources are exempt from dup-title** (`d919ba0`, `structuralFloor` in `curator.ts`, two
  tests). The full walk dropped 0 on that rule.
- **`wp-rest.ts` factory** (`f7dd5dd`): `wpRestWalker(blog: BlogConfig)`. **doorofperception.ts
  is untouched by Ben's choice** — the factory's test proves it byte-identical to the bespoke
  adapter on that adapter's own fixture, so the two copies cannot drift silently. One deliberate
  difference: tag names resolve **lazily per page** (`include=`, 100 ids a request, memoized)
  because mossandfog has 27,567 tags and an up-front fetch is 276 requests before the first post.
- **thisiscolossal: Keep** (sample: 139 curated @ 8.65, 97% ≥ 8, 77% would insert — the strongest
  of any source). **mossandfog: Park** (136 @ 6.60, 41% ≥ 8, advertorial tail) — parked by adding
  it to `SUSPENDED_SOURCES`, the only switch that keeps a registered walker out of the nightly
  full ingest; an explicit `--source mossandfog` still runs, with a warning.
- **`bun run stats:walk <source> [--quota N]`** (`scripts/walk-stats.ts`) — the score-distribution
  report §4 asked for, permanent. Run it after the same source's `--dry-run` and it is free.

**Nothing is waiting on Ben.** The eyeball of thingsorganizedneatly rows in `/feed` and `/i/` was
left to him (a dev server was started for it); one cosmetic finding from the DB: derived titles
keep Tumblr prefixes such as `ed:` and `SUBMISSION:`.

**Findings from the thisiscolossal full walk (eight launches, one finish — read before running
another long ingest on the Mac):**
1. **A sleeping laptop freezes the run and kills its sockets on wake.** Every overnight attempt
   stalled the same way: hours with no progress, sockets to OpenRouter or Colossal established
   but silent. `pmset -g log` showed deep sleep on battery with dark wakes every few minutes;
   `caffeinate -i` does not hold a closed lid. Run long ingests with the lid open and power
   attached, or on the server.
2. **`fetchWithRetry` now has a per-attempt timeout** (`652e352`, default 60 s, `timeoutMs`
   to override) so a socket the far end has silently dropped is a failed attempt with backoff
   and a fresh connection, not a hang. **Still without one:** the curator's own image fetch and
   its OpenRouter call in `curator.ts` (`imageAsDataUrl`, `scoreItem`) — the sockets that
   actually hung overnight. Same fix, same shape; filed for 8.2 beside the other guardrails.
3. **The walk phase is silent for ~8.5 minutes on Colossal** (89 pages of 3.3 MB each at 4 s,
   plus tag lookups) and curation of 2000 px originals moves ~3 GB, so a healthy run prints
   nothing for a long time. Two runs were killed as "stalled" on that silence alone. Judge a run
   by `netstat -anv -p tcp | grep bun:<pid>` (rx/tx growing) or `nettop`, not by the log's
   mtime.
4. **Two Colossal heroes exceeded OpenRouter's 30 MB image limit** (animated GIFs; HTTP 413) and
   one call 502'd — three per-item curator errors in 8,732, counted and skipped. Whether the
   adapter should prefer a `media_details.sizes.large` rendition is a question for the next WP
   blog, not a defect.

**Also flagged for Ben, unrelated to any adapter:** `www.loc.gov/robots.txt` disallows
`/pictures/search` for `*`, and the *shipped* `loc.ts` adapter's endpoint lives under that path.
Recorded in the Chronicling America row of source-candidates.md; nobody has acted on it.

## 2. The queue, in the order Ben agreed to

Each entry: what is known (the evidence lives in the source-candidates row — this does not repeat
it), and the design question the entry carries. Every one of these is **bounded** work in the
brainstorming skill's sense — the flow exists in the repo already — so: read the sibling adapter,
ask the one or two questions that matter, present a short design in chat, get a yes, then TDD.

### 2.1 Four WordPress blogs — one design question, then four config rows

> **Status 09-01-26 (second session):** the design question is answered and built —
> `wp-rest.ts`, with doorofperception left bespoke by Ben's choice. **thisiscolossal** and
> **mossandfog** are done (Keep / Park, above). **streetartnews** and **spoon-tamago** remain:
> each is a `blogs.ts` row, a `SourceId` + `WALK_SOURCES` + `walkers` + invariants-fixture line,
> a one-line adapter file (copy `mossandfog.ts`), a recorded fixture and a test file (copy
> `mossandfog.test.ts`), then `probe:walk` → `--dry-run --quota 150` → `stats:walk` → verdict.
> The paragraphs below are the original brief, kept for the per-blog facts.

**thisiscolossal.com** (canonical host is `www.`; 8,817 posts; robots.txt names `ClaudeBot` in a
Cloudflare-templated list — Ben has seen this and it did not stop thingsorganizedneatly, whose
list was worse), **mossandfog.com** (7,537, daily, cleanest fit), **streetartnews.net** (9,505;
pin the *bare* host — `www` and bare are both live as separate canonicals; the top post at probe
time was skateboarding, so watch topic drift), **spoon-tamago.com** (4,075; already blurb-sized;
behind a Sucuri WAF that passed clean at a polite pace, so keep the 500 ms/sequential rule strict;
source images top out around 900×600).

**The design question:** `doorofperception.ts` is a bespoke file — `blogConfig("doorofperception")`
hard-coded, a per-process tag-name cache, the walk and `toItem` inline. It was written that way
on purpose ("YAGNI until blog #2", `blogs.ts`'s header). Four more WP blogs are blog #3–#6 of the
same shape. The obvious move is a `wp-rest.ts` factory — `wpRestWalker(blog: BlogConfig):
CorpusWalkAdapter<WpRaw>` — that doorofperception becomes the first caller of, with each new blog
one `blogs.ts` row plus one registration line. Things the factory has to keep from the
doorofperception file, each verified there: `_embed=wp:featuredmedia` with **no** `_fields=` (the
filtered form returns an empty embed); `x-wp-totalpages` as the walk length; the tag-name lookup
per blog (WordPress exposes tag ids on posts, names on a separate endpoint); the missing-featured-
image throw; `htmlToText` on `title.rendered` and `excerpt.rendered`. Per-blog: `baseUrl`,
`label`, `sourceId` (its own `SourceId` union member), and possibly the canonical-host rule.
Present that as the design and get a yes before touching doorofperception.ts — it is shipped code
with 318 rows behind it, and its fixture test must keep passing unchanged.

Then per blog: a `blogs.ts` row (with the dated robots.txt comment, like the two rows there now),
`SourceId` + `WALK_SOURCES` + `walkers` + `source-invariants.test.ts`'s fixture map, a recorded
fixture of two or three real posts, a `probe:walk`, a `--dry-run --quota 150`, the score stats
(§4), then stop for Ben's verdict — one or two blogs at a time, never all four unseen.

### 2.2 thisisnthappiness.com — Tumblr #2

Same legacy API as thingsorganizedneatly, on a custom domain (`baseUrl` is just different).
108,968 posts — a full walk is ~2,180 pages at 1 s, and the probe found it *more* caption-less
than thingsorganizedneatly, so most of it floors; sample with `--quota` first and expect to
discuss whether a walk that keeps 10% of 109k posts is worth 36 minutes of polite requests per
run. **The same factoring question as §2.1 applies to `things-organized-neatly.ts`**: its
`parseTumblrJson`, `nextCursor`, `firstImageUrl`, `deriveTitle` are already exported and pure;
a `tumblr.ts` factory over `BlogConfig` is the natural shape, and `BLOG_TAG` (the blog's own name
tag, filtered out) becomes per-blog config. Wait for the thingsorganizedneatly verdict before
building on it.

### 2.3 Europeana — search-shaped, keyed

The most trial-ready API source (its row has the evidence: live demo key `wskey=api2demo`,
`reusability=open` verified as a real query-time filter, single-call item shape). It is a
`SourceAdapter` (`search(q)` + `toItem`), and **`smithsonian.ts` is the file to mirror** — the
other keyed, aggregator, query-time-license-filter source, with the "filter, then re-check the
per-item rights field anyway" pattern that found 2 false positives in 400 there. Needs from Ben:
a personal API key (`pro.europeana.eu`'s signup is Cloudflare-gated to curl — a browser job; the
demo key's 1,000,000/hr is the shared pool, not a promise). Needs from the session: seed cells for
the sixteen topics in `topics.ts` (every trial source's cell is optional — an absent cell costs
nothing, a dishonest one costs taste), `attribution` built from `dataProvider`/`provider` rather
than "Europeana", `license` from the literal `rights` URI, and a few-hundred-row sweep of
`reusability=open` before trusting it at scale. `bun run probe <source> <query>` is the
search-shaped eyeball tool.

### 2.4 Openverse — search-shaped, no-auth, with a rate-limit catch

`license=cc0,pdm` verified against an unfiltered baseline; feed-ready shape (its `thumbnail` is
Openverse's own proxy, `attribution` is a ready-made string). Two things the row records that
matter before an adapter: **anonymous is 20/min and 200/day** — a full run over sixteen topics at
the usual quota is thousands of results, so either the free key (instant registration, but the
higher tier needs an email verification click — Ben's inbox) or a quota that fits under 200 a
day; and **uploader flooding** (two Flickr/Commons uploaders were 13 of the top 20 for one query).
There is no per-uploader diversity mechanism anywhere in ingest today — the feed has
no-adjacent-same-*source*, ingest has nothing — so that is a genuine design question, not a
config knob. `attribution` must name the uploader and the upstream (Flickr, Commons), not
"Openverse".

### 2.5 Chronicling America — extends the shipped LoC adapter

`loc.ts` is the model, same `fo=json` convention, but the differences are the design: there is no
`CLEARED_COLLECTIONS` equivalent because the per-result `rights` field is *absent*, so PD is a
hard `date` cutoff (the rolling 95-year line, ~1931 today) and it does real work — 71% of one
sample fell after it; OCR (`description[]`, inline in the hit) is garbled and the summary should be
synthesized from title/date/paper/place the way `locSummary()` already does for pictures; images
go through the same `tile.loc.gov` per-IP budget the LoC row already warns about, and
`full/full` 503s where `full/pct:50` works. The old `chroniclingamerica.loc.gov` host redirects;
the endpoint is `www.loc.gov/collections/chronicling-america/?q=<query>&fo=json`.

### 2.6 Not in the queue, recorded so nobody re-probes them

Parked with reasons in their rows: Rijksmuseum and BHL (Getty's Linked-Art-graph shape problem),
Harvard (no license filter, a ToU 2-week cache cap), Internet Archive (license mix, uploader
flood), DPLA (instant self-serve key, docs WAF-blocked — un-parking is one email and two
searches), Open Library / Wikiquote / Wikisource (the "curator has no rubric for text" wall,
SPEC §15), juxtapoz (Joomla, and interview journalism a link card would misrepresent). Cut:
Gutendex (Cloudflare JS challenge), lastmuseum.com (a search UI, not a blog), hyperallergic
(journalism — the most crawler-friendly site probed, cut on content fit regardless), Cooper
Hewitt (its own API 500s; the kept Smithsonian API already serves all 58,198 of its objects under
`unit_code:CHNDM` — a seed-query widening, not an adapter).

## 3. Conventions this thread followed — keep following them

- **Plain branch off `main`, merged back with `--no-ff`** (Ben's stated preference; every merge in
  this repo's history is a merge commit with a message). Never commit on `main` directly. Other
  sessions work in this same checkout — check `git status` before staging and stage files by
  name, never `git add -A`; `CLAUDE.md` and the PHASE8 docs have been another session's in-flight
  edits all day.
- **The trial loop is one or a few at a time**, with a stop for Ben's verdict before promotion —
  `docs/source-candidates.md`'s own rule, and the reason nothing here is marked ✅.
- **TDD, and the adapter's HTML-safety loop test** (`never lets HTML through in title or summary,
  on any fixture row`) — copy it into every new adapter test; it is what caught `&rsquo;`.
- **`toItem` stays pure and synchronous.** No LLM call inside an adapter, for any reason,
  including thin captions — thin captions floor. `docs/HANDOFF_tumblr-walk.md` §5.
- **Robots.txt is checked by the walker on every run** (`assertCrawlAllowed`), and recorded by a
  human in `blogs.ts` before designation (`robotsCheckedOn` plus a comment saying what was seen).
  A named-AI-bot list that does not name Ambit passes mechanically; a `Disallow: /` for `*` does
  not, ever (the artvee/50watts rule).
- **`log.md` gets a narrative block per session** with a spend line from
  `python3 ~/.claude/scripts/session-spend.py --session <uuid>`, never estimated (CLAUDE.md).

## 4. The recipe that worked (per adapter)

```sh
# 1. sample the real API before designing toItem — the newest page lies about the archive
#    (thingsorganizedneatly's first 20 posts were 80% `regular`; 200 across the archive were 81% `photo`)
# 2. record a fixture of real rows, trimmed of what toItem never reads; write the test; watch it fail
bunx vitest run src/server/services/sources/<adapter>.test.ts
# 3. implement; then every touched test file, then the gates
bun run typecheck && bunx eslint <files> && bunx prettier --check <files>
bun run test                      # ~35 s, 81 files; a red Postgres test usually means the machine is busy (CLAUDE.md)
# 4. live, politely
bun run scripts/probe-walk.ts <walker> --limit 5 [--cursor N]     # walk sources
bun run probe <source> <query>                                     # search sources
# 5. the trial sample — bills cents, writes nothing, and the curation cache makes a re-run free
bun run ingest --source <source> --dry-run --quota 150
```

**The ingest summary prints the topic histogram and the floor breakdown but NOT the score
distribution.** The 6.3 numbers came from DB rows after a real write. For a dry-run, the way that
worked: a throwaway script that re-walks the same items, floors them, calls
`curateItems(kept, { classify: true })` (cached, so free), and prints avg / min / max / ≥8 /
histogram, plus classified-vs-refused averages and the top and bottom titles with their aesthetic
tags — those last two are what make the eyeball possible without a UI. It was ~40 lines against
`walkers` (from `~/server/services/sources`) and `structuralFloor` / `curateItems` (from
`~/server/services/curator`); it lived in a scratch directory and is gone. If a third source needs
it, it belongs in `scripts/` as a `--stats` cousin of `probe-walk.ts` — a small, separate task.

## 5. Files

| path | why it matters |
|---|---|
| `docs/source-candidates.md` | every candidate's evidence and status — the source of truth for what is trial-ready |
| `docs/HANDOFF_tumblr-walk.md` | the built adapter's design and its §8 record; the model for how to write these |
| `src/server/services/sources/things-organized-neatly.ts` | the Tumblr walker (branch only until merged) |
| `src/server/services/sources/doorofperception.ts` | the WP-REST walker the four blogs generalize |
| `src/server/services/sources/smithsonian.ts` | the keyed, license-filtered search adapter Europeana mirrors |
| `src/server/services/sources/loc.ts` | the cleared-collections search adapter Chronicling America extends |
| `src/server/config/blogs.ts` | the designated-blog registry; one row per blog, robots.txt dated |
| `src/server/config/topics.ts` | `WALK_SOURCES`, `TRIAL_SOURCES`, and the seed cells a search source needs |
| `src/server/services/curator.ts` | `structuralFloor` (the dup-title decision lives here), `curateItems` |
| `scripts/probe-walk.ts`, `scripts/probe-adapter.ts`, `scripts/ingest.ts` | the three eyeball tools, in the order §4 uses them |
