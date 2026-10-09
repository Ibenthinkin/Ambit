// The usage beacon (docs/DESIGN_usage.md, "Transport"): the one endpoint the browser's event
// queue posts to, with `navigator.sendBeacon`, when it flushes.
//
// **Why a route handler and not a tRPC procedure.** `sendBeacon` is the only call the browser
// promises to finish *after* the page is gone (`pagehide`, a tab close, a swipe-away on a phone) —
// an ordinary `fetch` is cancelled with the page. But a beacon can only POST a body; it cannot
// set headers, read the response, or speak tRPC's batch envelope. A plain `POST` route is the
// shape it can reach.
//
// **Why it always answers 204.** The client cannot read the answer (a beacon discards it), so a
// 4xx buys nothing but noise in the console and in the logs — and it would tell a probing caller
// which of our checks it tripped. Every path below, rejected or accepted, is the same empty
// `204 No Content` with `Cache-Control: no-store`; the only trace of a rejection is one counts-only
// `console.warn` line. "Dropped" is the verdict, not "error".
//
// **Why an `Origin` check.** A beacon is a cross-site-capable POST: any page on the web could
// make a visitor's browser send one here, with that visitor's cookies attached. Browsers always
// stamp `Origin` on a POST and a page cannot forge it, so requiring it to equal our own origin
// shuts out other sites writing into a signed-in reader's log. A request with no `Origin`
// (curl, a script) is rejected the same way; the real client always has one.
//
// **What is checked, in order** (cheapest first): (a) Origin, (b) a rate limit keyed on the
// reader, (c) the body's byte size and JSON shape, (d) each event against the vocabulary in
// `config/usage.ts` — an invalid event is dropped, not the batch, (e) `at` clamped to the last
// hour, (f) the session: a signed-out visitor's events survive only if they are `visit.*` or
// `screen.open` (design posture 6), (g) the write, (h) the 204.
import { z } from "zod";

import {
  MAX_EVENTS_PER_BEACON,
  META_SPEC,
  SCREENS,
  USAGE_KINDS,
  type MetaRule,
  type UsageKind,
} from "~/config/usage";
import { RateLimiter, trustedClientIp } from "~/server/services/rate-limit";
import type { NewUsageEvent } from "~/server/db/schema";

// Next must run this per request, and nothing downstream may keep the answer.
export const dynamic = "force-dynamic";

const NO_CONTENT = { status: 204, headers: { "Cache-Control": "no-store" } };

/** 64 KB of bytes — fifty events are a few KB; anything bigger is not our client. */
const MAX_BODY_BYTES = 64 * 1024;
/** `at` is the client's clock; we believe it only within this window. */
const MAX_AGE_MS = 60 * 60 * 1000;

// Per-process, like every limiter here (see `RateLimiter`'s caveat). 30 beacons a minute is far
// above the client's 15 s flush, so a real reader never meets it.
const limiter = new RateLimiter({ limit: 30, windowMs: 60_000 });

/** The only kinds a signed-out visitor may record: they carry no personal taste. */
const SIGNED_OUT_KINDS: ReadonlySet<UsageKind> = new Set([
  "visit.start",
  "visit.end",
  "screen.open",
]);

// ---- schemas, built from the config so it stays the single truth ----------------------------

function valueSchema(rule: MetaRule): z.ZodTypeAny {
  if (Array.isArray(rule)) return z.enum(rule as [string, ...string[]]);
  if (rule === "bool") return z.boolean();
  if (rule === "int") return z.number().int().min(0);
  if ("int" in (rule as object)) {
    const { min, max } = (rule as { int: { min: number; max: number } }).int;
    return z.number().int().min(min).max(max);
  }
  return z
    .string()
    .min(1)
    .max((rule as { string: { max: number } }).string.max);
}

/**
 * One strict object per kind. Every key the config lists is required; `.strict()` rejects any
 * other, so an unknown key fails the *event*. A kind with no keys becomes `z.object({}).strict()`,
 * which accepts only `{}`.
 */
const metaSchemas = Object.fromEntries(
  USAGE_KINDS.map((kind) => [
    kind,
    z
      .object(
        Object.fromEntries(
          Object.entries(META_SPEC[kind] as Record<string, MetaRule>).map(
            ([key, rule]) => [key, valueSchema(rule)],
          ),
        ),
      )
      .strict(),
  ]),
) as Record<UsageKind, z.ZodObject<z.ZodRawShape, "strict">>;

const eventSchema = z.object({
  kind: z.enum(USAGE_KINDS),
  at: z.string().datetime({ offset: true }),
  screen: z.enum(SCREENS).optional(),
  itemId: z.string().max(32).optional(),
  topicId: z.string().max(64).optional(),
  meta: z.unknown().optional(),
});

const bodySchema = z.object({
  visit: z.string().min(8).max(32),
  events: z.array(z.unknown()),
});

type Drops = Record<string, number>;

export async function POST(req: Request) {
  const drops: Drops = {};
  const drop = (reason: string, n = 1) => {
    drops[reason] = (drops[reason] ?? 0) + n;
  };
  let kept = 0;
  try {
    kept = await handle(req, drop);
  } catch {
    // Nothing a beacon can do about it, and nothing the reader should hear of.
    drop("error");
  }
  const dropped = Object.values(drops).reduce((a, b) => a + b, 0);
  if (dropped > 0) console.warn("usage beacon", { dropped, kept, drops });
  return new Response(null, NO_CONTENT);
}

/** Runs checks (a)–(g); returns how many events were written. Reasons go to `drop`. */
async function handle(
  req: Request,
  drop: (reason: string, n?: number) => void,
): Promise<number> {
  // (a) Origin. Dynamic import: `~/env` validates the environment at load, which CI's
  // `bun run test` does not have (see trpc.ts's createTRPCContext).
  const { env } = await import("~/env");
  if (req.headers.get("origin") !== new URL(env.BETTER_AUTH_URL).origin) {
    drop("origin");
    return 0;
  }

  // The session is read now, ahead of the limiter, because a signed-in reader is limited by
  // account rather than by address. (It is step (f) in the header: it decides `userId` below.)
  // A lookup that throws is treated as signed out — the stricter of the two postures — rather
  // than losing the visit entirely.
  let userId: string | null = null;
  try {
    const { auth } = await import("~/lib/auth");
    const session = await auth.api.getSession({ headers: req.headers });
    userId = session?.user.id ?? null;
  } catch {
    userId = null;
  }

  // (b) Rate limit.
  const key = userId ?? trustedClientIp(new Headers(req.headers)) ?? "unknown";
  if (!limiter.allow(key)) {
    drop("rate");
    return 0;
  }

  // (c) Body: bytes first (a string's `.length` counts UTF-16 units, not bytes), then JSON.
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    drop("size");
    return 0;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    drop("json");
    return 0;
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) {
    drop("shape");
    return 0;
  }

  // The 51st event onward is dropped; the first 50 are kept.
  const candidates = body.data.events.slice(0, MAX_EVENTS_PER_BEACON);
  if (body.data.events.length > candidates.length) {
    drop("overflow", body.data.events.length - candidates.length);
  }

  const now = Date.now();
  const rows: NewUsageEvent[] = [];
  for (const raw of candidates) {
    // (d) Per event: the envelope, then the meta against that kind's own strict schema.
    const ev = eventSchema.safeParse(raw);
    if (!ev.success) {
      drop("invalid");
      continue;
    }
    const e = ev.data;
    const meta = metaSchemas[e.kind].safeParse(e.meta ?? {});
    if (!meta.success) {
      drop("invalid");
      continue;
    }
    // (f) Signed-out visitors keep only the three presence kinds.
    if (userId === null && !SIGNED_OUT_KINDS.has(e.kind)) {
      drop("signed-out");
      continue;
    }
    // (e) `at` is the client's clock, so it is only trusted inside [now - 1 h, now].
    const at = new Date(
      Math.min(now, Math.max(now - MAX_AGE_MS, Date.parse(e.at))),
    );
    rows.push({
      userId,
      visit: body.data.visit,
      kind: e.kind,
      at,
      screen: e.screen ?? null,
      itemId: e.itemId ?? null,
      topicId: e.topicId ?? null,
      meta: Object.keys(meta.data).length > 0 ? meta.data : null,
    });
  }

  // (g) The writer never throws (it logs and swallows), so there is nothing to catch here.
  if (rows.length > 0) {
    const { recordEvents } = await import("~/server/db/usage");
    await recordEvents(rows);
  }
  return rows.length;
}
