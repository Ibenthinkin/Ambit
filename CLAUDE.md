# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Ambit

A calm, non-social **anti-doomscroll PWA**: an infinite feed of public-domain images and articles, loosely tuned to user interests, with deliberate cross-domain serendipity jumps. Invite-only, no monetization, no social features.

## Repository status

**Phases 0–5 complete.** Phase 0 (concluded 07-13-26) validated the
design in `phase0/` (throwaway-but-kept: harvester, curator, topic-graph tooling, and two
self-contained browser harnesses — `feed.html` is the reference implementation of the feed
algorithm and stays the feel-tuning bench): item-level embedding recommendation was **rejected**;
the validated design is a tiered topic-drift feed over an LLM-curated pool (SPEC §9). Phases 1–4
scaffolded the real app — Next.js/tRPC/Drizzle/Better Auth, the five source adapters + curator
(§6), the feed engine (§9), and the full tRPC surface (§7) — all on `main`, DB populated from a
real ingest run. Phase 5 built the UI against the redesign handoff (`docs/design_handoff_ambit_pwa_redesign/`)
screen by screen, per `docs/BUILD_PLAN.md`'s Phase 5 ordering. **All of 5.1–5.11 are shipped**
(design system, auth, onboarding, feed, item, gallery, Saved, Profile/Settings/Edit, and the
landing slideshow + install flow + PWA caching). The app has no internal 404s, sign-out lives on
`/profile/settings`, and it is installable with the last feed page available offline. **6.3 shipped
08-27-26** (blog adapters: the `CorpusWalkAdapter` contract, doorofperception live as link
cards). **7.1 shipped 08-27-26** — the Playwright suite (8 specs, 42 tests) runs in CI against a
**production build** with Postgres + Mailpit service containers, and the five DB-backed Vitest
suites run there too; `bun run e2e:prod` reproduces that configuration locally. Running against a
production build is what found two bugs `next dev` had been hiding (Better Auth's production-only
rate limiter, and the accent knob not surviving a reload) — both fixed in 7.1.
**7.2 shipped 08-28-26** — the security pass: every response now carries nosniff,
`X-Frame-Options: DENY`, referrer and permissions policies, HSTS gated on an https
`BETTER_AUTH_URL`, and an **enforced Content-Security-Policy with a per-request nonce**
(`src/config/security-headers.js` builds every value; `next.config.js` sends the static ones and
`src/proxy.ts` mints the nonce). SPEC §11 now ends every bullet in the test that proves it. Two
findings: 41 corpus rows carried `<i>`/`<em>` markup in `title`/`summary` from four adapters
(reader-visible; recorded then, **fixed in 8.1** — the adapters run both fields through
`htmlToText()` and `bun run renormalize --confirm` repairs rows ingested before that), and the CSP
surfaced a dev-only hydration error from the way browsers blank a `<script nonce>` attribute.
**7.3 shipped 08-28-26** — performance + images. The **image-delivery gate is settled:
proxy-with-cache**. `/api/img/[itemId]` now fills a disk cache (`IMAGE_CACHE_DIR`, default
`.cache/img`) and serves **≤1600px WebP**, so every source image is fetched from its museum
**once, ever** (`src/server/services/image-cache.ts`; `bun run img:warm` spends those fetches
politely, per host). And the feed's page compose went from **138 ms to 22 ms** — `getTopicPools`
had been dragging 9,848 full rows / 35.8 MB out of Postgres to pick twelve cards; it now returns a
five-column projection and `getFeedPage` hydrates the winners by id. `bun run bench:feed` is the
before/after. **8.1 shipped — public 08-29-26, closed 09-17-26. 8.2's guardrails shipped 09-20-26** — an ingest verdict (exit 2 on a dead source) + `ingest_run` rows read back by `/api/health` as `ingest: ok|stale|never|unknown`, `instrumentation.ts` mailing `OPS_EMAIL` once an hour per error signature, Coolify failure notifications through Resend (proven with a `fail-probe` task), two UptimeRobot monitors (HTTP + the `"ingest":"ok"` keyword, from Ashburn), and Beszel on VM 202; SPEC §13 has the alert map. **The beta week (8.2 T6) is open** — 3 accounts on production as of 09-20 — and its triage into Phase 9 closes the phase. **8.3, the landing redo, was built 09-25-26 on `feat/landing-redo`** (`docs/DESIGN_landing-redo.md`, `docs/PLAN_landing-redo.md`): an overture on black (`AMBIT — A quieter way to be curious.` collapsing into the wordmark), a server-picked reel of the ~2,700 score-9 public-domain pictures in two tempos (`cut` / `dissolve`, `?tempo=` honoured only under `FEED_DEBUG`), a closed-set `?w=960` image rendition derived from the cached master, and three candidate profile marks on `/dev/marks` — merged to `main` 09-25-26, **awaiting Ben's two picks** (plan Task 9). **The same night, after Ben's first phone look, the reel became shape-matched**: tall pictures for an upright phone, wide ones for a computer, at master size, read off new `item.image_width/height` columns (migration 0009, backfilled by `bun run img:dims`, which the container runs on every boot) — see the design's 09-25-26 amendment. **Reduced motion is a tempo, not a still, since 09-26-26** — Ben's "no animation on phone or computer" was Reduce Motion on at the OS level on both; a reader who asks for less gets the same overture collapse as everyone and the reel as drift-free cross-fades (`TEMPOS.gentle`), and `globals.css`'s 0.01 ms collapse exempts only `.motion-gentle`. **Ben picked the dissolve the same day** (`DEFAULT_TEMPO`), at 2 s a picture, 1 s fade, the sheet after 8, and the wordmark no longer stays over the reel. **All of it and the topic groups are merged to `main` and pushed (`deb36cb`, 09-26-26), not yet deployed** — Ben is making more UI changes first; pick up from `log.md` 09-26's last **Open / next**. **09-27-26: Ben's feed layout picker became spread mode on the desktop item screen** (see its Architecture bullet), built on `feat/spread-mode`. **09-28-26: writing Phase 1 (the writing curator) is built on `feat/writing`** (`docs/DESIGN_writing.md`, `docs/PLAN_writing.md`) — articles go to a text rubric (`WRITING_PROMPT`) with a kind, a reading time and a `news` drop, migration 0010; **Phase 2 (Wikipedia) is built on the same branch the same evening** — bodies fetched at ingest (`sources/enrich.ts`), Wikipedia's four reading lists (`sources/wikipedia-lists.ts`), and `config/reading-phrases.ts` (Ben edits it) in place of the sixteen `wikipedia` seed cells. Both phases are **merged and deployed (`39657f6`, 09-29-26)**; the Wikipedia backfill and the re-score's dry run have run on production, **`confirm` has not**. **09-30-26: writing Phase 4 (cards) is merged and deployed (`7224ace`); Phase 5 (publications) is built on `feat/publications`, not merged** — `NormalizedItem.curationText` (scored, never stored), `rss.ts`, `wp-rest` article mode, three publications registered and suspended pending Ben's verdicts (`docs/source-candidates.md`). **09-30-26: Ben dropped every "no news" rule** — he curates sources to keep news out — so the next session removes the news drop/demotion (not the prompt text, which keeps the cache) before `confirm`. **10-01-26: the Claude judge is built on `feat/claude-judge`, not merged** (`docs/DESIGN_claude-judge-ingest.md`, `docs/PLAN_claude-judge.md`): `CURATOR_JUDGE=claude` scores through `claude -p` on Ben's Max subscription (Haiku 4.5, ~400 tokens a judgment, pictures as ≤1024 px JPEG bytes, a clean stop at 80% of either usage window); unset is OpenRouter exactly as before, and production is untouched. **Its writing gate failed** — every Claude judge is ~1.4 points harsher than Ben's marks, so the publications stay suspended and un-backfilled — and `bun run vision:compare` puts pictures close (Spearman 0.72). **Future work item: move the judge to VM 202** once Ben has freed RAM and disk there (not a Mac host; design D11). **Pick up from `docs/HANDOFF_writing.md`.** **10-06-26: the sitewide redesign ("1b") is built on `feat/redesign`, not merged, not deployed** — every screen, seven phases, Ben looking after each (see its Architecture bullet); it waits on his device pass at 402 / 1440 and the tailnet phone, then one merge and one deploy, whose boot runs migration 0014. The history: T1–T2 shipped 08-28-26 (`/api/health`,
`MAIL_FROM`, `cf-connecting-ip` for Better Auth in production, a `SOURCE_COMMIT`-first precache
revision, and the `Dockerfile`/`.dockerignore` whose boot path — migrate, seed, `next start` — was
proven locally against an empty database, cache volume and all). **T3 shipped 08-29-26** — Ambit is
deployed on VM 202 as Coolify's second tenant. **T4 shipped the same night** — Ambit is **public at
`https://ambit.benreilly.io`** through the VM 200 tunnel, all seven security headers surviving the
edge, and the first account is signed up against an empty corpus (correct: D3 fills it in T7). Two
Coolify traps cost the evening and are written up in the walkthrough — the Postgres image field
defaults to 18 rather than the pinned 17, and `POSTGRES_USER`/`POSTGRES_DB` are silently ignored
after a resource's first start. **T7.3 shipped 08-31-26** — the first full ingest landed
**11,313 items** across nine sources, all 16 topics filled, from the _nightly cron_ run (Ben's
manual run was killed mid-flight by a NUC host problem, but its curation cache on the volume made
the cron run 70 min instead of two hours). One trap from that worth knowing before you debug
anything scheduled on this host: **Coolify records every healthy ingest as `failed`** — its
`ScheduledTaskJob` times out at 5 minutes, discards the task output, and lets the `docker exec`
run on to completion regardless, so **the task status is not evidence in either direction and the
database is the only honest witness** (the diagnostic query is in `PHASE8_PLAN_8.1.md` 7.3's
fallback). Raising `scheduled_tasks.timeout` was 8.2's T3.0 (10800 s since 09-10-26). **7.4 and 7.4c shipped
08-31/09-01-26** — the image cache is warm for all nine sources; the wikipedia adapter now asks for 1600 px thumbnails instead of originals, and `bun run rethumb` is
the row repair. Wikimedia throttles on-demand thumbnail _rendering_ on a budget of roughly 60
renders refilling at ~20/min — a sustained `--rate 1` still 429s; warm it as 20-image chunks with
75 s pauses (loop in the 8.1 walkthrough). **T8 ran 09-16-26 and found every scheduled backup empty** — "Backup All Databases" is
`pg_dumpall`, which the non-superuser `ambit` role cannot run, and Coolify recorded each 215-byte
header as a success; fixed by the toggle, restore proven in 8.5 s (SPEC §13 has the procedure). **The
file on disk is the witness, the same way the database is for a task.** T9's closing docs landed
09-17-26. SPEC §13 is now _what is deployed_; read `docs/PHASE8_WALKTHROUGH_8.1.md` for the deployed
facts (resource UUID, volume name, DB container, backup path) rather than re-deriving them from the
Coolify UI. **A second thread is mid-flight beside 8.1:
source-candidates round 2** — every remaining candidate in `docs/source-candidates.md` was live-probed
09-01-26, and the same night Ben verdicted the first three: **thingsorganizedneatly kept** (Tumblr
walk, 891 rows locally @ 7.90), **thisiscolossal kept** (on the new `wp-rest.ts` factory; 6,075
rows locally @ 8.70, 97.5% ≥ 8, all 16 topics — the strongest source in the corpus), **mossandfog
parked** (`SUSPENDED_SOURCES`, the only switch that keeps a
registered walker out of the nightly ingest). Walk sources are now exempt from the dup-title floor
rule, and `bun run stats:walk` prints the score distribution a verdict needs. Neither kept blog is
on production yet — the nightly ingest walks them after the next deploy. **Tumblr round 4 (09-13-26,
`docs/HANDOFF_tumblr-round4.md`): eight blogs probed, `jareckiworld` and `kvetchlandia` kept and
registered 09-15-26** on the factory with budgets (13,700 / 12,500 items), in `SUSPENDED_SOURCES`
until each is walked, one at a time. **The Public Domain Review
(`pdr`) was built and KEPT 09-02-26** — the fourth walk source and the first that is _not_ a designated
blog (its images are public domain, its own text CC BY-SA 4.0), a walk over Gatsby `page-data` JSON
with a per-record disk cache; **1,624 local rows @ 8.39, 87% ≥ 8**, of which 186 are un-homed under
Cut 1. Local only until the next deploy, like the two blogs. It is also the first source whose
_image_ items carry a `body` — a collection's own CC BY-SA preamble, rendered under the picture —
which is why the "walk rows carry no body" invariant is now scoped to blogs. **Loupe is hooked up
as of 09-07-26** (`docs/PLAN_loupe-hookup.md`): the fifth walk source, keyed on `<ia>:<page>:<order>`
never Loupe's `id`, with the Loupe bearer on both server-side image fetches
(`services/image-auth.ts`); **132 rows locally @ 4.52** (131 OCR articles + 1 image — the low
average is the clippings' fragmentary OCR, judged as text), no per-user gate by Ben's decision —
`item.source` is where a future gate filters. Loupe has no production host, so **`loupe` goes into
`SUSPENDED_SOURCES` before the next deploy** or the nightly ingest errors on it.
**The desktop pass shipped 09-08-26** (`docs/DESIGN_desktop-polish.md`, plan
`docs/PLAN_desktop-polish.md`): one breakpoint (`md`, 768 px), one `Column` primitive
(600 / 720 / 1120), `useMediaQuery` on `useSyncExternalStore` so the server-rendered feed
hydrates straight into three or four columns, `BottomSheet` as a centered 520 px dialog above
`md`, tiles focusable with a fine-pointer right-click for the item sheet, and a `desktop`
Playwright project at 1440 × 900. Below 768 px nothing changed. Two things it turned up that
outlive it: **Tailwind v4's `translate-*` utilities write the standalone `translate` property,
not `transform`**, so a keyframe that also states a centering translate _composes_ with them and
moves the element twice (a 520 px dialog landed 260 px left of centre); and, from 09-26-26, **a `@keyframes` inside `@theme` is emitted only if an `--animate-*` token uses it** — one named only from an inline `style` must sit at the top level of `globals.css`, or it silently isn't in the build (the landing's `overture-in` and `reel-drift` weren't, for a month; `globals.test.ts` compiles the file to pin it); and **the `chromium`
Playwright project now declares a 402 × 874 viewport** rather than inheriting `Desktop Chrome`'s
1280 × 720 — 1280 is exactly `xl`, so the phone suite had silently begun exercising the desktop
layout. That suite is green under `bun run e2e:prod` (49 passed); under `next dev` at a phone
width the **Next.js dev-overlay portal sits on top of the pill toolbar** and eats the clicks, so
`bun run e2e` alone reports failures that a production build does not.
**Feed pools are sampled as of 09-08-26** (`docs/DESIGN_feed-pool-sampling.md`, plan
`docs/PLAN_feed-pool-sampling.md`): `getTopicPools` returns at most 60 rows per topic and 20 per
(topic, source), chosen by the same cursor-keyed `md5` the WILD pool uses, so a page costs
O(topics × 60) rows whatever the corpus does — **4,801 rows / 0.7 MB** at a 122,458-item corpus.
The two caps compose in **two stages, per source first**: one `WHERE n <= 60 AND n_src <= 20`
over a single ranking is an _intersection_, which shrinks the sample without giving a minority
source a single extra slot (measured: `japan` 30 rows from 3 of 8 sources, vs 60 from all 8 after
the repair). That is written up in `db/feed.ts`; don't collapse it back into one pass. Before this, `reachableTopics` (two graph hops from
the user's picks) reached 101 of 104 topics and every page pulled the whole corpus —
133,698 rows / 22.4 MB at 122,458 items; the query itself was only ~175 ms, but the dev server
materialising it grew to 2.6 GB in eight page loads and stalled unrelated requests for seconds.
`bun run bench:feed` and `bun run probe:feed`'s score summary are the before/after. The 22 ms in
the 7.3 sentence above was measured against 9,848 rows. **Sub-project 3 of Ben's desktop review — the chrome redesign — was built 09-11-26 on
`feat/chrome-redesign` (see its bullet under Architecture); sub-project 4, the list screens, was
built 09-12-26 on `feat/list-screens` — see its bullet.** **Opening it, Ben hit a `/feed` reload loop — diagnosed and fixed on `main` the same evening
(`596a26a`, merged into this branch): Next 16.2's dev client misreading Firefox on a still-streaming
`/feed`, not the branch and not the service worker — see the local-dev bullet below.** Pick the thread up from
`docs/HANDOFF_sources-round2.md` **§0** — streetartnews and spoon-tamago as a cold-executable
seven-step task (config rows on the factory, verdict after each) — then Europeana / Openverse /
Chronicling America. See
`docs/BUILD_PLAN.md` for the full phase-by-phase build order and
`log.md` for the narrative of what's landed and why.

## Authoritative documents

- **`SPEC.md`** — the build-ready technical spec: architecture, DB schema, tRPC API surface, feed algorithm, build order (§14), and open questions (§15). Treat it as the source of truth when scaffolding or implementing; it's a living doc — update it as decisions land.
- **`docs/design_handoff_ambit_pwa_redesign/`** — the authoritative design handoff since 08-16-26 (11 `.dc.html` prototypes + README). **Where the prototypes and the README conflict, the prototypes win** — a recorded Phase 5 convention. The bundle's `PROGRESS.md` describes an earlier session and is superseded. The older `docs/design_handoff_ambit_pwa/` is kept as history only. The `.dc.html` files are self-contained interactive prototypes (open directly in a browser), one per screen, with a detailed README covering design tokens, motion specs, and per-screen interaction notes. Recreate these designs in the app's own components — do not copy the prototype code, and do not port `ios-frame.jsx`/`image-slot.js` (presentation scaffolding only).
- **`docs/source-candidates.md`** — post-MVP backlog of candidate content APIs with a per-source trial loop. These are _not_ v1 sources; the committed v1 set lives in SPEC §6.1. Promote a candidate into the SPEC only after it passes the trial.

## Planned stack & commands (from SPEC)

Next.js (App Router) + **Bun** (runtime + package manager), TypeScript, tRPC, TailwindCSS, Drizzle ORM over plain Postgres (no pgvector — see below), Better Auth email + password (invite-gated sign-up), Vitest (unit) + Playwright (e2e). Once scaffolded, scripts use the `--bun` flag:

```
bun run dev      # bun run --bun next dev
bun run build    # bun run --bun next build
bun run ingest   # bun run scripts/ingest.ts (cron-triggered ingestion)
```

## Architecture (the parts that span files)

- **One Next.js app** serves frontend + tRPC API; a **decoupled Bun ingestion script** (`scripts/ingest.ts`) fetches from source APIs on a schedule, normalizes, **curates** (quality floor + LLM taste score — SPEC §6.2), and upserts into Postgres.
- **Everything normalizes to one `item` schema** (SPEC §5.1). Each external API gets an isolated `SourceAdapter` (`server/services/sources/*`) with `search()` + `toItem()`; ingestion is idempotent via the `(source, source_id)` unique constraint. Museum image servers bot-block third-party fetchers — anything sending an item's image to an external service must pass bytes, never the URL.
- **The corpus is the product.** The feed's quality comes from curation at ingest (every item carries a 1–10 LLM `curation_score` + `aesthetic_tags`), not from a ranking function. Embeddings choose **where** to look — a checked-in 16×16 topic-adjacency graph built offline from mean-centered topic centroids; curated-weighted **random** chooses what to show (never similarity — item-level NN was tested and rejected in Phase 0.4).
- **The vocabulary grows to fit the corpus** — a **core principle**, decided 09-02-26; **Cut 1
  shipped 09-02-26** (design: `docs/DESIGN_topic-vocabulary-growth.md`; plan
  `docs/PLAN_topic-vocabulary-cut1.md`). **Walk sources ingest their whole corpus; the topic
  vocabulary grows to fit them, never the reverse.** A blog is designated because the _blog_ was
  judged worth having, so every post that clears the structural floor and the curator's quality
  bar is stored whether or not a topic fits it; its source tags and aesthetic tags are always kept,
  and are what new topics get proposed from. **Search-shaped sources are the exception and stay
  bound to the topic list** — a search source needs a query and topics are where queries come
  from. Short form: **topics are the vocabulary Ambit _asks_ with; tags are the vocabulary the
  world _answers_ in.** "Everything" means everything that clears _quality_, never a relaxation of
  the floor. This reversed half of 6.3's D4 ("never force-fitted" stays; "no honest home → dropped"
  went). **What Cut 1 built:** `item.topic_id` is nullable and means the _display_ topic;
  `item_topic (item_id, topic_id, origin)` holds membership, additive, never retracted by code;
  classify returns an array (possibly empty) and nothing was re-billed; the ingest summary prints
  the un-homed count **and their tag histogram** — read that line before any source verdict. **What
  it did not:** un-homed items reach the feed only as WILD cards; **the feed draws on
  `item_topic` since 09-11-26** (`docs/DESIGN_feed-on-membership.md`); the ~3,500 items 6.3
  dropped come back with a
  re-walk of each blog, free from the curation cache.
  **Cut 2a shipped 09-02-26** (plan `docs/PLAN_topic-vocabulary-cut2.md`): the vocabulary is now
  **99 topics — 16 `original` + 83 `grown`** mined from the corpus's own tags, and the un-homed backlog
  is **3,741 → 1,027**. Three scripts: `bun run mine:topics` proposes into `docs/topic-proposals.md`
  (Ben ticks it; that file **is** the verdict), `bun run promote:topics --confirm` applies it
  (`topic` rows at tier `grown`, `item_topic` at `origin: "tag"`, and `item.topic_id` set **only
  where NULL** — which is what makes a stored-but-invisible item drawable with `feed.ts` untouched),
  and `bun run graph:rebuild --confirm` regenerates `topic-graph.json` as a **hybrid**: the sixteen
  tuned rows byte-for-byte, every edge touching a promoted topic from IDF-weighted tag
  co-occurrence **rescaled to the embedding graph's spread** (raw co-occurrence is ~4× flatter and
  would soften DRIFT to a near-uniform draw — the subtlest thing in the cut). `topic.tier` keeps
  onboarding at 16 chips: `listTopics()` was core only, `listAllTopics()` everything. **Round 2 shipped 09-12-26** — 59 more topics from
  `docs/topic-proposals-round2.md` (ranked by total, not un-homed): **160 topics, 159 pickable**;
  the feed's cost did not move with it (p50 182 ms, cold start). **Two
  things to know before building on it.** The feed now spends most of a page outside the reader's
  own picks (a sampled 96 cards: 59 grown / 37 original) — intended in direction, untuned in degree,
  and the open feel question for **Cut 2b** (the `topic_edge` table; the join move shipped
  09-11-26, not urgent until ~300 topics). And `bun run promote:topics`'s **dry run
  over-counts** — it
  measures each topic's un-homed set against the untouched database, so an item carrying three
  ticked tags is counted three times; the write's number is the honest one.
- **Topics have a `facet`, and every one of them is pickable — 09-10-26** (design
  `docs/DESIGN_topic-facets-and-personas.md`, plan `docs/PLAN_topic-facets-and-personas.md`;
  sub-project 1 of three from Ben's desktop review). One nullable `topic.facet` column —
  `subject | medium | look | place` — assigned by hand in `src/server/config/topic-facets.ts` and
  applied to every row by **`db:seed` on each boot**, which is what puts facets on production with
  nothing copied into the container. `listTopics()` changed from `WHERE tier = 'core'` to
  `WHERE facet IS NOT NULL`, and that one line is what lets both pickers — and `setMine` — see the
  whole vocabulary: **onboarding is four stages, one facet each** (floor of three picks in total),
  and **`/profile/topics`** is the same list as four stacked facet sections on one page, each
  under its onboarding question (`FACET_PROMPTS`; a chip-row filter until Ben's 09-12-26 review), saved on every toggle (floor of one),
  replacing Settings' deleted "What you see" sheet. `facet IS NULL` means _not pickable_: an
  unclassified fresh promotion, or an era topic (`19th-century`), tag-only by decision;
  `promote:topics` now refuses a ticked proposal without a facet, and `mine:topics` writes
  a `<!-- facet: ? -->` slot for the verdict to fill. **The tier `core` is renamed `original`**
  (migration 0007) — the sixteen were the first words anyone thought of, not a curated centre.
  Two things that follow and are easy to miss: **CORE slots can now name a grown topic**, because
  CORE draws from what the reader picked and they can pick anything faceted (SPEC §9's "which tier
  each draw can reach" is rewritten); and the picker is a second lever on Cut 2a's open feel
  question, alongside `/dev/feed`'s. **Twenty personas** ship with it — `config/personas.ts` plus
  `bun run seed:personas`, which signs each one up through Better Auth's server API against
  `PERSONA_PASSWORD` (env; no default, and it is a secret) so Ben can read the feed from twenty
  different chairs. Demographics in the fixture are documentation and are never stored.
- **Onboarding is a questionnaire, and groups and facets are internal — 10-02-26** (plan
  `docs/PLAN_onboarding-questionnaire.md`; branch `feat/onboarding-questionnaire`, built in the
  worktree `~/Dev/ambit-questionnaire`, not merged). Ben's verdict on the two bullets around this
  one: the facet stages and umbrella groups are "completely broken" _as things a reader sees_. So
  `/onboarding` is now thirteen skippable questions (two free-text, five picture face-offs, word
  questions) → an optional About-you step (gone 10-05-26) → a **reveal** of levelled topics, and `/profile/topics`
  is that reveal kept: a `TopicLevels` list (flat until the redesign grouped it under facet
  headings again), a search box, "Retake the questions". **No screen
  names a group or a facet any more**; both remain the vocabulary the _code_ speaks — the bank's
  answers (`src/lib/interview/bank.ts`, Ben edits it), the personas, `listTopics`'s
  `facet IS NOT NULL`. The parts that span files: `src/lib/interview/` is pure (bank, `askable`,
  `score` — an answer's score is shared as `score / √n` — `picks`, `path`), so the browser, the
  bank's own test and the e2e helper all run the same rules; **`path.ts` is the pure mirror of
  `e2e/support.ts`'s `answerQuestionnaire`**, which steers by each answer button's `data-topics`
  — change one, change the other, and `bank.test.ts` proves a path to astronomy + botany + music on
  both database shapes. `onboarding.complete` is the one write (picks, `interview_answer` rows,
  user columns, one transaction, migration 0012) and **overwrites** through
  `replaceUserTopicsTx(…, "overwrite")`, where `topics.setMine` keeps learned weights.
  `onboarding.interpret` maps the free text with one OpenRouter call through
  `services/openrouter.ts` — **the transport was lifted out of `curator.ts` into that leaf** so
  the web server does not bundle the curator — and answers empty lists on any failure, timeout or
  missing key. **Reading is per person**: `user.writing_amount` (the level, never the share) →
  `resolveWriting` in `services/feed.ts`; "None" is `picturesOnly`, _not_ `writingShare: 0`, which
  would let articles back into the ordinary pools. Two traps it met: a `fixed` bar inside `<Rise>`
  is captured by the animation's transform (the step bars were siblings of the rising body; the
  redesign removed them), and a
  client component must import face types from `lib/interview/faces.ts`, not
  `services/question-faces.ts`, or it drags the database layer into the bundle. The demographics
  (age range, location, gender) were a **trial**, dropped 10-05-26 (migration 0014).
- **The pickers show umbrella groups, not topics — 09-25-26** (design
  `docs/DESIGN_topic-facets-and-personas.md` §2a; branch `feat/topic-groups`). Ben's review of
  onboarding after round 2: 92 Subject chips was "just too many words". `src/server/config/topic-groups.ts`
  files every faceted topic into exactly one hand-named group (12 Subject / 8 Medium / 8 Look /
  6 Place; `topic-groups.test.ts` pins the partition, so a promotion pasted into the facet map and
  not here fails `bun run test` — the only guard, `promote:topics` just prints the reminder). **A
  group is picker-side only**: onboarding selects group ids and flattens them on submit, `setMine`
  still receives topic ids, and the feed, weights and personas never hear of a group. Two things
  that follow: **`groupsFor()` intersects with `topics.list`** (CI seeds the sixteen originals, so
  "Space & science fiction" is one chip that picks `astronomy` there and twelve topics on
  production — an unlisted id is one `setMine` refuses), and e2e specs press `ONBOARDING_GROUPS`
  and must accept both database shapes when asserting on picked topics. `/profile/topics` leads
  each section with the group chips (tri-state; `Chip` gained `selected="mixed"` — removed in the redesign, nothing had used it
  since 10-02; tapping a mixed group _completes_ it) and folds the flat list behind "Show all N topics". **Open:** every picked
  topic is still written at weight 1.0, so a twelve-topic group is drawn twelve times as often as
  a singleton in CORE/DRIFT/JUMP — shipped flat on purpose; dividing by group size in
  `setUserTopics` is the follow-up if `/dev/feed` says so.
- **The item page _is_ the immersive screen — 09-10-26** (design `docs/DESIGN_screen-structure.md`,
  plan `docs/PLAN_screen-structure.md`; sub-project 2 of three from Ben's desktop review). `/i/[itemId]`
  for a picture is `ItemScreen`: `HeroRail` (the old gallery's three-cell track, square-cornered,
  **the full viewport on every width since Ben's 09-11-26 review, the picture centred in a 12 px
  inset like iOS Photos** — it followed the picture's height on the phone before that, and the
  ratio map, viewport measurement and collapsing caption row that took are gone) over `ItemFacts`
  in the reader column, 28 px below the strip — no details sheet. **`/g/[itemId]` is a permanent
  redirect** and `components/gallery/` is gone. Sideways swipes walk the wander rail and the page
  follows (`history.replaceState`); a tap toggles the chrome; **a quick downward flick at the top of
  the page, or Escape, leaves** — up is the browser's scroll, the track is `touch-action: pan-y` —
  and every exit is `useLeaveToFeed(entryItemId)`, so Back still pops to the intact feed after any
  number of swipes. One trap it met, explained where it lives: a tap's compatibility `mousemove`
  would re-show the chrome the instant a second tap hid it — so a desktop wake must never reach a
  phone (the redesign's `use-chrome.ts` enforces it twice; see the redesign bullet). Alongside it:
  **`NewCollectionRow`** (`sheets/collection-rows.tsx`) is the app's one create form and ends every
  collection picker, the tile sheet gained **Share**, and the **landing slideshow never stops** —
  click and ←/→ step it, the sheet still rises after the first pass, and reduced motion is read
  through `useMediaQuery` after hydration, which is what fixed the collapse glyph (the 09-08
  `AuthSheet onCollapse` hydration mismatch).
- **The chrome redesign shipped 09-11-26** (design `docs/DESIGN_chrome-redesign.md`, plan
  `docs/PLAN_chrome-redesign.md`; sub-project 3 of three from Ben's desktop review — sub-project 4,
  the list screens, was built 09-12-26 — see its bullet). Below `md` the pill is 56 px tall and **Share is a detached
  disc** beside it, centred in the space to the pill's right (`PillToolbar`'s `1fr auto 1fr`
  grid). From `md` the toolbar is **`RailToolbar`** — a vertical stack fixed at the right edge:
  Profile, Feed and Save in a bar, **Share as the one detached 68 px disc below it** (Ben's
  reviews: 09-11-26 detached Save and Share, 09-12-26 put Save back — the bar holds what is on
  every screen, the disc what only the item screen has) — and `Toolbar` picks one by
  `useMediaQuery`. On
  the item screen both toolbars are chrome: the pill **fixed at the bottom** (it rode inside the
  caption until the review, moving with the picture's height) and the rail at the right, each
  with `visible={chrome.visible}` — `PillToolbar` gained `visible` for it. `BottomSheet` takes an
  `anchor` + `placement` and becomes a **popover** (340 px since the redesign) beside its opener with an invisible
  scrim (`popoverStyle` is pure; its centring is the `translate` property because the menu
  keyframe owns `transform`). Feed tiles carry **`TileActions`** — mounted only under
  `HOVER_QUERY`, a sibling of the tile in the `group/tile relative` wrapper — naming the
  last-used collection (`lib/last-collection.ts`, localStorage, `useSyncExternalStore`) with a
  one-click optimistic save against the new `saves.ids`. The hover zoom went on 09-11; **the Lift
  replaced it 10-05-26 on `feat/tile-hover`** (`docs/tile-hover/`, `docs/PLAN_tile-hover.md`):
  `TILE_LIFT` on the card _wrapper_ in `FeedGrid` and `SavedTile` — 3.5% scale + `shadow-lift`
  over 350 ms, `hover:` and `has-[:focus-visible]:`, exempt from the reduced-motion collapse as
  `.motion-lift` (the element, not its subtree); the ring is 2 px inset `--color-focus-ring`; the
  tier tag stays dev-only and, since the redesign, hides while the tile is lifted; the lift holds
  while the tile's collection picker is open. Tailwind v4's `scale-*` is the standalone `scale`
  property, so transitions and e2e name `scale`, never `transform` — and an unscaled element
  computes `scale: none`, not `1`. **`saves.saveToCollection` takes `topicId`** and bumps it only for a member
  — the feed-on-membership follow-up, closed.
- **The list screens were built 09-12-26 on `feat/list-screens`** (design
  `docs/DESIGN_list-screens.md`, plan `docs/PLAN_list-screens.md`; sub-project 4 of four from Ben's
  desktop review — pushed for his review, not merged). `/profile` is a **hub**:
  `app/profile/layout.tsx` mounts `ProfileHub` — the identity block, a `<nav>` of four
  `<Link replace>`s (Collections · Topics · Edit profile · Settings) keyed on
  `useSelectedLayoutSegment()`, the `Toolbar`, and one raised toast tabs reach through
  `useProfileHub()` — around the child pages, which render content only. Tabs `replace`, so the
  hub is one history entry and Feed pops from any tab; `profile-origin.ts` is the hub's one
  marker (`edit-origin`/`settings-origin` are gone with the back chevrons). **`/settings` is a
  308 to `/profile/settings`**; `proxy.ts` keeps it in `AUTHED_PREFIXES` on purpose. A
  collection's face is **`CoverMosaic`** — `saves.collections` returns `covers: string[]` (the
  four newest pictures, one `row_number()` window, `COVER_COUNT = 4`) instead of `cover` — on
  the Collections tab and as the `leading` slot of `CollectionRow` in every picker. The hub and
  Saved are `Column width="wide"` and pack `GRID_COLS[useColumnCount()]` (`GRID_COLS` lives in
  `masonry.ts` now); the Edit / Topics / Settings tabs sit left-aligned in a
  `md:max-w-[600px]` div. One trap: **a layout's server guard runs on the document load only** —
  client tab switches re-render the page segment — so the four pages keep their own guards.
  And one finding: **every `<img>` of an item must be `lib/image-src.ts`'s `imageSrc`** — the
  CSP is `img-src 'self' data: blob:`, so a raw museum URL is blocked outright. The old Profile
  cover had been a broken image since 7.2 for exactly that; `covers` are proxied srcs now.
- **A signed-out visit is dealt a persona — 10-01-26** (plan `docs/PLAN_explore-personas.md`;
  branch `feat/explore-personas`, built in the worktree `~/Dev/ambit-explore-personas`, not
  merged). `/` composed on the uniform cold start and Ben found it boring; now
  `getFeedPage(null)` takes `PERSONAS[seed % 20]` — the seed the cursor already carries, so a
  visit is one reader, a reload another, and nothing is stored — and composes from
  `exploreWeights()`, which falls back to the cold start when fewer than three of the persona's
  topics are rows in the database (CI's sixteen). **Personas name umbrella groups plus single
  topics** (`personaTopics()` flattens them), which is how they keep up with the vocabulary:
  `personas.test.ts` fails on a dead group/topic id and on **a group no persona holds**, so
  renaming a group id or adding a group means touching `personas.ts` in the same commit.
  `db:seed` re-applies the picks to existing persona accounts on every boot
  (`syncPersonaTopics`; creates nothing, needs no password).
- **Onboarding is First Exhibition — 10-04-26** (design `docs/DESIGN_first-exhibition.md`, plan
  `docs/PLAN_first-exhibition.md`; the study it adapts is `docs/first-exhibition/`; branch
  `feat/first-exhibition`, built 10-05-26, merged to `main` the same evening, not deployed;
  **About you removed 10-05-26** on `feat/onboarding-trims` (Cut 1 of
  `docs/PLAN_onboarding-critique.md`; migration 0014 drops its three columns);
  Ben's cosmetic critique, for the sitewide redesign, is `docs/NOTES_onboarding-critique.md`;
  **bank v3 since the redesign, 10-06-26 — sixteen questions in eight steps**, the reading amount
  moved to the reveal; see the redesign bullet). Bank v2 was eighteen picture-led questions in nine steps (`lib/interview/steps.ts`); the
  playoff is a `show.top` display rule on a static `choice` (`lib/interview/show.ts`), not a
  question kind; reading cards are real articles (`question-faces.ts`'s writing branch) and score
  the item's memberships plus its kind's form topic (`KIND_FORM`); a reading card with no article
  shows an example headline (`lib/interview/reading-fallback.ts`). The reveal's
  title/temperament/compass are pure (`exhibition.ts`, `temperament.ts`, `compass.ts`) and stored
  as `user_taste.taste` jsonb (migration 0013), client-computed and server-validated (v1's rule:
  what is stored is what the reveal showed); `topics.taste` reads it back for `/profile/topics`.
  Hand picks are one `PICKS` object in `bank.ts`, keyed by role. Two new facets, `tradition` and
  `form`; **hand-added topics live in `config/hand-topics.ts`** (`TOPICS` is pinned to the
  sixteen) and are seeded at tier `grown` — ingest reads their queries off the row, and they have
  no graph edges until `graph:rebuild` runs after items arrive (drift stays put meanwhile). **So
  `db:seed` now writes 49 topics, and CI's database is the sixteen originals plus 33 empty hand
  topics**, not the sixteen alone. Two things that bite: the reveal's Reading row **preselects** a
  level read off the reading cards, so declining both reading screens preselects "None" — e2e's
  `answerQuestionnaire` sets "Some" on purpose (the share a skipped amount always meant); and
  bank v2 (v3 too) has **no path to `the-ocean`** on either
  database shape (the Land wing spreads its point too thin), so the retake spec steers to
  geology and music, which `bank.test.ts` pins. **10-06-26, `feat/reveal-redo` (merged to `main`
  the same day) — the non-visual half of the critique's Cut 4:** the
  reveal's words are one `FRAME` object (`lib/interview/frame.ts`: eyebrow, adjective maps, the
  wings' nouns, which left `interview-wings.ts`), so renaming the reveal is one file; the
  subtitle and "You’d open" line are sentences (`exhibitionSubtitle`, `readingSummary`); the
  reveal's draft is `reveal-draft.ts` and **re-seeds when the proposal changes under it**; and
  `hang.ts` + `kept-out.ts`, which the redesign then drew and stored (the hang as taste `v: 2`).
- **The sitewide redesign ("1b") is built — 10-06-26** (design `docs/DESIGN_redesign.md`, plan
  `docs/PLAN_redesign.md`, the package `docs/ambit_Redesign_4/`, briefed by
  `docs/BRIEF_claude-design-redesign.md`; branch `feat/redesign`, 72+ commits from `4005bdc`, all
  seven phases, **not merged, not pushed, not deployed**). Ben's Claude Design export: black and
  white, one green, square. The ledger of every task, ruling and finding is
  `.superpowers/sdd/PLAN_redesign/progress.md` (local, not committed). What it changed that the
  rest of this file used to say otherwise about:
  - **The accent knob is retired.** `--color-accent` is a plain `#2BB24C` token with **seven
    jobs** (SPEC §10: the 6 px dot, a progress tick and the compass markers, the focus ring, a
    hovered control's 2 px underline, the saved bookmark, the "Proposed" tag, an input's focus
    underline and the inline error). The default button is **white**, never green, and nothing
    is ever white on green (2.8 : 1). `[data-accent]`, `--accent-raw`, the pre-paint script and
    Settings → Appearance are gone, so `no-dangerous-html.test.ts`'s allow-list is now empty.
  - **Hanken Grotesk + Geist Mono replace Sora**: regular-weight, sentence-case titles (no
    `font-semibold` anywhere) and uppercase mono labels through `Eyebrow`. A type scale is
    `@theme` tokens (`text-display` … `text-eyebrow`).
  - **No radius** except the nav pill/rail and circular things; `src/no-rounded.test.ts` fails on
    a `rounded-*` outside its reasoned allow-list. Lines are 1 px; four shadows; `--color-error`
    and `--color-overlay` gone. **The ink alpha ladder stayed** — at `#F2F2F2` on `#0E0E0E` it
    already is the package's grey scale, so ~250 class strings re-toned from two tokens.
  - **Every control has a keyboard ring** (one `:focus-visible` base rule, the green). `Segmented`
    is a real `radiogroup`: arrows move the choice but don't wrap, and onto the destructive "off"
    move focus only — one arrow too many must not delete a topic on Profile → Topics.
  - **The item chrome's 10 s loop is gone** (`hooks/use-chrome.ts` replaced
    `use-chrome-cycle.ts`). **A phone taps**: hidden at first, a tap toggles, scrolling past
    24 px shows it and it stays. **A desktop wakes on input** (mouse, key, wheel, touch, scroll)
    **and idles out after 2.6 s**; **keyboard focus inside the chrome holds it**. One trap it met
    (`4b417ca`): the keydown wake re-rendered mid-keypress and the key effect's cleanup removed
    its own listener before it ran, so Escape / ←/→ / `M` were lost once the chrome had idled —
    the handler is a `useEffectEvent` now. Below the fold the phone has fact rows and a white
    link-out on every item with a source URL; the desktop a caption, "↓ Information" and three
    columns; a magazine spread adds **Fig. 01 / Fig. 02** details. "Shared by" and the
    `?from=` param are gone.
  - **Onboarding is bank v3: sixteen questions in eight steps** (`BANK_VERSION = 3`; the amount
    question left), one container with no header, bar or count, auto-advance at 380 ms, a quiet
    Back, the keyboard as pure `keyAction` (`lib/interview/keys.ts`). Rooms and pairs end in a
    **neutral Skip** (Ben's ruling, in place of "None of these" / "Neither"; `N` skips). Keep or
    pass is one picture at a time, and a pass scores nothing.
  - **The reveal** draws what Cut 4 computed: the title, the **hang** (six of the reader's own
    pictures, stored as taste `v: 2`), temperament, compass, "You’d open", **Your mix grouped
    under facet headings** (reversing the 10-02 flat list, on the reveal and Profile → Topics),
    the **Reading mixed in** row (opens on a retake's stored amount, else the cards' default,
    else Some), **Kept out** with Allow, the explore line, "Open my feed" and "Start over".
    `onboarding.complete` drops hang/opened ids that have since gone rather than refusing
    (`2627959`). `onboarding.interpret` is 30 an hour (was 10).
  - Everything a prototype merely omits is kept, restyled (DESIGN decision 13): gestures, zoom,
    the rail, magazine view, the Share row on the tile sheet.
    Settings lost its stub rows (Muted sources, Camera roll, Language), Saved its back chevron.
  Verified at the end: `bun run check` 2,517 green, `bun run e2e:prod` 70 passed / 0 failed, the
  CI-shape run 70 / 0. **Open:** Ben's device pass (402, 1440, the tailnet phone; the deferred
  minors marked for his look are in the ledger), then merge and the one deploy.
- **Spread mode on the item screen — 09-27-26** (design `docs/DESIGN_spread-mode.md`, plan
  `docs/PLAN_spread-mode.md`; branch `feat/spread-mode`, pushed for Ben's look at 1440, not
  merged). It began as Ben's **feed** layout picker (1 / 2 / 4 columns, drawn in
  `docs/layout-picker/`) and was **rejected for the feed**: tiles are cropped into cycled fake
  ratios, a column change remounts every tile, and the server always packs page one at two
  columns. Instead, at `md` and up, a toggle in the rail (`SpreadToggle`, between Feed and Save
  through `RailToolbar`'s `extra`) turns the hero into a **two-page spread**: `rail-cells.ts`'s
  pure `buildCells` makes each of the three cells one or two pages, a turn moves the rail by two,
  and the pre-fetch margin and the explore cap count two per turn. **The left page is the item
  until a click focuses the right one** (`useRailGestures`' tap now reports `clientX`); URL, Save,
  Share, caption and facts all follow `current`, and turning the spread off lands on the focused
  page — done during render, not in an effect, so no frame shows the wrong picture. The choice is
  per device in localStorage (`lib/hero-layout.ts`, `ambit.heroLayout.v1`). The toggle is Ben's
  **view toggle** (`docs/viewTOggleTOkens/`, 09-27-26): `icons/view-glyph.tsx` morphs one page
  into an open magazine, labelled "Magazine view", and `M` flips it. **The same evening it became a magazine**
  (`docs/PLAN_magazine-turn.md`): in a spread the track stops sliding and a **leaf** swings 180°
  around the spine — the index moves at once and the turn is drawn over it, a drag lifts the leaf
  with the pointer, the toggle opens and closes the book, a spine gradient lies over the seam, and
  the caption is two folios numbered from the entry (`01`, then `00`, `−01` going back).
  **It runs on the Web Animations API, which `globals.css`'s reduced-motion rule does not reach —
  deliberately, Ben wants the turn under Reduce Motion.** jsdom has no `Element.animate`, so in
  unit tests every motion lands at once; the mid-flight tests stub it. One
  e2e trap it met: the item screen throttles its mouse-move summon to one per 250 ms, so a
  Playwright summon straight after another mouse action is swallowed — `desktop.spec.ts`'s
  spread test retries it with `toPass`.
- **The hero zooms on a phone — 10-04-26** (design `docs/DESIGN_hero-zoom.md`, plan
  `docs/PLAN_hero-zoom.md`; merged to `main` 10-04-26 after Ben's phone look, not deployed).
  Pinch to zoom, one finger to pan while zoomed, double-tap in and out; **the two-finger exit is
  gone** (down-flick, Escape, pill remain). All the arithmetic is `lib/zoom-math.ts`, pure; the
  hook grew pinch/pan/double-tap and one scoped `preventDefault` (two-touch `touchmove` + Safari's
  `gesture*` events); `HeroRail` flips the track to `touch-action: none` while zoomed and wraps
  only the current single-mode page in a `data-page-box` the screen measures. The ceiling is
  honest about the 1600 px masters (floor 2.5, cap 4). Desktop and the spread do not zoom in this
  cut. **One trap, explained in `item-screen.tsx`:** a pinch ending with one finger down settles
  and starts a pan in the _same_ pointer event, before React re-renders — so the latest zoom
  lives in `zoomRef` as well as state, and the pan reads the ref. Device-judged, plus one
  Chromium CDP pinch smoke in `item.spec.ts`.
- **More or less — 10-09-26** (design `docs/DESIGN_more-or-less.md`, plan
  `docs/PLAN_more-or-less.md`, handoff `docs/design_handoff_more_or_less/`; designed 10-08, Part 1
  built 10-09 on `feat/more-or-less`, **not merged, not deployed**; Part 2, the on-page surfaces,
  in progress on the same branch). A worded Less of this / More of this pair on the item. The parts
  that span files: two tables (migration 0015) — `item_feedback` (one row per user+item) and
  `user_topic_cool` (a topic the reader has cooled); `db/feedback.ts` writes in one transaction
  and **undoes exactly** (`clearFeedback` reverses what the tap recorded, never "recomputes"),
  serialising first taps with an advisory xact lock per user+item, and returns a `FeedbackEffect`
  (incl. `isNewCool`) that `lib/feedback-toast.ts` words; `resolveSlotTopic` in `db/items.ts` is
  the one rule for which topic a tap on a slot means. A "more" bumps the topic like a save and
  feeds `getTasteKeywords`; a **cool weighs only where DRIFT and JUMP land** (never CORE — the
  reader's own picks), through the `coolStrength` knob in `feed-knobs.ts`, and at 0 or with no
  cools the draw path and rng consumption are unchanged, so the page is byte-for-byte today's.
  A retake clears cools; `topics.cools` / `topics.warm` back Profile → Topics' "Showing less of";
  Saved gained a "More of this" shelf; `/dev/feed` a "Your topics" readout. **Known bend:** a
  more→less flip on a topic the "more" newly picked leaves the pick at 0.75 (clear-then-apply),
  flagged for Ben. No toolbar changes — the pill, rail and Share disc are untouched by design.
- **The dev knob panel shipped 09-05-26** — `/dev/feed` (local, `FEED_DEBUG`; a 404 under a
  production build), every feed knob live including the two Cut 2a levers
  `grownEdgeScale`/`grownHopPenalty` (identities at `1`, so `/feed` composes exactly as before),
  per-page and session readouts with the **original/grown split**, and `feed.forgetSince` so tuning
  leaves no `seen_item` rows; plan `docs/PLAN_dev-knob-panel.md`. The gate is one function,
  `feedDebugEnabled()`, shared by both engines, the mutation and the route. The 59/96 question is
  now answerable; the answer, when Ben has it, goes into `DEFAULT_KNOBS` (and
  `bun run graph:rebuild --grown-scale <s> --confirm` if the graph lever is the one that moved —
  the rebuild now reads its preserved set from `TOPICS` rather than the artifact's own keys, which is
  what makes re-running it safe). `FeedKnobs`/`DEFAULT_KNOBS` live in `services/feed-knobs.ts`,
  a no-import leaf, so the client can read the defaults without bundling the DB layer. Two more
  sliders since 09-06-26 — `tierWild` and `wildTagBoost` — and the readout's split is now
  **original / grown / wild**.
- **The first big walk's three lessons (09-07-26)**, all on `main`: **`sourceCap`** (no source
  gets more than three cards a page, across every tier, filtered _before_ the draw — a
  17,500-item blog about illustration _is_ most of the corpus's illustration, and no pool query
  changes that arithmetic, so the page refuses to be a wall of it); **`MAX_TOPICS`** (the
  classifier keeps its first three homes — handed 99 topics it sometimes listed the vocabulary
  back, nine items under all 99); and **period topics are tag-only** (`PERIOD_TOPICS` in
  `config/topics.ts` — no label wording stops the model filing a 1988 photo under
  `19th-century`, measured 52 → 41 → 31 of 100). `bun run trim:memberships` and
  `bun run repair:periods` are the two dated exceptions to the additivity rule and **must run in
  the production container after the next deploy**. Cut 2b was sized against this and deferred:
  the join move does not dissolve a blog's topic capture (90-98% by membership too).
- **The feed draws on membership and fetches to plan — 09-11-26** (design
  `docs/DESIGN_feed-on-membership.md`, plan `docs/PLAN_feed-on-membership.md`; branch
  `feat/feed-on-membership`, merged to `main` 09-11-26).
  `getTopicPools` samples `item_topic ⋈ item`, so a topic's pool is its whole membership
  (`surreal` 3,919 → 26,701 drawable) and a promoted topic is full from its first page.
  `composePage` takes a topic stream (`rng`) and an item stream (`itemRng`, default `rng`);
  `planTopics` replays the topic sequence without pools and `getFeedPage` fetches ~30-40 pools
  instead of ~100 reachable, falling back to the reachable set only when a page composes
  short (`FeedPage.debug` under `FEED_DEBUG` says so; `bench:feed` counts it). `pickItem`
  refuses an id already drawn this page. `PoolItem.topicId` is the _pool's_ topic; the
  display topic (`item.topic_id`) still drives the item page, saves and the rail. Fixtures
  must write membership — `db/test-fixtures.ts`'s `insertHomedItems`, and e2e's
  `writeMemberships` (which `seedFeedCorpus` calls) — or a seeded item is in no pool. **Cost,
  measured:** p50 176-250 ms against 159-163 before, same minutes, three accounts — under SPEC's
  300 ms bar but _slower_ at today's 104 topics, because the planned topics are the big ones and
  their ~125k-180k memberships sort past 4 MB `work_mem`; what it buys is that the cost no longer
  grows with the vocabulary. **`getTopicPools` runs with `SET LOCAL enable_parallel_hash = off`**,
  in its own transaction: the join's parallel hash lives in `/dev/shm`, Docker's default 64 MB
  of it (local, CI _and_ production) ran out under concurrent pages — SQLSTATE 53100, a
  `feed.page` 500 the client retry hid, found only because `e2e:prod` logged a redacted SSR
  error `main` did not. 24 concurrent calls failed 110/120 before, 0 after; a reader with picks
  pays nothing measurable, a cold start ~+85 ms p50. `--shm-size` on the container is the infra
  alternative. **Round 2 of the vocabulary is unblocked:**
  `docs/topic-proposals-round2.md` (267 candidates ranked by total, `mine:topics --rank total`),
  `promote:topics --file`, and `sh .cache/promote-prod.sh docs/topic-proposals-round2.md`.
- **Feed composition** (SPEC §9) = per-slot tier draw (CORE 40 / DRIFT 35 / JUMP 25 — drift-heavy on purpose) → topic via the user's weights or a graph walk → item via curated-weighted random, under diversity constraints (no adjacent same-source; per-page topic caps). Saves reweight _topics_, visibly. Cursor-based pagination; the cursor encodes the page seed. Debug overlay + tuning knobs ship behind a dev flag throughout development.
- **Auth boundary**: all user-scoped queries filter by `userId`; the only public surface is `items.byId` / `/i/[itemId]`.

## Conventions

- Testing is non-negotiable (SPEC §12): Vitest coverage on adapter `toItem` normalization and the feed merge/weighting logic; Playwright for the core flows.
- Respect each source API's rate limits and attribution/licensing requirements; store `attribution` and `license` on items.
- Never render unsanitized source HTML.

## Local dev environment

**A `/feed` that reloads itself forever in Firefox under `next dev` is Next's dev client, not
the app** (diagnosed 09-11-26; it ate the afternoons of 09-08 and 09-11). Signature: runs of
`GET /feed 200` in the dev log, one every ~600 ms, not one `/api/trpc` call between them, and
nothing in the console because Firefox clears it on every navigation. Cause: with
`experimental.reactDebugChannel` on (Next 16.2's default) the client decides at boot whether
the document was restored from the HTTP cache by reading `transferSize === 0` off the
navigation-timing entry, and **Firefox reports 0 until the response has finished** — which
`/feed` has not, because its un-awaited `feed.page` prefetch keeps the stream open for as long
as a page takes to compose (~1.2 s in dev). Chromium never loops in the same
recipe. So it needs three things at once: Firefox, a _document_ load of `/feed` (typing the URL
or reloading — a client-side navigation from sign-in never trips it), and a feed slow enough
that Next's client boots before the stream ends; the third arrived on 09-08 with the corpus
growth. `next.config.js` turns the flag off, `src/next-config.test.ts` pins it, and Next
≥ 16.3.5 (which decides the cache question differently) retires both. A stale production
service worker on `localhost:3000` (left by `bun run e2e:prod` in any browser that touched the
port) also makes Firefox report 0 and was the first suspect; it is real but secondary — the
existing `SwCleanup` handles it once the page is allowed to hydrate.

- **Production is `https://ambit.benreilly.io`, and the container is found by port, never by name.** On VM 202 (`ssh ben@192.168.1.202`), `C=$(docker ps -q --filter publish=3000)` — the name carries a per-deploy suffix. `docker exec "$C" bun run invite <email>` is how someone gets invited; `curl -s localhost:3000/api/health` says which commit is live. The auto-mode classifier refuses agent-run database writes and ingests on that host, so ship those as short scripts under `.cache/` for Ben to run (long single-line `ssh` commands wrap in his terminal and fail silently).
- **Ambit must own port 3000.** `BETTER_AUTH_URL` is pinned to `http://localhost:3000`, so every auth callback and password-reset link points at whatever is listening there — and `tailscale serve --bg 3000`, which is how device passes get HTTPS, fronts the same port. An unrelated `node` app has been squatting 3000 since 08-16; run `lsof -ti:3000` and clear it before starting a dev server or a device pass.
- **Run device passes over HTTPS, not `http://` on the LAN.** The Web Share API is secure-context only, so on plain HTTP `navigator.share` is `undefined` rather than broken — share, clipboard and service workers silently can't be tested at all. Use the tailnet origin (`https://macbook-air-m5.halley-morpho.ts.net`); it and every other dev origin must be listed in `src/config/dev-origins.js`.
- **`services/feed.integration.test.ts`'s cursor-stability test fails ~1 local run in 10, and the
  failure is a foreign-key error, not an assertion.** It reads
  `insert or update on table "seen_item" violates foreign key constraint
"seen_item_item_id_item_id_fk"` thrown from `markSeen`, which looks like a bug in `markSeen`
  and is not one. **Cause, verified 09-09-26:** three suites — `db/feed.integration.test.ts`,
  `db/items.integration.test.ts`, `api/routers/routers.integration.test.ts` — seed **un-homed**
  fixture rows (`topicId: null`) and delete them in `afterAll`. Since the WILD tier landed
  (09-06-26) an un-homed row is drawable by _any_ user's page, so when vitest runs those files in
  parallel with this one, a page composes with another suite's fixture row in a WILD slot and
  that row is deleted before the test acks it. Only un-homed fixtures do this: a fixture with a
  test-only `topicId` is unreachable, because `reachableTopics` walks the checked-in graph and no
  test topic is in it. **So a red cursor-stability test is not evidence about your branch, and
  not evidence about SPEC §7.** It passes 5/5 when that file is run alone, and it fails at the
  same rate on commits predating whatever you are testing — check one before believing it. CI
  never sees it (fresh database, and the DB-backed suites are what they are there too, but
  nothing else is racing them). Delete this note if the un-homed fixtures are ever scoped to
  their own database or the files are made to run serially.
- **Local e2e runs against the real corpus, CI against the fixtures alone, and a branch push runs no CI** (09-17-26; `main`'s `e2e` job was red for ten days unseen). Anything that makes the feed depend on corpus _variety_ — `sourceCap`, membership, a new tier — passes `bun run e2e:prod` here and starves there. After touching the feed engine or an e2e fixture, run the suite in CI's shape: `docker run -d --rm --name ambit-ci-pg -e POSTGRES_USER=ambit -e POSTGRES_PASSWORD=ambit -e POSTGRES_DB=ambit -p 5433:5432 postgres:17-alpine`, then with `DATABASE_URL=postgres://ambit:ambit@localhost:5433/ambit` exported: `bun run db:migrate && bun run db:seed && bun run build && E2E_PROD=1 bunx playwright test --workers 1`. Fixtures rotate their `source` through `e2e/support.ts`'s `FIXTURE_SOURCES` and must write `item_topic` rows (`writeMemberships`); seed counts are sized from measured consumption, not from `12 × loads`.
- **A red Postgres-touching integration test usually means the machine is busy, not that the code broke.** Overlapping `bun run test` runs, or a dev server under load, balloon vitest setup from ~7s to ~650s and then fail _unrelated_ integration tests — three times in one session on 2026-08-20, a different test each time. Check what else is running before debugging the test. Delete this note if test isolation is ever fixed; don't leave it as folklore.
- **After `bun add`/`bun remove`, clear Vite's dep cache before trusting a red test run.** Adding
  `sharp` in 7.3 invalidated `node_modules/.vite`, and the symptom was nothing like a dependency
  problem: `bun run test` went from **34 s to 486–1,218 s**, `import` alone taking 700–3,200 s, with
  _different_ tests failing every run — including pure unit tests that cannot fail for logic reasons
  (`routers.test.ts`'s "throws UNAUTHORIZED"), test-file counts varying run to run (77 → 71 → 72),
  and one `saves.list` call taking **826 seconds**. Postgres was provably idle and sub-millisecond
  throughout, and no stray processes were running, so it reads exactly like the busy-machine class
  below and isn't. **`rm -rf node_modules/.vite node_modules/.cache/vite`** put it back to 35 s /
  820 tests immediately. Suspect this whenever the _whole_ suite degrades right after a dependency
  change; the busy-machine note below is for when it degrades without one.
- **The Tumblr walks are what makes `.cache/img` big.** Ben's budgets for the four kept round-3
  blogs are ~89,500 items, ~150 KB each on the cache volume — **~13 GB** on top of the nine
  existing sources — so check the volume's free space before starting one (`df -h` on the cache
  mount; the volume name is in `PHASE8_WALKTHROUGH_8.1.md`). Lowering a budget is one number in
  `blogs.ts`, and the resume cursor makes raising one later free. The _curator's_ download is a
  separate and much larger number, but it is transient and now ~5× smaller than it would have
  been: the walker points `curationImageUrl` at Tumblr's 500 px rendition, so scoring 89,500
  pictures pulls ~12 GB rather than ~58 GB.
- **Deleting `.cache/img` forces the image proxy to refetch from the museums.** It is one
  `<itemId>.webp` per item (Phase 7.3) and safe to delete, but it is also the only thing standing
  between a scroll and `tile.loc.gov`'s per-IP budget — refill it with `bun run img:warm --rate 2`
  rather than letting readers do it. `bun run img:warm --dry-run` counts what a run would fetch. **`.cache/pdr`** (one JSON per Public Domain Review record) is the same kind of thing: safe to delete, but refilling it is a 1.7 GB polite walk, so don't.
- **The `/dev/feed` panel forgets its pages on every apply and on unmount**, but a closed tab
  runs neither: if you tune and then close the tab, the last cycle's rows stay in `seen_item` for
  that user until the panel is opened again. The session mark is persisted in localStorage
  (`ambit.devKnobs.mark`), so the next `/dev/feed` mount forgets from where the closed one
  stopped on its first apply — press **Restart feed** to do it immediately. The panel's "served
  this session" counter is the reminder. One consequence to know: anything that user was served
  on `/feed` _between_ the two dev sessions is forgotten too (the mark predates it). Local only.
- **A valid API key that still 401s is probably being shadowed by the shell.** Bun resolves real
  environment variables _ahead_ of `.env`, so an `export OPENROUTER_API_KEY=…` left in `~/.zshrc`
  wins over the file and editing `.env` changes nothing the process ever sees. This cost most of
  08-22-26: the stale and fresh keys were both 73 chars (`sk-or-v1-` + 64 hex), so length, prefix,
  format and a password-manager comparison all agreed the key was correct. Diagnose with
  `env -u OPENROUTER_API_KEY bun -e '…'` — if that succeeds where a bare run 401s, it's the shadow,
  not the key. (Related tell: OpenRouter's `"User not found."` is an _account_-level error; a
  malformed key reads `"No auth credentials found"`.) The zshrc exports are gone as of 08-22-26,
  but any new machine or re-added export brings it straight back.

- **A production build ignores `?tempo=`** (and `/dev/marks` is a 404) — both are gated on
  `feedDebugEnabled()`. To compare the landing's two tempos on the tailnet device pass, run the dev
  server (`FEED_DEBUG` defaults on there) and open `/?tempo=cut`, then `/?tempo=dissolve`.

- **The Claude judge strips `ANTHROPIC_API_KEY` from its child process on purpose** (`services/claude-judge.ts`): with it set, `claude -p` bills that key instead of using the subscription login. Its calls count against the same five-hour and seven-day limits as Ben's interactive sessions; pass `CURATOR_JUDGE=claude` on the command line, never in `.env`.

- **`OPS_EMAIL` unset means log only.** A server-side throw always writes one JSON line to
  stderr; it is mailed only when `OPS_EMAIL` is set, and it is set on production only. So a
  dev server can throw all day without mailing anyone — and if you want to see the mail path
  locally, set it and read Mailpit (`services/error-report.ts`, 8.2 T2).

## Project log (`log.md`)

Keep a narrative log at repo root in `log.md` — the decisions, findings, and dead-ends that don't live in commit messages. It **complements** commits (which record _what changed in code_); the planning vault's `/brief` skill reads it directly for the Daily Brief. Don't duplicate what a commit already says.

**Format** — append-only, newest on top:

- `## YYYY-MM` month groupers (newest month first).
- `### [[MM-DD-YY ddd]] — <title>` day headings (wikilink form; one entry per day — a second write the same day _extends_ that entry, never adds a duplicate heading).
- Default skeleton `**Shipped:** / **Decisions:** / **Open / next:**`, but flexible — include only what's relevant (an on-demand "log the findings above" might be just a `**Findings:**` block).

**Session spend** — every entry ends with a line recording the token spend of the work it covers. **Never estimate it**; get it from the shared script:

```sh
python3 ~/.claude/scripts/session-spend.py --session <session-uuid>
```

The session UUID is the second-to-last component of the scratchpad path in your system prompt (`…/<project-slug>/<session-uuid>/scratchpad`). Paste its stdout verbatim as the last line of the entry, after the `**Open / next:**` block:

```
*Session spend: 1.24M tok (in 187 · out 38.2k · cache r 1.13M / w 61.4k) · ~$2.41 · opus-5 · 09:12→11:40*
```

- It reports the **delta since its previous run in this session**, so a second write never double-counts the first. When a later session extends the same day's entry, **add a second spend line** rather than editing the first — each covers its own session, and the time windows tell them apart.
- Subagent spend is included (attributed by time window, since subagent transcripts carry no link to the parent).
- The dollar figure is list-price arithmetic, not what the subscription actually bills.
- **If the script exits non-zero** (no transcript, or nothing new since the last entry), **omit the line entirely** — don't substitute a guess.

**Write triggers:**

1. **On-demand** — "log this" / "summarize the above and log it".
2. **At commit checkpoints** — when you commit at the user's request, update `log.md` if the work since the last entry is narrative-worthy. A considered update at a natural boundary, _not_ a line per commit.
3. **End of session** — backstop for sessions that end without a commit. Only on genuine progress; skip trivial sessions.

## Ecosystem coordination (Ambit-Admin)

Ambit is one of three cooperating services — with **ambit-archive** (`~/Dev/ambit-archive`, Ben's private personal-image source) and **loupe** (`~/Dev/loupe`, his personal magazine-clipping bench). The cross-project map lives in Ben's private vault at `~/vaults/Memory-Palace/05 Projects/Ambit-Admin/` (`Ecosystem Architecture.md` + `Roadmap & Backlog.md`). The parts that bind this repo:

- **The boundary is rights/visibility**: Ambit houses public, public-domain and openly-licensed sources every user may see (new _public_ sources land here, in `server/services/sources/`); personal/experimental/unattributed content stays in ambit-archive; personal-use archive material stays in loupe. Ambit is the ecosystem's **only user-facing surface** and the sole gate for the planned per-user content-pool privileges.
- **Two rights postures live under Ambit's roof as of 08-20-26** (Ambit-Admin decision). Alongside owned display of open material, Ambit does **link-card display of designated blogs**: a single image or short excerpt + a visible `from: <blog>` credit + a **prominent link to the original**, in the shape of a social link preview and **never a republished article**. **No fair-use claim** — license strings stay honest ("Rights retained by original authors"), removal on request is the standing policy, and the point of the link-out is to drive readers _to_ the blog. Full article text is used at ingest only, never stored for display. Tenable because Ambit is invite-only and non-monetized. Designed and built 08-25/27-26 — SPEC §6.1, `docs/PHASE6_DESIGN_6.3.md`, `docs/PHASE6_WALKTHROUGH_6.3.md`.
- **Two blessed source-integration patterns**: search-shaped (`search(q)`, ranked order — the museums, ambit-archive) and corpus-walk (cursor-paginated full ingest — loupe, whose adapter must fail fast on 401/403 and never dedupe on loupe article `id`). Don't invent a third shape. _Corpus-walk is now implemented in-repo (`CorpusWalkAdapter` in `server/services/sources/types.ts`, Phase 6.3) — loupe's adapter (`sources/loupe.ts`) uses it. Designated blogs are registered in `src/server/config/blogs.ts`; a blog's `body` is always null._
- The `SourceAdapter` contract (`server/services/sources/types.ts`) is a **cross-service agreement** — ambit-archive built to it verbatim. Before changing it (or either private-source integration), read the Ambit-Admin doc and record the decision in its log.
