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
