// Unit tests for the small text-shaping helpers every adapter's toItem() leans on. Ported from
// phase0/harvest.ts (toLede/uniqueTags), which is why the cases below mirror phase0's own findings
// (e.g. sentence-boundary cuts, whitespace collapsing from Wikipedia's plaintext extracts).
import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  htmlToText,
  stripHtml,
  toLede,
  uniqueTags,
} from "./normalize";

describe("toLede", () => {
  it("passes short text through unchanged (after whitespace collapse)", () => {
    expect(toLede("A short sentence.")).toBe("A short sentence.");
  });

  it("collapses internal whitespace and trims", () => {
    expect(toLede("  Multiple   spaces\nand\tnewlines  ")).toBe(
      "Multiple spaces and newlines",
    );
  });

  it("cuts at the last sentence boundary past the halfway point when text exceeds max", () => {
    // Two sentences: the first ends well past the halfway point of a max=40 budget, so the cut
    // should land right after "one." rather than mid-word.
    const text =
      "Sentence one is fairly long indeed. Sentence two continues on and on.";
    const result = toLede(text, 40);
    expect(result).toBe("Sentence one is fairly long indeed.");
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it("hard-cuts with an ellipsis when no sentence boundary exists past the halfway point", () => {
    // No ". " anywhere in the first `max` chars, so toLede falls back to a hard trim + "…".
    const text = "a".repeat(100);
    const result = toLede(text, 40);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBe(41); // 40 chars + the ellipsis
  });

  it("defaults max to 700", () => {
    const text = "word ".repeat(300); // 1500 chars, no sentence punctuation at all
    const result = toLede(text);
    expect(result.length).toBeLessThanOrEqual(701); // 700 + possible "…"
  });
});

describe("uniqueTags", () => {
  it("dedupes exact-duplicate tags", () => {
    expect(uniqueTags(["Astronomy", "Astronomy", "Botany"])).toEqual([
      "Astronomy",
      "Botany",
    ]);
  });

  it("drops null, undefined, and whitespace-only entries", () => {
    expect(uniqueTags(["Astronomy", null, undefined, "   ", "Botany"])).toEqual(
      ["Astronomy", "Botany"],
    );
  });

  it("trims surrounding whitespace on kept tags", () => {
    expect(uniqueTags(["  Astronomy  ", "Botany"])).toEqual([
      "Astronomy",
      "Botany",
    ]);
  });

  it("returns an empty array for an all-empty input", () => {
    expect(uniqueTags([null, undefined, "  "])).toEqual([]);
  });
});

describe("stripHtml", () => {
  it("removes inline tags without leaving a gap where they stood", () => {
    expect(stripHtml("legend. <em>Erato</em> belongs")).toBe(
      "legend. Erato belongs",
    );
  });

  it("drops an italic tag inside parentheses cleanly — the Smithsonian title case", () => {
    // 35 Smithsonian titles arrived like this (Phase 7.2 finding). An inline tag replaced by
    // a *space* would read "( Tsuba )", which is nearly as wrong as the tag itself.
    expect(
      stripHtml("Sword Guard (<i>Tsuba</i>) With the Motif of Sunrise"),
    ).toBe("Sword Guard (Tsuba) With the Motif of Sunrise");
  });

  it("still turns a block-level tag into whitespace", () => {
    expect(stripHtml("Atlas<br>of the Moon<p>Second")).toBe(
      "Atlas of the Moon Second",
    );
  });

  it("replaces adjacent tags with whitespace rather than jamming words together", () => {
    // The CMA case that motivated this function: "<br><br>" sitting directly between a period
    // and the next word must not collapse into "poetry.Here" — a caller running toLede()
    // afterward turns the resulting multi-space gap into a single clean space.
    const result = stripHtml("poetry.<br><br>Here, <em>Iupiter </em>(Jupiter)");
    expect(result).not.toContain("poetry.Here");
    expect(result.replace(/\s+/g, " ").trim()).toBe(
      "poetry. Here, Iupiter (Jupiter)",
    );
  });

  it("passes plain text through unchanged", () => {
    expect(stripHtml("No tags here.")).toBe("No tags here.");
  });
});

describe("decodeEntities", () => {
  it("decodes the entities NASA descriptions actually carry", () => {
    expect(
      decodeEntities("said &quot;a jelly doughnut&quot; &amp; meant it"),
    ).toBe('said "a jelly doughnut" & meant it');
  });

  it("resolves &amp; last, so a double-escaped entity survives one pass intact", () => {
    expect(decodeEntities("&amp;quot;")).toBe("&quot;");
  });

  it("leaves an unrecognized entity alone rather than mangling it", () => {
    expect(decodeEntities("caf&eacute;")).toBe("caf&eacute;");
  });

  // Tumblr's legacy API (the second blog, 09-01-26) writes typographic punctuation as NAMED
  // entities where WordPress writes numeric ones — 30 `&rsquo;` in 200 sampled posts.
  it("decodes the named typographic entities Tumblr captions actually carry", () => {
    expect(
      decodeEntities(
        "A Shoemaker&rsquo;s &ldquo;Essentials&rdquo; 2010&ndash;2011&hellip;",
      ),
    ).toBe("A Shoemaker’s “Essentials” 2010–2011…");
  });
});

describe("htmlToText", () => {
  // WordPress's `title.rendered` and `excerpt.rendered` (Phase 6.3): a <br> inside a title, a <p>
  // wrapper with a trailing newline, and numeric entities for curly quotes and dashes.
  it("turns a WP-rendered title with a <br> into one clean line", () => {
    expect(htmlToText("The Geologic Atlas<br>of the Moon")).toBe(
      "The Geologic Atlas of the Moon",
    );
  });

  it("strips the <p> wrapper and collapses whitespace on an excerpt", () => {
    expect(
      htmlToText(
        "<p>The palette exists so that four billion years can be told apart at a glance.</p>\n",
      ),
    ).toBe(
      "The palette exists so that four billion years can be told apart at a glance.",
    );
  });

  it("decodes numeric entities, decimal and hex, and leaves &amp; for last", () => {
    expect(htmlToText("Rock &#8217;n&#8217; roll &#x2014; &amp;c.")).toBe(
      "Rock \u2019n\u2019 roll \u2014 &c.",
    );
    // A double-escaped sequence resolves ONE level, never two.
    expect(htmlToText("&amp;#8217;")).toBe("&#8217;");
  });
});
