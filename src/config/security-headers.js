/**
 * **Every security header this app sends, in one place** (SPEC §11, Phase 7.2 decision D3).
 *
 * Two very different consumers need these values, and they must not drift apart:
 *
 * 1. `next.config.js`'s `headers()` sends the *static* ones on every response. That file is plain
 *    ESM loaded by Next before any TypeScript exists, which is why this module is `.js` with JSDoc
 *    types rather than `.ts` — the same reason `dev-origins.js` is (see its header).
 * 2. `src/proxy.ts` builds the *Content-Security-Policy* per request, because the policy carries a
 *    freshly minted nonce and `headers()` in next.config.js has no request to mint one for.
 *
 * Keeping them in one pure module (no Next imports, no request objects, no I/O) also means Vitest
 * can assert the exact strings without booting a server — `security-headers.test.ts` is the
 * executable form of SPEC §11's header checklist.
 */

/**
 * The headers every response carries, independent of the request.
 *
 * @param {{ https: boolean }} opts - `https` gates HSTS (decision D5): the header is only honest
 *   when the app is actually served over TLS. It is derived from `BETTER_AUTH_URL`'s scheme, never
 *   from `NODE_ENV` — CI runs a *production* build over plain http, and a production build is not
 *   the same claim as an encrypted connection. Browsers ignore HSTS over http anyway; the gate is
 *   about not saying something untrue.
 * @returns {{ key: string, value: string }[]}
 */
export function staticSecurityHeaders({ https }) {
  const headers = [
    // Stops a browser from second-guessing a Content-Type. The one place it matters most here is
    // `/api/img/[itemId]`, which streams third-party bytes: without this, a file the upstream
    // mislabels could be sniffed into something executable.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Ambit is never framed. `frame-ancestors 'none'` in the CSP below is the modern expression of
    // the same rule; this is the legacy header for anything that only understands the old one.
    { key: "X-Frame-Options", value: "DENY" },
    // Outbound links (a source's page at the museum, a designated blog's article) get the origin
    // but not the path — enough for the destination's analytics to see the referral, not enough to
    // leak which item a reader was on. Cross-origin http destinations get nothing at all.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Locks only the powerful features this app never uses (decision D6). Web Share, the clipboard
    // and notifications are deliberately absent from this list: they are *features* here
    // (share-sheet.tsx, use-notification-permission.ts) and denying them would break the product.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  ];

  if (https) {
    // One year, subdomains included. No `preload` — that is a submission to a browser-vendor list
    // and an effectively irreversible commitment for the domain; 8.1 can decide it deliberately.
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  return headers;
}

/**
 * The Content-Security-Policy for one request.
 *
 * Each directive below is exactly as wide as this app's real load graph and no wider — the
 * inventory was taken in Phase 7.2 by reading every place the app pulls a byte from:
 *
 * @param {{ nonce: string, dev: boolean }} opts - `nonce` is minted per request by `proxy.ts`;
 *   `dev` loosens the two directives that `next dev` genuinely cannot live without.
 * @returns {string} the header value.
 */
export function buildCsp({ nonce, dev }) {
  return [
    // Everything not named below falls back to same-origin only.
    "default-src 'self'",
    // **Scripts.** `'strict-dynamic'` says: trust a script that carries this request's nonce, and
    // trust whatever *that* script loads — which is how Next's own chunk loader works. It also
    // makes the `'self'` in this directive a no-op in modern browsers (kept as the fallback older
    // ones read). The one hand-written inline script in the app is the pre-paint accent restore in
    // `layout.tsx`, which reads the nonce from the request and stamps it on.
    //
    // `'unsafe-eval'` in dev only: Turbopack's HMR client evaluates code it receives over the dev
    // socket. A production build never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // **Styles.** `'unsafe-inline'` stays, on purpose (decision D1): fifteen components set
    // `style={{…}}` for real per-item values (a tile's aspect ratio, an accent colour), and Next
    // inlines its own critical CSS. Blocking inline *styles* buys nothing against the threat this
    // policy exists for — script injection — and would cost a rewrite of the UI layer.
    "style-src 'self' 'unsafe-inline'",
    // **Images.** `'self'` covers `/api/img/*` (every source image is proxied through this origin
    // — nothing hotlinks a museum) plus `/landing/*.jpg` and the icons in `public/`. `data:` is
    // the e2e corpus's inline pixel and any inline SVG data URI. `blob:` is the share sheet and
    // the gallery, which fetch a proxied image as a blob and hand the object URL to an `<img>`.
    "img-src 'self' data: blob:",
    // Fonts are self-hosted: `next/font/google` downloads them at build time and serves them from
    // `/_next/static`. Nothing reaches fonts.gstatic.com at runtime.
    "font-src 'self'",
    // tRPC and Better Auth are same-origin fetches. `ws:`/`wss:` in dev is Turbopack's HMR socket.
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    // The service worker (`/serwist/sw.js`) is same-origin.
    "worker-src 'self'",
    // `/manifest.webmanifest` is same-origin.
    "manifest-src 'self'",
    // No `<object>`, `<embed>` or `<applet>` anywhere in this app — a free, total lockout of a
    // classic injection vector.
    "object-src 'none'",
    // A `<base>` tag injected into a page can silently re-point every relative URL on it.
    "base-uri 'self'",
    // Forms post to this origin only (sign-in, sign-up, the profile editor). An injected form that
    // exfiltrates a password to somebody else's server is what this stops.
    "form-action 'self'",
    // Ambit is never embedded in a frame — the modern X-Frame-Options.
    "frame-ancestors 'none'",
  ].join("; ");
}
