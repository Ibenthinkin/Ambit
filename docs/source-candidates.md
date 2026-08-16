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

Wikipedia · Met Museum · Art Institute of Chicago · Smithsonian Open Access · Project Gutenberg / Wikisource · Wikiquote · NASA APOD · Public Domain Review.

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
| Library of Congress (loc.gov JSON)           | 🔀   | Mostly PD (check per-item) | none                       | 🔵     | Photos, prints, maps, ephemera + text. Rate-limited.                 |
| Chronicling America (LoC newspapers)         | 🔀   | Public domain              | none                       | 🔵     | Historic newspaper pages + OCR text — great "old world" texture.     |
| Internet Archive (advancedsearch + metadata) | 🔀   | Mixed — filter to PD/open  | none                       | 🔵     | Vast; needs careful license filtering, but huge density.             |
| Open Library API                             | 🔀   | Metadata open; covers vary | none                       | 🔵     | Book blurbs + cover images; pairs with Gutenberg.                    |
| PoetryDB                                     | 📝   | Public domain              | none                       | 🔵     | Full public-domain poems, no auth — pure text serendipity.           |
| Europeana API                                | 🔀   | Mixed — filter to open     | key                        | 🔵     | Aggregates EU cultural heritage; rich but license-heterogeneous.     |
| DPLA API                                     | 🔀   | Mixed — filter to open     | key                        | 🔵     | US cultural-heritage aggregator; key by request.                     |
| Biodiversity Heritage Library API            | 🔀   | Public domain              | key                        | 🔵     | Natural-history illustrations + text — beautiful, offbeat.           |

https://50watts.com/
https://www.openculture.com/2016/05/1-8-million-free-works-of-art-from-world-class-museums-a-meta-list.html

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
wallhaven - wallpapers
amazin endemic species
behane somehow?
holidays api
scraping Door or perceptions
wikipeida events on this day
old ass news papers - https://www.loc.gov/collections/chronicling-america/about-this-collection/technical-information/?__cf_chl_f_tk=FVL9obx3BUMLHxwLD0AD8XK9_vBQGDmSQkW3HtTvaPE-1783187592-1.0.1.1-Hf3AvZHnS1TsqKMlr1u9siaDH_ixpwIp_T0HdFaXfug
checkout out archive.org, maybe scrape some public info and stand up my own api?



Art Images from Museums & Libraries

    Art Institute of Chicago (44,000 images)
    Google Art Project (250,000)
    Harvard Bauhaus Collection (30,000)
    L.A. County Museum (20,000)
    New York Public Library-Historic Maps (20,000)
    Norway National Museum (30,000)
    Paris Art Museums (300,000)
    SFMoMA Rauschenberg Collection
    Stanford University’s Cantor Art Center (45,000)
    Stanford University’s French Revolution Collection (14,000)
    Taipei’s National Palace Museum (70,000)
    The British Library (100,000)
    The British Museum (4,200)
    The Cleveland Museum of Art (30,000)
    The Isamu Noguchi Museum (60,000)
    The Getty (100,000)
    The Guggenheim (1,600)
    The Met (400,000)
    The Morgan Library & Museum’s Online Collection (10,000)
    The Morgan Library Rembrandt Sketches (300)
    The Museum of Modern Art/MoMA  (65,000)
    The Museum of New Zealand (30,000)
    The National Gallery (35,000)
    The New York Public Library: Photos, Maps, Letters (180,000)
    The Rijksmuseum (210,00)
    The Smithsonian (40,000)
    The Tate (70,000)
    The Whitney (21,000)
    The Van Gogh Museum (3500)
    Yale Center for British Art
    Yale’s Great Depression Photo Collection (170,000)
    Vermeer (36)

Art Books

    The Getty (250 books)
    The Guggenheim (98)
    The Met (448)
    Getty Research Portal (100,000)


https://www.thisiscolossal.com/
https://lastmuseum.com/
https://thingsorganizedneatly.tumblr.com/
