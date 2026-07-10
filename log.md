# Ambit — Project Log

Narrative record of decisions, findings, and dead-ends that don't live in commit
messages. `/brief` reads this. Newest on top.

## 2026-07

### [[07-10-26 Fri]] — Phase 0.3: four vector sets, `dimensions` answered

**Shipped:**
- `phase0/embed.ts` (zero-dep Bun, same style as the harvester): embeds all 416 items through OpenRouter as 2 models × 2 recipes → 4 vector sets under `phase0/vectors/` (gitignored, ~19 MB, reproducible). Skips sets already on disk; `--force` re-embeds.
- 0.3 findings appended to `phase0/NOTES.md`; box checked in BUILD_PLAN.

**Findings:**
- **OpenRouter honors OpenAI's `dimensions` param** (asked 512, got 512) — the open probe from 0.2. If 0.4 picks `text-embedding-3-small`, the `VECTOR(n)` dim is a free choice, not locked to 1536.
- Whole run cost **~$0.003** (verified via OpenRouter usage accounting: $0.02/M vs $0.01/M). Cost is a non-factor in the model pick.
- **bge-m3 is ~10× slower through OpenRouter** (75.7s vs 6.6s per set) — its upstream provider, not the model. Ingestion-only, so tolerable, but a tiebreaker strike.
- Smoke test: cross-source neighbors of the Wikipedia *Astronomy* article are all astronomy-subject museum objects under both models. Proves the vectors work, not that serendipity is good — that's 0.4.

**Open / next (pick up here):**
- **0.4 — eyeball harness** (`phase0/explore.html` or CLI): pick item → top-N nearest neighbors *restricted to other sources*, 4 columns (model × recipe) + random baseline. Then the three ⚖️ verdicts: go/no-go on serendipity, model + recipe pick, `VECTOR(n)` dim — recorded in SPEC §6.2/§15. Watch for medium-vs-subject clustering; recipe B is the intended fix before blaming a model.

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
