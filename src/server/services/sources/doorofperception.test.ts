// Fixture tests for the first corpus-walk adapter — see __fixtures__/doorofperception.json,
// recorded 08-25-26 from doorofperception.com's WordPress REST API (two real posts, plus one
// synthetic post with no featured image, the 1-in-390 case).
//
// What is pinned here is D5 (docs/PHASE6_DESIGN_6.3.md §3): a blog item is an image item carrying
// the blog's own excerpt as `summary` and NOTHING in `body` — and the two adapter-supplied
// constants, attribution and license, come from the registry rather than the wire.
//
// No walk() test, consistent with every other adapter: I/O is not the unit-test surface. The
// cursor arithmetic is pure and tested separately below.
import { describe, expect, it } from "vitest";

import { BLOG_LICENSE } from "~/server/config/blogs";
import fixtures from "./__fixtures__/doorofperception.json";
import { doorofperception, nextCursor, type DopRaw } from "./doorofperception";

const raws = fixtures as unknown as DopRaw[];
const bySlug = (slug: string) => {
  const found = raws.find((r) => r.slug === slug);
  if (!found) throw new Error(`fixture missing: ${slug}`);
  return found;
};

describe("doorofperception.toItem", () => {
  it("maps a post to an image item with the excerpt as summary and body null", () => {
    const item = doorofperception.toItem(
      bySlug("the-geologic-atlas-of-the-moon"),
    );
    expect(item.source).toBe("doorofperception");
    expect(item.sourceId).toBe("the-geologic-atlas-of-the-moon");
    expect(item.type).toBe("image");
    // `<br>` in the rendered title becomes a space; no HTML survives.
    expect(item.title).toBe("The Geologic Atlas of the Moon");
    expect(item.summary).toBe(
      "The Geologic Atlas of the Moon looks like abstract painting, but only as a byproduct of " +
        "classifying the lunar surface into type and age. The palette exists so that four " +
        "billion years can be told apart at a glance.",
    );
    expect(item.body).toBeNull();
    expect(item.imageUrl).toMatch(
      /^https:\/\/doorofperception\.com\/wp-content\/uploads\/.+Featured.*\.jpg$/,
    );
    expect(item.sourceUrl).toBe(
      "https://doorofperception.com/2026/08/the-geologic-atlas-of-the-moon/",
    );
    expect(item.attribution).toBe("Door of Perception");
    expect(item.license).toBe(BLOG_LICENSE);
    expect(item.tags.length).toBeGreaterThan(0);
    for (const t of item.tags) expect(t).toBe(t.trim().toLowerCase());
  });

  it("never lets HTML through in title or summary, on any fixture row", () => {
    for (const raw of raws) {
      if (!raw.featured_media) continue;
      const item = doorofperception.toItem(raw);
      expect(item.title).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.summary).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.body).toBeNull();
    }
  });

  it("throws on a post with no featured image — counted as an error, never silently skipped", () => {
    expect(() => doorofperception.toItem(bySlug("no-featured-image"))).toThrow(
      /no featured image/,
    );
  });
});

describe("nextCursor", () => {
  it("advances while pages remain and is undefined on the last page", () => {
    expect(nextCursor(1, 4)).toBe("2");
    expect(nextCursor(3, 4)).toBe("4");
    expect(nextCursor(4, 4)).toBeUndefined();
    expect(nextCursor(1, 1)).toBeUndefined();
  });
});
