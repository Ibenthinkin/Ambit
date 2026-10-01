import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PUBLICATION_LICENSE,
  publicationConfig,
} from "~/server/config/publications";
import {
  nextOffset,
  parseArticlePage,
  parseSitemap,
  selectArticles,
  sitemapWalker,
  type SitemapSource,
} from "./sitemap";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

// Recorded 10-01-26 and trimmed to the page's <head> metadata, its JSON-LD and its <main>.
const aeonSitemap = fixture("sitemap-aeon.xml");
const aeonEssay = fixture("sitemap-aeon-essay.html");
const aeonVideo = fixture("sitemap-aeon-video.html");
const psycheIdea = fixture("sitemap-psyche-idea.html");
const psycheGuide = fixture("sitemap-psyche-guide.html");

const aeon = publicationConfig("aeon") as SitemapSource;

describe("parseSitemap", () => {
  it("reads every <url>, its lastmod and its image", () => {
    const entries = parseSitemap(aeonSitemap);
    expect(entries).toHaveLength(11);
    const cancer = entries.find((e) => e.loc.includes("called-cancer"))!;
    expect(cancer.lastmod).toBe("2026-09-29T10:00:00Z");
    // Entity-decoded: the &amp; in the query string is a real &.
    expect(cancer.image).toMatch(
      /^https:\/\/images\.aeonmedia\.co\/.+\?top=126&left=0/,
    );
  });
});

describe("selectArticles", () => {
  const picked = selectArticles(parseSitemap(aeonSitemap), aeon);

  it("keeps pieces under the writing sections — never videos, hubs or a section's own index", () => {
    const paths = picked.map((e) => new URL(e.loc).pathname);
    expect(
      paths.every((p) => /^\/(essays|ideas|classics)\/[^/]+$/.test(p)),
    ).toBe(true);
    expect(paths).toHaveLength(7);
  });

  it("orders newest first", () => {
    expect(picked[0]!.loc).toContain("called-cancer");
    const dates = picked.map((e) => e.lastmod ?? "");
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("refuses another host and drops a repeated path", () => {
    const entries = [
      { loc: "https://example.com/essays/x" },
      { loc: "https://aeon.co/essays/y" },
      { loc: "https://aeon.co/essays/y" },
    ];
    expect(selectArticles(entries, aeon).map((e) => e.loc)).toEqual([
      "https://aeon.co/essays/y",
    ]);
  });
});

describe("parseArticlePage", () => {
  it("reads the display title, the dek, the picture and the section tags", () => {
    const page = parseArticlePage(aeonEssay);
    expect(page.isArticle).toBe(true);
    // The <h1>, not the longer SEO headline.
    expect(page.title).toBe("Don’t use the ‘C-word’");
    expect(page.dek).toMatch(/^A cancer diagnosis carries with it fear/);
    expect(page.imageUrl).toMatch(/^https:\/\/images\.aeonmedia\.co\//);
    expect(page.tags).toEqual(["science", "illness and disease", "essays"]);
  });

  it("reads the piece's text from <main>, as plain text, without bylines and credits", () => {
    const page = parseArticlePage(aeonEssay);
    expect(page.text.length).toBeGreaterThan(20_000);
    expect(page.text).not.toMatch(/<\/?[a-z]/i);
    expect(page.text).not.toMatch(/^by /);
  });

  it("reads Psyche the same way (same publisher, same build)", () => {
    for (const html of [psycheIdea, psycheGuide]) {
      const page = parseArticlePage(html);
      expect(page.isArticle).toBe(true);
      expect(page.title.length).toBeGreaterThan(5);
      expect(page.dek.length).toBeGreaterThan(40);
      expect(page.text.length).toBeGreaterThan(5_000);
    }
    expect(parseArticlePage(psycheGuide).title).toBe("How to foster ‘shoshin’");
  });

  it("knows a video page is not an article", () => {
    expect(parseArticlePage(aeonVideo).isArticle).toBe(false);
  });
});

describe("sitemapWalker.toItem", () => {
  const walker = sitemapWalker(aeon);
  const url =
    "https://aeon.co/essays/we-need-a-better-way-to-describe-what-is-often-called-cancer";

  it("makes a link card of writing: the dek shown, the text for the curator only", () => {
    const item = walker.toItem({ url, ...parseArticlePage(aeonEssay) });
    expect(item).toMatchObject({
      source: "aeon",
      sourceId:
        "essays/we-need-a-better-way-to-describe-what-is-often-called-cancer",
      type: "article",
      body: null,
      sourceUrl: url,
      attribution: "Aeon",
      license: PUBLICATION_LICENSE,
    });
    expect(item.curationText!.length).toBeGreaterThan(20_000);
    expect(item.summary.length).toBeLessThanOrEqual(601);
  });

  it("falls back to the sitemap's picture when the page names none", () => {
    const page = { ...parseArticlePage(aeonEssay), imageUrl: undefined };
    const item = walker.toItem({
      url,
      sitemapImage: "https://images.aeonmedia.co/x.jpg",
      ...page,
    });
    expect(item.imageUrl).toBe("https://images.aeonmedia.co/x.jpg");
  });

  it("throws — so ingest counts it — on a video, a failed fetch, or another host", () => {
    expect(() =>
      walker.toItem({ url, ...parseArticlePage(aeonVideo) }),
    ).toThrow(/not an article/);
    expect(() => walker.toItem({ url, error: "HTTP 404" })).toThrow(/404/);
    expect(() =>
      walker.toItem({
        url: "https://example.com/essays/x",
        ...parseArticlePage(aeonEssay),
      }),
    ).toThrow(/off-site/);
  });
});

describe("nextOffset", () => {
  it("advances by what the page read, and stops at the end of the list", () => {
    expect(nextOffset(0, 20, 3_660)).toBe("20");
    expect(nextOffset(3_640, 20, 3_660)).toBeUndefined();
    expect(nextOffset(0, 0, 0)).toBeUndefined();
  });
});
