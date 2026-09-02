# Handoff — a Tumblr-walk `CorpusWalkAdapter` for thingsorganizedneatly.tumblr.com

**Written:** 09-01-26, a source-candidates trial-loop session. **For:** originally a cold session
picking this up to implement; now the record of the build. **Status:** design approved by Ben
(09-01-26), then **built the same evening** on `feat/tumblr-walk-thingsorganizedneatly`
(`fce1d66`) — adapter, tests, live probe, and a 150-item trial-loop dry-run. **§8 records what
differed from the plan and the sample's numbers**; the Keep/Park/Cut verdict and the full walk are
still Ben's. §§1–7 are the design as approved, kept as written.

---

## 1. What this is and why

`docs/source-candidates.md`'s "Designated blogs" table lists **thingsorganizedneatly.tumblr.com**
(knolling / arranged-objects photography, 5,522 posts) as untried, blocked only on a Tumblr-walk
adapter not existing yet — the blog family so far has one shipped member
(`doorofperception.com`, Phase 6.3, WordPress REST) and this is the second, over a different API
shape. Once this lands, **thisisnthappiness.com** (also probed 09-01-26 — a different Tumblr
blog, custom domain, 108,968 posts of curated street-art photography) is a near-immediate second
consumer of the same walk mechanics — worth knowing before deciding how much to inline vs.
factor out (see §4.5).

Read `docs/source-candidates.md`'s two rows for these blogs and `SPEC.md` §6.1's "Corpus-walk
sources and designated blogs" section before touching code — this document doesn't repeat the
blog family's shipped contract (link-card posture, `body` always null, the classify-mode curator
pass), only what's new for a Tumblr source.

## 2. The approved design, in one paragraph

Mirror `doorofperception.ts` exactly in structure — `walk(cursor, opts)` over Tumblr's **legacy**
`/api/read/json?start=N&num=M` endpoint (cursor = the `start` offset, as a string), `toItem()`
pure and synchronous. Two Tumblr post `type`s are handled — `photo` (structured
`photo-url-1280`/`photo-caption` fields) and `regular` (the image is embedded inside
`regular-body` HTML and needs a small first-`<img src>` extraction — no HTML parser, a regex, per
the same "a full parser would be more code pretending to more precision than the policy needs"
reasoning `robots.ts` already uses for robots.txt). Any other post type throws, uncaught, the same
way doorofperception throws on a missing featured image — ingest counts it, nothing is silently
dropped. **No LLM-blurb-synthesis mechanism is being built.** Thin/absent captions floor on the
**existing** `structuralFloor` thin-summary rule (<60 chars) exactly like doorofperception's own 3
stubs — this was speculatively sketched as "an LLM-written summary at ingest" in
`docs/source-candidates.md`'s 08-25-26 note, but doorofperception's own shipped comment ("floored
... like any museum stub — never padded here") already answers the question the same way, and a
20-post live sample (§3.3) shows roughly half the corpus survives the floor untouched — real yield
with zero new machinery.

## 3. Findings this design rests on (all live, 09-01-26)

### 3.1 The API is live and unauthenticated

```sh
curl -s -A "Ambit/0.1 (https://github.com/Ibenthinkin/Ambit; benjamin.reilly@gmail.com)" \
  "https://thingsorganizedneatly.tumblr.com/api/read/json?num=3"
```
Returns `var tumblr_api_read = { ... };` — **strip the `var tumblr_api_read = ` prefix and
trailing `;`** before `JSON.parse`, this is not bare JSON (a real, easy-to-miss gotcha — verify
the fixture recording did this correctly). Top-level shape:
```json
{
  "tumblelog": { "title": "Things Organized Neatly", "name": "thingsorganizedneatly", ... },
  "posts-start": 0,
  "posts-total": 5522,
  "posts": [ /* array of post objects, newest first */ ]
}
```

### 3.2 Two real post shapes, verified live

**`type: "photo"`** — structured, easy:
```json
{
  "id": "823897312188301312",
  "url-with-slug": "https://thingsorganizedneatly.tumblr.com/post/823897312188301312/simon-freund-vw-caddy-14d-2021-4370-x-1640-x",
  "type": "photo",
  "slug": "simon-freund-vw-caddy-14d-2021-4370-x-1640-x",
  "date-gmt": "2026-08-03 04:01:45 GMT",
  "photo-caption": "<p><a href=\"...\">Simon Freund</a></p>\n<p><a href=\"...\">VW Caddy 14D, 2021</a></p>\n\n<p>4370 x 1640 x 2010 mm</p>",
  "photo-url-1280": "https://64.media.tumblr.com/.../s1280x1920/....jpg",
  "photo-url-500": "https://64.media.tumblr.com/.../s500x750/....jpg",
  "tags": ["things organized neatly", "submission", "simon freund", "car", "vehicle", "artwork", "photography"]
}
```

**`type: "regular"`** — image is inside the HTML body, needs extraction:
```json
{
  "id": "823327443988447232",
  "url-with-slug": "https://thingsorganizedneatly.tumblr.com/post/823327443988447232/limprimerie-photo-by-matthieu-spohn-art",
  "type": "regular",
  "slug": "limprimerie-photo-by-matthieu-spohn-art",
  "regular-title": "",
  "regular-body": "<div class=\"npf_row\"><figure class=\"tmblr-full\" data-orig-height=\"1200\" data-orig-width=\"851\"><img src=\"https://64.media.tumblr.com/3291938792de333344be033c1ac5bfff/a3eb3a918150bfe8-8f/s640x960/e81ec77db29a352b1427ccfd5b128c36bba1b7fe.jpg\" ... srcset=\"...\"/></figure></div><p><br/></p><p><i>L/IMPRIMERIE</i><br/><i>Photo by: <a href=\"...\">Matthieu Spohn</a></i><br/>Art Director: <a href=\"...\">Chris Gautschi</a></p>",
  "tags": ["things organized neatly", "art", "photography", "color", "hair", "HMU", "dye", "fashion", "leica", "camera"]
}
```
`regular-title` is frequently `""` (empty string, not absent) — confirmed on real posts. A 20-post
sample showed **16 `regular` : 4 `photo`** — `regular` is the dominant type today (Tumblr's NPF
editor produces `regular`-typed posts for what look like single-image posts), so **the adapter
must handle `regular`, not just `photo`, or it drops most of the corpus.**

Extraction rule for `regular`: take the **first** `<img src="...">` found in `regular-body`
(regex is fine, matching `robots.ts`'s own no-full-parser precedent); everything else in the body,
run through the existing `htmlToText()` (`normalize.ts`), becomes the caption text. Ignore any
further images in the same post — one post, one card, matching doorofperception's D1 (the other
~28 images a doorofperception post carries never become items either).

Other Tumblr post types exist on the platform (`video`, `audio`, `answer`, `link`, `quote`,
`chat`) but none appeared in this session's samples of this blog; treat them the same as
doorofperception's missing-featured-image case — `toItem` throws, ingest counts it.

### 3.3 Caption-length distribution (why no LLM-synthesis is needed)

A live 20-post sample (`num=20&start=0`, 09-01-26), plain-text length after stripping HTML tags:

```
type=photo    textlen=  54   type=regular  textlen=  63   type=regular  textlen= 109
type=regular  textlen=  64   type=regular  textlen=  13   type=regular  textlen= 127
type=regular  textlen= 498   type=regular  textlen=  39   type=regular  textlen=  15
type=regular  textlen=  44   type=regular  textlen= 286   type=regular  textlen= 141
type=regular  textlen= 163   type=regular  textlen=  35   type=photo    textlen=  59
type=regular  textlen= 163   type=photo    textlen=  25   type=regular  textlen=  39
type=regular  textlen=  13   type=photo    textlen= 168
```
9 of 20 fall under the existing 60-char thin-summary floor. That's a **much** higher floor rate
than doorofperception's 3-in-390 (0.8%), but with 5,522 total posts, ~50%+ survival is still
roughly 2,500+ candidate items before the LLM curation pass even runs — a healthy yield, no new
mechanism required. **Re-run this sample (or a larger one) before committing to numbers in a
walkthrough doc** — 20 posts is illustrative, not a real trial-loop sample size (see §6).

### 3.4 robots.txt — the one judgment call, resolved

```
$ curl -s -A "Ambit/0.1 (...)" https://thingsorganizedneatly.tumblr.com/robots.txt
```
names `ClaudeBot` and `anthropic-ai` explicitly with `Disallow: /`, alongside CCBot,
Google-Extended, Amazonbot, FacebookBot, meta-externalagent, Applebot-Extended, TurnitinBot,
omgili(bot), sentibot, YouBot — a real, curated-looking list, not templated Cloudflare
boilerplate. **Confirmed this is Tumblr-platform-wide, not this blog owner's own policy**: the
identical list, verbatim, appeared on `thisisnthappiness.com` — a different blog, a different
(custom) domain, same underlying Tumblr infrastructure. Ambit's own `robotsDisallowsAll()`
(`src/server/services/sources/robots.ts`) only matches the literal `*` group or the exact
`ROBOTS_AGENT_NAME` ("Ambit", from `USER_AGENT.split("/")[0]`) — neither `ClaudeBot` nor
`anthropic-ai` is Ambit's identity, so the check mechanically passes clean, the same outcome
already accepted for thisiscolossal.com's Cloudflare-managed list.

**Ben approved proceeding** (09-01-26) — record `robotsCheckedOn` in `blogs.ts` with today's date
and this reasoning in the comment, matching how `doorofperception`'s entry documents its own
robots.txt read.

### 3.5 Title, when Tumblr gives none

Many posts have no headline field at all (`regular-title: ""`, and `photo` posts have no title
field whatsoever). Resolved approach: derive `title` from the caption's own first line/clause
(after `htmlToText()`), falling back to a humanized slug (`simon-freund-vw-caddy-14d-2021` →
`"Simon Freund Vw Caddy 14D 2021"`) only when the caption is fully empty. `summary` stays the
**full** caption text regardless of length — never truncated to match the derived title, never
padded when thin. `sourceUrl` should use `url-with-slug` (the human-readable permalink) even
though `sourceId` uses the raw numeric `id` (see §4.2).

## 4. Implementation checklist

### 4.1 Type registration

- `src/server/services/sources/types.ts` — add `"thingsorganizedneatly"` to the `SourceId` union,
  with a comment following the existing Phase-6.3 pattern (see `"doorofperception"`'s comment).
- `src/server/config/topics.ts` — add `"thingsorganizedneatly"` to `WALK_SOURCES`.
- `src/server/config/blogs.ts` — widen `BlogConfig["walk"]` from `"wp-rest"` to
  `"wp-rest" | "tumblr"` (the field is descriptive only today — nothing dispatches on it at
  runtime, confirmed by grepping `doorofperception.ts` for `BLOG.walk`, it's unused there too —
  don't invent a runtime switch on it, keep it metadata). Add the config row:
  ```ts
  {
    id: "thingsorganizedneatly",
    label: "Things Organized Neatly",
    baseUrl: "https://thingsorganizedneatly.tumblr.com",
    license: BLOG_LICENSE,
    // Verified 09-01-26: root disallows only /random, /day, an ad iframe, consent path (Crawl-delay: 1).
    // The named-bot section (ClaudeBot, anthropic-ai, CCBot, ...) is confirmed Tumblr-platform-wide,
    // not this blog's own policy (identical list on thisisnthappiness.com, a different domain) —
    // Ambit's own agent name isn't listed, so this passes the shipped robotsDisallowsAll() check.
    // See docs/HANDOFF_tumblr-walk.md §3.4.
    robotsCheckedOn: "2026-09-01",
    walk: "tumblr",
  },
  ```

### 4.2 The adapter file

New file `src/server/services/sources/things-organized-neatly.ts`, mirroring
`doorofperception.ts`'s shape:

- `walk(cursor?, opts?)`: `cursor` is `start` as a string (`undefined` → `start=0`). Page size
  from `opts?.limit`, capped the same way doorofperception caps `perPage`. Call
  `assertCrawlAllowed(BLOG.baseUrl)` on the **first** page only (`cursor === undefined`), same as
  doorofperception's `page === 1` check. `noRetryOn: [401, 403]` on the fetch, `delayMs: 500` (the
  file's own `Crawl-delay: 1` in robots.txt is worth a comment — doorofperception used 500ms
  against a blog with no stated crawl-delay; consider whether this one's `Crawl-delay: 1` should
  push `DELAY_MS` to 1000 here specifically. Not resolved in this handoff — flagged for whoever
  implements to decide, low stakes either way).
  - `next`: present while `start + num < posts-total`, absent otherwise (mirrors
    `nextCursor`'s "absent, not null" contract in `types.ts`).
  - **Important parsing gotcha (§3.1)**: the response body is `var tumblr_api_read = {...};`, not
    bare JSON — strip that wrapper before parsing. Check whether `http.ts`'s `fetchJsonResponse`
    can be used as-is (it probably assumes bare JSON) or whether this needs a raw-text fetch plus
    manual strip-and-parse. This is the first non-JSON-native API in the adapter family; look at
    `fetchJsonResponse`'s implementation before assuming it fits unchanged.
- `toItem(raw)`:
  - Branch on `raw.type`. `"photo"` → `photo-url-1280` (fall back to `photo-url-500` if 1280 is
    ever absent — unconfirmed whether it always exists, check across a larger sample) as
    `imageUrl`, `htmlToText(raw["photo-caption"])` as the caption source.
  - `"regular"` → regex-extract the first `<img src="([^"]+)"` from `regular-body` as `imageUrl`
    (throw if none found — a `regular` post with no image at all is not a link card, same
    reasoning as doorofperception's missing-featured-image throw); `htmlToText()` of
    `regular-body` with that `<img>` tag stripped first (or just run `htmlToText` on the whole
    thing — `htmlToText` should already drop tag markup including `<img>`'s attributes, verify
    this doesn't leak `srcset` text into the caption before relying on it).
  - Any other `type` → throw, uncaught, message naming the type and post id (matching
    doorofperception's throw-with-context style).
  - `title`: first line/clause of the derived caption text (a reasonable cut point — e.g. up to
    the first sentence-ending punctuation or ~80 chars, whichever comes first; not rigorously
    specified here, use judgment), or a humanized `slug` (replace `-` with space, title-case) when
    the caption is empty.
  - `summary`: the full derived caption text, unmodified, even when short. **Do not floor or pad
    here** — that's `structuralFloor`'s job downstream, same as every other adapter.
  - `body`: always `null` (the blog-family invariant, `source-invariants.test.ts` asserts it).
  - `sourceId`: `raw.id` (the numeric Tumblr post id, as a string) — chosen over `slug` because
    `regular`-type posts' slugs are less certain to be present/stable across all post types than
    `id`, which is guaranteed on every type observed. (doorofperception chose slug over id for the
    opposite reason — WP guarantees a stable slug; Tumblr doesn't guarantee one as strongly across
    types. Document this reasoning in the file, it's a real point of divergence from the sibling
    adapter worth explaining, not just doing silently.)
  - `sourceUrl`: `raw["url-with-slug"]` (human-readable, matches doorofperception's `raw.link`
    role).
  - `attribution`: `BLOG.label`. `license`: `BLOG.license`.
  - `tags`: `uniqueTags(raw.tags.map(t => t.toLowerCase()))` — **no tag-name lookup call needed**,
    unlike doorofperception; Tumblr's `tags[]` is already plain lowercase strings on the wire
    (confirmed in §3.2's real examples) — this adapter is simpler than doorofperception here.

### 4.3 Registration

- `src/server/services/sources/index.ts` — import the new adapter, add it to the `walkers` map
  (mirrors the existing `doorofperception` line).

### 4.4 Tests

New `things-organized-neatly.test.ts` + `__fixtures__/things-organized-neatly.json`, following
the existing per-adapter fixture-test convention (see `doorofperception.test.ts` for the shape).
Fixture should include, at minimum:
- one `photo`-type post with a real caption (→ kept)
- one `regular`-type post with a real embedded image + caption (→ kept)
- one post (either type) with a caption under 60 chars (→ produced by `toItem`, but flooring is
  `structuralFloor`'s concern, not this adapter's test — just confirm `toItem` doesn't throw and
  produces a valid short `summary`)
- one post with an unhandled `type` (e.g. `"video"`) → confirm `toItem` throws
- a `regular`-type post with an **empty** caption after the image (if one can be found/fabricated
  faithfully) → confirm the humanized-slug title fallback fires
- run `source-invariants.test.ts` against this adapter too (it should already pick up any
  registered walker generically — confirm rather than assume)

### 4.5 Not in scope for this pass (YAGNI, but leave the door open)

- **thisisnthappiness.com** is not part of this task. Once `things-organized-neatly.ts`'s walk
  mechanics are proven, decide then whether a second Tumblr blog justifies factoring the walk
  logic into a shared `tumblr-walk.ts` core (parameterized by `BlogConfig`) the way `http.ts` /
  `robots.ts` / `normalize.ts` already serve every blog — or whether a second per-blog file
  (following doorofperception's own precedent of one bespoke file per blog) is simpler. Don't
  pre-abstract now; `blogs.ts`'s own header comment already calls this out as a "YAGNI until blog
  #2" situation and blog #2 is what this task is.
- No LLM-blurb-synthesis mechanism (§2). No change to `curator.ts`. No change to the blog-family
  presentation contract (link cards, `body: null`) — this is a new source inside an existing
  shape, not a new shape.

## 5. Constraints — read before proposing anything different

- **`toItem()` must stay pure and synchronous** (`types.ts`'s explicit contract, load-bearing for
  the fixture-test pattern) — do not reach for an LLM call inside it under any circumstance,
  including to solve the thin-caption problem. If a future session decides the floor rate here is
  genuinely too high to accept (see §3.3's caveat that 20 posts is not a real sample), that is a
  new design conversation, not a quiet addition to this adapter.
- **A 401/403 must fail the walk immediately, never retry** — `fetchJsonResponse`'s `noRetryOn`,
  the artvee/50watts rule at the wire (`types.ts`'s comment on `CorpusWalkAdapter`).
- **`CorpusWalkAdapter` and `SourceAdapter` are a cross-service agreement** (`types.ts`'s header
  comment) — this task adds a new `SourceId` and a new file, it does not touch either interface.
- Respect the 500ms (or possibly 1000ms, see §4.2) etiquette gap; sequential requests only.
- The blog-family presentation contract (link cards only, no republished articles, `body` always
  null, no fair-use claim) is settled and out of scope to relitigate here — see `SPEC.md` §6.1 and
  `docs/PHASE6_DESIGN_6.3.md` if you want the original reasoning.

## 6. Open items for whoever implements this

1. Re-run the caption-length sample at a larger size (a few hundred posts, paginating via
   `start`/`num`) before writing any walkthrough doc — §3.3's 20-post number is illustrative only.
2. Confirm `photo-url-1280` is present on every `photo`-type post across a larger sample, or
   confirm the fallback chain needed.
3. Decide the `DELAY_MS` question (500 vs 1000, given this blog's `Crawl-delay: 1`) — not resolved
   here.
4. Verify `fetchJsonResponse` (`http.ts`) can be adapted to strip the `var tumblr_api_read = ...;`
   wrapper, or whether a new small helper is needed for non-bare-JSON APIs (this is the first one
   in the adapter family).
5. After landing and doing a real ingest sample: run the actual trial-loop steps 2–4 from
   `docs/source-candidates.md` (ingest a sample, eyeball curation-score distribution against the
   existing corpus, rendered `/i/` and `/feed` surfaces) — this handoff only covers getting the
   adapter built and tested, not the Keep/Park/Cut verdict on ingested content.

## 7. Files

| path | why it matters |
|---|---|
| `src/server/services/sources/doorofperception.ts` | the sibling adapter to mirror structurally |
| `src/server/services/sources/types.ts` | `SourceId`, `CorpusWalkAdapter`, `NormalizedItem` contracts |
| `src/server/config/blogs.ts` | the designated-blog registry; add the new row here |
| `src/server/config/topics.ts` | `WALK_SOURCES` — add the new id |
| `src/server/services/sources/robots.ts` | `assertCrawlAllowed` / `robotsDisallowsAll` — reused unchanged |
| `src/server/services/sources/http.ts` | `fetchJsonResponse`, `USER_AGENT` — check the non-bare-JSON gotcha (§4.2, §6.4) before assuming it fits |
| `src/server/services/sources/normalize.ts` | `htmlToText`, `uniqueTags` — reused unchanged |
| `src/server/services/sources/index.ts` | `walkers` map — register the new adapter |
| `src/server/services/sources/source-invariants.test.ts` | should pick up the new walker generically — confirm |
| `docs/source-candidates.md` | the two blog rows (thingsorganizedneatly, thisisnthappiness) this task is scoped against |

---

## 8. Postscript — 09-01-26: built, and what the plan got wrong

Built to §4 with TDD, in one session, on `feat/tumblr-walk-thingsorganizedneatly`. Fifteen fixture
tests on six real posts, the full suite green (81 files / 863 tests), a live `probe:walk` at
offsets 0 and 3000, then a `--dry-run --quota 150` through the real classify-mode curator. What
the 200-post archive sample and the build changed, against §§3–6:

- **`photo` is the dominant type, not `regular`.** §3.2's 16:4 was the newest page; across offsets
  0/1000/3000/5400 it is **162 `photo` : 37 `regular` : 1 `answer`**. Both shapes still have to be
  handled — the newest posts are all `regular` — but the archive is mostly the structured kind.
- **The floor rate is higher deep in the archive.** 121/200 under 60 chars and 52/200 empty across
  the archive, versus 52/150 under and far fewer empty on the newest 150. Older Tumblr was
  wordless. Expect a full walk to keep ~40% at the floor, not the ~55% §3.3 guessed.
- **`photo-url-1280` is on every photo post** (162/162) — no fallback chain (§6.2 closed). On the
  oldest posts the field's URL is a `_500` rendition; the key is still there.
- **Empty caption ⇒ empty slug**, almost always (51 of 53 slugless posts had no caption). §3.5's
  humanized-slug fallback is real but nearly dead code; a third fallback — `Untitled post <id>` —
  exists so `toItem` always returns a valid item, and can never reach a reader (empty summary
  floors).
- **Reblogs put an attribution line first** — `<p><a class="tumblr_blog">name</a>:</p>` — which
  would have been the title. `deriveTitle` skips a first line matching `^\S+:$`; the summary keeps
  it (it is the blog's own text, and honest attribution of the reblog).
- **`regular` posts' `<img>` carries a `srcset`** up to the 1280 rendition, with `src` at 640. The
  adapter takes the largest srcset candidate, else `src` — a three-line improvement over §4.2's
  "take `src`".
- **`fetchJsonResponse` could not be used** (§6.4 confirmed): `res.json()` on a `var …;` body
  throws. `http.ts` now has one generic retry loop and two readers — `fetchJsonResponse` and a new
  `fetchTextResponse` — and the adapter unwraps with `parseTumblrJson`.
- **`decodeEntities` did not know `&rsquo;`.** Tumblr writes typographic punctuation as named
  entities (30 `&rsquo;`, 8 `&ldquo;`, 7 `&rdquo;`, 4 `&hellip;`, 2 `&ndash;` in 200 posts) where
  WordPress writes numeric ones. The adapter's own HTML-safety test caught it; `normalize.ts` grew
  the named list, test-first.
- **`DELAY_MS` is 1000** (§6.3 closed): the file asks `Crawl-delay: 1`, and a stated delay wins.
- **Tags come straight off the post** — no name-lookup call — minus the blog's own name, which is
  on every post and would take one of the twelve slots the curator reads.

**The sample (newest 150 offered, dry-run, no writes):** 1 `toItem` error (the `answer` post) ·
floored 67 — thin-summary 52, dup-title 9, bare-title 6 · **83 curated: avg 8.02, min 4, max 9,
65 ≥ 8 (78%)** · **55 classified (avg 8.18)** into 14 of 16 topics — zoology 10, machines 9,
typography 8, architecture 6, ancient-history 4, textiles 4, ceramics 3, the-ocean / portraiture /
mythology / botany 2, astronomy / music / cartography 1, poetry and geology 0 · **28 refused (avg
7.71)** — Prada Linea Rossa ads (a 9), a Hoppy Easter still life (the 4), flat lays, a fortune-cookie
archive: good images with no honest home among the sixteen, the same null bucket doorofperception
feeds. Would insert 55 of 150.

**One finding that needs a decision, not a fix:** `structuralFloor`'s dup-title rule dropped nine
real posts — "Andy Goldsworthy" ×3 (as `andy goldsworthy`, `Andy Goldsworthy.`, `Andy Goldsworthy`)
and "A Look Inside the Peeps Factory" ×3, "Present & Correct" ×3. The rule was written for museum
stubs sharing a catalog title; a blog posts in *series*, and a title derived from the caption's
first line collides where a WordPress title never did. Six percent of the sample, and Goldsworthy
is exactly the texture wanted. Either accept the loss, or exempt walk sources from that one rule
(the other two still apply) — Ben's call.

**Not done here:** the full walk and the write (`bun run ingest --source thingsorganizedneatly`,
~111 pages at 1 s, then ~2,000 curator calls — cents, ~15 min), the rendered `/i/` and `/feed`
eyeball, and the SPEC §6.1 promotion — steps 2–4 of the trial loop past the sample, and the verdict.
