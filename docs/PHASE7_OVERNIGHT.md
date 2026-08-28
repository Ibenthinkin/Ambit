# Phase 7.2 + 7.3 — the overnight run

The runner contract for executing `docs/PHASE7_PLAN_7.2.md` and then `docs/PHASE7_PLAN_7.3.md` unattended, in one Claude Code session driven by the Ralph loop plugin. The plans hold the *what*; this file holds the *order, the gates, the stop rules, and the morning report*.

## Launch (Ben, before bed)

```bash
cd ~/Dev/ambit
git status                       # clean, on main, plans committed
lsof -ti:3000 | xargs kill 2>/dev/null; docker compose up -d
git push --dry-run origin main   # SSH must work without a prompt
```

Then, in a fresh Claude Code session in `~/Dev/ambit` (any model; the plans are written cold):

```
/ralph-loop:ralph-loop "Read docs/PHASE7_OVERNIGHT.md and follow it exactly. It runs docs/PHASE7_PLAN_7.2.md then docs/PHASE7_PLAN_7.3.md unattended. Keep OVERNIGHT_STATUS.md current after every task. Never ask a question; take the plan's written fallback instead." --max-iterations 40 --completion-promise "OVERNIGHT RUN COMPLETE"
```

`--max-iterations 40` is the hard stop. The completion promise may only be output when the **Completion** section below is literally true.

## Order and gates

1. **7.2 first, on `feat/7.2-security`.** Tasks T1 → T7 in order. Gate for merging: `bun run check`, `bun run e2e:prod`, `bun run e2e` all green on the branch. Merge `--no-ff` to `main` and push (decided with Ben 08-27-26).
2. **7.3 second, on `feat/7.3-images-perf` off the merged `main`.** Tasks T1 → T6. Same gate, same merge-and-push.
3. If 7.2 does not reach its gate, **do not start 7.3 from an unmerged branch.** Leave `feat/7.2-security` as it is, record why in STATUS, and start 7.3 from `main` anyway — the two phases are independent in code (7.3 touches the image route, feed DB layer and scripts; 7.2 touches proxy, config, layout, tests).

## Standing rules for the executing session

- **Re-entry.** Each loop iteration starts by reading `OVERNIGHT_STATUS.md`, `git status`, `git log --oneline -15`, and the checkboxes in the current plan; resume at the first unchecked step of the current task. Tick checkboxes in the plan files as you go (they are committed with the task).
- **Never ask.** There is nobody to answer. Every plan task has a fallback written down (7.2 D2, D7; 7.3 D6, T5.2, T4.2). Take it, record it, continue.
- **Never weaken a test to pass a gate.** A red gate you cannot fix in two diagnosed attempts is a *finding*: record it, leave the branch unmerged, move on.
- **Destructive commands allowed:** `bun run e2e:clean --confirm` (only removes `ambit-%@example.com` users), deleting `.cache/img`, `git checkout -- <path>` to revert a task per its fallback, `git branch -D` nothing. **Not allowed:** `git push --force`, `git reset --hard` on `main`, `db:push`, `bun run retire`, `bun run ingest`, any `--prune`, editing `.env`.
- **Third parties:** the only external traffic this run may originate is 7.3 T4's `img:warm --source loc --rate 1` and Lighthouse's Chrome hitting `localhost`. Nothing else leaves the machine except `git push`.
- **Machine hygiene:** one `next start` at a time; kill it before `bun run e2e:prod` boots its own (`lsof -ti:3000 | xargs kill`). If a DB-touching test goes red on a busy box, wait 60 s and re-run once before diagnosing (CLAUDE.md).
- **Session spend:** each phase's `log.md` entry ends with the spend line from `python3 ~/.claude/scripts/session-spend.py --session <this session's uuid>`; the second run in the same session reports the delta, so 7.3's line covers only 7.3.

## `OVERNIGHT_STATUS.md` (repo root, untracked — it survives branch switches)

Rewrite it whole after every task; it is the morning report. Shape:

```markdown
# Overnight run — <date> (started <HH:MM>)

## Now
<phase> / <task> / <step> — <one line on what is happening>

## 7.2 — security
- [x] T1 … (commit abc1234)
- [ ] T3 — attempt 2 of 2 on e2e:prod: <cause found so far>
Gate: check ✅ · e2e:prod ❌ (security.spec 4.3 — CSP violation on /settings: <blocked URI>) · e2e —
Merged+pushed: no

## 7.3 — images + perf
(not started)

## Findings for Ben
- <anything the plans said to record: D2 taken, DB invariant rows, 429 point, skipped /feed Lighthouse, …>

## Numbers
- feed p50 before/after · pool MB before/after · loc warm table · Lighthouse before/after (3 scores each)

## Last iteration ended at <HH:MM>; iterations used: N/40
```

## Completion

Output `OVERNIGHT RUN COMPLETE` only when **all** of these are true:

1. Every task in both plans is either ticked and committed, or explicitly recorded in STATUS under *Findings for Ben* with the fallback that was taken.
2. Each phase is either merged to `main` and pushed with a green local gate, or left on its branch with the red gate's exact failing test named in STATUS.
3. Both walkthroughs exist (`docs/PHASE7_WALKTHROUGH_7.2.md`, `…_7.3.md`), `log.md` has the day's entry with spend lines, and SPEC/BUILD_PLAN/CLAUDE.md pointers are updated for whichever phases merged.
4. `git status` on `main` is clean apart from `OVERNIGHT_STATUS.md`, and no `next start`/`next dev` is left running.

If `--max-iterations` runs out first, the last STATUS is the report; that is acceptable.
