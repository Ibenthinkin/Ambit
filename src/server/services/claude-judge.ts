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
