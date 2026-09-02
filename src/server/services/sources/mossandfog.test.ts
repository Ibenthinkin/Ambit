// Fixture tests for mossandfog.com — blog #3, the first built on the wp-rest factory (sources
// round 2, 09-01-26). Three real posts recorded 09-01-26, trimmed to what toItem reads. The
// factory's own behaviour is proven in wp-rest.test.ts; this file proves the per-blog facts:
// id, credit line, canonical host, and that the blog's actual markup survives htmlToText.
import { describe, expect, it } from "vitest";

import { BLOG_LICENSE } from "~/server/config/blogs";
import fixtures from "./__fixtures__/mossandfog.json";
import { mossandfog } from "./mossandfog";
import type { WpRaw } from "./wp-rest";

const raws = fixtures as unknown as WpRaw[];
const bySlug = (slug: string) => {
  const raw = raws.find((r) => r.slug === slug);
  if (!raw) throw new Error(`fixture missing slug ${slug}`);
  return raw;
};

describe("mossandfog.toItem", () => {
  it("maps a post to an image item credited to Moss & Fog, body null", () => {
    const item = mossandfog.toItem(
      bySlug("the-history-of-googie-architecture"),
    );
    expect(item.source).toBe("mossandfog");
    expect(item.sourceId).toBe("the-history-of-googie-architecture");
    expect(item.type).toBe("image");
    expect(item.title).toBe(
      "Googie Architecture: The Wildly Optimistic Style That Defined Postwar America",
    );
    expect(item.summary).toMatch(/^The complete guide to Googie architecture/);
    expect(item.body).toBeNull();
    expect(item.imageUrl).toBe(
      "https://mossandfog.com/wp-content/uploads/2023/06/googie-la-03.jpg",
    );
    expect(item.sourceUrl).toBe(
      "https://mossandfog.com/the-history-of-googie-architecture/",
    );
    expect(item.attribution).toBe("Moss & Fog");
    expect(item.license).toBe(BLOG_LICENSE);
    expect(item.tags).toContain("john lautner");
    for (const t of item.tags) expect(t).toBe(t.trim().toLowerCase());
  });

  it("never lets HTML through in title or summary, on any fixture row", () => {
    for (const raw of raws) {
      if (!raw.featured_media) continue;
      const item = mossandfog.toItem(raw);
      expect(item.title).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.summary).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.body).toBeNull();
    }
  });
});
