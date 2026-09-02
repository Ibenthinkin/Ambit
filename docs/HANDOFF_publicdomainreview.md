# Handoff — publicdomainreview.org as a source

> **Status 09-02-26:** built to `docs/PLAN_publicdomainreview.md` on `feat/pdr-walk` — adapter
> `src/server/services/sources/pdr.ts`, sampled (numbers in `docs/source-candidates.md`'s row).
> Scope widened by Ben on 09-02-26: Essays and both series are IN; §6.1 is closed; §6.2 is
> answered by `ReuseNotice`; §6.3 by the plan's §0.4 rights table. Verdict pending.
>
> The rest of this document is the original step-0 probe, kept as evidence. Where it disagrees with
> the plan's §0, the plan wins: §3's "only one is in scope" and §5's claim that an index carries
> `Excerpt` are both superseded.

**Written:** 09-02-26, from a live step-0 probe (no adapter written, nothing ingested — the same
"step 0" the round-2 candidates went through, `docs/source-candidates.md`'s trial loop). **For:** a
cold session (or a different model) picking this up to have the design conversation and build.
**Status:** three scope decisions are made below and are not open questions — build against them.
Everything else here is probe evidence and open technical design, in the shape the round-2
handoff (`docs/HANDOFF_sources-round2.md`) uses for its queue entries.

---

## 1. Decisions Ben has already made — do not re-litigate these

1. **Silence is permission.** The site has no `robots.txt` at all (404, not an empty-but-present
   file) and no `sitemap.xml` either. Ben's call: proceed as allowed. **No code change is needed
   for this** — `src/server/services/sources/robots.ts`'s `assertCrawlAllowed` already treats a
   404 or unreachable host as "no policy, walk proceeds" (its own docstring says so), which is
   what every existing walker already calls. This decision is Ben's sign-off on that default
   applying here, not a new carve-out — call `assertCrawlAllowed` exactly like
   `doorofperception.ts` / `wp-rest.ts` / `things-organized-neatly.ts` do, and it does the right
   thing already.
2. **Reproduce the text exactly.** PDR's own curatorial text (`Excerpt`, and the `Preamble` body —
   see §3 below) is licensed **CC BY-SA 4.0**, not the "rights retained, link out" shape every
   other blog in `blogs.ts` uses. Ben's call: use it verbatim anyway, now, while Ambit is
   invite-only and non-monetized — **and revisit if Ambit ever opens to the public**, since CC
   BY-SA's obligations (attribute the original author *and* PDR, publish under the same license,
   a specific boilerplate notice, no paywall) bite harder at public scale than they do here. This
   needs its own license string — `BLOG_LICENSE` in `blogs.ts` is the wrong constant to reuse,
   since its whole point is "rights retained, we assert nothing" and this is the opposite: a real,
   share-alike license PDR grants. See §5 for what that string and the attribution field should
   actually say, and the one open piece (the boilerplate notice) that reproducing the text
   verbatim does not by itself resolve.
3. **Don't scope to images. Take every collection, whatever its medium.** Collections split
   `Images` 560 / `Books` 434 / `Film` 159 / `Audio` 81 / `Animated GIF` 14 / `Class of...` 6 /
   `Mixed` 1 (of 1,255 total). Ben's call: ingest all of them. This works cleanly with Ambit's item
   shape because `Featured_Image_Path` is present on every collection regardless of `Medium` —
   even a Film or Audio collection has a poster/cover image — so `imageUrl` is never the blocker;
   `Medium`/`Theme` become tags, not a filter. **Essays (343, a structurally different content
   type — see §3) were not part of this instruction and are not covered by it — flagged as an open
   question in §6, not decided.**

## 2. What the site actually is

Gatsby 5.14.3, statically built, served from Netlify, with `pdr-assets.b-cdn.net` (Bunny CDN) as
the image host — not the museums' own servers, so none of the per-source-institution bot-blocking
this repo has hit elsewhere (LoC's `tile.loc.gov` budget, the AIC block) applies to fetching PDR's
own copies. It is **not WordPress** — `/wp-json/` 404s — so neither `wp-rest.ts` nor
`things-organized-neatly.ts`'s Tumblr shape is the model. The backing data looks like Airtable
(inferred from the JSON's `{"data": {...}}` wrapper on every record and table names like
`sources`, `indexCategories`), but that's invisible to an adapter — what matters is what Gatsby
exposes.

**The exploit: Gatsby's own build data is a free JSON API.** Every route `/foo/bar/` has a sibling
`/page-data/foo/bar/page-data.json` that returns exactly the props React was server-rendered with —
structured fields, no HTML scraping, no `_embed=` gymnastics. Confirmed against:

- `/page-data/collections/page-data.json` → **all 1,255 collections in one ~340KB response**, no
  pagination, no cursor. This is the best discovery mechanism of any source in this repo — every
  existing walker (WordPress, Tumblr, loupe) pages through the archive; this one hands over the
  whole index index in a single request.
- `/page-data/collection/<slug>/page-data.json` → one collection's full detail: `Preamble` (the
  body text), every embedded image with its own caption, and the `sources` edges carrying
  per-institution rights metadata (§4).
- `/page-data/essays/page-data.json` → all 343 essays' index the same way (not part of this trial;
  see §6).
- `/rss.xml` → live, but capped at 100 most-recent items across *both* essays and collections
  mixed — a recency feed, not a discovery mechanism for the archive.
- `/collections/2/`, `/collections/25/`, etc. → all 404. There is no server-side pagination to
  worry about; the one-shot index really is the whole thing.

## 3. Content shape — two types, and only one is in scope now

**Collections** (1,255, all in scope per decision 3) are image/media galleries:

- `Title`, `Slug`, `Excerpt` — a genuine one-sentence blurb, e.g. *"Photographs from when Atlantic
  City beaches featured artists ornately sculpting sand."* Feed-ready as-is.
- `Featured_Image_Path` — resolve against `site.siteMetadata.imageHost`
  (`https://pdr-assets.b-cdn.net`) to get the actual image URL. Present on every collection, every
  medium.
- `Preamble` — the real body text, multi-paragraph, with embedded `{image path=... alt=...
  caption=...}` blocks (a custom markup token, not HTML — needs its own stripped-down parser, not
  `htmlToText`) and inline `<i>`/`<a>` tags and Markdown-ish `*emphasis*` and `[^1]`-style footnote
  markers. This is the CC BY-SA text from decision 2.
- `Medium` (`Images`/`Books`/`Film`/`Audio`/`Animated GIF`/`Class of...`/`Mixed`) and `Theme`
  (36 values seen — `Animals & Beasts`, `Science & Medicine`, `Religion, Myth & Legend`, etc.) —
  natural `tags` candidates; `Theme` may also be useful signal for the curator's classify-mode
  topic assignment, the way blog posts get no seed cell and rely entirely on that (§4.3 of
  `docs/PHASE6_DESIGN_6.3.md`).
- `sources` — per-collection list of the named institution(s) whose material is featured, each
  with a real rights taxonomy (`Rights_Summary`, `Rights_Details_Group`, `Rights_Prose`,
  `Rights_License_URL`, `Rights_Profiles`) — see §4.

**Essays** (343, *not* in scope per decision 3's carve-out) are long-form scholarly writing —
thousands of words, one lead image, no per-paragraph rights labels ("just links to the original
source" per PDR's own reuse page). This is the same "curator has no rubric for text" wall already
on record against Wikisource, Open Library, and Wikiquote (SPEC §15, `docs/source-candidates.md`'s
rows for those three) — a lyric poem or a 2,000-word essay both lose against a prompt asking for
"visually striking... a genuine spark of *huh, I never knew that*." Whether that wall applies here
too, or whether an essay's `Intro` field (its own one-sentence teaser, structurally identical to a
collection's `Excerpt`) sidesteps it the way `doorofperception`'s link-card treatment sidestepped
SPEC §612's parked-poetry concern, is exactly the open question in §6 — worth raising explicitly
with Ben rather than assuming either way.

## 4. Licensing — this is the one place PDR is *stronger* evidence than most sources here

From `/reusing-material/` (PDR's own reuse policy page), quoted because it is the license design
has to satisfy:

> Material on our site can be broadly classified into two main types: i) historical public domain
> content, and ii) contemporary writing we publish in articles about this public domain content...
> For the historical content found in the Collections part of our site, we communicate to the best
> of our knowledge the rights status of both the underlying work and the digital copy of this
> work... All unquoted text in our Collections posts... [is] published under a Creative Commons
> Attribution-ShareAlike 4.0 licence (CC BY-SA).

Two separate rights regimes, both better-documented than most sources already in this repo:

- **The images**: genuinely public domain (the site's whole premise), and — unlike LoC's `rights`
  field, which is empty on every row, or AIC's now-broken image server — PDR attaches a **real,
  structured per-source rights taxonomy** to each collection's source institutions:
  `Rights_Summary` (seen: `"No Additional Rights"`), `Rights_Details_Group` (seen: `"Direct /
  Hands-off"`), `Rights_Prose` (seen: `'states "no known restrictions"'`), plus a
  `Rights_License_URL`. This is closer to Europeana's `reusability=open` or Smithsonian's
  per-item rights field than to anything blog-shaped — worth a filter analogous to LoC's
  `CLEARED_COLLECTIONS` if a sample turns up any institution whose rights language reads weaker
  than "no known restrictions," though nothing weaker was seen in the one collection probed in
  depth.
- **PDR's own text** (the `Excerpt`/`Preamble`): CC BY-SA 4.0, decision 2 above. The reuse page's
  exact terms if reused: attribute the original author, attribute The Public Domain Review, publish
  under the same licence, and — before the text — include *"This article / [Article Title] was
  originally published on The Public Domain Review [link] under a Creative Commons
  Attribution-ShareAlike... licence. If you wish to reuse it please see:
  https://publicdomainreview.org/reusing-material/"*. Decision 2 accepts using the text; it does
  **not** by itself decide whether Ambit's item detail view needs to render that boilerplate
  notice line, or whether `item.attribution` (which already renders as a visible credit on every
  item) discharges the "attribute the author and PDR" half well enough on its own. That's a real
  UI/copy decision, not a data-modeling one — flag it for whoever designs the item view treatment,
  separate from the adapter build.

Suggested field mapping (not binding, but a sane starting point):

```
attribution: "<contributor name(s)> — via The Public Domain Review"
license:     "CC BY-SA 4.0 — https://publicdomainreview.org/reusing-material/"
```

## 5. The open technical design question: `toItem()` must stay synchronous, and PDR's own data isn't

Every existing `CorpusWalkAdapter.toItem()` is pure and synchronous (`src/server/services/
sources/types.ts`'s own contract comment, and `docs/HANDOFF_sources-round2.md` §3's "toItem stays
pure and synchronous — no LLM call inside an adapter, for any reason"). PDR's **index** response
(`/page-data/collections/page-data.json`) only carries `Title`/`Excerpt`/`Slug`/
`Featured_Image_Path`/`Medium`/`Theme` — it does **not** carry `Preamble` or the per-source rights
data decision 2 and §4 both depend on. Getting those requires a **second fetch per collection**
(`/page-data/collection/<slug>/page-data.json`).

This doesn't need a contract change — `walk()` is already `async` and free to do more work per
page than a single HTTP call; only `toItem()` is constrained. The shape that fits:

1. `walk(cursor)` fetches (and, in-process, caches) the one-shot collections index on its first
   call — the same "fetch once, page from memory" pattern `mossandfog`'s tag-name lookup already
   uses for a different reason (`wp-rest.ts`'s per-blog tag cache, noted in `blogs.ts`'s header).
2. `cursor` becomes an **offset into that cached index** (opaque to ingest either way, per the
   contract) rather than a page number or an RSS-style timestamp.
3. For each of the `limit ?? default` collections in the current slice, `walk()` fetches that
   collection's detail page-data.json (politely — 500ms/sequential is the standing convention
   until this site gives a reason to relax it) and assembles a fully-hydrated `Raw` record —
   `Preamble`, the source rights fields, everything `toItem()` needs — *before* returning the page.
4. `toItem()` then stays exactly as synchronous as every other adapter's, reading off an
   already-complete `Raw`.

This makes the walk roughly 1,255 detail fetches total (plus one index fetch) — about ten minutes
at 500ms/sequential — cheaper in wall-clock than either blog Tumblr walk despite being a much
larger corpus, because there's no page-discovery overhead.

**Naming**: this isn't the WP-REST shape or the Tumblr shape — it's a third `CorpusWalkAdapter`
flavour (one-shot index + per-item detail hydration). `pdr.ts`, standalone, is probably right; it's
a genuinely different walker family, not a blog like the four in `blogs.ts` (PDR is a real
publication with an editorial staff and its own CC BY-SA license, not "rights retained" content —
it may not belong in `BLOGS`/`blogConfig()` at all, since that registry's whole header is about
what a *blog* gets under Ambit's roof, and PDR's licensing story in §4 is closer to a museum
source's than a blog's).

## 6. Open questions for whoever builds this — genuinely undecided, not this document's to decide

1. **Are Essays in scope?** Decision 3 addressed Collections' `Medium` field specifically (it was
   raised as "scope to Images only?" and answered "grab it all"); Essays are a separate content
   type this document recommends excluding on the existing SPEC §15 text-rubric grounds (§3 above)
   but that recommendation was not put to Ben and not answered by "grab it all." Ask before
   building an Essays path.
2. **The CC BY-SA boilerplate notice** — does an item's detail view need to render PDR's specific
   reuse notice text, or does `item.attribution` + `item.license` already discharge it? (§4, last
   paragraph.) A display/copy decision, separate from the adapter.
3. **Per-collection rights filtering** — is every collection's source-institution rights language
   at least as strong as "no known restrictions," or does a real sample turn up an institution
   with a weaker claim that should be excluded the way LoC's `CLEARED_COLLECTIONS` excludes
   everything outside its verified list? Needs a sample across more than the one collection probed
   here.
4. **Politeness rate** — Netlify + a CDN is a different infrastructure profile than a single
   WordPress host or Tumblr; 500ms/sequential is the safe default carried over from every other
   walker, but nothing here has tested whether PDR tolerates more.
5. **Where this registers** — `pdr` (or similar) needs a `SourceId` union member
   (`src/server/services/sources/types.ts`), a `WALK_SOURCES` entry (`src/server/config/
   topics.ts`), a `source-invariants.test.ts` fixture row, and — per open question 5 above — a
   decision on whether it belongs in `blogs.ts`'s `BLOGS` registry at all, or needs its own
   config file the way a museum source would.

## 7. The recipe, unchanged from round 2

Follow `docs/HANDOFF_sources-round2.md` §4 verbatim: fixture-first TDD, `bunx vitest run` on the
new adapter's test file, the full gates (`bun run typecheck && bunx eslint ... && bunx prettier
--check ...`, then `bun run test`), then live checks with `bun run scripts/probe-walk.ts` before
ever touching real ingest, then `bun run stats:walk pdr --quota 150` (the score-distribution tool
built for the round-2 verdicts, `scripts/walk-stats.ts`) before asking Ben for a Keep/Park/Cut —
same loop, same order, same stop before promotion.

## 8. Files

| path | why it matters |
|---|---|
| `src/server/services/sources/types.ts` | `CorpusWalkAdapter`, `NormalizedItem`, `WalkPage` — the contract §5 designs against |
| `src/server/services/sources/robots.ts` | `assertCrawlAllowed` already does what decision 1 asks — no change needed, just call it |
| `src/server/services/sources/wp-rest.ts`, `things-organized-neatly.ts` | the two existing walker families — PDR is neither, but both show the "cache once, page from memory" pattern §5 reuses |
| `src/server/config/blogs.ts` | the blog registry and its license/attribution shape — the thing decision 2 says NOT to reuse verbatim (open question 5) |
| `src/server/config/topics.ts` | `WALK_SOURCES`, `SourceId` — registration points |
| `src/server/services/curator.ts` | `structuralFloor`, `curateItems` — walk sources are already exempt from the dup-title rule (`d919ba0`), relevant since PDR collections may share titles across a series the way Andy Goldsworthy's did on Tumblr |
| `docs/HANDOFF_sources-round2.md` | the recipe (§4) and conventions (§3) this document inherits rather than repeats |
| SPEC §15 | "the curator has no rubric for text items" — the wall open question 1 is actually asking about |
