// The etiquette rule as code (docs/PHASE6_DESIGN_6.3.md §8): a site that machine-readably refuses
// crawlers is not walked. Two real robots.txt files, recorded 08-25-26, are the fixtures — one
// that admits everyone and one that refuses everyone — plus the named-agent case.
import { describe, expect, it } from "vitest";

import { robotsDisallowsAll } from "./robots";

const DOP = `User-agent: *
Disallow: /wp-content/uploads/wpo/wpo-plugins-tables-list.json

# START YOAST BLOCK
# ---------------------------
User-agent: *
Disallow:

Sitemap: https://doorofperception.com/sitemap_index.xml
# ---------------------------
# END YOAST BLOCK
`;

const FIFTY_WATTS = `User-agent: OAI-SearchBot
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Crawl-delay: 2

User-agent: *
Disallow: /
`;

describe("robotsDisallowsAll", () => {
  it("admits a site whose wildcard group only disallows specific paths", () => {
    expect(robotsDisallowsAll(DOP, "Ambit")).toBe(false);
  });

  it("refuses a site whose wildcard group disallows the root", () => {
    expect(robotsDisallowsAll(FIFTY_WATTS, "Ambit")).toBe(true);
  });

  it("refuses when OUR agent is named with a root disallow, even if * is open", () => {
    const txt = `User-agent: Ambit\nDisallow: /\n\nUser-agent: *\nDisallow:\n`;
    expect(robotsDisallowsAll(txt, "Ambit")).toBe(true);
  });

  it("admits when only OTHER agents are refused", () => {
    const txt = `User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n`;
    expect(robotsDisallowsAll(txt, "Ambit")).toBe(false);
  });

  it("admits an empty or missing file", () => {
    expect(robotsDisallowsAll("", "Ambit")).toBe(false);
  });
});
