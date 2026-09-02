// Unit tests for the ingestion job's collision-resolution rule (SPEC §15, settled 08-07-26 in
// docs/PHASE3_PLAN.md's planning session): "highest-search-rank wins, ties → alphabetically-
// smallest topic id." The property under test throughout is order-independence — phase0's
// harvester picked a winner by scan order (last topic wins) and silently starved whatever topic
// came first (astronomy kept 4 of 419 AIC finds; SPEC §15). A collision rule that isn't
// order-independent would just relocate the same bug.
import { describe, expect, it } from "vitest";

import type { NormalizedItem } from "./sources/types";
import type { Claim } from "./ingest-plan";
import {
  planPrune,
  resolveCollisions,
  tagHistogram,
  topicHistogram,
} from "./ingest-plan";

/** A minimal, valid NormalizedItem — only `source`/`sourceId` vary across the fixtures below,
 *  since those two fields are the collision key (an item is "the same object" iff both match). */
function mkItem(
  source: NormalizedItem["source"],
  sourceId: string,
): NormalizedItem {
  return {
    source,
    sourceId,
    type: "image",
    title: `Test item ${sourceId}`,
    summary: "A summary long enough to be unremarkable.",
    body: null,
    imageUrl: null,
    sourceUrl: `https://example.com/${source}/${sourceId}`,
    attribution: "Test Museum",
    license: "CC0",
    tags: [],
  };
}

function claim(topicId: string, rank: number, item: NormalizedItem): Claim {
  return { topicId, rank, item };
}

describe("resolveCollisions", () => {
  it("picks the claim with the lowest rank (highest search rank) as the winner", () => {
    const item = mkItem("aic", "1");
    const claims = [claim("astronomy", 3, item), claim("machines", 1, item)];

    const { winners, collisionCountBySource } = resolveCollisions(claims);

    expect(winners).toHaveLength(1);
    expect(winners[0]?.topicId).toBe("machines");
    expect(winners[0]?.collidedWith).toEqual(["astronomy"]);
    expect(collisionCountBySource).toEqual({ aic: 1 });
  });

  it("breaks rank ties by the alphabetically-smallest topic id", () => {
    const item = mkItem("aic", "1");
    const claims = [claim("machines", 1, item), claim("astronomy", 1, item)];

    const { winners } = resolveCollisions(claims);

    expect(winners).toHaveLength(1);
    expect(winners[0]?.topicId).toBe("astronomy");
    expect(winners[0]?.collidedWith).toEqual(["machines"]);
  });

  it("is order-independent: reversed input order produces identical winners", () => {
    const item = mkItem("aic", "1");
    const forward = [
      claim("astronomy", 3, item),
      claim("machines", 1, item),
      claim("botany", 2, item),
    ];
    const reversed = [...forward].reverse();

    const a = resolveCollisions(forward);
    const b = resolveCollisions(reversed);

    expect(a.winners).toEqual(b.winners);
    expect(a.collisionCountBySource).toEqual(b.collisionCountBySource);
  });

  it("passes through a non-colliding claim untouched, with a zero collision count", () => {
    const claims = [claim("astronomy", 0, mkItem("wikipedia", "Astronomy"))];

    const { winners, collisionCountBySource } = resolveCollisions(claims);

    expect(winners).toHaveLength(1);
    expect(winners[0]?.topicId).toBe("astronomy");
    expect(winners[0]?.collidedWith).toEqual([]);
    expect(collisionCountBySource).toEqual({});
  });

  it("counts a three-way collision once per source, not once per losing claim", () => {
    const item = mkItem("met", "42");
    const claims = [
      claim("astronomy", 5, item),
      claim("machines", 1, item),
      claim("botany", 3, item),
    ];

    const { winners, collisionCountBySource } = resolveCollisions(claims);

    expect(winners).toHaveLength(1);
    expect(winners[0]?.topicId).toBe("machines");
    expect(winners[0]?.collidedWith).toEqual(["astronomy", "botany"]);
    expect(collisionCountBySource).toEqual({ met: 1 });
  });

  it("resolves multiple distinct (source, sourceId) groups independently", () => {
    const itemA = mkItem("aic", "1");
    const itemB = mkItem("met", "2");
    const claims = [
      claim("astronomy", 3, itemA),
      claim("machines", 1, itemA),
      claim("botany", 0, itemB), // no collision for itemB
    ];

    const { winners, collisionCountBySource } = resolveCollisions(claims);

    expect(winners).toHaveLength(2);
    const winnerForA = winners.find((w) => w.item.sourceId === "1");
    const winnerForB = winners.find((w) => w.item.sourceId === "2");
    expect(winnerForA?.topicId).toBe("machines");
    expect(winnerForB?.topicId).toBe("botany");
    expect(winnerForB?.collidedWith).toEqual([]);
    expect(collisionCountBySource).toEqual({ aic: 1 });
  });
});

// ── Phase 6.3: the walk lane's two pure decisions ───────────────────────────────────────────

describe("topicHistogram", () => {
  it("counts memberships per topic — an item under two topics counts in both — and the un-homed separately", () => {
    const h = topicHistogram([
      { topics: ["botany", "zoology"] },
      { topics: ["botany"] },
      { topics: [] },
    ]);
    expect(h.byTopic).toEqual({ botany: 2, zoology: 1 });
    expect(h.unhomed).toBe(1);
  });
});

describe("tagHistogram", () => {
  // Cut 1's promotion evidence (design §7): what the un-homed items are ABOUT, from both tag
  // fields. `aesthetic_tags` matter because blog tags are unreliable — two of streetartnews' three
  // newest posts had none — while the curator writes 2-4 descriptors on every item.
  it("counts each tag once per item across both fields, case-insensitively, most common first", () => {
    const h = tagHistogram([
      { tags: ["Mural", "Ghent"], aestheticTags: ["mural", "silhouette art"] },
      { tags: [], aestheticTags: ["monochromatic", "mural"] },
      { tags: ["street art"], aestheticTags: [] },
    ]);
    expect(h).toEqual([
      { tag: "mural", n: 2 },
      { tag: "ghent", n: 1 },
      { tag: "monochromatic", n: 1 },
      { tag: "silhouette art", n: 1 },
      { tag: "street art", n: 1 },
    ]);
  });

  it("truncates to `top`", () => {
    const items = ["a", "b", "c"].map((t) => ({
      tags: [t],
      aestheticTags: [],
    }));
    expect(tagHistogram(items, 2)).toHaveLength(2);
  });

  it("is empty for no items", () => {
    expect(tagHistogram([])).toEqual([]);
  });
});

describe("planPrune", () => {
  // Phase 6.3's remove-on-request path: rows in the DB for a walk source that a COMPLETE walk did
  // not see are the posts the blog has removed. The function only decides; ingest deletes, and
  // only under --prune.
  it("names the DB rows of this source that the walk did not see", () => {
    const existingKeys = new Set([
      "doorofperception:a",
      "doorofperception:b",
      "met:x",
    ]);
    expect(
      planPrune({
        source: "doorofperception",
        seenSourceIds: ["a"],
        existingKeys,
      }),
    ).toEqual(["b"]);
  });

  it("never names another source's rows", () => {
    const existingKeys = new Set(["met:x", "loc:y"]);
    expect(
      planPrune({
        source: "doorofperception",
        seenSourceIds: [],
        existingKeys,
      }),
    ).toEqual([]);
  });
});
