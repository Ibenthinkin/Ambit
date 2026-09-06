// The Tumblr-walk factory (sources round 3, 09-05-26): one `CorpusWalkAdapter` per Tumblr blog,
// built from its `BlogConfig` row. A new Tumblr blog is a config row plus one registration line;
// the walk logic lives here once.
//
// **Relationship to things-organized-neatly.ts.** That file is the bespoke original — blog #2,
// written as "YAGNI until the next Tumblr blog" — and it stays exactly as it is, the same call
// Ben made for doorofperception when wp-rest.ts was extracted: it is shipped code with real rows
// behind it, and re-pointing it at a factory would re-key nothing but could only introduce risk.
// This factory carries the same verified facts, and `tumblr.test.ts` proves it: fed
// thingsorganizedneatly's config and fixture, it produces byte-identical items. If a fact below
// changes, change it there too.
//
// **The API.** Tumblr's LEGACY read endpoint — `/api/read/json?start=N&num=M` — which every blog
// probed still answers, unauthenticated, on its own host. It hands back posts as JSON wrapped in
// a `var` statement (see parseTumblrJson), with the picture's URL, the caption HTML and the
// post's own tags. No HTML page is scraped and no API key exists to leak.
//
// **What one item is.** One POST → one `image` item, the same link-card shape as every blog:
// the post's picture, the post's own caption as `summary`, `body` ALWAYS null (6.3 D5). Tumblr
// posts come in several `type`s; the two that carry a picture are handled —
//   - `photo`   : the picture is a structured field (`photo-url-1280`), the caption `photo-caption`;
//   - `regular` : a post from Tumblr's newer editor — the picture is an `<img>` INSIDE
//                 `regular-body`'s HTML, and the caption is the rest of that HTML.
// Anything else (`answer`, `quote`, `link`, `video`, …) has no picture to be a card of: toItem
// throws, ingest counts it, and nothing is silently skipped.
//
// **Facts this rests on (verified live 09-05-26, 200 posts sampled across each of nine
// archives).** The two shapes above cover 94–100% of every archive sampled; the remainder is
// `answer`/`quote`/`link`/`video`, which carry no picture by definition. Every `photo` post
// sampled carried `photo-url-1280`. `regular-title` is usually empty and `photo` posts have no
// title field at all — hence deriveTitle(). Caption length varies enormously between blogs (a
// median of 93 characters on nemfrog, 0 on thevaultoftheatomicspaceage), which is a
// structuralFloor question and deliberately not this file's: a thin caption is passed through
// and floored, never padded here.
//
// **Etiquette.** robots.txt is checked at the start of every walk (robots.ts). Every Tumblr host
// serves the platform's default file, which asks `Crawl-delay: 1`, so DELAY_MS is 1 s and
// requests are sequential. That file's named-bot block list is Tumblr's platform default rather
// than any one blog's policy, and does not name Ambit — Ben's standing call, first made for
// thingsorganizedneatly with the file in front of him (docs/HANDOFF_tumblr-walk.md §3.4). A
// 401/403 ends the walk on the first response (fetchTextResponse's noRetryOn).
import type { BlogConfig } from "~/server/config/blogs";
import { fetchTextResponse } from "./http";
import { htmlToText, uniqueTags } from "./normalize";
import { assertCrawlAllowed } from "./robots";
import type {
  CorpusWalkAdapter,
  FetchOpts,
  NormalizedItem,
  WalkPage,
} from "./types";

/** The legacy API's maximum `num`. */
const PER_PAGE = 50;
/** Tumblr's platform robots.txt asks `Crawl-delay: 1`; a stated delay always wins. */
const DELAY_MS = 1000;

/** One post from /api/read/json — the fields toItem reads, nothing more. Tumblr's field names
 *  carry hyphens, hence the quoting. */
export interface TumblrRaw {
  id: string;
  type: string;
  /** Empty (not absent) on a post with no caption text — Tumblr slugs the caption. */
  slug?: string;
  url: string;
  "url-with-slug"?: string;
  tags?: string[];
  // type === "photo"
  "photo-caption"?: string;
  "photo-url-1280"?: string;
  // type === "regular"
  "regular-title"?: string;
  "regular-body"?: string;
}

/**
 * Pure: the legacy API answers `var tumblr_api_read = {...};` — a script, not a JSON document —
 * so the body arrives as text and is unwrapped here. Anything else (an HTML error page, a
 * challenge) is refused by name rather than handed to JSON.parse to fail obscurely.
 */
export function parseTumblrJson(text: string, blogId = "tumblr"): unknown {
  const m = /^\s*var tumblr_api_read = ([\s\S]*?);?\s*$/.exec(text);
  if (!m) {
    throw new Error(
      `${blogId}: response is not the \`var tumblr_api_read = …;\` shape the legacy API promises`,
    );
  }
  return JSON.parse(m[1]!);
}

/**
 * Pure: the cursor for the page after the one that started at `start` and returned `returned`
 * posts, or undefined when that was the last. An empty page ends the walk too — a cursor that
 * never advances is a walk that never ends. (Offset pagination over a newest-first list: a post
 * published mid-walk shifts everything by one and one post is seen twice; the DB's
 * (source, source_id) key makes that harmless.)
 */
export function nextCursor(
  start: number,
  returned: number,
  total: number,
): string | undefined {
  const next = start + returned;
  return returned > 0 && next < total ? String(next) : undefined;
}

/**
 * Pure: the first `<img>` in a body — its largest `srcset` rendition when it lists any (the
 * newer editor lists 75w…1280w), else its `src` (the 640 px rendition). One picture per post,
 * the same D1 rule as every blog: the rest of a multi-image post never becomes an item.
 */
export function firstImageUrl(html: string): string | undefined {
  const tag = /<img\b[^>]*>/i.exec(html)?.[0];
  if (!tag) return undefined;
  const srcset = /\bsrcset="([^"]*)"/i.exec(tag)?.[1];
  // Each candidate is "url 851w"; trimmed and non-empty, so its first token is a real URL.
  const candidates =
    srcset
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const largest = candidates[candidates.length - 1]?.split(/\s+/)[0];
  return largest ?? /\bsrc="([^"]+)"/i.exec(tag)?.[1];
}

/**
 * Tumblr's newer editor emits its alt-text UI badge INSIDE the caption markup, as
 * `<span class="tmblr-alt-text-helper">ALT</span>` after each `<img>`. It is chrome, not content:
 * htmlToText() turns it into the literal word "ALT", which then becomes a card's title (35 of 146
 * sampled 70sscifiart captions on 09-05-26, 24%). Stripped span-and-all before any text is taken,
 * so it can reach neither the title nor the summary.
 *
 * No stored row carries it — thingsorganizedneatly's 1,720 rows were checked and are clean, which
 * is why this lives here rather than in a repair script. things-organized-neatly.ts, the frozen
 * bespoke walker, has the same latent gap; see docs/HANDOFF_tumblr-round3.md.
 */
const ALT_BADGE = /<span[^>]*\bclass="[^"]*\btmblr-alt-text-helper\b[^"]*"[^>]*>.*?<\/span>/gi;

export function stripCaptionChrome(html: string): string {
  return html.replace(ALT_BADGE, "");
}

/**
 * The longest summary Ambit will store for a blog link card. A card is "a single image or short
 * excerpt + a credit + a link to the original, never a republished article" (CLAUDE.md's
 * 08-20-26 rights posture), and most Tumblr captions are a line or two — but a blog answering an
 * ask writes an essay in the same field: vintagegeekculture's caption p99 is 5,582 characters and
 * its longest sampled is 12,268. Storing that is republishing it, whatever the field is called.
 *
 * 600 is the corpus's own norm rather than a number invented here: the three blogs already
 * ingested sit at a p95 of 199 / 410 / 506 characters, and pdr's longest row is 590. A capped
 * card still says enough to be worth a click, which is the whole point of the link-out.
 */
const SUMMARY_MAX = 600;

/** Pure: `text` cut to SUMMARY_MAX at a word boundary, with an ellipsis, or unchanged if short. */
export function capSummary(text: string): string {
  if (text.length <= SUMMARY_MAX) return text;
  return text.slice(0, SUMMARY_MAX - 1).replace(/\s+\S*$/, "") + "…";
}

const TITLE_MAX = 80;
/** A reblog's first line is the reblogged blog's name and a colon — attribution, not a title. */
const ATTRIBUTION_LINE = /^\S+:$/;

/**
 * Pure: a title for a source that has none. The caption's first line — first sentence of it,
 * when one ends within TITLE_MAX — skipping a reblog attribution line; else the slug, humanized;
 * else a placeholder. The placeholder can never reach a reader: a post with no caption has an
 * empty `summary`, which structuralFloor drops.  It exists so toItem always returns a valid item.
 */
export function deriveTitle(
  captionHtml: string,
  slug: string,
  id: string,
): string {
  const line = captionLines(captionHtml).find((l) => !ATTRIBUTION_LINE.test(l));
  if (line) return firstSentence(line);
  if (slug) {
    return slug
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return `Untitled post ${id}`;
}

/** The caption cut where its HTML cuts it — block closers and `<br>` — each line as plain text. */
function captionLines(html: string): string[] {
  return html
    .replace(/<br\s*\/?>|<\/(?:p|div|figure|blockquote|li|h[1-6])>/gi, "\n")
    .split("\n")
    .map(htmlToText)
    .filter(Boolean);
}

/** The first sentence of `line` if one ends within TITLE_MAX (and is not a bare "Mr."), else the
 *  line, cut at a word boundary with an ellipsis when it runs long. */
function firstSentence(line: string): string {
  const sentence = /^(.{11,}?[.!?]+)(?:\s|$)/.exec(line)?.[1] ?? line;
  if (sentence.length <= TITLE_MAX) return sentence;
  return sentence.slice(0, TITLE_MAX - 1).replace(/\s+\S*$/, "") + "…";
}

/** The picture and the caption HTML, by post type — the one place the two shapes differ. */
function picture(
  raw: TumblrRaw,
  blogId: string,
): { imageUrl: string; captionHtml: string } {
  switch (raw.type) {
    case "photo": {
      const imageUrl = raw["photo-url-1280"];
      if (!imageUrl) {
        throw new Error(`${blogId}: photo post ${raw.id} has no photo-url-1280`);
      }
      return {
        imageUrl,
        captionHtml: stripCaptionChrome(raw["photo-caption"] ?? ""),
      };
    }
    case "regular": {
      const body = stripCaptionChrome(raw["regular-body"] ?? "");
      const imageUrl = firstImageUrl(body);
      if (!imageUrl) {
        throw new Error(`${blogId}: regular post ${raw.id} has no image`);
      }
      // Usually empty; when a title IS set it is the caption's natural first line, so it goes in
      // front of the body for both deriveTitle and the summary.
      const title = raw["regular-title"];
      return { imageUrl, captionHtml: title ? `<p>${title}</p>${body}` : body };
    }
    default:
      throw new Error(
        `${blogId}: unsupported post type "${raw.type}" (post ${raw.id})`,
      );
  }
}

export function tumblrWalker(blog: BlogConfig): CorpusWalkAdapter<TumblrRaw> {
  // A blog that tags every post with its own name says nothing about the item that way, and it
  // would take one of the twelve tag slots the curator reads. Config, not a guess: `selfTags` is
  // the blog's own row, already lowercased there.
  const selfTags = new Set(blog.selfTags ?? []);

  async function walk(
    cursor?: string,
    opts?: FetchOpts,
  ): Promise<WalkPage<TumblrRaw>> {
    const start = cursor === undefined ? 0 : Number(cursor);
    if (!Number.isInteger(start) || start < 0) {
      throw new Error(`${blog.id}: bad cursor "${cursor}"`);
    }
    // Offset 0 is the start of a walk: check the policy file before anything else.
    if (start === 0) await assertCrawlAllowed(blog.baseUrl);

    // `limit` bounds this page's size so `--quota N` can do a cheap structural check.
    const num = Math.max(1, Math.min(PER_PAGE, opts?.limit ?? PER_PAGE));
    const url = `${blog.baseUrl}/api/read/json?start=${start}&num=${num}`;
    const { text } = await fetchTextResponse(url, {
      delayMs: DELAY_MS,
      noRetryOn: [401, 403],
    });
    const page = parseTumblrJson(text, blog.id) as {
      "posts-total": number;
      posts: TumblrRaw[];
    };
    return {
      raw: page.posts,
      next: nextCursor(start, page.posts.length, page["posts-total"]),
    };
  }

  function toItem(raw: TumblrRaw): NormalizedItem {
    const { imageUrl, captionHtml } = picture(raw, blog.id);
    return {
      source: blog.id,
      // The numeric post id, not the slug: it is present and permanent on every post type, where
      // the slug is empty on any post without caption text. (source, sourceId) is the
      // idempotency key, so this choice is permanent for the corpus.
      sourceId: raw.id,
      type: "image",
      title: deriveTitle(captionHtml, raw.slug ?? "", raw.id),
      // The blog's own caption IS the blurb (6.3 D5), however short. A thin one is floored by
      // structuralFloor's thin-summary rule like any museum stub — never padded here — and a
      // very long one is cut to an excerpt by capSummary, which is the rights posture in code.
      summary: capSummary(htmlToText(captionHtml)),
      // Always null for a blog item — the invariant source-invariants.test.ts asserts.
      body: null,
      imageUrl,
      // The readable permalink. On a captionless post there is no slug and the API sends the
      // bare `url` in this field too — present, never empty — so `??` is exact.
      sourceUrl: raw["url-with-slug"] ?? raw.url,
      attribution: blog.label,
      license: blog.license,
      tags: uniqueTags(
        (raw.tags ?? [])
          .map((t) => t.toLowerCase())
          .filter((t) => !selfTags.has(t)),
      ),
    };
  }

  return { source: blog.id, walk, toItem };
}
