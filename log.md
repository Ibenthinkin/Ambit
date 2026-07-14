# Ambit — Project Log

Narrative record of decisions, findings, and dead-ends that don't live in commit
messages. `/brief` reads this. Newest on top.

## 2026-07

### [[07-13-26 Mon]] — Phase 0.4 verdict: item-level NN is dead; topic-level drift replaces it

**Verdict — the 0.4 gate returns NO on item-level nearest-neighbour recommendation.** Ben browsed
the harness and couldn't distinguish the variants: all four vector sets produce the same thing, all
are far too clustered, and chaining is a straight line rather than a drift. Clicking *Poetry
Fragment (Qit'a) in Nasta'liq Script* returns pages of calligraphy from the same few poems. His
words: "it feels like a direct search… that is not a serendipitous drift, that's just a straight
line."

**Why (the corpus explains it):**
- **580 of 3168 items sit on a literally duplicated title.** 67 items are titled just `textile`,
  27 `fragment`, 12 `page of calligraphy from an anthology of poetry by sa'di and hafiz`.
- Met items have a **median title of 4 words and a median summary of 129 chars** (12% under 80).
- So embedding `title + summary` for a museum object mostly embeds *accession-catalog boilerplate*.
  Cosine similarity over that text degenerates into **string matching** — which is exactly why the
  neighbours of the calligraphy fragment were a dozen items whose titles are the same sentence.
- Compounding it: **top-k NN is by construction an anti-serendipity operator.** It returns the most
  similar item available. Asking it for a drift and getting a straight line is the definition of the
  function, not a tuning failure. The 0.4 mid-band toggle was the right instinct but can't rescue a
  corpus whose mid-band is also calligraphy.

**The pivot — embeddings move up a level, from items to topics.** The failure was about *what we
embedded*, not about embeddings. Separation of concerns, and it's the whole design now:
- **Embeddings choose WHERE to look** — topic level. 16 clean, semantically real concepts.
- **Random draw + filters choose WHAT to show** — item level, where embeddings failed.

**Shipped: `phase0/topic-graph.ts` → `phase0/topic-graph.json`.** Topic centroid = mean of every item
vector carrying that topic (grounds each node in servable content). Emits a 16×16 adjacency matrix,
**computed once offline and checked in** — no pgvector, no per-item vector in the DB, no embedding
call at request time. The recommender collapses into a static lookup table we can read, hand-edit,
and diff in a PR.

**Trap found — hubness — and it would have shipped silently.** Raw cosine over topic centroids makes
**Geology the top-2 neighbour of 10 of the 16 topics** (Music→Geology 0.73, Portraiture→Geology 0.70
— nonsense). Classic high-dimensional pathology: a centroid near the corpus mean is "close" to
everything, so *every user on the platform drifts into rocks*. Fix is one step —
**subtract the global mean centroid** (the "generic digitised museum object" direction) before
comparing. Geology drops to 3 top-2 appearances and the graph goes flat. This step is load-bearing;
without it the feature looks like it works and is broken.

**The graph, once centered, is genuinely good** — real intellectual bridges, not medium/era clusters:
Textiles↔Machines 0.37 (the Jacquard loom), Typography→Machines 0.12 (the printing press),
Botany→Textiles 0.22 (dyes, fibres), Ceramics→Geology 0.24 (clay), Astronomy→Cartography→The ocean
(navigation). `Poetry → Typography → Machines` is a two-hop walk that is exactly the drift we wanted.
**Honest caveat:** rows for **Architecture and Music** have a best-neighbour under 0.06 — no real
structure, drift there is indistinguishable from noise. Script flags them; curate by hand.

**Decisions:**
- **Feed = three tiers over topics, random within a topic.** CORE (user's picked topics) / DRIFT
  (walk the adjacency row, 1–2 hops, softmax-sampled) / JUMP (the *antipode* — tail of the row — a
  principled cross-domain leap rather than mere noise). Item selection inside the chosen topic is
  **random**, never by similarity.
- **Personalisation-from-saves is dead and stays dead.** SPEC §9's "nearest-neighbours of recently
  saved items" was the item-level NN that failed. Personalisation is now: which topics you pick, and
  which topics you drift toward.
- **The real work was never the ranking function.** A random draw over *this* corpus still serves
  "textile" 67 times. Needed in either world, and it's what actually makes the feed feel good:
  a **quality floor at ingest** (drop bare-noun titles, drop items sharing a title with >2 others)
  and **diversity constraints at composition** (no two adjacent cards from one source; cap per
  topic/creator/collection per page).
- Keep `phase0/` on disk — `harvest.ts` is still the basis for the real adapters.

**Open / next:**
- ~~Ben is putting the topic-drift proposal to Fable before committing~~ → done, session 2 below.
- SPEC §9 (feed algo), §5.1 (vector column), §15 (embedding-dimension open question) and the
  CLAUDE.md "**Embeddings are the product**" line are all now **false** and need rewriting once the
  approach is settled. Not touched yet, deliberately — the sweep is gated on 0.5 (below).
- ~~Hand-authored adjacency matrix vs computed~~ → resolved by session 2's recompute: on the
  curated 5-source corpus the computed graph has zero weak rows; hand-editing demoted to review.

---

**Session 3 (night) — ⚖️ THE 0.5 GATE PASSED; Phase 0 closed; docs swept.**

Ben's verdict on `feed.html`: *"it's getting good. definitely on the right track… what I enjoy
the most is the higher further drift."* Consequences, all landed:
- **Default tier mix shifted drift-heavy:** CORE 40 / DRIFT 35 / JUMP 25, second-hop chance
  0.5 (was 55/30/15, hop 0.35). These are now the shipped defaults in SPEC §9. (Anyone with
  stored knobs from an earlier browse: hit "Reset knobs to defaults" to pick them up.)
- **Debug overlay + tuning knobs stay in the product** behind a dev flag for the whole
  development period — feel-tuning is ongoing product work.
- **The doc sweep, in one commit:** SPEC rewritten end-to-end for the validated design
  (pgvector/`VECTOR(n)`/`nearestNeighbors` removed everywhere; §5.1 gains
  `curation_score`/`aesthetic_tags`/`topic_id`; §6.2 is now the curator service; §9 is the
  tiered-drift algorithm with the 0.5 defaults; §14 marks Phase 0 complete; §15 splits
  settled-vs-open). CLAUDE.md "Embeddings are the product" → "The corpus is the product."
  README status → Phase 0 complete. source-candidates: CMA + Wellcome marked ✅ kept/promoted.
  BUILD_PLAN 0.5 all checked; 2.1/3.3/8.1 rewritten for the no-pgvector world.
- **Still open (SPEC §15):** visual-embeddings keep-or-cut (Ben hasn't blind-judged the sixth
  column yet), curator prompt calibration, `--favorites` with real input, topic-graph refresh
  cadence, tier-mix under weeks of real use.

**Session 2 (evening) — vision re-clarified; Phase 0.5 "Feel Gate" built end-to-end.**

Fable's take on the 0.4 debate, as requested: **pivot endorsed**, with the caveat that the
empirical "NO" was overdetermined — item-NN was never tested on a clean corpus, but the
structural argument (top-k NN is anti-serendipity by definition) and the product-feel argument
(random-within-interests won both rounds) decide it regardless. Pushbacks that became decisions:
saves are **demoted to a topic-level signal, not dead**; item vectors **stay in the offline
pipeline** (dedupe, quality, graph recompute) — only the request path drops them; JUMP =
**random draw from the row's tail half**, not the strict antipode (false precision at 16 points).

Ben then re-stated the north star: the feel of **old Tumblr's curated-but-never-repeating
drift** — "a person's favorite wing of a museum" — pushed a bit further cross-domain, run rich
(personal product, no scale constraints). Anti-example researched: **xikipedia** (traced the
actual code: no embeddings — category-tag score bags; no quality layer beyond stub-removal;
cold start seeds 12 huge categories at equal weight, which is *why* it opens boring; feedback
loop invisible). Diagnosis for Ambit: the topic graph gives **structure (WHERE)** but nothing
gives **taste (WHAT)** — the missing layer is item-level curation + a differentiated cold start.
Phase 0.5 planned and approved (see BUILD_PLAN 0.5).

**Shipped (all `phase0/`, verified end-to-end):**
- **Corpus 3,168 → 9,811 → curated 8,093.** `harvest.ts` + Cleveland Museum (CC0, no key, real
  prose descriptions — friendliest API of the five) + Wellcome Collection (open-license filter +
  per-item license check); quota 75→150. New traps recorded in NOTES: Wellcome's `thumbnail.url`
  is a rendered IIIF URL locked to `!200,200` (not `info.json` as docs imply); AIC's IIIF server
  bot-blocks provider-side image fetchers; some Met image URLs contain literal spaces.
- **`curate.ts` — the taste layer.** Stage 1 structural floor (dup-titles >2, bare-noun image
  titles, thin summaries): 9,811 → 8,093, losses exactly where 0.4 found the noise. Stage 2:
  gemini-2.5-flash-lite as a Tumblr-art-blog-curator persona scores every item 1–10 + aesthetic
  tags, judging images by the *downloaded image* (base64 — the catalog text would replay the 0.4
  trap). ~12.4M tokens ≈ $1.25, cached per item×model×prompt-version. Spot-checks read true:
  Great Wave / Frederick Douglass daguerreotype / Voyager Family Portrait at 10; book-title-page
  stubs at 1; keyword-strays at 4.
- **Topic graph recomputed on the curated corpus: zero weak rows** (0.4's three noise rows all
  healed). Machines↔Typography 0.35, Ancient history↔Mythology 0.34, Architecture→Cartography
  0.12 — bridges are ideas, not mediums.
- **`build-feed.ts` + `feed.template.html` → `feed.html` — the wind tunnel.** Self-contained
  scrolling feed implementing the whole post-0.4 design: CORE/DRIFT/JUMP tier mix (drift walks
  positive-sim bridges only — first build let a −0.01 edge through, caught via the debug
  overlay; jump = tail-half draw), item pick weighted by curator score + aesthetic-tag overlap,
  no-adjacent-same-source + per-page topic caps, localStorage seen-set (never repeats), save →
  visible reweight with a toast ("Now also drifting toward Cartography" — xikipedia's invisible
  loop, made legible), debug why-line per card, all parameters live knobs. Cold-start modes:
  **taste picker** (24 top-scored items — now The Great Wave, The Scream, the Enigma machine,
  celestial woodcuts), **topic chips** (the xikipedia-style control), and **`--favorites "…"`**
  (build-time LLM maps freeform favorites → topic weights + keywords + a blurb). Playwright:
  composed pages average curator score 8.0 (min 7), five sources interleaved, zero console errors.
- **`embed-images.ts` ready** for the visual-vibe experiment — Voyage `voyage-multimodal-3.5`
  (URL-native, shared text/image space, free tier covers the corpus; researched vs
  Jina/Cohere/DeepInfra). **Blocked on `VOYAGE_API_KEY`** (free, dash.voyageai.com).

**Open / next (pick up here):**
- **Ben browses `feed.html` — this is the 0.5 gate.** Compare the taste-picker vs topic-chips
  cold starts; turn the knobs (tier mix, score floor, drift temperature); debug overlay shows
  every card's why. Regenerate anytime: `harvest → curate → embed → topic-graph → build-feed`.
- Ben's curator calibration: spot-check ~30 scores (visible in the debug overlay); if the taste
  is off, describe the miss → prompt tweak → `PROMPT_VERSION` bump re-scores for ~$1.25.
  Reference Tumblr-blog links welcome — they'd be distilled into the curator persona.
- `--favorites` mode needs Ben's real list to be judged fairly.
- ~~`VOYAGE_API_KEY` → run embed-images.ts~~ → done (session 3, same day): Ben's first run
  crawled for hours — Voyage's URL fetcher is bot-blocked by AIC (same trap as the curator,
  second time in one day; NOTES now carries the rule: *never hand a museum image URL to a
  third-party service, pass bytes*). Rewritten to local-download + base64 with checkpoint/resume:
  **5,931 visual vectors in 35 min**, free tier. explore.html rebuilt with a sixth
  **voyage-multimodal · visual** column (blind mode shuffles it in with the text columns).
  First impression: text NN finds the *subject*, visual NN finds the *form/vibe* — for a
  sculptural Astronomy allegory, text returns zodiac prints, visual returns tritons fountains
  and firedogs. **Judge in the blind harness whether vibe-drift belongs in the feed.**
- **After the gate:** the one-sweep doc rewrite (SPEC §9/§5.1/§6.1/§15, CLAUDE.md "Embeddings
  are the product" line, README status, source-candidates trial verdicts, system-map artifact).

### [[07-11-26 Sat]] — Auth rethink: magic link → email + password (Better Auth)

**Decisions:**
- Ben dropped magic-link auth for regular **email + password**. That forced a library change, not just a flow change: Auth.js's Credentials provider is the wrong tool for passwords — officially discouraged, JWT-only sessions (no DB persistence/revocation), and no built-in sign-up, hashing, or reset; you'd hand-roll all of it. Picked **Better Auth** instead (current docs verified): built-in email/password with scrypt hashing + reset flow, database sessions, Drizzle adapter, and a documented invite-gating seam (`databaseHooks.user.create.before` throws for uninvited emails).
- Mail infra (Mailpit dev / Resend prod) **survives** — repurposed from magic links to password-reset mail. Email *verification* skipped: the invite list is the trust anchor.
- Scaffold consequence: create-t3-app still only offers NextAuth, so 1.1 now declines its auth option and 2.2 adds Better Auth by hand. Auth tables switch to Better Auth's `user`/`session`/`account`/`verification` (CLI-generated); app-table FKs now reference singular `"user"`.
- Design handoff landing prototype still shows the magic-link flow — divergence note added to its README §1 rather than rewriting the as-built prototype description; 5.2 builds sign-in/sign-up/forgot-password states in the same visual language.

**Shipped:** SPEC (§1, §3.1, §5, §6.3, §8.1, §11, §12, §14), BUILD_PLAN (context, 0.1, 1.1, 2.1, 2.2, 5.2, 7.1, 8.1), README, CLAUDE.md stack line, `.env.example` (`NEXTAUTH_*` → `BETTER_AUTH_*`) all updated to match.

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
