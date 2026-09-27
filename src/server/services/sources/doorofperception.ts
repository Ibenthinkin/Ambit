// The first corpus-walk adapter (Phase 6.3, docs/PHASE6_DESIGN_6.3.md §5) and the first blog:
// doorofperception.com, over its WordPress REST API.
//
// **What one item is — since 09-27-26, one PICTURE** (docs/PLAN_dop-fanout.md). Until then it was
// one post → one item, the post's featured image (6.3's D1), and that left ~97% of the blog's
// pictures on the floor: 391 posts, ~11,700 images, ~28 a post. Ben reversed D1 on 09-27-26 —
// DoP's galleries ARE the blog, and every picture is a keeper. Every picture now carries the
// post's title, excerpt, tags and permalink, the Tumblr fan-out's shape (tumblr.ts, 09-06-26):
// the excerpt describes the set, so repeating it on each picture is what it means.
//
// **Which pictures.** The ones the post SHOWS, in the order it shows them — read off the `<img
// src>` URLs in `content.rendered` — plus the featured image. Not "every attachment": a post's
// media library also holds unused alternates, header crops and the featured crop itself (measured
// 09-27-26: 74 attachments for 63 shown pictures on one post, 28 for 25 on another). The HTML is
// only *read for URLs*, never rendered or stored — `body` stays null (D5).
//
// **Full resolution.** Each shown `<img>` is a WordPress rendition (`…-1200x812.jpg`). Its
// attachment record (/wp/v2/media?parent=<post>) lists every rendition's file name, so the
// lookup is an exact file-name match — no size-suffix regex — and yields the ORIGINAL upload as
// `imageUrl` (2,000-3,900 px on the posts measured) and the published `large` rendition as
// `curationImageUrl`, so the curator downloads ~1/5 of the bytes. The image proxy still serves
// ≤1600 px WebP (image-cache.ts MAX_EDGE); storing the original is what makes raising that a
// proxy change rather than a re-walk.
//
// **Identity.** The featured image keeps `sourceId = slug`, exactly as before, so the 387 rows
// that predate the fan-out — their saves, seen rows and paid-for curation — are the same rows.
// Every other picture is `<slug>:<attachment id>`: the attachment id, not a position, because a
// post re-ordered or extended later must not renumber the pictures already stored.
//
// **Etiquette.** robots.txt is checked at the start of every walk (robots.ts), requests are 500ms
// apart, and a 401/403 ends the walk on the first response (fetchJson's noRetryOn). The fan-out
// costs one media request per post on top of the posts pages: ~450 requests, ~4 minutes.
import { blogConfig } from "~/server/config/blogs";
import { fetchJsonResponse } from "./http";
import { htmlToText, uniqueTags } from "./normalize";
import { assertCrawlAllowed } from "./robots";
import type {
  CorpusWalkAdapter,
  FetchOpts,
  NormalizedItem,
  WalkPage,
} from "./types";

const BLOG = blogConfig("doorofperception")!;
/** Posts per walk page. 20, not WordPress's 100: a page now offers ~550 pictures rather than 100
 *  items, and a smaller page keeps a `--cursor` resume and a `--quota` check fine-grained. */
const PER_PAGE = 20;
const DELAY_MS = 500;

/** One post from /wp/v2/posts?_embed=wp:featuredmedia — the fields toItem reads, nothing more. */
export interface WpPostRaw {
  id: number;
  slug: string;
  link: string;
  date: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  /** The post's HTML. Read for `<img src>` URLs only (pictureSrcs) — never rendered, never
   *  stored. Optional because fixtures recorded before the fan-out do not carry it. */
  content?: { rendered: string };
  tags: number[];
  categories: number[];
  /** 0 when the post has no featured image. */
  featured_media: number;
  _embedded?: {
    "wp:featuredmedia"?: {
      source_url?: string;
      media_details?: { width?: number; height?: number };
    }[];
  };
}

/** One attachment from /wp/v2/media?parent=<post> — the fields the fan-out reads. */
export interface WpMediaRaw {
  id: number;
  source_url: string;
  media_type?: string;
  media_details?: {
    width?: number;
    height?: number;
    sizes?: Record<
      string,
      { source_url: string; width?: number; height?: number }
    >;
  };
}

/** A post with its tag ids resolved to names. */
export interface DopPost extends WpPostRaw {
  tagNames: string[];
}

/**
 * What walk() actually returns: ONE PICTURE of a post, carrying the post's text fields. toItem()
 * stays a pure, synchronous projection of it (the fixture is recorded in this shape). The post's
 * `content` is dropped here — every picture of a post would otherwise carry the whole article.
 */
export interface DopRaw extends Omit<DopPost, "content"> {
  /** The stored picture: the original upload, or for the featured image the embed's source_url. */
  pictureUrl: string;
  /** A published smaller rendition for the curator, when the attachment lists one. */
  curationUrl?: string;
  /** The attachment id — `undefined` for the featured image, whose sourceId is the bare slug. */
  mediaId?: number;
  /** Set only on the sentinel a post with no featured image yields: the message toItem throws. */
  expandError?: string;
}

/** Pure: the cursor for the page after `page`, or undefined when `page` was the last. */
export function nextCursor(
  page: number,
  totalPages: number,
): string | undefined {
  return page < totalPages ? String(page + 1) : undefined;
}

/** A picture whose shorter edge is below this is page furniture — a divider, a scale strip
 *  (one post opens with an 840×92 "moon to scale" banner) — not a picture to show on its own. */
export const MIN_SHORT_EDGE = 300;

/** The file name of a URL — the join key between a shown `<img src>` and its attachment. */
function fileName(url: string): string {
  return url.split("?")[0]!.split("/").pop() ?? "";
}

/** Pure: every `<img src>` in a post's HTML, in document order, de-duplicated. */
export function pictureSrcs(html: string): string[] {
  const srcs: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/gi)) {
    const src = m[1]!;
    if (!srcs.includes(src)) srcs.push(src);
  }
  return srcs;
}

/**
 * Pure: one post and its attachments → one raw per picture (the fan-out, docs/PLAN_dop-fanout.md).
 *
 * The featured image first, as the post's link card has always been; then every picture the post
 * shows that resolves to one of ITS attachments by file name, in order. Skipped, never guessed:
 * a shown image attached to some other post (1 in ~150 measured — its original is not in this
 * post's media), the featured image again, a picture already taken, and anything under
 * MIN_SHORT_EDGE. `unresolved` counts the first case so walk() can say how many it left.
 */
export function expandPictures(
  post: DopPost,
  media: WpMediaRaw[],
): { pictures: DopRaw[]; unresolved: number } {
  const { content, ...base } = post;
  const pictures: DopRaw[] = [];

  const hero = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
  if (post.featured_media && hero) {
    pictures.push({ ...base, pictureUrl: hero });
  } else {
    // A post with no picture is not a link card, and a silent skip would hide the count (1 of 391
    // as of 09-27-26). Carried as a sentinel toItem re-throws — the Tumblr fan-out's device — so
    // the post's other pictures survive.
    pictures.push({
      ...base,
      pictureUrl: "",
      expandError: `doorofperception: post "${post.slug}" has no featured image`,
    });
  }

  // Every rendition's file name → its attachment, so a `-1200x812` src finds its original.
  const byFile = new Map<string, WpMediaRaw>();
  for (const m of media) {
    if (m.media_type && m.media_type !== "image") continue;
    byFile.set(fileName(m.source_url), m);
    for (const size of Object.values(m.media_details?.sizes ?? {})) {
      byFile.set(fileName(size.source_url), m);
    }
  }

  const taken = new Set<number>([post.featured_media]);
  let unresolved = 0;
  for (const src of pictureSrcs(content?.rendered ?? "")) {
    const m = byFile.get(fileName(src));
    if (!m) {
      unresolved++;
      continue;
    }
    if (taken.has(m.id)) continue;
    taken.add(m.id);
    const w = m.media_details?.width ?? 0;
    const h = m.media_details?.height ?? 0;
    if (w && h && Math.min(w, h) < MIN_SHORT_EDGE) continue;
    const large = m.media_details?.sizes?.large?.source_url;
    pictures.push({
      ...base,
      pictureUrl: m.source_url,
      ...(large ? { curationUrl: large } : {}),
      mediaId: m.id,
    });
  }
  return { pictures, unresolved };
}

/** Every attachment of one post. 100 is WordPress's page ceiling; a post past it pages on. */
async function postMedia(postId: number): Promise<WpMediaRaw[]> {
  const all: WpMediaRaw[] = [];
  for (let page = 1; ; page++) {
    const { data, headers } = await fetchJsonResponse(
      `${BLOG.baseUrl}/wp-json/wp/v2/media?parent=${postId}&per_page=100&page=${page}` +
        `&_fields=id,source_url,media_type,media_details`,
      { delayMs: DELAY_MS, noRetryOn: [401, 403] },
    );
    all.push(...(data as WpMediaRaw[]));
    if (!nextCursor(page, Number(headers.get("x-wp-totalpages") ?? "1"))) break;
  }
  return all;
}

// Tag names, resolved once per process. WordPress exposes tags as numeric ids on a post and names
// on a separate endpoint; ~200 tags is a page or two, fetched on the first walk() call and reused
// for every page after. A missing name (a tag deleted mid-walk) simply drops off the item.
let tagNamesPromise: Promise<Map<number, string>> | null = null;
async function tagNames(): Promise<Map<number, string>> {
  tagNamesPromise ??= (async () => {
    const names = new Map<number, string>();
    for (let page = 1; ; page++) {
      const { data, headers } = await fetchJsonResponse(
        `${BLOG.baseUrl}/wp-json/wp/v2/tags?per_page=100&page=${page}&_fields=id,name`,
        { delayMs: DELAY_MS, noRetryOn: [401, 403] },
      );
      for (const t of data as { id: number; name: string }[]) {
        names.set(t.id, htmlToText(t.name));
      }
      if (!nextCursor(page, Number(headers.get("x-wp-totalpages") ?? "1")))
        break;
    }
    return names;
  })();
  return tagNamesPromise;
}

async function walk(
  cursor?: string,
  opts?: FetchOpts,
): Promise<WalkPage<DopRaw>> {
  const page = cursor === undefined ? 1 : Number(cursor);
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`doorofperception: bad cursor "${cursor}"`);
  }
  // Page 1 is the start of a walk: check the policy file before anything else.
  if (page === 1) await assertCrawlAllowed(BLOG.baseUrl);

  // `limit` bounds this page's size so `--quota N` can do a cheap structural check without
  // pulling 100 posts. No `_fields=` here: it would strip `_embedded`, which is the whole reason
  // for `_embed` (verified 08-25-26 — the filtered form returns an empty embed).
  const perPage = Math.max(1, Math.min(PER_PAGE, opts?.limit ?? PER_PAGE));
  const url =
    `${BLOG.baseUrl}/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}` +
    `&_embed=wp:featuredmedia`;
  const { data, headers } = await fetchJsonResponse(url, {
    delayMs: DELAY_MS,
    noRetryOn: [401, 403],
  });
  const posts = data as WpPostRaw[];
  const names = await tagNames();

  // One raw per PICTURE (expandPictures). `next` still counts post pages — the cursor is
  // WordPress's own page number — which is why ingest's quota is in items and the cursor is not.
  const raw: DopRaw[] = [];
  let unresolved = 0;
  for (const p of posts) {
    const post: DopPost = {
      ...p,
      tagNames: p.tags
        .map((id) => names.get(id))
        .filter((n): n is string => Boolean(n)),
    };
    const expanded = expandPictures(post, await postMedia(p.id));
    raw.push(...expanded.pictures);
    unresolved += expanded.unresolved;
  }
  if (unresolved > 0) {
    console.warn(
      `  doorofperception: page ${page} — ${unresolved} shown image(s) not attached to their post, skipped`,
    );
  }

  return {
    raw,
    next: nextCursor(page, Number(headers.get("x-wp-totalpages") ?? "1")),
  };
}

function toItem(raw: DopRaw): NormalizedItem {
  // The sentinel expandPictures yields for a post with no featured image: thrown, not null, so
  // ingest counts it per item and prints it.
  if (raw.expandError) throw new Error(raw.expandError);
  return {
    source: "doorofperception",
    // The slug, not the numeric id: stable across edits, readable in the DB, and what the
    // permalink is built from — bare for the featured image (the pre-fan-out identity, kept),
    // `<slug>:<attachment id>` for every other picture. (source, sourceId) is the idempotency
    // key, so this choice is permanent for the corpus.
    sourceId:
      raw.mediaId === undefined ? raw.slug : `${raw.slug}:${raw.mediaId}`,
    type: "image",
    title: htmlToText(raw.title.rendered),
    // The blog's own excerpt IS the blurb (D5). A short one is floored by structuralFloor's
    // thin-summary rule like any museum stub — 3 of 390 as of 08-25-26 — never padded here.
    summary: htmlToText(raw.excerpt.rendered),
    // Always null for a blog item. Not "the excerpt again", not the post body. This is the
    // invariant source-invariants.test.ts asserts, and the reason blog items can never reach the
    // reader view: /i/[itemId] keys its variant on type, and this one is always "image".
    body: null,
    imageUrl: raw.pictureUrl,
    // Scored instead of the stored original when the attachment published a `large` rendition
    // (types.ts). Omitted, never guessed, when it did not.
    ...(raw.curationUrl ? { curationImageUrl: raw.curationUrl } : {}),
    sourceUrl: raw.link,
    attribution: BLOG.label,
    license: BLOG.license,
    tags: uniqueTags(raw.tagNames.map((t) => t.toLowerCase())),
  };
}

export const doorofperception: CorpusWalkAdapter<DopRaw> = {
  source: "doorofperception",
  walk,
  toItem,
};
