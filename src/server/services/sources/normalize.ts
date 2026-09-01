// Small text-shaping helpers shared by every adapter's toItem(). Ported verbatim in spirit from
// phase0/harvest.ts (toLede, uniqueTags) — the same functions that produced the corpus the topic
// graph and curation prompt were validated against, so the real adapters keep behaving the way
// Phase 0's findings assumed.

/**
 * Collapse whitespace (Wikipedia's plaintext extracts, in particular, come back with irregular
 * runs of spaces/newlines) and trim to a lede-sized string, cutting at a sentence boundary where
 * one exists past the halfway point — a hard mid-word cut reads worse than a shorter-but-clean one.
 */
export function toLede(text: string, max = 700): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = cut.lastIndexOf(". ");
  return lastStop > max * 0.5
    ? cut.slice(0, lastStop + 1)
    : cut.trimEnd() + "…";
}

/**
 * Dedupe a tag list, dropping null/undefined/whitespace-only entries and trimming what's kept.
 * Every source hands toItem() a slightly different raw tag shape (Wikipedia categories, Met
 * department/medium/culture, CMA type/technique, ...) — this is the one place that mess gets
 * cleaned up before it lands on `item.tags`.
 */
export function uniqueTags(tags: (string | null | undefined)[]): string[] {
  return [
    ...new Set(
      tags.filter((t): t is string => Boolean(t?.trim())).map((t) => t.trim()),
    ),
  ];
}

/**
 * Tags that sit *inside* a run of text rather than between blocks of it. Removing one of these
 * must leave no trace: `(<i>Tsuba</i>)` is `(Tsuba)`, not `( Tsuba )`. Everything not listed is
 * treated as block-level and becomes a space — see stripHtml() below for why.
 */
const INLINE_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "cite",
  "code",
  "em",
  "i",
  "mark",
  "q",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
]);

/**
 * Strip HTML tags from a string. A *block-level* tag becomes a space rather than nothing — a
 * naive removal would jam adjacent words together wherever a tag touches text on both sides
 * (CMA's `<br><br>Here,` would otherwise become `poetry.Here,`, one run-on word). An *inline* tag
 * (`<i>`, `<em>`, …) is removed outright: it wraps a word mid-sentence, and a space in its place
 * reads as a typo — 35 Smithsonian titles of the shape `Sword Guard (<i>Tsuba</i>)` are what
 * settled this in Phase 8.1 (the 7.2 markup finding). The caller is expected to follow this with
 * toLede()/whitespace-collapse, which cleans up any extra spaces the block case leaves.
 *
 * CMA's `description` field is the source that made this necessary (Phase 3.2b): it carries raw
 * `<em>`/`<br>` markup the API docs don't mention, and CLAUDE.md is explicit that source HTML
 * must never reach the app unsanitized — `item.summary` is meant to be safe plain text everywhere.
 */
export function stripHtml(text: string): string {
  return text.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (_, name: string) =>
    INLINE_TAGS.has(name.toLowerCase()) ? "" : " ",
  );
}

/**
 * Decode the handful of HTML character entities that survive stripHtml() — which removes *tags*
 * and would happily leave `&quot;` sitting in the middle of a summary. Only the entities actually
 * observed in source data are handled, plus the numeric form for a straight apostrophe: a general
 * entity decoder is a much larger thing than any source here needs, and an incomplete one that
 * pretends otherwise is worse than a short honest list.
 *
 * NASA's image library (Phase 6.2) is what made this necessary: 13 of 600 sampled descriptions
 * carried `&quot;` or `&amp;` around quoted scientist remarks. `&amp;` is decoded last so an
 * already-escaped sequence like `&amp;quot;` resolves to `&quot;` rather than to a bare quote.
 *
 * Numeric forms (decimal and hex) were added for WordPress (Phase 6.3), which renders curly
 * quotes and dashes as `&#8217;` / `&#x2014;` rather than as named entities.
 *
 * The NAMED typographic forms were added for Tumblr's legacy API (the second blog, 09-01-26),
 * which writes the same punctuation as `&rsquo;` / `&ldquo;` / `&hellip;` / `&ndash;` — 30
 * `&rsquo;` in 200 sampled captions. Each observed entity's obvious partner (`&lsquo;`,
 * `&mdash;`) is included with it; the list is still a list, not a decoder.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&amp;/g, "&");
}

/**
 * The whole chain for a field that arrives as rendered HTML — WordPress's `title.rendered` and
 * `excerpt.rendered` (Phase 6.3). Tags → spaces, entities → characters, whitespace → single
 * spaces, trimmed. Produces plain text and only plain text: this is the line that keeps CLAUDE.md's
 * "never render unsanitized source HTML" true for blogs, because nothing HTML-shaped survives it.
 */
export function htmlToText(html: string): string {
  return decodeEntities(stripHtml(html)).replace(/\s+/g, " ").trim();
}
