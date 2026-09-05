# Feed tuning — the dev knob panel: live levers, honest readouts, zero corpus burn

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-05-26 by Fable 5.1, from three read-only explorations of the feed engine, the
client, the UI kit and the test conventions, and four decisions Ben made the same afternoon.
**For:** a cold session on a cheaper model.

**Goal:** a `/dev/feed` route that renders the real feed with a right-hand drawer of sliders for
**every feed knob — the ten that exist plus two new levers for the grown-topic question** — where
moving a slider recomposes the feed in one request (~25 ms server time), a readout says what
each page and the session were made of (**tier counts, core-vs-grown split, topic and source
histograms**), and **no page served while tuning stays in `seen_item`**. It closes SPEC §9's
standing "debug overlay + tuning knobs behind a dev flag" requirement, which until now was a
tier letter in a tile corner and a CLI script.

**Architecture:** Four moves. (1) Two new server levers in `feed.ts` — `grownEdgeScale` multiplies
every graph edge that touches a grown topic before the walk, `grownHopPenalty` scales a DRIFT
hop's weight onto a grown topic inside the softmax — both plain `FeedKnobs` with defaults of `1`,
so `/feed` is byte-for-byte unchanged. (2) A dev-only `feed.forgetSince` mutation that deletes the
caller's `seen_item` rows served since an instant; the panel acks pages exactly like production
and forgets them on every apply, so the seen filter keeps working *within* a tuning session
(the cursor's anchor arithmetic depends on it — see Global Constraints) and the net burn is zero.
(3) `FeedScreen` gains an optional `dev` prop; with it, the screen sends knobs in the query
input, mounts the panel and the readout, and runs the forget-then-refetch cycle; without it,
nothing changes and the `{}` hydration key stays intact. (4) A server-rendered `/dev/feed` page,
gated on the *same* expression that gates the knobs, so the route exists exactly when the knobs
are honored.

**Tech Stack:** Next.js 16.2 App Router, React 19, tRPC + React Query, Zod 3.25, Tailwind v4
(CSS-first tokens), Vitest 4 (+ jsdom for components), Playwright 1.62. **No new dependencies.**
The slider is a native `<input type="range">` with `accent-color`, exactly as the Phase 0.5 bench
did it.

**Spec:** `SPEC.md` §9 (the requirement, line ~499: "the tuning knobs … ship in the app behind a
dev flag for the whole development period"), §7 (`feed.page`'s knob contract, ~346), §15 ("knobs
stay in behind the dev flag for exactly this", ~660). Prior art: `phase0/feed.template.html:165-192`
(the original drawer — this plan ports its control set and adds readouts), `scripts/probe-feed.ts`
(the CLI harness whose `tierCounts`/`topicCounts` this panel puts on screen),
`docs/DESIGN_topic-vocabulary-growth.md` "one feel question 2b inherits" (59/96 cards grown — the
question this panel exists to answer).

---

## Scope

**In:** the two levers; the forget mutation; a `Slider` primitive; a pure `pageStats` function; the
`KnobPanel` and its `useDevKnobs` hook (localStorage, copy-as-JSON, reset); the `dev` prop on
`FeedScreen`; the `/dev/feed` route; a `--grown-scale` flag and a core-set fix on
`scripts/rebuild-topic-graph.ts` so a tuned scale can be baked into the artifact; tests at every
layer; one e2e spec.

**Out:** the desktop layout of the *feed itself* (a separate polish session — the masonry stays
two columns), any change to `DEFAULT_KNOBS` (that is the outcome of tuning, recorded by hand
afterwards), the gallery rail and wander knobs (they hardcode `DEFAULT_KNOBS`; noted, not moved),
Cut 2b, production exposure of any of this.

## Global Constraints

- **`/feed`'s query key is `{}` and must stay `{}`.** `src/app/feed/page.tsx:45` prefetches
  `feed.page` with `{}` and `src/components/feed/feed-screen.tsx:50` queries with `{}`. React
  Query keys on `(path, input)`; a mismatch does not throw, it orphans the RSC payload, the
  client refetches page one, and the ack effect then **permanently burns a page of the reader's
  corpus on every load**. Every change to `FeedScreen` in this plan is guarded by `dev` being
  present; the without-`dev` path must produce the literal input `{}` (not `{ knobs: undefined }`
  — a key with an explicit `undefined` value serialises differently). A test pins this.
- **Skipping the ack is not an option, which is why `forgetSince` exists.** `getFeedPage`
  advances the cursor's `anchor` to each page's `servedAt` (`feed.ts:588-594`) and `getTopicPools`
  excludes items with `seen_item.served_at < anchor`. Within a session, the only thing keeping
  page 3 from re-serving page 1's items is that page 1 was *acked*; `prev` in the cursor covers
  the previous page alone. A panel that skipped acks would start repeating items on page 2 and
  the readouts would be lies. So: ack normally, forget afterwards.
- **The knob gate is one expression and it must stay one.** Today it is duplicated at
  `feed.ts:530` and `gallery-rail.ts:228`: `env.FEED_DEBUG ?? env.NODE_ENV === "development"`.
  Task 1 moves it to a single helper; the route, the mutation and both engines call the helper.
  Two gates that can disagree is how a dev route ends up serving ignored knobs with no warning.
- **`~/env` is never statically imported from `src/server/services/*` or `src/server/db/*`.**
  Every existing module dynamic-imports it inside the function that needs it, because CI's
  `bun run test` runs without env vars and Zod fails at import. The new helper follows suit.
- **Grown-edge scaling must preserve the graph's shape.** `src/server/config/topics.test.ts:53-80`
  pins: every row has `keys.length - 1` entries, every neighbour has a row. `pickJump` slices the
  *bottom half* of a row and `pickDrift` reads a *descending* row, so a scaled row is the same
  length, the same key set, and re-sorted descending.
- **Core set, two sources, one test.** Server-side the levers use `TOPICS` ids from
  `src/server/config/topics.ts` (static, no query in the hot path). The readout uses
  `topic.tier === "core"` from the DB (authoritative, one query per page load). They are the same
  sixteen today; Task 2 adds a test that says so, and if they ever diverge the test names the
  fix (the config is the contract).
- Shared checkout: run `git branch --show-current && git status` immediately before every
  `git add`; stage by name; never `git add -A`.
- Gates before every commit: `bunx eslint <files> && bunx prettier --check <files>`, plus
  `bun run typecheck` and `bun run test` at task ends (~35 s).
- Comment generously — this repo is Ben's teaching vehicle.

## 0. What the planning session measured (09-05-26) — read, don't redo

- **Production** is at `55bdf5d` (Cut 2a) as of 09-05; the 83 grown topics are promoted there.
  **Local** corpus: 21,892 items, all sources, 99 topics. Tuning happens locally (Ben's call).
- **Graph** (`src/server/config/topic-graph.json`): 99 keys × 98 entries = 9,702 edges,
  sim min −0.384 · max 1.121 · mean −0.005. Only **core×core** cells carry the embedding values
  Ben tuned in Phase 0.5; every other cell (core→grown, grown→core, grown→grown) is rescaled
  tag co-occurrence, and it is **asymmetric** (`poetry→cats` 0.03, `cats→poetry` −0.02). The
  rebuild script's rescale target is a single global scalar, the mean per-row sd of the input
  graph, measured at **0.1345**.
- **A latent bug in `scripts/rebuild-topic-graph.ts:32-33`:** it detects "tuned" rows as *the keys
  of the current JSON*. That meant "the sixteen" on the first run and means "all 99" now, so a
  re-run today would freeze every grown value in place. Task 7 fixes it (core = `TOPICS` ids) —
  it has to, because baking a tuned `grownEdgeScale` is a re-run.
- **The Phase 0.5 bench's control set** (`phase0/feed.template.html:167-189`), which this panel
  ports one-for-one and then extends:

  | Section | Label | knob | range | step |
  |---|---|---|---|---|
  | Tier mix | CORE — your topics | `tierCore` | 0–100 | 1 |
  | | DRIFT — adjacent topics | `tierDrift` | 0–100 | 1 |
  | | JUMP — far topics | `tierJump` | 0–100 | 1 |
  | Taste | Curation score floor | `scoreFloor` | 1–9 | 1 |
  | | Score weighting power | `scorePower` | 0–3 | 0.1 |
  | | Aesthetic-tag boost | `tagBoost` | 0–2 | 0.1 |
  | Drift shape | Drift temperature | `temp` | 0.03–0.60 | 0.01 |
  | | Second-hop chance | `hop2` | 0–0.8 | 0.01 |
  | Diversity | Per-page topic cap | `topicCap` | 1–8 | 1 |
  | | Page size | `pageSize` | 6–24 | 1 |

  The bench had **no** tier-count or topic histogram; readouts are this plan's addition.
- **Wire bounds already shipped** in `src/server/api/routers/feed.ts:20-33` (`feedKnobsSchema`):
  `scoreFloor 1..10`, `hop2 0..1`, `pageSize int 1..50`, `temp ≥ 0.01`, everything else `≥ 0`.
  The slider ranges above sit inside them.
- **UI kit has no slider and no toggle** (`src/components/ui/` inventory checked). `Segmented`,
  `Button`, `IconButton`, `BottomSheet` exist. `BottomSheet` spans the full viewport width on
  desktop — not used here. CSP allows inline `style={{}}` (`style-src 'unsafe-inline'`, decision
  D1 in `src/config/security-headers.js:85-88`); a second inline `<script>` would fail
  `no-dangerous-html.test.ts` — don't add one.
- **Precedent for a dev route:** `src/app/dev/tokens/page.tsx:177` gates with the build-time
  `process.env.NODE_ENV === "production" → notFound()`. This plan gates `/dev/feed` on the
  *server* helper instead (Decision D3) — a runtime check, consistent with the knobs.
- **Test seams that exist:** `feed.test.ts:31,42` mocks `~/env` via `vi.hoisted` `mockEnv`;
  `routers.test.ts:59-95` has `anonContext()`/`authedContext()`; `feed-screen.test.tsx:35-61` mocks
  `~/trpc/react` wholesale, with `feed.page.useInfiniteQuery` as a **zero-arg thunk** (so today no
  test can see the query input — Task 5 changes the mock to capture it); the five DB-backed suites
  are `*.integration.test.ts` under `describe.skipIf(!process.env.DATABASE_URL)`.
- **E2E runs `next dev` locally and a production build in CI** (`playwright.config.ts`, `E2E_PROD`).
  Under the production build `FEED_DEBUG` is unset, the helper resolves false, and `/dev/feed`
  is a 404 — so the new spec self-skips on a 404 and is exercised by `bun run e2e` locally, not by
  CI. Recorded as a known gap in the Verification section.

## 1. Decisions

**Ben's (09-05-26):**

1. **Local dev only.** The panel is for the local corpus under `bun run dev`. Production never
   shows it (and cannot: the gate is off there).
2. **Tuning must not eat the corpus.** Ben chose "panel skips the ack"; the planner's D2 below
   reaches the same outcome by a different mechanism, for a reason measured in the code — if
   Ben objects to *forget-after* specifically, the fallback is a throwaway tuning account, not
   skip-ack.
3. **Both new levers**: `grownEdgeScale` and `grownHopPenalty`.
4. **Copy-as-JSON** to capture a setting; knobs persist in `localStorage` across reloads.
5. **The 59/96 feel question ships as-is** (already deployed); this panel is how it gets answered.

**The planner's, under those — flip before executing, not during:**

- **D1 — A separate route, not a toggle on `/feed`.** `/dev/feed` renders the same `FeedScreen`
  with a `dev` prop and **no RSC prefetch**. `/feed` keeps its `{}` contract untouched. Reason: the
  Global Constraint above; a panel on `/feed` would have to change the query key the moment it
  sends knobs, and the prefetch would then be waste plus a burned page on every load.
- **D2 — Ack normally, forget on apply.** New `feed.forgetSince({ since })`, dev-gated. Every
  slider commit and the "Restart" button do: forget everything served since the session mark →
  move the mark to now → refetch with a fresh seed. Reason: the anchor arithmetic (Global
  Constraints, second bullet). Net effect is Ben's ask — zero rows left behind — with honest
  within-session dedupe. The mark is client time and `served_at` is server time; locally that is
  one clock. If this ever runs against a remote server, subtract a minute from the mark.
- **D3 — One gate helper, used by the route.** `feedDebugEnabled(): Promise<boolean>` in
  `src/server/services/feed-debug.ts`; `feed.ts`, `gallery-rail.ts`, `routers/feed.ts`'s
  `forgetSince` and `app/dev/feed/page.tsx` all call it. The route 404s when knobs would be
  ignored, so there is no "panel shows but nothing moves" state to explain.
- **D4 — Levers are plain knobs with identity defaults.** `grownEdgeScale: 1`,
  `grownHopPenalty: 1` in `DEFAULT_KNOBS`, so the existing distribution tests in `feed.test.ts`
  hold without edits and `/feed` composes identically. Scale is applied to a per-request copy of
  the graph, never to `TOPIC_GRAPH` itself.
- **D5 — Commit-on-release sliders, no Apply button.** Dragging updates the number beside the
  slider; releasing (pointer-up, key-up, blur) commits one request. Matches the bench's "live, no
  apply" feel while keeping it to one page per gesture.
- **D6 — Readouts are per page *and* per session.** Per page: tier counts, core/grown, topics
  (label · count), sources. Session: the same, summed, plus "served / forgotten" counters and a
  drift-path list for the last page with sims. This is the information Ben said was missing.
- **D7 — Grown labels come from the DB on the dev route.** `/dev/feed` passes all 99 labels
  (`listAllTopics()`) as `topicLabels`, so Because tiles and the readout name grown topics;
  `/feed` keeps passing the sixteen from config (out of scope to change).
- **D8 — Panel layout is a fixed right drawer**, 340 px, collapsible to a tab, with the feed
  padded right by the same amount at `lg:` and above. Below `lg:` it overlays. Dev tool, desktop
  first; the feed's own desktop layout is the next session.
- **D9 — The rebuild script gains `--grown-scale <s>`** and reads the core set from `TOPICS`.
  Tuning ends in a number; this is how the number becomes the artifact without a second plan.

## 2. File map

| path | responsibility |
|---|---|
| `src/server/services/feed-debug.ts` — **create** (Task 1) | `feedDebugEnabled()` — the one gate |
| `src/server/services/feed.ts` — modify (Tasks 1, 2) | use the helper; `grownEdgeScale`/`grownHopPenalty` knobs; `scaleGrownEdges()`; penalty in `hop()`; `coreTopicIds` through `composePage`/`pickDrift` |
| `src/server/services/gallery-rail.ts` — modify (Task 1) | use the helper (no behaviour change) |
| `src/server/services/feed.test.ts` — modify (Tasks 1, 2) | gate tests keep passing via the mocked `~/env`; new lever tests |
| `src/server/config/topics.test.ts` — modify (Task 2) | `TOPICS` ids == the graph's fully-rescaled rows' complement, i.e. the core set |
| `src/server/api/routers/feed.ts` — modify (Tasks 2, 3) | two new zod fields; `forgetSince` mutation |
| `src/server/api/routers/routers.test.ts` — modify (Tasks 2, 3) | bounds; `forgetSince` UNAUTHORIZED / FORBIDDEN / forwards |
| `src/server/db/feed.ts` — modify (Task 3) | `forgetSeenSince(userId, since): Promise<number>` |
| `src/server/db/feed.integration.test.ts` — modify (Task 3) | deletes only this user's rows at/after `since` |
| `src/components/ui/slider.tsx` — **create** (Task 4) | `Slider` — native range, label, live value, commit-on-release |
| `src/components/feed/dev/feed-stats.ts` — **create** (Task 4) | `pageStats(cards, coreIds)` and `sumStats()` — pure |
| `src/components/feed/dev/feed-stats.test.ts` — **create** (Task 4) | |
| `src/components/feed/dev/use-dev-knobs.ts` — **create** (Task 5) | knob state, localStorage, `toJson()`, `KNOB_SPECS` |
| `src/components/feed/dev/knob-panel.tsx` — **create** (Task 5) | the drawer: sliders, readouts, buttons |
| `src/components/feed/feed-screen.tsx` — modify (Task 5) | `dev?: FeedDevProps`; input, forget cycle, panel mount, right padding |
| `src/components/feed/feed-screen.test.tsx` — modify (Task 5) | input `{}` without `dev`; knobs with; panel present; forget called on apply |
| `src/app/dev/feed/page.tsx` — **create** (Task 6) | the gated RSC shell |
| `e2e/dev-feed.spec.ts` — **create** (Task 6) | panel visible, a slider commit refetches with knobs, readout renders; skips on 404 |
| `scripts/rebuild-topic-graph.ts` — modify (Task 7) | core set from `TOPICS`; `--grown-scale` |
| `scripts/rebuild-topic-graph.test.ts` — modify (Task 7) | scale applies to every non-core×core cell |
| `SPEC.md` §7, §9 · `docs/BUILD_PLAN.md` 9.7 · `CLAUDE.md` · `log.md` — modify (Task 8) | the contract and the narrative |

---

### Task 1: One gate helper, and both engines on it

The route (Task 6) and the mutation (Task 3) need to ask "are knobs honored right now?" and get
the same answer `getFeedPage` gets. Today that expression lives in two files. Land the helper
first so every later task imports it rather than copying the line a third and fourth time.

**Files:**
- Create: `src/server/services/feed-debug.ts`
- Modify: `src/server/services/feed.ts:525-530`, `src/server/services/gallery-rail.ts:224-228`
- Test: `src/server/services/feed.test.ts` (existing gate block, no new test — the refactor is
  proven by the block still passing with `~/env` mocked)

**Interfaces:**
- Produces: `feedDebugEnabled(): Promise<boolean>`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull --ff-only && git checkout -b feat/dev-knob-panel
```

- [ ] **Step 2: Create the helper**

`src/server/services/feed-debug.ts`:

```ts
// The dev-affordance gate (SPEC §9): are client-supplied feed knobs honored, and does each card
// carry its `debug` payload? One function, so the feed engine, the gallery rail, the
// `feed.forgetSince` mutation and the `/dev/feed` route can never disagree about the answer.
//
// The rule: `FEED_DEBUG=true|false` wins when set; otherwise development is on and everything
// else is off. It is NOT baked into env.js's schema on purpose — env.js validates strings, and
// the NODE_ENV-aware default is a policy, not a parse (see env.js's comment above FEED_DEBUG).
//
// Dynamic import, same as every other server module here: `~/env` throws at import when env
// vars are missing (CI's `bun run test`), and a static import would take every pure feed test
// down with it. Tests that need to flip the gate mock `~/env` via vi.hoisted — see
// feed.test.ts's `mockEnv`.
export async function feedDebugEnabled(): Promise<boolean> {
  const { env } = await import("~/env");
  return env.FEED_DEBUG ?? env.NODE_ENV === "development";
}
```

- [ ] **Step 3: Use it in `feed.ts`**

Replace lines 525-530 of `src/server/services/feed.ts` (the four-line dynamic-import comment,
the `const { env } = await import("~/env");` and the `const debugEnabled = …` line) with:

```ts
  // The dev gate, shared with the gallery rail, the forget mutation and the /dev/feed route —
  // see feed-debug.ts for the rule and for why it is a dynamic import underneath.
  const debugEnabled = await feedDebugEnabled();
```

and add the import near the other `./` imports at the top of the file:

```ts
import { feedDebugEnabled } from "./feed-debug";
```

- [ ] **Step 4: Use it in `gallery-rail.ts`**

Replace lines 224-228 of `src/server/services/gallery-rail.ts` (its comment + the two lines)
with the same three lines as Step 3, and add the same import.

- [ ] **Step 5: Run the gate tests, typecheck, gates**

Run: `bunx vitest run src/server/services/feed.test.ts src/server/services/gallery-rail.test.ts && bun run typecheck && bunx eslint src/server/services/feed-debug.ts src/server/services/feed.ts src/server/services/gallery-rail.ts && bunx prettier --check src/server/services/feed-debug.ts src/server/services/feed.ts src/server/services/gallery-rail.ts`
Expected: PASS, clean. The `getFeedPage — FEED_DEBUG knob gating` block still flips
`mockEnv.FEED_DEBUG` and still passes — the helper's dynamic import of `~/env` hits the same
`vi.mock`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current && git status
git add src/server/services/feed-debug.ts src/server/services/feed.ts src/server/services/gallery-rail.ts
git commit -m "refactor(feed): feedDebugEnabled() — one gate for knobs, debug payloads, and what comes next"
```

---

### Task 2: The two levers — `grownEdgeScale` and `grownHopPenalty`

The feel question is "how much of a page lands on grown topics." CORE cannot land there (weights
name core topics only); DRIFT and JUMP can. `grownEdgeScale` shrinks or grows every edge that
touches a grown topic before the walk — it moves *both* DRIFT (softmax over positive sims) and
JUMP (bottom-half draw) at once, and it is the lever that preserves the tier mix Ben tuned.
`grownHopPenalty` is the surgical one: only a DRIFT hop's *weight* onto a grown neighbour is
multiplied, nothing else moves. Both default to `1`, which is today.

**Files:**
- Modify: `src/server/services/feed.ts` (knobs 38-65, `hop` 224-238, `pickDrift` 249-281,
  `ComposePageOpts`/`composePage` 355-453, `getFeedPage` 511-596)
- Modify: `src/server/api/routers/feed.ts:20-33`
- Test: `src/server/services/feed.test.ts`, `src/server/api/routers/routers.test.ts`,
  `src/server/config/topics.test.ts`

**Interfaces:**
- Produces: `FeedKnobs.grownEdgeScale: number`, `FeedKnobs.grownHopPenalty: number`
  (both default `1`); `CORE_TOPIC_IDS: ReadonlySet<string>` (exported from `feed.ts`, built from
  `TOPICS`); `scaleGrownEdges(graph: TopicGraph, coreIds: ReadonlySet<string>, scale: number): TopicGraph`;
  `ComposePageOpts.coreTopicIds?: ReadonlySet<string>` (defaults to `CORE_TOPIC_IDS`);
  `pickDrift(weights, graph, knobs: Pick<FeedKnobs, "temp" | "hop2" | "grownHopPenalty">, rng, coreIds?)`.
- `feedKnobsSchema` gains `grownEdgeScale: z.number().min(0).max(4)`,
  `grownHopPenalty: z.number().min(0).max(1)`.

- [ ] **Step 1: Write the failing tests** — append to `src/server/services/feed.test.ts`, after
  the existing `pickJump` describe block and before the `getFeedPage — FEED_DEBUG` block. The
  file already imports `DEFAULT_KNOBS`, `composePage`, `pickDrift`, `hashSeed`, `mulberry32`
  and the `TopicGraph` type; add `scaleGrownEdges` and `CORE_TOPIC_IDS` to the `./feed` import.

```ts
// ── Cut 2a's feel levers (dev knob panel plan, 09-05-26) ─────────────────────────────────────
// Two knobs that exist to answer "how much of a page should land outside the reader's picks now
// that the graph has 99 nodes." Both default to 1 = today's behaviour; the tests below pin that
// identity first, because a lever that moves the feed at its default would silently retune
// production.
describe("scaleGrownEdges", () => {
  const core = new Set(["poetry", "machines"]);
  const graph: TopicGraph = {
    poetry: [
      { topic: "machines", sim: 0.4 }, // core×core — must never move
      { topic: "birds", sim: 0.3 }, // core→grown
      { topic: "clay", sim: -0.1 },
    ],
    machines: [
      { topic: "clay", sim: 0.5 },
      { topic: "poetry", sim: 0.4 },
      { topic: "birds", sim: -0.2 },
    ],
    birds: [
      { topic: "poetry", sim: 0.6 }, // grown→core
      { topic: "clay", sim: 0.2 }, // grown→grown
      { topic: "machines", sim: -0.3 },
    ],
    clay: [
      { topic: "machines", sim: 0.5 },
      { topic: "birds", sim: 0.2 },
      { topic: "poetry", sim: -0.1 },
    ],
  };

  it("scale 1 returns an equal graph (the identity the default relies on)", () => {
    expect(scaleGrownEdges(graph, core, 1)).toEqual(graph);
  });

  it("leaves core×core cells untouched and multiplies every other cell", () => {
    const out = scaleGrownEdges(graph, core, 0.5);
    const sim = (row: string, t: string) =>
      out[row]!.find((n) => n.topic === t)!.sim;
    expect(sim("poetry", "machines")).toBe(0.4); // tuned, kept
    expect(sim("poetry", "birds")).toBeCloseTo(0.15); // core→grown
    expect(sim("birds", "poetry")).toBeCloseTo(0.3); // grown→core
    expect(sim("birds", "clay")).toBeCloseTo(0.1); // grown→grown
    expect(sim("machines", "birds")).toBeCloseTo(-0.1); // negatives scale too
  });

  it("preserves every row's key set and length, and re-sorts descending", () => {
    // At scale 0 every grown-touching cell collapses to 0, so `poetry`'s row must re-order:
    // machines (0.4) first, then the two zeros. pickDrift reads a descending row and pickJump
    // slices its bottom half — an unsorted or shortened row breaks both silently.
    const out = scaleGrownEdges(graph, core, 0);
    for (const key of Object.keys(graph)) {
      expect(out[key]!.map((n) => n.topic).sort()).toEqual(
        graph[key]!.map((n) => n.topic).sort(),
      );
      const sims = out[key]!.map((n) => n.sim);
      expect(sims).toEqual([...sims].sort((a, b) => b - a));
    }
    expect(out.poetry![0]).toEqual({ topic: "machines", sim: 0.4 });
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(graph);
    scaleGrownEdges(graph, core, 2);
    expect(JSON.stringify(graph)).toBe(before);
  });
});

describe("pickDrift — grownHopPenalty", () => {
  // One start topic with two equally strong bridges: one core, one grown. With no penalty the
  // first hop splits ~50/50; with penalty 0 it can never land on the grown one.
  const core = new Set(["poetry", "machines"]);
  const graph: TopicGraph = {
    poetry: [
      { topic: "machines", sim: 0.5 },
      { topic: "birds", sim: 0.5 },
    ],
    machines: [],
    birds: [],
  };
  const weights = new Map([["poetry", 1]]);
  const sample = (penalty: number, seed: string) => {
    const rng = mulberry32(hashSeed(seed));
    const landed = { machines: 0, birds: 0 };
    for (let i = 0; i < 400; i++) {
      const pick = pickDrift(
        weights,
        graph,
        { temp: 0.15, hop2: 0, grownHopPenalty: penalty },
        rng,
        core,
      );
      if (pick?.topicId === "machines" || pick?.topicId === "birds")
        landed[pick.topicId]++;
    }
    return landed;
  };

  it("penalty 1 is a coin flip between an equal core and grown bridge", () => {
    const { machines, birds } = sample(1, "penalty:1");
    expect(birds / (machines + birds)).toBeGreaterThan(0.4);
    expect(birds / (machines + birds)).toBeLessThan(0.6);
  });

  it("penalty 0 never hops onto a grown topic", () => {
    const { machines, birds } = sample(0, "penalty:0");
    expect(birds).toBe(0);
    expect(machines).toBe(400);
  });

  it("penalty 0.25 lands on the grown bridge about a fifth of the time", () => {
    // Weights 1 : 0.25 → grown share 0.2. Eight seeds pooled, same as the tier-mix tests.
    let machines = 0;
    let birds = 0;
    for (let s = 0; s < 8; s++) {
      const r = sample(0.25, `penalty:0.25:${s}`);
      machines += r.machines;
      birds += r.birds;
    }
    expect(birds / (machines + birds)).toBeGreaterThan(0.15);
    expect(birds / (machines + birds)).toBeLessThan(0.25);
  });

  it("composePage threads coreTopicIds and the knob through to the hop", () => {
    const pools = new Map(
      ["poetry", "machines", "birds"].map((t) => [
        t,
        Array.from({ length: 10 }, (_, i) =>
          makePoolItem({ id: `${t}-${i}`, topicId: t, curationScore: 7 }),
        ),
      ]),
    );
    const cards = composePage({
      weights,
      graph,
      pools,
      rng: mulberry32(hashSeed("compose:penalty")),
      knobs: {
        ...DEFAULT_KNOBS,
        tierCore: 0,
        tierDrift: 1,
        tierJump: 0,
        hop2: 0,
        topicCap: 99,
        grownHopPenalty: 0,
      },
      coreTopicIds: core,
    });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.topicId !== "birds")).toBe(true);
  });
});

describe("CORE_TOPIC_IDS", () => {
  it("is the sixteen config topics, and DEFAULT_KNOBS' levers are identities", () => {
    expect(CORE_TOPIC_IDS.size).toBe(16);
    expect(CORE_TOPIC_IDS.has("poetry")).toBe(true);
    expect(DEFAULT_KNOBS.grownEdgeScale).toBe(1);
    expect(DEFAULT_KNOBS.grownHopPenalty).toBe(1);
  });
});
```

If the file's existing pool fixture builder is not named `makePoolItem`, use whatever builder
the `composePage` tests above it use for `PoolItem`s (look at the `tier mix` describe block) —
it needs `id`, `topicId`, `source`, `curationScore`, `aestheticTags`.

- [ ] **Step 2: Run them, watch them fail**

Run: `bunx vitest run src/server/services/feed.test.ts -t "scaleGrownEdges|grownHopPenalty|CORE_TOPIC_IDS"`
Expected: FAIL — `scaleGrownEdges is not a function` / `CORE_TOPIC_IDS` undefined, and a
TypeScript complaint that `grownHopPenalty` is not in `FeedKnobs`.

- [ ] **Step 3: Add the knobs and the core set** — in `src/server/services/feed.ts`, extend the
  interface and defaults (lines 38-65):

```ts
export interface FeedKnobs {
  tierCore: number;
  tierDrift: number;
  tierJump: number;
  scoreFloor: number;
  scorePower: number;
  tagBoost: number;
  temp: number;
  hop2: number;
  topicCap: number;
  pageSize: number;
  // ── Cut 2a's feel levers (09-05-26) ──────────────────────────────────────────────────────────
  // The vocabulary went 16 → 99 topics and a sampled page came back 59 grown / 37 core. These
  // two knobs exist so that ratio can be *tuned* rather than argued about. Both are identities
  // at 1, which is the shipped default until the dev knob panel says otherwise.
  /** Multiplier on every graph edge that touches a grown topic, applied to a per-request copy
   *  of the graph before DRIFT and JUMP walk it. <1 keeps drift closer to the sixteen tuned
   *  rows; >1 leans into the mined vocabulary. Core×core cells never move. */
  grownEdgeScale: number;
  /** Multiplier on a DRIFT hop's softmax weight when the landing topic is grown. 0 = drift
   *  stays inside the core sixteen; 1 = no penalty. JUMP is not affected. */
  grownHopPenalty: number;
}

export const DEFAULT_KNOBS: FeedKnobs = {
  tierCore: 40,
  tierDrift: 35,
  tierJump: 25,
  scoreFloor: 4,
  scorePower: 1.5,
  tagBoost: 0.5,
  temp: 0.15,
  hop2: 0.5,
  topicCap: 3,
  pageSize: 12,
  grownEdgeScale: 1,
  grownHopPenalty: 1,
};

/** The core sixteen, as a set — the levers above need "is this topic grown?" on the hot path and
 *  a DB read per hop is not the answer. `TOPICS` is the contract (config/topics.ts's header);
 *  config/topics.test.ts pins that it matches the `core` tier in the database. */
export const CORE_TOPIC_IDS: ReadonlySet<string> = new Set(TOPICS.map((t) => t.id));
```

`TOPICS` is already imported at line 15.

- [ ] **Step 4: `scaleGrownEdges`** — add directly below `TOPIC_GRAPH` (line 35):

```ts
/**
 * A copy of `graph` with every edge that touches a grown topic multiplied by `scale`. Core×core
 * cells — the embedding values Ben tuned in Phase 0.5 — are returned exactly as given. Rows keep
 * their key set and length (topics.test.ts's shape contract; pickJump slices the bottom half)
 * and are re-sorted descending (pickDrift reads the positive head in order).
 *
 * Cheap enough for a per-request call: 99 rows × 98 cells. `scale === 1` short-circuits to the
 * same object, so the default path allocates nothing.
 */
export function scaleGrownEdges(
  graph: TopicGraph,
  coreIds: ReadonlySet<string>,
  scale: number,
): TopicGraph {
  if (scale === 1) return graph;
  const out: TopicGraph = {};
  for (const [from, row] of Object.entries(graph)) {
    const fromCore = coreIds.has(from);
    out[from] = row
      .map((n) =>
        fromCore && coreIds.has(n.topic) ? n : { topic: n.topic, sim: n.sim * scale },
      )
      .sort((a, b) => b.sim - a.sim);
  }
  return out;
}
```

- [ ] **Step 5: The penalty in `hop()` and `pickDrift`** — replace `hop` (lines 224-238) and the
  signature of `pickDrift` (249-254) plus its two `hop(...)` calls:

```ts
/** One adjacency-row hop: softmax-sample among positive-similarity neighbours only, temperature
 * `temp` controlling how much the strongest bridge dominates. Shared by pickDrift's first and
 * (conditional) second hop. `grown` scales the weight of any neighbour outside `coreIds` — the
 * `grownHopPenalty` lever; at 1 this is the Phase 0.5 hop, byte for byte. */
function hop(
  graph: TopicGraph,
  from: string,
  temp: number,
  rng: () => number,
  grown: { coreIds: ReadonlySet<string>; penalty: number } = {
    coreIds: CORE_TOPIC_IDS,
    penalty: 1,
  },
): GraphNeighbor | null {
  // Only positive-sim neighbours count as bridges — a weak row must not let "drift" walk a
  // near-zero or negative edge and call it a connection. No bridge → the caller falls back to
  // staying on `from`, which is honest: some topics genuinely have no doorway yet.
  const row = (graph[from] ?? []).filter((n) => n.sim > 0);
  return weightedPick(
    row.map((n): [GraphNeighbor, number] => [
      n,
      Math.exp(n.sim / temp) *
        (grown.coreIds.has(n.topic) ? 1 : grown.penalty),
    ]),
    rng,
  );
}
```

```ts
export function pickDrift(
  weights: Map<string, number>,
  graph: TopicGraph,
  knobs: Pick<FeedKnobs, "temp" | "hop2" | "grownHopPenalty">,
  rng: () => number,
  coreIds: ReadonlySet<string> = CORE_TOPIC_IDS,
): TopicPick | null {
  const start = weightedPick([...weights.entries()], rng);
  if (!start) return null;

  const grown = { coreIds, penalty: knobs.grownHopPenalty };
  const first = hop(graph, start, knobs.temp, rng, grown);
```

and the second hop becomes `const second = hop(graph, first.topic, knobs.temp, rng, grown);`.
Everything else in `pickDrift` is unchanged.

Note: `weightedPick` returns `null` when the total weight is `<= 0`. With `penalty: 0` and a
row whose only positive bridges are grown, `hop` returns `null` and `pickDrift` takes its
existing "(no row)" fallback — stays on `start`. That is the intended meaning of "drift stays
inside the core sixteen."

- [ ] **Step 6: Thread `coreTopicIds` through `composePage`** — add to `ComposePageOpts`
  (after `debug?: boolean;`):

```ts
  /** Which topics count as core for the `grownHopPenalty` lever. Injected (like everything
   *  else here) so tests can use a toy graph; getFeedPage passes nothing and gets the sixteen. */
  coreTopicIds?: ReadonlySet<string>;
```

destructure it in `composePage` (`coreTopicIds = CORE_TOPIC_IDS,`) and change the DRIFT call to
`pickDrift(weights, graph, knobs, rng, coreTopicIds)`.

- [ ] **Step 7: Apply the scale in `getFeedPage`** — after the `knobs` merge (line ~543) and
  before `reachableTopics`:

```ts
  // The grownEdgeScale lever: a per-request copy of the graph, never a mutation of TOPIC_GRAPH.
  // Identity at 1 (the default) returns the shared object, so /feed pays nothing for this line.
  const graph = scaleGrownEdges(TOPIC_GRAPH, CORE_TOPIC_IDS, knobs.grownEdgeScale);
```

then use `graph` in both places that currently say `TOPIC_GRAPH`: `reachableTopics(weights, graph)`
and `composePage({ …, graph, … })`.

- [ ] **Step 8: Wire bounds** — `src/server/api/routers/feed.ts`, inside `feedKnobsSchema`:

```ts
    // Cut 2a's feel levers (09-05-26). 4× is already "the mined vocabulary dominates"; a penalty
    // above 1 would be a bonus, which is a different knob with a different name.
    grownEdgeScale: z.number().min(0).max(4),
    grownHopPenalty: z.number().min(0).max(1),
```

and in `routers.test.ts`, next to the existing out-of-range knob test (~line 383), add:

```ts
  it("rejects a grownHopPenalty above 1 and a grownEdgeScale above 4", async () => {
    const caller = createCaller(authedContext("user-42"));
    await expect(
      caller.feed.page({ knobs: { grownHopPenalty: 1.5 } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.feed.page({ knobs: { grownEdgeScale: 5 } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockedGetFeedPage).not.toHaveBeenCalled();
  });
```

- [ ] **Step 9: Pin config == DB core tier** — `src/server/config/topics.test.ts` is pure (it reads
  `TOPICS` and the JSON). Add, in its top-level describe:

```ts
  it("TOPICS is exactly the set the feed treats as core (CORE_TOPIC_IDS)", async () => {
    // The feel levers decide "is this topic grown?" from config, not the DB, because a hop must
    // not cost a query. This keeps that shortcut honest: if a topic is ever added to config it
    // becomes core here too, and the seed script must give it a `core` tier row.
    const { CORE_TOPIC_IDS } = await import("~/server/services/feed");
    expect([...CORE_TOPIC_IDS].sort()).toEqual(TOPICS.map((t) => t.id).sort());
  });
```

(The DB half — `topic.tier = 'core'` rows equal `TOPICS` — belongs in
`src/server/db/topics.integration.test.ts`; add a two-line assertion there if that file already
seeds the sixteen, otherwise skip it and say so in the commit body.)

- [ ] **Step 10: Run the tests and the gates**

Run: `bunx vitest run src/server/services/feed.test.ts src/server/api/routers/routers.test.ts src/server/config/topics.test.ts && bun run typecheck && bunx eslint src/server/services/feed.ts src/server/api/routers/feed.ts src/server/services/feed.test.ts src/server/api/routers/routers.test.ts src/server/config/topics.test.ts && bunx prettier --check src/server/services/feed.ts src/server/api/routers/feed.ts src/server/services/feed.test.ts src/server/api/routers/routers.test.ts src/server/config/topics.test.ts`
Expected: PASS, clean. Every pre-existing distribution test still passes — the levers are
identities at their defaults.
Run: `bun run test`
Expected: all green. A red Postgres-backed test on a busy machine is not your change (CLAUDE.md).
Run: `bun run probe:feed --knob grownHopPenalty=0 --knob grownEdgeScale=0.5`
Expected: a composed page prints with its tier counts (the CLI builds `Partial<FeedKnobs>` from
`--knob k=v`, so the new knobs work there for free). Under `FEED_DEBUG` off they are ignored,
as documented in that script's header.

- [ ] **Step 11: Commit**

```bash
git branch --show-current && git status
git add src/server/services/feed.ts src/server/api/routers/feed.ts src/server/services/feed.test.ts src/server/api/routers/routers.test.ts src/server/config/topics.test.ts
git commit -m "feat(feed): grownEdgeScale + grownHopPenalty — two levers for the 59/96 question, identities by default"
```

---

### Task 3: `feed.forgetSince` — the un-burn

The panel acks pages like production and then forgets them. This is the server half: a
dev-gated mutation that deletes the *caller's* `seen_item` rows with `served_at >= since` and
returns how many it removed. Nothing else in the app writes `seen_item` except `markSeen`
(`items.galleryRail` and `wanderNext` are documented as never writing it), so "rows since the
session mark" is exactly "pages this tuning session served."

**Files:**
- Modify: `src/server/db/feed.ts` (after `markSeen`, ~line 161)
- Modify: `src/server/api/routers/feed.ts` (after `markSeen`)
- Test: `src/server/db/feed.integration.test.ts`, `src/server/api/routers/routers.test.ts`

**Interfaces:**
- Produces: `forgetSeenSince(userId: string, since: Date): Promise<number>`;
  `feed.forgetSince({ since: Date }) → { forgotten: number }` — `FORBIDDEN` when
  `feedDebugEnabled()` is false, `UNAUTHORIZED` anonymous.

- [ ] **Step 1: Write the failing integration test** — append a new `describe.skipIf` block to
  `src/server/db/feed.integration.test.ts`, modelled on the existing one (same imports; it already
  imports `nanoid`, `db`, `schema` dynamically inside hooks):

```ts
describe.skipIf(!process.env.DATABASE_URL)(
  "forgetSeenSince (integration)",
  () => {
    const userA = `test-forget-a-${nanoid(8)}`;
    const userB = `test-forget-b-${nanoid(8)}`;
    const topicId = `test-forget-topic-${nanoid(8)}`;
    const prefix = `test-forget-${nanoid(8)}-`;
    const itemIds: string[] = [];
    const mark = new Date("2026-09-05T12:00:00Z");

    beforeAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, seenItem, topic, user } = await import("~/server/db/schema");
      await db.insert(topic).values({
        id: topicId,
        label: "Test forget topic",
        seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
      });
      await db.insert(user).values(
        [userA, userB].map((id) => ({
          id,
          name: id,
          email: `${id}@example.com`,
          emailVerified: false,
        })),
      );
      const rows = await db
        .insert(item)
        .values(
          [0, 1, 2].map((i) => ({
            source: "met",
            sourceId: `${prefix}${i}`,
            type: "image" as const,
            title: `Forget item ${i}`,
            sourceUrl: `https://example.com/${prefix}${i}`,
            imageUrl: `https://example.com/${prefix}${i}.jpg`,
            topicId,
            curationScore: 9,
            aestheticTags: [],
          })),
        )
        .returning({ id: item.id });
      itemIds.push(...rows.map((r) => r.id));
      // User A: one row before the mark, one at it, one after. User B: one after the mark.
      await db.insert(seenItem).values([
        { userId: userA, itemId: itemIds[0]!, servedAt: new Date(mark.getTime() - 60_000) },
        { userId: userA, itemId: itemIds[1]!, servedAt: mark },
        { userId: userA, itemId: itemIds[2]!, servedAt: new Date(mark.getTime() + 60_000) },
        { userId: userB, itemId: itemIds[2]!, servedAt: new Date(mark.getTime() + 60_000) },
      ]);
    });

    afterAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, seenItem, topic, user } = await import("~/server/db/schema");
      const { inArray } = await import("drizzle-orm");
      await db.delete(seenItem).where(inArray(seenItem.userId, [userA, userB]));
      await db.delete(item).where(inArray(item.id, itemIds));
      await db.delete(user).where(inArray(user.id, [userA, userB]));
      await db.delete(topic).where(inArray(topic.id, [topicId]));
    });

    it("deletes only this user's rows served at or after `since`, and reports the count", async () => {
      const { db } = await import("~/server/db/client");
      const { seenItem } = await import("~/server/db/schema");
      const { eq } = await import("drizzle-orm");

      const forgotten = await forgetSeenSince(userA, mark);
      expect(forgotten).toBe(2);

      const aLeft = await db.select().from(seenItem).where(eq(seenItem.userId, userA));
      expect(aLeft.map((r) => r.itemId)).toEqual([itemIds[0]]);
      const bLeft = await db.select().from(seenItem).where(eq(seenItem.userId, userB));
      expect(bLeft).toHaveLength(1);
    });
  },
);
```

Add `forgetSeenSince` to the `./feed` import at the top of the file.

- [ ] **Step 2: Run it, watch it fail**

Run: `bunx vitest run src/server/db/feed.integration.test.ts`
Expected: FAIL — `forgetSeenSince` is not exported.

- [ ] **Step 3: Implement** — append to `src/server/db/feed.ts` (it already imports `seenItem`
  and the drizzle operators it needs; add `gte` to the `drizzle-orm` import if absent):

```ts
/**
 * The dev knob panel's un-burn (plan 09-05-26). Deletes this user's `seen_item` rows with
 * `served_at >= since` and returns how many went. Exposed only through `feed.forgetSince`, which
 * is gated on `feedDebugEnabled()` — in production nothing can reach this.
 *
 * Why it exists rather than "just don't ack while tuning": the cursor's anchor moves to each
 * page's `servedAt`, and the pool query excludes `served_at < anchor`. Within a session, the
 * previous page's ack is what keeps its items out of the next page. Tuning therefore acks like
 * production and forgets afterwards — the readouts stay honest and the corpus stays whole.
 */
export async function forgetSeenSince(
  userId: string,
  since: Date,
): Promise<number> {
  const { db } = await import("./client");
  const deleted = await db
    .delete(seenItem)
    .where(and(eq(seenItem.userId, userId), gte(seenItem.servedAt, since)))
    .returning({ itemId: seenItem.itemId });
  return deleted.length;
}
```

- [ ] **Step 4: Run it, watch it pass**

Run: `bunx vitest run src/server/db/feed.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Router tests first** — in `src/server/api/routers/routers.test.ts`:

In the `protected procedures reject a null session` describe, add:

```ts
  it("feed.forgetSince throws UNAUTHORIZED", async () => {
    await expect(
      caller.feed.forgetSince({ since: new Date() }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
```

Then a new describe. The router test file mocks `~/server/services/feed` with the
`importOriginal` spread; add `feedDebugEnabled` the same way for `~/server/services/feed-debug`,
and mock `~/server/db/feed`'s `forgetSeenSince`:

```ts
describe("feed.forgetSince is dev-only", () => {
  beforeEach(() => {
    vi.mocked(mockedFeedDebugEnabled).mockReset();
    vi.mocked(mockedForgetSeenSince).mockReset().mockResolvedValue(3);
  });

  it("throws FORBIDDEN when the dev gate is off — production can never reach the delete", async () => {
    vi.mocked(mockedFeedDebugEnabled).mockResolvedValue(false);
    const caller = createCaller(authedContext("user-42"));
    await expect(
      caller.feed.forgetSince({ since: new Date() }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockedForgetSeenSince).not.toHaveBeenCalled();
  });

  it("forwards the caller's id and the instant, and returns the count", async () => {
    vi.mocked(mockedFeedDebugEnabled).mockResolvedValue(true);
    const since = new Date("2026-09-05T12:00:00Z");
    const caller = createCaller(authedContext("user-42"));
    await expect(caller.feed.forgetSince({ since })).resolves.toEqual({
      forgotten: 3,
    });
    expect(mockedForgetSeenSince).toHaveBeenCalledWith("user-42", since);
  });
});
```

Set up the two mocks at the top of the file next to the existing `getFeedPage` mock (follow its
exact `vi.mock(path, async (importOriginal) => ({ ...actual, fn: vi.fn(actual.fn) }))` shape,
then `const { feedDebugEnabled: mockedFeedDebugEnabled } = await import("~/server/services/feed-debug")`
and likewise for `forgetSeenSince` from `~/server/db/feed`).

- [ ] **Step 6: Run them, watch them fail**

Run: `bunx vitest run src/server/api/routers/routers.test.ts -t "forgetSince"`
Expected: FAIL — `caller.feed.forgetSince is not a function`.

- [ ] **Step 7: The procedure** — in `src/server/api/routers/feed.ts`, after `markSeen`:

```ts
  // The dev knob panel's un-burn. `FORBIDDEN`, not a silent no-op, when the gate is off: a
  // client that thinks it is tuning must find out it is not. Input is a Date (SuperJSON carries
  // it intact); the client sends its session mark, the instant it last applied knobs.
  forgetSince: protectedProcedure
    .input(z.object({ since: z.date() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await feedDebugEnabled())) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "feed.forgetSince is a dev affordance (FEED_DEBUG is off)",
        });
      }
      const forgotten = await forgetSeenSince(ctx.user.id, input.since);
      return { forgotten } as const;
    }),
```

Imports: `feedDebugEnabled` from `~/server/services/feed-debug`, `forgetSeenSince` from
`~/server/db/feed` (add it to the existing `markSeen` import line).

- [ ] **Step 8: Run the tests and the gates**

Run: `bunx vitest run src/server/api/routers/routers.test.ts src/server/db/feed.integration.test.ts && bun run typecheck && bunx eslint src/server/db/feed.ts src/server/api/routers/feed.ts src/server/api/routers/routers.test.ts src/server/db/feed.integration.test.ts && bunx prettier --check src/server/db/feed.ts src/server/api/routers/feed.ts src/server/api/routers/routers.test.ts src/server/db/feed.integration.test.ts`
Expected: PASS, clean.
Run: `bun run test`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git branch --show-current && git status
git add src/server/db/feed.ts src/server/api/routers/feed.ts src/server/api/routers/routers.test.ts src/server/db/feed.integration.test.ts
git commit -m "feat(feed): feed.forgetSince — tuning acks like production and un-burns afterwards, dev-gated"
```

---

### Task 4: `Slider` and `pageStats` — the two pure pieces

Both are leaf modules with no tRPC, so they get real tests before the panel exists. `Slider`
is the kit's first range control; `pageStats` is `scripts/probe-feed.ts`'s `tierCounts` /
`topicCounts` arithmetic moved somewhere the client can import it, with the core/grown split
added.

**Files:**
- Create: `src/components/ui/slider.tsx`, `src/components/feed/dev/feed-stats.ts`
- Test: `src/components/feed/dev/feed-stats.test.ts`, `src/components/ui/slider.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // slider.tsx
  export interface SliderProps {
    label: string;
    value: number;           // committed value
    min: number; max: number; step: number;
    onCommit: (v: number) => void;   // pointer-up / key-up / blur, only if changed
    format?: (v: number) => string;  // default: step < 1 ? v.toFixed(2) : String(v)
    note?: string;                   // muted line under the track
  }
  export function Slider(props: SliderProps): JSX.Element;

  // feed-stats.ts
  export interface PageStats {
    cards: number;
    tiers: Record<Tier, number>;
    core: number; grown: number;
    topics: Map<string, number>;   // topicId → count
    sources: Map<string, number>;  // source → count
  }
  export function pageStats(cards: FeedCard[], coreIds: ReadonlySet<string>): PageStats;
  export function sumStats(pages: PageStats[]): PageStats;
  ```

- [ ] **Step 1: Failing stats test** — `src/components/feed/dev/feed-stats.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { FeedCard } from "~/server/services/feed";
import { pageStats, sumStats } from "./feed-stats";

// The readout is only as useful as it is honest, and "honest" here is arithmetic: counts must
// match what a person would get tallying the badges by hand.
function card(tier: FeedCard["tier"], topicId: string | null, source: string): FeedCard {
  return {
    tier,
    topicId,
    item: { id: `${tier}-${topicId}-${source}-${Math.random()}`, source } as FeedCard["item"],
  };
}

const core = new Set(["poetry", "machines"]);

describe("pageStats", () => {
  it("counts tiers, core vs grown, topics and sources", () => {
    const s = pageStats(
      [
        card("CORE", "poetry", "met"),
        card("DRIFT", "birds", "thisiscolossal"),
        card("DRIFT", "machines", "met"),
        card("JUMP", "clay", "pdr"),
        card("CORE", null, "loc"), // an un-homed card: neither core nor grown
      ],
      core,
    );
    expect(s.cards).toBe(5);
    expect(s.tiers).toEqual({ CORE: 2, DRIFT: 2, JUMP: 1 });
    expect(s.core).toBe(2);
    expect(s.grown).toBe(2);
    expect([...s.topics.entries()]).toEqual([
      ["poetry", 1],
      ["birds", 1],
      ["machines", 1],
      ["clay", 1],
    ]);
    expect(s.sources.get("met")).toBe(2);
  });

  it("sumStats adds pages and keeps insertion order of first appearance", () => {
    const a = pageStats([card("CORE", "poetry", "met")], core);
    const b = pageStats([card("JUMP", "clay", "pdr"), card("CORE", "poetry", "met")], core);
    const t = sumStats([a, b]);
    expect(t.cards).toBe(3);
    expect(t.tiers).toEqual({ CORE: 2, DRIFT: 0, JUMP: 1 });
    expect(t.core).toBe(2);
    expect(t.grown).toBe(1);
    expect([...t.topics.keys()]).toEqual(["poetry", "clay"]);
  });

  it("an empty page is all zeros, not NaN", () => {
    const s = pageStats([], core);
    expect(s).toMatchObject({ cards: 0, core: 0, grown: 0 });
    expect(sumStats([]).tiers).toEqual({ CORE: 0, DRIFT: 0, JUMP: 0 });
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `bunx vitest run src/components/feed/dev/feed-stats.test.ts`
Expected: FAIL — cannot resolve `./feed-stats`.

- [ ] **Step 3: Implement `feed-stats.ts`**

```ts
import type { FeedCard, Tier } from "~/server/services/feed";

// The dev knob panel's readout arithmetic (plan 09-05-26). Pure, so it is testable and so the
// panel component stays a rendering concern. This is scripts/probe-feed.ts's `tierCounts` /
// `topicCounts` brought client-side, plus the split the whole exercise is about: how many cards
// landed on one of the sixteen the reader picked from, and how many on a grown topic.
//
// Maps rather than objects for topics/sources so insertion order is the order of first
// appearance — the readout lists "what this page was made of" in the order it was made.
export interface PageStats {
  cards: number;
  tiers: Record<Tier, number>;
  core: number;
  grown: number;
  topics: Map<string, number>;
  sources: Map<string, number>;
}

const emptyTiers = (): Record<Tier, number> => ({ CORE: 0, DRIFT: 0, JUMP: 0 });

export function pageStats(
  cards: FeedCard[],
  coreIds: ReadonlySet<string>,
): PageStats {
  const s: PageStats = {
    cards: cards.length,
    tiers: emptyTiers(),
    core: 0,
    grown: 0,
    topics: new Map(),
    sources: new Map(),
  };
  for (const c of cards) {
    s.tiers[c.tier]++;
    // `topicId` is the card's *display* topic (Cut 1); null means the item is stored but
    // un-homed, which the feed cannot draw today — so a null here is a bug worth seeing, and
    // it is counted in neither bucket rather than hidden in one.
    if (c.topicId !== null) {
      if (coreIds.has(c.topicId)) s.core++;
      else s.grown++;
      s.topics.set(c.topicId, (s.topics.get(c.topicId) ?? 0) + 1);
    }
    s.sources.set(c.item.source, (s.sources.get(c.item.source) ?? 0) + 1);
  }
  return s;
}

export function sumStats(pages: PageStats[]): PageStats {
  const t: PageStats = {
    cards: 0,
    tiers: emptyTiers(),
    core: 0,
    grown: 0,
    topics: new Map(),
    sources: new Map(),
  };
  for (const p of pages) {
    t.cards += p.cards;
    for (const k of Object.keys(t.tiers) as Tier[]) t.tiers[k] += p.tiers[k];
    t.core += p.core;
    t.grown += p.grown;
    for (const [k, n] of p.topics) t.topics.set(k, (t.topics.get(k) ?? 0) + n);
    for (const [k, n] of p.sources) t.sources.set(k, (t.sources.get(k) ?? 0) + n);
  }
  return t;
}
```

Run: `bunx vitest run src/components/feed/dev/feed-stats.test.ts`
Expected: PASS.

- [ ] **Step 4: Failing slider test** — `src/components/ui/slider.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Slider } from "./slider";

describe("Slider", () => {
  it("shows the live value while dragging and commits once on release", () => {
    const onCommit = vi.fn();
    render(
      <Slider label="Drift temperature" value={0.15} min={0.03} max={0.6} step={0.01} onCommit={onCommit} />,
    );
    const input = screen.getByRole("slider", { name: "Drift temperature" });
    fireEvent.change(input, { target: { value: "0.3" } });
    expect(screen.getByText("0.30")).toBeInTheDocument(); // live, two decimals for a sub-1 step
    expect(onCommit).not.toHaveBeenCalled(); // dragging is not applying
    fireEvent.pointerUp(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(0.3);
  });

  it("does not commit when released at the value it started on", () => {
    const onCommit = vi.fn();
    render(<Slider label="Page size" value={12} min={6} max={24} step={1} onCommit={onCommit} />);
    fireEvent.pointerUp(screen.getByRole("slider", { name: "Page size" }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText("12")).toBeInTheDocument(); // integer step, no decimals
  });

  it("commits on keyboard release too", () => {
    const onCommit = vi.fn();
    render(<Slider label="Topic cap" value={3} min={1} max={8} step={1} onCommit={onCommit} />);
    const input = screen.getByRole("slider", { name: "Topic cap" });
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.keyUp(input, { key: "ArrowRight" });
    expect(onCommit).toHaveBeenCalledWith(4);
  });
});
```

Run: `bunx vitest run src/components/ui/slider.test.tsx`
Expected: FAIL — cannot resolve `./slider`.

- [ ] **Step 5: Implement `slider.tsx`**

```tsx
"use client";

import * as React from "react";

// The kit's first range control, built for the dev knob panel (plan 09-05-26) and deliberately
// plain: a native <input type="range"> with `accent-color`, exactly what the Phase 0.5 bench
// used (phase0/feed.template.html:99-112). Native gets keyboard, focus rings and touch for free.
//
// **Commit on release, not on input.** Every commit costs the feed a request (and a page of
// corpus until it is forgotten), so a drag paints the number live and fires `onCommit` once,
// on pointer-up / key-up / blur, and only if the value actually moved. The panel therefore
// makes one request per gesture — the bench's "live, no apply button" feel without the spam.
export interface SliderProps {
  label: string;
  /** The committed value. The control keeps its own draft while a drag is in progress. */
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
  /** How to paint the number. Default: two decimals for sub-integer steps, integer otherwise. */
  format?: (v: number) => string;
  /** One muted line under the track saying what the knob does. */
  note?: string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onCommit,
  format,
  note,
}: SliderProps) {
  const id = React.useId();
  const [draft, setDraft] = React.useState(value);
  // A parent-side change (reset to defaults, a loaded preset) must win over a stale draft.
  React.useEffect(() => setDraft(value), [value]);

  const paint = format ?? ((v: number) => (step < 1 ? v.toFixed(2) : String(v)));
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-ink/62 text-[13px]">
          {label}
        </label>
        <b className="text-ink text-[13px] tabular-nums">{paint(draft)}</b>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="w-full"
        style={{ accentColor: "var(--color-accent)" }}
      />
      {note ? <p className="text-ink/40 text-[11px] leading-snug">{note}</p> : null}
    </div>
  );
}
```

Run: `bunx vitest run src/components/ui/slider.test.tsx`
Expected: PASS.

- [ ] **Step 6: Gates and commit**

Run: `bun run typecheck && bunx eslint src/components/ui/slider.tsx src/components/ui/slider.test.tsx src/components/feed/dev/feed-stats.ts src/components/feed/dev/feed-stats.test.ts && bunx prettier --check src/components/ui/slider.tsx src/components/ui/slider.test.tsx src/components/feed/dev/feed-stats.ts src/components/feed/dev/feed-stats.test.ts`
Expected: clean.

```bash
git branch --show-current && git status
git add src/components/ui/slider.tsx src/components/ui/slider.test.tsx src/components/feed/dev/feed-stats.ts src/components/feed/dev/feed-stats.test.ts
git commit -m "feat(ui): Slider (commit-on-release) and pageStats — the panel's two pure pieces"
```

---

### Task 5: The panel, the hook, and `FeedScreen`'s `dev` prop

This is the task the plan exists for. Three files: the knob state hook (specs, localStorage,
JSON), the drawer, and the wiring inside `FeedScreen`. The `/feed` path must be provably
untouched — the first test written here is that one.

**Files:**
- Create: `src/components/feed/dev/use-dev-knobs.ts`, `src/components/feed/dev/knob-panel.tsx`
- Modify: `src/components/feed/feed-screen.tsx`
- Test: `src/components/feed/feed-screen.test.tsx`

**Interfaces:**
- Consumes: `Slider`, `pageStats`/`sumStats` (Task 4); `feedKnobsSchema`'s bounds (Task 2);
  `api.feed.forgetSince` (Task 3); `FeedKnobs`, `DEFAULT_KNOBS` from `~/server/services/feed`
  (type + constant import from a server module is already the pattern — `feed-screen.tsx`
  imports `FeedCard` from it).
- Produces:
  ```ts
  // use-dev-knobs.ts
  export interface KnobSpec { key: keyof FeedKnobs; label: string; section: string; min: number; max: number; step: number; note?: string }
  export const KNOB_SPECS: readonly KnobSpec[];
  export const DEV_KNOBS_STORAGE_KEY = "ambit.devKnobs.v1";
  export function nonDefault(knobs: FeedKnobs): Partial<FeedKnobs>;
  export function useDevKnobs(): { knobs: FeedKnobs; set: (k: keyof FeedKnobs, v: number) => void; reset: () => void; toJson: () => string };

  // knob-panel.tsx
  export interface KnobPanelProps {
    knobs: FeedKnobs; onSet: (k: keyof FeedKnobs, v: number) => void; onReset: () => void; onCopy: () => void;
    onRestart: () => void;
    pageStats: PageStats[]; topicLabels: Record<string, string>; lastPage: FeedCard[];
    served: number; forgotten: number; forgetError: string | null;
  }
  export function KnobPanel(props: KnobPanelProps): JSX.Element;   // renders data-testid="knob-panel"

  // feed-screen.tsx
  export interface FeedDevProps { coreTopicIds: string[] }
  export interface FeedScreenProps { topicLabels: Record<string, string>; dev?: FeedDevProps }
  ```

- [ ] **Step 1: Failing screen tests** — in `src/components/feed/feed-screen.test.tsx`:

First change the tRPC mock so the query input is observable and the new mutation exists. In the
`vi.hoisted` block add `queryInputs: [] as unknown[]` and `forgetMock: vi.fn()`; in the
`vi.mock("~/trpc/react")` factory change

```ts
      page: { useInfiniteQuery: () => feedState.current },
```
to
```ts
      page: {
        useInfiniteQuery: (input: unknown) => {
          queryInputs.push(input);
          return feedState.current;
        },
      },
      forgetSince: {
        useMutation: () => ({ mutateAsync: forgetMock, isPending: false }),
      },
```

and in `beforeEach` add `queryInputs.length = 0; forgetMock.mockReset().mockResolvedValue({ forgotten: 0 });`.
Also mock `~/server/services/feed`'s `DEFAULT_KNOBS`? **No** — it is a plain object export
with no env dependency; import it for real. Then append:

```tsx
describe("FeedScreen without `dev` — the /feed contract", () => {
  it("queries with the literal input {} so the RSC prefetch key matches", () => {
    render(<FeedScreen topicLabels={LABELS} />);
    expect(queryInputs[0]).toEqual({});
    // Not `{ knobs: undefined }` — React Query hashes that differently from `{}`.
    expect(Object.keys(queryInputs[0] as object)).toEqual([]);
  });

  it("renders no knob panel", () => {
    render(<FeedScreen topicLabels={LABELS} />);
    expect(screen.queryByTestId("knob-panel")).not.toBeInTheDocument();
  });
});

describe("FeedScreen with `dev`", () => {
  const dev = { coreTopicIds: ["t1", "t2"] };

  beforeEach(() => {
    localStorage.clear();
  });

  it("mounts the panel and sends the default knobs in the query input", () => {
    render(<FeedScreen topicLabels={LABELS} dev={dev} />);
    expect(screen.getByTestId("knob-panel")).toBeInTheDocument();
    const input = queryInputs[0] as { knobs: Record<string, number>; nonce: number };
    expect(input.knobs.tierCore).toBe(40);
    expect(input.knobs.grownEdgeScale).toBe(1);
    expect(input.nonce).toBe(0);
  });

  it("still acks pages (tuning must exercise the real seen filter)", () => {
    render(<FeedScreen topicLabels={LABELS} dev={dev} />);
    expect(ackSeenMock).toHaveBeenCalledWith({
      itemIds: PAGE_ONE.cards.map((c) => c.item.id),
    });
  });

  it("committing a slider forgets the session, then queries again with the new knob and a new nonce", async () => {
    render(<FeedScreen topicLabels={LABELS} dev={dev} />);
    const before = queryInputs.at(-1) as { nonce: number };
    const slider = screen.getByRole("slider", { name: /CORE/ });
    fireEvent.change(slider, { target: { value: "70" } });
    await act(async () => {
      fireEvent.pointerUp(slider);
    });
    expect(forgetMock).toHaveBeenCalledTimes(1);
    expect(forgetMock.mock.calls[0]![0]).toHaveProperty("since");
    const after = queryInputs.at(-1) as { knobs: Record<string, number>; nonce: number };
    expect(after.knobs.tierCore).toBe(70);
    expect(after.nonce).not.toBe(before.nonce);
  });

  it("shows per-page tier counts and the core/grown split for the loaded pages", () => {
    // PAGE_ONE's fixture cards carry tiers and topicIds; the readout must agree with them.
    render(<FeedScreen topicLabels={LABELS} dev={dev} />);
    const panel = screen.getByTestId("knob-panel");
    const coreCount = PAGE_ONE.cards.filter((c) => c.tier === "CORE").length;
    expect(panel).toHaveTextContent(new RegExp(`CORE\\s*${coreCount}`));
  });

  it("persists knobs to localStorage under the versioned key", async () => {
    render(<FeedScreen topicLabels={LABELS} dev={dev} />);
    const slider = screen.getByRole("slider", { name: /Page size/ });
    fireEvent.change(slider, { target: { value: "8" } });
    await act(async () => {
      fireEvent.pointerUp(slider);
    });
    expect(JSON.parse(localStorage.getItem("ambit.devKnobs.v1") ?? "{}")).toMatchObject({
      pageSize: 8,
    });
  });
});
```

Check `PAGE_ONE` in the existing fixtures: its cards must have non-null `topicId`s in
`LABELS` for the split to be meaningful; if they don't, extend the `card()` builder call sites in
`PAGE_ONE` to pass `topicId: "t1"` etc. — the builder already accepts overrides.

- [ ] **Step 2: Run them, watch them fail**

Run: `bunx vitest run src/components/feed/feed-screen.test.tsx`
Expected: the two "without dev" tests PASS already (the input is `{}` today); every "with dev"
test FAILS — `dev` is not a prop, no panel, no `forgetSince`.

- [ ] **Step 3: The hook** — `src/components/feed/dev/use-dev-knobs.ts`:

```ts
"use client";

import * as React from "react";

import { DEFAULT_KNOBS, type FeedKnobs } from "~/server/services/feed";

// The dev knob panel's state (plan 09-05-26). Three responsibilities and nothing visual:
// the slider specs (one row per knob — labels, ranges and the one-line note the Phase 0.5 bench
// carried under each track), persistence in localStorage so a reload keeps a setting, and
// `toJson()` — the copy-as-JSON payload that is how a setting travels from a tuning session to a
// DEFAULT_KNOBS edit.
//
// Ranges sit INSIDE routers/feed.ts's `feedKnobsSchema` bounds on purpose: a slider must never
// be able to produce a value the server 400s.
export interface KnobSpec {
  key: keyof FeedKnobs;
  label: string;
  section: "Tier mix" | "Taste" | "Drift shape" | "Diversity" | "Grown topics";
  min: number;
  max: number;
  step: number;
  note?: string;
}

export const KNOB_SPECS: readonly KnobSpec[] = [
  { key: "tierCore", label: "CORE — your topics", section: "Tier mix", min: 0, max: 100, step: 1 },
  { key: "tierDrift", label: "DRIFT — adjacent topics", section: "Tier mix", min: 0, max: 100, step: 1 },
  { key: "tierJump", label: "JUMP — far topics", section: "Tier mix", min: 0, max: 100, step: 1 },
  { key: "scoreFloor", label: "Curation score floor", section: "Taste", min: 1, max: 9, step: 1, note: "Items below this score never appear." },
  { key: "scorePower", label: "Score weighting power", section: "Taste", min: 0, max: 3, step: 0.1, note: "0 = uniform within a topic; higher = the curator's favourites dominate." },
  { key: "tagBoost", label: "Aesthetic-tag boost", section: "Taste", min: 0, max: 2, step: 0.1, note: "Multiplier per keyword an item shares with your profile." },
  { key: "temp", label: "Drift temperature", section: "Drift shape", min: 0.03, max: 0.6, step: 0.01, note: "Low = drift hugs the strongest bridge; high = wanders the whole row." },
  { key: "hop2", label: "Second-hop chance", section: "Drift shape", min: 0, max: 0.8, step: 0.01, note: "Poetry → Typography → Machines instead of stopping at Typography." },
  { key: "grownEdgeScale", label: "Grown-edge scale", section: "Grown topics", min: 0, max: 4, step: 0.05, note: "Multiplies every graph edge that touches a grown topic. Moves DRIFT and JUMP; leaves the tuned core×core rows alone." },
  { key: "grownHopPenalty", label: "Grown-hop penalty", section: "Grown topics", min: 0, max: 1, step: 0.05, note: "Weight of a DRIFT hop landing on a grown topic. 0 = drift stays inside the sixteen." },
  { key: "topicCap", label: "Per-page topic cap", section: "Diversity", min: 1, max: 8, step: 1 },
  { key: "pageSize", label: "Page size", section: "Diversity", min: 6, max: 24, step: 1 },
];

export const DEV_KNOBS_STORAGE_KEY = "ambit.devKnobs.v1";

/** Only the knobs that differ from DEFAULT_KNOBS — what a human wants to read, and what a
 *  DEFAULT_KNOBS edit needs. */
export function nonDefault(knobs: FeedKnobs): Partial<FeedKnobs> {
  const out: Partial<FeedKnobs> = {};
  for (const k of Object.keys(DEFAULT_KNOBS) as (keyof FeedKnobs)[]) {
    if (knobs[k] !== DEFAULT_KNOBS[k]) out[k] = knobs[k];
  }
  return out;
}

function load(): FeedKnobs {
  try {
    const raw = localStorage.getItem(DEV_KNOBS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_KNOBS };
    const parsed = JSON.parse(raw) as Partial<Record<keyof FeedKnobs, unknown>>;
    const out = { ...DEFAULT_KNOBS };
    // Only known keys, only finite numbers — a stale or hand-edited entry must not poison the
    // query input (the server would 400 and the feed would show its error branch).
    for (const k of Object.keys(DEFAULT_KNOBS) as (keyof FeedKnobs)[]) {
      const v = parsed[k];
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return { ...DEFAULT_KNOBS };
  }
}

export function useDevKnobs() {
  // Lazy initialiser so SSR (which has no localStorage) and the first client render agree on
  // DEFAULT_KNOBS; the stored values are applied in an effect, which is one extra render and
  // one extra fetch on a reload with a saved setting — acceptable for a dev tool, and the
  // fetch is forgotten like any other.
  const [knobs, setKnobs] = React.useState<FeedKnobs>({ ...DEFAULT_KNOBS });
  React.useEffect(() => {
    setKnobs(load());
  }, []);

  const persist = (next: FeedKnobs) => {
    try {
      localStorage.setItem(DEV_KNOBS_STORAGE_KEY, JSON.stringify(nonDefault(next)));
    } catch {
      /* private mode etc. — the setting simply won't survive a reload */
    }
  };

  const set = React.useCallback((k: keyof FeedKnobs, v: number) => {
    setKnobs((prev) => {
      const next = { ...prev, [k]: v };
      persist(next);
      return next;
    });
  }, []);

  const reset = React.useCallback(() => {
    setKnobs({ ...DEFAULT_KNOBS });
    try {
      localStorage.removeItem(DEV_KNOBS_STORAGE_KEY);
    } catch {
      /* same */
    }
  }, []);

  const toJson = React.useCallback(
    () => JSON.stringify(nonDefault(knobs), null, 2),
    [knobs],
  );

  return { knobs, set, reset, toJson };
}
```

- [ ] **Step 4: The panel** — `src/components/feed/dev/knob-panel.tsx`:

```tsx
"use client";

import * as React from "react";

import { Button } from "~/components/ui/button";
import { Slider } from "~/components/ui/slider";
import type { FeedCard, FeedKnobs } from "~/server/services/feed";
import { KNOB_SPECS } from "./use-dev-knobs";
import { sumStats, type PageStats } from "./feed-stats";

// The drawer (plan 09-05-26, Decision D8): a fixed right column of sliders and readouts. It is
// the Phase 0.5 bench's `<aside id="knobs">` rebuilt in the app's own tokens, plus the readouts
// the bench never had — per-page and per-session tier counts, the core/grown split, and the
// drift paths of the last page with their sims, which is the "why" the feel question needs.
//
// Purely presentational: every number comes in as a prop and every action goes out as a
// callback. FeedScreen owns the query, the forget cycle and the stats.
export interface KnobPanelProps {
  knobs: FeedKnobs;
  onSet: (k: keyof FeedKnobs, v: number) => void;
  onReset: () => void;
  onCopy: () => void;
  onRestart: () => void;
  pageStats: PageStats[];
  topicLabels: Record<string, string>;
  lastPage: FeedCard[];
  served: number;
  forgotten: number;
  forgetError: string | null;
}

const SECTIONS = ["Tier mix", "Taste", "Drift shape", "Grown topics", "Diversity"] as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-accent text-[11px] font-semibold tracking-[0.6px] uppercase">
      {children}
    </h3>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink/62 text-[12px]">{label}</span>
      <span className="text-ink text-[12px] tabular-nums">{value}</span>
    </div>
  );
}

function StatsBlock({
  title,
  stats,
  topicLabels,
}: {
  title: string;
  stats: PageStats;
  topicLabels: Record<string, string>;
}) {
  const pct = (n: number) => (stats.cards ? Math.round((100 * n) / stats.cards) : 0);
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>{title}</SectionLabel>
      <Stat label="cards" value={stats.cards} />
      <Stat
        label="tiers"
        value={`CORE ${stats.tiers.CORE} · DRIFT ${stats.tiers.DRIFT} · JUMP ${stats.tiers.JUMP}`}
      />
      <Stat
        label="core / grown"
        value={`${stats.core} (${pct(stats.core)}%) / ${stats.grown} (${pct(stats.grown)}%)`}
      />
      <Stat
        label="topics"
        value={top(stats.topics, 6)
          .map(([id, n]) => `${topicLabels[id] ?? id} ${n}`)
          .join(" · ")}
      />
      <Stat
        label="sources"
        value={top(stats.sources, 5)
          .map(([s, n]) => `${s} ${n}`)
          .join(" · ")}
      />
    </div>
  );
}

export function KnobPanel({
  knobs,
  onSet,
  onReset,
  onCopy,
  onRestart,
  pageStats,
  topicLabels,
  lastPage,
  served,
  forgotten,
  forgetError,
}: KnobPanelProps) {
  const [open, setOpen] = React.useState(true);
  const tierTotal = knobs.tierCore + knobs.tierDrift + knobs.tierJump;
  const share = (n: number) => (tierTotal ? Math.round((100 * n) / tierTotal) : 0);
  const session = sumStats(pageStats);
  const last = pageStats.at(-1);
  const name = (id: string) => topicLabels[id] ?? id;

  return (
    <aside
      data-testid="knob-panel"
      className={[
        "bg-surface border-ink/12 fixed top-0 right-0 z-30 flex h-dvh w-[340px] flex-col border-l",
        "shadow-sheet transition-transform duration-200",
        open ? "translate-x-0" : "translate-x-[calc(100%-36px)]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-ink/62 hover:text-ink absolute top-3 left-0 -translate-x-full rounded-l-md bg-inherit px-2 py-1 text-[11px]"
        aria-label={open ? "Collapse knob panel" : "Expand knob panel"}
      >
        {open ? "›" : "‹ tune"}
      </button>

      <div className="flex flex-col gap-5 overflow-y-auto px-4 pt-4 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-ink-hi text-[15px] font-semibold">Composition knobs</h2>
          <span className="text-ink/40 text-[11px]">dev · FEED_DEBUG</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" shape="pill" onClick={onRestart}>
            Restart feed
          </Button>
          <Button size="sm" variant="ghost" shape="pill" onClick={onReset}>
            Reset knobs
          </Button>
          <Button size="sm" variant="accent" shape="pill" onClick={onCopy}>
            Copy JSON
          </Button>
        </div>

        <div className="flex flex-col gap-1">
          <Stat label="served this session" value={served} />
          <Stat label="forgotten so far" value={forgotten} />
          {forgetError ? (
            <p className="text-error text-[12px]">{forgetError}</p>
          ) : (
            <p className="text-ink/40 text-[11px]">
              Every apply forgets the pages this session served. Nothing tuned here stays in
              seen_item.
            </p>
          )}
        </div>

        {SECTIONS.map((section) => (
          <div key={section} className="flex flex-col gap-3">
            <SectionLabel>
              {section}
              {section === "Tier mix"
                ? ` · ${share(knobs.tierCore)} / ${share(knobs.tierDrift)} / ${share(knobs.tierJump)}`
                : null}
            </SectionLabel>
            {KNOB_SPECS.filter((s) => s.section === section).map((s) => (
              <Slider
                key={s.key}
                label={s.label}
                value={knobs[s.key]}
                min={s.min}
                max={s.max}
                step={s.step}
                note={s.note}
                onCommit={(v) => onSet(s.key, v)}
              />
            ))}
          </div>
        ))}

        {last ? <StatsBlock title="Last page" stats={last} topicLabels={topicLabels} /> : null}
        <StatsBlock title="Session" stats={session} topicLabels={topicLabels} />

        {lastPage.length > 0 ? (
          <div className="flex flex-col gap-1">
            <SectionLabel>Last page — why</SectionLabel>
            <ol className="flex flex-col gap-[2px]">
              {lastPage.map((c) => (
                <li key={c.item.id} className="text-ink/62 text-[11px] leading-snug">
                  <span className="text-ink tabular-nums">{c.tier}</span>{" "}
                  {c.driftPath ? c.driftPath.map(name).join(" → ") : name(c.topicId ?? "∅")}
                  {c.debug ? (
                    <span className="text-ink/40"> · {c.debug.curationScore}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
```

`Button`'s props are `variant?: "accent" | "ghost"`, `size?: "sm" | "md" | "lg"`,
`shape?: "pill" | "rounded"` (checked in `src/components/ui/button.tsx:27`). `text-accent`,
`bg-surface`, `text-ink-hi`, `text-error`, `shadow-sheet` are existing tokens
(`src/styles/globals.css`).

- [ ] **Step 5: Wire `FeedScreen`** — `src/components/feed/feed-screen.tsx`. Five edits.

(a) Props:

```ts
export interface FeedDevProps {
  /** The core-tier topic ids, from the DB via the /dev/feed shell — the readout's
   *  core-vs-grown test. */
  coreTopicIds: string[];
}

export interface FeedScreenProps {
  /** topic id → chip label, passed from the RSC shell so the Because tiles can name their walk. */
  topicLabels: Record<string, string>;
  /** Present only on /dev/feed (plan 09-05-26). Mounts the knob panel, sends knobs in the query
   *  input and runs the forget cycle. **Absent on /feed, and must stay absent** — see the
   *  query-key note below. */
  dev?: FeedDevProps;
}

export function FeedScreen({ topicLabels, dev }: FeedScreenProps) {
```

(b) Knob state + query input, replacing the `useInfiniteQuery` call. Keep the existing
hydration-key comment above it and add the dev paragraph:

```ts
  // ── dev knobs (plan 09-05-26) ─────────────────────────────────────────────────────────────────
  // Hooks are unconditional (rules of hooks); what `dev` gates is the *input* below. Without
  // `dev` the input is the literal `{}` and none of this state is ever read.
  const devKnobs = useDevKnobs();
  // A number that changes on every apply/restart, so React Query treats the result as a new
  // feed (new key → page 0 with a fresh server seed) rather than a page appended to the old one.
  const [nonce, setNonce] = React.useState(0);
  // The session mark: `feed.forgetSince` deletes everything served at or after it. Moves
  // forward on every apply, so each cycle forgets exactly the pages the previous knobs served.
  const sessionMark = React.useRef(new Date());
  const [forgotten, setForgotten] = React.useState(0);
  const [forgetError, setForgetError] = React.useState<string | null>(null);
  const { mutateAsync: forgetSince } = api.feed.forgetSince.useMutation();

  // **Without `dev` this MUST be `{}`** — byte-identical to /feed/page.tsx's prefetch input (see
  // the long comment there). With `dev`, `knobs` is the full FeedKnobs object (so every slider
  // is authoritative) and `nonce` is a key-only field the server ignores... except it can't:
  // tRPC input is zod-validated and unknown keys are stripped by z.object by default, so the
  // server never sees `nonce`. It exists purely to vary the query key.
  const feedInput = dev ? { knobs: devKnobs.knobs, nonce } : {};

  const feed = api.feed.page.useInfiniteQuery(feedInput, {
```

(the options object is unchanged.) Confirm the strip: `feedKnobsSchema` is a `z.object(...)`
and the outer input is `z.object({ cursor, knobs })` — Zod strips unknown keys by default, so
`nonce` never reaches `getFeedPage`. If `routers.test.ts` has a test asserting unknown keys
*reject*, it would fail here; there is none today.

(c) The apply cycle, after the ack effect:

```ts
  // The forget-then-refetch cycle. Forget first, so the pages the *old* knobs served are gone
  // before the new feed's page 0 is composed — otherwise they'd be excluded from it by the seen
  // filter, and the next apply would un-exclude them: a feed that changes under you for reasons
  // unrelated to the slider you moved.
  const applyDev = React.useCallback(async () => {
    if (!dev) return;
    try {
      const { forgotten: n } = await forgetSince({ since: sessionMark.current });
      setForgotten((f) => f + n);
      setForgetError(null);
    } catch (err) {
      // Loud, not silent: a failed forget means rows are accumulating. The panel shows it and
      // the feed still refetches, so tuning can continue while the cause is looked at.
      setForgetError(err instanceof Error ? err.message : "forgetSince failed");
    }
    sessionMark.current = new Date();
    ackedPages.current.clear();
    setNonce((n) => n + 1); // a counter, not Date.now(): two applies in one ms must still differ
    window.scrollTo({ top: 0 });
  }, [dev, forgetSince]);

  const onDevSet = React.useCallback(
    (k: keyof FeedKnobs, v: number) => {
      devKnobs.set(k, v);
      void applyDev();
    },
    [devKnobs, applyDev],
  );
  const onDevReset = React.useCallback(() => {
    devKnobs.reset();
    void applyDev();
  }, [devKnobs, applyDev]);
  const onDevCopy = React.useCallback(() => {
    void navigator.clipboard?.writeText(devKnobs.toJson()).then(
      () => setToast("Knobs copied as JSON"),
      () => setToast(devKnobs.toJson()), // no clipboard (http origin): show it instead
    );
  }, [devKnobs]);

  // Leaving the dev route forgets the last cycle too. Best effort — a closed tab never runs
  // this, which is why the panel also shows "served this session" as a reminder.
  React.useEffect(() => {
    if (!dev) return;
    return () => {
      void forgetSince({ since: sessionMark.current }).catch(() => {});
    };
  }, [dev, forgetSince]);

  const coreIds = React.useMemo(
    () => new Set(dev?.coreTopicIds ?? []),
    [dev],
  );
  const devPageStats = React.useMemo(
    () => (dev ? pages.map((p) => pageStats(p.cards, coreIds)) : []),
    [dev, pages, coreIds],
  );
```

Note `setToast` already exists (line ~67) — the declaration order in the component must put
`useState` for `toast` *above* `onDevCopy`; move the dev block below the existing state
declarations if needed. `devKnobs.set(k, v)` followed by `applyDev()` reads the *old* knobs in
`applyDev`? No — `applyDev` never reads knobs; it only forgets, bumps the nonce and the next
render's `feedInput` carries the new knob value. That ordering is what the "committing a slider…"
test pins.

(d) Right padding for the drawer at `lg:` (Decision D8): on the `<main>` element,
`className={["bg-bg text-ink min-h-dvh", dev ? "lg:pr-[340px]" : ""].join(" ")}`.

(e) Mount the panel, just before `<PillToolbar`:

```tsx
      {dev ? (
        <KnobPanel
          knobs={devKnobs.knobs}
          onSet={onDevSet}
          onReset={onDevReset}
          onCopy={onDevCopy}
          onRestart={() => void applyDev()}
          pageStats={devPageStats}
          topicLabels={topicLabels}
          lastPage={pages.at(-1)?.cards ?? []}
          served={cardCount}
          forgotten={forgotten}
          forgetError={forgetError}
        />
      ) : null}
```

Imports to add: `KnobPanel` from `./dev/knob-panel`, `useDevKnobs` from `./dev/use-dev-knobs`,
`pageStats` from `./dev/feed-stats`, and `type FeedKnobs` alongside the existing `FeedCard`
import from `~/server/services/feed`.

- [ ] **Step 6: Run the screen tests, watch them pass**

Run: `bunx vitest run src/components/feed/feed-screen.test.tsx`
Expected: PASS — all pre-existing tests plus the eight new ones. If "still acks pages" fails
because the fixture pages have no cards, that is a fixture problem, not a wiring one.

- [ ] **Step 7: Gates**

Run: `bun run typecheck && bunx eslint src/components/feed/feed-screen.tsx src/components/feed/dev/knob-panel.tsx src/components/feed/dev/use-dev-knobs.ts src/components/feed/feed-screen.test.tsx && bunx prettier --check src/components/feed/feed-screen.tsx src/components/feed/dev/knob-panel.tsx src/components/feed/dev/use-dev-knobs.ts src/components/feed/feed-screen.test.tsx`
Expected: clean. (`prettier --write` the two long `KNOB_SPECS` rows if it objects to line
length; the content is what matters.)
Run: `bun run test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git branch --show-current && git status
git add src/components/feed/feed-screen.tsx src/components/feed/dev/knob-panel.tsx src/components/feed/dev/use-dev-knobs.ts src/components/feed/feed-screen.test.tsx
git commit -m "feat(feed): the knob panel — sliders for every lever, honest readouts, forget-on-apply; /feed's {} untouched"
```

---

### Task 6: `/dev/feed`, and the e2e that drives it

The shell. Mirrors `src/app/feed/page.tsx`'s two guards, adds the dev gate, loads all topics
once (labels for the Because tiles and the readout; the core set for the split), and renders
`FeedScreen` with `dev`. **No `prefetchInfinite`** — the client's input carries knobs and a
nonce, so there is nothing to hydrate against, and a prefetched `{}` page would be a burned one.

**Files:**
- Create: `src/app/dev/feed/page.tsx`, `e2e/dev-feed.spec.ts`

**Interfaces:**
- Consumes: `feedDebugEnabled()` (Task 1), `listAllTopics()`, `FeedScreen` `dev` prop (Task 5).

- [ ] **Step 1: The page**

```tsx
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { FeedScreen } from "~/components/feed/feed-screen";
import { auth } from "~/lib/auth";
import { hasCompletedOnboarding, listAllTopics } from "~/server/db/topics";
import { feedDebugEnabled } from "~/server/services/feed-debug";

// The feed tuning bench (plan 09-05-26): the real FeedScreen with the knob panel mounted.
//
// Three guards, in this order:
//   1. The dev gate — the SAME expression that decides whether `feed.page` honours knobs
//      (services/feed-debug.ts). A route that showed sliders the server ignores would be worse
//      than no route; tying both to one function makes that state unrepresentable. Under a
//      production build with FEED_DEBUG unset this is a 404, which is also why
//      src/proxy.ts's AUTHED_PREFIXES does not need to know about /dev/*.
//   2. Session, 3. onboarding — verbatim from /feed/page.tsx, same reasons.
//
// **No `api.feed.page.prefetchInfinite` here, on purpose.** /feed prefetches with `{}` so the
// client's identical `{}` query hydrates from it. This screen's input carries knobs and a nonce
// and never matches a prefetch; one would only compose (and, once acked, burn) a page nobody
// renders. The first page here is a plain client fetch, and it is forgotten like every other.
export default async function DevFeedPage() {
  if (!(await feedDebugEnabled())) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (!(await hasCompletedOnboarding(session.user.id))) redirect("/onboarding");

  // All 99 topics, once: labels so Because tiles and the readout can name grown topics (on
  // /feed only the sixteen are passed — out of scope to change there), and the core-tier ids
  // for the readout's core/grown split. The DB's `tier` column is the authoritative answer;
  // the engine's own CORE_TOPIC_IDS is config, and topics.test.ts pins that they agree.
  const topics = await listAllTopics();
  const topicLabels = Object.fromEntries(topics.map((t) => [t.id, t.label]));
  const coreTopicIds = topics.filter((t) => t.tier === "core").map((t) => t.id);

  return <FeedScreen topicLabels={topicLabels} dev={{ coreTopicIds }} />;
}
```

- [ ] **Step 2: Try it by hand**

Run: `lsof -ti:3000` (clear anything squatting — CLAUDE.md) then `bun run dev`, sign in, open
`http://localhost:3000/dev/feed`.
Expected: the feed with a right-hand drawer; tier badges on tiles (the existing `DebugBadge`);
moving CORE to 90 reloads the feed to the top and the "Last page" readout shows mostly CORE;
"served this session" climbs as you scroll; the Network tab shows one `feed.page` request per
slider release, preceded by one `feed.forgetSince`. Then in psql or drizzle studio:
`select count(*) from seen_item where user_id = '<you>' and served_at > now() - interval '10 minutes'`
after clicking **Restart feed** should be ≤ one page's worth (the page just served).
Set `FEED_DEBUG=false` in `.env`, restart, reload `/dev/feed` → 404. Remove it again.

- [ ] **Step 3: The e2e spec** — `e2e/dev-feed.spec.ts`. It reuses `e2e/feed.spec.ts`'s
  approach: one sign-up, session replay. Read `e2e/support.ts` for the helper signatures
  (`connect`, `inviteUser`, `openAuthSheet`, `saveSession`, `restoreSession`, `cleanupSeeded`,
  `PIXEL`).

```ts
import { expect, test, type Page } from "@playwright/test";

import {
  cleanupSeeded,
  connect,
  inviteUser,
  openAuthSheet,
  PIXEL,
  restoreSession,
  saveSession,
  type Connection,
} from "./support";

// The knob panel (plan 09-05-26). This spec runs against `next dev` (bun run e2e), where the dev
// gate is on by default. Under the production build (bun run e2e:prod, CI) FEED_DEBUG is unset,
// /dev/feed is a 404 by design, and the spec skips itself — the gate *is* the assertion there.
const EMAIL = `ambit-devfeed-${Date.now()}@example.com`;
const PASSWORD = "correct-horse-battery-staple";
const SEED_COUNT = 60;

test.describe.serial("dev knob panel", () => {
  let conn: Connection;
  let session: Awaited<ReturnType<typeof saveSession>>;

  test.beforeAll(async () => {
    conn = await connect();
    await conn.seedItems(
      Array.from({ length: SEED_COUNT }, (_, i) => ({
        source: "e2e",
        sourceId: `e2e-devfeed-${i}`,
        type: "image" as const,
        title: `Dev feed item ${i}`,
        sourceUrl: `https://example.com/devfeed/${i}`,
        imageUrl: PIXEL,
        topicId: ["astronomy", "botany", "music"][i % 3]!,
        curationScore: 9,
        aestheticTags: [],
      })),
    );
    await inviteUser(EMAIL);
  });

  test.afterAll(async () => {
    await cleanupSeeded(conn, "e2e-devfeed-");
  });

  test("signs up and picks topics", async ({ page }) => {
    await page.goto("/");
    await openAuthSheet(page);
    await page.getByText("First time? Create your account").click();
    await page.getByLabel("Name").fill("Dev Feed");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/onboarding");
    for (const t of ["Astronomy", "Botany", "Music"]) await page.getByText(t, { exact: true }).click();
    await page.getByRole("button", { name: "Start exploring" }).click();
    await page.waitForURL("**/feed");
    session = await saveSession(page);
  });

  async function onDevFeed(page: Page): Promise<boolean> {
    await restoreSession(page, session);
    const res = await page.goto("/dev/feed");
    return res?.status() !== 404;
  }

  test("shows the panel with the readout, and a slider commit refetches with knobs", async ({ page }) => {
    test.skip(!(await onDevFeed(page)), "dev gate is off (production build) — 404 is the correct answer");

    const panel = page.getByTestId("knob-panel");
    await expect(panel).toBeVisible();
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    await expect(panel).toContainText(/CORE \d+ · DRIFT \d+ · JUMP \d+/);

    const feedRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("feed.page")) feedRequests.push(r.url());
    });
    const forget = page.waitForRequest((r) => r.url().includes("feed.forgetSince"));

    const slider = panel.getByRole("slider", { name: /CORE/ });
    await slider.focus();
    await slider.press("End"); // max → 100
    await forget;
    await expect.poll(() => feedRequests.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(decodeURIComponent(feedRequests.at(-1)!)).toContain('"tierCore":100');
    await expect(panel).toContainText(/served this session/);
  });

  test("the seen rows served while tuning are gone after a restart", async ({ page }) => {
    test.skip(!(await onDevFeed(page)), "dev gate is off");
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    await page.getByTestId("knob-panel").getByRole("button", { name: "Restart feed" }).click();
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    // After a restart, only the page just served can be in seen_item for this user.
    const rows = await conn.countSeenFor(EMAIL);
    expect(rows).toBeLessThanOrEqual(24);
  });
});
```

If `Connection` lacks `seedItems` / `countSeenFor`, look at how `feed.spec.ts` bulk-inserts
(it uses the connection's `sql` tag directly) and do the same inline; add
`countSeenFor(email)` to `support.ts` as a one-query helper (`select count(*) from seen_item
join "user" on … where email = $1`) so the last test can assert against the DB — that is the
honest check of Decision D2. The `tierCore":100` check reads tRPC's GET query string, which
carries the SuperJSON input URL-encoded; if the app uses batched POSTs instead, read
`r.postData()` — either way `feed.page`'s request body/query contains the knobs.

- [ ] **Step 4: Run it**

Run: `bun run e2e -- e2e/dev-feed.spec.ts`
Expected: 3 passed (dev server). Then `bun run e2e:prod -- e2e/dev-feed.spec.ts`
Expected: 1 passed, 2 skipped with the gate message.

- [ ] **Step 5: Gates and commit**

Run: `bun run typecheck && bunx eslint src/app/dev/feed/page.tsx e2e/dev-feed.spec.ts && bunx prettier --check src/app/dev/feed/page.tsx e2e/dev-feed.spec.ts`

```bash
git branch --show-current && git status
git add src/app/dev/feed/page.tsx e2e/dev-feed.spec.ts e2e/support.ts
git commit -m "feat(dev): /dev/feed — the tuning bench, gated on the same expression as the knobs"
```

---

### Task 7: `graph:rebuild` — core set from config, and `--grown-scale`

Tuning `grownEdgeScale` ends in a number. Baking it means re-running the rebuild with that
scale applied to every rescaled cell — and the rebuild is currently unsafe to re-run at all
(§0: it treats all 99 current keys as tuned). Fix both in one go so the script's contract is
"core×core from the embedding artifact, everything else co-occurrence × scale."

**Files:**
- Modify: `scripts/rebuild-topic-graph.ts:28-40` (core detection), `:83-93` (scale), argv
- Test: `scripts/rebuild-topic-graph.test.ts` (exists — the pure helpers are in
  `src/server/services/topic-graph-build.ts` and tested there; if the script file has no test
  of its own, add the scale assertion to `topic-graph-build.test.ts` against `rescaleTo` instead)

**Interfaces:**
- `bun run graph:rebuild [--confirm] [--grown-scale <number>]` (default `1`).
- Produces (in `topic-graph-build.ts`): `applyGrownScale(sims: Map<string, number>, scale: number): Map<string, number>` — trivial, exported for the test.

- [ ] **Step 1: Failing test** — in `src/server/services/topic-graph-build.test.ts`:

```ts
describe("applyGrownScale", () => {
  it("multiplies every value; 1 is the identity", () => {
    const m = new Map([["a", 0.2], ["b", -0.1]]);
    expect([...applyGrownScale(m, 0.5)]).toEqual([["a", 0.1], ["b", -0.05]]);
    expect(applyGrownScale(m, 1)).toBe(m);
  });
});
```

Run: `bunx vitest run src/server/services/topic-graph-build.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 2: Implement** — append to `topic-graph-build.ts`:

```ts
/** The baked form of the feed's `grownEdgeScale` lever: once a scale has been tuned in the dev
 *  panel, the rebuild applies it to every co-occurrence-derived cell so the artifact ships it
 *  and the knob can go back to 1. Identity at 1 returns the same Map. */
export function applyGrownScale(
  sims: Map<string, number>,
  scale: number,
): Map<string, number> {
  if (scale === 1) return sims;
  return new Map([...sims].map(([k, v]) => [k, +(v * scale).toFixed(4)]));
}
```

- [ ] **Step 3: Fix the script** — in `scripts/rebuild-topic-graph.ts`:

Replace lines 32-33 (`const embedded = …; const original = new Set(Object.keys(embedded));`) with:

```ts
// **Core = the config, not the JSON's keys.** The first version of this script read "tuned rows"
// off the artifact's own key set, which meant the sixteen exactly once — after its first run the
// artifact had 99 keys, and a re-run would have frozen every grown value as if Ben had tuned it.
// TOPICS is the contract (config/topics.ts's header; CORE_TOPIC_IDS in services/feed.ts is the
// same set), so the embedding values are taken from the artifact only for pairs inside it.
const embedded = graphData.graph as Record<string, Neighbor[]>;
const original = new Set(TOPICS.map((t) => t.id));
```

(import `TOPICS` from `~/server/config/topics`.) Parse the flag next to `--confirm`:

```ts
const scaleArg = process.argv.indexOf("--grown-scale");
const grownScale = scaleArg === -1 ? 1 : Number(process.argv[scaleArg + 1]);
if (!Number.isFinite(grownScale) || grownScale < 0) {
  console.error("--grown-scale needs a non-negative number");
  process.exit(2);
}
```

and where each row is rescaled (`:83-93`, `rescaleTo(row, target)` collapsed to a Map), wrap the
Map: `const scaled = applyGrownScale(toMap(rescaleTo(row, target)), grownScale);` — keep whatever
local name the script already uses for that Map. Print the scale in the dry-run summary line.
Also update the `recipe` string it writes to include `grownScale: <n>`.

- [ ] **Step 4: Prove the fix is a no-op at scale 1**

Run: `bun run graph:rebuild`
Expected: the dry run reports **zero changed core×core cells** and — because the co-occurrence
recomputation is deterministic over the same corpus — zero or near-zero changes elsewhere. If
the grown rows differ (the corpus grew since 09-03), that is expected and the summary says how
many; what must be zero is the core block. Do **not** `--confirm` in this task; the artifact
only changes when a tuned scale is chosen.

- [ ] **Step 5: Gates and commit**

Run: `bunx vitest run src/server/services/topic-graph-build.test.ts && bun run typecheck && bunx eslint scripts/rebuild-topic-graph.ts src/server/services/topic-graph-build.ts src/server/services/topic-graph-build.test.ts && bunx prettier --check scripts/rebuild-topic-graph.ts src/server/services/topic-graph-build.ts src/server/services/topic-graph-build.test.ts`

```bash
git branch --show-current && git status
git add scripts/rebuild-topic-graph.ts src/server/services/topic-graph-build.ts src/server/services/topic-graph-build.test.ts
git commit -m "fix(scripts): graph:rebuild reads core from config, gains --grown-scale — a tuned lever can be baked"
```

---

### Task 8: Docs

- [ ] **Step 1: `SPEC.md`** — §7, under `feed.page`'s knob contract: add the two knobs with
  their bounds and one line each; add `feed.forgetSince({ since }) → { forgotten }` as
  "dev-only: `FORBIDDEN` unless the dev gate is on; deletes the caller's `seen_item` rows served
  at or after `since`". §9: after "Dev affordances stay in", one paragraph: the affordance is now
  `/dev/feed` (gated on `feedDebugEnabled()`, the single gate), the panel's control set, the
  readouts, and the forget-on-apply cycle with the anchor reason in one sentence. Add
  `grownEdgeScale`/`grownHopPenalty` to the knob list at §9's defaults table with default `1`.
- [ ] **Step 2: `docs/BUILD_PLAN.md`** — 9.7: note "the bench for this shipped 09-xx-26 as
  `/dev/feed` (plan `docs/PLAN_dev-knob-panel.md`); what remains of 9.7 is the *tuning*."
- [ ] **Step 3: `CLAUDE.md`** — in the Repository status paragraph, one sentence after the
  09-05 redeploy: "**The dev knob panel shipped 09-xx-26** — `/dev/feed` (local, `FEED_DEBUG`),
  every feed knob live including the two Cut 2a levers `grownEdgeScale`/`grownHopPenalty`,
  per-page and session readouts, and `feed.forgetSince` so tuning leaves no `seen_item` rows;
  plan `docs/PLAN_dev-knob-panel.md`. The 59/96 question is now answerable; the answer, when
  Ben has it, goes into `DEFAULT_KNOBS` (and `bun run graph:rebuild --grown-scale <s> --confirm`
  if the graph lever is the one that moved)." Also add to the Local dev environment list: "The
  `/dev/feed` panel forgets its pages on every apply; if you tune with the panel *collapsed* and
  navigate away by closing the tab, the last cycle's rows stay — `feed.forgetSince` from the
  panel's Restart button clears them."
- [ ] **Step 4: `log.md`** — a dated entry: **Shipped** (the four moves, the numbers from the
  hand test in Task 6 Step 2 — how many pages you scrolled, forgotten count matching), **Findings**
  (the anchor-arithmetic reason skip-ack was wrong; the rebuild script's self-referential core
  detection; anything the e2e taught about tRPC's request shape), **Decisions** (D1–D9 in a
  sentence each), **Open / next** (Ben tunes; desktop polish session; 8.1 T8/T9). End with the
  spend line from `python3 ~/.claude/scripts/session-spend.py --session <uuid>` — **never
  estimate it**; omit the line if the script exits non-zero.
- [ ] **Step 5: Merge**

```bash
git branch --show-current && git status
git add SPEC.md docs/BUILD_PLAN.md CLAUDE.md log.md
git commit -m "docs(feed): the dev knob panel — contract, gate, and the forget-on-apply reason"
git checkout main && git merge --no-ff feat/dev-knob-panel -m "Merge branch 'feat/dev-knob-panel' — the feed tuning bench: live levers, honest readouts, zero corpus burn"
bun run test
```

Do not push; Ben pushes and decides when production sees it (nothing here changes production
behaviour — every lever defaults to 1 and the route 404s there — but the redeploy is his call).

---

## Verification (the done bar)

- `bun run check` is green on `main` after the merge.
- `bunx vitest run src/components/feed/feed-screen.test.tsx -t "literal input"` passes: `/feed`
  queries with `{}` and renders no panel.
- With `bun run dev` running: `/dev/feed` renders the drawer; a slider release produces exactly
  one `feed.forgetSince` then one `feed.page` request; the readout's tier counts match the tile
  badges by hand for one page; after **Restart feed**, `seen_item` rows for the dev user served in
  the last ten minutes are ≤ one page.
- `FEED_DEBUG=false bun run dev` → `/dev/feed` is a 404 and `feed.forgetSince` is `FORBIDDEN`
  (curl it or use the router test).
- `bun run e2e -- e2e/dev-feed.spec.ts` → 3 passed. `bun run e2e:prod -- e2e/dev-feed.spec.ts`
  → 1 passed, 2 skipped. **Known gap:** CI's production build never exercises the panel; the
  local dev-server run is the coverage.
- `bun run probe:feed --knob grownHopPenalty=0` composes a page with no DRIFT card on a grown
  topic (check `why` strings).
- `bun run graph:rebuild` (dry) reports zero changed core×core cells.
- `git log --oneline main..feat/dev-knob-panel` before the merge shows eight commits.

## Self-review (done by the planner, 09-05-26)

**Spec coverage.** SPEC §9's "debug overlay (why each card: tier, drift path with sims, curator
score)" → the panel's "Last page — why" list (Task 5) shows tier, path (labelled) and score; the
sims themselves are in `card.debug.why` (hover on the existing badge) and could be added to the
list in one line if Ben wants them. "Tuning knobs (tier mix, score floor, temperature, hop
chance, caps)" → all present, plus the two levers. Ben's four decisions → D1–D9 each trace to
one. The 59/96 question → the core/grown readout is the measurement.

**One requirement the discussion did not list, found while planning.** The rebuild script's
core detection (§0) — without Task 7, "bake the tuned scale" would have quietly frozen the
grown rows. Found by reading the script, not by any test.

**Placeholders.** None. Two places hedge on a fixture name (`makePoolItem`, `Connection`'s
seed helper) with an explicit instruction to read the neighbouring test and match it.

**Type consistency.** `FeedKnobs.grownEdgeScale` / `grownHopPenalty` (Tasks 2, 5, 8);
`CORE_TOPIC_IDS: ReadonlySet<string>` (Tasks 2, 6, 7 prose); `scaleGrownEdges(graph, coreIds, scale)`
(Task 2); `feedDebugEnabled(): Promise<boolean>` (Tasks 1, 3, 6); `forgetSeenSince(userId, since): Promise<number>`
and `feed.forgetSince({ since: Date }) → { forgotten }` (Tasks 3, 5, 6); `pageStats(cards, coreIds): PageStats`
and `sumStats(pages)` (Tasks 4, 5); `Slider` `onCommit` (Tasks 4, 5); `FeedDevProps { coreTopicIds: string[] }`
(Tasks 5, 6); `DEV_KNOBS_STORAGE_KEY = "ambit.devKnobs.v1"` (Task 5 test + hook);
`data-testid="knob-panel"` (Tasks 5, 6).

**The riskiest step is** Task 5 Step 5(b): the moment `feedInput` is computed. If a future edit
makes the without-`dev` branch produce `{ knobs: undefined }` or `{ nonce }`, `/feed` burns a
page per load and nothing errors. The first test in Task 5 is the tripwire; keep it.
