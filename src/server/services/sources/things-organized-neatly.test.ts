// Fixture tests for the second corpus-walk adapter and the first Tumblr one — see
// __fixtures__/things-organized-neatly.json, recorded 09-01-26 from thingsorganizedneatly.tumblr.com's
// legacy /api/read/json (six real posts, trimmed of the like/reblog button markup and the per-post
// `tumblelog` block — ~2 KB of iframe/SVG per post that toItem never reads).
//
// What is pinned here, beyond D5 (image item, blog's own text as summary, body null): the two
// Tumblr post shapes (`photo` with structured fields, `regular` with the image inside the body
// HTML), the title rule for a source that has no title field, and that a thin caption is passed
// through — flooring is structuralFloor's job (docs/HANDOFF_tumblr-walk.md §2), not this adapter's.
//
// No walk() test, consistent with every other adapter: I/O is not the unit-test surface. The
// wrapper parsing and cursor arithmetic are pure and tested separately below.
import { describe, expect, it } from "vitest";

import { BLOG_LICENSE } from "~/server/config/blogs";
import fixtures from "./__fixtures__/things-organized-neatly.json";
import {
  deriveTitle,
  firstImageUrl,
  nextCursor,
  parseTumblrJson,
  thingsorganizedneatly,
  type TonRaw,
} from "./things-organized-neatly";

const raws = fixtures as unknown as TonRaw[];
const byId = (id: string) => {
  const found = raws.find((r) => r.id === id);
  if (!found) throw new Error(`fixture missing: ${id}`);
  return found;
};

describe("thingsorganizedneatly.toItem", () => {
  it("maps a photo post: the 1280 rendition, the caption as summary, body null", () => {
    const item = thingsorganizedneatly.toItem(byId("95566073704"));
    expect(item.source).toBe("thingsorganizedneatly");
    expect(item.sourceId).toBe("95566073704");
    expect(item.type).toBe("image");
    // First sentence of the caption. `&rsquo;` decoded, the `<em>`/`<strong>` wrappers gone
    // without leaving a space inside "f<em>or</em>".
    expect(item.title).toBe("SUBMISSION: A Shoemaker’s Essentials.");
    expect(item.summary).toBe(
      "SUBMISSION: A Shoemaker’s Essentials. Shot by Raniel Hernandez for Straightforward Clothing PH.",
    );
    expect(item.body).toBeNull();
    expect(item.imageUrl).toMatch(
      /^https:\/\/64\.media\.tumblr\.com\/.+_1280\.jpg$/,
    );
    expect(item.sourceUrl).toBe(
      "https://thingsorganizedneatly.tumblr.com/post/95566073704/submission-a-shoemakers",
    );
    expect(item.attribution).toBe("Things Organized Neatly");
    expect(item.license).toBe(BLOG_LICENSE);
    // The blog tags every post with its own name; that tag says nothing about the item.
    expect(item.tags).toEqual(["submission"]);
  });

  it("maps a regular post: the largest srcset rendition out of the body HTML, first line as title", () => {
    const item = thingsorganizedneatly.toItem(byId("823327443988447232"));
    expect(item.imageUrl).toBe(
      "https://64.media.tumblr.com/3291938792de333344be033c1ac5bfff/a3eb3a918150bfe8-8f/s1280x1920/92c62a29810bf9af25f379357e4a52bfcd19fcfc.jpg",
    );
    expect(item.title).toBe("L/IMPRIMERIE");
    expect(item.summary).toBe(
      "L/IMPRIMERIE Photo by: Matthieu Spohn Art Director: Chris Gautschi",
    );
    expect(item.body).toBeNull();
    expect(item.tags).toContain("hmu"); // lowercased on the way in
    expect(item.tags).not.toContain("things organized neatly");
  });

  it("skips a reblog's attribution line when choosing the title, but keeps it in the summary", () => {
    const item = thingsorganizedneatly.toItem(byId("96986440476"));
    expect(item.title).toBe("Backpack daily essentials.");
    expect(item.summary).toBe(
      "chensio: Backpack daily essentials. (via Chensio | VSCO Grid)",
    );
  });

  it("passes a thin caption through untouched — flooring is structuralFloor's job", () => {
    const item = thingsorganizedneatly.toItem(byId("823897312188301312"));
    expect(item.title).toBe("Simon Freund");
    expect(item.summary).toBe(
      "Simon Freund VW Caddy 14D, 2021 4370 x 1640 x 2010 mm",
    );
    expect(item.summary.length).toBeLessThan(60);
  });

  it("gives a captionless, slugless post a placeholder title and an empty summary", () => {
    const item = thingsorganizedneatly.toItem(byId("91980754329"));
    expect(item.title).toBe("Untitled post 91980754329");
    expect(item.summary).toBe("");
    expect(item.imageUrl).toMatch(/^https:\/\/64\.media\.tumblr\.com\//);
    expect(item.tags).toEqual([]);
  });

  it("throws on a post type it does not handle — counted as an error, never silently skipped", () => {
    expect(() => thingsorganizedneatly.toItem(byId("13858459765"))).toThrow(
      /unsupported post type "answer"/,
    );
  });

  it("never lets HTML through in title or summary, on any fixture row", () => {
    for (const raw of raws) {
      let item;
      try {
        item = thingsorganizedneatly.toItem(raw);
      } catch {
        continue;
      }
      expect(item.title).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.summary).not.toMatch(/<[^>]+>|&[#a-z0-9]+;/i);
      expect(item.body).toBeNull();
    }
  });
});

describe("deriveTitle", () => {
  it("takes the first sentence of the first line when one ends within 80 characters", () => {
    expect(
      deriveTitle("<p>Hoppy Easter!!!! Photography: X</p>", "s", "1"),
    ).toBe("Hoppy Easter!!!!");
  });

  it("cuts a long first line at a word boundary with an ellipsis", () => {
    const line = "word ".repeat(30).trim();
    const t = deriveTitle(`<p>${line}</p>`, "s", "1");
    expect(t.length).toBeLessThanOrEqual(80);
    expect(t).toMatch(/…$/);
    expect(t).not.toMatch(/ …$/);
  });

  it("falls back to the humanized slug when the caption is empty", () => {
    expect(deriveTitle("", "kids-wagon-from-todd-mclellans", "1")).toBe(
      "Kids Wagon From Todd Mclellans",
    );
  });

  it("falls back to a placeholder when caption and slug are both empty", () => {
    expect(deriveTitle("", "", "42")).toBe("Untitled post 42");
  });
});

describe("firstImageUrl", () => {
  it("prefers the largest srcset rendition, falls back to src, and takes only the first image", () => {
    expect(
      firstImageUrl(
        '<img src="https://x/s640.jpg" srcset="https://x/s75.jpg 75w, https://x/s1280.jpg 851w"/>' +
          '<img src="https://x/second.jpg"/>',
      ),
    ).toBe("https://x/s1280.jpg");
    expect(
      firstImageUrl('<p>hi</p><img alt="" src="https://x/only.jpg">'),
    ).toBe("https://x/only.jpg");
    expect(firstImageUrl("<p>no picture</p>")).toBeUndefined();
  });
});

describe("parseTumblrJson", () => {
  it("strips the `var tumblr_api_read = …;` wrapper the legacy API puts around its JSON", () => {
    expect(
      parseTumblrJson('var tumblr_api_read = {"posts-total":5522};\n'),
    ).toEqual({ "posts-total": 5522 });
  });

  it("refuses a body that is not the wrapped shape, naming the problem", () => {
    expect(() => parseTumblrJson("<!doctype html>")).toThrow(/tumblr_api_read/);
  });
});

describe("nextCursor", () => {
  it("advances by the number of posts returned and is undefined at the end", () => {
    expect(nextCursor(0, 50, 5522)).toBe("50");
    expect(nextCursor(5450, 50, 5522)).toBe("5500");
    expect(nextCursor(5500, 22, 5522)).toBeUndefined();
    // A page that returned nothing must not loop forever.
    expect(nextCursor(100, 0, 5522)).toBeUndefined();
  });
});
