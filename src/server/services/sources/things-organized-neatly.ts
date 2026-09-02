// The second corpus-walk adapter and the first over Tumblr (docs/HANDOFF_tumblr-walk.md):
// thingsorganizedneatly.tumblr.com, over Tumblr's LEGACY read API — `/api/read/json?start=N&num=M`
// — which every Tumblr blog still answers, unauthenticated, on its own host. No HTML page is
// scraped: the API hands back posts as JSON (wrapped in a `var` statement, see parseTumblrJson),
// with the picture's URL, the caption HTML and the post's own tags. 5,522 posts as of 09-01-26,
// fifty a page, so a full walk is ~111 requests.
//
// **What one item is.** One POST → one `image` item, the same link-card shape as doorofperception:
// the post's picture, the post's own caption as `summary`, `body` ALWAYS null (D5). Tumblr posts
// come in several `type`s; the two that carry a picture are handled —
//   - `photo`   : the picture is a structured field (`photo-url-1280`), the caption `photo-caption`;
//   - `regular` : a post from Tumblr's newer editor — the picture is an `<img>` INSIDE
//                 `regular-body`'s HTML, and the caption is the rest of that HTML.
// Anything else (`answer`, `quote`, `link`, `video`, …) has no picture to be a card of: toItem
// throws, ingest counts it, and nothing is silently skipped.
//
// **Facts this was built on (verified 09-01-26, 200 posts sampled across the archive):** `photo`
// 162, `regular` 37, `answer` 1. Every `photo` post carried `photo-url-1280` (162/162) and every
// `regular` post an `<img>` (37/37). 36 of 37 `regular` posts had an EMPTY `regular-title`, and
// `photo` posts have no title field at all — hence deriveTitle(). 121 of 200 captions sat under
// structuralFloor's 60-character line and 52 were empty: a far higher floor rate than
// doorofperception's 3-in-390, and accepted on purpose — a thin caption floors like any museum
// stub and is never padded here (HANDOFF §2). robots.txt asks `Crawl-delay: 1`, so DELAY_MS is 1 s.
//
// **Etiquette.** robots.txt is checked at the start of every walk (robots.ts). This host's
// named-bot block list is Tumblr's platform default, not this blog's own policy, and does not
// name Ambit (HANDOFF §3.4). Requests are 1 s apart and sequential; a 401/403 ends the walk on
// the first response (fetchTextResponse's noRetryOn).
import { blogConfig } from "~/server/config/blogs";
import { fetchTextResponse } from "./http";
import { htmlToText, uniqueTags } from "./normalize";
import { assertCrawlAllowed } from "./robots";
import type {
  CorpusWalkAdapter,
  FetchOpts,
  NormalizedItem,
  WalkPage,
} from "./types";

const BLOG = blogConfig("thingsorganizedneatly")!;
/** The legacy API's maximum `num`. */
const PER_PAGE = 50;
/** robots.txt: `Crawl-delay: 1`. doorofperception's 500 ms is the floor; a stated delay wins. */
const DELAY_MS = 1000;
/** The blog tags every post with its own name. It says nothing about the item, and it would
 *  take one of the twelve tag slots the curator reads. */
const BLOG_TAG = "things organized neatly";

/** One post from /api/read/json — the fields toItem reads, nothing more. Tumblr's field names
 *  carry hyphens, hence the quoting. */
export interface TonRaw {
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
export function parseTumblrJson(text: string): unknown {
  const m = /^\s*var tumblr_api_read = ([\s\S]*?);?\s*$/.exec(text);
  if (!m) {
    throw new Error(
      "thingsorganizedneatly: response is not the `var tumblr_api_read = …;` shape the legacy API promises",
    );
  }
  return JSON.parse(m[1]!);
}

/**
 * Pure: the cursor for the page after the one that started at `start` and returned `returned`
 * posts, or undefined when that was the last. An empty page ends the walk too — a cursor that
 * never advances is a walk that never ends. (Offset pagination over a newest-first list: a post
 * published mid-walk shifts everything by one and one post is seen twice; the DB's
 * (source, sourceId) key makes that harmless.)
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
 * newer editor lists 75w…1280w), else its `src` (the 640 px rendition). One picture per post, the
 * same D1 rule as doorofperception's featured image: the rest of a multi-image post never becomes
 * an item.
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

const TITLE_MAX = 80;
/** A reblog's first line is the reblogged blog's name and a colon — attribution, not a title. */
const ATTRIBUTION_LINE = /^\S+:$/;

/**
 * Pure: a title for a source that has none. The caption's first line — first sentence of it,
 * when one ends within TITLE_MAX — skipping a reblog attribution line; else the slug, humanized;
 * else a placeholder. The placeholder can never reach a reader: a post with no caption has an
 * empty `summary`, which structuralFloor drops. It exists so toItem always returns a valid item.
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

async function walk(
  cursor?: string,
  opts?: FetchOpts,
): Promise<WalkPage<TonRaw>> {
  const start = cursor === undefined ? 0 : Number(cursor);
  if (!Number.isInteger(start) || start < 0) {
    throw new Error(`thingsorganizedneatly: bad cursor "${cursor}"`);
  }
  // Offset 0 is the start of a walk: check the policy file before anything else.
  if (start === 0) await assertCrawlAllowed(BLOG.baseUrl);

  // `limit` bounds this page's size so `--quota N` can do a cheap structural check.
  const num = Math.max(1, Math.min(PER_PAGE, opts?.limit ?? PER_PAGE));
  const url = `${BLOG.baseUrl}/api/read/json?start=${start}&num=${num}`;
  const { text } = await fetchTextResponse(url, {
    delayMs: DELAY_MS,
    noRetryOn: [401, 403],
  });
  const page = parseTumblrJson(text) as {
    "posts-total": number;
    posts: TonRaw[];
  };
  return {
    raw: page.posts,
    next: nextCursor(start, page.posts.length, page["posts-total"]),
  };
}

/** The picture and the caption HTML, by post type — the one place the two shapes differ. */
function picture(raw: TonRaw): { imageUrl: string; captionHtml: string } {
  switch (raw.type) {
    case "photo": {
      const imageUrl = raw["photo-url-1280"];
      if (!imageUrl) {
        throw new Error(
          `thingsorganizedneatly: photo post ${raw.id} has no photo-url-1280`,
        );
      }
      return { imageUrl, captionHtml: raw["photo-caption"] ?? "" };
    }
    case "regular": {
      const body = raw["regular-body"] ?? "";
      const imageUrl = firstImageUrl(body);
      if (!imageUrl) {
        throw new Error(
          `thingsorganizedneatly: regular post ${raw.id} has no image`,
        );
      }
      // Empty on 36 of 37 sampled posts; when a title IS set it is the caption's natural first
      // line, so it goes in front of the body for both deriveTitle and the summary.
      const title = raw["regular-title"];
      return { imageUrl, captionHtml: title ? `<p>${title}</p>${body}` : body };
    }
    default:
      throw new Error(
        `thingsorganizedneatly: unsupported post type "${raw.type}" (post ${raw.id})`,
      );
  }
}

function toItem(raw: TonRaw): NormalizedItem {
  const { imageUrl, captionHtml } = picture(raw);
  return {
    source: "thingsorganizedneatly",
    // The numeric post id, not the slug: it is present and permanent on every post type, where
    // the slug is empty on any post without caption text (53 of 200 sampled). doorofperception
    // chose the slug for the opposite reason — WordPress guarantees one. (source, sourceId) is
    // the idempotency key, so this choice is permanent for the corpus.
    sourceId: raw.id,
    type: "image",
    title: deriveTitle(captionHtml, raw.slug ?? "", raw.id),
    // The blog's own caption IS the blurb (D5), however short. A thin one is floored by
    // structuralFloor's thin-summary rule like any museum stub — never padded here.
    summary: htmlToText(captionHtml),
    // Always null for a blog item — the invariant source-invariants.test.ts asserts.
    body: null,
    imageUrl,
    // The readable permalink. On a captionless post there is no slug and the API sends the bare
    // `url` in this field too (53 of 53 sampled) — present, never empty — so `??` is exact.
    sourceUrl: raw["url-with-slug"] ?? raw.url,
    attribution: BLOG.label,
    license: BLOG.license,
    tags: uniqueTags(
      (raw.tags ?? [])
        .map((t) => t.toLowerCase())
        .filter((t) => t !== BLOG_TAG),
    ),
  };
}

export const thingsorganizedneatly: CorpusWalkAdapter<TonRaw> = {
  source: "thingsorganizedneatly",
  walk,
  toItem,
};
