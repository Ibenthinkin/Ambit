// Fixture tests for thisiscolossal.com — blog #4, on the wp-rest factory (sources round 2,
// 09-01-26). Three real posts recorded 09-01-26, trimmed to what toItem reads. Colossal's
// titles carry numeric entities (`&#8217;`, `&#8216;`) rather than the named ones the Tumblr
// adapter met, which is the extra thing this fixture proves about htmlToText.
import { describe, expect, it } from "vitest";

import { BLOG_LICENSE } from "~/server/config/blogs";
import fixtures from "./__fixtures__/thisiscolossal.json";
import { thisiscolossal } from "./thisiscolossal";
import type { WpRaw } from "./wp-rest";

const raws = fixtures as unknown as WpRaw[];
const bySlug = (slug: string) => {
  const raw = raws.find((r) => r.slug === slug);
  if (!raw) throw new Error(`fixture missing slug ${slug}`);
  return raw;
};

describe("thisiscolossal.toItem", () => {
  it("maps a post to an image item credited to Colossal, on the www host, body null", () => {
    const item = thisiscolossal.toItem(
      bySlug("world-unfolding-book-human-knowledge-history-the-huntington"),
    );
    expect(item.source).toBe("thisiscolossal");
    expect(item.sourceId).toBe(
      "world-unfolding-book-human-knowledge-history-the-huntington",
    );
    expect(item.type).toBe("image");
    // `&#8217;` → ’ and `&#8216;` → ‘ — decoded, never left as entities or flattened to ASCII.
    expect(item.title).toBe(
      "Twelve Centuries of Documents Illuminate Humans’ Quest for Knowledge in ‘World Unfolding’",
    );
    expect(item.summary).toBe(
      "The five-volume tome features more than 625 illustrations from The Huntington’s vast collection.",
    );
    expect(item.body).toBeNull();
    expect(item.imageUrl).toBe(
      "https://www.thisiscolossal.com/wp-content/uploads/2026/09/world-5.jpg",
    );
    expect(item.sourceUrl).toBe(
      "https://www.thisiscolossal.com/2026/09/world-unfolding-book-human-knowledge-history-the-huntington/",
    );
    expect(item.attribution).toBe("Colossal");
    expect(item.license).toBe(BLOG_LICENSE);
    expect(item.tags).toContain("astronomy");
    for (const t of item.tags) expect(t).toBe(t.trim().toLowerCase());
  });

  it("never lets HTML through in title or summary, on any fixture row", () => {
    for (const raw of raws) {
      if (!raw.featured_media) continue;
      const item = thisiscolossal.toItem(raw);
      expect(item.title).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.summary).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.body).toBeNull();
    }
  });
});
