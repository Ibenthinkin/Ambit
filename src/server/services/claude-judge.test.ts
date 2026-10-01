// The Claude judge's pure half (docs/DESIGN_claude-judge-ingest.md). No process is spawned here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLAUDE_JUDGE_MODEL,
  claudeArgs,
  claudeComplete,
  claudeEnv,
  claudeModelSpec,
  claudeRuntime,
  claudeStdin,
  claudeUsage,
  isClaudeModel,
  limitVerdict,
  parseClaudeStream,
  resetClaudeJudge,
  runCli,
  stripFence,
} from "./claude-judge";
import { CuratorAbortError } from "./curator-errors";

/** The three lines a successful call prints, as captured 10-01-26 (trimmed to the fields read). */
export function stream(
  reply: string,
  utilization = { five: 0.23, seven: 0.22 },
) {
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
        {
          type: "image_url",
          image_url: { url: "data:image/jpeg;base64,QUJD" },
        },
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
    await expect(claudeComplete(req)).rejects.toThrow(
      /seven_day window is at 85%/,
    );
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
        rate_limit_info: {
          status: "rejected",
          rateLimitType: "seven_day",
          resetsAt: 1791183600,
        },
      }),
      JSON.stringify({
        type: "result",
        is_error: true,
        result: "limit reached",
      }),
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
    expect(claudeUsage()?.first.unifiedWindows?.seven_day?.utilization).toBe(
      0.2,
    );
    expect(claudeUsage()?.last.unifiedWindows?.seven_day?.utilization).toBe(
      0.25,
    );
  });
});

describe("runCli", () => {
  it("survives a child that exits without reading a large stdin (no uncaught EPIPE)", async () => {
    // A picture payload is far bigger than the 64 KB pipe buffer; `true` exits without reading.
    const run = await runCli("true", [], "x".repeat(2_000_000), {
      thinking: false,
    });
    expect(run.code).toBe(0);
  });
  it("rejects when the binary does not exist", async () => {
    await expect(
      runCli("/nonexistent/claude-cli", [], "x".repeat(2_000_000), {
        thinking: false,
      }),
    ).rejects.toThrow();
  });
});

describe("claudeComplete — the review's tripwires", () => {
  const realRun = claudeRuntime.run;
  const req = { model: CLAUDE_JUDGE_MODEL, system: "S", content: "hello" };
  beforeEach(() => resetClaudeJudge());
  afterEach(() => {
    claudeRuntime.run = realRun;
  });

  it("a stop is sticky: a slower call with an older, lower reading cannot clear it", async () => {
    const release: (() => void)[] = [];
    const readings = [
      { five: 0.3, seven: 0.85 },
      { five: 0.3, seven: 0.5 },
    ];
    claudeRuntime.run = () => {
      const reading = readings.shift()!;
      return new Promise((resolve) =>
        release.push(() =>
          resolve({ code: 0, stdout: stream("{}", reading), stderr: "" }),
        ),
      );
    };
    const a = claudeComplete(req);
    const b = claudeComplete(req);
    release[0]!();
    await a;
    release[1]!();
    await b;
    await expect(claudeComplete(req)).rejects.toBeInstanceOf(CuratorAbortError);
  });

  it("aborts when a successful call carries no usage report — the ceiling would be blind", async () => {
    claudeRuntime.run = () =>
      Promise.resolve({
        code: 0,
        stdout: JSON.stringify({
          type: "result",
          is_error: false,
          result: "{}",
        }),
        stderr: "",
      });
    await expect(claudeComplete(req)).rejects.toThrow(/no usage report/);
  });

  it("aborts when a call costs tens of thousands of tokens — the overhead is back", async () => {
    const heavy = stream("{}").replace(
      '"input_tokens":432',
      '"input_tokens":54000',
    );
    claudeRuntime.run = () =>
      Promise.resolve({ code: 0, stdout: heavy, stderr: "" });
    await expect(claudeComplete(req)).rejects.toThrow(/overhead/);
  });

  it("aborts at once on an authentication failure instead of retrying every item", async () => {
    claudeRuntime.run = () =>
      Promise.resolve({
        code: 1,
        stdout: JSON.stringify({
          type: "result",
          is_error: true,
          result: "Invalid API key · Please run /login",
        }),
        stderr: "",
      });
    await expect(claudeComplete(req)).rejects.toBeInstanceOf(CuratorAbortError);
  });
});
