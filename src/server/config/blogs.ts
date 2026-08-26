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
  walk: "wp-rest";
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
];

export function blogConfig(id: string): BlogConfig | undefined {
  return BLOGS.find((b) => b.id === id);
}

/** What display code keys the link-out treatment on. A plain string in, because `item.source` is
 *  an open set in the schema and components see it as `string`. */
export function isBlogSource(source: string): boolean {
  return blogConfig(source) !== undefined;
}
