// The WP-REST walker factory (sources round 2, 09-01-26). doorofperception.ts is the bespoke
// original and stays as it is (Ben's call — shipped code with 318 rows behind it); the factory
// is for blog #3 onward. So the sharpest test of the factory is that, fed doorofperception's own
// config and posts, it produces byte-identical items to the bespoke adapter — same facts,
// same projection, no drift. Since doorofperception fans out to one item per picture (09-27-26,
// docs/PLAN_dop-fanout.md) the comparison is with its FEATURED card — the one item per post both
// shapes still share — over the pre-fan-out posts, kept as __fixtures__/wp-rest-dop-posts.json. Network paths (the walk itself) are exercised by `bun run
// probe:walk`, per the no-live-HTTP-in-unit-tests convention.
import { describe, expect, it } from "vitest";

import { blogConfig } from "~/server/config/blogs";
import fixtures from "./__fixtures__/wp-rest-dop-posts.json";
import { doorofperception, expandPictures } from "./doorofperception";
import { nextCursor, wpRestWalker, type WpRaw } from "./wp-rest";

const raws = fixtures as unknown as WpRaw[];
const bySlug = (slug: string) => {
  const raw = raws.find((r) => r.slug === slug);
  if (!raw) throw new Error(`fixture missing slug ${slug}`);
  return raw;
};

describe("wpRestWalker", () => {
  const walker = wpRestWalker(blogConfig("doorofperception")!);

  it("is registered under the config's id", () => {
    expect(walker.source).toBe("doorofperception");
  });

  it("produces exactly what the bespoke doorofperception adapter does, on every fixture row", () => {
    for (const raw of raws) {
      if (!raw.featured_media) continue;
      const featured = expandPictures(raw, []).pictures[0]!;
      expect(walker.toItem(raw)).toEqual(doorofperception.toItem(featured));
    }
  });

  it("throws on a post with no featured image, naming the blog", () => {
    expect(() => walker.toItem(bySlug("no-featured-image"))).toThrow(
      /doorofperception: post "no-featured-image" has no featured image/,
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
