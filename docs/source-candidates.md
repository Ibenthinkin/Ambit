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
3. **Eyeball** — content density + whether embedding nearest-neighbors _across existing sources_ feel good (cross-source jumps in/out).
4. **Decide** — **Keep** (promote to SPEC §6.1 + a Phase 4 adapter), **Park** (needs work — note why), or **Cut** (leave here struck through with the reason).

Trial one or a few at a time; never batch-add without eyeballing the cross-source graph impact.

## Committed v1 sources (for reference — see SPEC §6.1)

Wikipedia · Met Museum · ~~Art Institute of Chicago~~ (suspended) · Cleveland Museum of Art · Wellcome Collection.

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
| NASA Image & Video Library (images.nasa.gov) | 🖼️   | Public domain              | none                       | 🔵     | Distinct from APOD — full NASA media catalog.                        |
| Library of Congress (loc.gov JSON)           | 🔀   | Mostly PD (check per-item) | none                       | 🟡     | **Parked — promising, one gap.** Probed 08-20-26: `?fo=json` on any `/pictures/search/` URL returns JSON, no auth, and results carry a ready-to-use `image.full` on `tile.loc.gov`. Concrete entry point Ben found: **the John Margolies roadside-architecture archive, `?q=mrg` — 11,708 images, LoC-designated "free to use and reuse"** since 2017, staff-added subject/geo headings. The gap: the per-result `rights` field came back **empty** on every row sampled, so PD status is *not* readable from the search response — an adapter has to either scope itself to collections LoC has blanket-cleared (like `mrg`) or make a second per-item call. Scoping to cleared collections is the cheaper first trial and fits `search(q)` shape fine. |
| Chronicling America (LoC newspapers)         | 🔀   | Public domain              | none                       | 🔵     | Historic newspaper pages + OCR text — great "old world" texture.     |
| Internet Archive (advancedsearch + metadata) | 🔀   | Mixed — filter to PD/open  | none                       | 🔵     | Vast; needs careful license filtering, but huge density.             |
| Open Library API                             | 🔀   | Metadata open; covers vary | none                       | 🔵     | Book blurbs + cover images; pairs with Gutenberg.                    |
| PoetryDB                                     | 📝   | Public domain              | none                       | 🔵     | Full public-domain poems, no auth — pure text serendipity.           |
| Europeana API                                | 🔀   | Mixed — filter to open     | key                        | 🔵     | Aggregates EU cultural heritage; rich but license-heterogeneous.     |
| DPLA API                                     | 🔀   | Mixed — filter to open     | key                        | 🔵     | US cultural-heritage aggregator; key by request.                     |
| Biodiversity Heritage Library API            | 🔀   | Public domain              | key                        | 🔵     | Natural-history illustrations + text — beautiful, offbeat.           |
| **Smithsonian Open Access** (api.si.edu)     | 🔀   | CC0 (filterable)           | key (free, api.data.gov)   | 🟡     | **Parked — strongest untried candidate of Ben's batch; trial next.** Probed live 08-20-26 with `DEMO_KEY`: `media_usage:CC0` + `online_media_type:"Images"` returns **5,237,894 rows**, and every sampled item carried `usage.access: "CC0"` — i.e. the license filter Ambit needs is a *query parameter*, not a per-item second call, which is the trap CMA and Wellcome each cost us. Plain `search(q)` shape, so it fits the blessed search-shaped pattern with no invention. Density is the open question, not licensing: 5.2M items skew heavily to specimen and archival records, so the trial should check how much survives the curator's floor rather than how much exists. `x-ratelimit-limit: 10` on DEMO_KEY; a real api.data.gov key raises it. |
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
> Nothing here is built. The v1 design session (6.3) owes seven answers before any adapter exists.

| Blog | Type | Posture | Status | Notes |
| ---- | ---- | ------- | ------ | ----- |
| **doorofperception.com** | image — art / visionary culture | Link card: credit + link out | **Scrape complete** | The first corpus, and the reason the strategy exists. **11,572 images already on disk**, in `ambit-archive` under `storage/sources/doorofperception/`, with `index.csv` (11,584 rows: `file, post_slug, post_url, original_url, mime, downloaded`) as the **attribution source** — do not delete or regenerate it. Currently ingested as *archive* items; migrating them here retires 85% of the archive corpus. Sequenced after archive A.5/A.6 and after 6.3's design session, and it **owns the Ambit-side dedupe question**, since those items may already be in the corpus via the archive adapter. |
| **50watts.com** | image — book art, illustration, obscure design | Link card | Untried | Long-running curated blog with dense per-post image sets and real editorial writing — close to the exact texture the README's "old Tumblr art blogs" reference names. Scrape feasibility unchecked. |
| **thisiscolossal.com** | image — contemporary art & visual culture | Link card | Untried | High post volume, consistently strong imagery, and the most *current* of the set where the rest skew historical. Commercial site: check robots.txt and rate posture first. |
| **lastmuseum.com** | image — art | Link card | Untried | Unverified — confirm it is live and what it actually is before spending design time on it. |
| **thingsorganizedneatly.tumblr.com** | image — knolling / arranged objects | Link card | Untried | Tumblr, so posts are short: image plus little or no article text. That makes it the useful **edge case** for open question 4 (where the blurb lives) — a blog with nothing to blurb still has to render as an honest link card. |
| **openculture.com** | both — aggregator | Link card, *but* | Parked | **An aggregator, not a primary source.** Its posts are pointers at some institution's archive — exactly the distinction the "Leads, not sources" table above draws — and crediting Open Culture for an image the Library of Congress holds is the wrong credit. May belong in the seeding list below rather than as a designated blog; decide at 6.3. |
| **Public Domain Review** | both — essays + PD imagery | Link card | Parked | **Moved here from BUILD_PLAN 6.2 (08-20-26)**, where it sat as an API-adapter candidate carrying a "check API/RSS reality — may need scraping-lite or cutting" gate. That gate was always a blog question: PDR is an essay publication with public-domain imagery, so the link-card posture fits it better than an adapter would. Its own material being largely PD makes it the gentlest first test of the posture. |

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
