# Phase 0 — findings

Working notes from the Phase 0 validation steps. Throwaway code, durable conclusions.
Decisions that survive get promoted into `SPEC.md`; see `docs/BUILD_PLAN.md` §Phase 0.

---

## 0.2 — Sample harvester

`bun run phase0/harvest.ts` → **416 items** (160 article / 256 image) across 8 topic
seeds and 3 sources, written to `phase0/items.json`. Zero dependencies; responses cached
under `phase0/.cache/` (gitignored) so 0.3/0.4 can iterate without re-hitting the APIs.

| Source | Items | Median summary | Median tags | With image |
|---|---|---|---|---|
| Wikipedia | 160 | 591 chars | 3 | 112 / 160 |
| Met | 135 | 137 chars | 5 | 135 / 135 |
| AIC | 121 | 310 chars | 13 | 121 / 121 |

### Density — kept / offered by search

Cap was 20 items per source per topic.

| Topic | Wikipedia | Met | AIC |
|---|---|---|---|
| Astronomy | 20 / 30* | 20 / 148 | 20 / 60* |
| Botany | 20 / 30* | 20 / 318 | 20 / 60* |
| Machines | 20 / 30* | 16 / 3900 | 20 / 60* |
| Mythology | 20 / 30* | 20 / 1236 | 20 / 60* |
| The ocean | 20 / 30* | 14 / 1054 | 20 / 60* |
| Typography | 20 / 30* | 5 / 39 | **0 / 60*** |
| Ancient history | 20 / 30* | 20 / 11666 | 20 / 60* |
| Poetry | 20 / 30* | 20 / 1928 | 20 / 60* |

\* Not a density measurement — Wikipedia and AIC "offered" is just the `srlimit`/`limit` I
asked for. Only the Met column reports a true corpus total. (Wikipedia's real `totalhits`
for `astronomy` is 43,317.) **Verdict: density is a non-issue for v1** — every topic × source
pair except AIC/Typography could fill its quota many times over. The binding constraint is
*quality and licensing*, not volume.

### Density red flags

- **AIC + "typography" returns 0 usable items.** All 60 hits are in-copyright 20th-century
  photography (`is_public_domain: false` on every one). Not a bug and not an empty collection —
  the query term lands on the wrong stratum. Abstract/design topics need object-vocabulary seed
  queries against museums (`type specimen`, `letterpress`, `broadside`), which is exactly what
  `topic.seed_queries` (SPEC §5.2, per-source) exists for. **Budget real time for seed-query
  tuning in step 2.3** — one term per topic will not work across sources.
- **The Met's `isPublicDomain=true` search filter is not honored.** Of the first 20 `machine`
  hits, **14 are not public domain**; for `ocean`, 9 of 20. Every object must be re-checked on
  its own record. Consequence for **3.2**: the Met costs ~2–3× object fetches per kept item, and
  an adapter that trusts the search filter will ingest copyrighted images. Non-negotiable check.
- **Met object 913417 is in the search index but 404s on fetch.** Dead rows exist; ingestion
  must isolate per-item failures (already required by 3.4) rather than abort the batch.
- Met search *silently rate-limits with HTTP 403*, not 429. It clears after a pause. At ~2.5 req/s
  (`MET_DELAY_MS = 400`) a full run is clean. This bit me: the first run showed
  `Typography 0/0`, `Ancient history 0/0`, `Poetry 0/0` — which looks exactly like "no content"
  but was three dropped searches. Real totals are 39 / 11,666 / 1,928. The harvester now reports
  a failed search as `ERR`, never as a zero.

### Quality — the finding that matters for 0.3/0.4

**Text volume is wildly asymmetric across sources, and museum text is about the wrong thing.**

Since `title + summary` is what gets embedded (SPEC §6.2), compare what the three sources
actually hand the embedding model for their respective "Astronomy" items:

- **Wikipedia** (591 chars, prose): *"Astronomy is a natural science that studies celestial
  objects and the phenomena that occur in the cosmos…"* — dense subject matter.
- **Met** (137 chars, catalogue fields): *"Giambologna, Netherlandish, Douai 1529–1608 Florence.
  17th century. Bronze. Sculpture-Bronze. European Sculpture and Decorative Arts collection.
  Female Nudes, Astronomy"*
- **AIC** (310 chars): *"Eloy Bonnejonne (Flemish, c. 1630-1695)… Etching printed in black on
  paper. Flanders. print. Prints and Drawings collection. print, paper (fiber product)…"*

Museum objects carry **no prose description at all**. Their summary here is synthesized from
catalogue fields, and it is dominated by *artist, date, medium, and department* — with the
actual **subject buried last, in the tags** (`Female Nudes, Astronomy`). AIC is worse: its
`term_titles` are largely material vocabulary (`paper (fiber product)`), and its `thumbnail.alt_text`
is boilerplate (*"A work made of etching printed in black on paper"*), so it was excluded from
the summary rather than allowed to pollute the vector.

**The risk this creates for 0.4, stated plainly:** cross-source nearest neighbors may cluster on
**medium** ("everything made of bronze") rather than **subject** ("everything about the stars").
That would produce a feed that is technically serendipitous and experientially dull — and it is a
failure mode of *how we build the embedding text*, not of the embedding model. If 0.4's side-by-side
looks bad, **re-order the summary to lead with subject/tags before testing a different model.**
Cheap lever, and it should be pulled first.

Corollary: `phase0/embed.ts` (0.3) keeps summary construction swappable so 0.4 compares
*summary recipes*, not just models. This is why 0.3 became **2 models × 2 recipes**:
recipe **A** = `title + "\n" + summary` as harvested; recipe **B** = subject-first, leading with
`title + tags` ahead of the catalogue fields.

**Provider decision (post-0.2):** embeddings go through **OpenRouter** — candidates
`openai/text-embedding-3-small` (1536-dim) and `baai/bge-m3` (1024-dim). The local
`bge-small` option was dropped: embeddings are computed at ingestion only, so a managed
provider never touches the request path, and the corpus costs ~$0.002 to embed. See SPEC §6.2.

### Other notes for the real adapters (0.2)

- **Wikipedia's `cllimit` is a per-query budget, not per-page.** With `cllimit=20` over a
  20-page batch, page one takes all 20 categories and the other 19 get none. Only `cllimit=max`
  gives every page its tags. Silent, and it made tags look uniformly empty on the first run.
  Same trap will exist in the 3.1 adapter.
- Wikipedia search needs a quality filter: `List of…` / `Index of…` / `Outline of…` /
  `(disambiguation)` titles, plus a minimum extract length (200 chars) to drop stubs.
- **48 of 160 Wikipedia articles have no lead image** (30%). Article cards must look good
  without one — matches the design handoff's text-only ArticleCard.
- **Wikipedia licensing is not uniform.** Article *text* is CC BY-SA 4.0, but the lead image
  carries its own per-file license that the REST/action summary surface doesn't expose. Items
  here are stamped `CC BY-SA 4.0 (text)`. Before shipping Wikipedia images, 3.1 must resolve
  per-image licensing (`prop=imageinfo&iiprop=extmetadata`) or the app must not render them.
  Met and AIC are unambiguous CC0 once the per-object public-domain flag is verified.
- IIIF image URLs for AIC are constructed, not returned. The `config.iiif_url` field in every
  response is the base to trust. **Use size `!843,843` (fit-in-box), not the docs' `843,`** —
  a plain width request 403s on any original narrower than 843px (IIIF servers reject
  upscales; found in 0.4 when ~7% of AIC thumbnails came back 403). Trap recurs in the 3.2 adapter.
- 19 items surfaced under two different topic seeds and were collapsed on `(source, sourceId)` —
  the same key SPEC §5.1 makes unique. Confirms the real ingestion upsert will be idempotent.

---

## 0.3 — Embed: 2 models × 2 recipes

`bun run phase0/embed.ts` → **4 vector sets** (416 vectors each) under `phase0/vectors/`
(gitignored — ~19 MB total, fully reproducible from `items.json` + the script). Each file is
`{ model, recipe, dim, promptTokens, elapsedMs, vectors: { "source:sourceId": number[] } }`,
floats rounded to 6 decimals. Recipe **A** = `title + "\n" + summary` as harvested; recipe
**B** = subject-first (`title \n tags \n summary`), applied uniformly to all sources.

### Timing / cost (the "rough numbers" 0.3 owed)

| Set | Dim | Tokens | Wall time |
|---|---|---|---|
| text-embedding-3-small × A | 1536 | 38,663 | 6.6s |
| text-embedding-3-small × B | 1536 | 50,652 | 6.0s |
| bge-m3 × A | 1024 | 43,585 | 75.7s |
| bge-m3 × B | 1024 | 57,407 | 38.3s |

- **Cost ≈ $0.003 for the whole run** (verified via OpenRouter's `usage: {include: true}`
  accounting: text-embedding-3-small = $0.02/M tokens, bge-m3 = $0.01/M). Cost is a
  non-factor in the 0.4 model decision.
- **bge-m3 is ~10× slower through OpenRouter** (its upstream provider, not the model itself).
  Irrelevant on the request path (embeddings are ingestion-only) but it would make bulk
  re-embeds slower; a mild strike against it if 0.4 is otherwise a tie.
- Recipe B costs ~30% more tokens than A (the tags). Negligible in dollars.
- The two models tokenize differently (same recipe-A text: 38,663 vs 43,585 tokens) —
  token counts are not comparable across models.

### ⚖️ Open question answered: OpenRouter honors OpenAI's `dimensions` param

Asked for 512, got 512 back on `openai/text-embedding-3-small`. So if 0.4 picks the OpenAI
model, the `VECTOR(n)` column is **not forced to 1536** — it can be shortened at request time
(Matryoshka truncation, no client-side slice-and-renormalize needed). The dimension choice in
0.4 is therefore a real choice, not a constraint.

### Smoke test (not the 0.4 verdict)

Cross-source neighbors of the Wikipedia *Astronomy* article, recipe B: all five nearest are
astronomy-subject Met/AIC objects under both models (cosine 0.40–0.48 for the OpenAI model,
0.51–0.55 for bge-m3). This only proves the vectors aren't garbage — it's a title-match-easy
probe. Whether neighbors cluster on **subject vs medium** for ordinary items is exactly what
0.4's side-by-side harness exists to judge; raw cosine magnitudes are also not comparable
across models, only rankings are.

---

## 0.4 — First pass and scale-up (07-10-26)

**First pass (416 items, top-10-only harness): inconclusive, random baseline preferred.**
Ben's verdict on the first `explore.html` build: the corpus was too sparse to judge, and the
random-baseline column was his favorite of the five. Two confounds, not a clean "embeddings
lose": (1) "random" sampled a pool 100% pre-curated around 8 topic seeds, so it was really
random-*within-interests*, not open-web random; (2) the harness only ever showed top-10
nearest neighbors — relevant-but-unsurprising by construction — never the mid-distance band
where serendipity (related-but-not-obvious) actually lives. Led to two changes below.

**Harvest scaled 416 → 3,168 items.** Quota raised 20 → 75/source/topic, topics 8 → 16 (added
Architecture, Music, Textiles, Cartography, Zoology, Portraiture, Ceramics, Geology — same
object-vocabulary-for-museums rule as the original 8). Final: 1,165 Wikipedia / 1,121 Met / 882
AIC. 10 dead Met object IDs (404, isolated per-item as designed) + 1 stray Met 403.

| Topic | Wikipedia kept/offered | Met kept/offered | AIC kept/offered |
|---|---|---|---|
| Astronomy | 75/85 | 75/148 | 75/100 |
| Botany | 75/85 | 75/318 | 75/200 |
| Machines | 75/85 | 75/3900 | 75/100 |
| Mythology | 75/85 | 75/1236 | 75/100 |
| The ocean | 75/85 | 75/1054 | 75/200 |
| Typography | 75/85 | **5/39** | 75/300 |
| Ancient history | 75/85 | 75/11666 | 75/100 |
| Poetry | 53/85 | 75/1928 | 75/300 |
| Architecture | 75/85 | 75/21958 | 75/300 |
| Music | 75/85 | 75/6011 | 75/100 |
| Textiles | 75/85 | 75/37267 | 75/200 |
| Cartography | 75/85 | 75/1148 | 75/200 |
| Zoology | 73/85 | 75/10860 | 75/200 |
| Portraiture | 73/85 | 75/42031 | 75/200 |
| Ceramics | 71/85 | 75/29291 | 75/100 |
| Geology | 75/85 | 75/3709 | 75/200 |

**New trap: AIC hard-caps `limit` at 100, and it's a 403 not a documented constraint.**
`limit=225` (quota × 3, the old formula) returns `403 {"error":"Invalid limit","detail":"You
have requested too many resources per page."}`. Probed the boundary directly: 100 → 200 OK,
120 → 403. Fixed by paging (`page=1..6`, `limit=100`) instead of one large request. Recurs in
the 3.2 adapter — cap AIC page requests at 100 and paginate for anything larger.

**Reverses a 0.2 finding: AIC/Typography now yields its full quota (75/300).** 0.2 found "0
usable items, all in-copyright 20th-c photography" — but that was a 60-item probe (`limit=60`,
one page). Paging to 300 candidates finds enough public-domain hits. Doesn't invalidate the
underlying lesson (abstract topics skew toward copyrighted/recent museum holdings and need
deeper search or object-vocabulary seeds), but the "0 items" verdict specifically was an
artifact of not paging far enough, not a true density floor.

**Met/Typography stayed sparse at scale (5/75, offered 39 — matches 0.2's real total).** Not a
harvester bug; the Met's typography-tagged corpus genuinely is that small. Confirms 0.2's
finding rather than changing it.

**Re-embed cost/time at 3,168 items (`bun run phase0/embed.ts --force`):**

| Set | Dim | Tokens | Wall time |
|---|---|---|---|
| text-embedding-3-small × A | 1536 | 278,297 | 39.2s |
| text-embedding-3-small × B | 1536 | 369,087 | 45.3s |
| bge-m3 × A | 1024 | 313,242 | 422.3s |
| bge-m3 × B | 1024 | 416,597 | 400.1s |

bge-m3's ~10x-slower-per-item pattern from 0.3 held at scale (≈7 min per set vs ≈45s for the
OpenAI model) — a firmer tiebreaker strike now, not just a 416-item artifact. `dimensions`
probe re-confirmed HONORED at this scale too.

**Harness gained a near/mid-band distance toggle** (`build-explore.ts` / `explore.template.html`).
Each of the 4 sets now precomputes both "near" (top-10, ranks 1-10) and "mid" (10 evenly-spaced
picks from ranks 21-120) cross-source neighbor lists; a checkbox in the harness switches all
four model columns between the two bands. The random-baseline column is unaffected by the
toggle — it's the fixed control either way. Verified in Playwright: toggle changes model-column
contents (different items, correspondingly lower cosine scores) while random baseline stays
identical; blind mode, search (now reports the live item count), and navigation still work
against the 3,168-item corpus with zero real console errors (only a harmless missing-favicon
404 on the local dev server used for verification).

**Open for Ben's re-judgment:** same three ⚖️ verdicts as before (serendipity go/no-go, model +
recipe, `VECTOR(n)` dim), now specifically informed by comparing **near vs mid vs random** at
a corpus size where the mid-band actually has candidates to sample from.

## 0.5 — Curation + feed-feel prototype (07-13-26)

Follows the 0.4 verdict + pivot (see log.md): validation moves from "do item
neighbors look right?" to "does a tiered topic feed over a CURATED pool feel
like a drift through the good wing of the museum?" North star re-clarified by
Ben the same day: old-Tumblr curated-but-almost-never-repeating; anti-example
is xikipedia (traced: no embeddings at all — category-tag score bags, no
corpus quality judgment, cold start seeds 12 huge categories at equal weight,
which is why its opening feels random).

### New sources on trial: Cleveland Museum of Art + Wellcome Collection

Picked from docs/source-candidates.md for visual richness (CMA) and
non-art-museum texture (Wellcome, history of medicine/science). Adapter traps
found — all will recur in the Phase 3/4 adapters:

- **CMA is the friendliest API of the five.** No key, `limit` up to 1000 (one
  request per topic), explicit `cc0` search flag, full records in the search
  response, and — rare for a museum — a real prose `description` on many
  objects. Still re-check `share_license_status === "CC0"` per record.
- **Wellcome `thumbnail.url` is a rendered IIIF URL locked to `!200,200`** —
  not an `info.json` endpoint as their docs imply. Serve it as-is and every
  image is a 200px thumb. Fix: swap the size segment for `!800,800`
  (fit-in-box, never upscale — same IIIF trap class as AIC's `843,` in 0.4;
  verified their thumbs endpoint honors it). License is per item and
  heterogeneous: request-filter to `cc-0,cc-by,pdm` AND check each work's
  `thumbnail.license.id`. `pageSize` caps at 100.
- **AIC's IIIF server bot-blocks provider-side image fetchers** (403s Google's
  fetcher; fine from a browser or curl). Found when the LLM curation pass
  failed on 9/11 AIC images. Any pipeline that hands an AIC image URL to a
  third-party service must download the image itself and pass bytes/base64.
- **Some Met image URLs contain literal spaces** ("…TR 112 1- 3 2012…") —
  reject as malformed by strict URL parsers; `encodeURI` before fetching.

### curate.ts — the taste layer (structural floor + LLM curator)

Stage 1 (free, heuristic): drop items sharing a normalized title with >2
others (the 0.4 "67 items titled textile" pathology — all copies dropped, as
they're interchangeable), bare single-noun titles on image items, summaries
under 60 chars. On the 3-source 3,168 corpus: → 2,639 survivors (394
dup-title, 129 bare-title, 6 thin; losses concentrated exactly where 0.4
found the noise — Met/Textiles lost 69/75, Met/Machines 65).

Stage 2 (LLM, cached per item×model×prompt-version): gemini-2.5-flash-lite as
a Tumblr-art-blog-curator persona scores 1–10 + 2–4 aesthetic tags, judging
image items by the downloaded image itself, not the catalog text (judging
"visual interest" from "Textile. 18th century." would replay the 0.4 trap).
40-item probes: judgments look genuinely right — museum treasures (Monk-Scribe
Astride a Wyvern, Paracas ceramic trumpet) at 9 with usable tags ("medieval
bestiary", "polychrome ceramic"); keyword-stray Wikipedia hits (HMS Ocean,
Epidermis (zoology)) at 4; academic-journal stubs at 2. ~1,450 tokens/item →
full corpus well under $1. Distribution skews 7–9; the feed's score-floor knob
compensates, and Ben's ~30-item calibration pass can tighten the prompt later
(PROMPT_VERSION invalidates the cache surgically).

### build-feed.ts + feed.template.html → feed.html — the wind tunnel

Self-contained scrolling feed implementing the post-0.4 design end-to-end,
with every parameter a live knob (tuning never rebuilds; only corpus changes
do): CORE/DRIFT/JUMP tier mix over the topic graph; DRIFT = softmax over
POSITIVE-sim bridges only (first build let a -0.01 "bridge" through on weak
rows — fixed; no bridge → stay home, honest for the flagged noise rows); JUMP
= uniform draw from the row's tail half (the strict antipode would be false
precision at 16 points); item pick = weighted random by (score-floor+1)^power
× aesthetic-tag overlap boost; diversity = no adjacent same-source cards +
per-page topic cap; seen-set in localStorage (the never-repeat promise);
save = visible reweight (toast: "Now also drifting toward Cartography") —
xikipedia's invisible feedback loop, made legible; debug overlay shows every
card's why-line (tier, path, sims, curator score). Cold-start modes: taste
picker (24 curated tiles → topic weights + aesthetic keywords), plain topic
chips (the xikipedia-style control), and optional `--favorites "…"` (build-time
LLM maps freeform favorites → topic weights + keywords + a blurb).

Playwright-verified: onboarding (picker enables at 3 picks), 12-card pages
compose with 0 adjacent-same-source violations, all three tiers appear with
correct why-lines, save→toast→weight-shift works, infinite scroll appends,
profile/seen/saves survive reload, drift hops all positive-sim after the fix,
zero console errors (only the dev-server favicon 404).

### Visual embeddings — run complete; judging open

embed-images.ts via Voyage `voyage-multimodal-3.5` (text+image shared vector
space; researched vs Jina/Cohere/DeepInfra — Voyage wins on cost + integration
simplicity). **5,931/5,938 images · 1024-dim · 2.4B pixels (inside the free
tier) · 35 min.** 7 failures: corrupt source files + dead Wellcome thumbs.

**Trap (bit us twice in one day): museum image servers bot-block third-party
fetchers.** Voyage's URL-input mode 400s instantly on every AIC IIIF URL —
same class as AIC 403ing Google's fetcher in the curation pass. Ben's first
run (URL mode, 128-image batches) spent hours in retry grind because nearly
every batch contained an AIC image; batch fail → per-item fallback → per-item
retries. Rewritten to download locally + send base64, 24-image batches,
checkpoint-to-disk every 8 batches with resume-on-restart. Fixed run: ~170
images/min. **Rule for the real ingestion pipeline: never hand a museum image
URL to a third-party service; always pass bytes.**

First unblinded impression from the 6-column harness (explore.html now adds
the visual column; grid auto-sizes; blind mode shuffles it in with the text
columns): for a sculptural allegory of Astronomy, text columns return the
*subject* (astronomy allegory prints, zodiac diagrams); the visual column
returns the *form* (tritons fountain, ornamental panels, firedogs — ornate
sculptural things that LOOK alike). Visual NN = medium/form/vibe axis, text
NN = subject axis. Whether vibe-drift belongs in the feed (e.g. as a "more
like this look" affordance) is Ben's 0.5-gate judgment; neither axis is
"wrong", they answer different questions.
