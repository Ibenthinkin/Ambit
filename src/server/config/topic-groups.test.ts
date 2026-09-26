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

  it("is the size the design recorded (09-25-26): 12 subject, 8 medium, 8 look, 6 place", () => {
    const count = (f: string) =>
      TOPIC_GROUPS.filter((g) => g.facet === f).length;
    expect([
      count("subject"),
      count("medium"),
      count("look"),
      count("place"),
    ]).toEqual([12, 8, 8, 6]);
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
    // CI's shape: the sixteen originals and nothing grown. Space & science fiction has twelve
    // members in the config but only `astronomy` here, so that is all a pick may write.
    const subject = groupsFor("subject", listed);
    expect(subject.map((r) => r.group.label)).toEqual([
      "Space & science fiction",
      "Plants & fungi",
      "Music, film & performance",
    ]);
    expect(subject[0]!.members).toEqual(["astronomy"]);
  });

  it("keeps the config's group order and the listing's member order", () => {
    const rows = [{ id: "textiles" }, { id: "ceramics" }, { id: "typography" }];
    const medium = groupsFor("medium", rows);
    expect(medium.map((r) => r.group.label)).toEqual([
      "Posters, print & type",
      "Craft & materials",
    ]);
    expect(medium[1]!.members).toEqual(["textiles", "ceramics"]);
  });

  it("is empty for a facet with nothing listed", () => {
    expect(groupsFor("place", listed)).toEqual([]);
  });
});
