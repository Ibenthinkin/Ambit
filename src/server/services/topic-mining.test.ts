// Cut 2a's ranking, as a pure function over tag statistics — no DB, no I/O. scripts/mine-topics.ts
// is the thin shell that reads the corpus and prints the report; everything worth pinning is here.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MINING,
  rankCandidates,
  tallyTags,
  topicIdFor,
  topicLabelFor,
  type TagStat,
} from "./topic-mining";

const item = (source: string, homed: boolean, ...tags: string[]) => ({
  source,
  homed,
  tags,
});

describe("tallyTags", () => {
  it("counts total and un-homed separately and remembers which sources used a tag", () => {
    const stats = tallyTags([
      item("pdr", true, "sculpture", "bronze"),
      item("pdr", false, "sculpture"),
      item("thisiscolossal", false, "sculpture"),
    ]);
    const s = stats.find((x) => x.tag === "sculpture")!;
    expect(s.total).toBe(3);
    expect(s.unhomed).toBe(2);
    expect(s.sources.sort()).toEqual(["pdr", "thisiscolossal"]);
    expect(stats.find((x) => x.tag === "bronze")!.unhomed).toBe(0);
  });
});

describe("rankCandidates", () => {
  const stats: TagStat[] = [
    {
      tag: "sculpture",
      total: 900,
      unhomed: 738,
      sources: ["pdr", "thisiscolossal", "met", "aic"],
    },
    {
      tag: "submission",
      total: 344,
      unhomed: 344,
      sources: ["thisiscolossal"],
    },
    {
      tag: "street art",
      total: 200,
      unhomed: 178,
      sources: ["thisiscolossal"],
    },
    { tag: "mythology", total: 500, unhomed: 40, sources: ["pdr", "met"] },
    { tag: "rare", total: 8, unhomed: 6, sources: ["pdr", "met"] },
  ];

  it("promotes a multi-source tag that clears the un-homed floor", () => {
    const { promoted } = rankCandidates(stats, [], DEFAULT_MINING);
    expect(promoted.map((p) => p.tag)).toContain("sculpture");
  });

  it("drops an administrative stopword however frequent it is", () => {
    const { promoted, singleSource } = rankCandidates(
      stats,
      [],
      DEFAULT_MINING,
    );
    expect(promoted.map((p) => p.tag)).not.toContain("submission");
    expect(singleSource.map((p) => p.tag)).not.toContain("submission");
  });

  it("never proposes a tag that is already a topic", () => {
    const { promoted } = rankCandidates(stats, ["mythology"], DEFAULT_MINING);
    expect(promoted.map((p) => p.tag)).not.toContain("mythology");
  });

  it("sets a single-source tag aside rather than dropping it, so it can be rescued by hand", () => {
    const { promoted, singleSource } = rankCandidates(
      stats,
      [],
      DEFAULT_MINING,
    );
    expect(promoted.map((p) => p.tag)).not.toContain("street art");
    expect(singleSource.map((p) => p.tag)).toContain("street art");
  });

  it("promotes a single-source tag that is explicitly allowed", () => {
    const { promoted } = rankCandidates(stats, [], {
      ...DEFAULT_MINING,
      allow: ["street art"],
    });
    expect(promoted.map((p) => p.tag)).toContain("street art");
  });

  it("drops anything under the un-homed floor, and ranks by un-homed descending", () => {
    const { promoted } = rankCandidates(stats, [], DEFAULT_MINING);
    expect(promoted.map((p) => p.tag)).not.toContain("rare");
    const un = promoted.map((p) => p.unhomed);
    expect([...un].sort((a, b) => b - a)).toEqual(un);
  });

  it("matches an existing topic by its slug, not only by its literal tag text", () => {
    // `existing` holds topic *ids* (`ancient-history`), while the corpus answers in tag text
    // ("ancient history"). Comparing only the raw strings would re-propose a topic Ambit already
    // has under a slightly different spelling.
    const withSpaces: TagStat[] = [
      { tag: "street art", total: 300, unhomed: 178, sources: ["a", "b"] },
    ];
    const { promoted } = rankCandidates(
      withSpaces,
      ["street-art"],
      DEFAULT_MINING,
    );
    expect(promoted).toHaveLength(0);
  });
});

describe("topicIdFor / topicLabelFor", () => {
  it("slugifies a tag into an id and title-cases it into a label", () => {
    expect(topicIdFor("street art")).toBe("street-art");
    expect(topicIdFor("Found Objects")).toBe("found-objects");
    expect(topicIdFor("art & illustration")).toBe("art-illustration");
    expect(topicLabelFor("street art")).toBe("Street Art");
    expect(topicLabelFor("art & illustration")).toBe("Art & Illustration");
  });
});
