/**
 * The `src` for an item's picture — the one rule every image surface follows.
 *
 * Every http(s) image is fetched through Ambit's own proxy (`/api/img/[itemId]`): one origin, no
 * referer sent upstream (which is what unblocked AIC), a disk cache in front of the museums
 * (Phase 7.3), and the only thing the Content-Security-Policy allows anyway — `img-src 'self'
 * data: blob:` (src/config/security-headers.js), so a raw museum URL in an `<img>` is simply
 * blocked. The `data:` bypass is for the e2e corpus, whose items carry inline base64 pixels: there
 * is nothing for a proxy to fetch.
 *
 * Pure and dependency-free so both sides can use it: the feed tile on the client, and
 * `db/collections.ts`'s `withCovers` on the server (a collection's face was a raw URL until
 * 09-12-26, and rendered as a broken image under the CSP).
 */
export function imageSrc(itemId: string, imageUrl: string): string {
  return imageUrl.startsWith("data:") ? imageUrl : `/api/img/${itemId}`;
}

/**
 * A card-sized picture: the closed-set 960 px rendition (services/image-cache.ts) for an http(s)
 * image, a `data:` URL verbatim. The questionnaire's answer cards and the reveal's hang (stored
 * in the taste, drawn again by `topics.taste`) are at most half a desktop screen wide.
 */
export function cardSrc(itemId: string, imageUrl: string): string {
  const src = imageSrc(itemId, imageUrl);
  return src.startsWith("data:") ? src : `${src}?w=960`;
}
