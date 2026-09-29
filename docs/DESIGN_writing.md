# Design — writing as a first-class part of Ambit (09-28-26)

Designed with Ben 09-28-26 by interview (Opus 5.5). Plan: `docs/PLAN_writing.md`. Branch: `feat/writing`.


## Context

Ben: "I literally never see Wikipedia articles anymore." Measured 09-28-26:

- **Share.** Articles are ~3.5k of ~208k production items (1.7%). The picture walks buried them. A 240-card local probe drew 4 Wikipedia cards.
- **Scoring.** `CURATOR_PROMPT` is an image-taste rubric. Wikipedia averages **5.2** against 7.5–8.7 for image sources, and a third of it sits at 4, which is the floor. `drawWeight` gives a 4 weight 1 against 15 for a 9.
- **Sourcing.** Wikipedia gets one generic keyword per original topic ("botany"), which returns definition pages (*Pedicel (botany)*). The 144 grown topics get no Wikipedia queries at all.
- **Bug.** **None of production's 3,191 Wikipedia rows has a body.** Ingest never calls `fetchBody`. `scripts/backfill-wikipedia-bodies.ts` was only ever run locally, where 2,169 of 2,170 have one. On the live site a tapped card shows one paragraph.
- **Blocked sources.** The same missing text rubric parked PoetryDB (SPEC §6's `poetrydb` bullet; the rubric gap itself is SPEC §15's 08-21-26 item) and is one of the reasons Open Library, Wikiquote and Wikisource sit in `docs/source-candidates.md`.

Ben wants writing to be a real, visibly distinct part of the feed. That means Wikipedia fixed and re-sourced, and contemporary arts and culture writing and long reads added. The feed must stay **news-free**: not a breaking-news aggregator and nothing in the 24-hour cycle. Longform contemporary journalism from reputable outlets is fine.

## Decisions from the interview (settled)

| # | Decision |
|---|---|
| D1 | A separate **writing curator** for `type = 'article'`. Ben calibrates it by rating ~40 pieces **before** any re-score. News-free is judged by taste: the curator gives a `timeliness` verdict, and `news` is dropped. |
| D2 | Every writing item carries a **kind**: `essay` (Essay / long read), `curiosity`, `criticism` (Criticism & profile), `archive` (Poem & archive). It also carries tags and topic memberships like images do, plus a **reading time**. |
| D3 | About **1 in 8** feed cards is writing (1–2 per 12-card page). |
| D4 | **Wikipedia** gets bodies at ingest plus a production backfill. It is sourced from the Unusual articles list, Did-you-know archives, and the Featured/Good lists, **plus a Ben-editable module of reading search phrases** (`src/server/config/reading-phrases.ts` — a typed `.ts` like `blogs.ts`, decided 09-28-26) that replaces the `wikipedia` cells in `seedQueries`. |
| D5 | **Cards.** Writing with a picture gets a picture-led tile with a `READ · 12 MIN` badge and title. Writing without one keeps the text card with the same label. |
| D6 | **Publications are link cards**, Aeon/Psyche included. Each gets its lead image, its own dek/RSS description only, a `from:` credit and a prominent link. The full text is used at ingest for scoring only and never stored. Removal on request. Candidates: Aeon, Psyche, Atlas Obscura, JSTOR Daily, Longreads, The Marginalian, Hyperallergic, Paris Review, Noema. |
| D7 | Order: **curator → Wikipedia → feed share → cards → publications**. Each phase can ship on its own. |
| D8 | **Out of scope, filed for later:** the text reading experience, including reading in the desktop magazine/spread mode. This plan adds only the link-out row on the reader page. |

**Defaults I've chosen (Ben can override on review):**
- The picture badge shows the kind: `ESSAY · 12 MIN`, `CURIOSITY · 3 MIN`.
- Anything over 30 minutes reads `LONG READ`.
- Loupe is re-scored by the writing curator like the rest; its 4.48 is image-rubric noise.
- Paywalled or truncated feeds get NULL minutes and no page fetch.
- Wikipedia lead images derived from SVG files (flags, logos, maps) render as text cards, not picture tiles.

**Reviewed 09-28-26 (Fable) against the code**: the shape holds; the plan's code-facing claims were corrected in place (`PLAN_writing.md`, and its new "Decide before the phase that needs it" list). One fact worth stating here because the plan leans on it: **blogs are `type: "image"`** (invariant-tested), so "writing ≡ `type = 'article'`" reaches Wikipedia, PDR's essays, Loupe's clippings and PoetryDB — never a link card.

