# Handoff — Phase 8.2, Tasks T3.1 → T5 (Ben's hands, agent verifies)

_Written 09-18-26 so the next session can start without reading the plan or the walkthrough.
Everything a step needs is here; `docs/PHASE8_PLAN_8.2.md` and `docs/PHASE8_WALKTHROUGH_8.2.md`
are the long form if something below is not enough. Read this file, run the "Start here" block,
then go step by step. Tick each box here as it lands; the walkthrough gets the observed wording
at the end (T7 collects it)._

## Where things stand (09-18-26 14:30 UTC)

- **Production** = `https://ambit.benreilly.io`, commit `a472e7a` (PR #20: 8.2 T1+T2), deployed
  ~03:00 UTC 09-18. `/api/health` → `{"ok":true,"db":"ok","imageCache":"ok","ingest":"never",
  "lastIngestAt":null}`. `never` is correct: the `ingest_run` table exists and is empty because
  the only nightly since the migration ran _before_ the deploy, on the old code.
- **Last night's ingest was healthy** (`/app/.cache/ingest-2026-09-18.log` in the container):
  nine search sources all offered rows with `errors 0`, ten walks all offered, no dead source,
  53 inserted, 145 memberships, `elapsed: 2719.8s`.
- **T3.0 is done and verified** — `scheduled_tasks.timeout` is `10800` on `ingest` and
  `img-warm` since 09-10 (`.cache/coolify-ingest-task.sh`), and the 45-minute run above is the
  proof it holds. So _Scheduled Tasks → Failure_ is safe to enable.
- **Tonight (01:30 UTC = 21:30 EDT 09-18) is the first nightly on the 8.2 code.** Health should
  read `"ingest":"ok"` by the morning of 09-19. That moment gates T4.3 (the keyword monitor).
- `OPS_EMAIL` is set in the container (T2.5 done). T2's mailer is live: a server error now writes
  one JSON line to the container log and mails Ben once per error signature per hour.
- Repo: `main`, clean after this handoff's commit. No branch is open. Nothing to build.

## Start here (agent, ~1 min)

```bash
cd ~/Dev/ambit && git status -sb                    # clean, on main
curl -s https://ambit.benreilly.io/api/health        # ingest: ok (after 09-19) | never (before)
ssh ben@192.168.1.202 'C=$(docker ps -q --filter publish=3000); docker exec "$C" ls /app/.cache | grep ingest- | tail -3'
```

If health still reads `never` after the 09-19 nightly, the run threw before its `ingest_run`
write: read `/app/.cache/ingest-2026-09-19.log` (tail) and the `ingest_run` table:

```bash
ssh ben@192.168.1.202 'docker exec bbzic3lx3ybsmkxjueae0da9 psql -U ambit -d ambit -Atc "select id, started_at, finished_at, exit_code, inserted from ingest_run order by started_at desc limit 3"'
```

(`bbzic3lx3ybsmkxjueae0da9` is the `ambit-db` container, `postgres:17-alpine`; its name is stable
across app deploys, unlike the app's.)

## Standing facts you will need

| Thing | Value |
|---|---|
| VM 202 (Coolify host) | `ssh ben@192.168.1.202`; Coolify UI at `http://192.168.1.202:8000` (LAN only) |
| Ambit container | `C=$(docker ps -q --filter publish=3000)` — never by name, the name carries a per-deploy suffix |
| Ambit DB container | `bbzic3lx3ybsmkxjueae0da9` (`ambit-db`, `postgres:17-alpine`, no public port) |
| Coolify DB (read only from the agent) | `docker exec coolify-db psql -U coolify -d coolify -Atc "..."` |
| Scheduled tasks on the host | `ingest` `30 1 * * *` UTC, timeout 10800, enabled; `img-warm` monthly, timeout 10800, disabled |
| Backup | `0 4 * * *` UTC, per-database `pg_dump` (8.1 T8) |
| Beszel hub | `https://beszel.home.benreilly.io` (VM 200, `HUB_URL=http://192.168.1.200:8090` from an agent) |
| Resend | domain `ambit.benreilly.io` verified, DKIM proven 8.1 T5; app sends as `MAIL_FROM` |
| Health contract | `ingest` is `ok` (success < 30 h old) / `stale` / `never` / `unknown`; **never changes the status code** |
| Agent limits on the host | reads over ssh are fine; the classifier refuses DB writes, ingests and `docker run` on VM 202 — ship those as `.cache/*.sh` for Ben |

**Rules that hold for every step:** secrets never touch the repo, the log, or a transcript
(compare fingerprints, never values). Every _Success_ notification toggle stays off. No deploy
during an ingest (01:30–02:30 UTC) or a warm.

## T3 — Coolify notifications → email via Resend (Ben, ~20 min)

- [x] **3.0 Timeout** — done, see above.
- [ ] **3.1 Second Resend key.** Resend dashboard → API Keys → _Create_: name `coolify`,
      permission **Sending access**, domain restricted to `ambit.benreilly.io`. Password manager
      first, then Coolify. Never reuse the app's key (one key per consumer, so either rotates alone).
- [ ] **3.2 Coolify → Settings (team) → Notifications → Email → Resend.** Paste the key, recipient
      = Ben's address. **Read off the UI and write down here** two things the docs left open:
      (a) does the Resend channel ask for a from-address? If yes use
      `Ambit Ops <ops@ambit.benreilly.io>` (same verified domain, DKIM passes). (b) the exact
      toggles under _Container Status Changes_. Then _Send test notification_ → the mail arrives;
      view headers, `dkim=pass`.
      - Observed from-address field: ______
      - Observed container-status toggles: ______
- [ ] **3.3 Events on:** _Deployments → Failure_, _Deployments → Container Status Changes_,
      _Backups → Failure_, _Scheduled Tasks → Failure_, _Server → Unreachable_,
      _Server → Disk Usage_ (keep Coolify's default threshold; note it: ______).
      **Every Success toggle off.**
- [ ] **3.4 Prove the one that matters.** Coolify → Ambit application → Scheduled Tasks → _Add_:
      name `fail-probe`, command `false`, any frequency, **disabled**. _Execute now_. Within a few
      minutes: one mail naming the task and the non-zero exit. Then **delete the task**. This is
      exactly the path a dead-source ingest takes (`runVerdict` exits 2).
      - Mail arrived at: ______ · subject/wording: ______
- [ ] **3.5 Backups → Failure** cannot be forced safely; record it as _configured, not exercised_.

**Fallback:** channel refuses the domain-restricted key → mint one without the restriction, still
Sending-only, note it. No mail at all → Resend → Logs: an attempt with an error is a key/domain
problem; no attempt is a Coolify config problem.

_Done = a failing scheduled task produced one email through Resend; the blanks above are filled._

## T4 — External uptime monitor (Ben, ~15 min; 4.3 after the first `"ingest":"ok"`)

- [ ] **4.1** Sign up for UptimeRobot (free tier). **Check the pricing page at signup** for: ≥ 2
      HTTP monitors, keyword matching, 5-min interval, email alerts. If keyword monitors are no
      longer free → Better Stack; if neither → Uptime Kuma on VM 200 with the LAN blind spot
      recorded (it cannot see the WAN go down; that is the whole point of a hosted one).
- [ ] **4.2 Monitor A — `ambit / health`:** HTTP(s) `https://ambit.benreilly.io/api/health`,
      interval 5 min, alert on non-200, email Ben. Record the check-from locations (must be
      outside the house): ______
- [ ] **4.3 Monitor B — `ambit / ingest`:** keyword monitor, same URL, keyword `"ingest":"ok"`
      (with the quotes and colon exactly), **alert when the keyword is absent**, interval 30 min.
      Create it **the morning after health first reads `ok`** (expected 09-19), or accept one
      known alert.
- [ ] **4.4 Prove it without breaking anything:** edit Monitor B's keyword to `"ingest":"nope"`
      → alert mail at the next check → restore → recovery mail. Record both timestamps: ______

_Done = two monitors green from outside the LAN; a deliberately wrong keyword alerted and
recovered by email._

## T5 — Beszel agent on VM 202 + log rotation (Ben ~10 min; 5.3 is done)

- [ ] **5.1 Hub:** `https://beszel.home.benreilly.io` → _Add system_: name `archive-host`, host
      `192.168.1.202`, port `45876` → copy the `docker run` it shows (it embeds the hub's public
      **KEY**; the **TOKEN** is the universal one from Settings → Tokens & Fingerprints).
- [ ] **5.2 VM 202** — a standalone `docker run`, **not** a Coolify resource (a Coolify reset must
      never take the monitor with it). Write it to a file on the VM and run the file (long
      pasted lines wrap and fail silently in Ben's terminal):
      ```bash
      docker run -d --name beszel-agent --restart unless-stopped --network host \
        -v /var/run/docker.sock:/var/run/docker.sock:ro \
        -v beszel_agent_data:/var/lib/beszel-agent \
        -e LISTEN=45876 -e HUB_URL=http://192.168.1.200:8090 \
        -e KEY='<key from 5.1>' -e TOKEN='<token>' \
        henrygd/beszel-agent
      ```
      `HUB_URL` is the LAN IP, never `localhost`. Hub shows `archive-host` green with a container
      list on which `ambit-*` has a health column (its `HEALTHCHECK`); the archive's does not.
- [x] **5.3 Log rotation — read 09-18-26, already bounded, nothing to change.**
      `docker inspect -f '{{json .HostConfig.LogConfig}}' "$C"` →
      `{"Type":"json-file","Config":{"max-file":"3","max-size":"10m"}}` — Coolify sets this by
      default on every application container, so the plan's fear (unbounded stdout after T2's
      error lines) does not apply. 30 MB ceiling per container. Goes into SPEC §13's deployed
      facts at T7; no Custom Docker Options needed.
- [ ] **5.4 Vault:** `homelab-reference.md` Beszel inventory gets the `archive-host` row;
      `plan.md` #34 gains "Ambit 8.2 wants Beszel alerts once a channel exists — CPU/disk on
      `archive-host`, container-stop on `ambit-*`".

_Done = VM 202 is in Beszel; the log driver is already bounded (above); the vault knows both._

## After T5 — what the agent does next (no hands needed)

- **T6.1** write `docs/BETA_INSTALL.md` (≤ 20 lines, paste-into-a-text shape: the URL, "sign up
  with the address I invited", iOS Share → Add to Home Screen, Android/desktop install prompt,
  what to expect, one ask: "tell me the first thing that felt wrong"). **T6.3** create
  `docs/BETA_FEEDBACK.md` with the table header `date · who (role) · screen · what they said ·
  triage`. Then Ben invites two or three people: `docker exec "$C" bun run invite <email>`.
- **T6.4** the watched week: each morning health, inbox, OpenRouter usage, and on the host
  `du -sh .cache/img` + `select count(*) from item` + one `ingest_run` row per night with
  `exit_code = 0`.
- **T7** closes the phase: BUILD_PLAN 8.2 ✅, SPEC §13 _Operations_ subsection, CLAUDE.md status
  paragraph, walkthrough in the A.6 shape, vault log, `log.md`.

## Optional shortcut

If Ben is signed into Coolify and UptimeRobot in Chrome, the agent can drive 3.2–3.4 and 4.1–4.4
through the browser tools while Ben watches; only the Resend key paste (3.1/3.2) stays Ben's.
