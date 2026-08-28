#!/usr/bin/env bun
/**
 * Prints a `Cookie:` header value for a signed-in session, so Lighthouse can measure `/feed`
 * (Phase 7.3, T5.2).
 *
 *   bun run scripts/lh-cookie.ts --email me@example.com --password 'hunter2'
 *   bunx lighthouse http://localhost:3000/feed --extra-headers "{\"Cookie\":\"$(…)\"}"
 *
 * **Dev tool, not app code.** `/feed` is the screen worth measuring and it is behind a session, so
 * something has to produce a cookie without a browser. Better Auth's server-side API does it
 * directly: `asResponse: true` returns a real `Response`, and the session cookie is on its
 * `set-cookie` header (verified against the Better Auth docs and `api/dispatch.ts` on 08-28-26).
 *
 * Only the `name=value` part of each cookie is printed — `Max-Age`, `Path`, `HttpOnly` and friends
 * are instructions *to* a browser and have no place in a request header.
 */
function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const email = flag("email");
const password = flag("password");

if (!email || !password) {
  console.error(
    "usage: bun run scripts/lh-cookie.ts --email <email> --password <password>",
  );
  process.exit(1);
}

const { auth } = await import("~/lib/auth");

const response = await auth.api.signInEmail({
  body: { email, password },
  asResponse: true,
});

if (!response.ok) {
  console.error(`sign-in failed: ${response.status} ${await response.text()}`);
  process.exit(1);
}

const cookies = response.headers.getSetCookie();
if (cookies.length === 0) {
  console.error("sign-in succeeded but set no cookies — nothing to print");
  process.exit(1);
}

console.log(cookies.map((c) => c.split(";")[0]!.trim()).join("; "));
process.exit(0);
