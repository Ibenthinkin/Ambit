// Cut 2a's ranking, as a pure function over tag statistics — no DB, no I/O. scripts/mine-topics.ts
// is the thin shell that reads the corpus and prints the report; everything worth pinning is here.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MINING,
  proposalLine,
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

  // 09-06-26 (docs/PLAN_caption-less-and-wild.md T3). A caption-less picture blog's items carry
  // no source tags at all, so before this the mining had nothing to read from them — and they are
  // precisely the items that are un-homed. The curator's aesthetic tags are the only vocabulary
  // those items have.
  it("folds the union of source tags and the curator's aesthetic tags", () => {
    const stats = tallyTags([
      {
        source: "pdr",
        homed: false,
        tags: ["sculpture"],
        aestheticTags: ["bronze"],
      },
      {
        source: "70sscifiart",
        homed: false,
        tags: [],
        aestheticTags: ["bronze"],
      },
    ]);
    expect(stats.find((x) => x.tag === "sculpture")!.total).toBe(1);
    const bronze = stats.find((x) => x.tag === "bronze")!;
    expect(bronze.total).toBe(2);
    expect(bronze.sources).toEqual(["70sscifiart", "pdr"]);
  });

  it("counts a tag present in both columns once for that item, normalized", () => {
    const stats = tallyTags([
      {
        source: "pdr",
        homed: false,
        tags: ["Botanical Plate"],
        aestheticTags: ["botanical plate"],
      },
    ]);
    // One candidate, not two, and it counts once — the item said it twice, in two vocabularies.
    expect(stats).toHaveLength(1);
    expect(stats[0]!.tag).toBe("botanical plate");
    expect(stats[0]!.total).toBe(1);
    // The source did say it, so it is not curator-only.
    expect(stats[0]!.aestheticOnly).toBe(0);
  });

  it("counts how much of a candidate exists only because the curator wrote it", () => {
    const stats = tallyTags([
      { source: "pdr", homed: false, tags: ["woodcut"], aestheticTags: [] },
      {
        source: "70sscifiart",
        homed: false,
        tags: [],
        aestheticTags: ["woodcut"],
      },
      {
        source: "sovietpostcards",
        homed: false,
        tags: [],
        aestheticTags: ["woodcut"],
      },
    ]);
    const s = stats.find((x) => x.tag === "woodcut")!;
    expect(s.total).toBe(3);
    expect(s.aestheticOnly).toBe(2);
  });

  it("still works for a corpus read that carries no aesthetic tags at all", () => {
    const stats = tallyTags([item("pdr", false, "sculpture")]);
    expect(stats[0]!.aestheticOnly).toBe(0);
  });
});

describe("rankCandidates", () => {
  const stats: TagStat[] = [
    {
      tag: "sculpture",
      total: 900,
      unhomed: 738,
      sources: ["pdr", "thisiscolossal", "met", "aic"],
      aestheticOnly: 0,
    },
    {
      tag: "submission",
      total: 344,
      unhomed: 344,
      sources: ["thisiscolossal"],
      aestheticOnly: 0,
    },
    {
      tag: "street art",
      total: 200,
      unhomed: 178,
      sources: ["thisiscolossal"],
      aestheticOnly: 0,
    },
    {
      tag: "mythology",
      total: 500,
      unhomed: 40,
      sources: ["pdr", "met"],
      aestheticOnly: 0,
    },
    {
      tag: "rare",
      total: 8,
      unhomed: 6,
      sources: ["pdr", "met"],
      aestheticOnly: 0,
    },
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
      {
        tag: "street art",
        total: 300,
        unhomed: 178,
        sources: ["a", "b"],
        aestheticOnly: 0,
      },
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

describe("proposalLine", () => {
  const stat: TagStat = {
    tag: "sculpture",
    total: 2180,
    unhomed: 738,
    sources: ["aic", "pdr"],
    aestheticOnly: 0,
  };

  it("writes an unticked line carrying the tag the promoter reads back", () => {
    const line = proposalLine(stat);
    expect(line).toMatch(/^- \[ \] `sculpture` — \*\*Sculpture\*\*/);
    expect(line).toContain("738 un-homed / 2180 total");
    expect(line).toContain("2 sources (aic, pdr)");
  });

  it("emits a facet slot the verdict fills in — `?` until Ben says which", () => {
    expect(proposalLine(stat)).toMatch(
      /<!--\s*tag:\s*[^>]+-->\s*<!--\s*facet:\s*\?\s*-->/,
    );
  });

  it("names the curator's share only when there is one", () => {
    expect(proposalLine(stat)).not.toContain("via curator");
    expect(proposalLine({ ...stat, aestheticOnly: 700 })).toContain(
      "via curator 700/2180",
    );
  });
});

describe("the stopwords that arrived with aesthetic-tag mining", () => {
  const stat = (tag: string): TagStat => ({
    tag,
    total: 900,
    unhomed: 738,
    sources: ["pdr", "thisiscolossal"],
    aestheticOnly: 700,
  });

  it("excludes look-descriptors the curator writes constantly", () => {
    const looks = [
      "muted palette",
      "monochrome",
      "vintage",
      "grainy",
      "moody",
      "high contrast",
    ];
    const { promoted, singleSource } = rankCandidates(
      looks.map(stat),
      [],
      DEFAULT_MINING,
    );
    expect([...promoted, ...singleSource]).toHaveLength(0);
  });

  it("keeps descriptors that name a kind of thing a person could be curious about", () => {
    const kinds = ["hand-lettered", "brutalist", "botanical plate", "woodcut"];
    const { promoted } = rankCandidates(kinds.map(stat), [], DEFAULT_MINING);
    expect(promoted.map((p) => p.tag).sort()).toEqual([...kinds].sort());
  });
});
