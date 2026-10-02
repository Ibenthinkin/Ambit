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
    expect(dockerfile).toMatch(
      /claude --version \| grep -F "\$CLAUDE_CODE_VERSION"/,
    );
  });
  it("turns the auto-updater off", () => {
    expect(dockerfile).toMatch(/^ENV DISABLE_AUTOUPDATER=1$/m);
  });
  it("installs curl and never removes it", () => {
    // Ben, 10-02-26: the ingest needs curl at run time, so it is a permanent part of the image.
    expect(dockerfile).toMatch(/apt-get install[^\n]*\bcurl\b/);
    expect(dockerfile).not.toMatch(/apt-get (purge|remove|autoremove)/);
  });
  it("never bakes a credential into the image", () => {
    // Instruction lines only: the Dockerfile's own comment names CLAUDE_CODE_OAUTH_TOKEN to say it
    // is a runtime variable, and a comment bakes nothing — an ARG, ENV or RUN would.
    const instructions = dockerfile
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    expect(instructions).not.toMatch(
      /CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY/,
    );
  });
});
