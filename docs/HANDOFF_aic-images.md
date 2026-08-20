# Handoff — broken feed images, concentrated in the Art Institute of Chicago

**Written:** 08-18-26, mid Phase 5.6 on-device pass. **For:** a cold session picking this up.
**Status:** one cause found and *not yet fixed* (deterministic, laptop). One symptom **not
reproduced** (phone). Two fixes already landed. Read §5 before touching anything.

---

## 1. The symptom

Ben ran the 5.6 on-device pass against the dev server from his phone and reported *"preview
unavailable for lots of images"* — the feed's `Image unavailable` fallback
(`src/components/feed/image-tile.tsx`), fired by the `<img>`'s `onError`. Asked which sources, he
said **mostly the Art Institute of Chicago**.

That fallback is expected to fire *sometimes*: images are hotlinked straight from museum CDNs until
5.7's image proxy lands, and the tile's own comment has said so since 5.6. The question this handoff
exists to answer is whether the observed rate is that known cost or a real defect.

Partial answer: **at least some of it is a real, deterministic block.** See §2.

## 2. What is established (all reproducible)

### 2.1 The corpus

7,664 items carry an `image_url`, across exactly five hosts:

| source | host | items |
|---|---|---|
| wellcome | `iiif.wellcomecollection.org` | 1,952 |
| cma | `openaccess-cdn.clevelandart.org` | 1,528 |
| met | `images.metmuseum.org` | 1,515 |
| **aic** | **`www.artic.edu`** | **1,338** |
| wikipedia | `upload.wikimedia.org` | 1,331 |

AIC is **~17.5% of every image in the feed**.

### 2.2 AIC hard-blocks a `localhost` referer — 20/20, deterministic

This is the confirmed finding. Same 20 random AIC URLs, only the `Referer` differing:

```sh
# 20/20 → 403
Referer: http://localhost:3000/
# 20/20 → 200
Referer: http://macbook-air-m5.halley-morpho.ts.net:3000/
```

The 403 comes from **Cloudflare**, not from an origin app:

```
HTTP/2 403
server: cloudflare
cf-ray: a2d486978c9aed71-EWR
referrer-policy: same-origin
```

So `www.artic.edu` sits behind Cloudflare bot management, and *something in its rule set treats a
`localhost` referer as a bot*. User-agent is **not** a factor — desktop Chrome and iOS Safari UA
strings both 403 with the localhost referer and both 200 with the tailnet referer.

**Consequence: 100% of AIC images are broken on the laptop dev server**, because `next dev`'s
canonical origin *is* `http://localhost:3000`. That is 1 image in 6 across the entire feed, failing
silently, and it has presumably been true for the whole of Phase 5.

### 2.3 The phone symptom did NOT reproduce from this machine

48 random images across all five sources, 12-concurrent, iOS Safari UA + the tailnet referer the
phone actually sends: **48/48 → 200**. Then 20 AIC-only URLs, 10-concurrent, same headers:
**20/20 → 200**.

So from the Mac's IP the phone's exact request shape works perfectly. Not referer, not
user-agent, not rate-limiting, not concurrency. **Whatever the phone hit is specific to the phone
or its network path, and is not currently reproducible from the dev machine.**

### 2.4 Payload weight (context, not yet a proven cause)

Sampled: **avg 190 KB, max 611 KB**, ≈**4.4 MB for a 24-tile page**. The tiles render at roughly
196px wide in a two-column masonry, but the stored URLs request 800–843px:

```
https://www.artic.edu/iiif/2/<uuid>/full/!843,843/0/default.jpg
https://iiif.wellcomecollection.org/image/V0024709/full/!800,800/0/default.jpg
```

Decoded, an 843² image is ~2.8 MB of RAM; a 24-tile page is ~68 MB, and the feed **never unmounts
old tiles** as it grows. On iOS that is a plausible route to failed loads under memory pressure —
plausible, *not* demonstrated.

Note both AIC and Wellcome are **IIIF** URLs, where the size is a path segment. `!843,843` → e.g.
`!400,400` is a one-token change that would cut bytes and decode memory ~4×. CMA/Met/Wikipedia are
not IIIF and would need their own handling.

**If you touch that number, keep the `!`.** `src/server/services/sources/aic.ts:40` already records
why, in blood: the fit-in-box form `!843,843` is mandatory and the IIIF docs' plain-width form
`843,` **403s on any original narrower than the requested width**. A plain-width request is
therefore a second, independent source of AIC 403s — distinguishable from §2.2's Cloudflare block
only by reading response headers, which is worth remembering if the failure pattern shifts after an
edit here. Changing the size also means re-ingesting or migrating 1,338 stored `image_url`s, since
the size is baked into the column at ingest — another reason 5.7's proxy is the better lever.

## 3. What has already been fixed (do not redo)

1. **The permanent-broken latch** — `image-tile.tsx`. `onError` used to `setBroken(true)`
   irreversibly, unmounting the `<img>` so nothing could re-request it: *one* dropped request
   disfigured that tile for the life of the page. Now 2 retries with widening backoff
   (`MAX_IMAGE_RETRIES` / `RETRY_BACKOFF_MS`), remounting via `key={attempt}`, then the caption.
   Deliberately **not** cache-busted — a unique query param would miss the CDN cache every attempt
   and turn a rate-limit into a worse one. Covered by two tests in `feed-screen.test.tsx`.
   *This makes transient failures recoverable; it does not touch a deterministic 403.*

2. **A phone-readable diagnostic** — the fallback tile now prints `source · hostname` under
   `Image unavailable` in dev only. This is how the AIC concentration was identified at all; the
   on-device pass has no console. Keep it until the image question is closed.

Also landed this session, adjacent but unrelated to images: Better Auth `trustedOrigins`
(`src/lib/auth.ts`) and Next `allowedDevOrigins` now share one list in
**`src/config/dev-origins.js`** — read that file's header, it explains why two separate allowlists
both have to name every dev origin and how differently they fail.

## 4. Open questions, in the order worth attacking

**Q1 — Is the phone actually seeing something the laptop isn't?**
Cheapest test, do it first. AIC is *provably* 100% broken on the laptop (§2.2). So before assuming a
phone-specific cause, put both devices on `/feed` side by side and compare the diagnostic labels. If
the laptop shows the same AIC-dominated failures, there is **one** bug (§2.2), not two, and the
phone was simply where Ben happened to be looking. This would make the whole "phone" framing a red
herring — worth ruling out before spending anything on Q2.

**Q2 — If the phone genuinely differs, what is different about its egress?**
Candidates, roughly in order: iCloud Private Relay (Cloudflare frequently challenges its egress
IPs, and AIC is behind Cloudflare — these interact); a Tailscale **exit node** routing the phone's
whole traffic through another host (`homeassistant` offers one on this tailnet); carrier CGNAT
reputation. All are testable by loading one AIC image URL directly in phone Safari with each toggled
off. Note the images are fetched **by the phone directly from the CDN**, not proxied through the dev
server — so the phone's own network path is what matters, not the tailnet.

**Q3 — Is the referer block a dev-only artifact?**
Both referers tested so far (`localhost:3000`, the tailnet name) are dev-only. Nobody has tested
what AIC does with a *real* production origin. It is entirely possible §2.2 evaporates in
production and is purely a dev-environment tax — which would change the priority a lot. Worth
knowing before designing a fix around it.

**Q4 — Does the request size need to come down regardless?** (§2.4)

## 5. Constraints — read before proposing a fix

- **5.7 already owns the structural answer.** `BUILD_PLAN.md` puts an image proxy in 5.7, giving
  every image one origin. That fixes §2.2 by construction (the referer becomes Ambit's own) and
  makes §2.4 tractable (resize at the proxy). **Check whether 5.7 has landed before building
  anything durable here** — a referer/header workaround in the tile could be dead code within days.
  A dev-only stopgap is a legitimate call; a permanent parallel mechanism is probably not.
- **CLAUDE.md: museum image servers bot-block third-party fetchers — anything sending an item's
  image to an external service must pass bytes, never the URL.** §2.2 is that rule collecting.
- `next/image` was rejected on purpose (see the comment in `image-tile.tsx`): it needs every host
  declared in `next.config.js`, and this feed draws from a growing, open set of museum CDNs. Don't
  reintroduce it as a fix.
- **Do not disable or loosen Better Auth's origin checking** to make anything here easier; it is
  unrelated, and §3's `trustedOrigins` work is deliberately scoped to dev.
- Respect each source's rate limits and attribution (CLAUDE.md). Retry budgets stay small.

## 6. Reproducing §2.2 in one command

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Referer: http://localhost:3000/' \
  'https://www.artic.edu/iiif/2/cf6ae0ea-6d0a-6531-341b-079129bd57d4/full/!843,843/0/default.jpg'
# → 403.  Drop the -H, or use any non-localhost referer → 200.
```

## 7. Files

| path | why it matters |
|---|---|
| `src/components/feed/image-tile.tsx` | the fallback, the retry, the dev diagnostic label |
| `src/components/feed/feed-screen.test.tsx` | the two retry tests |
| `src/server/services/sources/aic.ts` | where AIC `image_url`s are built (the IIIF size lives here) |
| `src/config/dev-origins.js` | the two-allowlist story |
| `docs/BUILD_PLAN.md` | 5.7's image proxy — the planned real fix |

---

## 8. Postscript — 08-20-26: the proxy shipped

**§2.2 is closed by construction.** Phase 5.7 landed `/api/img/[itemId]`
(`src/app/api/img/[itemId]/route.ts`): every http(s) item image is now fetched **server-side**, with
Ambit's UA and **no `Referer` header at all**. The referer Cloudflare was judging simply isn't sent
any more, so there is nothing left for the `localhost` rule to match. AIC came off
`SUSPENDED_SOURCES` in the same commit; the list is now empty, and the machinery stays in place for
whatever goes bad next.

The route takes an **item id and resolves the URL from our own table** — it never accepts a URL from
a caller. That is the open-proxy/SSRF boundary and it is commented as such in the file; don't
"helpfully" add a `?url=` escape hatch. Its rate limiter is a separate 600/min-per-IP instance
rather than the shared tRPC one, because a single feed page loads ~24 images and would otherwise
starve the API. Resizing (§2.4 / IIIF `!843,843`) and a CDN cache layer remain **7.3's**, unchanged.

**Q2 (the phone-path second cause) is still open**, and is exactly what 5.7's iOS device pass is
for. The proxy removes the referer variable entirely, so if AIC images still fail on the phone
after this, the remaining cause is genuinely something else — and that is now a clean experiment
rather than a confounded one. Record the verdict here when the pass runs.

**Q3 (is the block a dev-only artifact?) stays open until deploy**, and is now mostly academic: with
every image served from Ambit's own origin, the production answer stops mattering for correctness.
Worth confirming once anyway, since it decides whether the proxy is load-bearing or merely tidy.

### Footnote: an unrelated trap in this repo's test suite

`bun run test` is ~12s and green (35 files / 329 tests). But when two runs overlap, or the dev
server is under load, **setup time balloons from ~7s to ~650s and unrelated integration tests fail**
— observed three times in one session, in a different test each time, always something touching
Postgres. It passes alone and passes clean. If you see a red integration test, check whether
anything else is running before you debug it. This rhymes with 5.6's Playwright flake, which also
turned out to be environmental rather than a test bug — but note that one had two *real* causes
underneath, so don't take "probably contention" on faith without checking the setup timing.
