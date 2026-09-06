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
// **What is NOT here, on purpose (YAGNI until blog #2):** per-blog rate limits, tag→topic maps.
// `walk` names the flavour only so the next blog — which will be RSS or Tumblr, not WordPress
// (docs/PHASE6_DESIGN_HANDOFF_6.3.md F7) — has a place to say so.
//
// **`walkQuota` arrived 09-06-26** — the "per-blog walk options" that note said to wait for, and
// here is what it was waiting for: Ambit is self-hosted on a VM with a finite volume, and the
// four Tumblr blogs Ben kept in round 3 hold 207,000 posts between them. He set a budget per blog
// (the newest half, a quarter for the largest) rather than a full archive each, so the bound has
// to live where the blog lives — otherwise un-parking one in the nightly ingest walks all of it.
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
  /** Tags the blog puts on its OWN posts — its name, or its author's handle. They say nothing
   *  about the item and would each take one of the twelve tag slots the curator reads, so the
   *  tumblr walker drops them. Lowercase, because that is what it compares against. Observed
   *  per blog, never guessed: absent means "this blog does not tag itself". */
  selfTags?: readonly string[];
  /** Newest-first bound on a DEFAULT walk, in items offered — pictures after the tumblr walker's
   *  fan-out, not posts. Present ⇒ the nightly ingest walks only this many, the run is never
   *  `complete`, and `--prune` can therefore never act on this blog. Absent ⇒ walk to exhaustion,
   *  which is what every blog did before 09-06-26 and what the three small ones still do.
   *
   *  It is deliberately the same lever `--quota` pulls (scripts/ingest.ts), so a budgeted walk
   *  needs no new concept and `WalkPage`/`CorpusWalkAdapter` — cross-service contracts — did not
   *  change. `--quota` on the command line still overrides it. The rest of an archive is one
   *  `bun run ingest --source <id> --cursor <n>` later, with the cursor the bounded run printed. */
  walkQuota?: number;
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
    // things-organized-neatly.ts carries this as its own BLOG_TAG constant and does not read
    // this field; it is recorded here so every Tumblr row states the same fact in one place.
    selfTags: ["things organized neatly"],
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
  {
    id: "streetartnews",
    label: "StreetArtNews",
    // The **bare** host is canonical: `www.streetartnews.net` 301s here (checked 09-02-26), so
    // pinning `www` would put a redirect in front of every walk request.
    baseUrl: "https://streetartnews.net",
    license: BLOG_LICENSE,
    // Verified 09-02-26: four lines total — `User-agent: *`, `Disallow: /wp-admin/`,
    // `Allow: /wp-admin/admin-ajax.php`, and a sitemap. No named-bot section of any kind, so no
    // AI block list to weigh. 9,509 posts at probe time (`x-wp-total`), tags sparse — two of the
    // three newest posts carry none at all, which is fine: tags are a hint, not a floor input.
    robotsCheckedOn: "2026-09-02",
    walk: "wp-rest",
  },
  // ── Sources round 3, 09-05-26: nine Tumblr blogs on the tumblr.ts factory ────────────────────
  // All nine were probed live on 09-05-26 (200 posts sampled across each archive, at 0/25/50/75%
  // depth). Every one answers the legacy read API unauthenticated and serves the SAME file at
  // /robots.txt — Tumblr's platform default: `*` is disallowed only /random, /day, an ad iframe
  // and the consent path, with `Crawl-delay: 1` (the walker honours it), followed by fourteen
  // named-bot sections (CCBot, Google-Extended, FacebookBot, anthropic-ai, ClaudeBot, …) each
  // `Disallow: /`. That list is Tumblr's platform default rather than any one blog's policy —
  // byte-identical across all nine hosts, including thisisnthappiness.com on its own domain —
  // and Ambit's own agent name is not on it. This is Ben's standing call, first made for
  // thingsorganizedneatly with the file in front of him (docs/HANDOFF_tumblr-walk.md §3.4); it is
  // not re-litigated per row, and each row below records only what is specific to that blog.
  //
  // The per-row numbers are `posts-total` at probe time and the share of the 200-post sample that
  // carries a picture and clears structuralFloor's 60-character summary rule. That second number
  // is the one that matters: it is what the blog would actually contribute, and it ranges from
  // 89% (nemfrog) to 4% (thisisnthappiness).
  {
    id: "nemfrog",
    label: "nemfrog",
    baseUrl: "https://nemfrog.tumblr.com",
    license: BLOG_LICENSE,
    // 45,094 posts. The richest archive probed: median caption 93 chars, only 11% under the
    // 60-char floor, none empty, and 6.9 tags/post on 188 of 200 posts — scanned-plate captions
    // ("Fig. 4. Nocturnal moths. 1922.") rather than reblog chatter.
    // PARKED by Ben's verdict 09-05-26 — see SUSPENDED_SOURCES. Sampled at 91% stored / 8.15
    // avg / 87% ≥8, the highest keep-rate in the corpus, and its single biggest contributor.
    robotsCheckedOn: "2026-09-05",
    walk: "tumblr",
    // Tags 48 of 50 sampled posts with its own name.
    selfTags: ["nemfrog"],
  },
  {
    id: "humanoidhistory",
    label: "Humanoid History",
    baseUrl: "https://humanoidhistory.tumblr.com",
    license: BLOG_LICENSE,
    // 48,466 posts. Median caption 90 chars, 26% under the floor, 5.7 tags/post on 155 of 200.
    // The widest post-type spread sampled (photo, regular, answer, video, link, quote): 94% of
    // the sample carries a picture, and the other 6% is thrown and counted, never skipped.
    // PARKED by Ben's verdict 09-05-26 — see SUSPENDED_SOURCES. Sampled at 56% stored / 8.29
    // avg / 82% ≥8; the round's second biggest contributor at ~27,100 rows.
    robotsCheckedOn: "2026-09-05",
    walk: "tumblr",
  },
  {
    id: "sovietpostcards",
    label: "Soviet Postcards",
    baseUrl: "https://sovietpostcards.tumblr.com",
    license: BLOG_LICENSE,
    // 25,784 posts. Median caption 61 chars — right on the floor, so 48% of the sample fell
    // below it — but the tagging is the strongest of the nine after nemfrog: 6.8 tags/post on
    // 180 of 200, and specific rather than generic (`ussr`, `1970s`, `soviet school uniform`).
    // KEPT 09-06-26. Post-floor sample (`stats:walk --quota 150`, after T1's floor change and
    // T4's 99-topic classifier): floored 0, curated 150, avg 7.63, 61% ≥8, un-homed 0%, 95 of
    // 99 topics used, 7 toItem errors. Before those two changes: 44% stored, 44% un-homed.
    // Budget: newest 50% = 12,900 posts × 1.34 pictures/post ⇒ walkQuota 17,500 items.
    robotsCheckedOn: "2026-09-05",
    walk: "tumblr",
    walkQuota: 17_500,
  },
  {
    id: "70sscifiart",
    label: "70s Sci-Fi Art",
    baseUrl: "https://70sscifiart.tumblr.com",
    license: BLOG_LICENSE,
    // 34,836 posts. Median caption 30 chars and 66% under the floor — captions are usually just
    // an artist credit — but every one of the 200 sampled posts is tagged, 3.6 tags/post, often
    // with the artist's name (`wayne barlowe`). A leading digit in the id is legal everywhere it
    // is used: `item.source` is a free-text column and the TS unions quote their members.
    // KEPT 09-06-26. Post-floor sample: floored 0, curated 150, avg 8.49, 94% ≥8, un-homed 3%,
    // 3 toItem errors. The strongest of the four on score.
    // Budget: newest 50% = 17,400 posts × 1.46 pictures/post ⇒ walkQuota 25,500 items.
    robotsCheckedOn: "2026-09-05",
    walk: "tumblr",
    walkQuota: 25_500,
  },
  {
    id: "vintagegeekculture",
    label: "Vintage Geek Culture",
    baseUrl: "https://vintagegeekculture.tumblr.com",
    license: BLOG_LICENSE,
    // 18,930 posts. Median caption 21 chars, 78% under the floor, 56 of 198 image posts with no
    // caption at all; 2.2 tags/post on 159 of 200.
    // PARKED by Ben's verdict 09-05-26 — see SUSPENDED_SOURCES. The weakest scores of the nine
    // (7.44 avg, 56% ≥8), and the blog whose essay-length answers motivated capSummary().
    robotsCheckedOn: "2026-09-05",
    walk: "tumblr",
  },
  {
    id: "dreamsrecurring",
    label: "Dreams Recurring",
    baseUrl: "https://dreamsrecurring.tumblr.com",
    license: BLOG_LICENSE,
    // 20,636 posts, 100% of the sample carrying a picture — the cleanest post-type mix probed.
    // But 95 of 200 captions are empty and only 34 of 200 posts are tagged at all (0.2
    // tags/post): a fine-looking archive that arrives with almost nothing for the curator to
    // read or for topic mining to propose from.
    // PARKED by Ben's verdict 09-05-26 — see SUSPENDED_SOURCES. The highest average of the nine
    // (8.72 / 96% ≥8) held back by its metadata: 0.2 tags/post is little for topic mining.
    robotsCheckedOn: "2026-09-05",
    walk: "tumblr",
  },
  {
    id: "toiich",
    label: "Questi giorni quando vieni il bel sole",
    baseUrl: "https://toiich.tumblr.com",
    license: BLOG_LICENSE,
    // 11,308 posts, the smallest of the nine, and 197 of 200 sampled posts are `regular` — the
    // one archive here that is essentially all newer-editor posts, so its pictures come from the
    // body's <img> tags rather than a structured field. Median caption 44 chars, 84% under the
    // old floor, 1.5 tags/post; 21 of its first 50 posts carry more than one picture, two per
    // post on average — the densest photoset blog of the nine.
    // PARKED by Ben's verdict 09-06-26, on taste rather than on numbers, after a live probe
    // showed it to be mostly film stills with film-title captions. Settled; do not re-open.
    robotsCheckedOn: "2026-09-05",
    walk: "tumblr",
  },
  {
    id: "thevaultoftheatomicspaceage",
    label: "The Vault of the Atomic Space Age",
    baseUrl: "https://thevaultoftheatomicspaceage.tumblr.com",
    license: BLOG_LICENSE,
    // 37,494 posts and the weakest metadata of the nine by a distance: median caption 0 chars,
    // 161 of 200 empty, 93% under the floor, and ZERO tags on all 200 sampled posts.
    // KEPT 09-06-26, and the clearest case that the floor was measuring the wrong thing: the
    // post-floor sample is floored 0, curated 150, avg **8.45**, **91% ≥8**, un-homed 0%,
    // 26 of 99 topics. Under the old floor 8% of it was storable. Every caption-less card is
    // titled "The Vault of the Atomic Space Age" with an empty summary — Ben's call (plan D2).
    // Budget: newest 50% = 18,750 posts × 1.0 pictures/post ⇒ walkQuota 19,000 items.
    robotsCheckedOn: "2026-09-05",
    walk: "tumblr",
    walkQuota: 19_000,
  },
  {
    id: "thisisnthappiness",
    label: "this isn't happiness",
    // A Tumblr blog on its own domain — the legacy API answers here exactly as on a
    // *.tumblr.com host, and the robots.txt is the same platform default (which is how
    // blogs.ts's thingsorganizedneatly row was able to cite this host as the proof that the
    // named-bot list is Tumblr's and not the blog's).
    baseUrl: "https://thisisnthappiness.com",
    license: BLOG_LICENSE,
    // 108,982 posts — by far the largest archive probed. 96% of captions fall under the old
    // 60-char floor and only 73 of 200 posts carry any tag (0.5/post), which under that floor
    // meant keeping roughly 4% of a 2,180-request walk.
    // KEPT 09-06-26. Post-floor sample: floored 0, curated 150, avg 8.11, 87% ≥8, un-homed 0%,
    // 0 toItem errors — a blog whose pictures were always good and whose captions were never
    // the point. It gets the smallest budget of the four because the archive is the largest.
    // Budget: newest 25% = 27,250 posts × 1.0 pictures/post ⇒ walkQuota 27,500 items.
    robotsCheckedOn: "2026-09-05",
    walk: "tumblr",
    walkQuota: 27_500,
    // `nevver` is the author's own handle, the most frequent tag in the sample.
    selfTags: ["nevver"],
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
