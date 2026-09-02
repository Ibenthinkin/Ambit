// Guards the agreement between the designated-blog registry and the three places a blog's id has
// to be recognized: WALK_SOURCES (which tier it ingests under), SourceId (the DB's open set), and
// SOURCE_LABELS (what the credit line prints). A blog missing from any one of them is either
// un-ingestable or mis-credited — and the credit line is the claim an item makes about where it
// came from, so "Doorofperception" (the title-case fallback) is a wrong claim, not a cosmetic one.
import { describe, expect, it } from "vitest";

import { sourceLabel } from "~/lib/source-label";
import { BLOG_LICENSE, BLOGS, blogConfig, isBlogSource } from "./blogs";
import { PDR } from "./pdr";
import { WALK_SOURCES } from "./topics";

describe("designated-blog registry", () => {
  // Every blog is a walk source, and every walk source is a blog — except the one publication
  // that walks without being a blog (config/pdr.ts says why). Named here so a second non-blog
  // walker is a deliberate edit to this list, not a silent hole in the registry.
  it("lists every walk source that is not the Public Domain Review", () => {
    expect([...BLOGS.map((b) => b.id), PDR.id].sort()).toEqual(
      [...WALK_SOURCES].sort(),
    );
  });

  it("gives every blog a real credit-line label, never the title-case fallback", () => {
    for (const b of BLOGS) {
      expect(sourceLabel(b.id)).toBe(b.label);
      expect(b.label).not.toBe(b.id.charAt(0).toUpperCase() + b.id.slice(1));
    }
  });

  it("uses the one honest license string on every blog", () => {
    for (const b of BLOGS) expect(b.license).toBe(BLOG_LICENSE);
    expect(BLOG_LICENSE).not.toMatch(/fair use/i);
  });

  it("records an https base URL with no trailing slash and a dated robots check", () => {
    for (const b of BLOGS) {
      expect(b.baseUrl).toMatch(/^https:\/\/[^/]+$/);
      expect(b.robotsCheckedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("answers isBlogSource for blogs only", () => {
    expect(isBlogSource("doorofperception")).toBe(true);
    expect(isBlogSource("met")).toBe(false);
    expect(isBlogSource("archive")).toBe(false);
    expect(blogConfig("doorofperception")?.label).toBe("Door of Perception");
    expect(blogConfig("met")).toBeUndefined();
  });
});
