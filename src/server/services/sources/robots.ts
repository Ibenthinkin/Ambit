// Scrape etiquette, enforced (docs/PHASE6_DESIGN_6.3.md §8). Every corpus walk starts here.
//
// The rule is deliberately narrow: a group for `*` or for our own agent name that contains
// `Disallow: /` (the root, exactly) means "do not crawl", and we don't. Path-level disallows are
// NOT interpreted — Ambit only ever reads a blog's public JSON/feed endpoints, so the honest
// question is "does this site refuse agents", not "which paths". A full robots parser would be
// more code pretending to more precision than the policy needs.
//
// Precedents this encodes: artvee (cut 08-20-26, an AI block list) and 50watts (cut 08-25-26,
// `User-agent: * / Disallow: /`). A site that says no in machine-readable form does not become a
// designated blog because its content is appealing.
import { USER_AGENT } from "./http";

/** The token robots.txt would name us by — the product name at the front of USER_AGENT. */
export const ROBOTS_AGENT_NAME = USER_AGENT.split("/")[0] ?? "Ambit";

/**
 * Pure: does this robots.txt refuse `agent` (or everyone) at the root?
 * Groups are "one or more User-agent lines, then directives, until a blank line".
 */
export function robotsDisallowsAll(robotsTxt: string, agent: string): boolean {
  const wanted = new Set(["*", agent.toLowerCase()]);
  let groupAgents: string[] = [];
  let inDirectives = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") {
      groupAgents = [];
      inDirectives = false;
      continue;
    }
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const k = key?.trim().toLowerCase();

    if (k === "user-agent") {
      // A User-agent line after directives starts a new group even without a blank line.
      if (inDirectives) groupAgents = [];
      groupAgents.push(value.toLowerCase());
      inDirectives = false;
    } else if (k === "disallow") {
      inDirectives = true;
      if (value === "/" && groupAgents.some((a) => wanted.has(a))) return true;
    } else {
      inDirectives = true;
    }
  }
  return false;
}

/**
 * Fetch `${baseUrl}/robots.txt` and throw if it refuses us. A missing file (404) or an
 * unreachable host is treated as "no policy" — the walk proceeds and its own requests will
 * succeed or fail on their merits. Plain fetch, not fetchJson: the body is text, and a retry loop
 * around a policy file is pointless.
 */
export async function assertCrawlAllowed(baseUrl: string): Promise<void> {
  let text = "";
  try {
    const res = await fetch(`${baseUrl}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (res.ok) text = await res.text();
  } catch {
    return;
  }
  if (robotsDisallowsAll(text, ROBOTS_AGENT_NAME)) {
    throw new Error(
      `${baseUrl}/robots.txt disallows crawling for "${ROBOTS_AGENT_NAME}" or "*" — walk aborted`,
    );
  }
}
