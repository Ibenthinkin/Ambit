// The designated-blog registry (Phase 6.3, docs/PHASE6_DESIGN_6.3.md §4.2). One entry per blog
// Ambit shows as link cards. This is config a blog's walker reads instead of hard-coding, and the
// one place a blog's credit-line label and license string are decided.
//
// **What a blog is, under Ambit's roof.** Not an open-license source. Its images and text belong
// to the blog's authors; Ambit displays one image + the blog's own excerpt + a visible credit + a
// prominent link to the post, in the shape of a social link preview, and never a republished
// article (CLAUDE.md's 08-20-26 rights decision). `license` below is the honest statement of that.
// There is no fair-use claim anywhere, and removal on request is the standing policy.
//
// **What is NOT here, on purpose (YAGNI until blog #2):** per-blog rate limits, per-blog walk
// options, tag→topic maps. `walk` names the flavour only so the next blog — which will be RSS or
// Tumblr, not WordPress (docs/PHASE6_DESIGN_HANDOFF_6.3.md F7) — has a place to say so.
import type { WalkSourceId } from "./topics";

/** The one license string every blog shares. Truthful rather than permissive. */
export const BLOG_LICENSE =
  "Rights retained by original authors — displayed with credit and link";

export interface BlogConfig {
  id: WalkSourceId;
  /** The credit line's text: `from: Door of Perception`. Also `item.attribution`. */
  label: string;
  /** Origin only — no path, no trailing slash. The walker builds its own URLs from it. */
  baseUrl: string;
  license: typeof BLOG_LICENSE;
  /** ISO date of the last human check of `/robots.txt` — the etiquette rule made into data. The
   *  walker re-checks on every run; this records that a person also looked before designating. */
  robotsCheckedOn: string;
  /** Which walker shape reads this blog. Descriptive — the walker file is wired by id in
   *  services/sources/index.ts, nothing dispatches on this at runtime. */
  walk: "wp-rest" | "tumblr";
}

export const BLOGS: readonly BlogConfig[] = [
  {
    id: "doorofperception",
    label: "Door of Perception",
    baseUrl: "https://doorofperception.com",
    license: BLOG_LICENSE,
    // Verified 08-25-26: `User-agent: * / Disallow:` (allow-all) plus a Yoast block and a sitemap.
    // No AI block list. See docs/PHASE6_DESIGN_HANDOFF_6.3.md F1.
    robotsCheckedOn: "2026-08-25",
    walk: "wp-rest",
  },
  {
    id: "thingsorganizedneatly",
    label: "Things Organized Neatly",
    baseUrl: "https://thingsorganizedneatly.tumblr.com",
    license: BLOG_LICENSE,
    // Verified 09-01-26: `*` is disallowed only /random, /day, an ad iframe and the consent path,
    // with `Crawl-delay: 1` (the walker honours it). The named-bot section — ClaudeBot,
    // anthropic-ai, CCBot, Google-Extended, … each `Disallow: /` — is Tumblr's platform default,
    // not this blog's own policy: the identical list appears verbatim on thisisnthappiness.com, a
    // different blog on a different domain. Ambit's own agent name is not on it. Ben's call, made
    // with that in front of him — docs/HANDOFF_tumblr-walk.md §3.4.
    robotsCheckedOn: "2026-09-01",
    walk: "tumblr",
  },
  {
    id: "mossandfog",
    label: "Moss & Fog",
    baseUrl: "https://mossandfog.com",
    license: BLOG_LICENSE,
    // Verified 09-01-26: `*` is disallowed only /wp-admin/ (admin-ajax allowed back); the one
    // named block is `ias_crawler` (an ad-verification bot). No AI block list, three sitemaps.
    // WordPress.com-hosted: 7,538 posts and 27,567 tags at probe time — the reason wp-rest.ts
    // resolves tag names lazily rather than up front.
    robotsCheckedOn: "2026-09-01",
    walk: "wp-rest",
  },
  {
    id: "thisiscolossal",
    label: "Colossal",
    // The canonical host is `www.`; the bare domain 301s there. Pinning the bare one would put a
    // redirect in front of every walk request.
    baseUrl: "https://www.thisiscolossal.com",
    license: BLOG_LICENSE,
    // Verified 09-01-26: `*` is `Allow: /` with a Cloudflare Content-Signal line
    // (`search=yes, ai-train=no, use=reference`) — Ambit trains nothing and a link card is
    // reference use. The named-bot section (`Amazonbot`, `Applebot-Extended`, `Bytespider`,
    // `CCBot`, `ClaudeBot`, `Google-Extended`, `GPTBot`, `meta-externalagent`, each
    // `Disallow: /`) is Cloudflare's managed template, and the Yoast block repeats CCBot / GPTBot
    // and adds `ia_archiver`. Ambit's own agent name is not on either list; Ben saw the ClaudeBot
    // entry before this row was written (docs/source-candidates.md, thisiscolossal row).
    robotsCheckedOn: "2026-09-01",
    walk: "wp-rest",
  },
];

export function blogConfig(id: string): BlogConfig | undefined {
  return BLOGS.find((b) => b.id === id);
}

/** What display code keys the link-out treatment on. A plain string in, because `item.source` is
 *  an open set in the schema and components see it as `string`. */
export function isBlogSource(source: string): boolean {
  return blogConfig(source) !== undefined;
}
