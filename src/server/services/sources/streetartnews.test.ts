// Fixture tests for streetartnews.net — blog #5, a config row on the wp-rest factory (sources
// round 2, 09-02-26). Three real posts recorded 09-02-26, trimmed to what toItem reads. The
// factory's own behaviour is proven in wp-rest.test.ts; this file proves the per-blog facts:
// id, credit line, canonical host, and that the blog's actual markup survives htmlToText.
import { describe, expect, it } from "vitest";

import { BLOG_LICENSE } from "~/server/config/blogs";
import fixtures from "./__fixtures__/streetartnews.json";
import { streetartnews } from "./streetartnews";
import type { WpRaw } from "./wp-rest";

const raws = fixtures as unknown as WpRaw[];
const bySlug = (slug: string) => {
  const raw = raws.find((r) => r.slug === slug);
  if (!raw) throw new Error(`fixture missing slug ${slug}`);
  return raw;
};

describe("streetartnews.toItem", () => {
  it("maps a post to an image item credited to StreetArtNews, body null", () => {
    const item = streetartnews.toItem(
      bySlug("yves-gallard-completes-a-chromatic-wall-at-ajuinlei-in-ghent"),
    );
    expect(item.source).toBe("streetartnews");
    expect(item.sourceId).toBe(
      "yves-gallard-completes-a-chromatic-wall-at-ajuinlei-in-ghent",
    );
    expect(item.type).toBe("image");
    expect(item.title).toBe(
      "Yves Gallard Completes a Chromatic Wall at Ajuinlei in Ghent",
    );
    expect(item.summary).toMatch(/^Yves Gallard has completed a new wall/);
    expect(item.body).toBeNull();
    expect(item.imageUrl).toBe(
      "https://streetartnews.net/wp-content/uploads/2026/09/791721116_18015368498945795_2706235070868108652_n-2.jpg",
    );
    // The permalink is dated and ends in `.html` — this blog's own URL shape, not the
    // `/<slug>/` of the other WP blogs. The bare host, never `www.` (which 301s here).
    expect(item.sourceUrl).toBe(
      "https://streetartnews.net/2026/09/yves-gallard-completes-a-chromatic-wall-at-ajuinlei-in-ghent.html",
    );
    expect(item.attribution).toBe("StreetArtNews");
    expect(item.license).toBe(BLOG_LICENSE);
    expect(item.tags).toContain("yves gallard");
    for (const t of item.tags) expect(t).toBe(t.trim().toLowerCase());
  });

  it("keeps a tagless post — tags are a hint, not a requirement", () => {
    // Two of the three newest posts carried no tags at all on 09-02-26. That must normalize to an
    // empty array rather than throwing or dropping the item; the curator classifies from
    // title/summary/image regardless.
    const item = streetartnews.toItem(
      bySlug("scaf-paints-for-southend-city-jam-2026-in-southend-on-sea"),
    );
    expect(item.tags).toEqual([]);
    expect(item.imageUrl).toBeTruthy();
  });

  it("never lets HTML through in title or summary, on any fixture row", () => {
    for (const raw of raws) {
      if (!raw.featured_media) continue;
      const item = streetartnews.toItem(raw);
      expect(item.title).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.summary).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.body).toBeNull();
    }
  });
});
