// The readiness signal (Phase 8.1, decision D10). Until now the only way to ask "is this app
// alive?" was to fetch `/` — a full authenticated page render, which is slow, does far more work
// than a probe should, and answers 200 even when the two things a container actually needs are
// broken. Three callers want a cheaper and more honest answer:
//
//   1. The Dockerfile's HEALTHCHECK, which is what marks the container healthy (and, in Coolify,
//      takes precedence over the UI's own check).
//   2. Every verification step in the 8.1 deploy — from the Mac, from VM 202, and through the
//      Cloudflare Tunnel — where "did the tunnel reach the app" and "did the app reach Postgres"
//      have to be separable questions.
//   3. Whatever uptime monitoring Phase 8.2 adds.
//
// **What it checks, and why exactly these two.** A boot can fail in two ways that a running
// process cannot see from the outside: the database is unreachable (wrong DATABASE_URL, Postgres
// still starting, a half-applied migration), or the image cache's directory is missing/read-only
// (the persistent volume didn't mount — the failure mode 8.1's volume exists to prevent, and one
// that otherwise shows up only as the whole corpus being re-fetched from the museums).
//
// **What it must never do: describe the machine.** This route is public and unauthenticated —
// through the tunnel, anyone can call it. So it answers in fixed vocabulary ("ok" / "error") and
// never echoes an env var, a header, a filesystem path, a driver message, or a stack. The one
// piece of detail it does return is the deployed commit, which is already public in the repo and
// is what makes "did my redeploy actually land?" answerable without a shell on the host.
import { access, constants, mkdir } from "node:fs/promises";

import { sql } from "drizzle-orm";

import { db } from "~/server/db/client";
import { imageCacheDir } from "~/server/services/image-cache";

/** Fixed vocabulary — never a message, never a path (see the note above). */
type Check = "ok" | "error";

// A probe is worthless if it can be answered from a cache: Next must run it per request, and no
// proxy, browser or CDN may keep the answer. `force-dynamic` covers Next's own render cache;
// `no-store` covers everything downstream (Cloudflare included).
export const dynamic = "force-dynamic";

/** Cheapest possible round trip that proves the pool can reach Postgres and get an answer back. */
async function checkDb(): Promise<Check> {
  try {
    await db.execute(sql`select 1`);
    return "ok";
  } catch {
    return "error";
  }
}

/**
 * Proves the image cache's directory exists and is writable *by this process*, creating it first
 * exactly as `image-cache.ts` does on a miss — so a fresh volume reads healthy rather than failing
 * its first probe, while a volume mounted read-only (or not mounted at all, leaving a path the
 * container user can't write) reads as the error it is.
 */
async function checkImageCache(): Promise<Check> {
  try {
    const dir = imageCacheDir();
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    return "ok";
  } catch {
    return "error";
  }
}

export async function GET() {
  // Both checks always run, even when the first has already failed: a probe that short-circuits
  // can only ever name one problem, and "the database is down" would hide "and the volume never
  // mounted" until the first was fixed. Two independent failures, both reported.
  const [dbStatus, imageCacheStatus] = await Promise.all([
    checkDb(),
    checkImageCache(),
  ]);
  const ok = dbStatus === "ok" && imageCacheStatus === "ok";

  return Response.json(
    {
      ok,
      db: dbStatus,
      imageCache: imageCacheStatus,
      // Coolify sets SOURCE_COMMIT on the running container; a plain `docker run` won't, and null
      // is the honest answer there rather than a fabricated one.
      commit: process.env.SOURCE_COMMIT ?? null,
    },
    {
      // 503, not 500: the app is *unable to serve*, which is what a load balancer, an orchestrator
      // and Docker's HEALTHCHECK all read as "don't send traffic here yet".
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
