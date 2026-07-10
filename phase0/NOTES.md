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
