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
  /** The smaller rendition every photo post also carries — handed to the curator, never stored
   *  (NormalizedItem.curationImageUrl). */
  "photo-url-500"?: string;
  /** A PHOTOSET's pictures. Present with 2+ entries when the post is a set; a single-picture
   *  photo post carries the picture in the post-level `photo-url-*` fields and this array either
   *  absent or holding that one picture. Each entry repeats the same rendition ladder and carries
   *  a per-photo `caption` which every blog sampled leaves empty — the set's one caption is the
   *  post-level `photo-caption`, which is why fan-out copies it to every picture. */
  photos?: {
    "photo-url-1280"?: string;
    "photo-url-500"?: string;
    caption?: string;
  }[];
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
 * One picture, in the two sizes Ambit wants from it: `url` is what gets stored and shown,
 * `curationUrl` is the smaller rendition the curator is shown instead when the source publishes
 * one (09-06-26). Absent when the picture has only one size, which is honest — scoreItem falls
 * back to `url` and nothing guesses a URL that may not exist.
 */
export interface TumblrRendition {
  url: string;
  curationUrl?: string;
}

/** The width the curation rendition aims at. A 1-10 score and four aesthetic tags do not improve
 *  above it, and every ladder Tumblr serves has a candidate within a factor of two of it. */
const CURATION_WIDTH = 500;

/**
 * Pure: the renditions one `<img>` tag offers. The stored URL is its largest `srcset` candidate
 * when it lists any (the newer editor lists 75w…1280w) — the LAST one, which is how this has
 * always picked and what thingsorganizedneatly's rows were built with — else its `src` (the
 * 640 px rendition). The curation URL is the candidate whose declared width is nearest
 * CURATION_WIDTH, dropped when that turns out to be the stored one anyway.
 */
function tagRenditions(tag: string): TumblrRendition | undefined {
  const srcset = /\bsrcset="([^"]*)"/i.exec(tag)?.[1];
  // Each candidate is "url 851w"; trimmed and non-empty, so its first token is a real URL.
  const candidates =
    srcset
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((c) => {
        const [url, size] = c.split(/\s+/);
        return {
          url: url!,
          width: Number(/^(\d+)w$/.exec(size ?? "")?.[1] ?? NaN),
        };
      }) ?? [];
  const url =
    candidates[candidates.length - 1]?.url ?? /\bsrc="([^"]+)"/i.exec(tag)?.[1];
  if (!url) return undefined;

  const sized = candidates.filter((c) => Number.isFinite(c.width));
  const nearest = sized.length
    ? sized.reduce((best, c) =>
        Math.abs(c.width - CURATION_WIDTH) <
        Math.abs(best.width - CURATION_WIDTH)
          ? c
          : best,
      )
    : undefined;
  return nearest && nearest.url !== url
    ? { url, curationUrl: nearest.url }
    : { url };
}

/**
 * Pure: the first `<img>` in a body, at its largest rendition. Kept as the narrow public helper
 * `allImageUrls` and the tests were written against; the resolution rule lives in tagRenditions.
 */
export function firstImageUrl(html: string): string | undefined {
  return allImageRenditions(html)[0]?.url;
}

/**
 * Pure: EVERY `<img>` in a body, in document order, each at its largest rendition. A `regular`
 * post from the newer editor puts its pictures inline in `regular-body`, and multi-picture posts
 * are common — 7 of sovietpostcards' first 50, 21 of toiich's, two pictures a post on average —
 * all sharing the one caption that is the body's text. Before 09-06-26 only the first became an
 * item and the rest of the post was silently dropped; see expandPictures.
 */
export function allImageRenditions(html: string): TumblrRendition[] {
  return (html.match(/<img\b[^>]*>/gi) ?? [])
    .map(tagRenditions)
    .filter((r): r is TumblrRendition => r !== undefined);
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
const ALT_BADGE =
  /<span[^>]*\bclass="[^"]*\btmblr-alt-text-helper\b[^"]*"[^>]*>.*?<\/span>/gi;

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
/** A title has to say something. Anything with no letter and no digit in it cannot: the case
 *  that made this necessary is a reblog of a PRIVATE blog, whose `<a class="tumblr_blog">` has
 *  empty text and leaves a caption line of exactly ":" (sovietpostcards post 825370343695958016,
 *  found in the 09-06-26 sample). ATTRIBUTION_LINE catches `nemfrog:` but needs a name to catch.
 *  Before the floor was lifted for walk images such a post was dropped on its thin summary; now
 *  it is a card, and a card titled ":" is the same reader-visible junk as "ALT" was. */
const HAS_WORD = /[\p{L}\p{N}]/u;

/**
 * Pure: a title for a source that has none. The caption's first line — first sentence of it,
 * when one ends within TITLE_MAX — skipping a reblog attribution line; else the slug, humanized;
 * else `fallback`, which callers pass as the blog's own label.
 *
 * That last step used to be `Untitled post <id>` and used to be unreachable, because a post with
 * no caption has an empty summary and structuralFloor dropped it. As of 09-06-26 the floor keeps
 * caption-less walk images (curator.ts, docs/PLAN_caption-less-and-wild.md T1), so the fallback
 * now DOES reach readers and a placeholder would have been the wrong thing to show them. The
 * blog's label is Ben's call: the card that results is a picture, `from: The Vault of the Atomic
 * Space Age`, and a link to the post — exactly the link-card shape the 08-20-26 rights posture
 * describes, with no caption to excerpt. `summary` stays empty and every renderer already guards
 * on `item.summary ?`.
 *
 * The slug fallback in between still fires, for a captioned post whose only line is a reblog
 * attribution.
 */
export function deriveTitle(
  captionHtml: string,
  slug: string,
  fallback: string,
): string {
  const line = captionLines(captionHtml).find(
    (l) => !ATTRIBUTION_LINE.test(l) && HAS_WORD.test(l),
  );
  if (line) return firstSentence(line);
  if (slug) {
    return slug
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return fallback;
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

/** The caption HTML, by post type — half of what the two shapes differ in. Pure, and called
 *  from toItem on a picture that expandPictures already accepted, so the `default` arm is
 *  unreachable there; it stays because this function is exported reasoning, not a private trick. */
function captionHtmlFor(raw: TumblrRaw, blogId: string): string {
  switch (raw.type) {
    case "photo":
      return stripCaptionChrome(raw["photo-caption"] ?? "");
    case "regular": {
      const body = stripCaptionChrome(raw["regular-body"] ?? "");
      // Usually empty; when a title IS set it is the caption's natural first line, so it goes in
      // front of the body for both deriveTitle and the summary.
      const title = raw["regular-title"];
      return title ? `<p>${title}</p>${body}` : body;
    }
    default:
      throw new Error(
        `${blogId}: unsupported post type "${raw.type}" (post ${raw.id})`,
      );
  }
}

/** Every picture a post carries, in document order — the other half of the two shapes. Throws
 *  the same errors the old single-picture `picture()` threw, for the same reasons. */
function pictureRenditions(raw: TumblrRaw, blogId: string): TumblrRendition[] {
  switch (raw.type) {
    case "photo": {
      // A photoset lists its pictures in `photos[]`; a single-picture photo post carries the
      // picture in the post-level fields (and sometimes repeats it as a one-entry array, which
      // is why the array is only trusted when it holds more than one).
      const set = raw.photos ?? [];
      const ladders =
        set.length > 1
          ? set
          : [
              {
                "photo-url-1280": raw["photo-url-1280"],
                "photo-url-500": raw["photo-url-500"],
              },
            ];
      const out: TumblrRendition[] = [];
      for (const p of ladders) {
        const url = p["photo-url-1280"];
        if (!url) continue;
        const small = p["photo-url-500"];
        out.push(
          small && small !== url ? { url, curationUrl: small } : { url },
        );
      }
      if (!out.length) {
        throw new Error(
          `${blogId}: photo post ${raw.id} has no photo-url-1280`,
        );
      }
      return out;
    }
    case "regular": {
      const pictures = allImageRenditions(
        stripCaptionChrome(raw["regular-body"] ?? ""),
      );
      if (!pictures.length) {
        throw new Error(`${blogId}: regular post ${raw.id} has no image`);
      }
      return pictures;
    }
    default:
      throw new Error(
        `${blogId}: unsupported post type "${raw.type}" (post ${raw.id})`,
      );
  }
}

/**
 * One raw record per PICTURE, not per post — the fan-out (09-06-26, plan D11).
 *
 * A Tumblr post routinely carries several pictures under one caption: 7 of sovietpostcards' first
 * 50 posts, 21 of toiich's, and any `photo` post that is a photoset. Until now `picture()` took
 * the first and the rest of the post was never stored at all. Every picture is now its own item,
 * carrying the post's caption, title, tags and permalink — the caption describes the set, so
 * repeating it on each picture is what it means, not a duplication.
 *
 * The expansion lives HERE, in the walker, rather than in toItem, because `CorpusWalkAdapter.toItem`
 * is a cross-service agreement with a one-raw-in / one-item-out shape (types.ts) and is the pure
 * fixture-tested surface. Keeping that means the walker yields more raws instead.
 *
 * `pictureIndex` is 1-based for every picture INCLUDING the first, so `sourceId` is `<post>:1`
 * uniformly and no caller ever has to know whether a post was a set. (things-organized-neatly.ts
 * keeps bare post ids — its 1,720 rows are single-picture by construction and stay as they are.)
 */
export interface TumblrPicture extends TumblrRaw {
  pictureUrl: string;
  curationUrl?: string;
  /** 1-based. `0` marks the sentinel below, which is not a picture at all. */
  pictureIndex: number;
  pictureCount: number;
  /** Set only on the sentinel: the message toItem must throw. */
  expandError?: string;
}

export function expandPictures(
  post: TumblrRaw,
  blogId: string,
): TumblrPicture[] {
  let renditions: TumblrRendition[];
  try {
    renditions = pictureRenditions(post, blogId);
  } catch (err) {
    // A page of 50 posts routinely contains one `answer` or `video`, and before the fan-out that
    // cost exactly one toItem error, which ingest counts and prints. Throwing out of a flatMap
    // would instead lose the other 49. So the failure is carried forward as a single sentinel raw
    // that toItem rejects with the original message: the count stays honest and the page survives.
    return [
      {
        ...post,
        pictureUrl: "",
        pictureIndex: 0,
        pictureCount: 0,
        expandError: err instanceof Error ? err.message : String(err),
      },
    ];
  }
  return renditions.map((r, i) => ({
    ...post,
    pictureUrl: r.url,
    ...(r.curationUrl ? { curationUrl: r.curationUrl } : {}),
    pictureIndex: i + 1,
    pictureCount: renditions.length,
  }));
}

export function tumblrWalker(
  blog: BlogConfig,
): CorpusWalkAdapter<TumblrPicture> {
  // A blog that tags every post with its own name says nothing about the item that way, and it
  // would take one of the twelve tag slots the curator reads. Config, not a guess: `selfTags` is
  // the blog's own row, already lowercased there.
  const selfTags = new Set(blog.selfTags ?? []);

  async function walk(
    cursor?: string,
    opts?: FetchOpts,
  ): Promise<WalkPage<TumblrPicture>> {
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
      // One raw per PICTURE (expandPictures). `next` still counts POSTS, because the cursor is
      // Tumblr's own `start` offset and the API paginates posts — a page of 50 posts can offer
      // 100 items, which is why ingest's quota is in items and the cursor is not.
      raw: page.posts.flatMap((post) => expandPictures(post, blog.id)),
      next: nextCursor(start, page.posts.length, page["posts-total"]),
    };
  }

  function toItem(raw: TumblrPicture): NormalizedItem {
    // The sentinel expandPictures yields for a post it could not read: re-thrown here so the
    // failure lands where ingest already counts and prints toItem errors.
    if (raw.expandError) throw new Error(raw.expandError);
    const captionHtml = captionHtmlFor(raw, blog.id);
    return {
      source: blog.id,
      // The numeric post id and the 1-based picture index — the post id because it is present and
      // permanent on every post type where the slug is empty on any post without caption text,
      // the index because a post can carry several pictures and each is its own item.
      // (source, sourceId) is the idempotency key, so this choice is permanent for the corpus.
      sourceId: `${raw.id}:${raw.pictureIndex}`,
      type: "image",
      // The blog's label is the last resort, and on a caption-less blog it is the usual outcome —
      // see deriveTitle.
      title: deriveTitle(captionHtml, raw.slug ?? "", blog.label),
      // The blog's own caption IS the blurb (6.3 D5), however short. A thin one is floored by
      // structuralFloor's thin-summary rule like any museum stub — never padded here — and a
      // very long one is cut to an excerpt by capSummary, which is the rights posture in code.
      summary: capSummary(htmlToText(captionHtml)),
      // Always null for a blog item — the invariant source-invariants.test.ts asserts.
      body: null,
      imageUrl: raw.pictureUrl,
      // Scored instead of the stored picture when this blog's ladder offered a smaller rendition
      // (types.ts). Omitted, never guessed, when it did not.
      ...(raw.curationUrl ? { curationImageUrl: raw.curationUrl } : {}),
      // The readable permalink — the POST's, for every picture of it: the link card links a
      // reader to the original post, which is where the whole set lives.
      // On a captionless post there is no slug and the API sends the
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
