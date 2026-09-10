import { describe, expect, it } from "vitest";

import { PERSONAS, personaEmail } from "./personas";
import { TOPIC_FACETS } from "./topic-facets";

describe("PERSONAS", () => {
  it("is twenty people with unique slugs", () => {
    expect(PERSONAS).toHaveLength(20);
    expect(new Set(PERSONAS.map((p) => p.slug)).size).toBe(20);
  });

  it("every pick is a faceted topic, and everyone has at least one", () => {
    // A persona whose pick is not pickable would be seeded with a topic no picker can show and
    // `setMine` would refuse — the fixture and the vocabulary have to agree.
    for (const p of PERSONAS) {
      expect(p.topics.length, p.slug).toBeGreaterThan(0);
      for (const t of p.topics)
        expect(TOPIC_FACETS[t], `${p.slug}: ${t}`).toBeDefined();
    }
  });

  it("emails can never match the e2e cleaner's pattern", () => {
    // `e2e:clean` retires `ambit-%@example.com`. A persona must not be collateral.
    for (const p of PERSONAS)
      expect(personaEmail(p.slug)).toMatch(/^persona-[a-z0-9-]+@ambit\.local$/);
  });
});
