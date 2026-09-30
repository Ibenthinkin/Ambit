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
import { publicationConfig } from "~/server/config/publications";
import jstorFixtures from "./__fixtures__/jstordaily.json";
import marginalianFixtures from "./__fixtures__/themarginalian.json";
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

// Writing Phase 5: a publication on WordPress is walked by the same factory, as writing. The
// fixtures are real posts (09-30-26) with `content.rendered` cut to 6,000 characters.
describe("wpRestWalker — article mode (publications)", () => {
  const walker = wpRestWalker({
    ...publicationConfig("themarginalian")!,
    itemType: "article",
  });
  const marginalian = marginalianFixtures as unknown as WpRaw[];

  it("normalizes a post to an article that is a link card: no body, ever", () => {
    for (const raw of [
      ...marginalian,
      ...(jstorFixtures as unknown as WpRaw[]),
    ]) {
      const item = walker.toItem(raw);
      expect(item.type).toBe("article");
      expect(item.body).toBeNull();
    }
  });

  it("hands the curator the piece's full text as plain text, and shows only the excerpt", () => {
    const item = walker.toItem(marginalian[0]!);
    expect(item.curationText!.length).toBeGreaterThan(2_000);
    expect(item.curationText).not.toMatch(/<\/?p[ >]/);
    expect(item.summary.length).toBeLessThan(item.curationText!.length);
    expect(item.summary).not.toMatch(/<\/?p[ >]/);
  });

  it("credits the publication, with its license, and keeps the featured image", () => {
    const item = walker.toItem(marginalian[0]!);
    expect(item).toMatchObject({
      source: "themarginalian",
      sourceId: "c-s-lewis-schedule",
      attribution: "The Marginalian",
      license:
        "Rights retained by original authors — displayed with credit and link",
    });
    expect(item.imageUrl).toMatch(/^https:\/\/www\.themarginalian\.org\//);
  });

  it("keeps a post with no featured image as writing with no picture", () => {
    const bare = { ...marginalian[0]!, featured_media: 0, _embedded: {} };
    expect(walker.toItem(bare).imageUrl).toBeNull();
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
