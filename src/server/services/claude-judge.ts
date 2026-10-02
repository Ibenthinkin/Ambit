// The Claude judge (docs/DESIGN_claude-judge-ingest.md): the curator's second transport, a
// headless Claude Code call on Ben's Max subscription instead of an OpenRouter chat completion.
//
// A bare `claude -p` carries ~54,000 tokens of Claude Code's own system prompt, tools, CLAUDE.md
// and memory around a one-line judgment (measured 10-01-26). The flags in claudeArgs strip all of
// it: the same call is 432 input tokens and about a second. Those tokens are not billed, but they
// count against the subscription's five-hour and seven-day limits, which Ben's own sessions share.

import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

import { CuratorAbortError } from "./curator-errors";

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

// ── the impure half ─────────────────────────────────────────────────────────

/** How many `claude` processes run at once. Each is a whole Node process, not a socket, so the
 *  pool is half the OpenRouter one (curator.ts's CONCURRENCY). */
export const CLAUDE_CONCURRENCY = 4;

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
  env: Record<string, string | undefined>,
  thinking: boolean,
): Record<string, string | undefined> {
  const child = { ...env };
  delete child.ANTHROPIC_API_KEY;
  delete child.ANTHROPIC_AUTH_TOKEN;
  if (!thinking) child.MAX_THINKING_TOKENS = "0";
  return child;
}

/**
 * Run a CLI once and collect what it printed. cwd is the temp dir, so no project's CLAUDE.md is
 * anywhere near it. The binary is a parameter only so the tests can point it at `true` and at a
 * path that does not exist; the judge always passes "claude".
 */
export function runCli(
  bin: string,
  args: string[],
  stdin: string,
  opts: { thinking: boolean },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: tmpdir(),
      // Next's types make NODE_ENV a required key of ProcessEnv; a copy of process.env has it.
      env: claudeEnv(process.env, opts.thinking) as NodeJS.ProcessEnv,
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
    // A child that exits without reading (logged out, a flag it rejects, a crash) breaks the
    // pipe under a picture-sized payload — bigger than the 64 KB pipe buffer — and an EPIPE with no
    // listener is an uncaught exception that kills the whole ingest. Swallowed here on purpose:
    // `close` (or `error`) still settles the promise with the real outcome.
    child.stdin.on("error", () => undefined);
    child.stdin.end(`${stdin}\n`);
  });
}

const spawnClaude: ClaudeRunner = (args, stdin, opts) =>
  runCli("claude", args, stdin, opts);

/** Swappable so tests never spawn a process: `claudeRuntime.run = fake`. */
export const claudeRuntime: { run: ClaudeRunner } = { run: spawnClaude };

// Process-wide state. `stop` is set by the call that crossed the ceiling and read by every call
// after it: the crossing call's own answer is good and is returned (the caller caches it), and
// the *next* call is the one that aborts. With four workers, at most four answers land after the
// ceiling. curateItems waits for them (Promise.allSettled) so each is cached before the abort
// leaves the batch. **Sticky**: once set it is never cleared by a later report — a slower call
// carries an *older* reading, and letting that reset the stop spent calls past the ceiling.
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

/** Why the judge has stopped, or null while it has not. judgePreflight reads it after its one
 *  small call, so a run that starts with a window already past the ceiling ends there instead
 *  of after a full walk. */
export function claudeStopReason(): string | null {
  return stop;
}

/**
 * The most tokens one judgment may plausibly cost: a 160-topic classify prompt, 8,000 characters
 * of text and a 1024 px picture come to well under ten thousand. Past this the stripping flags
 * have stopped working — an auto-updated CLI reading `--tools ""` as "unset", say — and every
 * call is carrying Claude Code's own ~54,000 tokens against the subscription.
 */
const MAX_PLAUSIBLE_TOKENS = 20_000;

/** What a logged-out or refused CLI says in its result (10-01-26: "Invalid API key · Please run
 *  /login"; the stream's error categories are `authentication_failed`, `oauth_org_not_allowed`). */
const AUTH_FAILURE =
  /\/login|log ?in|authenticat|oauth|invalid api key|unauthori[sz]ed/i;

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
    // `??=`: set once, never cleared (see `stop`).
    stop ??= limitVerdict(out.rateLimit, maxUtilization());
    // Refused outright: there is no answer to keep, so this call is the one that aborts.
    if (out.rateLimit.status === "rejected" && stop) throw abort(stop);
  }
  if (run.code !== 0 || out.isError || out.reply === null) {
    const detail = (out.reply ?? run.stderr).slice(0, 200);
    // An account-level failure, like OpenRouter's 401: no item will ever succeed, so stop the
    // run now instead of retrying every one of them four times.
    if (AUTH_FAILURE.test(detail)) {
      stop = `the Claude Code CLI is not logged in (${detail})`;
      throw abort(stop);
    }
    throw new Error(`claude -p failed (exit ${run.code}): ${detail}`);
  }
  // Two tripwires on a *successful* call, both for a CLI that has changed under us. Without a
  // usage report the ceiling is blind; with the overhead back, a run spends the subscription
  // a hundred times faster than it was measured to.
  if (!out.rateLimit) {
    stop = "a call carried no usage report, so the ceiling cannot be enforced";
    throw abort(stop);
  }
  if (out.tokens > MAX_PLAUSIBLE_TOKENS) {
    stop = `one judgment cost ${out.tokens} tokens — Claude Code's own overhead is no longer being stripped (check the flags in claudeArgs against \`claude --help\`)`;
    throw abort(stop);
  }
  return { reply: stripFence(out.reply), tokens: out.tokens };
}
