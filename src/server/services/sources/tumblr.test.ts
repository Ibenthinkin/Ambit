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
import scifiart70sMulti from "./__fixtures__/70sscifiart-multi.json";
import dreamsrecurring from "./__fixtures__/dreamsrecurring.json";
import humanoidhistory from "./__fixtures__/humanoidhistory.json";
import nemfrog from "./__fixtures__/nemfrog.json";
import sovietpostcards from "./__fixtures__/sovietpostcards.json";
import sovietpostcardsMulti from "./__fixtures__/sovietpostcards-multi.json";
import tonFixtures from "./__fixtures__/things-organized-neatly.json";
import thevault from "./__fixtures__/thevaultoftheatomicspaceage.json";
import thisisnthappiness from "./__fixtures__/thisisnthappiness.json";
import toiich from "./__fixtures__/toiich.json";
import vintagegeekculture from "./__fixtures__/vintagegeekculture.json";
import { thingsorganizedneatly } from "./things-organized-neatly";
import {
  allImageRenditions,
  deriveTitle,
  expandPictures,
  firstImageUrl,
  nextCursor,
  capSummary,
  parseTumblrJson,
  stripCaptionChrome,
  tumblrWalker,
  type TumblrRaw,
} from "./tumblr";

/** Every picture of every supported post in `raws`, the way walk() yields them. The fan-out
 *  (09-06-26) means a fixture row is no longer one item, so no test may call toItem on a raw. */
function pictures(raws: TumblrRaw[], blogId: string) {
  return raws
    .filter((r) => SUPPORTED.has(r.type))
    .flatMap((r) => expandPictures(r, blogId));
}

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

  // `sourceId` is the one field that diverges by design as of 09-06-26: the factory fans a post
  // out into one item per picture and ids them `<post>:<n>`, where the bespoke adapter — frozen,
  // with 1,720 single-picture rows behind it — keeps the bare post id. So equivalence is asserted
  // on every OTHER field, and on the id's relationship to the bespoke one, for the post's first
  // picture. Its two other deliberate divergences (the ALT badge strip and the 600-char cap) fire
  // on neither this fixture nor those rows; if a future fixture row trips one, this says so.
  it("produces what things-organized-neatly.ts does on every field but the fanned-out id", () => {
    for (const raw of raws) {
      if (!SUPPORTED.has(raw.type)) continue;
      const first = expandPictures(raw, "thingsorganizedneatly")[0]!;
      const { sourceId, curationImageUrl, ...mine } = walker.toItem(first);
      const { sourceId: bespokeId, ...theirs } =
        thingsorganizedneatly.toItem(raw);
      expect(mine).toEqual(theirs);
      expect(sourceId).toBe(`${bespokeId}:1`);
      // The other by-design divergence: the factory may name a curation rendition where the
      // bespoke adapter has no such field. It is never stored and never replaces `imageUrl`,
      // which is why it is excluded from the equivalence above rather than breaking it.
      if (curationImageUrl !== undefined) {
        expect(curationImageUrl).not.toBe(theirs.imageUrl);
      }
    }
  });

  it("drops the blog's self-tag exactly as the bespoke adapter's BLOG_TAG does", () => {
    const tagged = raws.find((r) =>
      (r.tags ?? []).some((t) => t.toLowerCase() === "things organized neatly"),
    );
    expect(tagged, "fixture should contain a self-tagged post").toBeDefined();
    expect(
      walker.toItem(expandPictures(tagged!, "thingsorganizedneatly")[0]!).tags,
    ).not.toContain("things organized neatly");
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

  it("maps every picture of every supported fixture row to a valid link-card item", () => {
    const supported = pictures(raws, id);
    expect(supported.length).toBeGreaterThan(0);
    for (const raw of supported) {
      const item = walker.toItem(raw);
      expect(item.source).toBe(id);
      expect(item.sourceId).toBe(`${raw.id}:${raw.pictureIndex}`);
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
    for (const raw of pictures(raws, id)) {
      const item = walker.toItem(raw);
      expect(item.title).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.summary).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      // Every title says something — no bare punctuation left over from stripped markup.
      expect(item.title).toMatch(/[\p{L}\p{N}]/u);
    }
  });

  it("throws on a post type that carries no picture, naming the blog", () => {
    const other = raws.find((r) => !SUPPORTED.has(r.type));
    if (!other) return; // not every archive had one within the sampled depths
    // The failure survives the fan-out as one sentinel raw, so it stays exactly one toItem error.
    const expanded = expandPictures(other, id);
    expect(expanded).toHaveLength(1);
    expect(() => walker.toItem(expanded[0]!)).toThrow(
      new RegExp(`^${id}: unsupported post type "${other.type}"`),
    );
  });
});

describe("every blog row declaring walk: tumblr has a fixture and a walker", () => {
  it("covers all of them", () => {
    const tumblrRows = BLOGS.filter((b) => b.walk === "tumblr").map(
      (b) => b.id,
    );
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
    expect(stripCaptionChrome(caption)).not.toMatch(
      /ALT|tmblr-alt-text-helper/,
    );
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
    const item = walker.toItem(
      expandPictures(
        {
          id: "1",
          type: "photo",
          slug: "s",
          url: "https://70sscifiart.tumblr.com/post/1",
          "photo-url-1280": "https://x/a_1280.jpg",
          "photo-caption":
            '<span class="tmblr-alt-text-helper">ALT</span><p>' +
            "Esteban Maroto. ".repeat(80) +
            "</p>",
        },
        "70sscifiart",
      )[0]!,
    );
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
    expect(
      deriveTitle("<p>A shoemaker's bench. Shot in 1972.</p>", "s", "Blog"),
    ).toBe("A shoemaker's bench.");
  });

  it("skips a reblog attribution line", () => {
    expect(
      deriveTitle(
        "<p>nemfrog:</p><p>Fig. 4. Nocturnal moths.</p>",
        "s",
        "Blog",
      ),
    ).toBe("Fig. 4. Nocturnal moths.");
  });

  // Found in the 09-06-26 sovietpostcards sample: a reblog of a PRIVATE blog leaves a caption
  // line of exactly ":" where the blog's name would be, and that became the card's title. The
  // floor used to drop such a post; it does not any more.
  it("skips a caption line with no letters or digits in it", () => {
    expect(
      deriveTitle(
        '<p><a class="tumblr_blog" href="x"></a>:</p><p>Kyiv, 1974.</p>',
        "",
        "Blog",
      ),
    ).toBe("Kyiv, 1974.");
    // …and falls through to the label when the punctuation is all there is.
    expect(deriveTitle("<p>:</p>", "", "Blog")).toBe("Blog");
  });

  it("falls back to the humanized slug, then to the blog's label", () => {
    expect(deriveTitle("", "a-shoemakers-bench", "Blog")).toBe(
      "A Shoemakers Bench",
    );
    // The caption-less case, which is the usual one on two of the four blogs and which the floor
    // now keeps (09-06-26). The label is what a reader sees, so it must be the label.
    expect(deriveTitle("", "", "The Vault of the Atomic Space Age")).toBe(
      "The Vault of the Atomic Space Age",
    );
  });
});

// ── the fan-out (09-06-26, docs/PLAN_caption-less-and-wild.md T1) ────────────
// Two fixtures recorded live the same day for exactly these shapes: a sovietpostcards `regular`
// post whose body carries six inline <img> tags, and a 70sscifiart `photo` post whose `photos[]`
// array holds three. Before the fan-out each of those was ONE item and the rest of the post was
// never stored at all.
describe("expandPictures — a post is one item per picture", () => {
  const soviet = sovietpostcardsMulti as unknown as TumblrRaw[];
  const scifi = scifiart70sMulti as unknown as TumblrRaw[];
  const sovietWalker = tumblrWalker(blogConfig("sovietpostcards")!);
  const scifiWalker = tumblrWalker(blogConfig("70sscifiart")!);

  it("a 6-image regular post yields 6 items, ids :1..:6, one caption, distinct pictures", () => {
    const post = soviet.find(
      (r) => (r["regular-body"]?.match(/<img\b/gi) ?? []).length === 6,
    )!;
    expect(post, "fixture should hold a 6-image post").toBeDefined();
    const expanded = expandPictures(post, "sovietpostcards");
    expect(expanded).toHaveLength(6);
    const items = expanded.map((p) => sovietWalker.toItem(p));

    expect(items.map((i) => i.sourceId)).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => `${post.id}:${n}`),
    );
    // The caption describes the set, so every picture of it carries the same one.
    expect(new Set(items.map((i) => i.title)).size).toBe(1);
    expect(new Set(items.map((i) => i.summary)).size).toBe(1);
    expect(new Set(items.map((i) => JSON.stringify(i.tags))).size).toBe(1);
    // …and the link card links to the post, not to a picture.
    expect(new Set(items.map((i) => i.sourceUrl)).size).toBe(1);
    // Six different pictures, in the order the body lists them.
    expect(new Set(items.map((i) => i.imageUrl)).size).toBe(6);
    expect(items.map((i) => i.imageUrl)).toEqual(
      allImageRenditions(post["regular-body"]!).map((r) => r.url),
    );
    expect(expanded.every((p) => p.pictureCount === 6)).toBe(true);
  });

  it("a photoset yields one item per photos[] entry", () => {
    const post = scifi.find((r) => (r.photos?.length ?? 0) > 1)!;
    expect(post, "fixture should hold a photoset").toBeDefined();
    const expanded = expandPictures(post, "70sscifiart");
    expect(expanded).toHaveLength(post.photos!.length);
    expect(expanded.map((p) => p.pictureUrl)).toEqual(
      post.photos!.map((ph) => ph["photo-url-1280"]),
    );
    const items = expanded.map((p) => scifiWalker.toItem(p));
    expect(items.map((i) => i.sourceId)).toEqual(
      post.photos!.map((_, n) => `${post.id}:${n + 1}`),
    );
  });

  it("a single-picture post is still fanned out, to :1", () => {
    const single: TumblrRaw = {
      id: "77",
      type: "photo",
      slug: "",
      url: "https://70sscifiart.tumblr.com/post/77",
      "photo-url-1280": "https://x/a_1280.jpg",
      "photo-caption": "<p>Chris Foss, 1978.</p>",
    };
    const expanded = expandPictures(single, "70sscifiart");
    expect(expanded).toHaveLength(1);
    expect(expanded[0]!.pictureIndex).toBe(1);
    expect(expanded[0]!.pictureCount).toBe(1);
    expect(scifiWalker.toItem(expanded[0]!).sourceId).toBe("77:1");
  });

  it("a picture-less post costs one toItem error and the rest of the page survives", () => {
    const page = [
      { id: "1", type: "answer", url: "https://70sscifiart.tumblr.com/post/1" },
      {
        id: "2",
        type: "photo",
        slug: "",
        url: "https://70sscifiart.tumblr.com/post/2",
        "photo-url-1280": "https://x/b_1280.jpg",
        "photo-caption": "<p>Angus McKie.</p>",
      },
    ] as TumblrRaw[];
    const expanded = page.flatMap((p) => expandPictures(p, "70sscifiart"));
    expect(expanded).toHaveLength(2);
    // The sentinel carries the original message forward rather than killing the page.
    expect(() => scifiWalker.toItem(expanded[0]!)).toThrow(
      /^70sscifiart: unsupported post type "answer"/,
    );
    expect(scifiWalker.toItem(expanded[1]!).sourceId).toBe("2:1");
  });

  it("a photo post with no photo-url-1280 yields one sentinel, not zero items", () => {
    const expanded = expandPictures(
      { id: "3", type: "photo", url: "https://70sscifiart.tumblr.com/post/3" },
      "70sscifiart",
    );
    expect(expanded).toHaveLength(1);
    expect(() => scifiWalker.toItem(expanded[0]!)).toThrow(
      /^70sscifiart: photo post 3 has no photo-url-1280/,
    );
  });

  it("titles a caption-less post with the blog's label and leaves the summary empty", () => {
    const vault = tumblrWalker(blogConfig("thevaultoftheatomicspaceage")!);
    const item = vault.toItem(
      expandPictures(
        {
          id: "9",
          type: "regular",
          slug: "",
          url: "https://thevaultoftheatomicspaceage.tumblr.com/post/9",
          "regular-body": '<figure><img src="https://x/c.jpg"></figure>',
        },
        "thevaultoftheatomicspaceage",
      )[0]!,
    );
    expect(item.title).toBe("The Vault of the Atomic Space Age");
    expect(item.summary).toBe("");
  });
});

describe("allImageRenditions — the stored picture and the one the curator is shown", () => {
  it("returns every img in document order, each at its largest rendition", () => {
    const html =
      '<img src="https://x/a_640.jpg" srcset="https://x/a_75.jpg 75w, https://x/a_1280.jpg 1280w">' +
      '<p>and</p><img src="https://x/b.jpg">';
    expect(allImageRenditions(html).map((r) => r.url)).toEqual([
      "https://x/a_1280.jpg",
      "https://x/b.jpg",
    ]);
  });

  it("names the srcset candidate nearest 500px as the curation rendition", () => {
    const [r] = allImageRenditions(
      '<img src="https://x/a_640.jpg" srcset="https://x/a_75.jpg 75w, ' +
        'https://x/a_500.jpg 500w, https://x/a_1280.jpg 1280w">',
    );
    expect(r!.url).toBe("https://x/a_1280.jpg");
    expect(r!.curationUrl).toBe("https://x/a_500.jpg");
  });

  it("names none when the picture has only one size", () => {
    const [r] = allImageRenditions('<img src="https://x/b.jpg">');
    expect(r!.url).toBe("https://x/b.jpg");
    expect(r!.curationUrl).toBeUndefined();
  });

  it("carries a photoset's photo-url-500 through to curationImageUrl", () => {
    const scifi = scifiart70sMulti as unknown as TumblrRaw[];
    const post = scifi.find((r) => (r.photos?.length ?? 0) > 1)!;
    const items = expandPictures(post, "70sscifiart").map((p) =>
      tumblrWalker(blogConfig("70sscifiart")!).toItem(p),
    );
    expect(items[0]!.imageUrl).toBe(post.photos![0]!["photo-url-1280"]);
    expect(items[0]!.curationImageUrl).toBe(post.photos![0]!["photo-url-500"]);
    // Never a substitute for the stored picture.
    expect(items[0]!.curationImageUrl).not.toBe(items[0]!.imageUrl);
  });

  it("carries an inline post's ~500 srcset candidate through to curationImageUrl", () => {
    const soviet = sovietpostcardsMulti as unknown as TumblrRaw[];
    const items = expandPictures(soviet[0]!, "sovietpostcards").map((p) =>
      tumblrWalker(blogConfig("sovietpostcards")!).toItem(p),
    );
    expect(items[0]!.curationImageUrl).toMatch(/s500x/);
    expect(items[0]!.imageUrl).not.toBe(items[0]!.curationImageUrl);
  });
});
