# Design — the Claude judge and the weekly Mac ingest (10-01-26)

**Source:** `docs/HANDOFF_claude-judge-ingest.md` (what Ben asked for, what exists, the open
questions). This file records the decisions; `docs/PLAN_claude-judge.md` builds piece 1.
Pieces 2 and 3 (the split, the host) get their own plan once Ben has described the always-on Mac.

## What was measured (this Mac, Claude Code 2.1.286, Haiku 4.5)

| Call                                                     | Input tokens | Time   |
| -------------------------------------------------------- | ------------ | ------ |
| The handoff's baseline `claude -p --model haiku`         | ~54,000      | ~4 s   |
| Stripped (own system prompt, no tools, no settings, no MCP) | 432       | 1.2 s  |
| Stripped, thinking off (`MAX_THINKING_TOKENS=0`)         | —            | 0.5 s  |
| Stripped vision, a 178 KB WebP as inline base64 (thinking on) | 1,418   | ~5 s   |

The stripped flags, all read from `claude --help` on the installed version:

```
claude -p --model <id> --input-format stream-json --output-format stream-json --verbose \
  --system-prompt <prompt> --tools "" --setting-sources "" --strict-mcp-config \
  --disable-slash-commands --no-session-persistence
```

- **A picture goes in as bytes, with no tools.** `--input-format stream-json` takes one user
  message on stdin whose content is Anthropic blocks, so an image is a base64 `image` block.
  The "bytes, never the URL" rule holds unchanged.
- **The stream reports the subscription's limits.** Every call emits a `rate_limit_event` with
  `status` and `unifiedWindows.{five_hour,seven_day}.{utilization,resetsAt}` (0.23 and 0.22 at the
  time of the probe).
- **Haiku fences its JSON** (` ```json … ``` `) even when told not to.
- **`--bare` is unusable**: it never reads the subscription login.
- **Terms, checked 10-01-26: permitted.** The Consumer Terms bar automated access "except …
  where we otherwise explicitly permit it"; `claude -p` is Anthropic's own documented
  non-interactive mode, the docs name scheduled jobs as a use, and the Agent SDK help article
  describes subscription use as "individual experimentation and automation". The limits:
  subscription login is for the purchaser's own use of the unmodified CLI (never routed on
  behalf of other users), and advertised limits "assume ordinary, individual usage". Ambit's
  ingest is Ben's own job on his own machine, so it fits; the 80% ceiling (D7) is what keeps it
  ordinary.
- **A billing change is pending and paused.** Anthropic announced that from 06-15-26
  `claude -p` and the Agent SDK would stop drawing on subscription limits and draw on a separate
  monthly credit at API rates ($100 Max 5x, $200 Max 20x; requests stop when it is spent unless
  usage credits are enabled). It was paused on the day: today `claude -p` still draws on the
  subscription's limits, which the probe's `rate_limit_event` confirms. If it un-pauses, the
  judge keeps working but its budget becomes dollars of credit rather than a share of the weekly
  window, and D7's ceiling needs a second reading. The run's `total_cost_usd` is already in the
  stream for that.

## Decisions

- **D1. The judge is a second transport under `callCurator`, chosen by the model's name.** A
  model id starting `claude-` goes to `claude -p`; anything else goes to OpenRouter. The retry
  loop, the parsers, the fail-fast rule and the cache stay shared.
- **D2. One env setting picks the default judge: `CURATOR_JUDGE=openrouter|claude`.** Unset means
  `openrouter`, so production's nightly ingest is untouched until piece 3. **OpenRouter is kept
  as a manual switch; nothing falls back automatically** (Ben, 10-01-26), so one run never mixes
  two judges.
- **D3. Haiku 4.5 (`claude-haiku-4-5-20251001`) for writing and pictures, thinking off.**
  Calibration is the gate. Two levers exist if it fails, both through the model name: a
  `+think` suffix (thinking on, its own cache namespace) and any other `claude-*` id.
- **D4. The two judges coexist; a full re-score is decided later** (Ben, 10-01-26). The cache key
  already includes the model, so Haiku envelopes and the ~170k flash-lite envelopes sit side by
  side and neither reads the other's. The calibration and the first big run produce the two
  numbers that decision needs: score drift per source, and an item's cost against the weekly
  limit. No re-score tooling is built now.
- **D5. Prompts are not edited.** `CURATOR_PROMPT` and `WRITING_PROMPT` stay byte-identical so
  production's flash-lite cache stays valid. Temperature cannot be set through the CLI; the
  calibration measures the judge as it actually runs.
- **D6. Pictures are downscaled before they are sent to Claude**: fit inside 1024 px, JPEG.
  The API refuses images over 5 MB and formats outside JPEG/PNG/GIF/WebP, and museum originals
  are both. A picture `sharp` cannot decode is reported the way an unfetchable one is today
  (judged from text, counted per source). The OpenRouter path is unchanged.
- **D7. The limit is a ceiling, and reaching it is a clean stop.** When either window's
  utilization reaches `CLAUDE_JUDGE_MAX_UTILIZATION` (default `0.8`, leaving a fifth of the
  subscription for Ben's own sessions), or the status is `rejected`, the run raises
  `CuratorAbortError`. Judgments already made are cached, so the re-run resumes free.
- **D8. Vision is accepted by comparison, then by Ben's eye.** `bun run vision:compare` re-scores
  a stratified sample of already-scored pictures under Haiku and writes the per-source shift,
  rank agreement and the twenty largest disagreements to `docs/vision-comparison.md`. Proposed
  bar: Spearman ≥ 0.6, overall mean shift within ±0.5, no source shifting more than 1.0. The
  verdict is Ben's.
- **D9. The publications stay suspended until piece 3.** Their backfill (~10,750 pieces) is the
  judge's first big run, done **locally** with explicit `--source … --backfill`. It fills the
  Mac's curation cache, which becomes the canonical one. Un-suspending them while production
  still runs flash-lite nightly would score the same pieces under two judges.
- **D10. Weekly, as two jobs** (piece 2): pictures on **Monday**, writing on **Thursday**, 01:30
  UTC (Ben, 10-01-26). Split by item type after normalization, since PDR carries both.
- **D11. The Mac reaches production's Postgres through an SSH tunnel** via VM 202 (Ben,
  10-01-26). No port is published.

## Open, for the piece 2/3 plan

- The always-on Mac: chip, RAM, macOS, hostname/IP, SSH, sleep settings, same LAN as VM 202,
  Claude Code logged in.
- The health witness: `INGEST_STALE_AFTER_MS` is 30 h and a weekly cadence would read `stale`
  six days in seven. Needs a per-kind witness and a threshold near eight days.
- What replaces Coolify's failure notification (launchd plus a failure hook), where `img:warm`
  runs after a Mac ingest, and which cache is pushed where.
- Whether a five-hour stop should wait for the reset and resume by itself on a weekly night.
