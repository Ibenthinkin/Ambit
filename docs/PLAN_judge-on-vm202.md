# The Judge on VM 202 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production's ingest judges through `claude -p` on Ben's Max subscription, on VM 202, as two weekly jobs (pictures, writing) with a per-kind health witness, and the seven held publications are backfilled and released.

**Architecture:** The Claude Code CLI is installed in the app image at a pinned version; the subscription token is a Coolify runtime secret; `CURATOR_JUDGE=claude` in Coolify's env is the flip. `scripts/ingest.ts` gains `--kind pictures|writing`, which skips sources that cannot yield the kind and filters items by type after normalization. `ingest_run` gains a `kind` column and `/api/health` reports each kind against a threshold of eight days and six hours, keeping the single `"ingest":"ok"` keyword the outside monitor already watches.

**Tech Stack:** Bun scripts, TypeScript, Vitest, Drizzle (migration 0011), Docker (`oven/bun:1.4.0-debian`), Claude Code CLI 2.1.287, Coolify scheduled tasks.

**Spec:** `docs/DESIGN_claude-judge-ingest.md` (D1–D11, Results, and "Open, for the piece 2/3 plan"), with `docs/HANDOFF_judge-on-vm202.md` for the nine questions this plan settles. Read both before Task 1. `docs/PLAN_claude-judge.md` is piece 1, already built and deployed.

## Decisions (Ben, 10-02-26)

| # | Question | Decision |
|---|---|---|
| 1 | Where `claude` is installed | **In the image, pinned to 2.1.287**, auto-update off. |
| 2 | The subscription token | `claude setup-token` → **Coolify runtime secret `CLAUDE_CODE_OAUTH_TOKEN`** (never a build variable), also in the password manager. |
| 3 | The schedule | **08:00 UTC (4 am Eastern)**, pictures Monday, writing Thursday, in place of the nightly. Not 01:30 UTC: that is 9:30 pm Eastern, inside Ben's own evening sessions. |
| 4 | The health witness | Per kind, threshold **8 days + 6 h**; `"ingest":"ok"` means both kinds are ok. (Plan's design; follows from 3 and 7.) |
| 5 | The flip | **Nothing stored is re-judged.** New items only; D4 stands. |
| 6 | Concurrency | Start at **two** workers, watch, then four. Needs `nproc` = 4 first. |
| 7 | A ceiling stop | **Stop; a catch-up run the next night.** Each job is scheduled on two nights (Mon+Tue, Thu+Fri). No waiting in-process. |
| 8 | The publications backfill | **On VM 202, one publication at a time**, smallest first, the first one measuring Sonnet's cost. |
| 9 | Fallback | OpenRouter by hand only: one script for a one-off run, one env line to flip back for good. |
| — | Paid overage | **"Extra usage" is off** on Ben's Max account and must stay off: the usage report has no documented overage flag, so the 80% ceiling is the judge's only guard. |

## What was measured or read for this plan (10-02-26)

- **VM 202 reads `nproc` = 4** (re-read after Ben raised the vCPUs and rebooted, 10-02-26; it was 1 that morning). Task 7 still checks it.
- VM 202: 7.9 GB RAM, 6.5 GB available after the reboot, 38 GB of 116 GB disk free. Production's curation cache is 216,763 envelopes / 862 MB.
- The app container runs as **root**, has `bash`, has **no `curl`**, and its `node` is Bun's fallback shim. The native installer needs `curl` and `bash` and puts the binary at `/root/.local/bin/claude`.
- Coolify's scheduled tasks today: `ingest` is **id 3**, `30 1 * * *`, timeout 10800; `img-warm` (id 5) is **disabled**, so new pictures are cached when a reader first sees them.
- **Ingest never re-judges a stored row.** `scripts/ingest.ts` drops every `(source, sourceId)` already in the database (step 3) before the curator is called (step 5). Flipping the judge therefore costs only what is new that week. The scripts that do re-judge stored rows (`recurate`, `recurate-writing`, `vision:compare`, `stats:walk`) are run by hand and are not part of this plan.
- Claude Code docs (code.claude.com/docs, setup + authentication + env-vars): an exact version is passed to the installer as `bash -s <version>`; `DISABLE_AUTOUPDATER=1` stops background updates; `claude setup-token` prints a one-year, inference-only token read from `CLAUDE_CODE_OAUTH_TOKEN`, with no other file needed; **`ANTHROPIC_API_KEY` outranks it**, which is why the judge strips that key from its child.

## Global Constraints

- **Branch `feat/judge-vm202` off `main`.** Another session may hold `~/Dev/ambit`; if `git status` shows a branch that is not yours, work in a worktree (`git worktree add ../ambit-judge-vm -b feat/judge-vm202 main`). Leave Ben's uncommitted `src/server/config/topic-groups.ts` alone.
- **The agent never writes to production and never runs an ingest there.** Tasks 1–5 are code against the local database. Task 6 writes scripts under `.cache/` (git-ignored, so they are written to disk and not committed). Tasks 7–9 are Ben running those scripts; the agent reads the output he pastes.
- **Do not edit any prompt constant or prompt version** in `curator.ts`. Production's cache depends on them byte for byte.
- **With no `--kind` flag, an ingest behaves exactly as today.** With `CURATOR_JUDGE` unset, the judge is OpenRouter exactly as today.
- **Never put `CURATOR_JUDGE` or `CLAUDE_CODE_OAUTH_TOKEN` in `.env`.** Locally the judge uses the Mac's own Claude login and the switch is passed on the command line.
- **No live `claude` or HTTP calls in unit tests.** The CLI is reached through `claudeRuntime.run`, which tests replace.
- **The child process must not see `ANTHROPIC_API_KEY`** (already enforced by `claudeEnv`; do not weaken it). `ANTHROPIC_API_KEY` must never be added to Coolify's env.
- **Nothing falls back from Claude to OpenRouter automatically** (Ben, 10-01-26).
- **Disk on VM 202 is to be conserved.** The Met stays in `INGEST_PAUSED_SOURCES`. Every production step below says what it adds to disk; do not add a step that warms or walks more than the plan names.
- **Coolify's task status is not evidence.** A run is verified against the dated log on the cache volume and the `ingest_run` table.
- Comment the way the surrounding files do: explain why, at length where a decision is not obvious (the repo is a teaching tool for Ben).
- After `bun add`/`bun remove` (none is expected), `rm -rf node_modules/.vite node_modules/.cache/vite`.
- Commit messages end with the attribution lines your session's instructions give.

## Review Focus

1. **A run starts with a window already at or past 80%.** Expect it to refuse at the preflight, in one line, before any source is walked. (Task 3)
2. **`--kind writing` meets a source that carries both kinds (PDR).** Expect its pictures neither judged nor stored that night, and `--prune` still seeing every walked id. (Task 1)
3. **`ingest_run` rows written before the migration have no kind.** Expect them to count for both kinds, so health stays `ok` across the deploy. (Task 2)
4. **A new source is registered without saying which kind it yields.** Expect a compile error, never a source silently skipped on both nights. (Task 1)
5. **`CLAUDE_JUDGE_CONCURRENCY` is `0`, `abc` or `99`.** Expect the default of four, never zero workers and a run that judges nothing. (Task 3)

## File Structure

| File | Responsibility |
|---|---|
| `src/server/services/ingest-kind.ts` (new) | Pure: what a kind is, which sources yield which, filtering items, what kind a run records. |
| `scripts/ingest.ts` | Reads `--kind`, applies the module above, records the kind. |
| `src/server/db/schema.ts`, `drizzle/0011_ingest_run_kind.sql` | `ingest_run.kind`. |
| `src/server/db/ingest-runs.ts` | `lastSuccessfulIngestAt(kind?)`. |
| `src/server/services/ingest-health.ts` | The threshold and the worst-of rule. |
| `src/app/api/health/route.ts` | Reports per kind. |
| `src/server/services/claude-judge.ts`, `curator.ts` | Concurrency from env; the ceiling read at preflight. |
| `scripts/judge-probe.ts` (new) | One live judgment, printed raw: the proof a host can judge. |
| `Dockerfile`, `src/dockerfile.test.ts` (new) | The pinned CLI. |
| `.cache/*.sh` (new, not committed) | Everything Ben runs on production. |

---

## Part A — code (the agent, locally)

### Task 1: `--kind pictures|writing`

**Files:**
- Create: `src/server/services/ingest-kind.ts`
- Create: `src/server/services/ingest-kind.test.ts`
- Modify: `scripts/ingest.ts` (header usage comment; flags ~line 141; `sourceIds` ~line 399; after the walk-results loop ~line 521; the three call sites named below; the opening log line ~line 455)

**Interfaces:**
- Produces: `INGEST_KINDS: readonly ["pictures", "writing"]`; `type IngestKind`; `parseKind(raw: string | undefined): IngestKind | null` (throws on an unknown word); `itemKind(item: Pick<NormalizedItem, "type">): IngestKind`; `SOURCE_KINDS: Record<SourceId, readonly IngestKind[]>`; `sourceYields(id: SourceId, kind: IngestKind | null): boolean`; `ofKind<T extends Pick<NormalizedItem, "type">>(items: T[], kind: IngestKind | null): T[]`; `recordedKind(kind: IngestKind | null, source: string | undefined): IngestKind | null`.

- [ ] **Step 1: Write the failing tests**

`src/server/services/ingest-kind.test.ts`:

```ts
// The weekly split (docs/PLAN_judge-on-vm202.md, design D10): pictures one night, writing another.
import { describe, expect, it } from "vitest";

import { BLOGS } from "~/server/config/blogs";
import { PUBLICATIONS } from "~/server/config/publications";

import {
  INGEST_KINDS,
  itemKind,
  ofKind,
  parseKind,
  recordedKind,
  SOURCE_KINDS,
  sourceYields,
} from "./ingest-kind";

describe("parseKind", () => {
  it("is null when the flag is absent — a run of everything, as before", () => {
    expect(parseKind(undefined)).toBeNull();
  });
  it("reads the two kinds", () => {
    expect(parseKind("pictures")).toBe("pictures");
    expect(parseKind("writing")).toBe("writing");
  });
  it("refuses a word it does not know rather than running everything", () => {
    expect(() => parseKind("photos")).toThrow(/--kind/);
  });
});

describe("itemKind", () => {
  it("is the item's type, in the schedule's words", () => {
    expect(itemKind({ type: "image" })).toBe("pictures");
    expect(itemKind({ type: "article" })).toBe("writing");
  });
});

describe("SOURCE_KINDS", () => {
  it("files every publication under writing and every blog under pictures", () => {
    for (const p of PUBLICATIONS)
      expect(SOURCE_KINDS[p.id], p.id).toEqual(["writing"]);
    for (const b of BLOGS) expect(SOURCE_KINDS[b.id], b.id).toEqual(["pictures"]);
  });
  it("knows the two sources that carry both", () => {
    expect(SOURCE_KINDS.pdr).toEqual(INGEST_KINDS);
    expect(SOURCE_KINDS.loupe).toEqual(INGEST_KINDS);
  });
  it("gives no source an empty list — that source would run on neither night", () => {
    for (const [id, kinds] of Object.entries(SOURCE_KINDS))
      expect(kinds.length, id).toBeGreaterThan(0);
  });
});

describe("sourceYields", () => {
  it("is always true without a kind", () => {
    expect(sourceYields("smithsonian", null)).toBe(true);
    expect(sourceYields("wikipedia", null)).toBe(true);
  });
  it("skips a museum on the writing night and Wikipedia on the pictures night", () => {
    expect(sourceYields("smithsonian", "writing")).toBe(false);
    expect(sourceYields("wikipedia", "pictures")).toBe(false);
  });
  it("walks PDR on both nights", () => {
    expect(sourceYields("pdr", "pictures")).toBe(true);
    expect(sourceYields("pdr", "writing")).toBe(true);
  });
});

describe("ofKind", () => {
  const items = [
    { type: "image" as const, sourceId: "a" },
    { type: "article" as const, sourceId: "b" },
  ];
  it("keeps only the night's kind — PDR's pictures are not judged on the writing night", () => {
    expect(ofKind(items, "writing").map((i) => i.sourceId)).toEqual(["b"]);
    expect(ofKind(items, "pictures").map((i) => i.sourceId)).toEqual(["a"]);
  });
  it("keeps everything without a kind", () => {
    expect(ofKind(items, null)).toHaveLength(2);
  });
});

describe("recordedKind", () => {
  it("is the flag when one was given", () => {
    expect(recordedKind("pictures", undefined)).toBe("pictures");
    expect(recordedKind("writing", "pdr")).toBe("writing");
  });
  it("is a one-kind source's kind for a manual --source run", () => {
    expect(recordedKind(null, "aeon")).toBe("writing");
    expect(recordedKind(null, "smithsonian")).toBe("pictures");
  });
  it("is null — counts for both — for a two-kind source or a run of everything", () => {
    expect(recordedKind(null, "pdr")).toBeNull();
    expect(recordedKind(null, undefined)).toBeNull();
    expect(recordedKind(null, "not-a-source")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/server/services/ingest-kind.test.ts`
Expected: FAIL — cannot resolve `./ingest-kind`.

- [ ] **Step 3: Implement the module**

`src/server/services/ingest-kind.ts`:

```ts
// The weekly split (docs/DESIGN_claude-judge-ingest.md D10, docs/PLAN_judge-on-vm202.md): since
// 10-02-26 the ingest is two jobs, pictures on one night and writing on another, because the two
// are judged by different Claude models against one shared subscription limit and a week's
// pictures should never starve a week's writing of it.
//
// Two levers, and the second is the one that is true. A source that can only ever yield the other
// kind is not walked at all (a museum on the writing night would be an hour of polite searching
// for nothing). Then every item is filtered by its own type after normalization, because two
// sources carry both: PDR's collections are pictures and its essays are articles.
//
// A leaf: types only from the source layer, so a test (and the health route's types) can import
// it without pulling in every adapter.
import type { NormalizedItem, SourceId } from "./sources/types";

export const INGEST_KINDS = ["pictures", "writing"] as const;
export type IngestKind = (typeof INGEST_KINDS)[number];

const PICTURES = ["pictures"] as const;
const WRITING = ["writing"] as const;

/**
 * What each source can yield. A `Record<SourceId, …>` on purpose: registering a new source
 * without a line here is a compile error. The alternative — a default — would mean a new writing
 * source is skipped on the writing night and filtered out on the pictures night, ingesting
 * nothing, silently, forever.
 */
export const SOURCE_KINDS: Record<SourceId, readonly IngestKind[]> = {
  // Search sources.
  wikipedia: WRITING,
  poetrydb: WRITING,
  met: PICTURES,
  aic: PICTURES,
  cma: PICTURES,
  wellcome: PICTURES,
  archive: PICTURES,
  smithsonian: PICTURES,
  loc: PICTURES,
  "nasa-images": PICTURES,
  // Walk sources that carry both kinds.
  pdr: INGEST_KINDS,
  loupe: INGEST_KINDS,
  // Designated blogs: link cards of pictures.
  doorofperception: PICTURES,
  thingsorganizedneatly: PICTURES,
  mossandfog: PICTURES,
  thisiscolossal: PICTURES,
  streetartnews: PICTURES,
  nemfrog: PICTURES,
  humanoidhistory: PICTURES,
  sovietpostcards: PICTURES,
  "70sscifiart": PICTURES,
  vintagegeekculture: PICTURES,
  dreamsrecurring: PICTURES,
  toiich: PICTURES,
  thevaultoftheatomicspaceage: PICTURES,
  thisisnthappiness: PICTURES,
  jareckiworld: PICTURES,
  kvetchlandia: PICTURES,
  // Publications: link cards of writing.
  themarginalian: WRITING,
  jstordaily: WRITING,
  noema: WRITING,
  aeon: WRITING,
  psyche: WRITING,
  longreads: WRITING,
  theparisreview: WRITING,
};

/** `--kind`'s value. Absent is null: a run of everything, exactly as before the split. An
 *  unknown word throws — a typo must never quietly become "run everything". */
export function parseKind(raw: string | undefined): IngestKind | null {
  if (raw === undefined) return null;
  if ((INGEST_KINDS as readonly string[]).includes(raw)) return raw as IngestKind;
  throw new Error(`--kind must be one of ${INGEST_KINDS.join(", ")}, got "${raw}"`);
}

/** An item's kind is its type, in the schedule's words. */
export function itemKind(item: Pick<NormalizedItem, "type">): IngestKind {
  return item.type === "article" ? "writing" : "pictures";
}

/** Whether a run of `kind` should fetch from this source at all. */
export function sourceYields(id: SourceId, kind: IngestKind | null): boolean {
  return kind === null || SOURCE_KINDS[id].includes(kind);
}

/** The items of the night's kind; everything when there is no kind. */
export function ofKind<T extends Pick<NormalizedItem, "type">>(
  items: T[],
  kind: IngestKind | null,
): T[] {
  return kind === null ? items : items.filter((it) => itemKind(it) === kind);
}

/**
 * The kind an `ingest_run` row is written with — what /api/health counts the run toward. The
 * flag when there was one. Otherwise a manual `--source aeon` run is a writing run, because
 * Aeon yields nothing else: recording it as "both" would let a month of publication backfills
 * keep the *pictures* witness green while the Monday job was dead. A run of everything, or of a
 * two-kind source, is null, and null counts for both.
 */
export function recordedKind(
  kind: IngestKind | null,
  source: string | undefined,
): IngestKind | null {
  if (kind) return kind;
  const kinds = source ? SOURCE_KINDS[source as SourceId] : undefined;
  return kinds?.length === 1 ? kinds[0]! : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/server/services/ingest-kind.test.ts && bun run typecheck`
Expected: PASS, typecheck clean. If typecheck says a key is missing from `SOURCE_KINDS`, a source was registered after this plan was written: file it under what its adapter's `toItem` returns (`type: "image"` → `PICTURES`, `"article"` → `WRITING`).

- [ ] **Step 5: Wire the flag into `scripts/ingest.ts`**

5a. Add to the imports:

```ts
import {
  itemKind,
  ofKind,
  parseKind,
  sourceYields,
  type IngestKind,
} from "~/server/services/ingest-kind";
```

5b. Add two lines to the header's Usage block, after the `--backfill` example:

```
 *   bun run ingest --kind pictures                       # the Monday job: image items only
 *   bun run ingest --kind writing                        # the Thursday job: articles only
```

5c. Directly after the `const backfill = …` line:

```ts
// The weekly split (10-02-26, services/ingest-kind.ts): `--kind pictures` and `--kind writing`
// are the two scheduled jobs. Absent, the run is everything, as it always was.
let kind: IngestKind | null;
try {
  kind = parseKind(flagValue("kind"));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
```

5d. In `main()`, the default source list skips sources that cannot yield the kind. An explicit `--source` is left alone (the item filter below still applies to it):

```ts
  const sourceIds = (
    sourceFlag
      ? [sourceFlag]
      : knownSources.filter(
          (id) => !isIngestSkipped(id) && sourceYields(id, kind),
        )
  ) as SourceId[];
```

5e. Directly after the `for (const [i, result] of walkResults.entries()) { … }` loop and before the "Step 2: collision resolution" comment:

```ts
  // --kind: keep only the night's kind, by each item's own type. This is after normalization
  // because PDR and Loupe carry both kinds. `walkStatsBySource` is deliberately NOT filtered:
  // its `seenSourceIds` is what --prune compares the database against, and a picture this run
  // chose not to judge was still seen.
  const claims = kind
    ? allClaims.filter((c) => itemKind(c.item) === kind)
    : allClaims;
  const unseededOfKind = ofKind(unseeded, kind);
  const walkItemsOfKind = ofKind(walkItems, kind);
  if (kind) {
    const offered = allClaims.length + unseeded.length + walkItems.length;
    const kept = claims.length + unseededOfKind.length + walkItemsOfKind.length;
    console.log(`--kind ${kind}: ${kept} of ${offered} offered item(s) are ${kind}\n`);
  }
```

5f. Use the filtered lists at the three places the unfiltered ones were read:
- `resolveCollisions(allClaims)` → `resolveCollisions(claims)`
- `mergeUnseeded(unseeded, …)` → `mergeUnseeded(unseededOfKind, …)`, and the `if (unseeded.length > 0)` log beneath it reads `unseededOfKind.length` in both places
- `const pathless = [...walkItems, ...unseededItems];` → `[...walkItemsOfKind, ...unseededItems]`

5g. The opening log line gains the kind. Append to the template that ends `${dryRun ? " [dry-run]" : ""}…\n`:

```ts
      `${skipLlm ? " [skip-llm]" : ""}${dryRun ? " [dry-run]" : ""}${kind ? ` [kind ${kind}]` : ""}…\n`,
```

- [ ] **Step 6: Verify by running, free and without writes**

Run: `bun run ingest --kind writing --dry-run --skip-llm --quota 3`
Expected: the "Per-source" table lists `wikipedia` and `poetrydb` only; the walk table lists `pdr` and no blog; a line `--kind writing: N of M offered item(s) are writing`; `would insert` counts articles only.

Run: `bun run ingest --kind photos --dry-run --skip-llm`
Expected: `--kind must be one of pictures, writing, got "photos"`, exit 1, nothing fetched.

Run: `bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/ingest-kind.ts src/server/services/ingest-kind.test.ts scripts/ingest.ts
git commit -m "feat(ingest): --kind pictures|writing — the weekly split, by source and by item type"
```

---

### Task 2: The per-kind health witness

**Files:**
- Modify: `src/server/db/schema.ts` (the `ingestRun` table, ~line 455)
- Create: `drizzle/0011_ingest_run_kind.sql` (generated)
- Modify: `src/server/db/ingest-runs.ts`
- Modify: `src/server/services/ingest-health.ts`, `src/server/services/ingest-health.test.ts`
- Modify: `src/app/api/health/route.ts`, `route.test.ts`, `route.integration.test.ts`
- Modify: `scripts/ingest.ts` (`recordRun`)

**Interfaces:**
- Consumes: `INGEST_KINDS`, `IngestKind`, `recordedKind` from Task 1.
- Produces: `ingest_run.kind text null`; `lastSuccessfulIngestAt(kind?: IngestKind): Promise<Date | null>`; `INGEST_STALE_AFTER_MS` (198 h); `worstIngestStatus(statuses: readonly IngestStatus[]): IngestStatus`; the health body gains `ingestKinds: Record<IngestKind, { status: IngestStatus; lastAt: string | null }> | null`.

- [ ] **Step 1: Write the failing unit tests**

Replace the body of `src/server/services/ingest-health.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  INGEST_STALE_AFTER_MS,
  ingestStatus,
  worstIngestStatus,
} from "./ingest-health";

describe("ingestStatus", () => {
  // A Monday, two hours after the weekly pictures job starts.
  const now = new Date("2026-10-12T10:00:00Z");

  it("is never when no run has ever succeeded", () => {
    expect(ingestStatus(null, now)).toBe("never");
  });

  it("is ok all week after last Monday's run", () => {
    expect(ingestStatus(new Date("2026-10-05T09:10:00Z"), now)).toBe("ok");
  });

  it("is still ok when this week's run stopped at the ceiling and Tuesday's catch-up has not run yet", () => {
    const tuesdayMorning = new Date("2026-10-13T07:59:00Z");
    expect(ingestStatus(new Date("2026-10-05T09:10:00Z"), tuesdayMorning)).toBe("ok");
  });

  it("is stale once the week's run and its catch-up night have both been missed", () => {
    const wednesday = new Date("2026-10-14T10:00:00Z");
    expect(ingestStatus(new Date("2026-10-05T09:10:00Z"), wednesday)).toBe("stale");
  });

  it("turns stale exactly at eight days and six hours", () => {
    expect(INGEST_STALE_AFTER_MS).toBe((8 * 24 + 6) * 60 * 60 * 1000);
    const edge = new Date(now.getTime() - INGEST_STALE_AFTER_MS);
    expect(ingestStatus(new Date(edge.getTime() + 1), now)).toBe("ok");
    expect(ingestStatus(edge, now)).toBe("stale");
  });
});

describe("worstIngestStatus", () => {
  it("is ok only when every kind is ok", () => {
    expect(worstIngestStatus(["ok", "ok"])).toBe("ok");
    expect(worstIngestStatus(["ok", "stale"])).toBe("stale");
    expect(worstIngestStatus(["stale", "never"])).toBe("never");
    expect(worstIngestStatus(["ok", "never"])).toBe("never");
  });
});
```

In `src/app/api/health/route.test.ts`: every existing `toEqual` on the whole body gains, for the never-ran default,

```ts
      ingestKinds: {
        pictures: { status: "never", lastAt: null },
        writing: { status: "never", lastAt: null },
      },
```

and add this case inside the same `describe` (read the file's existing ingest cases first and keep their style; any that assert `ingest`/`lastIngestAt` with a single mocked date stay valid, because the mock returns that date for both kinds):

```ts
  it("reports each kind, and is not ok while either is stale", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);
    imageCacheDir.mockReturnValue(await writableDir());
    const fresh = new Date(Date.now() - 60 * 60 * 1000);
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    lastSuccessfulIngestAt.mockImplementation((kind?: string) =>
      Promise.resolve(kind === "writing" ? old : fresh),
    );

    const body = (await (await GET()).json()) as Record<string, unknown>;

    expect(body.ingest).toBe("stale");
    // The newest success of either kind — what a human reads as "when did anything last land".
    expect(body.lastIngestAt).toBe(fresh.toISOString());
    expect(body.ingestKinds).toEqual({
      pictures: { status: "ok", lastAt: fresh.toISOString() },
      writing: { status: "stale", lastAt: old.toISOString() },
    });
  });

  it("answers unknown, with no per-kind detail, when the record cannot be read", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);
    imageCacheDir.mockReturnValue(await writableDir());
    lastSuccessfulIngestAt.mockRejectedValue(new Error("relation does not exist"));

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ingest: "unknown", ingestKinds: null });
  });
```

(If the file already has an "unknown" case, extend that one with `ingestKinds: null` instead of adding a second.)

In `src/app/api/health/route.integration.test.ts`, replace the inner `describe("ingest", …)` with:

```ts
    // Real ingest_run rows read back through the real query. Stamped in the future so they are
    // the newest whatever else the local database holds, and deleted afterwards.
    describe("ingest", () => {
      const stamp = Date.now();
      const ids = [`test-run-pictures-${stamp}`, `test-run-any-${stamp}`];

      afterAll(async () => {
        const { db } = await import("~/server/db/client");
        const { ingestRun } = await import("~/server/db/schema");
        for (const id of ids) await db.delete(ingestRun).where(eq(ingestRun.id, id));
      });

      const row = (id: string, finishedAt: Date, kind: "pictures" | null) => ({
        id,
        startedAt: new Date(),
        finishedAt,
        exitCode: 0,
        inserted: 3,
        dryRun: false,
        perSource: null,
        error: null,
        kind,
      });

      it("counts a pictures run toward pictures only", async () => {
        const { recordIngestRun, lastSuccessfulIngestAt } = await import(
          "~/server/db/ingest-runs"
        );
        const at = new Date(stamp + 60_000);
        await recordIngestRun(row(ids[0]!, at, "pictures"));

        expect((await lastSuccessfulIngestAt("pictures"))?.getTime()).toBe(at.getTime());
        expect((await lastSuccessfulIngestAt("writing"))?.getTime()).not.toBe(at.getTime());
      });

      it("counts a run with no kind — every row written before 10-02-26 — toward both", async () => {
        const { recordIngestRun, lastSuccessfulIngestAt } = await import(
          "~/server/db/ingest-runs"
        );
        const at = new Date(stamp + 120_000);
        await recordIngestRun(row(ids[1]!, at, null));

        expect((await lastSuccessfulIngestAt("pictures"))?.getTime()).toBe(at.getTime());
        expect((await lastSuccessfulIngestAt("writing"))?.getTime()).toBe(at.getTime());

        const res = await GET();
        expect(await res.json()).toMatchObject({
          ingest: "ok",
          lastIngestAt: at.toISOString(),
          ingestKinds: {
            pictures: { status: "ok", lastAt: at.toISOString() },
            writing: { status: "ok", lastAt: at.toISOString() },
          },
        });
      });
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run src/server/services/ingest-health.test.ts src/app/api/health`
Expected: FAIL — `worstIngestStatus` is not exported; the route tests fail on `ingestKinds`; the integration test fails to typecheck `kind`.

- [ ] **Step 3: The column and its migration**

In `src/server/db/schema.ts`, inside `ingestRun`, after `dryRun`:

```ts
    // Which weekly job this run was (10-02-26, services/ingest-kind.ts): "pictures", "writing",
    // or NULL for a run of everything — which is every row written before the split, and why
    // /api/health counts NULL toward both kinds. Plain text, like item.source: the set of kinds
    // is the app's business, not a database enum's.
    kind: text("kind"),
```

Run: `bun run db:generate --name ingest_run_kind`
Expected: a new `drizzle/0011_ingest_run_kind.sql` containing exactly `ALTER TABLE "ingest_run" ADD COLUMN "kind" text;` and a journal entry `0011_ingest_run_kind`. If the generated SQL holds anything else, stop: the schema has drifted from the journal and that is not this task's to fix.

Run: `bun run db:migrate`
Expected: applies 0011 to the local database.

- [ ] **Step 4: The query**

In `src/server/db/ingest-runs.ts`, change the import to `import { and, desc, eq, isNull, or } from "drizzle-orm";`, add `import type { IngestKind } from "~/server/services/ingest-kind";`, and replace `lastSuccessfulIngestAt`:

```ts
/**
 * When the newest successful real run finished, or null if there has never been one. "Successful"
 * is `exit_code = 0` — a run that exited 2 (a dead source) or 1 (threw, or stopped at the Claude
 * judge's ceiling) does not keep the health field green.
 *
 * With a `kind`, only runs that counted toward it: that kind's own, and runs with no kind at all
 * (a run of everything — including every row from before the weekly split, which is what keeps
 * health `ok` across the deploy that adds the column). Without one, any run.
 */
export async function lastSuccessfulIngestAt(
  kind?: IngestKind,
): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: ingestRun.finishedAt })
    .from(ingestRun)
    .where(
      and(
        eq(ingestRun.exitCode, 0),
        eq(ingestRun.dryRun, false),
        kind ? or(eq(ingestRun.kind, kind), isNull(ingestRun.kind)) : undefined,
      ),
    )
    .orderBy(desc(ingestRun.finishedAt))
    .limit(1);
  return row?.finishedAt ?? null;
}
```

- [ ] **Step 5: The threshold**

In `src/server/services/ingest-health.ts`, replace the `INGEST_STALE_AFTER_MS` block and add the worst-of rule (keep the file's header; change its first line's "(30 hours)" to "(eight days and six hours)" and "the nightly ingest" to "the weekly ingests"):

```ts
/**
 * How old a kind's last successful run may be before it reads `stale`. The cadence is weekly
 * (pictures Monday, writing Thursday, 08:00 UTC) with a catch-up run the following night for a
 * run that stopped at the Claude judge's ceiling — so a healthy kind's successes can be eight
 * days apart: last Monday's, then next Tuesday's. Six hours on top covers a long run and a late
 * start. It was 30 hours while the ingest was nightly (8.2); under a weekly schedule that read
 * `stale` six days in seven.
 */
export const INGEST_STALE_AFTER_MS = (8 * 24 + 6) * 60 * 60 * 1000;
```

and, after `ingestStatus`:

```ts
/**
 * One word for several kinds: the worst of them. `ok` only when every kind is ok — which is
 * what lets the outside monitor keep matching the single keyword `"ingest":"ok"` while the
 * route's `ingestKinds` says which job went quiet.
 */
export function worstIngestStatus(
  statuses: readonly IngestStatus[],
): IngestStatus {
  if (statuses.includes("never")) return "never";
  return statuses.includes("stale") ? "stale" : "ok";
}
```

- [ ] **Step 6: The route**

In `src/app/api/health/route.ts`: extend the imports (`worstIngestStatus` beside `ingestStatus`; `import { INGEST_KINDS, type IngestKind } from "~/server/services/ingest-kind";`), update the header paragraph that says "in the last 30 hours" to "each weekly ingest (pictures, writing) has *succeeded* within eight days and six hours — `ingest` is the worst of the two, `ingestKinds` names each", and replace `checkIngest`:

```ts
type KindReport = { status: IngestStatus; lastAt: string | null };

/**
 * The ingests' recency, per weekly job. A failed read is `unknown` — not `never`, which would
 * claim the corpus has never been filled, and not an error in the status code, for the reason in
 * the header. Like the checks above it names nothing: no driver message leaves this function.
 */
async function checkIngest(): Promise<{
  ingest: IngestStatus | "unknown";
  lastIngestAt: string | null;
  ingestKinds: Record<IngestKind, KindReport> | null;
}> {
  try {
    const now = new Date();
    const lasts = await Promise.all(
      INGEST_KINDS.map((kind) => lastSuccessfulIngestAt(kind)),
    );
    const reports = INGEST_KINDS.map((kind, i): [IngestKind, KindReport] => [
      kind,
      {
        status: ingestStatus(lasts[i] ?? null, now),
        lastAt: lasts[i]?.toISOString() ?? null,
      },
    ]);
    const newest = lasts
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      ingest: worstIngestStatus(reports.map(([, r]) => r.status)),
      lastIngestAt: newest?.toISOString() ?? null,
      ingestKinds: Object.fromEntries(reports) as Record<IngestKind, KindReport>,
    };
  } catch {
    return { ingest: "unknown", lastIngestAt: null, ingestKinds: null };
  }
}
```

and in `GET`'s body, after `lastIngestAt: ingest.lastIngestAt,` add `ingestKinds: ingest.ingestKinds,`.

- [ ] **Step 7: The ingest records its kind**

In `scripts/ingest.ts`, add `recordedKind` to the `ingest-kind` import, and in `recordRun`'s `recordIngestRun({ … })` call add one property after `dryRun: false,`:

```ts
      // What /api/health counts this run toward (services/ingest-kind.ts's recordedKind).
      kind: recordedKind(kind, sourceFlag),
```

- [ ] **Step 8: Run to verify it passes**

Run: `bunx vitest run src/server/services/ingest-health.test.ts src/app/api/health src/server/services/ingest-kind.test.ts && bun run typecheck && bun run lint`
Expected: PASS (the integration file runs because `.env` has `DATABASE_URL`), clean.

- [ ] **Step 9: Commit**

```bash
git add src/server/db/schema.ts drizzle src/server/db/ingest-runs.ts src/server/services/ingest-health.ts src/server/services/ingest-health.test.ts src/app/api/health scripts/ingest.ts
git commit -m "feat(health): a witness per weekly ingest, stale after eight days and six hours"
```

---

### Task 3: Concurrency from env, the ceiling read at preflight, and the probe

**Files:**
- Modify: `src/server/services/claude-judge.ts` (after `CLAUDE_CONCURRENCY`, and after `resetClaudeJudge`)
- Modify: `src/server/services/claude-judge.test.ts` (append)
- Modify: `src/server/services/curator.ts` (`judgePreflight` ~line 87; the pool ~line 1311; the `./claude-judge` import)
- Modify: `src/server/services/curator.test.ts` (append)
- Modify: `src/env.js` (~lines 49 and 120), `.env.example` (after `CLAUDE_JUDGE_MAX_UTILIZATION`)
- Modify: `scripts/ingest.ts` (`judgeLine`)
- Create: `scripts/judge-probe.ts`; Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `claudeConcurrency(): number` (env `CLAUDE_JUDGE_CONCURRENCY`, an integer 1–8, else `CLAUDE_CONCURRENCY`); `claudeStopReason(): string | null`; `bun run judge:probe`.

- [ ] **Step 1: Write the failing tests**

Append to `src/server/services/claude-judge.test.ts` (add `claudeConcurrency`, `claudeStopReason`, `CLAUDE_CONCURRENCY` to the `./claude-judge` import):

```ts
describe("claudeConcurrency", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is the constant when the env says nothing", () => {
    vi.stubEnv("CLAUDE_JUDGE_CONCURRENCY", "");
    expect(claudeConcurrency()).toBe(CLAUDE_CONCURRENCY);
  });
  it("reads a whole number from 1 to 8", () => {
    vi.stubEnv("CLAUDE_JUDGE_CONCURRENCY", "2");
    expect(claudeConcurrency()).toBe(2);
  });
  it("ignores anything else — zero workers would judge nothing and report success", () => {
    for (const bad of ["0", "abc", "99", "2.5", "-1"]) {
      vi.stubEnv("CLAUDE_JUDGE_CONCURRENCY", bad);
      expect(claudeConcurrency(), bad).toBe(CLAUDE_CONCURRENCY);
    }
  });
});

describe("claudeEnv and the subscription token", () => {
  it("passes CLAUDE_CODE_OAUTH_TOKEN through — on the VM it is the only login there is", () => {
    const env = claudeEnv(
      { CLAUDE_CODE_OAUTH_TOKEN: "tok", ANTHROPIC_API_KEY: "sk-x" },
      false,
    );
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("tok");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});

describe("claudeStopReason", () => {
  const realRun = claudeRuntime.run;
  beforeEach(() => resetClaudeJudge());
  afterEach(() => {
    claudeRuntime.run = realRun;
  });
  it("is null until a call crosses the ceiling, then says which window", async () => {
    expect(claudeStopReason()).toBeNull();
    claudeRuntime.run = () =>
      Promise.resolve({
        code: 0,
        stdout: stream("{}", { five: 0.3, seven: 0.85 }),
        stderr: "",
      });
    await claudeComplete({ model: CLAUDE_JUDGE_MODEL, system: "S", content: "hi" });
    expect(claudeStopReason()).toMatch(/seven_day window is at 85%/);
  });
});
```

Append to `src/server/services/curator.test.ts`:

```ts
describe("judgePreflight at the ceiling", () => {
  const realRun = claudeRuntime.run;
  beforeEach(() => resetClaudeJudge());
  afterEach(() => {
    claudeRuntime.run = realRun;
    vi.unstubAllEnvs();
  });

  // The preflight's own call succeeds — it is the call that *reads* the usage. Without this
  // check the run would walk every source for an hour and abort on its first judgment.
  it("refuses before any walk when a window is already past it", async () => {
    claudeRuntime.run = () =>
      Promise.resolve({
        code: 0,
        stdout: [
          {
            type: "rate_limit_event",
            rate_limit_info: {
              status: "allowed",
              unifiedWindows: {
                five_hour: { utilization: 0.91, resetsAt: 1790880000 },
              },
            },
          },
          {
            type: "result",
            is_error: false,
            result: '{"ok":true}',
            usage: { input_tokens: 400, output_tokens: 6 },
          },
        ]
          .map((l) => JSON.stringify(l))
          .join("\n"),
        stderr: "",
      });
    expect(await judgePreflight([CLAUDE_JUDGE_MODEL])).toMatch(
      /already at its ceiling.*five_hour window is at 91%/,
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run src/server/services/claude-judge.test.ts src/server/services/curator.test.ts`
Expected: the new tests FAIL (`claudeConcurrency` / `claudeStopReason` not exported; the preflight returns null). `claudeEnv`'s token test passes already — it pins behaviour that exists.

- [ ] **Step 3: Implement**

In `claude-judge.ts`, directly after `CLAUDE_CONCURRENCY`:

```ts
/**
 * The pool size a run actually uses. `CLAUDE_JUDGE_CONCURRENCY` (a whole number, 1 to 8) is the
 * lever for a small host: each worker is a ~236 MB process (10-01-26), and VM 202's first runs
 * were made at two before four was trusted. Anything else — unset, zero, a typo — is the
 * constant: a pool of zero would finish instantly having judged nothing.
 */
export function claudeConcurrency(): number {
  const n = Number(process.env.CLAUDE_JUDGE_CONCURRENCY);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : CLAUDE_CONCURRENCY;
}
```

and directly after `resetClaudeJudge`:

```ts
/** Why the judge has stopped, or null while it has not. judgePreflight reads it after its one
 *  small call, so a run that starts with a window already past the ceiling ends there instead
 *  of after a full walk. */
export function claudeStopReason(): string | null {
  return stop;
}
```

In `curator.ts`: add `claudeConcurrency` and `claudeStopReason` to the `./claude-judge` import (and drop `CLAUDE_CONCURRENCY` from it if nothing else in the file reads it). In `judgePreflight`, after the `try { await claudeComplete(…) } catch { … }` block and still inside `if (claude) { … }`:

```ts
    // The call above succeeded, and it is also the first reading of the subscription's usage.
    // If that reading is already past the ceiling there is nothing this run can judge.
    const stopped = claudeStopReason();
    if (stopped)
      return `the Claude judge is already at its ceiling — ${stopped}. Nothing was walked; run again after the reset.`;
```

In the pool at the bottom of `curateItems`, `claude ? CLAUDE_CONCURRENCY : CONCURRENCY` becomes `claude ? claudeConcurrency() : CONCURRENCY`.

In `src/env.js`, after the `CLAUDE_JUDGE_MAX_UTILIZATION` schema line: `CLAUDE_JUDGE_CONCURRENCY: z.coerce.number().int().min(1).max(8).optional(),` and in `runtimeEnv`, after its line: `CLAUDE_JUDGE_CONCURRENCY: process.env.CLAUDE_JUDGE_CONCURRENCY,`.

In `.env.example`, after `CLAUDE_JUDGE_MAX_UTILIZATION=`:

```
# Claude judge only: how many `claude` processes judge at once (1-8; default 4). Each is ~236 MB.
CLAUDE_JUDGE_CONCURRENCY=
```

In `scripts/ingest.ts`: add `claudeConcurrency` to the `claude-judge` import and `isClaudeModel` if not already imported from `~/server/services/claude-judge`; in `judgeLine`, the first array element becomes:

```ts
    `${judgeModel()} (pictures), ${writingJudgeModel()} (writing)` +
      (isClaudeModel(judgeModel()) ? `, ${claudeConcurrency()} worker(s)` : ""),
```

- [ ] **Step 4: The probe script**

`scripts/judge-probe.ts`:

```ts
#!/usr/bin/env bun
/**
 * One live judgment through the Claude judge, printed raw (docs/PLAN_judge-on-vm202.md). The
 * proof that a host can judge at all — the CLI is installed, the login works, the stripping
 * flags are honoured — before any ingest depends on it. Spends ~400 tokens of the subscription.
 * Reads no database and writes nothing.
 *
 *   bun run judge:probe
 *
 * What to read: `tokens` under ~600 (tens of thousands means the CLI is carrying its own
 * overhead again); both windows present in `usage`; and the raw report, which is printed whole
 * so that a field this code does not know about — an overage flag, say — is seen by a person.
 */
import { spawnSync } from "node:child_process";

import {
  CLAUDE_JUDGE_MODEL,
  claudeComplete,
  claudeConcurrency,
  claudeStopReason,
  claudeUsage,
} from "~/server/services/claude-judge";

const version = spawnSync("claude", ["--version"], { encoding: "utf8" });
console.log(`cli:        ${version.status === 0 ? version.stdout.trim() : "NOT FOUND on PATH"}`);
console.log(`workers:    ${claudeConcurrency()}`);
// Presence only, never the value: this output gets pasted into logs.
console.log(`token env:  ${process.env.CLAUDE_CODE_OAUTH_TOKEN ? "set" : "unset (using the machine's own login)"}`);
console.log(`api key:    ${process.env.ANTHROPIC_API_KEY ? "SET — the judge strips it from its child, but remove it" : "unset"}`);

try {
  const { reply, tokens } = await claudeComplete({
    model: CLAUDE_JUDGE_MODEL,
    system: "Reply with ONLY one JSON object.",
    content: 'Give {"ok":true}',
  });
  console.log(`reply:      ${reply}`);
  console.log(`tokens:     ${tokens}`);
  console.log(`usage:      ${JSON.stringify(claudeUsage()?.last, null, 2)}`);
  console.log(`ceiling:    ${claudeStopReason() ?? "not reached"}`);
} catch (err) {
  console.error(`probe FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
```

In `package.json` scripts, beside `"ingest"`: `"judge:probe": "bun run scripts/judge-probe.ts",`.

- [ ] **Step 5: Run to verify**

Run: `bunx vitest run src/server/services/claude-judge.test.ts src/server/services/curator.test.ts && bun run typecheck && bun run lint`
Expected: PASS, clean.

Run (one live call on the Mac's own login): `bun run judge:probe`
Expected: `cli: 2.1.287 (Claude Code)` or newer, `reply: {"ok": true}`, `tokens` under 600, a `usage` object with `five_hour` and `seven_day`. If `tokens` is in the tens of thousands, stop and report.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/claude-judge.ts src/server/services/claude-judge.test.ts src/server/services/curator.ts src/server/services/curator.test.ts src/env.js .env.example scripts/ingest.ts scripts/judge-probe.ts package.json
git commit -m "feat(curator): judge concurrency from env, refuse at preflight when already at the ceiling, judge:probe"
```

---

### Task 4: The CLI in the image, pinned

**Files:**
- Modify: `Dockerfile` (the `runtime` stage)
- Create: `src/dockerfile.test.ts`

**Interfaces:**
- Produces: an image whose `claude --version` is exactly 2.1.287, with `DISABLE_AUTOUPDATER=1` and `/root/.local/bin` on `PATH`.

- [ ] **Step 1: Write the failing test**

`src/dockerfile.test.ts`:

```ts
// The production image carries the Claude Code CLI the judge spawns (docs/PLAN_judge-on-vm202.md).
// Two properties are worth a test because losing either is silent: the version is exact, and the
// CLI may not update itself. The judge's tripwires (claude-judge.ts: a judgment over 20,000
// tokens, a call with no usage report) exist for a CLI that changed under it; an unpinned
// install inside a container that restarts on every deploy is how to meet them.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");

describe("Dockerfile — the Claude Code CLI", () => {
  it("pins an exact version", () => {
    expect(dockerfile).toMatch(/^ARG CLAUDE_CODE_VERSION=\d+\.\d+\.\d+$/m);
  });
  it("installs that version and proves it at build time", () => {
    expect(dockerfile).toMatch(/install\.sh "\$CLAUDE_CODE_VERSION"/);
    expect(dockerfile).toMatch(/claude --version \| grep -F "\$CLAUDE_CODE_VERSION"/);
  });
  it("turns the auto-updater off", () => {
    expect(dockerfile).toMatch(/^ENV DISABLE_AUTOUPDATER=1$/m);
  });
  it("never bakes a credential into the image", () => {
    expect(dockerfile).not.toMatch(/CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/dockerfile.test.ts`
Expected: three FAIL (no `CLAUDE_CODE_VERSION`), the credential test passes.

- [ ] **Step 3: Edit the Dockerfile**

In the `runtime` stage, directly after `FROM base AS runtime` and before the first `COPY` (so a code change never re-runs the install):

```dockerfile
# ── The Claude judge's CLI (10-02-26, docs/PLAN_judge-on-vm202.md) ──
#
# The ingest is `docker exec`'d into this container, and with CURATOR_JUDGE=claude the curator
# spawns `claude -p` for every judgment, on Ben's subscription. So the CLI lives here.
#
# **Pinned, and it stays pinned.** The judge passes a row of flags that strip Claude Code's own
# ~54,000-token overhead down to ~400 per judgment; it has tripwires for a CLI that stops
# honouring them, and an auto-update inside a container is the way to trip them at 4 am. To move
# to a newer CLI: change the ARG, deploy, run `bun run judge:probe` in the container, read the
# token count. The installer is Anthropic's native one (code.claude.com/docs/en/setup); it needs
# curl, which this image otherwise does without, so curl is installed for this one layer and
# removed in it. The binary lands in /root/.local/bin — the container runs as root.
#
# No credential is here or anywhere in the build: the login is CLAUDE_CODE_OAUTH_TOKEN, a
# *runtime* variable in Coolify (never tick "Build Variable" on it — a build ARG is readable in
# the image's history).
ARG CLAUDE_CODE_VERSION=2.1.287
ENV DISABLE_AUTOUPDATER=1
ENV PATH="/root/.local/bin:${PATH}"
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL https://claude.ai/install.sh -o /tmp/claude-install.sh \
 && bash /tmp/claude-install.sh "$CLAUDE_CODE_VERSION" \
 && rm /tmp/claude-install.sh \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && claude --version | grep -F "$CLAUDE_CODE_VERSION"
```

**If another session has already put `curl` into the image permanently** (Ben was arranging that separately on 10-02-26): read the Dockerfile first. If an earlier layer or stage installs curl, drop `apt-get install … curl`, `apt-get purge -y curl` and `apt-get autoremove -y` from the `RUN` above and keep the rest; Step 4's `curl: gone` expectation then reads a path instead, which is correct.

- [ ] **Step 4: Run the test, then build the image**

Run: `bunx vitest run src/dockerfile.test.ts`
Expected: PASS.

Run (the Mac builds linux/arm64 natively; production builds amd64 — this proves the layer, not the architecture):

```bash
docker images oven/bun:1.4.0-debian --format '{{.Size}}'
docker build --build-arg BETTER_AUTH_URL=http://localhost:3000 -t ambit-judge-test .
docker run --rm ambit-judge-test claude --version
docker run --rm ambit-judge-test sh -c 'printenv DISABLE_AUTOUPDATER; which claude; which curl || echo "curl: gone"'
docker images ambit-judge-test --format '{{.Size}}'
```

Expected: the build succeeds; `2.1.287 (Claude Code)`; `1`, `/root/.local/bin/claude`, `curl: gone`. **Write down the image size** (the last line; it was 1.58 GB before this layer) — Task 10's SPEC edit needs the number, and it is what the deploy adds to VM 202's root disk. If the installer refuses the version or the `grep` fails, stop and report the build output; do not loosen the pin.

Run: `docker rmi ambit-judge-test`

- [ ] **Step 5: Commit**

```bash
git add Dockerfile src/dockerfile.test.ts
git commit -m "feat(image): the Claude Code CLI, pinned to 2.1.287, auto-update off"
```

---

### Task 5: Check, log, and hand the branch to Ben

**Files:**
- Modify: `log.md`

- [ ] **Step 1: The whole suite**

Run: `bun run check`
Expected: typecheck, lint, format and tests all green. (`bun run format` fixes a formatting failure. If an integration test fails with machines busy or a foreign-key error from `markSeen`, read CLAUDE.md's "Local dev environment" notes before debugging it — both are known and neither is this branch.)

- [ ] **Step 2: The CI shape**, because Task 2 added a migration that the e2e job applies:

```bash
docker run -d --rm --name ambit-ci-pg -e POSTGRES_USER=ambit -e POSTGRES_PASSWORD=ambit -e POSTGRES_DB=ambit -p 5434:5432 postgres:17-alpine
export DATABASE_URL=postgres://ambit:ambit@localhost:5434/ambit
bun run db:migrate && bun run db:seed && bun run build && E2E_PROD=1 bunx playwright test --workers 1
docker stop ambit-ci-pg
```

Expected: migrations 0000–0011 apply to an empty database; the suite passes. (Port 5434: 5433 is Loupe's Postgres on this Mac. Port 3000 must be free — `lsof -ti:3000`.)

- [ ] **Step 3: Log it.** Add to `log.md` under today's `### [[MM-DD-YY ddd]]` heading (extend the entry if the day has one): **Shipped** — the four commits in one line each; **Decisions** — the table at the top of this plan, as prose; **Open / next** — Ben merges and deploys, then Part B. End with the session-spend line from `python3 ~/.claude/scripts/session-spend.py --session <session-uuid>` (omit the line if the script exits non-zero).

- [ ] **Step 4: Commit and push the branch; do not merge.**

```bash
git add log.md
git commit -m "docs(log): the judge's move to VM 202 — code built, production steps next"
git push -u origin feat/judge-vm202
```

Tell Ben the branch is ready and that a branch push runs no CI, so Step 2 is the evidence.

---

### Task 6: The production scripts (written to `.cache/`, not committed)

**Files (all created, all git-ignored):**
- `.cache/judge-vm-check.sh`, `.cache/judge-probe-prod.sh`, `.cache/judge-count-prod.sh`, `.cache/judge-run-prod.sh`, `.cache/coolify-weekly-tasks.sh`, `.cache/judge-fallback-prod.sh`, `.cache/publications-claude-prod.sh`

**Interfaces:**
- Consumes: `bun run ingest --kind …`, `bun run judge:probe` (deployed by Task 7).
- Every script finds the container by port (`docker ps -q --filter publish=3000`), never by name. Every long-running one is detached with `nohup` on the VM and has a `status` form, because a long single `ssh` line wraps in Ben's terminal and fails silently.

- [ ] **Step 1: `.cache/judge-vm-check.sh`** — read-only; the preconditions on one screen.

```sh
#!/bin/sh
# 10-02-26. Read-only look at VM 202 before and after each step of docs/PLAN_judge-on-vm202.md.
#   sh .cache/judge-vm-check.sh
ssh ben@192.168.1.202 '
C=$(docker ps -q --filter publish=3000)
echo "== host"; echo "nproc: $(nproc)   (the plan needs 4)"; free -m | sed -n 2p; df -h / | tail -1
echo "== health"; curl -s localhost:3000/api/health; echo
echo "== container $C"
docker exec "$C" sh -c "claude --version 2>&1 | head -1 || echo claude: NOT INSTALLED"
docker exec "$C" sh -c "for v in CURATOR_JUDGE CLAUDE_JUDGE_CONCURRENCY CLAUDE_JUDGE_MAX_UTILIZATION; do printf \"%s=%s\n\" \$v \"\$(printenv \$v || echo unset)\"; done"
docker exec "$C" sh -c "for v in CLAUDE_CODE_OAUTH_TOKEN OPENROUTER_API_KEY ANTHROPIC_API_KEY; do printf \"%s: %s\n\" \$v \"\$( [ -n \"\$(printenv \$v)\" ] && echo set || echo unset )\"; done"
docker exec "$C" sh -c "echo curation envelopes: \$(ls .cache/curation | wc -l); du -sh .cache/img | cut -f1"
echo "== scheduled tasks"
docker exec -i coolify-db psql -U coolify -d coolify -Atc "select id, name, enabled, frequency, timeout, command from scheduled_tasks order by id"
echo "== ingest_run (newest first)"
docker exec bbzic3lx3ybsmkxjueae0da9 psql -U ambit -d ambit -c "select started_at, finished_at, exit_code, inserted, kind, left(error, 90) as error from ingest_run order by started_at desc limit 6"
echo "== images on disk"; docker images --format "{{.Repository}}:{{.Tag}} {{.Size}}" | grep -i mxo9s7hk | head -5
'
```

(The `kind` column exists only after Task 7's deploy; before it that one query errors and the rest still prints.)

- [ ] **Step 2: `.cache/judge-probe-prod.sh`** — one judgment in the production container.

```sh
#!/bin/sh
# 10-02-26. One live judgment through the Claude judge inside production's container: ~400 tokens
# of the subscription, no database, no writes. Run after the token is in Coolify's env.
#   sh .cache/judge-probe-prod.sh
ssh ben@192.168.1.202 'C=$(docker ps -q --filter publish=3000); docker exec "$C" bun run judge:probe'
```

- [ ] **Step 3: `.cache/judge-count-prod.sh`** — what a first run would judge, free.

```sh
#!/bin/sh
# 10-02-26. How many items a weekly run would send to the judge — without judging, billing or
# writing (--dry-run --skip-llm). It still walks every source of that kind, so it takes as long
# as a run's fetch phase. The number to read is the "curated:" line.
#   sh .cache/judge-count-prod.sh run pictures|writing
#   sh .cache/judge-count-prod.sh status pictures|writing
set -e
HOST=ben@192.168.1.202
K="$2"
case "$K" in pictures|writing) ;; *) echo "usage: sh .cache/judge-count-prod.sh run|status pictures|writing" >&2; exit 1;; esac
C=$(ssh $HOST 'docker ps -q --filter publish=3000')
case "$1" in
run)
  ssh $HOST "nohup docker exec $C sh -c 'bun run ingest --kind $K --dry-run --skip-llm > /app/.cache/judge-count-$K.log 2>&1' > /dev/null 2>&1 &"
  echo "started. sh .cache/judge-count-prod.sh status $K"
  ;;
status)
  ssh $HOST "docker exec $C sh -c 'grep -E \"^--kind|already in DB|floor dropped|^curated|would insert|elapsed\" /app/.cache/judge-count-$K.log || tail -5 /app/.cache/judge-count-$K.log'"
  ;;
*) echo "usage: sh .cache/judge-count-prod.sh run|status pictures|writing" >&2; exit 1;;
esac
```

- [ ] **Step 4: `.cache/judge-run-prod.sh`** — a weekly job by hand, and how the VM is taking it.

```sh
#!/bin/sh
# 10-02-26. One weekly job run by hand on production, detached — the first runs after the flip,
# and any re-run after a ceiling stop. It judges with whatever CURATOR_JUDGE the container has.
#   sh .cache/judge-run-prod.sh run pictures|writing
#   sh .cache/judge-run-prod.sh status pictures|writing    # log tail + memory, as often as you like
set -e
HOST=ben@192.168.1.202
K="$2"
case "$K" in pictures|writing) ;; *) echo "usage: sh .cache/judge-run-prod.sh run|status pictures|writing" >&2; exit 1;; esac
C=$(ssh $HOST 'docker ps -q --filter publish=3000')
case "$1" in
run)
  ssh $HOST "curl -s localhost:3000/api/health" | sed 's/^/health: /'; echo
  ssh $HOST "docker exec $C sh -c 'printf \"judge: %s, workers: %s\n\" \"\$(printenv CURATOR_JUDGE || echo openrouter)\" \"\$(printenv CLAUDE_JUDGE_CONCURRENCY || echo default)\"'"
  ssh $HOST "nohup docker exec $C sh -c 'bun run ingest --kind $K > /app/.cache/ingest-$K-manual.log 2>&1' > /dev/null 2>&1 &"
  echo "started. sh .cache/judge-run-prod.sh status $K"
  ;;
status)
  ssh $HOST "docker exec $C sh -c 'tail -25 /app/.cache/ingest-$K-manual.log'"
  ssh $HOST "docker stats --no-stream --format '{{.Name}} cpu {{.CPUPerc}} mem {{.MemUsage}}' | grep -i mxo9s7hk; free -m | sed -n 2,3p; uptime"
  ;;
*) echo "usage: sh .cache/judge-run-prod.sh run|status pictures|writing" >&2; exit 1;;
esac
```

- [ ] **Step 5: `.cache/coolify-weekly-tasks.sh`** — the schedule.

```sh
#!/bin/sh
# 10-02-26. The nightly `ingest` task becomes two weekly ones (docs/PLAN_judge-on-vm202.md):
#   ingest-pictures   0 8 * * 1,2   Monday, and Tuesday as the catch-up night
#   ingest-writing    0 8 * * 4,5   Thursday, and Friday as the catch-up night
# Coolify's cron clock is UTC: 08:00 UTC is 4 am Eastern (3 am in winter).
#
# BEFORE running this: in Coolify's UI, add a second scheduled task on the Ambit resource named
# exactly `ingest-writing`, command `true`, frequency `0 8 * * 4,5`. The row is created there
# because a scheduled_tasks row carries ids this script should not invent; the command is set
# here because its `$` would be eaten by any shell it passed through (the SQL goes over STDIN).
# Safe to re-run.
set -e
HOST=ben@192.168.1.202
ssh $HOST "docker exec -i coolify-db psql -U coolify -d coolify -v ON_ERROR_STOP=1" <<'SQL'
update scheduled_tasks
   set name = 'ingest-pictures',
       frequency = '0 8 * * 1,2',
       command = 'L=/app/.cache/ingest-pictures-$(date +%F).log; bun run ingest --kind pictures > $L 2>&1; rc=$?; tail -60 $L; exit $rc',
       timeout = 10800
 where id = 3;
update scheduled_tasks
   set frequency = '0 8 * * 4,5',
       command = 'L=/app/.cache/ingest-writing-$(date +%F).log; bun run ingest --kind writing > $L 2>&1; rc=$?; tail -60 $L; exit $rc',
       timeout = 10800
 where name = 'ingest-writing';
select id, name, enabled, frequency, timeout, command from scheduled_tasks where id = 3 or name = 'ingest-writing';
SQL
```

- [ ] **Step 6: `.cache/judge-fallback-prod.sh`** — OpenRouter, by hand, once.

```sh
#!/bin/sh
# 10-02-26. The manual switch back to OpenRouter (Ben, 10-01-26: never automatic). ONE weekly job,
# judged through OpenRouter for this run only — `docker exec -e` overrides the container's
# CURATOR_JUDGE without a redeploy. Needs OPENROUTER_API_KEY still in Coolify's env (it stays).
# The two judges keep separate cache namespaces, so this re-judges nothing Claude already judged
# and Claude will not re-judge what this stores.
#   sh .cache/judge-fallback-prod.sh run pictures|writing
#   sh .cache/judge-fallback-prod.sh status pictures|writing
# To go back for good: delete CURATOR_JUDGE in Coolify's env and restart the resource.
set -e
HOST=ben@192.168.1.202
K="$2"
case "$K" in pictures|writing) ;; *) echo "usage: sh .cache/judge-fallback-prod.sh run|status pictures|writing" >&2; exit 1;; esac
C=$(ssh $HOST 'docker ps -q --filter publish=3000')
case "$1" in
run)
  ssh $HOST "nohup docker exec -e CURATOR_JUDGE=openrouter $C sh -c 'bun run ingest --kind $K > /app/.cache/ingest-$K-openrouter.log 2>&1' > /dev/null 2>&1 &"
  echo "started on OpenRouter. sh .cache/judge-fallback-prod.sh status $K"
  ;;
status) ssh $HOST "docker exec $C sh -c 'tail -25 /app/.cache/ingest-$K-openrouter.log'" ;;
*) echo "usage: sh .cache/judge-fallback-prod.sh run|status pictures|writing" >&2; exit 1;;
esac
```

- [ ] **Step 7: `.cache/publications-claude-prod.sh`** — the backfill, one publication at a time. (This supersedes `.cache/publications-backfill-prod.sh`, which loops all seven: after a ceiling stop that loop would walk each remaining archive in full only to abort on its first judgment. Leave the old file; add a first comment line to it: `# SUPERSEDED 10-02-26 by publications-claude-prod.sh — do not run.`)

```sh
#!/bin/sh
# 10-02-26. A publication's archive on production, judged by Sonnet on the subscription
# (docs/PLAN_judge-on-vm202.md Task 9). ONE publication per invocation, on purpose: a run that
# stops at the 80% ceiling writes nothing but keeps every judgment in the cache, so the same
# command after the reset finishes it — and nothing else should start in between.
#
#   sh .cache/publications-claude-prod.sh run <id>          # newest first, to its backfillQuota
#   sh .cache/publications-claude-prod.sh run <id> 300      # newest 300 only (a measured first bite)
#   sh .cache/publications-claude-prod.sh status <id>
#   sh .cache/publications-claude-prod.sh warm <id>         # its pictures into the cache, 1/s
#
# Works while the publication is still in SUSPENDED_SOURCES (an explicit --source always runs);
# its rows stay out of the feed until it leaves that list.
# Disk: rows only for `run`; `warm` adds ~150 KB a picture to the cache volume (~1 GB for all seven).
set -e
HOST=ben@192.168.1.202
S="$2"
case "$S" in themarginalian|jstordaily|noema|aeon|psyche|longreads|theparisreview) ;; *) echo "usage: sh .cache/publications-claude-prod.sh run|status|warm <publication> [quota]" >&2; exit 1;; esac
C=$(ssh $HOST 'docker ps -q --filter publish=3000')
case "$1" in
run)
  BOUND="--backfill"; [ -n "$3" ] && BOUND="--quota $3"
  J=$(ssh $HOST "docker exec $C printenv CURATOR_JUDGE || true")
  [ "$J" = "claude" ] || { echo "CURATOR_JUDGE is '$J' in the container, not 'claude' — refusing: the publications are held for the Claude judge." >&2; exit 1; }
  ssh $HOST "df -h / | tail -1" | sed 's/^/VM disk: /'
  ssh $HOST "nohup docker exec $C sh -c 'bun run ingest --source $S $BOUND > /app/.cache/pub-$S-walk.log 2>&1' > /dev/null 2>&1 &"
  echo "started $S ($BOUND). sh .cache/publications-claude-prod.sh status $S"
  ;;
status)
  ssh $HOST "docker exec $C sh -c 'tail -30 /app/.cache/pub-$S-walk.log; echo; tail -3 /app/.cache/pub-$S-warm.log 2>/dev/null || true'"
  ;;
warm)
  ssh $HOST "nohup docker exec $C sh -c 'bun run img:warm --source $S --rate 1 > /app/.cache/pub-$S-warm.log 2>&1' > /dev/null 2>&1 &"
  echo "warming $S. sh .cache/publications-claude-prod.sh status $S"
  ;;
*) echo "usage: sh .cache/publications-claude-prod.sh run|status|warm <publication> [quota]" >&2; exit 1;;
esac
```

- [ ] **Step 8: Check the scripts parse, and that the read-only one works**

Run: `for f in judge-vm-check judge-probe-prod judge-count-prod judge-run-prod coolify-weekly-tasks judge-fallback-prod publications-claude-prod; do sh -n .cache/$f.sh && echo "$f ok"; done`
Expected: seven `ok`.

Run: `sh .cache/judge-vm-check.sh`
Expected: it prints (read-only). Before Task 7 it shows `claude: NOT INSTALLED` or a not-found line and the `kind` query errors; that is correct.

Nothing to commit: `.cache/` is git-ignored.

---

## Part B — production (Ben runs; the agent reads what he pastes)

**Standing rule for this part:** each task ends in a gate. If the gate's expected reading is not what came back, stop and say so; do not go on to the next task.

### Task 7: Deploy, token, proof

Adds to VM 202's disk: one new image (the size written down in Task 4, ~0.2 GB more than the old one; Coolify keeps a few old images, so check the "images on disk" lines and prune if there are more than three). Nothing on the cache volume.

- [ ] **Step 1: Preconditions.** `sh .cache/judge-vm-check.sh`. Gate: **`nproc: 4`** (if it reads 1, do `qm set 202 --vcpus 4` on the Proxmox host and reboot VM 202 first); health `"ingest":"ok"` (the Met pause, `dafc6c8`, has had a green nightly); disk free ≥ 30 GB. And in claude.ai → Settings → Usage, **extra usage is off**.
- [ ] **Step 2: Merge and deploy.** Ben merges `feat/judge-vm202` into `main`, pushes, and presses Deploy in Coolify — not between 01:30 and 02:30 UTC while the nightly task still exists. Gate: `sh .cache/judge-vm-check.sh` shows the new commit in health, `"ingest":"ok"` (rows without a kind count for both), `ingestKinds` present with both `ok`, `2.1.287 (Claude Code)`, and the `ingest_run` query printing a `kind` column.
- [ ] **Step 3: Mint the token.** On the Mac: `! claude setup-token`. It prints a token once. Save it in the password manager as "Ambit judge — Claude Code OAuth token (VM 202)" with today's date and **the expiry, one year out**; put a calendar reminder a week before it. (It is an inference-only token for the whole subscription, per the docs; treat it as that.)
- [ ] **Step 4: Three variables in Coolify**, on the Ambit resource, all runtime, **"Build Variable" unticked** on each: `CLAUDE_CODE_OAUTH_TOKEN` = the token; `CLAUDE_JUDGE_CONCURRENCY` = `2`; and **not yet** `CURATOR_JUDGE`. Restart the resource so the container has them. Gate: `sh .cache/judge-vm-check.sh` shows `CLAUDE_CODE_OAUTH_TOKEN: set`, `CLAUDE_JUDGE_CONCURRENCY=2`, `CURATOR_JUDGE=unset`, `ANTHROPIC_API_KEY: unset`.
- [ ] **Step 5: The probe.** `sh .cache/judge-probe-prod.sh`. Gate: `reply: {"ok": true}`; **`tokens` under 600**; `usage` shows `five_hour` and `seven_day`; `ceiling: not reached`. Paste the whole output to the agent, which records the raw usage report in the log — it is the only look anyone gets at whether the report carries a field about overage. If `tokens` is in the tens of thousands, the pinned CLI is not honouring the stripping flags on this host: stop.
- [ ] **Step 6: Push the Mac's Claude envelopes.** `sh .cache/push-caches.sh` (existing; skips anything production has). Adds a few MB to the cache volume: the Claude-judged envelopes from 10-01's calibration and comparison runs.

### Task 8: The flip, the first runs, the schedule

Adds to disk: rows, and dated logs of a few hundred KB. `img-warm` stays disabled, so no pictures are fetched until a reader sees them.

- [ ] **Step 1: Count before judging.** `sh .cache/judge-count-prod.sh run pictures`, then `status pictures` until `elapsed` shows; the same for `writing`. Gate: each `curated:` number is **a week's new items — hundreds, at most a few thousand**. A number near the corpus's size (170,000) would mean stored rows are reaching the curator: stop and report. Write both numbers down.
- [ ] **Step 2: The schedule first, so no nightly run fires under the new judge.** In Coolify's UI add the `ingest-writing` task (command `true`, frequency `0 8 * * 4,5`), then `sh .cache/coolify-weekly-tasks.sh`. Gate: its closing `select` shows `ingest-pictures | 0 8 * * 1,2` and `ingest-writing | 0 8 * * 4,5`, both commands containing `--kind`, both timeout 10800, and no task left on `30 1 * * *`. Open each task in the UI and confirm it shows the same frequency.
- [ ] **Step 3: Flip.** In Coolify add `CURATOR_JUDGE` = `claude` (runtime, not build) and restart. Gate: `sh .cache/judge-vm-check.sh` shows `CURATOR_JUDGE=claude`.
- [ ] **Step 4: First pictures run, two workers.** At an hour Ben is not using Claude himself: `sh .cache/judge-run-prod.sh run pictures`; then `status pictures` every few minutes while it curates. Read: memory (the app container and `free`'s `available`, which should stay above 3 GB), load average (should sit under 4), and at the end the summary's `judge:` line — `claude-haiku-4-5-20251001 (pictures), … 2 worker(s) · five_hour A% → B% · seven_day C% → D%` — and `elapsed`. Gate: exit clean (an `ingest_run` row with `exit_code 0`, `kind pictures`), `no-image` near zero, `inserted` close to Step 1's count. Record: items judged, points of each window moved, minutes, peak memory.
- [ ] **Step 5: First writing run.** The same with `writing`. This is Sonnet's first measured cost: record points of the five-hour window per hundred pieces — Task 9 sizes its bites from it.
- [ ] **Step 6: Four workers.** If Step 4's memory and load left room (they should: four workers are ~1 GB), set `CLAUDE_JUDGE_CONCURRENCY` = `4` in Coolify and restart. If the VM was tight, leave it at 2 and say so in the log.
- [ ] **Step 7: The witness.** `curl -s https://ambit.benreilly.io/api/health`. Gate: `"ingest":"ok"` with both kinds `ok` and their `lastAt` at this task's two runs. UptimeRobot's `ambit/ingest` keyword monitor needs no change — confirm it is green.
- [ ] **Step 8: The first scheduled fire is the proof of the schedule.** The Monday (or Thursday) after: `sh .cache/judge-vm-check.sh` at or after 09:00 UTC shows a new `ingest_run` row of that kind started at 08:00, and `/app/.cache/ingest-pictures-<date>.log` exists. If no row appears, Coolify did not pick the new frequency up from the database: toggle the task off and on in its UI and press *Execute now* once.

**A ceiling stop, when it happens:** the run exits 1 with `ingest aborted: Claude judge stopped: …` and Coolify mails the failure. Nothing was written and everything judged is cached. The next night's catch-up run finishes it for free. Two stopped nights in a row for one kind turn health `stale` after eight days and six hours, which is the alert that the weekly budget does not fit.

### Task 9: The publications

Adds to disk: ~10,750 rows; `warm` adds ~1 GB of pictures to the cache volume in all. Check `df` before each `warm`.

- [ ] **Step 1: The smallest first.** `sh .cache/publications-claude-prod.sh run theparisreview` (ten pieces); `status theparisreview`. Gate: the walk summary shows ten offered, the `judge:` line names `claude-sonnet-5-5 (writing)`, stored scores read sensibly.
- [ ] **Step 2: A measured bite.** `sh .cache/publications-claude-prod.sh run psyche 100`. From its `judge:` line and Task 8 Step 5, work out pieces per five-hour window at the 80% ceiling. **Every later run is sized to fit one window** with a margin: if 100 pieces move the five-hour window 10 points from a start of 20%, a bite is at most ~500.
- [ ] **Step 3: The rest, one at a time, a readout between each**, in this order: `psyche` (1,000) · `noema` (1,250) · `aeon` (2,000) · `themarginalian` (2,000) · `jstordaily` (2,000) · `longreads` (2,500, last: it is mostly excerpts and the writing floor drops about a third). Use growing quotas (`run aeon 500`, then `run aeon 1000`, …, then `run aeon` with no number for the full budget): each run stores what it judged, and the next skips those rows before the curator. After each publication the agent reads the pasted summary for: inserted, floored, un-homed and their tags, the score spread. A run that stops at the ceiling is re-run unchanged after the reset. Watch the **seven-day** figure on every `judge:` line; if the backfill would take it past ~60%, the remaining publications wait for next week.
- [ ] **Step 4: Warm each as it lands.** `sh .cache/publications-claude-prod.sh warm <id>` after its last walk, one at a time.
- [ ] **Step 5: Release them (the agent, a code change).** On a branch `feat/release-publications` off `main`:
  - In `src/server/config/suspended-sources.ts`, delete the seven lines `"themarginalian"` … `"theparisreview"` from `SUSPENDED_SOURCES` and replace the comment above them with: `// The seven publications were held here until production's judge was Claude; released <date> after their backfill (docs/PLAN_judge-on-vm202.md Task 9).` — placed as a comment only, no ids.
  - In `src/server/config/publications.test.ts`, replace the test `"holds every publication suspended until the Claude judge exists"` and the comment above it with:

    ```ts
      // Held until production's judge was Claude (10-01-26); released after the backfill.
      it("has released every publication to the weekly writing ingest", () => {
        for (const p of PUBLICATIONS)
          expect(isSuspendedSource(p.id), p.id).toBe(false);
      });
    ```
  - Run `bun run check`. Expected: green. Commit `feat(sources): release the seven publications — backfilled under the Claude judge`, push, Ben merges and deploys (not on a Monday, Tuesday, Thursday or Friday between 08:00 and 11:00 UTC).
  - Gate: the next Thursday run's walk table lists the seven, each bounded by its `walkQuota`, almost everything `already in DB`.

### Task 10: Close-out docs (the agent)

**Files:** `SPEC.md` §13, `CLAUDE.md`, `docs/DESIGN_claude-judge-ingest.md`, `docs/HANDOFF_judge-on-vm202.md`, `log.md`, and the memory file `claude-judge-state.md`.

- [ ] **Step 1: SPEC §13**, as *what is deployed*:
  - "The image": add the pinned CLI (version, the size from Task 4, how to bump it, `judge:probe` as the check).
  - The environment table: `CURATOR_JUDGE` = `claude`; `CLAUDE_CODE_OAUTH_TOKEN` (one-year, minted `<date>`, expires `<date>`, runtime only); `CLAUDE_JUDGE_CONCURRENCY`; `OPENROUTER_API_KEY`'s row gains "kept for the manual fallback".
  - Replace the "Nightly ingest" bullet: two tasks, their crons, 08:00 UTC = 4 am Eastern, after the 04:00 backup (new rows are backed up the following night), the catch-up nights, the dated log names, what a ceiling stop looks like.
  - The alert map: "No successful ingest in 30 h" becomes "A weekly ingest with no success in 8 d 6 h — `ingestKinds` names which"; the health-contract paragraph gains `ingestKinds`, the kind a manual run records, and that rows without a kind count for both. The standing rule's window becomes "no deploy Mon/Tue/Thu/Fri 08:00–11:00 UTC".
  - A fallback paragraph: `.cache/judge-fallback-prod.sh` for one run; deleting `CURATOR_JUDGE` and restarting for good.
  - Standing rules: extra usage stays off; `ANTHROPIC_API_KEY` is never set on the resource.
- [ ] **Step 2: CLAUDE.md.** In the status paragraph, replace the "Future work item: move the judge to VM 202" sentence with two sentences on what is live (the judge on VM 202, the weekly pair, the pinned CLI, the token's expiry, the publications released). In "Local dev environment", extend the Claude-judge bullet: on production the login is `CLAUDE_CODE_OAUTH_TOKEN`; `bun run judge:probe` is the first thing to run when a judged ingest fails.
- [ ] **Step 3: The design doc.** Under "Open, for the piece 2/3 plan", mark each item closed with one line and the measured numbers from Tasks 8–9 (window points per hundred pictures and per hundred pieces, peak memory at two and four workers, weekly run time). Amend D10's time to 08:00 UTC with the reason.
- [ ] **Step 4: The handoff.** Add a first line to `docs/HANDOFF_judge-on-vm202.md`: `**Closed <date>: planned in docs/PLAN_judge-on-vm202.md and executed.**`
- [ ] **Step 5: Log and memory.** `log.md`: today's entry with **Shipped**, **Findings** (the raw usage report from Task 7 Step 5 and what it does and does not say about overage; the measured costs), **Decisions**, **Open / next** (a fresh batch of writing marks; the Met's v1.1 port; whether a month of runs shows drift worth a re-score, D4), and the session-spend line. Update `~/.claude/projects/-Users-ben-Dev-ambit/memory/claude-judge-state.md` and its `MEMORY.md` line to the live state.
- [ ] **Step 6: Commit.**

```bash
git add SPEC.md CLAUDE.md docs/DESIGN_claude-judge-ingest.md docs/HANDOFF_judge-on-vm202.md log.md
git commit -m "docs: the judge runs on VM 202 — SPEC §13, the weekly pair, the release of the publications"
```

---

## Not in this plan

The per-reader dark-material setting; a fresh batch of writing marks; porting the Met adapter to `/v1.1/search`; any re-score of stored rows under the Claude judge (D4: decided after a month of weekly runs shows the drift); re-enabling `img-warm` on a schedule.
