/**
 * The non-localhost origins allowed to reach the dev server — one list, because **two independent
 * allowlists** have to agree or on-device testing half-works in a way that's genuinely hard to read:
 *
 * 1. Next's `allowedDevOrigins` (next.config.js) governs `/_next/*` asset serving. Get it wrong and
 *    the HTML renders but the scripts never boot — React doesn't hydrate and every control on the
 *    page is inert, with nothing in the terminal or the console to say why (the 08-17-26
 *    dead-buttons incident).
 * 2. Better Auth's `trustedOrigins` (src/lib/auth.ts) governs its CSRF origin check. Get it wrong
 *    and the page works fine right up until you try to sign in, which answers `403` with
 *    `[Better Auth]: Invalid origin: …` in the server log (found 08-18-26, from a phone on the
 *    tailnet — #1 had been updated and #2 hadn't).
 *
 * They fail at different moments and look like unrelated bugs, so they live here together.
 *
 * Tailscale first: a 100.x address and its MagicDNS name are assigned per-device and follow the
 * machine between networks, so they don't rot the way a DHCP lease does — reach the dev server from
 * a phone at http://macbook-air-m5.halley-morpho.ts.net:3000 with Tailscale on at both ends. The
 * plain-LAN entry is a same-network fallback and *is* DHCP-assigned: re-copy it from `next dev`'s
 * "Network:" line whenever it stops matching.
 *
 * Hosts only, no scheme or port — `allowedDevOrigins` wants them bare, and `devTrustedOrigins()`
 * below adds the scheme and port Better Auth wants.
 */
export const DEV_ORIGIN_HOSTS = [
  "100.109.133.60",
  "macbook-air-m5.halley-morpho.ts.net",
  "192.168.1.215",
];

/**
 * The same hosts as full origins, which is the shape Better Auth matches against the request's
 * `Origin` header. Returns `[]` outside development so a production build can never carry a
 * personal tailnet address into its trusted set.
 *
 * **Two schemes, and the https one is load-bearing for a whole class of testing.** A plain
 * `http://` LAN origin is not a *secure context*, and browsers gate real features on that — the
 * Web Share API (`navigator.share` / `canShare`, which is what puts an image in the iOS camera
 * roll), the async clipboard, service workers. On http they are not "broken", they are `undefined`,
 * so code falls through to whatever fallback it has and the feature looks quietly wrong: 5.7's
 * Save-image landed in Files instead of Photos for exactly this reason. `tailscale serve --bg 3000`
 * puts a real cert in front of the dev server at `https://<magicdns-name>` (port 443, hence the
 * port-less entry), which makes the phone a secure context and those features testable at all.
 *
 * @param {number} port - the port `next dev` is serving on (3000 unless `-p` says otherwise).
 * @returns {string[]}
 */
export function devTrustedOrigins(port = 3000) {
  if (process.env.NODE_ENV === "production") return [];
  return DEV_ORIGIN_HOSTS.flatMap((host) => [
    `http://${host}:${port}`,
    // Port-less: Tailscale Serve terminates TLS on 443, so the Origin header carries no port.
    `https://${host}`,
  ]);
}
