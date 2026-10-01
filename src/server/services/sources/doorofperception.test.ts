// Fixture tests for the first corpus-walk adapter. Two fixtures since the fan-out (09-27-26,
// docs/PLAN_dop-fanout.md): __fixtures__/doorofperception-post.json is one real post and its
// attachments as the API returns them, recorded 09-27-26 and trimmed to five shown images (one
// of them the 1072×118 "moon to scale" banner) plus one unused attachment; and
// __fixtures__/doorofperception.json is what walk() yields — that post expanded, plus two
// 08-25-26 posts (one synthetic, with no featured image, the 1-in-391 case).
//
// What is pinned here is D5 (docs/PHASE6_DESIGN_6.3.md §3): a blog item is an image item carrying
// the blog's own excerpt as `summary` and NOTHING in `body` — and the two adapter-supplied
// constants, attribution and license, come from the registry rather than the wire.
//
// No walk() test, consistent with every other adapter: I/O is not the unit-test surface. The
// cursor arithmetic is pure and tested separately below.
import { afterEach, describe, expect, it, vi } from "vitest";

import { BLOG_LICENSE } from "~/server/config/blogs";
import recorded from "./__fixtures__/doorofperception-post.json";
import fixtures from "./__fixtures__/doorofperception.json";
import {
  doorofperception,
  expandPictures,
  nextCursor,
  pictureSrcs,
  type DopPost,
  type DopRaw,
  type WpMediaRaw,
} from "./doorofperception";

const raws = fixtures as unknown as DopRaw[];
const post = recorded.post as unknown as DopPost;
const media = recorded.media as WpMediaRaw[];
const bySlug = (slug: string) => {
  const found = raws.find((r) => r.slug === slug && r.mediaId === undefined);
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
      if (raw.expandError) continue;
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

describe("doorofperception fan-out", () => {
  const { pictures, unresolved } = expandPictures(post, media);

  it("yields the featured image first, under the bare slug — the pre-fan-out identity", () => {
    const first = doorofperception.toItem(pictures[0]!);
    expect(first.sourceId).toBe("the-geologic-atlas-of-the-moon");
    expect(first.imageUrl).toMatch(/Featured.*\.jpg$/);
  });

  it("then every picture the post shows, in order, as its ORIGINAL upload", () => {
    const rest = pictures.slice(1).map((r) => doorofperception.toItem(r));
    expect(rest.map((i) => i.sourceId)).toEqual([
      "the-geologic-atlas-of-the-moon:26515",
      "the-geologic-atlas-of-the-moon:26544",
      "the-geologic-atlas-of-the-moon:26527",
      "the-geologic-atlas-of-the-moon:26545",
    ]);
    // The post shows `…-01-1200x795.jpg`; the item stores `…-01.jpg`, the 7355 px upload.
    expect(rest[0]!.imageUrl).toBe(
      "https://doorofperception.com/wp-content/uploads/doorofperception.com-Geological-Atlas-of-the-Moon-01.jpg",
    );
    // …and hands the curator the published `large` rendition, not the 7355 px original.
    expect(rest[0]!.curationImageUrl).toMatch(/-01-\d+x\d+\.jpg$/);
  });

  it("gives every picture the post's title, excerpt, tags and permalink, and no body", () => {
    const items = pictures.map((r) => doorofperception.toItem(r));
    for (const it of items) {
      expect(it.title).toBe(items[0]!.title);
      expect(it.summary).toBe(items[0]!.summary);
      expect(it.tags).toEqual(items[0]!.tags);
      expect(it.sourceUrl).toBe(items[0]!.sourceUrl);
      expect(it.body).toBeNull();
    }
  });

  it("skips the page furniture, a repeated image and the unused attachment", () => {
    const ids = pictures.map((r) => r.mediaId);
    // 26470 is the 1072×118 banner: under MIN_SHORT_EDGE.
    expect(ids).not.toContain(26470);
    // The fixture shows the -01 picture twice; it is one item.
    expect(ids.filter((id) => id === 26515)).toHaveLength(1);
    // Five attachments shown, one attachment never shown: 1 featured + 4 pictures.
    expect(pictures).toHaveLength(5);
    expect(unresolved).toBe(0);
  });

  it("counts, and skips, a shown image that is not one of the post's attachments", () => {
    const foreign: DopPost = {
      ...post,
      content: {
        rendered:
          '<img src="https://doorofperception.com/wp-content/uploads/elsewhere-1200x800.jpg">',
      },
    };
    const out = expandPictures(foreign, media);
    expect(out.pictures).toHaveLength(1); // the featured image only
    expect(out.unresolved).toBe(1);
  });

  it("keeps a post's pictures when it has no featured image — only the card itself errors", () => {
    const noHero: DopPost = {
      ...post,
      featured_media: 0,
      _embedded: undefined,
    };
    const out = expandPictures(noHero, media);
    expect(() => doorofperception.toItem(out.pictures[0]!)).toThrow(
      /no featured image/,
    );
    expect(out.pictures.slice(1)).toHaveLength(4);
  });

  it("drops the post's HTML from every picture it yields", () => {
    for (const r of pictures) expect(r).not.toHaveProperty("content");
  });
});

describe("pictureSrcs", () => {
  it("reads img src URLs in document order, once each", () => {
    expect(
      pictureSrcs(
        '<p>x</p><img alt="" src="a.jpg"><a href="b.jpg"><img decoding="async" src="b-1x1.jpg" /></a><img src="a.jpg">',
      ),
    ).toEqual(["a.jpg", "b-1x1.jpg"]);
  });
});

// Same finding as wp-rest.test.ts (09-30-26): the cursor is a page number, so only the first page
// may be shrunk by `limit`.
describe("doorofperception.walk — page size", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for a full page after the first, whatever the remaining limit", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", (input: string | URL) => {
      urls.push(String(input));
      return Promise.resolve(
        new Response("[]", {
          status: 200,
          // One page: DoP reads its whole tag list first, a page at a time, 500 ms apart.
          headers: {
            "x-wp-totalpages": "1",
            "content-type": "application/json",
          },
        }),
      );
    });
    // DoP's page is 20 posts (it fans each out to its pictures); a limit under that must not
    // shrink page 2.
    await doorofperception.walk("2", { limit: 5 });
    expect(urls.find((u) => u.includes("/posts?"))).toMatch(
      /per_page=20&page=2/,
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
