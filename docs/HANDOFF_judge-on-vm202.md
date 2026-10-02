# Handoff — plan the judge's move to VM 202 (10-02-26)

**For a fresh Fable session with Ben present.** The job is to write
`docs/PLAN_judge-on-vm202.md`: pieces 2–3 of the Claude judge, self-contained, for a cheaper
session to execute cold. No code in this session.

## The goal, in Ben's words

Run the ingest overnight on one of his computers so it spends his Claude subscription tokens
instead of OpenRouter credit. Where it runs was open; it is now settled as VM 202 (below).

## Read first

1. `docs/DESIGN_claude-judge-ingest.md` — decisions D1–D11, **Results**, and **"Open, for the
   piece 2/3 plan"**, which is the list this plan has to close.
2. `docs/PLAN_claude-judge.md` — piece 1, built and deployed. Its shape is the model for this
   plan.
3. `log.md`, the 10-01 and 10-02 entries.
4. `src/server/services/claude-judge.ts` (the transport, `CLAUDE_CONCURRENCY`, the 80% stop),
   `scripts/ingest.ts`, `src/app/api/health/route.ts` (`INGEST_STALE_AFTER_MS`), `Dockerfile`.
5. `docs/PHASE8_WALKTHROUGH_8.1.md` and SPEC §13 for the deployed facts.

## What is true today

- Piece 1 is on `main` and deployed. `CURATOR_JUDGE` is unset on production, so the nightly
  still judges through OpenRouter. Sonnet 5.5 judges writing and Haiku 4.5 pictures, each with
  its own Claude prompt and cache version.
- All seven publications are held in `SUSPENDED_SOURCES` until production's judge is Claude.
- **The host is VM 202** (10-02-26). A homelab session checked the NUC: it is an i5 with
  4 cores / 8 threads, idle, and VM 202 is configured `cores: 4` but `vcpus: 1`. Ben is raising
  it with `qm set 202 --vcpus 4` and a reboot. A separate VM and the MacBook Air were both
  considered and set aside: a new VM spends 1–2 GB on a second OS and sends the database
  credential across hosts; the Mac sleeps and needs an SSH tunnel to Postgres.
- **VM 202, measured idle on 10-02:** 7.9 GB RAM, ~6.0 GB available, all containers together
  ~0.8 GB; 4 GB swap; 41 GB of 116 GB disk free; the image cache is 29 GB. `claude` is installed
  neither on the host nor in the app container (Debian 13 trixie). **Confirm `nproc` reads 4
  before planning around four workers.** Memory at the 01:30 ingest peak has not been measured.
- **Disk is to be conserved** (Ben, 10-02-26). The Met crawl is paused
  (`INGEST_PAUSED_SOURCES`) and stays paused after the move. The plan must not assume the
  ingest's footprint may grow freely; say what each step adds to the cache volume.
- The auto-mode classifier refuses agent-run database writes and ingests on VM 202. Anything
  that writes there ships as a short script under `.cache/` for Ben to run.

## What the plan has to settle

Take each with Ben; these are his calls, not defaults to pick silently.

1. **Where `claude` is installed** — in the image (the design's lean) or on the host. In the
   image, it must be pinned: the judge has a tripwire for a CLI that stops honouring the
   stripping flags, and an auto-update inside a container is the way to meet it.
2. **The subscription token** — `claude setup-token`, held as a Coolify secret, surviving
   redeploys. It is a credential for Ben's whole subscription. The judge strips
   `ANTHROPIC_API_KEY` from its child on purpose; keep that.
3. **The schedule** — D10 says pictures Monday, writing Thursday, 01:30 UTC, in place of the
   nightly. Confirm it still stands, and the `--kind` split in `scripts/ingest.ts` it needs.
4. **The health witness** — a 30 h threshold reads `stale` six days in seven under a weekly
   cadence, and the UptimeRobot keyword monitor watches `"ingest":"ok"`. A per-kind witness and
   a threshold near eight days.
5. **The flip** — setting `CURATOR_JUDGE=claude` makes every stored item a cache miss under the
   new key. Decide what is re-judged, what is not, and that the local Claude cache is pushed to
   the volume first (`.cache/push-caches.sh` is the pattern).
6. **Concurrency and the first run** — start at two workers, watch Beszel, then four.
7. **A five-hour stop** — whether a run that hits 80% waits for the reset and resumes, or ends
   and picks up next week. And that these calls share the windows Ben's own sessions use.
8. **The publications backfill** — ~10,750 pieces through Sonnet, in batches, on the dev Mac
   with the cache pushed, or on the VM. Then un-suspend the seven and flip
   `publications.test.ts`.
9. **Fallback** — OpenRouter stays a manual switch, never automatic (Ben, 10-01-26). The plan
   should say how to flip back in one step.

Two review items from piece 1 that matter before the flip: the whole-corpus re-judging on cache
misses (item 5), and whether the usage report flags paid overage.

## Not in this plan

The per-reader dark-material setting, a fresh batch of writing marks, porting the Met adapter
to `/v1.1/search`.
