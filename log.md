# Ambit — Project Log

Narrative record of decisions, findings, and dead-ends that don't live in commit
messages. `/brief` reads this. Newest on top.

## 2026-07

### [[07-10-26 Fri]] — Phase 0.3: four vector sets, `dimensions` answered; 0.4 harness built

**Shipped:**
- **Repo-as-teaching-tool pass** (evening session): explanatory comments through the `phase0/`
  scripts + harness template, aimed at a returning webdev — modern JS/TS idioms, embeddings
  concepts, the retry/cache patterns. Fixed one stale comment while in there (the harvest dedupe
  Map keeps the *last* topic's copy, not the first). Published the **Ambit system map artifact**
  (architecture, four data flows, data model, Phase 0 story, build order):
  https://claude.ai/code/artifact/cb527a06-6bd3-4d00-ac4b-a13a722a8262
- **0.4 eyeball harness**: `phase0/build-explore.ts` + `phase0/explore.template.html` → self-contained `phase0/explore.html` (0.7 MB, gitignored, no server needed — open it directly). Precomputed top-10 *cross-source* neighbors per item for all 4 vector sets; 5 columns (4 sets + seeded-random baseline); search / random-item / click-to-chain; **blind mode** shuffles and unlabels the columns with a reveal button, so the go/no-go and model-vs-model judgments aren't biased. Verified end-to-end in Playwright (render, navigation, blind/reveal, search) — zero console errors after the fix below.
- **AIC image trap found + fixed in `harvest.ts`**: the docs' IIIF size `843,` 403s on any original narrower than 843px (servers reject upscales — ~7% of AIC thumbs). `!843,843` (fit-in-box) works for all. Recorded in NOTES for the 3.2 adapter; items.json regenerated from cache (only imageUrls changed, vectors unaffected).
- Early unblinded impression from verification screenshots: for easy cases all 4 model columns are clearly on-subject vs an obviously-random baseline; the Typography article (the known-hard topic) looked much shakier. The real browsing + verdicts are still open.
- `phase0/embed.ts` (zero-dep Bun, same style as the harvester): embeds all 416 items through OpenRouter as 2 models × 2 recipes → 4 vector sets under `phase0/vectors/` (gitignored, ~19 MB, reproducible). Skips sets already on disk; `--force` re-embeds.
- 0.3 findings appended to `phase0/NOTES.md`; box checked in BUILD_PLAN.

**Findings:**
- **OpenRouter honors OpenAI's `dimensions` param** (asked 512, got 512) — the open probe from 0.2. If 0.4 picks `text-embedding-3-small`, the `VECTOR(n)` dim is a free choice, not locked to 1536.
- Whole run cost **~$0.003** (verified via OpenRouter usage accounting: $0.02/M vs $0.01/M). Cost is a non-factor in the model pick.
- **bge-m3 is ~10× slower through OpenRouter** (75.7s vs 6.6s per set) — its upstream provider, not the model. Ingestion-only, so tolerable, but a tiebreaker strike.
- Smoke test: cross-source neighbors of the Wikipedia *Astronomy* article are all astronomy-subject museum objects under both models. Proves the vectors work, not that serendipity is good — that's 0.4.

**First 0.4 verdict attempt — inconclusive, and the random column won:**
- Ben's browse of the harness: 416 items is too sparse to judge, and **the random baseline was his favorite column**. Two confounds explain (but don't dismiss) this: (1) the "random" column samples a corpus 100% harvested around his 8 topics, so it's really *random-within-interests* — a product finding in itself; (2) the NN columns show top-10 most-similar, i.e. relevant-but-unsurprising "more of the same," while serendipity lives in the mid-distance band the harness never shows — and at ~50 items/topic that band barely exists.
- Provisional product implication if this holds at scale: feed shifts toward "curate the pool, randomize the order, embeddings for chain-jumps off saves" — SPEC §9's randomness floor becomes the ceiling.

**Revised 0.4 plan executed — harness rebuilt at scale, verdicts still Ben's to make:**
- Harvest scaled 416 → **3,168 items** (16 topics incl. 8 new ones — Architecture, Music,
  Textiles, Cartography, Zoology, Portraiture, Ceramics, Geology — quota 20 → 75/source/topic).
  Hit a new trap along the way: AIC hard-caps `limit` at 100 (undocumented, 403s above it) —
  fixed with pagination. Side effect: AIC/Typography, which 0.2 found totally empty at a
  60-item probe, fills its full quota once paged to 300 candidates — reverses that specific
  "0 items" finding (deeper search, not a real density floor). Met/Typography stayed genuinely
  sparse (5/75), confirming 0.2 rather than contradicting it.
- Re-embedded all 4 sets (`bun run phase0/embed.ts --force`) against the larger corpus.
  bge-m3's ~10x-slower-than-OpenAI pattern held at scale (≈7 min/set vs ≈45s) — firmer
  tiebreaker strike now. `dimensions` param re-confirmed honored at this size.
- Harness now has a **near/mid-band toggle**: model columns default to top-10 (as before) or
  switch to 10 evenly-spaced picks from rank ~20–120; random baseline is the fixed control
  either way, unaffected by the toggle. Verified end-to-end in Playwright — toggle correctly
  swaps neighbor content/scores, random stays identical, search/blind/nav all still work.
  Full detail in `phase0/NOTES.md` under "0.4 — First pass and scale-up".

**Open / next (pick up here):**
- **Session ended at the judgment gate — everything is staged for Ben's 0.4 verdicts.** The
  teaching pass + artifact link are committed and pushed (`a4c0251`); the harness was opened
  for browsing but no verdicts were reached. Judging procedure agreed: blind mode ON, a round
  at top-10 then a round with the mid-band toggle (rank ~20–120) against the fixed random
  control, chain-jump via card clicks, reveal only after forming an opinion; probe Typography
  and Ceramics items for medium-vs-subject clustering (recipe B is the intended fix).
- **Ben re-judges** `phase0/explore.html` (open directly; blind mode on), comparing **near vs
  mid-band vs random** — the question his first-pass reaction (preferring random) actually
  raised. Bring back the three ⚖️ verdicts: (1) serendipity go/no-go, (2) model + recipe,
  (3) `VECTOR(n)` dim (free choice if the OpenAI model wins — `dimensions` honored). Then:
  record in SPEC §6.2/§15, check the 0.4 box, mark Phase 0 complete in README, update the
  system-map artifact's Phase 0 section — which unlocks **Phase 1.1 (scaffold)**.
- **System-map artifact** (keep updated as architecture evolves; same URL via the `url` param):
  https://claude.ai/code/artifact/cb527a06-6bd3-4d00-ac4b-a13a722a8262
- Watch for medium-vs-subject clustering (recipe B is the intended fix); Typography is still
  the source most likely to expose it (Met especially, given how sparse it stayed).
- If the harness needs regenerating on a fresh checkout: `bun run phase0/harvest.ts` →
  `bun run phase0/embed.ts --force` (needs `OPENROUTER_API_KEY`) → `bun run phase0/build-explore.ts`.

### [[07-09-26 Thu]] — Phase 0.2: sample harvester

**Shipped:**
- `phase0/harvest.ts` (zero-dep Bun script) + `phase0/items.json`: **416 items** — 160 Wikipedia articles, 135 Met, 121 AIC — across the 8 topic seeds. On-disk response cache (gitignored) so 0.3/0.4 iterate without re-hitting the APIs.
- `phase0/NOTES.md` with the density + quality findings.

**Findings:**
- **Density is a non-issue.** Every topic × source pair except one could fill its quota many times over. The binding constraint for v1 is *quality and licensing*, not volume.
- **The real risk to serendipity is the embedding text, not the model.** Museum objects have no prose description; their summary is synthesized from catalogue fields and is dominated by artist/date/**medium**/department, with the actual subject buried last in the tags. Wikipedia hands the model 591 chars of prose; the Met hands it 137 chars of "Bronze. Sculpture-Bronze." Cross-source neighbors may therefore cluster on *medium* rather than *subject* — technically serendipitous, experientially dull. **If 0.4 looks bad, re-order the summary to lead with subject/tags before blaming the model.** 0.3 should keep summary construction swappable so 0.4 can compare *recipes*, not just bge-small vs. text-embedding-3-small.

**Traps found (all will recur in the Phase 3 adapters):**
- The Met's `isPublicDomain=true` **search filter is not honored** — 14 of the first 20 `machine` hits aren't public domain. Must re-check every object's own record, at ~2–3× the fetches. An adapter that trusts the search filter ingests copyrighted images.
- The Met rate-limits with a silent **403, not 429**, and it clears after a pause. First run showed three topics at `0/0`, which reads exactly like "no content" but was three dropped searches (real totals: 39 / 11,666 / 1,928). Harvester now reports a failed search as `ERR`, never a zero. ~2.5 req/s is clean.
- Wikipedia's **`cllimit` is a per-query budget, not per-page**: at `cllimit=20` over a 20-page batch, page one takes all 20 categories and the rest get none. Only `cllimit=max` works. Silent — made tags look uniformly empty.
- **Wikipedia licensing isn't uniform**: text is CC BY-SA 4.0 but each lead image has its own per-file license the summary API doesn't expose. Resolve via `prop=imageinfo&iiprop=extmetadata` in 3.1, or don't render Wikipedia images. Met/AIC are clean CC0 once per-object verified.
- AIC + "typography" → **0 usable items** (all 60 hits in-copyright 20th-c photography). Abstract topics need object-vocabulary seed queries against museums. **Budget real time for seed-query tuning in 2.3** — one term per topic won't work across sources.

**Decisions:**
- **Embeddings go through OpenRouter**, for model flexibility. Its embeddings endpoint (`POST /api/v1/embeddings`, batched array `input`) is real now — SPEC §6.2's "limited embeddings support" note was stale. Verified against the docs.
- **Local `bge-small` dropped.** Two facts killed it: embeddings are computed *at ingestion only* (the feed reads vectors already in Postgres, so nothing embeds on the request path — a managed provider adds no request latency or uptime risk), and cost is negligible (~$0.002 for the whole 416-item Phase 0 corpus at $0.02/M). The "local is free" argument was carrying weight it no longer deserved. Managed wins on simplicity; no local model runtime in Phase 3.3.
- Caveat noted: **model choice stays expensive to reverse.** A gateway makes a *same-dimension* model swap one line, but a dimension change still means re-embedding the corpus plus a `VECTOR(n)` migration. `embed()` is the single seam.
- `bge-small` isn't on OpenRouter anyway; closest is `bge-m3` (1024-dim). So 0.3's candidates became **`openai/text-embedding-3-small` (1536)** vs **`baai/bge-m3` (1024)**.
- **0.3 reshaped to 2 models × 2 recipes** (4 vector sets) rather than a wider model bake-off — because 0.2 found the *embedding text* is the bigger lever. Recipe A = as-harvested; recipe B = subject-first (title + tags before catalogue fields). 0.4 gets 4 columns + random baseline.

**Open / next (pick up here):**
- **0.3 — embed** (`phase0/embed.ts`). Needs `OPENROUTER_API_KEY`, not yet set in `.env`. Also probe whether OpenRouter honors OpenAI's `dimensions` param — undocumented, and it decides whether 1536 can be shortened.
- Then 0.4 (eyeball harness → go/no-go on serendipity, model + recipe pick, `VECTOR(n)` dim). If neighbors cluster by *medium* rather than *subject*, that's recipe A failing — try recipe B before blaming the model.

### [[07-08-26 Wed]] — Repo setup + in-repo log
**Shipped:**
- `docs/BUILD_PLAN.md`: the living execution tracker (Phase 0 → MVP → Polish), step 0.1 done (plan committed, `LICENSE` moved to repo root, README license field fixed).
- `docs/source-candidates.md`: post-MVP backlog of candidate content APIs, seeded with early ideas to organize later.
- This `log.md` convention, replacing the dead `VAULT_LOG_PATH` vault-rollup step (adapted from Magpie's `log.md` pattern — the vault's `/brief` skill already reads any hybrid project's `<repo>/log.md` generically, no per-project wiring needed).

**Decisions:**
- Dev magic-link mail: Mailpit in dev, Resend in prod. Dev DB: local Docker Compose (`pgvector` image). Recorded in BUILD_PLAN.md context.
- Project log lives in-repo (`log.md` at root) and complements commits — retired `VAULT_LOG_PATH`.

**Open / next (pick up here):**
- Phase 0 is still the active phase: **0.2 sample harvester** — Bun script to pull ~300–600 raw items from Wikipedia + Met + AIC across ~8 topic seeds, normalize, dump to `phase0/items.json`, note per-source density in `phase0/NOTES.md`.
- Then 0.3 (embed with both candidates) → 0.4 (eyeball harness, go/no-go on serendipity + embedding model pick).
