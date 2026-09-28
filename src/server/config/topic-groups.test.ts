// The group map is hand-assigned like the facet map, and this pins the two things a hand can get
// wrong: a faceted topic left out of every group (invisible in onboarding, and un-flattenable), and
// a topic filed under a group of the wrong facet (a Medium chip that quietly picks a Subject).
import { describe, expect, it } from "vitest";

import { TOPIC_FACETS } from "./topic-facets";
import { TOPIC_GROUPS, groupOf, groupsFor } from "./topic-groups";

describe("TOPIC_GROUPS", () => {
  it("partitions the faceted vocabulary: every faceted topic in exactly one group", () => {
    const seen = new Map<string, string>();
    for (const g of TOPIC_GROUPS) {
      for (const t of g.topics) {
        expect(seen.has(t), `${t} is in both ${seen.get(t)} and ${g.id}`).toBe(
          false,
        );
        seen.set(t, g.id);
      }
    }
    for (const id of Object.keys(TOPIC_FACETS)) {
      expect(groupOf(id), `${id} is faceted but in no group`).toBeDefined();
    }
    // And nothing extra: a group member that is not a faceted topic is a typo or an era topic.
    for (const t of seen.keys()) {
      expect(TOPIC_FACETS[t], `${t} is grouped but not faceted`).toBeDefined();
    }
  });

  it("every member carries its group's facet", () => {
    for (const g of TOPIC_GROUPS) {
      for (const t of g.topics) {
        expect(TOPIC_FACETS[t], `${g.id} › ${t}`).toBe(g.facet);
      }
    }
  });

  it("group ids are unique and never a topic id; labels are unique within a facet", () => {
    const ids = TOPIC_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(TOPIC_FACETS[id], `${id} is also a topic id`).toBeUndefined();
    }
    const byFacet = new Map<string, Set<string>>();
    for (const g of TOPIC_GROUPS) {
      const labels = byFacet.get(g.facet) ?? new Set<string>();
      expect(
        labels.has(g.label),
        `${g.facet}: two groups named ${g.label}`,
      ).toBe(false);
      labels.add(g.label);
      byFacet.set(g.facet, labels);
    }
  });

  it("is the size the design recorded (09-28-26): 36 subject, 19 medium, 14 look, 6 place", () => {
    const count = (f: string) =>
      TOPIC_GROUPS.filter((g) => g.facet === f).length;
    expect([
      count("subject"),
      count("medium"),
      count("look"),
      count("place"),
    ]).toEqual([36, 19, 14, 6]);
  });

  it("the -group suffix is only ever used to dodge a real collision", () => {
    // Rule (§1 of the design doc): a group id gets a "-group" suffix only so it doesn't collide
    // with a topic id of the same natural slug (Cars the group vs. `cars` the topic). If the
    // suffix is on an id whose natural slug (the id with "-group" stripped) is *not* itself a
    // topic id, the suffix is decoration, not a dodge, and the rule has gone stale.
    for (const g of TOPIC_GROUPS) {
      if (!g.id.endsWith("-group")) continue;
      const naturalSlug = g.id.replace(/-group$/, "");
      expect(
        TOPIC_FACETS[naturalSlug],
        `${g.id}: "${naturalSlug}" is not a topic id, so the -group suffix isn't dodging anything`,
      ).toBeDefined();
    }
  });
});

describe("groupsFor", () => {
  const listed = [
    { id: "astronomy" },
    { id: "botany" },
    { id: "ceramics" },
    { id: "music" },
  ];

  it("shows only groups with a listed member, and flattens to the listed members only", () => {
    // CI's shape: the sixteen originals and nothing grown. Space has six members in the config
    // but only `astronomy` here, so that is all a pick may write.
    const subject = groupsFor("subject", listed);
    expect(subject.map((r) => r.group.label)).toEqual([
      "Space",
      "Plants",
      "Music, sound & dance",
    ]);
    expect(subject[0]!.members).toEqual(["astronomy"]);
  });

  it("keeps the config's group order and the listing's member order", () => {
    const rows = [{ id: "textiles" }, { id: "ceramics" }, { id: "typography" }];
    const medium = groupsFor("medium", rows);
    expect(medium.map((r) => r.group.label)).toEqual([
      "Graphic design & type",
      "Ceramics & glass",
      "Textiles",
    ]);
    expect(medium[1]!.members).toEqual(["ceramics"]);
  });

  it("is empty for a facet with nothing listed", () => {
    expect(groupsFor("place", listed)).toEqual([]);
  });
});
