/**
 * The filename an image gets when a reader saves or shares it (Phase 7.3, decision D8).
 *
 * **Why this is not just `${itemId}.jpg` any more.** Both save-image paths — the item page's share
 * sheet and the gallery's — fetch `/api/img/${itemId}` and hand the blob to `navigator.share` or an
 * `<a download>`. Since 7.3 that route serves **WebP**, one variant per item, and a `.jpg` name on
 * WebP bytes is a small lie the OS acts on: iOS Files shows it as a JPEG, some desktop viewers
 * refuse it outright, and re-sharing it carries the wrong type onward.
 *
 * So the extension follows what the server actually sent — `blob.type` — rather than what the route
 * used to send. `.jpg` stays the fallback for a blob with no type at all (an old service-worker
 * entry from before this phase, or a browser that doesn't set one), because a wrong-but-familiar
 * extension beats no extension.
 */
const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function imageFileName(itemId: string, blobType: string): string {
  // `blob.type` can carry parameters ("image/webp; charset=binary" is rare but legal).
  const mime = blobType.split(";")[0]!.trim().toLowerCase();
  return `${itemId}.${EXTENSIONS[mime] ?? "jpg"}`;
}
