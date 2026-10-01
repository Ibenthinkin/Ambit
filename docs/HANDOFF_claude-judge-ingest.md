# Handoff — the Claude judge and the weekly Mac ingest (10-01-26)

**What this is:** the pickup for a **separate session** that designs and plans this work. It is
written cold: everything Ben decided, everything measured so far, and the open questions. Nothing
in it is built. This is an **architectural** change: brainstorm → `docs/DESIGN_*.md` → Ben
approves → `docs/PLAN_*.md`. Per Ben's habit, the plan should be executable cold by a cheaper
model.

A parallel session on `feat/publications` is finishing the publications work: seven publications,
newest-first backfill budgets of about 10,750 pieces in total. That work does not depend on this.
See "Overlap with the publications branch" at the end.

## What Ben asked for, in his words (10-01-26)

> "the system of using open router to evaluate material was developed before i subscribed to a
> max plan. we now have like 10x the tokens that we used to have. let's build a way to do it
> locally using one of the cheaper claude models"

Then, answering the scoping questions:

- **The judge covers writing *and* pictures**: both the writing curator and the vision curator.
- **Ingest becomes weekly, as two jobs**: "one for images, and another for writing, so one night
  per week for each."
- **Everything runs through a Mac on Ben's Claude subscription**: "i want for big runs and back
  fills but ALSO the weekly ingest to run through the mac using my claude subscription."
- **Evaluate an always-on Mac on his network as the ingest host**: "I also have a mac that's
  always on on my network so let's evaluate if it would be viable to move those ingest jobs over
  to it." **Ben will answer the questions about that Mac in your session**: chip, RAM, macOS,
  hostname/IP, SSH access, sleep settings.

So the target is that **production stops calling OpenRouter**, and a Mac runs both weekly
ingests and every big run on Ben's subscription.

## Three sub-pieces (a suggested decomposition, not decided)

1. **The judge backend.** A second implementation of the curator's model call that shells out to
   `claude -p` (Claude Code headless, logged in with Ben's Max account) on Haiku 4.5. It is used
   for writing and vision, and must be calibrated against Ben's marks before anything trusts it.
2. **The split.** Ingest as two jobs, pictures and writing, each run weekly.
3. **The host.** Moving those jobs off the Coolify scheduled task onto the always-on Mac, with
   everything the Coolify task gives today rebuilt there (failure mail, the health witness).

Piece 1 is useful on its own (backfills and re-scores from the dev Mac), so it can ship first.

## What exists today: where to read

### The curator (`src/server/services/curator.ts`)

- **`callCurator<T>()` (~line 825)** is the one place the network call happens: a `fetch` to
  `https://openrouter.ai/api/v1/chat/completions`. A second backend plugs in here.
  `CURATOR_MODEL = "google/gemini-2.5-flash-lite"` (line 35).
- **Always send `max_tokens`.** OpenRouter reserves `max_tokens` × price against the balance (the
  comment at ~line 39). This doesn't apply to `claude -p`, but the reasoning there is worth
  reading.
- **Two prompts.** `CURATOR_PROMPT` is vision: a score, aesthetic tags, topics. `WRITING_PROMPT`
  (`WRITING_PROMPT_VERSION`) is text: a score, a kind, tags, topics. **The writing prompt's text
  is load-bearing for the cache.** Production's cache was kept valid on 09-30-26 by leaving it
  byte-identical; read `docs/HANDOFF_writing.md` before editing either prompt.
- **The cache key includes the model.** See `curationCacheKey()` (~line 552); the writing key is
  `model | w<version> | writing | source:sourceId`. Envelopes live in `CURATION_CACHE_DIR`
  (`.cache/curation`, one file each, on production's cache volume). **So a Haiku judge misses
  every existing envelope**, and a mixed world (production on flash-lite, the Mac on Haiku)
  can't share a cache unless lookups accept more than one model. Decide which is the canonical
  judge and what happens to the ~170k existing flash-lite envelopes. Rescoring the whole corpus
  under Haiku is a real option on a subscription; it was never an option at OpenRouter prices.
- **Vision sends bytes, never a URL.** Museum image servers bot-block third-party fetchers
  (CLAUDE.md, Architecture). The curator fetches the image itself (`curationImageUrl`, ~line 416
  `fetch(candidate…)`). With `claude -p`, the image has to reach the model as a local file the
  session can read, and the vision prompt must still see what it sees today.
- **Fail-fast.** Since 09-08-26 the curator stops a run on an OpenRouter 401/402. The equivalent
  for a subscription is hitting a usage limit mid-run. Everything already scored is cached, so a
  restart is free; make "limit reached" a clean, resumable stop.
- **Fixed costs to compare against:** image curation measured **$0.000235/item** on flash-lite
  (09-06-26). Writing is about $0.0005/item (8,000 chars, `WRITING_TEXT_CHARS`).

### Calibration

- **Writing:** `bun run writing:calibrate` (`--sample`, `--read`, `--rescore`), against
  `docs/writing-calibration.md`, which holds 40 pieces with Ben's marks. flash-lite v1 had
  MAE 0.90 overall: Wikipedia 0.67, PDR 0.29, Loupe 1.71 (Loupe is excluded from re-scoring).
  `--rescore` re-scores exactly the pieces in the file, keeping Ben's marks. **This is the gate
  for a Haiku writing judge.** Calibration is keyed on the model, so flash-lite and Haiku can sit
  side by side.
- **Vision:** there is no equivalent of Ben's marks for pictures. The Phase 0 taste work lives in
  `phase0/`. The design needs to say how a Haiku vision judge is accepted, for example by
  scoring a few hundred already-scored items and comparing distributions per source.

### The `claude -p` probe (10-01-26, this Mac, Claude Code 2.1.286)

`echo 'Reply with ONLY {"ok":true}' | claude -p --model haiku --output-format json`:

- It works on the subscription, round-trip **~4 s** (`duration_api_ms` 2,114).
- **About 54k tokens of overhead per call**: `cache_creation_input_tokens` 40,313 plus
  `cache_read_input_tokens` 13,803. That is Claude Code's own system prompt, tools, this repo's
  CLAUDE.md and memory. `total_cost_usd` 0.082 is a nominal figure, not a bill, but the tokens
  count against the subscription's usage limits. **Overhead dominates a one-line judgment.** To
  check in the design session: run from an empty scratch directory (no CLAUDE.md, no project
  memory); replace the system prompt (`--system-prompt`); turn tools off except what vision
  needs; skip settings sources; cap at one turn; and **batch** several items per call. Read
  `claude --help` for the exact flags in the installed version rather than trusting this list.
  The Agent SDK (TypeScript) is the alternative to spawning the CLI. Use the claude-code-guide
  agent or the docs to confirm both.
- **Subscription limits are shared** with Ben's interactive sessions, and there are weekly
  caps. A 10k–100k item run has to pace itself, and the design should estimate a run's share of
  the weekly limit. Also confirm that unattended weekly automation on a personal Max plan is
  within its terms.

### Ingest today

- **One Coolify scheduled task** on VM 202 runs the ingest **nightly at `30 1 * * *` UTC**:
  `docker exec` into the app container, `bun run ingest`. Its timeout was raised to 10,800 s
  on 09-10-26. **Coolify's task status is not evidence**; the database is. See CLAUDE.md, and
  `docs/PHASE8_WALKTHROUGH_8.1.md` §7.3 and T3.0.
- **A walk source's nightly bound** is its `walkQuota` (`config/blogs.ts`,
  `config/publications.ts`). `--quota`/`--cursor`/`--source` are the backfill levers
  (`scripts/ingest.ts` header). A bounded run is never `complete`, so `--prune` never acts on it.
- **Writing vs pictures inside ingest.** `scripts/ingest.ts` already routes articles to the
  writing curator and everything else to vision (~lines 584–600), after the writing floor
  (~line 533). A source can carry both: PDR has image collections and article essays. The split
  probably wants a `--kind images|writing` (or two source lists) **filtered by item type after
  normalization**, not by source alone. Wikipedia, the publications, Loupe and PoetryDB are
  writing; the museums, the blogs and Tumblr are pictures; PDR is both.
- **The health witness (8.2).** Every run writes an `ingest_run` row. `/api/health` reports
  `ingest: ok|stale|never|unknown`, and **`INGEST_STALE_AFTER_MS` is 30 hours**
  (`services/ingest-health.ts`, pinned by a test). UptimeRobot alerts on the `"ingest":"ok"`
  keyword. **A weekly schedule makes production read `stale` six days a week and pages Ben**,
  so the threshold, and possibly a per-kind witness, has to change with the schedule. SPEC §13
  has the alert map.
- **Other alerts tied to the Coolify task:** the exit-2 verdict on a dead source, Coolify's
  failure notifications through Resend, and `OPS_EMAIL` error mail from `instrumentation.ts`.
  Moving the job to a Mac drops Coolify's notification. Something on the Mac (launchd plus a
  failure hook) has to replace it.

### Production topology: the hard constraints for a Mac-run ingest

- **Production's Postgres has no public port**: `ambit-db`, `postgres:17-alpine`, internal
  Coolify network only (`docs/PHASE8_WALKTHROUGH_8.1.md` table, line ~23). A Mac-run ingest
  needs a route to it: an SSH tunnel through VM 202 into the docker network, a LAN-only
  published port, or something else. That's a security decision for Ben, and SPEC §11 has the
  posture.
- **The image cache lives on production's volume.** `/api/img/[itemId]` fills
  `IMAGE_CACHE_DIR`, files are named by **production's** item id, and `img:warm` runs inside
  the container. A Mac ingest writes rows; the warm still has to happen in production (SSH
  `docker exec … img:warm` after the run, or let readers fill it, which `tile.loc.gov`'s per-IP
  budget argues against).
- **The curation cache lives on the volume too** (`.cache/curation`). If judging moves to a Mac,
  the Mac's cache becomes canonical, and `.cache/push-caches.sh` (tar over SSH, skips files
  already there) is the existing tool for moving it.
- **The image curator fetches pictures from the museums itself.** From a home Mac that is Ben's
  residential IP, which is probably the same egress as the VM (same LAN), but confirm it.
- **The agent may not write to the production database or run ingests there.** The auto-mode
  classifier refuses it. Ship production steps as short `.cache/*.sh` scripts for Ben to run;
  long single-line `ssh` commands wrap in his terminal and fail silently. Find the container by
  port: `C=$(docker ps -q --filter publish=3000)`.
- **Secrets.** A Mac ingest needs production's `DATABASE_URL` (through whatever route is
  chosen). `OPENROUTER_API_KEY` goes away if OpenRouter is retired. Remember the shell-shadowing
  trap in CLAUDE.md: Bun reads real environment variables before `.env`.

## Open questions for Ben (ask one at a time, in the design session)

1. **The always-on Mac**: chip, RAM, macOS version, hostname/IP, SSH, set never to sleep? Is it
   on the same LAN as VM 202 (192.168.1.202)? Will Ben log Claude Code in on it?
2. **Which nights**: which day of the week for pictures and which for writing (the cron clock is
   UTC)?
3. **OpenRouter**: retired completely, or kept as a fallback when the subscription is
   rate-limited or the Mac is down?
4. **The judge model**: Haiku 4.5 for both, or Haiku for writing and something stronger for
   pictures, if calibration says so?
5. **The existing corpus**: re-score everything under the new judge (consistent scores, a large
   but now affordable run), or score only new items and let the two judges coexist?
6. **The DB route**: SSH tunnel or a LAN-only port?

## Overlap with the publications branch (`feat/publications`)

- The publications session is setting **newest-first backfill budgets**: Marginalian 2,000,
  JSTOR Daily 2,000, Longreads 2,500, Aeon 2,000, Psyche 1,000, Noema 1,250, Paris Review the
  newest ten. That's about 10,750 pieces, and `walkQuota` becomes the per-run (weekly) bound.
  The backfill script there (`.cache/publications-backfill-prod.sh`) currently judges on
  OpenRouter, at roughly **$5–6** for 10,750 pieces. Ben may run it before this lands or wait
  for the Haiku judge; this work doesn't need to block on it.
- `feat/publications` adds `sources/sitemap.ts` and four publications. No curator changes, so
  there's no conflict with piece 1 here.
- Ben's uncommitted `src/server/config/topic-groups.ts` edit in the main checkout is his; leave
  it alone.
- **Two sessions share `~/Dev/ambit`.** Work in a worktree (Ben is fine with one when another
  session holds the checkout) or on a branch you check out only after this session has
  committed. Don't switch branches under the other session.
