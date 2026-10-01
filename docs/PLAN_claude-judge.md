# The Claude Judge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the curator score writing and pictures through `claude -p` on Ben's Max subscription (Haiku 4.5), selectable beside the existing OpenRouter judge, and prove it against Ben's marks before anything trusts it.

**Architecture:** `callCurator` in `curator.ts` keeps its retry loop and parsers and gains a second transport, chosen by the model's name: `claude-*` spawns the Claude Code CLI with every piece of overhead stripped, anything else goes to OpenRouter as today. One env setting, `CURATOR_JUDGE`, picks the default model; the cache key already includes the model, so the two judges never read each other's answers. The subscription's own usage report, carried on every call, is the pacing signal and the clean stop.

**Tech Stack:** Bun scripts, TypeScript, Vitest, `node:child_process`, `sharp` (already a dependency), Claude Code CLI ≥ 2.1.286.

**Spec:** `docs/DESIGN_claude-judge-ingest.md` (decisions D1–D9), with `docs/HANDOFF_claude-judge-ingest.md` for background. Read both before Task 1.

## Global Constraints

- **Branch `feat/claude-judge` off `main`.** Another session may hold `~/Dev/ambit`; if `git status` shows a branch that is not yours, work in a worktree (`git worktree add ../ambit-judge -b feat/claude-judge main`). Never switch branches under another session. Leave Ben's uncommitted `src/server/config/topic-groups.ts` alone.
- **Do not edit `CURATOR_PROMPT`, `WRITING_PROMPT`, `PROMPT_VERSION` or `WRITING_PROMPT_VERSION`.** Production's cache depends on them byte for byte.
- **With `CURATOR_JUDGE` unset, behaviour is unchanged**: same model, same cache keys, same OpenRouter call. Two existing tests pin cache keys; they must pass untouched.
- **Never put `CURATOR_JUDGE` in `.env`.** Pass it on the command line (`CURATOR_JUDGE=claude bun run …`), so the unit suite and every other script keep the default judge.
- **No live `claude` or HTTP calls in unit tests.** The CLI is reached through `claudeRuntime.run`, which tests replace.
- **Never send an image URL to the model.** Bytes only.
- **The child process must not see `ANTHROPIC_API_KEY`**, or the CLI bills an API key instead of the subscription.
- **The agent does not write to production.** Everything in this plan runs against the local database. (Production's host is decided — VM 202, design D11 — and is the next plan's subject; nothing here depends on it.)
- Comment the way the surrounding files do: explain why, at length where a decision is not obvious (the repo is a teaching tool for Ben).
- After `bun add`/`bun remove` (none is expected), `rm -rf node_modules/.vite node_modules/.cache/vite`.
- Commit messages end with the attribution lines your session's instructions give.

## Review Focus

1. **A picture over 5 MB, or a TIFF.** Expect it downscaled to a JPEG, or, if undecodable, judged from text and counted as an image failure. Never a crashed batch. (Task 3)
2. **Haiku wraps or prefaces its JSON.** Expect the object extracted from a fence or from surrounding prose. (Task 1)
3. **The subscription limit arrives mid-run.** Expect a `CuratorAbortError` naming the window and its reset time, the in-flight answers cached, and no further spawns. (Task 2)
4. **`claude` is not installed or not logged in.** Expect the script to refuse at start with one line, before any walk. (Task 4)
5. **`ANTHROPIC_API_KEY` is exported in the shell.** Expect the child never to receive it. (Task 2)

---

### Task 1: The pure half of the Claude transport

**Files:**
- Create: `src/server/services/curator-errors.ts`
- Create: `src/server/services/claude-judge.ts`
- Create: `src/server/services/claude-judge.test.ts`
- Modify: `src/server/services/curator.ts:79-95` (the `CuratorAbortError` class moves out)

**Interfaces:**
- Produces: `CuratorAbortError` (from `curator-errors.ts`, re-exported by `curator.ts`); `CLAUDE_JUDGE_MODEL`, `isClaudeModel(model)`, `claudeModelSpec(model): { id: string; thinking: boolean }`, `stripFence(reply): string`, `claudeArgs(modelId, system): string[]`, `claudeStdin(content: JudgeContent): string`, `parseClaudeStream(stdout): ClaudeOutcome`, `limitVerdict(info, ceiling): string | null`, types `JudgeContent`, `RateLimitInfo`, `ClaudeOutcome`.

- [ ] **Step 1: Move `CuratorAbortError` to a leaf module**

`claude-judge.ts` must throw it and `curator.ts` will import `claude-judge.ts`, so the class cannot stay in `curator.ts`. Create `src/server/services/curator-errors.ts` holding the class exactly as it is in `curator.ts` lines 79–95, doc comment included. In `curator.ts` replace the class with:

```ts
// Lives in a leaf module so claude-judge.ts can throw it without importing this file back.
export { CuratorAbortError } from "./curator-errors";
import { CuratorAbortError } from "./curator-errors";
```

Run `bun run typecheck`. Expected: clean (every existing import of `CuratorAbortError` from `./curator` still resolves).

- [ ] **Step 2: Write the failing tests**

`src/server/services/claude-judge.test.ts`:

```ts
// The Claude judge's pure half (docs/DESIGN_claude-judge-ingest.md). No process is spawned here.
import { describe, expect, it } from "vitest";

import {
  CLAUDE_JUDGE_MODEL,
  claudeArgs,
  claudeModelSpec,
  claudeStdin,
  isClaudeModel,
  limitVerdict,
  parseClaudeStream,
  stripFence,
} from "./claude-judge";

/** The three lines a successful call prints, as captured 10-01-26 (trimmed to the fields read). */
export function stream(reply: string, utilization = { five: 0.23, seven: 0.22 }) {
  return [
    { type: "system", subtype: "init", model: CLAUDE_JUDGE_MODEL, tools: [] },
    {
      type: "rate_limit_event",
      rate_limit_info: {
        status: "allowed",
        rateLimitType: "five_hour",
        resetsAt: 1790880000,
        unifiedWindows: {
          five_hour: { utilization: utilization.five, resetsAt: 1790880000 },
          seven_day: { utilization: utilization.seven, resetsAt: 1791183600 },
        },
      },
    },
    {
      type: "result",
      subtype: "success",
      is_error: false,
      result: reply,
      usage: {
        input_tokens: 432,
        output_tokens: 14,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  ]
    .map((l) => JSON.stringify(l))
    .join("\n");
}

describe("isClaudeModel / claudeModelSpec", () => {
  it("routes by the name's prefix", () => {
    expect(isClaudeModel(CLAUDE_JUDGE_MODEL)).toBe(true);
    expect(isClaudeModel("google/gemini-2.5-flash-lite")).toBe(false);
  });
  it("reads +think as thinking on, and strips it from the id", () => {
    expect(claudeModelSpec("claude-haiku-4-5-20251001")).toEqual({
      id: "claude-haiku-4-5-20251001",
      thinking: false,
    });
    expect(claudeModelSpec("claude-haiku-4-5-20251001+think")).toEqual({
      id: "claude-haiku-4-5-20251001",
      thinking: true,
    });
  });
});

describe("stripFence", () => {
  it("unwraps a ```json fence", () => {
    expect(stripFence('```json\n{"score": 7}\n```')).toBe('{"score": 7}');
  });
  it("unwraps a bare fence", () => {
    expect(stripFence('```\n{"score": 7}\n```')).toBe('{"score": 7}');
  });
  it("leaves plain JSON alone", () => {
    expect(stripFence(' {"score": 7} ')).toBe('{"score": 7}');
  });
  it("pulls the object out of surrounding prose", () => {
    expect(stripFence('Here it is:\n{"score": 7, "tags": ["a"]}\nDone.')).toBe(
      '{"score": 7, "tags": ["a"]}',
    );
  });
});

describe("claudeArgs", () => {
  const args = claudeArgs("claude-haiku-4-5-20251001", "SYSTEM");
  it("replaces the system prompt and strips every source of overhead", () => {
    expect(args).toEqual([
      "-p",
      "--model",
      "claude-haiku-4-5-20251001",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--system-prompt",
      "SYSTEM",
      "--tools",
      "",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--no-session-persistence",
    ]);
  });
});

describe("claudeStdin", () => {
  it("wraps a string as one text block", () => {
    expect(JSON.parse(claudeStdin("hello"))).toEqual({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "hello" }] },
    });
  });
  it("turns a data URL into a base64 image block — bytes, never a URL", () => {
    const line = JSON.parse(
      claudeStdin([
        { type: "text", text: "Title: x" },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD" } },
      ]),
    ) as { message: { content: unknown[] } };
    expect(line.message.content).toEqual([
      { type: "text", text: "Title: x" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: "QUJD" },
      },
    ]);
  });
  it("refuses an image that is not a data URL", () => {
    expect(() =>
      claudeStdin([
        { type: "image_url", image_url: { url: "https://example.com/a.jpg" } },
      ]),
    ).toThrow(/data URL/);
  });
});

describe("parseClaudeStream", () => {
  it("reads the reply, the tokens and the limit report", () => {
    const out = parseClaudeStream(stream('{"score": 7}'));
    expect(out.reply).toBe('{"score": 7}');
    expect(out.isError).toBe(false);
    expect(out.tokens).toBe(446);
    expect(out.rateLimit?.unifiedWindows?.seven_day?.utilization).toBe(0.22);
  });
  it("survives lines that are not JSON", () => {
    const out = parseClaudeStream(`warning: something\n${stream("{}")}`);
    expect(out.reply).toBe("{}");
  });
  it("reports no reply when the stream has no result line", () => {
    expect(parseClaudeStream("").reply).toBeNull();
  });
});

describe("limitVerdict", () => {
  const info = (five: number, seven: number, status = "allowed") => ({
    status,
    rateLimitType: "five_hour",
    resetsAt: 1790880000,
    unifiedWindows: {
      five_hour: { utilization: five, resetsAt: 1790880000 },
      seven_day: { utilization: seven, resetsAt: 1791183600 },
    },
  });
  it("is null under the ceiling", () => {
    expect(limitVerdict(info(0.5, 0.5), 0.8)).toBeNull();
  });
  it("names the window that reached the ceiling, and when it resets", () => {
    expect(limitVerdict(info(0.5, 0.81), 0.8)).toMatch(
      /seven_day window is at 81%.*2026-10-/,
    );
  });
  it("stops on a rejected status whatever the utilization says", () => {
    expect(limitVerdict(info(0.1, 0.1, "rejected"), 0.8)).toMatch(/reached/);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `bunx vitest run src/server/services/claude-judge.test.ts`
Expected: FAIL — cannot resolve `./claude-judge`.

- [ ] **Step 4: Implement**

`src/server/services/claude-judge.ts`:

```ts
// The Claude judge (docs/DESIGN_claude-judge-ingest.md): the curator's second transport, a
// headless Claude Code call on Ben's Max subscription instead of an OpenRouter chat completion.
//
// A bare `claude -p` carries ~54,000 tokens of Claude Code's own system prompt, tools, CLAUDE.md
// and memory around a one-line judgment (measured 10-01-26). The flags in claudeArgs strip all of
// it: the same call is 432 input tokens and about a second. Those tokens are not billed, but they
// count against the subscription's five-hour and seven-day limits, which Ben's own sessions share.

/** Haiku 4.5 — the cheapest current Claude, and the one calibration is run against (D3). */
export const CLAUDE_JUDGE_MODEL = "claude-haiku-4-5-20251001";

/** The message content the curator builds: text, or text plus images as data URLs. The same
 *  shape the OpenRouter transport sends (curator.ts's CuratorContent). */
export type JudgeContent =
  | string
  | (
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    )[];

/** `rate_limit_info` from the CLI's `rate_limit_event` line — the subscription's own account of
 *  how much of each window is spent. `utilization` is a fraction, 0 to 1. */
export type RateLimitInfo = {
  status: string;
  rateLimitType?: string;
  resetsAt?: number;
  unifiedWindows?: Record<string, { utilization: number; resetsAt?: number }>;
};

export type ClaudeOutcome = {
  /** The model's text, or null when the stream carried no result line. */
  reply: string | null;
  isError: boolean;
  tokens: number;
  rateLimit: RateLimitInfo | null;
};

/** A model id starting `claude-` is judged through the CLI; anything else through OpenRouter. */
export function isClaudeModel(model: string): boolean {
  return model.startsWith("claude-");
}

/**
 * `claude-haiku-4-5-20251001+think` means the same model with thinking left on. The suffix is
 * part of the *name* on purpose: the curation cache is keyed on the model name, so a thinking
 * judge and a non-thinking one keep separate answers and can sit side by side in a calibration.
 */
export function claudeModelSpec(model: string): {
  id: string;
  thinking: boolean;
} {
  const thinking = model.endsWith("+think");
  return { id: thinking ? model.slice(0, -"+think".length) : model, thinking };
}

/**
 * Haiku fences its JSON (```json … ```) even when the prompt says not to, and occasionally adds a
 * sentence around it. The curator's parsers start with JSON.parse, so the object is dug out here:
 * a fence first, else the span from the first `{` to the last `}`.
 */
export function stripFence(reply: string): string {
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(reply);
  const text = (fenced?.[1] ?? reply).trim();
  if (text.startsWith("{")) return text;
  const from = text.indexOf("{");
  const to = text.lastIndexOf("}");
  return from > -1 && to > from ? text.slice(from, to + 1) : text;
}

/**
 * The argv for one judgment. Each flag removes one source of overhead or one way the session
 * could do anything but answer: our prompt instead of Claude Code's, no tools, no settings files
 * (so no hooks, plugins or CLAUDE.md), no MCP servers, no skills, nothing saved to disk.
 * `--verbose` is required by `--output-format stream-json`, which is the only format that carries
 * the rate-limit report.
 */
export function claudeArgs(modelId: string, system: string): string[] {
  return [
    "-p",
    "--model",
    modelId,
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--system-prompt",
    system,
    "--tools",
    "",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-session-persistence",
  ];
}

/**
 * The one line written to the CLI's stdin: a user message in Anthropic's block shape. An image
 * travels as base64 bytes — museum servers bot-block third-party fetchers, so a URL would be
 * useless even if the CLI accepted one (CLAUDE.md, Architecture).
 */
export function claudeStdin(content: JudgeContent): string {
  const parts =
    typeof content === "string"
      ? [{ type: "text" as const, text: content }]
      : content;
  const blocks = parts.map((part) => {
    if (part.type === "text") return part;
    const match = /^data:([^;]+);base64,(.+)$/.exec(part.image_url.url);
    if (!match)
      throw new Error("the Claude judge takes an image as a data URL only");
    return {
      type: "image",
      source: { type: "base64", media_type: match[1], data: match[2] },
    };
  });
  return JSON.stringify({
    type: "user",
    message: { role: "user", content: blocks },
  });
}

/** Read the CLI's stream-json stdout: one JSON object per line; anything else is skipped. */
export function parseClaudeStream(stdout: string): ClaudeOutcome {
  const out: ClaudeOutcome = {
    reply: null,
    isError: false,
    tokens: 0,
    rateLimit: null,
  };
  for (const line of stdout.split("\n")) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event.type === "rate_limit_event")
      out.rateLimit = event.rate_limit_info as RateLimitInfo;
    if (event.type === "result") {
      out.reply = typeof event.result === "string" ? event.result : null;
      out.isError = event.is_error === true;
      const usage = (event.usage ?? {}) as Record<string, unknown>;
      out.tokens = [
        "input_tokens",
        "output_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
      ].reduce((sum, key) => sum + (Number(usage[key]) || 0), 0);
    }
  }
  return out;
}

/**
 * Whether the run should stop, and why. Two cases: the subscription has refused the call
 * (`rejected`), or a window has reached the ceiling — the share of the subscription the ingest
 * may use before it leaves the rest for Ben's own sessions (D7). Null means carry on.
 */
export function limitVerdict(
  info: RateLimitInfo,
  ceiling: number,
): string | null {
  const when = (seconds?: number) =>
    seconds ? new Date(seconds * 1000).toISOString() : "unknown";
  if (info.status === "rejected")
    return `the subscription's ${info.rateLimitType ?? "usage"} limit is reached — resets ${when(info.resetsAt)}`;
  for (const [name, window] of Object.entries(info.unifiedWindows ?? {}))
    if (window.utilization >= ceiling)
      return `the ${name} window is at ${Math.round(window.utilization * 100)}% (ceiling ${Math.round(ceiling * 100)}%) — resets ${when(window.resetsAt)}`;
  return null;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `bunx vitest run src/server/services/claude-judge.test.ts && bun run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/curator-errors.ts src/server/services/claude-judge.ts src/server/services/claude-judge.test.ts src/server/services/curator.ts
git commit -m "feat(curator): the Claude judge's pure half — argv, stdin, stream parsing, limit verdict"
```

---

### Task 2: Spawning the CLI, and the clean stop

**Files:**
- Modify: `src/server/services/claude-judge.ts` (append)
- Modify: `src/server/services/claude-judge.test.ts` (append)

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: `claudeComplete(req: { model: string; system: string; content: JudgeContent }): Promise<{ reply: string; tokens: number }>` (reply already fence-stripped); `claudeRuntime: { run: ClaudeRunner }`; `type ClaudeRunner = (args: string[], stdin: string, opts: { thinking: boolean }) => Promise<{ code: number; stdout: string; stderr: string }>`; `claudeEnv(env, thinking): NodeJS.ProcessEnv`; `claudeUsage(): { first: RateLimitInfo; last: RateLimitInfo } | null`; `resetClaudeJudge(): void`; `claudeAvailable(): boolean`; `CLAUDE_CONCURRENCY = 4`.

- [ ] **Step 1: Write the failing tests** (append to `claude-judge.test.ts`; extend the import list with `claudeComplete`, `claudeEnv`, `claudeRuntime`, `claudeUsage`, `resetClaudeJudge`, and import `afterEach, beforeEach, vi` from vitest and `CuratorAbortError` from `./curator-errors`)

```ts
describe("claudeEnv", () => {
  it("never passes an API key to the child — the CLI would bill it instead of the subscription", () => {
    const env = claudeEnv(
      { PATH: "/bin", ANTHROPIC_API_KEY: "sk-x", ANTHROPIC_AUTH_TOKEN: "t" },
      false,
    );
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.PATH).toBe("/bin");
  });
  it("turns thinking off unless asked", () => {
    expect(claudeEnv({}, false).MAX_THINKING_TOKENS).toBe("0");
    expect(claudeEnv({}, true).MAX_THINKING_TOKENS).toBeUndefined();
  });
});

describe("claudeComplete", () => {
  const realRun = claudeRuntime.run;
  let runs: { args: string[]; stdin: string; thinking: boolean }[];
  function respond(stdout: string, code = 0) {
    claudeRuntime.run = (args, stdin, opts) => {
      runs.push({ args, stdin, thinking: opts.thinking });
      return Promise.resolve({ code, stdout, stderr: "boom" });
    };
  }
  const req = { model: CLAUDE_JUDGE_MODEL, system: "S", content: "hello" };

  beforeEach(() => {
    runs = [];
    resetClaudeJudge();
  });
  afterEach(() => {
    claudeRuntime.run = realRun;
    vi.unstubAllEnvs();
  });

  it("returns the reply with its fence removed", async () => {
    respond(stream('```json\n{"score": 7}\n```'));
    expect(await claudeComplete(req)).toEqual({
      reply: '{"score": 7}',
      tokens: 446,
    });
    expect(runs[0]?.args).toContain("claude-haiku-4-5-20251001");
    expect(runs[0]?.thinking).toBe(false);
  });

  it("passes +think through as thinking on, with the bare model id", async () => {
    respond(stream("{}"));
    await claudeComplete({ ...req, model: `${CLAUDE_JUDGE_MODEL}+think` });
    expect(runs[0]?.thinking).toBe(true);
    expect(runs[0]?.args).not.toContain(`${CLAUDE_JUDGE_MODEL}+think`);
  });

  it("throws an ordinary error on a failed call, so the caller retries it", async () => {
    respond("", 1);
    await expect(claudeComplete(req)).rejects.not.toBeInstanceOf(
      CuratorAbortError,
    );
  });

  it("keeps the answer that crossed the ceiling, then refuses to spawn again", async () => {
    respond(stream('{"score": 7}', { five: 0.3, seven: 0.85 }));
    expect((await claudeComplete(req)).reply).toBe('{"score": 7}');
    await expect(claudeComplete(req)).rejects.toBeInstanceOf(CuratorAbortError);
    await expect(claudeComplete(req)).rejects.toThrow(/seven_day window is at 85%/);
    expect(runs).toHaveLength(1);
  });

  it("reads the ceiling from CLAUDE_JUDGE_MAX_UTILIZATION", async () => {
    vi.stubEnv("CLAUDE_JUDGE_MAX_UTILIZATION", "0.2");
    respond(stream("{}"));
    await claudeComplete(req);
    await expect(claudeComplete(req)).rejects.toBeInstanceOf(CuratorAbortError);
  });

  it("aborts at once when the subscription rejects the call", async () => {
    const rejected = [
      JSON.stringify({
        type: "rate_limit_event",
        rate_limit_info: { status: "rejected", rateLimitType: "seven_day", resetsAt: 1791183600 },
      }),
      JSON.stringify({ type: "result", is_error: true, result: "limit reached" }),
    ].join("\n");
    respond(rejected, 1);
    await expect(claudeComplete(req)).rejects.toBeInstanceOf(CuratorAbortError);
  });

  it("remembers the first and the latest usage report of the process", async () => {
    expect(claudeUsage()).toBeNull();
    respond(stream("{}", { five: 0.1, seven: 0.2 }));
    await claudeComplete(req);
    respond(stream("{}", { five: 0.15, seven: 0.25 }));
    await claudeComplete(req);
    expect(claudeUsage()?.first.unifiedWindows?.seven_day?.utilization).toBe(0.2);
    expect(claudeUsage()?.last.unifiedWindows?.seven_day?.utilization).toBe(0.25);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/server/services/claude-judge.test.ts`
Expected: FAIL — `claudeComplete` is not exported.

- [ ] **Step 3: Implement** (append to `claude-judge.ts`; add the imports at the top of the file)

```ts
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

import { CuratorAbortError } from "./curator-errors";
```

```ts
// ── the impure half ─────────────────────────────────────────────────────────

/** How many `claude` processes run at once. Each is a whole Node process, not a socket, so the
 *  pool is half the OpenRouter one (curator.ts's CONCURRENCY). */
export const CLAUDE_CONCURRENCY = 4;

/** One judgment is a second or two; a call still running after this is hung, and is killed. */
const CLAUDE_TIMEOUT_MS = 120_000;

/** The default ceiling (D7): the ingest stops when a window is four-fifths spent. */
const DEFAULT_MAX_UTILIZATION = 0.8;

export type ClaudeRunner = (
  args: string[],
  stdin: string,
  opts: { thinking: boolean },
) => Promise<{ code: number; stdout: string; stderr: string }>;

/**
 * The child's environment. Two edits. `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` are removed:
 * with either set the CLI authenticates with that key and *bills it*, silently, instead of using
 * the subscription login — the same shell-shadowing trap CLAUDE.md records for OpenRouter.
 * `MAX_THINKING_TOKENS=0` turns extended thinking off: a 1–10 score does not need it, and it was
 * most of the output tokens and most of the latency in the 10-01-26 probe (354 of 400 tokens).
 */
export function claudeEnv(
  env: NodeJS.ProcessEnv,
  thinking: boolean,
): NodeJS.ProcessEnv {
  const child = { ...env };
  delete child.ANTHROPIC_API_KEY;
  delete child.ANTHROPIC_AUTH_TOKEN;
  if (!thinking) child.MAX_THINKING_TOKENS = "0";
  return child;
}

/** Run the CLI once. cwd is the temp dir, so no project's CLAUDE.md is anywhere near it. */
const spawnClaude: ClaudeRunner = (args, stdin, opts) =>
  new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd: tmpdir(),
      env: claudeEnv(process.env, opts.thinking),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), CLAUDE_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    // `error` is the CLI not being found at all (ENOENT); `close` is every other ending.
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end(`${stdin}\n`);
  });

/** Swappable so tests never spawn a process: `claudeRuntime.run = fake`. */
export const claudeRuntime: { run: ClaudeRunner } = { run: spawnClaude };

// Process-wide state. `stop` is set by the call that crossed the ceiling and read by every call
// after it: the crossing call's own answer is good and is returned (the caller caches it), and
// the *next* call is the one that aborts. With four workers, at most four answers land after the
// ceiling — all cached, none wasted.
let stop: string | null = null;
let usage: { first: RateLimitInfo; last: RateLimitInfo } | null = null;

/** The subscription's usage as first and last reported in this process — the ingest summary
 *  prints the pair, which is how a run's share of the weekly limit is measured. */
export function claudeUsage(): typeof usage {
  return usage;
}

/** Tests only: forget the stop and the usage between cases. */
export function resetClaudeJudge(): void {
  stop = null;
  usage = null;
}

/** True when the `claude` CLI is on PATH and runs. A script's first line of defence, so a missing
 *  install is one sentence at the start rather than twenty failed judgments in. */
export function claudeAvailable(): boolean {
  return spawnSync("claude", ["--version"], { stdio: "ignore" }).status === 0;
}

function maxUtilization(): number {
  const value = Number(process.env.CLAUDE_JUDGE_MAX_UTILIZATION);
  return value > 0 && value <= 1 ? value : DEFAULT_MAX_UTILIZATION;
}

const abort = (reason: string) =>
  new CuratorAbortError(
    `Claude judge stopped: ${reason}. Nothing written; every judgment so far is cached, so the re-run resumes where this one stopped`,
  );

/**
 * One judgment through `claude -p`. Throws CuratorAbortError when the subscription's limit says
 * stop (curateItems lets that through and the batch ends); throws a plain Error for anything
 * else, which callCurator's retry loop treats like a failed HTTP call.
 */
export async function claudeComplete(req: {
  model: string;
  system: string;
  content: JudgeContent;
}): Promise<{ reply: string; tokens: number }> {
  if (stop) throw abort(stop);
  const spec = claudeModelSpec(req.model);
  const run = await claudeRuntime.run(
    claudeArgs(spec.id, req.system),
    claudeStdin(req.content),
    { thinking: spec.thinking },
  );
  const out = parseClaudeStream(run.stdout);
  if (out.rateLimit) {
    usage = { first: usage?.first ?? out.rateLimit, last: out.rateLimit };
    stop = limitVerdict(out.rateLimit, maxUtilization());
    // Refused outright: there is no answer to keep, so this call is the one that aborts.
    if (out.rateLimit.status === "rejected" && stop) throw abort(stop);
  }
  if (run.code !== 0 || out.isError || out.reply === null)
    throw new Error(
      `claude -p failed (exit ${run.code}): ${(out.reply ?? run.stderr).slice(0, 200)}`,
    );
  return { reply: stripFence(out.reply), tokens: out.tokens };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/server/services/claude-judge.test.ts && bun run typecheck && bun run lint`
Expected: PASS, clean.

- [ ] **Step 5: One live call, by hand** (the only live check in Tasks 1–3; it spends one judgment of the subscription)

```bash
bun -e 'import {claudeComplete,claudeUsage,CLAUDE_JUDGE_MODEL} from "./src/server/services/claude-judge.ts"; console.log(await claudeComplete({model:CLAUDE_JUDGE_MODEL,system:"Reply with ONLY one JSON object.",content:"Give {\"ok\":true}"})); console.log(JSON.stringify(claudeUsage()?.last.unifiedWindows));'
```

Expected: `{ reply: '{"ok": true}', tokens: <under 600> }` and a line with `five_hour` and `seven_day` utilizations. If `tokens` is in the tens of thousands, a flag in `claudeArgs` is not being honoured by the installed CLI: stop and report, do not continue.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/claude-judge.ts src/server/services/claude-judge.test.ts
git commit -m "feat(curator): spawn claude -p for a judgment, stop cleanly at the subscription ceiling"
```

---

### Task 3: Wire the transport into the curator

**Files:**
- Modify: `src/server/services/curator.ts` (`curationCacheKey` ~552, `writingCacheKey` ~605, `imageAsDataUrl` ~410, `scoreWriting` ~660, `scoreItem` ~699–810, `callCurator` ~825–885, `curateItems` pool ~1019)
- Modify: `src/server/services/curator.test.ts` (append)
- Modify: `src/server/services/curator-writing.test.ts` (append)

**Interfaces:**
- Consumes: `claudeComplete`, `isClaudeModel`, `CLAUDE_JUDGE_MODEL`, `CLAUDE_CONCURRENCY`, `claudeAvailable`, `claudeRuntime`, `resetClaudeJudge` from `./claude-judge`.
- Produces: `judgeModel(): string`; `judgePreflight(models?: string[]): string | null`; `curationCacheKey(item, classify, model = judgeModel())`; `writingCacheKey(item, model = judgeModel())`; `CLAUDE_IMAGE_FIT = 1024`.

- [ ] **Step 1: Write the failing tests**

Append to `curator.test.ts` (add `judgeModel`, `judgePreflight`, `CURATOR_MODEL` to the `./curator` import; add `import sharp from "sharp";` and `import { CLAUDE_JUDGE_MODEL, claudeRuntime, resetClaudeJudge } from "./claude-judge";`):

```ts
/** A successful CLI stream carrying `reply` (the shape captured 10-01-26). */
function claudeStream(reply: string) {
  return [
    {
      type: "rate_limit_event",
      rate_limit_info: {
        status: "allowed",
        unifiedWindows: { seven_day: { utilization: 0.2 } },
      },
    },
    {
      type: "result",
      is_error: false,
      result: reply,
      usage: { input_tokens: 400, output_tokens: 14 },
    },
  ]
    .map((l) => JSON.stringify(l))
    .join("\n");
}

describe("judgeModel", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is the OpenRouter model when CURATOR_JUDGE is unset", () => {
    vi.stubEnv("CURATOR_JUDGE", "");
    expect(judgeModel()).toBe(CURATOR_MODEL);
  });
  it("is Haiku under CURATOR_JUDGE=claude", () => {
    vi.stubEnv("CURATOR_JUDGE", "claude");
    expect(judgeModel()).toBe(CLAUDE_JUDGE_MODEL);
  });
  it("refuses a value it does not know rather than guessing", () => {
    vi.stubEnv("CURATOR_JUDGE", "gemini");
    expect(() => judgeModel()).toThrow(/CURATOR_JUDGE/);
  });
});

describe("cache keys under the two judges", () => {
  afterEach(() => vi.unstubAllEnvs());
  const it1 = { source: "met" as const, sourceId: "42" };
  it("an explicit OpenRouter model gives the key the unset default gives", () => {
    vi.stubEnv("CURATOR_JUDGE", "");
    expect(curationCacheKey(it1, false, CURATOR_MODEL)).toBe(
      curationCacheKey(it1, false),
    );
  });
  it("the Claude judge has a namespace of its own", () => {
    vi.stubEnv("CURATOR_JUDGE", "");
    const openrouter = curationCacheKey(it1, true);
    vi.stubEnv("CURATOR_JUDGE", "claude");
    expect(curationCacheKey(it1, true)).not.toBe(openrouter);
    expect(curationCacheKey(it1, true)).toBe(
      curationCacheKey(it1, true, CLAUDE_JUDGE_MODEL),
    );
  });
});

describe("judgePreflight", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("asks for the OpenRouter key only when an OpenRouter model is in play", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(judgePreflight([CURATOR_MODEL])).toMatch(/OPENROUTER_API_KEY/);
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    expect(judgePreflight([CURATOR_MODEL])).toBeNull();
  });
});

describe("curateItems on the Claude judge", () => {
  const realRun = claudeRuntime.run;
  let runs: { args: string[]; stdin: string }[];
  let imageBytes: Buffer | null;

  beforeEach(() => {
    runs = [];
    imageBytes = null;
    resetClaudeJudge();
    vi.stubEnv("CURATOR_JUDGE", "claude");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubGlobal("fetch", (input: string | URL) => {
      // An OpenRouter call here would reject, be absorbed as a failed judgment, and come back as
      // the neutral score 5 — so asserting on the real score below proves none was made.
      if (String(input).includes("openrouter.ai"))
        return Promise.reject(new Error("the Claude judge must not call OpenRouter"));
      if (!imageBytes) return Promise.resolve({ ok: false, status: 404 });
      const bytes = imageBytes;
      return Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: () =>
          Promise.resolve(
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          ),
      });
    });
    claudeRuntime.run = (args, stdin) => {
      runs.push({ args, stdin });
      return Promise.resolve({
        code: 0,
        stdout: claudeStream('```json\n{"score": 8, "tags": ["Ink Wash"]}\n```'),
        stderr: "",
      });
    };
  });
  afterEach(() => {
    claudeRuntime.run = realRun;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("scores through the CLI with the curator's own prompt, never OpenRouter", async () => {
    const [out] = await curateItems(
      [makeItem({ sourceId: `claude-${Date.now()}`, type: "image" })],
      { force: true },
    );
    expect(out?.curationScore).toBe(8);
    expect(out?.aestheticTags).toEqual(["ink wash"]);
    expect(runs).toHaveLength(1);
    const system = runs[0]!.args[runs[0]!.args.indexOf("--system-prompt") + 1];
    expect(system).toBe(CURATOR_PROMPT);
  });

  it("sends a picture as a downscaled JPEG, whatever the source served", async () => {
    imageBytes = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: "#884422" },
    })
      .png()
      .toBuffer();
    await curateItems(
      [
        makeItem({
          sourceId: `claude-img-${Date.now()}`,
          type: "image",
          imageUrl: "https://museum.example/big.png",
        }),
      ],
      { force: true },
    );
    const message = JSON.parse(runs[0]!.stdin) as {
      message: {
        content: { type: string; source?: { media_type: string; data: string } }[];
      };
    };
    const image = message.message.content.find((b) => b.type === "image");
    expect(image?.source?.media_type).toBe("image/jpeg");
    const meta = await sharp(Buffer.from(image!.source!.data, "base64")).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(512);
  });

  it("judges from text, and says so, when the bytes are not a picture sharp can read", async () => {
    imageBytes = Buffer.from("this is not an image");
    const failures: string[] = [];
    const [out] = await curateItems(
      [
        makeItem({
          sourceId: `claude-bad-${Date.now()}`,
          type: "image",
          imageUrl: "https://museum.example/odd.tiff",
        }),
      ],
      { force: true, onImageFetchFailure: (it) => failures.push(it.sourceId) },
    );
    expect(failures).toHaveLength(1);
    expect(out?.curationScore).toBe(8);
    expect(runs[0]!.stdin).toContain("could not be fetched");
    expect(runs[0]!.stdin).not.toContain('"type":"image"');
  });
});
```

Append to `curator-writing.test.ts` (import `CLAUDE_JUDGE_MODEL, claudeRuntime, resetClaudeJudge` from `./claude-judge`; reuse that file's `makeItem`):

```ts
describe("the writing curator on the Claude judge", () => {
  const realRun = claudeRuntime.run;
  let systems: string[];
  beforeEach(() => {
    systems = [];
    resetClaudeJudge();
    vi.stubEnv("CURATOR_JUDGE", "claude");
    vi.stubGlobal("fetch", () =>
      Promise.reject(new Error("no HTTP call is expected")),
    );
    claudeRuntime.run = (args) => {
      systems.push(args[args.indexOf("--system-prompt") + 1] ?? "");
      return Promise.resolve({
        code: 0,
        stdout: JSON.stringify({
          type: "result",
          is_error: false,
          result:
            '```json\n{"score": 9, "tags": ["odd"], "kind": "essay", "timeliness": "timeless", "topics": ["botany"]}\n```',
          usage: { input_tokens: 2000, output_tokens: 30 },
        }),
        stderr: "",
      });
    };
  });
  afterEach(() => {
    claudeRuntime.run = realRun;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reads a fenced writing reply: score, kind and topics", async () => {
    const [out] = await curateItems(
      [
        makeItem({
          source: "pdr",
          sourceId: `cw-${Date.now()}`,
          body: "word ".repeat(460),
        }),
      ],
      { force: true, topics: [{ id: "botany", label: "Botany" }] },
    );
    expect(out?.curationScore).toBe(9);
    expect(out?.kind).toBe("essay");
    expect(out?.topics).toEqual(["botany"]);
    expect(systems[0]).toContain("timeliness");
  });

  it("an explicit writingModel overrides the env's judge", () => {
    expect(writingCacheKey({ source: "pdr", sourceId: "1" })).toBe(
      writingCacheKey({ source: "pdr", sourceId: "1" }, CLAUDE_JUDGE_MODEL),
    );
  });
});
```

(If `writingCacheKey` is not yet imported in `curator-writing.test.ts`, add it to that file's `./curator` import.)

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/server/services/curator.test.ts src/server/services/curator-writing.test.ts`
Expected: the new tests FAIL (`judgeModel` is not exported); every pre-existing test still passes.

- [ ] **Step 3: Implement in `curator.ts`**

3a. Imports, beside the existing ones:

```ts
import sharp from "sharp";

import {
  CLAUDE_CONCURRENCY,
  CLAUDE_JUDGE_MODEL,
  claudeAvailable,
  claudeComplete,
  isClaudeModel,
} from "./claude-judge";
```

3b. Directly under `CURATOR_MODEL`:

```ts
/**
 * Which judge a run uses by default (docs/DESIGN_claude-judge-ingest.md D2). `CURATOR_JUDGE=claude`
 * is Haiku through the Claude Code CLI on Ben's subscription; unset or `openrouter` is
 * CURATOR_MODEL, exactly as before. Read at call time, not import time, so a script and a test
 * can both set it. Nothing ever falls back from one to the other on its own: the cache is keyed
 * on the model, and a run that quietly mixed two judges would store scores from two rubrics
 * under one summary.
 */
export function judgeModel(): string {
  const judge = process.env.CURATOR_JUDGE || "openrouter";
  if (judge === "claude") return CLAUDE_JUDGE_MODEL;
  if (judge === "openrouter") return CURATOR_MODEL;
  throw new Error(
    `CURATOR_JUDGE must be "openrouter" or "claude", got "${judge}"`,
  );
}

/**
 * Can these models be called at all? One sentence when not, null when fine — for a script to
 * print and exit on before any walk starts. An OpenRouter model needs the key; a Claude model
 * needs the CLI installed.
 */
export function judgePreflight(
  models: readonly string[] = [judgeModel()],
): string | null {
  if (models.some((m) => !isClaudeModel(m)) && !process.env.OPENROUTER_API_KEY)
    return "OPENROUTER_API_KEY is not set — required for the OpenRouter judge (add it to .env, or set CURATOR_JUDGE=claude).";
  if (models.some(isClaudeModel) && !claudeAvailable())
    return "the `claude` CLI is not installed or not on PATH — required for CURATOR_JUDGE=claude (install Claude Code and log in with the subscription).";
  return null;
}

/** The longest side a picture is sent to Claude at (D6). The API refuses images over 5 MB and
 *  anything but JPEG/PNG/GIF/WebP; museum originals are routinely both. 1024 px is ~1,400 image
 *  tokens, and a 1–10 score does not improve past it. */
export const CLAUDE_IMAGE_FIT = 1024;
```

3c. `curationCacheKey` gains a third parameter and uses it in place of the constant. Keep its doc comment and add one sentence: "`model` defaults to the run's judge (`judgeModel()`), which under the unset default is `CURATOR_MODEL`, so every key written before 10-01-26 is unchanged."

```ts
export function curationCacheKey(
  item: Pick<NormalizedItem, "source" | "sourceId">,
  classify: boolean,
  model: string = judgeModel(),
): string {
  const mode = classify ? "classify|" : "";
  return createHash("sha256")
    .update(`${model}|v${PROMPT_VERSION}|${mode}${item.source}:${item.sourceId}`)
    .digest("hex")
    .slice(0, 32);
}
```

`writingCacheKey`: change the default from `model: string = CURATOR_MODEL` to `model: string = judgeModel()`. In `scoreWriting`: `const model = opts.model ?? judgeModel();`.

3d. `imageAsDataUrl` gains an optional `fit`. Replace the two lines that build `b64` and return:

```ts
      const bytes = Buffer.from(await res.arrayBuffer());
      if (fit) {
        // The Claude path (D6): one known format at one bounded size. `rotate()` applies the
        // EXIF orientation before the metadata is dropped. A file sharp cannot decode returns
        // null — the caller's "judge from the text alone" branch, counted per source like any
        // other picture the curator could not look at.
        try {
          const jpeg = await sharp(bytes)
            .rotate()
            .resize(fit, fit, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
        } catch {
          return null;
        }
      }
      return `data:${mime};base64,${bytes.toString("base64")}`;
```

with the signature `async function imageAsDataUrl(url: string, headers: Record<string, string> = {}, fit?: number)`. Note the existing `if (!mime.startsWith("image/")) continue;` check stays above it.

3e. In `scoreItem`: add `const model = judgeModel();` at the top; build `cacheFile` with `curationCacheKey(item, classify, model)`; call `imageAsDataUrl(item.curationImageUrl ?? item.imageUrl, imageFetchHeaders(item.source), isClaudeModel(model) ? CLAUDE_IMAGE_FIT : undefined)`; pass `model` instead of `CURATOR_MODEL` to `callCurator`.

3f. Split `callCurator`. The existing fetch body becomes `openRouterComplete`, unchanged in behaviour, and the loop picks a transport:

```ts
/** The OpenRouter transport: one chat completion. An account-level status throws
 *  CuratorAbortError — see CURATOR_ABORT_STATUSES. */
async function openRouterComplete(req: {
  model: string;
  system: string;
  content: CuratorContent;
}): Promise<{ reply: string; tokens: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set — required for curateItems() (add it to .env).",
    );
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.content },
      ],
      // Asks the provider to guarantee syntactically valid JSON output.
      response_format: { type: "json_object" },
      temperature: 0.2,
      // Reserved against the key's budget before dispatch — see CURATOR_MAX_TOKENS.
      max_tokens: CURATOR_MAX_TOKENS,
    }),
  });
  if (!res.ok) {
    const detail = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
    // Account-level, not item-level: thrown past the retry in callCurator and past the fallback
    // in curateItems. Retrying a 402 four times per item is how walk 3 ran for eighteen hours.
    if (CURATOR_ABORT_STATUSES.has(res.status))
      throw new CuratorAbortError(
        `OpenRouter ${detail} — ${res.status === 402 ? "the account is out of credits" : "the API key was rejected"}; nothing written, re-run after fixing the account`,
        res.status,
      );
    throw new Error(detail);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { total_tokens?: number };
  };
  return {
    reply: json.choices?.[0]?.message?.content ?? "{}",
    tokens: json.usage?.total_tokens ?? 0,
  };
}

/**
 * One curator judgement, with the retry loop and the fail-fast rule both curators and both
 * transports share. The transport is chosen by the model's name (D1): `claude-*` is the Claude
 * Code CLI on the subscription, anything else OpenRouter. `parse` runs inside the retry, so a
 * reply that isn't usable JSON (or has no usable score) is retried like a network error rather
 * than cached. CuratorAbortError goes straight through — an empty wallet on one side, the
 * subscription's ceiling on the other.
 */
async function callCurator<T>(
  req: { model: string; system: string; content: CuratorContent },
  parse: (reply: string) => T,
): Promise<{ result: T; tokens: number }> {
  const complete = isClaudeModel(req.model) ? claudeComplete : openRouterComplete;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const { reply, tokens } = await complete(req);
      return { result: parse(reply), tokens };
    } catch (err) {
      if (err instanceof CuratorAbortError) throw err;
      lastErr = err;
      if (attempt < 4)
        await sleep(1000 * 3 ** (attempt - 1) + Math.random() * 500);
    }
  }
  throw lastErr;
}
```

Behaviour note for the reviewer: the missing-key error used to be thrown before the loop (no retries); it is now thrown inside it and retried three times before failing the item. Scripts check the key up front through `judgePreflight` (Task 4), so this path is reached only by a caller that skipped the preflight.

3g. The pool size, at the bottom of `curateItems`:

```ts
  // A Claude judgment is a process, not a socket — half the pool (claude-judge.ts).
  const claude =
    isClaudeModel(judgeModel()) ||
    isClaudeModel(opts?.writingModel ?? judgeModel());
  await Promise.all(
    Array.from(
      { length: Math.min(claude ? CLAUDE_CONCURRENCY : CONCURRENCY, items.length) },
      worker,
    ),
  );
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/server/services/curator.test.ts src/server/services/curator-writing.test.ts src/server/services/claude-judge.test.ts && bun run typecheck && bun run lint`
Expected: all PASS, including the two pre-existing tests that pin cache keys. If one of those fails, the default model is being resolved wrongly — fix the code, never the pinned value.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/curator.ts src/server/services/curator.test.ts src/server/services/curator-writing.test.ts
git commit -m "feat(curator): choose the judge by model — claude -p beside OpenRouter, own cache namespace"
```

---

### Task 4: The scripts learn the switch

**Files:**
- Modify: `scripts/ingest.ts:156-163` (key check) and the summary printer (~line 977, the `curated:` line) and the abort handler (~line 1000)
- Modify: `scripts/recurate.ts:80-85`, `scripts/recurate-writing.ts:54,68-73`, `scripts/writing-calibrate.ts:88-91`
- Modify: `scripts/walk-stats.ts` (add the preflight; it has no key check today)
- Modify: `.env.example` (after the `OPENROUTER_API_KEY` block), `src/env.js:45,114`
- Test: `src/server/services/curator.test.ts` already covers `judgePreflight`; the scripts are verified by running them.

**Interfaces:**
- Consumes: `judgeModel()`, `judgePreflight(models?)` from `~/server/services/curator`; `claudeUsage()` from `~/server/services/claude-judge`.

- [ ] **Step 1: Replace each script's key check with the preflight**

In `scripts/ingest.ts`, replace the `if (!skipLlm && !process.env.OPENROUTER_API_KEY) {…}` block with:

```ts
// Fail fast, before any network calls: a curator call 800 items into a run is a much worse place
// to discover this than the first line of output. Which judge is asked depends on CURATOR_JUDGE
// (curator.ts's judgeModel): the OpenRouter key, or the Claude Code CLI.
const judgeProblem = skipLlm ? null : judgePreflight();
if (judgeProblem) {
  console.error(`${judgeProblem} (Or pass --skip-llm for a free dry run.)`);
  process.exit(1);
}
```

and add `judgeModel, judgePreflight` to the file's import from `~/server/services/curator`.

In `scripts/recurate.ts`, replace its `if (!process.env.OPENROUTER_API_KEY) {…}` block with:

```ts
const judgeProblem = judgePreflight();
if (judgeProblem) {
  console.error(judgeProblem);
  process.exit(1);
}
```

In `scripts/recurate-writing.ts`: change line 54 to `const model = flagValue("model") ?? judgeModel();`, replace the key check with the same block using `judgePreflight([model])`, and swap the `CURATOR_MODEL` import for `judgeModel, judgePreflight`.

In `scripts/writing-calibrate.ts`: move the `const models = …` line above the key check and replace the check with the same block using `judgePreflight(models)`.

In `scripts/walk-stats.ts`: add the same block (plain `judgePreflight()`) before its first network call, and the import.

- [ ] **Step 2: Print the judge and the subscription's usage in the ingest summary**

In `scripts/ingest.ts`, import `claudeUsage` from `~/server/services/claude-judge`, and add near the top-level helpers:

```ts
/**
 * "claude-haiku-4-5-20251001 · five-hour 23% → 31% · seven-day 22% → 24%": which judge scored this
 * run, and — for the Claude judge — how much of each subscription window the run moved. The
 * pair is the only measure there is of what an ingest costs against Ben's weekly limit, since
 * nothing is billed. Empty windows (an all-cache-hit run made no call) print the model alone.
 */
function judgeLine(): string {
  const usage = claudeUsage();
  const windows = usage
    ? Object.keys(usage.last.unifiedWindows ?? {}).map((name) => {
        const pct = (info: typeof usage.first) =>
          `${Math.round((info.unifiedWindows?.[name]?.utilization ?? 0) * 100)}%`;
        return `${name} ${pct(usage.first)} → ${pct(usage.last)}`;
      })
    : [];
  return [judgeModel(), ...windows].join(" · ");
}
```

Directly after the `console.log` that prints the `curated:` line in the summary, add (skipped under `--skip-llm`):

```ts
  if (!skipLlm) console.log(`judge:                    ${judgeLine()}`);
```

Match the alignment of the neighbouring lines. In the `main().catch` handler, after the `ingest aborted:` line, add `if (!skipLlm) console.error(`judge: ${judgeLine()}`);` so a ceiling stop shows where the windows stood.

- [ ] **Step 3: Document the settings**

`.env.example`, after the `OPENROUTER_API_KEY=` line:

```
# Which judge the curator uses (docs/DESIGN_claude-judge-ingest.md). "openrouter" (default) is
# gemini-2.5-flash-lite on the key above. "claude" is Haiku 4.5 through the Claude Code CLI on
# the machine's logged-in subscription: no key, no bill, but it shares the subscription's limits.
CURATOR_JUDGE=
# Claude judge only: stop a run when a subscription window (five-hour or seven-day) is this
# full, leaving the rest for interactive sessions. A fraction; default 0.8.
CLAUDE_JUDGE_MAX_UTILIZATION=
```

`src/env.js`: beside `OPENROUTER_API_KEY` in the server schema add

```js
    CURATOR_JUDGE: z.enum(["openrouter", "claude"]).optional(),
    CLAUDE_JUDGE_MAX_UTILIZATION: z.coerce.number().gt(0).max(1).optional(),
```

and beside it in `runtimeEnv` add `CURATOR_JUDGE: process.env.CURATOR_JUDGE,` and `CLAUDE_JUDGE_MAX_UTILIZATION: process.env.CLAUDE_JUDGE_MAX_UTILIZATION,`. If `env.js` treats empty strings as undefined (look for `emptyStringAsUndefined: true`), nothing more is needed; if it does not, the empty lines in `.env.example` would fail the enum, so leave those two lines commented out in `.env.example` instead.

- [ ] **Step 4: Verify by running**

```bash
env -u OPENROUTER_API_KEY bun run ingest --source met --topic astronomy --quota 3 --dry-run 2>&1 | head -5
CURATOR_JUDGE=nonsense bun run ingest --quota 1 --dry-run 2>&1 | head -5
CURATOR_JUDGE=claude bun run ingest --source met --topic astronomy --quota 3 --dry-run 2>&1 | tail -25
```

Expected, in order: the OpenRouter-key sentence and exit 1 — unless `.env` holds a key, in which case the run proceeds, which is also correct; a `CURATOR_JUDGE must be "openrouter" or "claude"` error; a dry run whose summary ends with a `judge:` line naming `claude-haiku-4-5-20251001` and both windows, with no row written. Note the count of image-fetch failures in that summary: it should be 0 for `met`.

Then `bun run check`. Expected: typecheck, lint, format and the whole unit suite green.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest.ts scripts/recurate.ts scripts/recurate-writing.ts scripts/writing-calibrate.ts scripts/walk-stats.ts .env.example src/env.js
git commit -m "feat(ingest): CURATOR_JUDGE picks the judge; the summary prints the subscription's usage"
```

---

### Task 5: The writing gate — Haiku against Ben's marks

No code. This task produces a number and a decision that is **Ben's**.

**Files:**
- Modify: `docs/writing-calibration.md` (rewritten by the script, Ben's marks carried over)
- Modify: `log.md`

- [ ] **Step 1: Re-score the forty marked pieces under both judges**

```bash
git diff --stat docs/writing-calibration.md   # must be clean before the script rewrites it
bun run writing:calibrate --rescore --models google/gemini-2.5-flash-lite,claude-haiku-4-5-20251001
```

The flash-lite column needs `OPENROUTER_API_KEY` in `.env` and costs cents at most (cached answers are free). Expected: `wrote 40 pieces to docs/writing-calibration.md`. Check with `git diff docs/writing-calibration.md` that every `ben-score` line survived.

- [ ] **Step 2: Read the agreement**

```bash
bun run writing:calibrate --read
```

Record, per model: marked count, MAE, Spearman, and the five worst. The reference is flash-lite v1's MAE 0.90 overall (Wikipedia 0.67, PDR 0.29, Loupe 1.71; Loupe's OCR fragments are a known outlier).

- [ ] **Step 3: Apply the gate**

- **Pass:** Haiku's MAE is no more than 0.15 above flash-lite's on this same run. Go to Step 5.
- **Otherwise** try the two levers, each a new column, no code: `--models google/gemini-2.5-flash-lite,claude-haiku-4-5-20251001,claude-haiku-4-5-20251001+think`, then with `claude-sonnet-5-5` in place of the `+think` entry. Report all columns.
- **Do not edit `WRITING_PROMPT`** to make Haiku agree. That is a separate decision with a cache cost; raise it with Ben instead.

- [ ] **Step 4: If nothing passes, stop here** and report the table to Ben. Tasks 6 and 7 still run only on his word.

- [ ] **Step 5: Log and commit**

Extend today's `log.md` entry (or start one, format in CLAUDE.md) with the table and the verdict, then:

```bash
git add docs/writing-calibration.md log.md
git commit -m "docs: writing calibration — Haiku beside flash-lite against Ben's marks"
```

---

### Task 6: The vision gate — `vision:compare`

**Files:**
- Create: `src/server/services/vision-comparison.ts`
- Create: `src/server/services/vision-comparison.test.ts`
- Create: `scripts/vision-compare.ts`
- Modify: `package.json` (scripts: add `"vision:compare": "bun run scripts/vision-compare.ts"` after `writing:calibrate`)

**Interfaces:**
- Consumes: `spearman`, `stratifiedSample` from `~/server/services/writing-calibration`; `curateItems`, `judgeModel`, `judgePreflight` from `~/server/services/curator`; `claudeUsage` from `~/server/services/claude-judge`; `isClaudeModel`.
- Produces: `visionReport(pairs: VisionPair[]): VisionReport`, `renderVision(report, meta): string`.

- [ ] **Step 1: Write the failing test**

`src/server/services/vision-comparison.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { renderVision, visionReport, type VisionPair } from "./vision-comparison";

const pair = (source: string, old: number, next: number, n = 0): VisionPair => ({
  itemId: `${source}-${old}-${next}-${n}`,
  source,
  title: `${source} ${n}`,
  old,
  next,
});

describe("visionReport", () => {
  const pairs = [
    pair("met", 8, 8),
    pair("met", 6, 7),
    pair("met", 9, 6),
    pair("loc", 4, 5),
    pair("loc", 7, 7),
  ];
  const report = visionReport(pairs);

  it("summarises the whole sample", () => {
    expect(report.n).toBe(5);
    expect(report.meanOld).toBeCloseTo(6.8);
    expect(report.meanNew).toBeCloseTo(6.6);
    expect(report.mae).toBeCloseTo(1.0);
    expect(report.within1).toBeCloseTo(0.8);
    expect(report.top8Old).toBeCloseTo(0.4);
    expect(report.top8New).toBeCloseTo(0.2);
  });
  it("breaks the shift down by source, largest shift first", () => {
    expect(report.perSource.map((r) => r.source)).toEqual(["met", "loc"]);
    expect(report.perSource[0]).toMatchObject({ n: 3, shift: -2 / 3 });
    expect(report.perSource[1]?.shift).toBeCloseTo(0.5);
  });
  it("lists the largest disagreements first", () => {
    expect(report.worst[0]).toMatchObject({ source: "met", old: 9, next: 6 });
  });
  it("is empty-safe", () => {
    expect(visionReport([]).n).toBe(0);
  });
});

describe("renderVision", () => {
  it("writes a table per source and a link per disagreement", () => {
    const md = renderVision(visionReport([pair("met", 9, 6)]), {
      model: "claude-haiku-4-5-20251001",
      excluded: 2,
      date: "10-02-26",
    });
    expect(md).toContain("| met ");
    expect(md).toContain("http://localhost:3000/i/met-9-6-0");
    expect(md).toContain("2 excluded");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/server/services/vision-comparison.test.ts`
Expected: FAIL — cannot resolve `./vision-comparison`.

- [ ] **Step 3: Implement the pure module**

`src/server/services/vision-comparison.ts`:

```ts
// How a new vision judge is accepted (docs/DESIGN_claude-judge-ingest.md D8): the pure half of
// `bun run vision:compare`. Writing has Ben's forty marks to calibrate against; pictures have
// none. What they have is ~170,000 scores from the judge Ben has been reading the feed through
// for two months, so a new judge is compared with *that*: does it rank pictures the same way,
// does it shift a source's average, and where it disagrees most, who is right? The last question
// is Ben's, and the report ends with the twenty pictures to look at.

import { spearman } from "./writing-calibration";

export type VisionPair = {
  itemId: string;
  source: string;
  title: string;
  /** The stored score, from the judge that ingested it. */
  old: number;
  /** The new judge's score for the same picture. */
  next: number;
};

export type VisionReport = {
  n: number;
  meanOld: number;
  meanNew: number;
  /** Mean absolute difference. */
  mae: number;
  spearman: number;
  /** Share of pictures the two judges put within one point of each other. */
  within1: number;
  /** Share scoring 8 or more under each judge — the band the landing reel and re-curation read. */
  top8Old: number;
  top8New: number;
  perSource: { source: string; n: number; shift: number; mae: number }[];
  worst: VisionPair[];
};

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

export function visionReport(pairs: readonly VisionPair[]): VisionReport {
  const share = (test: (p: VisionPair) => boolean) =>
    pairs.length ? pairs.filter(test).length / pairs.length : 0;
  const sources = [...new Set(pairs.map((p) => p.source))];
  return {
    n: pairs.length,
    meanOld: mean(pairs.map((p) => p.old)),
    meanNew: mean(pairs.map((p) => p.next)),
    mae: mean(pairs.map((p) => Math.abs(p.next - p.old))),
    spearman: spearman(
      pairs.map((p) => p.old),
      pairs.map((p) => p.next),
    ),
    within1: share((p) => Math.abs(p.next - p.old) <= 1),
    top8Old: share((p) => p.old >= 8),
    top8New: share((p) => p.next >= 8),
    perSource: sources
      .map((source) => {
        const own = pairs.filter((p) => p.source === source);
        return {
          source,
          n: own.length,
          shift: mean(own.map((p) => p.next - p.old)),
          mae: mean(own.map((p) => Math.abs(p.next - p.old))),
        };
      })
      .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift)),
    worst: [...pairs]
      .sort((a, b) => Math.abs(b.next - b.old) - Math.abs(a.next - a.old))
      .slice(0, 20),
  };
}

export function renderVision(
  report: VisionReport,
  meta: { model: string; excluded: number; date: string },
): string {
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—");
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return [
    `# Vision comparison — ${meta.model} against the stored scores (${meta.date})`,
    "",
    `${report.n} pictures compared, ${meta.excluded} excluded (image not fetched, or the judgment failed).`,
    "",
    `- mean score: stored ${f(report.meanOld)} → new ${f(report.meanNew)}`,
    `- mean absolute difference: ${f(report.mae)}`,
    `- Spearman rank agreement: ${f(report.spearman)}`,
    `- within one point: ${pct(report.within1)}`,
    `- scoring 8 or more: stored ${pct(report.top8Old)} → new ${pct(report.top8New)}`,
    "",
    "Proposed bar (D8): Spearman ≥ 0.60, mean shift within ±0.5, no source shifting more than 1.0. The verdict is Ben's.",
    "",
    "## By source (largest shift first)",
    "",
    "| source | n | shift | MAE |",
    "| --- | --- | --- | --- |",
    ...report.perSource.map(
      (r) => `| ${r.source} | ${r.n} | ${r.shift >= 0 ? "+" : ""}${f(r.shift)} | ${f(r.mae)} |`,
    ),
    "",
    "## The largest disagreements — look at these",
    "",
    ...report.worst.map(
      (p) =>
        `- stored **${p.old}**, new **${p.next}** — ${p.source}: [${p.title.slice(0, 70)}](http://localhost:3000/i/${p.itemId})`,
    ),
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/server/services/vision-comparison.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the script**

`scripts/vision-compare.ts`:

```ts
#!/usr/bin/env bun
/**
 * Compare a new vision judge with the scores already in the database
 * (docs/DESIGN_claude-judge-ingest.md D8). **The gate before the Claude judge scores pictures
 * for real.**
 *
 *   CURATOR_JUDGE=claude bun run vision:compare --sample 300
 *
 * Draws a sample of stored pictures — sources take turns, and within a source its score bands
 * take turns (writing-calibration.ts's stratifiedSample) — scores each under the current judge,
 * and writes docs/vision-comparison.md: the shift per source, the rank agreement, and the twenty
 * largest disagreements as links for Ben to look at. Writes nothing to the database.
 *
 * Every picture goes through classify mode, the walk lane's prompt: it is the curator prompt plus
 * the topic list, and its answers land in the same cache namespace a later walk reads, so the
 * walk-source half of this sample is never judged twice. Loupe is left out: its images are
 * bearer-gated and its corpus is Ben's own.
 *
 * Flags: --sample <n> (required), --seed <s> (default "vision-comparison"),
 * --file <path> (default docs/vision-comparison.md).
 */
import { writeFile } from "node:fs/promises";

import { and, eq, ne } from "drizzle-orm";

import { isClassifiable } from "~/server/config/topics";
import { db } from "~/server/db/client";
import { item, topic } from "~/server/db/schema";
import { claudeUsage } from "~/server/services/claude-judge";
import {
  curateItems,
  judgeModel,
  judgePreflight,
} from "~/server/services/curator";
import { hashSeed, mulberry32 } from "~/server/services/random";
import type { NormalizedItem } from "~/server/services/sources/types";
import {
  renderVision,
  visionReport,
  type VisionPair,
} from "~/server/services/vision-comparison";
import { stratifiedSample } from "~/server/services/writing-calibration";

const args = process.argv.slice(2);
function flagValue(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx > -1 ? args[idx + 1] : undefined;
}
const n = Number(flagValue("sample"));
const file = flagValue("file") ?? "docs/vision-comparison.md";
const seed = flagValue("seed") ?? "vision-comparison";
if (!(n > 0)) {
  console.error("usage: vision:compare --sample <n>");
  process.exit(1);
}
const problem = judgePreflight();
if (problem) {
  console.error(problem);
  process.exit(1);
}

// A narrow projection: this is ~170,000 rows, and their bodies and summaries are not needed to
// choose a sample. Ordered, so the seeded shuffle starts from the same sequence every run.
const pictures = await db
  .select({
    id: item.id,
    source: item.source,
    sourceId: item.sourceId,
    curationScore: item.curationScore,
  })
  .from(item)
  .where(and(eq(item.type, "image"), ne(item.source, "loupe")))
  .orderBy(item.source, item.sourceId);
const chosen = stratifiedSample(pictures, n, mulberry32(hashSeed(seed)));

const rows = new Map<string, typeof item.$inferSelect>();
for (const picked of chosen) {
  const [row] = await db.select().from(item).where(eq(item.id, picked.id));
  if (row) rows.set(row.id, row);
}
const sample = chosen.flatMap((c) => rows.get(c.id) ?? []);
const vocabulary = (await db.select().from(topic)).filter(isClassifiable);

const normalized: NormalizedItem[] = sample.map((row) => ({
  source: row.source as NormalizedItem["source"],
  sourceId: row.sourceId,
  type: row.type,
  title: row.title,
  summary: row.summary ?? "",
  body: row.body,
  imageUrl: row.imageUrl,
  sourceUrl: row.sourceUrl,
  attribution: row.attribution ?? "",
  license: row.license ?? "",
  tags: row.tags,
}));

console.log(`scoring ${sample.length} pictures with ${judgeModel()}…`);
const unseen = new Set<string>();
const curated = await curateItems(normalized, {
  classify: true,
  topics: vocabulary,
  onImageFetchFailure: (it) => unseen.add(`${it.source}:${it.sourceId}`),
  onProgress: (done, total) => {
    if (done % 25 === 0 || done === total) console.log(`  ${done}/${total}`);
  },
});

// Two kinds of answer are not a comparison of judges and are left out: a picture the curator
// could not fetch (judged from its caption), and curateItems' gave-up fallback (score 5, no tags).
const pairs: VisionPair[] = [];
sample.forEach((row, i) => {
  const answer = curated[i];
  if (!answer) return;
  if (unseen.has(`${row.source}:${row.sourceId}`)) return;
  if (answer.curationScore === 5 && answer.aestheticTags.length === 0) return;
  pairs.push({
    itemId: row.id,
    source: row.source,
    title: row.title,
    old: row.curationScore,
    next: answer.curationScore,
  });
});

const now = new Date();
const date = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getFullYear()).slice(2)}`;
await writeFile(
  file,
  renderVision(visionReport(pairs), {
    model: judgeModel(),
    excluded: sample.length - pairs.length,
    date,
  }),
);
console.log(`wrote ${pairs.length} comparisons to ${file}`);
const usage = claudeUsage();
if (usage)
  console.log(
    `subscription: ${JSON.stringify(usage.first.unifiedWindows)} → ${JSON.stringify(usage.last.unifiedWindows)}`,
  );
process.exit(0);
```

Add the `vision:compare` line to `package.json`. Run `bun run typecheck && bun run lint && bun run format:check`; fix what they report (the item `type` column and `tags` nullability may need the same handling `scripts/writing-calibrate.ts` uses — copy its shape).

- [ ] **Step 6: Smoke, then the real sample**

```bash
CURATOR_JUDGE=claude bun run vision:compare --sample 12 --file /tmp/vision-smoke.md && cat /tmp/vision-smoke.md
```

Expected: 12 or fewer comparisons, few exclusions. If most are excluded, pictures are not reaching the model — read the per-item `curator:` warnings before going on.

```bash
CURATOR_JUDGE=claude bun run vision:compare --sample 300
```

Expected: roughly ten minutes at four workers; `docs/vision-comparison.md` written; a `subscription:` line. **Write down the seven-day movement for 300 pictures** — it is the first measure of what a picture costs against the weekly limit (D4).

- [ ] **Step 7: Hand the report to Ben, and stop**

The verdict needs his eye on the twenty links (dev server on port 3000; `lsof -ti:3000` first, per CLAUDE.md). Report the headline numbers against the proposed bar and say plainly whether they clear it. Do not start Task 7 before he answers.

- [ ] **Step 8: Commit**

```bash
git add src/server/services/vision-comparison.ts src/server/services/vision-comparison.test.ts scripts/vision-compare.ts package.json docs/vision-comparison.md
git commit -m "feat(curator): vision:compare — a new picture judge against the stored scores"
```

---

### Task 7: The first big run, and the closing docs

Runs only after Ben has accepted Task 5's result (and Task 6's, though the publications are writing). Local database only. The seven publications **stay in `SUSPENDED_SOURCES`** (D9); an explicit `--source` runs a suspended source anyway and prints a note saying so.

**Files:**
- Modify: `log.md`, `CLAUDE.md` (Repository status), `SPEC.md` §6.2, `docs/HANDOFF_claude-judge-ingest.md` (a "Status" line at the top)

- [ ] **Step 1: One small publication first**

```bash
CURATOR_JUDGE=claude bun run ingest --source theparisreview --backfill
```

Expected: about ten pieces written, exit 0, a `judge:` line. Then one mid-sized run:

```bash
CURATOR_JUDGE=claude bun run ingest --source psyche --backfill 2>&1 | tee .cache/judge-psyche.log
```

Expected: about 1,000 pieces. From the `judge:` line compute seven-day movement per 1,000 pieces, and from it the projected movement for the remaining ~9,750. **If the projection would take the seven-day window past 60%, stop and tell Ben** before running the rest; he may want them spread over two weeks.

- [ ] **Step 2: The rest, one at a time, a verdict's worth of reading between each**

```bash
for s in themarginalian jstordaily noema aeon longreads; do
  CURATOR_JUDGE=claude bun run ingest --source "$s" --backfill 2>&1 | tee ".cache/judge-$s.log" || break
done
```

A stop at the ceiling is exit 1 with `Claude judge stopped: … resets <time>`. That is the designed behaviour: nothing was written for that source, every judgment is cached, and re-running the same command after the reset resumes free. Do not raise `CLAUDE_JUDGE_MAX_UTILIZATION` to push through; that fifth of the subscription is Ben's.

- [ ] **Step 3: Read the result**

For each source: `bun run stats:walk --source <id>` (free on a second run, all cache hits) for the score distribution, and the un-homed count and tag histogram from its ingest summary. Record per source: pieces written, mean score, share ≥ 8, un-homed.

- [ ] **Step 4: Write it down**

- `log.md`: today's entry — what shipped, the writing and vision gate numbers, the measured cost against the weekly limit (per 1,000 pieces, per 300 pictures), each publication's result, and **Open / next**: the piece 2/3 plan (split, host), the re-score decision (D4) now that drift and cost are measured, the Max-terms check. End with the session-spend line (`python3 ~/.claude/scripts/session-spend.py --session <uuid>`, pasted verbatim; omit if it exits non-zero).
- `CLAUDE.md`, Repository status: one sentence — the Claude judge exists, `CURATOR_JUDGE=claude`, production still on OpenRouter, publications scored locally under Haiku and still suspended, pointer to the design doc. Under Local dev environment, one bullet: an exported `ANTHROPIC_API_KEY` is stripped from the judge's child process on purpose, and `claude -p` usage counts against the subscription's shared limits.
- `SPEC.md` §6.2: the curator has two transports chosen by model name; the cache key includes the model; the ceiling rule.
- `docs/HANDOFF_claude-judge-ingest.md`: a first line `**Status (date):** piece 1 built — see docs/DESIGN_claude-judge-ingest.md and docs/PLAN_claude-judge.md; pieces 2–3 not planned yet.`

- [ ] **Step 5: Final check and commit**

```bash
bun run check
git add log.md CLAUDE.md SPEC.md docs/HANDOFF_claude-judge-ingest.md
git commit -m "docs: the Claude judge — gates, first big run, what it costs against the weekly limit"
```

Expected: `check` green. Do not push or merge; Ben does both.
