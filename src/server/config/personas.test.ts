import { describe, expect, it } from "vitest";

import { PERSONAS, personaEmail, personaTopics } from "./personas";
import { TOPIC_FACETS } from "./topic-facets";
import { TOPIC_GROUPS } from "./topic-groups";

describe("PERSONAS", () => {
  it("is twenty people with unique slugs", () => {
    expect(PERSONAS).toHaveLength(20);
    expect(new Set(PERSONAS.map((p) => p.slug)).size).toBe(20);
  });

  it("every group and every single topic it names exists", () => {
    // A persona whose pick is not pickable would be seeded with a topic no picker can show and
    // `setMine` would refuse — the fixture and the vocabulary have to agree. A renamed group id
    // lands here too: rename it in topic-groups.ts and this says which personas to follow up.
    const groupIds = new Set(TOPIC_GROUPS.map((g) => g.id));
    for (const p of PERSONAS) {
      for (const g of p.groups)
        expect(groupIds.has(g), `${p.slug}: group ${g}`).toBe(true);
      for (const t of p.topics)
        expect(TOPIC_FACETS[t], `${p.slug}: ${t}`).toBeDefined();
    }
  });

  it("everyone resolves to at least three topics, the onboarding floor", () => {
    for (const p of PERSONAS)
      expect(personaTopics(p).length, p.slug).toBeGreaterThanOrEqual(3);
  });

  it("every group is held by at least one persona", () => {
    // The growth guard. The personas are also the signed-out feed (services/feed.ts), so a group
    // nobody holds is a part of the corpus no visitor is ever dealt as a centre. A new group
    // fails here until someone decides whose taste it belongs to.
    const held = new Set(PERSONAS.flatMap((p) => p.groups));
    const orphans = TOPIC_GROUPS.filter((g) => !held.has(g.id)).map(
      (g) => g.id,
    );
    expect(orphans).toEqual([]);
  });

  it("no single topic repeats one of the persona's own groups", () => {
    for (const p of PERSONAS) {
      const viaGroups = new Set(
        TOPIC_GROUPS.filter((g) => p.groups.includes(g.id)).flatMap(
          (g) => g.topics,
        ),
      );
      for (const t of p.topics)
        expect(viaGroups.has(t), `${p.slug}: ${t}`).toBe(false);
    }
  });

  it("personaTopics lists each id once", () => {
    for (const p of PERSONAS) {
      const ids = personaTopics(p);
      expect(new Set(ids).size, p.slug).toBe(ids.length);
    }
  });

  it("emails can never match the e2e cleaner's pattern", () => {
    // `e2e:clean` retires `ambit-%@example.com`. A persona must not be collateral.
    for (const p of PERSONAS)
      expect(personaEmail(p.slug)).toMatch(/^persona-[a-z0-9-]+@ambit\.local$/);
  });
});
