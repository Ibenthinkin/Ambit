// The RSS/Atom walker factory (writing Phase 5, 09-30-26; docs/PLAN_writing.md): one
// `CorpusWalkAdapter` per publication whose feed is how it is reached — `wp-rest.ts` in article
// mode is preferred wherever a publication is WordPress with its API open, and this is for the
// rest. **The contract is unchanged**: a walk page is a feed page, the cursor is a page number.
//
// **What a publication's item is** (docs/DESIGN_writing.md D6): a link card of writing — the lead
// picture, the publication's own dek, a `from:` credit and the link. `type: "article"`, `body`
// always null. The full text, where the feed carries it (`content:encoded`), is handed to the
// curator as `curationText` and never stored (types.ts).
//
// **Parsing by hand, on purpose.** Feeds are a small, regular corner of XML — items, a dozen
// named elements, CDATA and entities — and the repo already hand-rolls its HTML handling
// (`htmlToText`). `parseFeed` is pure and tested against real recorded feeds; a feed it misreads
// shows up as `toItem` errors in the ingest summary, per item, never as silence.
//
// **Etiquette**, as wp-rest.ts: robots.txt at the start of every walk, 500 ms between requests,
// and a 401/403 ends the walk on the first response.
import type { PublicationConfig } from "~/server/config/publications";
import { fetchTextResponse, HttpRefusedError } from "./http";
import {
  decodeEntities,
  fullText,
  htmlToText,
  toLede,
  uniqueTags,
} from "./normalize";
import { assertCrawlAllowed } from "./robots";
import type {
  CorpusWalkAdapter,
  FetchOpts,
  NormalizedItem,
  WalkPage,
} from "./types";

const DELAY_MS = 500;
/** D6: a dek is a publication's own short description, never a slice of the piece to read. */
export const DEK_MAX_CHARS = 600;

/** What the walker needs from a publication's config: the feed shape of it. */
export type RssSource = Pick<
  PublicationConfig,
  "id" | "label" | "baseUrl" | "license"
> & {
  feedUrl: string;
  fullText: "content-encoded" | "none";
  paged?: "wp";
};

/** One feed entry, as `parseFeed` reads it — raw HTML in `description` and `content`, never
 *  displayed as such (`toItem` runs both through `htmlToText`). */
export interface FeedEntry {
  title: string;
  link: string;
  /** RSS `<description>`, Atom `<summary>`: the publication's dek, as HTML. */
  description?: string;
  /** RSS `<content:encoded>`, Atom `<content>`: the piece's full HTML, where the feed ships it. */
  content?: string;
  categories: string[];
  /** `media:content`, then `media:thumbnail`, then an image `enclosure`, then the first `<img>`
   *  of the content or the description. */
  imageUrl?: string;
}

// ── parsing ─────────────────────────────────────────────────────────────────────────────────

/** An element's inner text: CDATA unwrapped as is, anything else entity-decoded (it is XML). */
function inner(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  return cdata ? cdata[1]! : decodeEntities(raw.trim());
}

function escapeTag(tag: string): string {
  return tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The first `<tag …>…</tag>` in `block`, or undefined. The `(\s[^>]*)?>` stops `<title` from
 *  matching `<titleSomething`. */
function element(block: string, tag: string): string | undefined {
  const re = new RegExp(
    `<${escapeTag(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeTag(tag)}>`,
    "i",
  );
  const m = re.exec(block);
  return m ? inner(m[1]!) : undefined;
}

function elements(block: string, tag: string): string[] {
  const re = new RegExp(
    `<${escapeTag(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeTag(tag)}>`,
    "gi",
  );
  return [...block.matchAll(re)].map((m) => inner(m[1]!));
}

/** Every opening (or self-closing) `<tag …>`'s attribute run. */
function tagAttrs(block: string, tag: string): string[] {
  const re = new RegExp(`<${escapeTag(tag)}(\\s[^>]*?)/?>`, "gi");
  return [...block.matchAll(re)].map((m) => m[1]!);
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(
    `\\s${escapeTag(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`,
    "i",
  ).exec(attrs);
  return m ? decodeEntities(m[2] ?? m[3] ?? "") : undefined;
}

function firstImg(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const m = /<img\s[^>]*?src\s*=\s*("([^"]*)"|'([^']*)')/i.exec(html);
  return m ? decodeEntities(m[2] ?? m[3] ?? "") : undefined;
}

function pictureOf(block: string, content?: string, description?: string) {
  const media = tagAttrs(block, "media:content").find((a) => {
    const type = attr(a, "type");
    const medium = attr(a, "medium");
    return medium === "image" || !type || type.startsWith("image/");
  });
  const enclosure = tagAttrs(block, "enclosure").find((a) =>
    attr(a, "type")?.startsWith("image/"),
  );
  return (
    (media && attr(media, "url")) ??
    tagAttrs(block, "media:thumbnail")
      .map((a) => attr(a, "url"))
      .find(Boolean) ??
    (enclosure && attr(enclosure, "url")) ??
    firstImg(content) ??
    firstImg(description)
  );
}

function atomLink(block: string): string {
  for (const attrs of tagAttrs(block, "link")) {
    const rel = attr(attrs, "rel");
    if (!rel || rel === "alternate") return attr(attrs, "href") ?? "";
  }
  return "";
}

/**
 * Every entry in an RSS 2.0 or Atom document. Pure. The channel's own `<title>` and `<link>` are
 * never read: only what sits inside an `<item>` or `<entry>` is an entry.
 */
export function parseFeed(xml: string): FeedEntry[] {
  const rss = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  if (rss.length > 0) {
    return rss.map(([, block]) => {
      const description = element(block!, "description");
      const content = element(block!, "content:encoded");
      return {
        title: element(block!, "title") ?? "",
        link: (element(block!, "link") ?? "").trim(),
        ...(description ? { description } : {}),
        ...(content ? { content } : {}),
        categories: elements(block!, "category"),
        ...withImage(pictureOf(block!, content, description)),
      };
    });
  }
  return [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map(
    ([, block]) => {
      const description = element(block!, "summary");
      const content = element(block!, "content");
      return {
        title: element(block!, "title") ?? "",
        link: atomLink(block!),
        ...(description ? { description } : {}),
        ...(content ? { content } : {}),
        categories: tagAttrs(block!, "category")
          .map((a) => attr(a, "term"))
          .filter((t): t is string => Boolean(t)),
        ...withImage(pictureOf(block!, content, description)),
      };
    },
  );
}

function withImage(url: string | undefined): { imageUrl?: string } {
  return url ? { imageUrl: url } : {};
}

// ── projection ──────────────────────────────────────────────────────────────────────────────

/** WordPress's default feed footer — "The post X appeared first on Y." — which is some feeds'
 *  entire `<description>` (Noema's). It is never a dek. */
const WP_FOOTER = /<p>\s*The post [\s\S]*? appeared first on [\s\S]*?<\/p>/gi;

/** A paragraph shorter than this is a kicker or a promo line, not the piece's opening. */
const OPENING_MIN_CHARS = 80;

/**
 * The dek a card shows: the feed's own description, less WordPress's footer, as plain text, at
 * most DEK_MAX_CHARS. When the description is only the footer, the piece's first real paragraph
 * — a short excerpt, the 08-20 posture's own words — and never more than that.
 */
export function dekFrom(
  description: string | undefined,
  content: string | undefined,
): string {
  let dek = htmlToText((description ?? "").replace(WP_FOOTER, ""));
  if (!dek && content) {
    const opening = [...content.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)]
      .map((m) => htmlToText(m[1]!))
      .find((p) => p.length >= OPENING_MIN_CHARS);
    dek = opening ?? "";
  }
  return toLede(dek, DEK_MAX_CHARS);
}

/** Pure: the cursor after `page`. A paged feed goes on while a page has entries; an unpaged feed
 *  is its newest page and nothing more. */
export function nextPage(
  paged: "wp" | undefined,
  page: number,
  entries: number,
): string | undefined {
  return paged === "wp" && entries > 0 ? String(page + 1) : undefined;
}

export function rssWalker(pub: RssSource): CorpusWalkAdapter<FeedEntry> {
  const host = new URL(pub.baseUrl).host;

  async function walk(
    cursor?: string,
    _opts?: FetchOpts,
  ): Promise<WalkPage<FeedEntry>> {
    const page = cursor === undefined ? 1 : Number(cursor);
    if (!Number.isInteger(page) || page < 1) {
      throw new Error(`${pub.id}: bad cursor "${cursor}"`);
    }
    if (page === 1) await assertCrawlAllowed(pub.baseUrl);

    const url =
      page === 1
        ? pub.feedUrl
        : `${pub.feedUrl}${pub.feedUrl.includes("?") ? "&" : "?"}paged=${page}`;
    let text: string;
    try {
      ({ text } = await fetchTextResponse(url, {
        delayMs: DELAY_MS,
        noRetryOn: [401, 403, 404],
      }));
    } catch (err) {
      // WordPress answers a page past the end with a 404: that is the end of the archive, not a
      // failure. A 404 on the first page is the feed gone, and is.
      if (err instanceof HttpRefusedError && err.status === 404 && page > 1)
        return { raw: [] };
      throw err;
    }
    const raw = parseFeed(text);
    return { raw, next: nextPage(pub.paged, page, raw.length) };
  }

  function toItem(entry: FeedEntry): NormalizedItem {
    let url: URL;
    try {
      url = new URL(entry.link);
    } catch {
      throw new Error(`${pub.id}: entry "${entry.title}" has no usable link`);
    }
    // A feed that links out to another site is recommending that site's piece, not publishing
    // one — a different posture (and the reason Longreads was not registered). Thrown, so ingest
    // counts it.
    if (url.host !== host) {
      throw new Error(`${pub.id}: entry links off-site (${url.host})`);
    }
    const text =
      pub.fullText === "content-encoded" && entry.content
        ? fullText(entry.content)
        : "";
    return {
      source: pub.id,
      // The path, as wp-rest.ts uses the slug: stable across edits, readable in the DB, and
      // (source, sourceId) is the idempotency key, so this choice is permanent for the corpus.
      sourceId: url.pathname.replace(/^\/+|\/+$/g, "") || entry.link,
      type: "article",
      title: htmlToText(entry.title),
      summary: dekFrom(entry.description, entry.content),
      body: null,
      ...(text ? { curationText: text } : {}),
      imageUrl: entry.imageUrl ?? null,
      sourceUrl: url.href,
      attribution: pub.label,
      license: pub.license,
      tags: uniqueTags(
        entry.categories.map((c) => htmlToText(c).toLowerCase()),
      ),
    };
  }

  return { source: pub.id, walk, toItem };
}
