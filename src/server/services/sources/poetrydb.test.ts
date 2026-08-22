// Fixture-based tests for the PoetryDB adapter — see __fixtures__/poetrydb.json, recorded live
// 08-21-26 off the `/lines/moon` search.
//
// The fixture is an object rather than the usual bare array, because this source has three
// distinct wire shapes worth pinning: `lineSearchHits` (what step one returns — title and author
// only), `poems` (what step two returns — hydrated, with lines), and `noMatch` (the JSON *object*
// PoetryDB answers a zero-result query with, at HTTP 200).
import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/poetrydb.json";
import {
  poetryHits,
  poetryPoemUrl,
  poetrySourceId,
  poetrydb,
  type PoetryRaw,
} from "./poetrydb";

const { poems, noMatch, lineSearchHits } = fixtures as unknown as {
  poems: PoetryRaw[];
  noMatch: unknown;
  lineSearchHits: PoetryRaw[];
};

const byTitle = (title: string) => {
  const found = poems.find((p) => p.title === title);
  if (!found) throw new Error(`fixture missing: ${title}`);
  return found;
};

describe("poetryHits", () => {
  it("reads the no-match object as an empty result, not an error", () => {
    // The trap this exists for: PoetryDB answers "found nothing" with
    // {status: 404, reason: "Not found"} at HTTP 200 — an object where the caller expects an
    // array. Treating it as an error would make an empty search look like an outage; treating it
    // as data would put `{status: 404}` in the corpus.
    expect(noMatch).toEqual({ status: 404, reason: "Not found" });
    expect(poetryHits(noMatch)).toEqual([]);
  });

  it("passes a real result array through", () => {
    expect(poetryHits(lineSearchHits)).toHaveLength(lineSearchHits.length);
  });
});

describe("poetryPoemUrl", () => {
  it("encodes both components and keeps the ; separator literal", () => {
    expect(
      poetryPoemUrl("Charlotte Smith", "Sonnet XLIV: Press'd by the Moon"),
    ).toBe(
      "https://poetrydb.org/author,title/Charlotte%20Smith;Sonnet%20XLIV%3A%20Press'd%20by%20the%20Moon:abs",
    );
  });
});

describe("poetrySourceId", () => {
  it("keys on author and title, verbatim apart from whitespace", () => {
    expect(poetrySourceId(byTitle("Nephelidia"))).toBe(
      "Algernon Charles Swinburne::Nephelidia",
    );
  });

  it("does not fuse titles that differ only in punctuation or numbering", () => {
    // Conservative on purpose — slugging these together would silently merge two distinct poems
    // under one (source, sourceId), which is the corpus's uniqueness key.
    const a = poetrySourceId({ author: "X", title: "Sonnet I" });
    const b = poetrySourceId({ author: "X", title: "Sonnet 1" });
    expect(a).not.toBe(b);
  });

  it("collapses irregular whitespace", () => {
    expect(poetrySourceId({ author: "  A  B ", title: "C\n D " })).toBe(
      "A B::C D",
    );
  });
});

describe("poetrydb.toItem", () => {
  it("normalizes a poem into an article item", () => {
    const item = poetrydb.toItem(byTitle("Nephelidia"));
    expect(item.source).toBe("poetrydb");
    expect(item.type).toBe("article");
    expect(item.title).toBe("Nephelidia");
    expect(item.attribution).toBe("Algernon Charles Swinburne");
    expect(item.license).toBe("Public domain");
    expect(item.tags).toEqual(["Algernon Charles Swinburne", "poetry"]);
    expect(item.imageUrl).toBeNull();
    expect(item.sourceUrl).toMatch(/^https:\/\/poetrydb\.org\/author,title\//);
  });

  it("keeps the whole poem, blank lines included, in body", () => {
    const raw = byTitle("Music: An Ode");
    expect(raw.lines).toContain("");
    const item = poetrydb.toItem(raw);
    expect(item.body).toBe(raw.lines!.join("\n"));
    expect(item.body!.split("\n")).toHaveLength(raw.lines!.length);
  });

  it("uses the poem's own opening two lines as the summary", () => {
    const item = poetrydb.toItem(byTitle("Nephelidia"));
    const [first, second] = byTitle("Nephelidia").lines!;
    expect(item.summary).toBe(
      `${first} / ${second} — Algernon Charles Swinburne`,
    );
  });

  it("skips blank stanza-break lines when building the summary", () => {
    const raw: PoetryRaw = {
      author: "A Poet",
      title: "Gapped",
      lines: ["", "First real line", "", "Second real line"],
    };
    expect(poetrydb.toItem(raw).summary).toBe(
      "First real line / Second real line — A Poet",
    );
  });

  it("falls back to the title when a record somehow has no lines", () => {
    const item = poetrydb.toItem({ author: "A Poet", title: "Untitled" });
    expect(item.summary).toBe("Untitled — A Poet");
    expect(item.body).toBe("");
  });
});
