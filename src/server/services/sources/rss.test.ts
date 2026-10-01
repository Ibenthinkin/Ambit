// The RSS/Atom walker (writing Phase 5, docs/PLAN_writing.md): the pure `parseFeed` against two
// real feeds recorded 09-30-26 (trimmed to a few items, `content:encoded` cut at 6,000
// characters), and `toItem`'s projection of them. The network half — robots, paging, the 500 ms
// pace — is `bun run probe:walk`'s, per the no-live-HTTP-in-unit-tests convention.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PUBLICATION_LICENSE,
  publicationConfig,
} from "~/server/config/publications";
import { dekFrom, nextPage, parseFeed, rssWalker, type RssSource } from "./rss";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

const noemaXml = fixture("rss-noema.xml");
const atlasXml = fixture("rss-atlasobscura.xml");

describe("parseFeed — RSS 2.0", () => {
  it("reads every item, and none of the channel's own fields", () => {
    const entries = parseFeed(noemaXml);
    expect(entries.map((e) => e.link)).toEqual([
      "https://www.noemamag.com/noemas-ai-reading-list",
      "https://www.noemamag.com/now-entering-the-era-of-bleh",
      "https://www.noemamag.com/let-the-people-decide-the-pace-of-frontier-ai",
    ]);
  });

  it("decodes the title's entities and unwraps CDATA", () => {
    const [first] = parseFeed(noemaXml);
    expect(first!.title).toBe("Noema’s AI Reading List");
    expect(first!.content).toMatch(/^\s*<p/);
    expect(first!.description).toMatch(/appeared first on/);
  });

  it("finds the picture in media:thumbnail, with its &amp; decoded", () => {
    const [first] = parseFeed(noemaXml);
    expect(first!.imageUrl).toMatch(
      /^https:\/\/noemamag\.imgix\.net\/.+&ixlib=/,
    );
  });

  it("falls back to the first <img> in the description when there is no media element", () => {
    const [first] = parseFeed(atlasXml);
    expect(first!.content).toBeUndefined();
    expect(first!.imageUrl).toMatch(/^https:\/\/img\.atlasobscura\.com\//);
  });
});

describe("parseFeed — Atom", () => {
  const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>A feed</title>
  <link href="https://example.org/" rel="alternate"/>
  <entry>
    <title type="html">Salt &amp; light</title>
    <link rel="alternate" type="text/html" href="https://example.org/essays/salt"/>
    <id>tag:example.org,2026:salt</id>
    <summary type="html">&lt;p&gt;On salt.&lt;/p&gt;</summary>
    <content type="html"><![CDATA[<p><img src="https://example.org/salt.jpg"/>The whole essay.</p>]]></content>
    <category term="Food"/>
  </entry>
</feed>`;

  it("reads an entry's alternate link, summary, content and categories", () => {
    expect(parseFeed(atom)).toEqual([
      {
        title: "Salt & light",
        link: "https://example.org/essays/salt",
        description: "<p>On salt.</p>",
        content:
          '<p><img src="https://example.org/salt.jpg"/>The whole essay.</p>',
        categories: ["Food"],
        imageUrl: "https://example.org/salt.jpg",
      },
    ]);
  });
});

describe("dekFrom", () => {
  const opening =
    "The opening paragraph of the piece, long enough to be the piece and not a kicker above it.";

  it("strips WordPress's 'appeared first on' footer, and falls back to the first paragraph", () => {
    const dek = dekFrom(
      '<p>The post <a href="https://x.test/a">A</a> appeared first on <a href="https://x.test">X</a>.</p>',
      `<p>A kicker.</p><p>${opening}</p><p>The second.</p>`,
    );
    // The kicker is under OPENING's 80 characters, so the dek is the first real paragraph.
    expect(dek).toBe(opening);
  });

  it("keeps a real description, without the footer after it", () => {
    expect(
      dekFrom(
        '<p>A real dek.</p><p>The post <a href="u">A</a> appeared first on <a href="v">X</a>.</p>',
        undefined,
      ),
    ).toBe("A real dek.");
  });

  it("caps a long dek at 600 characters", () => {
    expect(
      dekFrom(`<p>${"word ".repeat(400)}</p>`, undefined).length,
    ).toBeLessThanOrEqual(601);
  });
});

describe("rssWalker.toItem", () => {
  const noema = rssWalker(publicationConfig("noema") as RssSource);

  it("makes a link card of writing: no body, the full text for the curator only", () => {
    for (const entry of parseFeed(noemaXml)) {
      const item = noema.toItem(entry);
      expect(item.type).toBe("article");
      expect(item.body).toBeNull();
      expect(item.curationText!.length).toBeGreaterThan(1_000);
      expect(item.curationText).not.toMatch(/<\/?[a-z]/i);
    }
  });

  it("names the piece by its path, credits the publication, and links to it", () => {
    const item = noema.toItem(parseFeed(noemaXml)[1]!);
    expect(item).toMatchObject({
      source: "noema",
      sourceId: "now-entering-the-era-of-bleh",
      sourceUrl: "https://www.noemamag.com/now-entering-the-era-of-bleh",
      attribution: "Noema",
      license: PUBLICATION_LICENSE,
    });
    // Noema's description is only the footer, so the dek is the piece's opening.
    expect(item.summary).not.toMatch(/appeared first on/);
    expect(item.summary.length).toBeGreaterThan(40);
  });

  it("gives a dek-only feed no curationText", () => {
    const atlas = rssWalker({
      id: "noema",
      label: "Atlas Obscura",
      baseUrl: "https://www.atlasobscura.com",
      license: PUBLICATION_LICENSE,
      feedUrl: "https://www.atlasobscura.com/feeds/latest",
      fullText: "none",
    });
    const item = atlas.toItem(parseFeed(atlasXml)[0]!);
    expect(item.curationText).toBeUndefined();
    expect(item.summary.length).toBeLessThanOrEqual(601);
  });
});

describe("nextPage", () => {
  it("advances a paged feed while pages have items, and stops on an empty one", () => {
    expect(nextPage("wp", 1, 10)).toBe("2");
    expect(nextPage("wp", 7, 0)).toBeUndefined();
  });

  it("never advances an unpaged feed: it is its newest page", () => {
    expect(nextPage(undefined, 1, 27)).toBeUndefined();
  });
});
