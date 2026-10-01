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
