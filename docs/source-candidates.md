# Ambit — Candidate Source APIs

> A curated **backlog** of public content APIs to trial as feed sources _after_ the MVP ships. These are **not** committed v1 sources — the committed set lives in `SPEC.md` §6.1. Add candidates here freely; promote one into the SPEC only after it passes the trial loop below.

## What makes a good Ambit source

Ambit's feed is public-domain / openly-licensed **images and short text** that normalize into the common `Item` schema (see SPEC §5.1). A candidate is worth trialing only if it clears this bar:

- **Item fit** — yields image items or short-text items (title + summary/lede). Not data feeds (weather, finance, sports).
- **License** — public domain (CC0) or open with clear attribution. Aggregators mix licenses — you must be able to _filter to PD/CC0/open at query time_.
- **Access** — no-auth or free API key; humane rate limits; ~$0 cost.
- **Density** — enough varied content across our topic chips to be worth an adapter.
- **Serendipity** — because relatedness is embeddings-led and **cross-source**, the real test is whether jumps _into and out of_ this source feel inspired, not just whether its own content is good.

## Trial loop (per candidate)

Adding a source is intentionally isolated — one `SourceAdapter` module, idempotent ingestion (SPEC §6.1). To trial one:

1. **Write the adapter** — `search(query)` + `toItem(raw)` → common `Item` shape.
2. **Ingest a sample** — run it against a handful of topic seed queries.
3. **Eyeball** — content density, the **curation-score distribution against the existing corpus**, image-fetch health, and the rendered surfaces (`/i/` for a few items, `/feed` under `FEED_DEBUG` for context). _(Updated 08-21-26: this step used to say "whether embedding nearest-neighbors across existing sources feel good", which predates Phase 0.4's pivot — item-level NN was tested and rejected, and nothing at request time touches embeddings. Score distributions plus rendered surfaces are the current-architecture version of the same question.)_
4. **Decide** — **Keep** (promote to SPEC §6.1, full seed cells, full ingest), **Park** (needs work — note why), or **Cut** (leave here struck through with the reason).

Trial one or a few at a time; **never batch-add without eyeballing**. Round 1 (Phase 6.2, 08-21-26) is the worked example: four candidates, a written evidence sheet, then a stop for Ben's four verdicts before anything was promoted — `docs/PHASE6_WALKTHROUGH_6.2.md`.

## Committed v1 sources (for reference — see SPEC §6.1)

Wikipedia · Met Museum · ~~Art Institute of Chicago~~ (suspended) · Cleveland Museum of Art · Wellcome Collection · `archive` (Ben's personal archive, Phase A.5) · **Smithsonian Open Access · Library of Congress · NASA Image Library** (promoted 08-21-26, Phase 6.2).

> **Corrected 08-20-26.** This line previously read "Wikipedia · Met · AIC · Smithsonian Open Access · Project Gutenberg / Wikisource · Wikiquote · NASA APOD · Public Domain Review", which was never the built set — it looks like an early draft that outlived the decision. Four of those eight have no adapter and are *candidates*, not commitments; treating Smithsonian as already-integrated is exactly the mistake this file exists to prevent. The real v1 set is the five in `server/services/sources/index.ts`.
>
> **AIC is suspended** as of 08-20-26 (`server/config/suspended-sources.ts`) — ingestion skips it and the feed won't draw its rows. Not a cut: the adapter and all 1,338 rows stay, and Phase 5.7's image proxy is expected to lift it. See SPEC §6.1.

## Candidates

Legend — **Type:** 🖼️ image · 📝 text · 🔀 both. **Auth:** none / key (free). **Status:** 🔵 untried · 🟡 parked · ✅ kept · ❌ cut.

| Source                                       | Type | License                    | Auth                       | Status | Why interesting / notes                                              |
| -------------------------------------------- | ---- | -------------------------- | -------------------------- | ------ | -------------------------------------------------------------------- |
| Cleveland Museum of Art Open Access          | 🖼️   | CC0                        | none                       | ✅     | **Kept — promoted to SPEC §6.1 (Phase 0.5 trial).** Friendliest API of the set: `limit` ≤1000, `cc0` flag, prose `description` on many objects. 1,638 items harvested, strong curation scores. |
| Rijksmuseum API                              | 🖼️   | Public domain (mostly)     | key                        | 🔵     | Enormous Dutch masters + object collection, high-res. Free key.      |
| Harvard Art Museums API                      | 🖼️   | Mixed — filter to open     | key                        | 🔵     | Deep metadata; must filter to open-access records.                   |
| Wellcome Collection API                      | 🔀   | Open (CC, filterable)      | none                       | ✅     | **Kept — promoted to SPEC §6.1 (Phase 0.5 trial).** History-of-science texture the art museums lack. Traps recorded in phase0/NOTES.md: thumbnail URL locked to 200px (rewrite the IIIF size segment); license per item (`cc-0,cc-by,pdm` filter + per-work check); thin summaries (many title-page stubs — the curator handles them). |
| Openverse API                                | 🖼️   | CC / PD (filterable)       | none (key = higher limits) | 🔵     | Aggregates openly-licensed images across sources — filter to CC0/PD. |
| NASA Image & Video Library (images.nasa.gov) | 🖼️   | Public domain              | none                       | ✅     | **Kept 08-21-26 — promoted to SPEC §6.1.** Trialed in place of APOD, which earlier BUILD_PLAN drafts named: the whole catalogue, no auth, versus one keyed image a day. 520 items @ 7.96 avg across six topics, clean images, no rewrite needed (renditions ship as explicit `links[]` with widths). **The licensing answer is "stated, not filtered"**: a 600-item survey found *no rights field of any kind*, so `license` is the literal `"Public domain (NASA)"` and `attribution` reproduces NASA's own credit line verbatim rather than flattening to the agency name. Exactly 2 of 600 credited a non-NASA party. Kept with that stated plainly rather than parked on it. |
| Library of Congress (loc.gov JSON)           | 🔀   | Mostly PD (check per-item) | none                       | ✅     | **Kept 08-21-26 — promoted to SPEC §6.1**, scoped to cleared collections. The 08-20 gap was confirmed, not closed: the per-result `rights` field is empty on every row. The adapter therefore never searches all of loc.gov — `CLEARED_COLLECTIONS` holds collections the Library has blanket-cleared, each carrying its rights statement **verbatim** ("No known restrictions on publication" for `mrg`, deliberately not upgraded to "public domain"), and every result's own `collection[]` membership is re-checked. **The verdict was about the pattern as much as the collection**: the list grows one verified rights statement at a time. First entry `mrg` (Margolies, 11,708 images) scored 8.52 avg at sample scale with every item ≥8 — the best in the corpus — and 7.98 across 376. One caution carried into SPEC §15: `tile.loc.gov` rate-limits by IP with no `Retry-After`, and a 334-image ingest tripped a sustained 429. |
| Chronicling America (LoC newspapers)         | 🔀   | Public domain              | none                       | 🔵     | Historic newspaper pages + OCR text — great "old world" texture.     |
| Internet Archive (advancedsearch + metadata) | 🔀   | Mixed — filter to PD/open  | none                       | 🔵     | Vast; needs careful license filtering, but huge density.             |
| Open Library API                             | 🔀   | Metadata open; covers vary | none                       | 🔵     | Book blurbs + cover images; pairs with Gutenberg.                    |
| PoetryDB                                     | 📝   | Public domain              | none                       | 🟡     | **Parked 08-21-26 — two fixable reasons, neither the poems' fault.** Adapter and tests stay in-repo; what it lacks is seed cells, so ingest never reaches it. (1) Summaries take the poem's first two lines and PoetryDB's `lines[]` includes epigraphs and dedications, so a card can lead with transliterated Greek. (2) **The curator has no rubric for text** — Pope and Seeger scored 4 against a prompt asking for "visually striking" images; the 5.50 average says more about the prompt than the corpus (SPEC §15). Un-parking = giving it cells again. API quirk worth keeping either way: `GET /lines/<kw>` **503s at any real result-set size** (nine keywords tested), so search is a two-step — `/lines/<kw>/title,author`, then per-poem hydration — and a no-match is a JSON *object* at HTTP 200. |
| Wikiquote API                                | 📝   | CC BY-SA                   | none                       | 🔵     | **Moved here 08-21-26 from BUILD_PLAN 6.2**, where it sat in a "remaining v1 adapters" list that the 08-20 correction established was never the committed set. Short quotations with attribution — cheap text items for the `poetry`/`mythology` end of the chip grid. Untried; note that CC BY-SA is share-alike, unlike anything in the v1 set. |
| Project Gutenberg / Wikisource               | 📝   | Public domain              | none                       | 🔵     | **Moved here 08-21-26 from BUILD_PLAN 6.2**, same reason. Full public-domain texts — the item-fit question is what a *feed-sized* item is when the source unit is a book, which is the same question PoetryDB answered badly and blogs will ask again. Worth trialing only after SPEC §15's "the curator has no rubric for text items" is settled. |
| Europeana API                                | 🔀   | Mixed — filter to open     | key                        | 🔵     | Aggregates EU cultural heritage; rich but license-heterogeneous.     |
| DPLA API                                     | 🔀   | Mixed — filter to open     | key                        | 🔵     | US cultural-heritage aggregator; key by request.                     |
| Biodiversity Heritage Library API            | 🔀   | Public domain              | key                        | 🔵     | Natural-history illustrations + text — beautiful, offbeat.           |
| **Smithsonian Open Access** (api.si.edu)     | 🔀   | CC0 (filterable)           | key (free, api.data.gov)   | ✅     | **Kept 08-21-26 — promoted to SPEC §6.1** (first run of the trial loop; evidence in `docs/PHASE6_WALKTHROUGH_6.2.md`). The 08-20 probe held up: `media_usage:"CC0"` is a query filter and 400/400 sampled rows carried `usage.access: "CC0"` — no per-item second call, the trap CMA and Wellcome each cost us. What the trial *added*: **2 of those 400 also carried `online_media_rights: ["Copyright protected/restricted"]`**, so both signals are re-checked; and the density question was answered — the specimen flood is real, 31% of offered items die at the structural floor, and seed vocabulary (never `specimen`, 5M rows) is what carries the cell. 1,529 items @ 7.73 avg, 14 of 16 topics. Real key raises the limit to 1,000/hr. |
| **Getty Museum** (data.getty.edu)            | 🖼️   | Open Content = PD, no restrictions | none                | 🟡     | **Parked — wants a design decision before an adapter.** Real and unauthenticated (verified 08-20-26: the SPARQL endpoint answers a CIDOC-CRM query with JSON results, and `/museum/collection/docs/` is live). But **it is a Linked Art / JSON-LD knowledge graph, not a search API** — objects are JSON-LD documents at UUID URLs, and free-text discovery goes through SPARQL. That fits *neither* blessed integration shape (search-shaped or corpus-walk, per CLAUDE.md's ecosystem section), so trialing it means either writing SPARQL that emulates `search(q)` or treating it as a corpus walk — a call to make deliberately, not mid-adapter. Content quality is not in doubt; the shape is. |
| Artvee                                       | 🖼️   | PD (curated)               | none — **no API**          | ❌     | **Cut 08-20-26.** Two independent reasons. There is no public API — it is a browsable site, so ingestion would mean scraping. And its `robots.txt` deploys the "Ultimate AI Block List v1.7", explicitly disallowing AI/agent user-agents. A source whose operator has stated that preference in machine-readable form is not one Ambit should be taking, and a hand-rolled scraper around it is worse. The underlying works are public domain and reachable through sources that *do* offer APIs — that is the route in, if the imagery is what appeals. |

## Leads, not sources (triaged 08-20-26)

Ben's 08-20 batch. Four of the thirteen URLs were APIs and moved into the table above (Smithsonian, Getty, Artvee, and the Margolies collection folded into the LoC row). The rest are **not sources** — they are magazine articles *about* collections, or essays. That distinction matters: an Open Culture post is a pointer, and the thing worth recording is the archive it points at, since that archive is what an adapter would talk to.

| Lead | What it actually points at | Verdict |
| ---- | -------------------------- | ------- |
| [Margolies roadside architecture](https://www.openculture.com/2026/07/free-photos-from-john-margolies-archive-of-americana-architecture.html) + [`loc.gov/pictures/?q=mrg`](https://www.loc.gov/pictures/search/?q=mrg&st=gallery) | **Library of Congress**, 11,708 images, "free to use and reuse". Same collection, two links. | ✅ Folded into the **LoC** row — this is its concrete first trial. |
| [Carl Jung's visionary art](https://www.openculture.com/2026/07/visionary-mystical-art-of-carl-jung.html) · [Jung on tarot](https://www.openculture.com/2023/10/carl-jung-on-the-power-of-tarot-cards.html) | *The Red Book / Liber Novus*. **Not public domain** — Jung died 1961 (so life+70 runs to ~2031), the facsimile was published by Norton in 2009, and the manuscript is estate-controlled. No institution offers it under an open license. | ❌ **Licensing trap.** Ambit's imagery bar is PD/CC0/open, and this clears none of it. Historic *tarot decks* are a separate matter — Waite–Smith (1909) is PD in the US and reachable via existing sources. |
| [Japanese woodblock prints of the body](https://www.openculture.com/2026/07/japanese-woodblock-prints-illustrate-the-human-body.html) · [1,300 wildlife illustrations](https://www.openculture.com/2026/07/explore-1300-beautiful-wildlife-illustrations-from-the-19th-century.html) | Both are 19th-c. institutional holdings of exactly the kind **Wellcome** (medical/anatomical) and **BHL** (natural history) already cover — Wellcome is a committed source, BHL an existing candidate. | 🟡 **No new adapter needed.** Treat as *seed-query* material: if this texture is missing from the feed, the fix is a better `seedQueries` cell on the sources we have, not a new source. Worth checking against the corpus before assuming it's absent. |
| [Long Now — Earthquake Lessons](https://sb.longnow.org/SB_homepage/Earthquake_Lessons.html) · [strategy+business 06109](https://www.strategy-business.com/article/06109) | Individual Stewart Brand essays on named sites. No API, no open license, single-author copyrighted work. | ❌ **Not a source.** Two essays is not a corpus, and neither site offers a licensed feed. If these are here as *taste* references — the register Ambit's text items should hit — that is a genuinely useful signal, but it belongs in the feel-tuning notes, not the adapter backlog. Worth confirming which was meant. |
| [Getty photographs](https://www.getty.edu/museum/photographs/) · [Getty Primo portal](https://primo.getty.edu/primo-explore/search?vid=GETTY_PORTAL) | Browse UIs over the same holdings as the Getty API row. Primo is the *library* catalogue (a discovery layer, not an open-image endpoint). | 🟡 Covered by the **Getty** row. The API, not the portal, is the integration surface. |

## Designated blogs (08-20-26)

> **These do not go through the trial loop above.** Blogs are not APIs: they are handled by the
> planned **blog-adapter family** (`SPEC.md` §6.1, `docs/BUILD_PLAN.md` step 6.3) — a shared scraper
> core plus per-blog config — and they are displayed as **link cards**: image or short excerpt,
> Ambit's own description, a blurb about the article, a `from: <blog>` credit, and a prominent link
> to the original. Ambit hosts no reformatted articles and makes no fair-use claim.
>
> **Their bar is different too:** not "does it have a filterable open-license API" but **scrape
> feasibility + the link-card posture** — is the content reachable politely, and is
> credit-plus-link-out an honest way to show it? **Scrape etiquette is a real gate, and there is
> already a worked precedent: artvee was cut** on 08-20-26 (see the Candidates table) because its
> `robots.txt` runs an AI block list. A site that machine-readably refuses agents does not become a
> designated blog just because the works it hosts are public domain.
>
> **The etiquette policy, as built (6.3, `docs/PHASE6_DESIGN_6.3.md` §8; enforced by `config/blogs.ts` and `services/sources/robots.ts`):**
> 1. `robots.txt` is checked before a blog is designated and **re-checked on every ingest run**; `Disallow: /` for `*` or for our agent aborts the walk and reports it.
> 2. Identify honestly — the shared `USER_AGENT`, which names Ambit and a contact.
> 3. Rate: ≥500 ms between requests, sequential per host.
> 4. Cadence: the ordinary ingest cron; no separate crawl schedule.
> 5. Removal on request: `bun run ingest --source <blog> --prune` for posts the blog has removed; a named item is a manual delete in FK order. No suspended-items mechanism — YAGNI for an invite-only app.

| Blog | Type | Posture | Status | Notes |
| ---- | ---- | ------- | ------ | ----- |
| **doorofperception.com** | image — art / visionary culture | Link card: credit + link out | **✅ Live (6.3, 08-27-26)** — WP REST corpus-walk adapter, 318 link cards, `body` null; the archive scrape below is retired by D2. *Earlier notes:* | The first corpus, and the reason the strategy exists. **11,572 images already on disk**, in `ambit-archive` under `storage/sources/doorofperception/`, with `index.csv` (11,584 rows: `file, post_slug, post_url, original_url, mime, downloaded`) as the **attribution source** — do not delete or regenerate it. Currently ingested as *archive* items; migrating them here retires 85% of the archive corpus. Sequenced after archive A.5/A.6 and after 6.3's design session, and it **owns the Ambit-side dedupe question**, since those items may already be in the corpus via the archive adapter. |
| **50watts.com** | image — book art, illustration, obscure design | Link card | **❌ Cut 08-25-26** — `User-agent: * / Disallow: /`, and its WP REST API 403s regardless of UA. The artvee rule. | Long-running curated blog with dense per-post image sets and real editorial writing — close to the exact texture the README's "old Tumblr art blogs" reference names. Scrape feasibility unchecked. |
| **thisiscolossal.com** | image — contemporary art & visual culture | Link card | Untried | High post volume, consistently strong imagery, and the most *current* of the set where the rest skew historical. Commercial site: check robots.txt and rate posture first. |
| **lastmuseum.com** | image — art | Link card | Untried | Unverified — confirm it is live and what it actually is before spending design time on it. |
| **thingsorganizedneatly.tumblr.com** | image — knolling / arranged objects | Link card | Untried — *probed 08-25-26:* Tumblr legacy `/api/read/json` → 200, so a **Tumblr-walk adapter**; the "nothing to blurb" edge case (an LLM-written summary at ingest) | Tumblr, so posts are short: image plus little or no article text. That makes it the useful **edge case** for open question 4 (where the blurb lives) — a blog with nothing to blurb still has to render as an honest link card. |
| **openculture.com** | both — aggregator | Link card, *but* | Parked | **An aggregator, not a primary source.** Its posts are pointers at some institution's archive — exactly the distinction the "Leads, not sources" table above draws — and crediting Open Culture for an image the Library of Congress holds is the wrong credit. May belong in the seeding list below rather than as a designated blog; decide at 6.3. |
| **Public Domain Review** | both — essays + PD imagery | Link card | Parked — *probed 08-25-26:* Gatsby, `/rss.xml` → 200 `application/xml`; an **RSS-walk adapter**, the next candidate | **Moved here from BUILD_PLAN 6.2 (08-20-26)**, where it sat as an API-adapter candidate carrying a "check API/RSS reality — may need scraping-lite or cutting" gate. That gate was always a blog question: PDR is an essay publication with public-domain imagery, so the link-card posture fits it better than an adapter would. Its own material being largely PD makes it the gentlest first test of the posture. |

### Single posts worth seeding

Individual articles, not whole blogs — the kind of thing that seeds one item or one topic rather than justifying an adapter. Kept here so they don't get lost in the raw dump.

- [Open Culture — 1.8 million free works of art from world-class museums (meta-list)](https://www.openculture.com/2016/05/1-8-million-free-works-of-art-from-world-class-museums-a-meta-list.html) — a list *of* archives; mine it for candidate APIs rather than ingesting it.
- The 08-20 batch's other Open Culture posts (Margolies, Jung, Japanese woodblock, wildlife illustrations) are triaged in the Leads table above — most point at institutions Ambit already reaches.


## Untriaged raw notes

_Older dump, kept as-is — not yet run through the bar above._

#
Cooper Hewitt, Smithsonian Design Museum
Metropolitan Museum of Art
Art institute of chicago
Art Search
some sort of place holder, should be local function maybe?
extinct animals api
free movie api
free uv index api
hacker news api
nga.goc national gallery
getty images
amazing endemic species
holidays api
wikipeida events on this day
old ass news papers - https://www.loc.gov/collections/chronicling-america/about-this-collection/technical-information/?__cf_chl_f_tk=FVL9obx3BUMLHxwLD0AD8XK9_vBQGDmSQkW3HtTvaPE-1783187592-1.0.1.1-Hf3AvZHnS1TsqKMlr1u9siaDH_ixpwIp_T0HdFaXfug
checkout out archive.org, maybe scrape some public info and stand up my own api?
