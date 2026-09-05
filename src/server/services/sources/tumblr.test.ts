// The Tumblr walker factory (sources round 3, 09-05-26). things-organized-neatly.ts is the
// bespoke original and stays as it is (the same call Ben made for doorofperception — shipped
// code with 891 rows behind it); the factory is for the nine blogs registered alongside it. So
// the sharpest test of the factory is that, fed thingsorganizedneatly's own config and fixture,
// it produces byte-identical items to the bespoke adapter — same facts, same projection, no
// drift. Network paths (the walk itself) are exercised by `bun run probe:walk`, per the
// no-live-HTTP-in-unit-tests convention.
//
// Beyond that: one fixture per blog, recorded live 09-05-26 from three depths of each archive
// (offsets 0 / 500 / 5000) and trimmed to the fields toItem reads. What they pin is that each
// blog really does answer in the two shapes the factory handles — several of these archives are
// mostly `regular` posts where thingsorganizedneatly is mostly `photo` — and that no blog's
// markup escapes into a title or summary.
import { describe, expect, it } from "vitest";

import { BLOGS, blogConfig, BLOG_LICENSE } from "~/server/config/blogs";
import scifiart70s from "./__fixtures__/70sscifiart.json";
import dreamsrecurring from "./__fixtures__/dreamsrecurring.json";
import humanoidhistory from "./__fixtures__/humanoidhistory.json";
import nemfrog from "./__fixtures__/nemfrog.json";
import sovietpostcards from "./__fixtures__/sovietpostcards.json";
import tonFixtures from "./__fixtures__/things-organized-neatly.json";
import thevault from "./__fixtures__/thevaultoftheatomicspaceage.json";
import thisisnthappiness from "./__fixtures__/thisisnthappiness.json";
import toiich from "./__fixtures__/toiich.json";
import vintagegeekculture from "./__fixtures__/vintagegeekculture.json";
import { thingsorganizedneatly } from "./things-organized-neatly";
import {
  deriveTitle,
  firstImageUrl,
  nextCursor,
  capSummary,
  parseTumblrJson,
  stripCaptionChrome,
  tumblrWalker,
  type TumblrRaw,
} from "./tumblr";

/** The nine round-3 blogs and the fixture recorded from each. */
const FIXTURES: [string, TumblrRaw[]][] = [
  ["nemfrog", nemfrog],
  ["humanoidhistory", humanoidhistory],
  ["sovietpostcards", sovietpostcards],
  ["70sscifiart", scifiart70s],
  ["vintagegeekculture", vintagegeekculture],
  ["dreamsrecurring", dreamsrecurring],
  ["toiich", toiich],
  ["thevaultoftheatomicspaceage", thevault],
  ["thisisnthappiness", thisisnthappiness],
] as unknown as [string, TumblrRaw[]][];

/** The post types the factory turns into items; everything else must throw. */
const SUPPORTED = new Set(["photo", "regular"]);

describe("tumblrWalker — equivalence with the bespoke adapter", () => {
  const walker = tumblrWalker(blogConfig("thingsorganizedneatly")!);
  const raws = tonFixtures as unknown as TumblrRaw[];

  it("is registered under the config's id", () => {
    expect(walker.source).toBe("thingsorganizedneatly");
  });

  // Equivalence holds everywhere the two adapters agree, which is every fixture row: the factory
  // adds exactly two deliberate divergences (the ALT badge strip and the 600-char summary cap),
  // and neither fires on this blog's fixture — nor on its 1,720 stored rows, which were checked.
  // If a future fixture row does trip one, this assertion is the thing that will say so.
  it("produces exactly what things-organized-neatly.ts does, on every fixture row", () => {
    for (const raw of raws) {
      if (!SUPPORTED.has(raw.type)) continue;
      expect(walker.toItem(raw)).toEqual(thingsorganizedneatly.toItem(raw));
    }
  });

  it("drops the blog's self-tag exactly as the bespoke adapter's BLOG_TAG does", () => {
    const tagged = raws.find((r) =>
      (r.tags ?? []).some((t) => t.toLowerCase() === "things organized neatly"),
    );
    expect(tagged, "fixture should contain a self-tagged post").toBeDefined();
    expect(walker.toItem(tagged!).tags).not.toContain(
      "things organized neatly",
    );
  });
});

describe.each(FIXTURES)("tumblrWalker — %s", (id, raws) => {
  const config = blogConfig(id)!;
  const walker = tumblrWalker(config);

  it("has a config row and is wired to it", () => {
    expect(config).toBeDefined();
    expect(config.walk).toBe("tumblr");
    expect(walker.source).toBe(id);
  });

  it("maps every supported fixture row to a valid link-card item", () => {
    const supported = raws.filter((r) => SUPPORTED.has(r.type));
    expect(supported.length).toBeGreaterThan(0);
    for (const raw of supported) {
      const item = walker.toItem(raw);
      expect(item.source).toBe(id);
      expect(item.sourceId).toBe(raw.id);
      expect(item.type).toBe("image");
      // 6.3 D5: a blog item is a link card. Never a stored article.
      expect(item.body).toBeNull();
      expect(item.attribution).toBe(config.label);
      expect(item.license).toBe(BLOG_LICENSE);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.imageUrl).toMatch(/^https?:\/\//);
      expect(item.sourceUrl).toMatch(/^https?:\/\//);
      // The self-tag never survives into an item's tags.
      for (const self of config.selfTags ?? []) {
        expect(item.tags).not.toContain(self);
      }
    }
  });

  it("never lets HTML or entities through in title or summary", () => {
    for (const raw of raws.filter((r) => SUPPORTED.has(r.type))) {
      const item = walker.toItem(raw);
      expect(item.title).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.summary).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
    }
  });

  it("throws on a post type that carries no picture, naming the blog", () => {
    const other = raws.find((r) => !SUPPORTED.has(r.type));
    if (!other) return; // not every archive had one within the sampled depths
    expect(() => walker.toItem(other)).toThrow(
      new RegExp(`^${id}: unsupported post type "${other.type}"`),
    );
  });
});

describe("every blog row declaring walk: tumblr has a fixture and a walker", () => {
  it("covers all of them", () => {
    const tumblrRows = BLOGS.filter((b) => b.walk === "tumblr").map((b) => b.id);
    const covered = new Set([
      "thingsorganizedneatly",
      ...FIXTURES.map(([id]) => id),
    ]);
    expect([...tumblrRows].sort()).toEqual([...covered].sort());
  });
});

describe("stripCaptionChrome", () => {
  const caption =
    '<figure><img src="https://x/a.jpg"/>' +
    '<span class="tmblr-alt-text-helper">ALT</span></figure><p>Wayne Barlowe</p>';

  it("removes Tumblr's alt-text badge, span and all", () => {
    expect(stripCaptionChrome(caption)).not.toMatch(/ALT|tmblr-alt-text-helper/);
  });

  it("keeps the caption itself, and the picture the badge sat beside", () => {
    const out = stripCaptionChrome(caption);
    expect(out).toContain("Wayne Barlowe");
    expect(firstImageUrl(out)).toBe("https://x/a.jpg");
  });

  it("leaves a caption without a badge untouched", () => {
    expect(stripCaptionChrome("<p>Cartouche, 1730.</p>")).toBe(
      "<p>Cartouche, 1730.</p>",
    );
  });
});

describe("capSummary", () => {
  it("leaves anything within the cap exactly as it is", () => {
    expect(capSummary("A shoemaker's bench.")).toBe("A shoemaker's bench.");
    expect(capSummary("x".repeat(600))).toBe("x".repeat(600));
  });

  it("cuts a long caption at a word boundary with an ellipsis", () => {
    const long = "word ".repeat(400).trim();
    const out = capSummary(long);
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\swor…$/); // never mid-word
  });

  it("caps the essay-length caption shape that motivated it", () => {
    // vintagegeekculture's longest sampled caption was 12,268 characters — a blog answering an
    // ask at length. A card excerpts it and links out; it never stores the essay.
    expect(capSummary("a".repeat(12268)).length).toBeLessThanOrEqual(600);
  });
});

describe("the two fixes, through toItem", () => {
  const walker = tumblrWalker(blogConfig("70sscifiart")!);

  it("never titles a card 'ALT' and never stores an essay", () => {
    const item = walker.toItem({
      id: "1",
      type: "photo",
      slug: "s",
      url: "https://70sscifiart.tumblr.com/post/1",
      "photo-url-1280": "https://x/a_1280.jpg",
      "photo-caption":
        '<span class="tmblr-alt-text-helper">ALT</span><p>' +
        "Esteban Maroto. ".repeat(80) +
        "</p>",
    });
    expect(item.title).not.toBe("ALT");
    expect(item.title).toBe("Esteban Maroto.");
    expect(item.summary.length).toBeLessThanOrEqual(600);
    expect(item.summary).not.toMatch(/ALT/);
  });
});

describe("parseTumblrJson", () => {
  it("unwraps the `var tumblr_api_read = …;` envelope", () => {
    expect(parseTumblrJson('var tumblr_api_read = {"a":1};')).toEqual({ a: 1 });
    expect(parseTumblrJson('var tumblr_api_read = {"a":1}')).toEqual({ a: 1 });
  });

  it("refuses anything else by name, rather than failing inside JSON.parse", () => {
    expect(() => parseTumblrJson("<html>nope</html>", "nemfrog")).toThrow(
      /^nemfrog: response is not the/,
    );
  });
});

describe("nextCursor", () => {
  it("advances by the page size while posts remain", () => {
    expect(nextCursor(0, 50, 120)).toBe("50");
    expect(nextCursor(50, 50, 120)).toBe("100");
  });

  it("stops on the last page and on an empty one", () => {
    expect(nextCursor(100, 20, 120)).toBeUndefined();
    expect(nextCursor(100, 0, 120)).toBeUndefined();
  });
});

describe("firstImageUrl", () => {
  it("prefers the largest srcset rendition over src", () => {
    expect(
      firstImageUrl(
        '<img src="https://x/a_640.jpg" srcset="https://x/a_75.jpg 75w, https://x/a_1280.jpg 1280w">',
      ),
    ).toBe("https://x/a_1280.jpg");
  });

  it("falls back to src when there is no srcset, and is undefined with no img", () => {
    expect(firstImageUrl('<p>hi</p><img src="https://x/b.jpg">')).toBe(
      "https://x/b.jpg",
    );
    expect(firstImageUrl("<p>no picture here</p>")).toBeUndefined();
  });
});

describe("deriveTitle", () => {
  it("takes the caption's first sentence", () => {
    expect(deriveTitle("<p>A shoemaker's bench. Shot in 1972.</p>", "s", "1")).toBe(
      "A shoemaker's bench.",
    );
  });

  it("skips a reblog attribution line", () => {
    expect(deriveTitle("<p>nemfrog:</p><p>Fig. 4. Nocturnal moths.</p>", "s", "1")).toBe(
      "Fig. 4. Nocturnal moths.",
    );
  });

  it("falls back to the humanized slug, then to a placeholder", () => {
    expect(deriveTitle("", "a-shoemakers-bench", "1")).toBe(
      "A Shoemakers Bench",
    );
    expect(deriveTitle("", "", "42")).toBe("Untitled post 42");
  });
});
