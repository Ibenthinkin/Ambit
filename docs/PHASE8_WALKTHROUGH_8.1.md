# Phase 8.1 walkthrough — deploying Ambit to VM 202

Companion to `docs/PHASE8_PLAN_8.1.md`. The plan says what to do; this says what actually
happened, what it proved, and every trap hit along the way. Written during execution, not after —
the numbers below are the ones observed at the time, not reconstructed.

**Status: in progress.** T1–T2 shipped 08-28-26. T3 executed 08-29-26. T4 onward pending.

## Deployed facts (T3.6)

Recorded as they were confirmed, so later phases don't have to go re-derive them from a UI.

| Fact | Value | How it was confirmed |
|---|---|---|
| Coolify resource UUID | `mxo9s7hkdbtbfk2ilbvgnmfr` | prefix on both the container name and the volume |
| Container name | `mxo9s7hkdbtbfk2ilbvgnmfr-<digits>` | `docker ps --filter publish=3000` |
| Cache volume | `mxo9s7hkdbtbfk2ilbvgnmfr-ambit-cache` → `/app/.cache` | `docker volume ls \| grep ambit-cache` |
| Host port binding | `0.0.0.0:3000->3000/tcp` | `docker ps` |
| Image tag | the deployed commit SHA (`4a4c428b999c…`) | `docker ps` IMAGE column |
| Database | `ambit-db`, `postgres:17-alpine`, internal network only, no public port | `/api/health` → `db:"ok"` |
| Internal DB hostname | `rabwcgrcztxzngrrxaienfsm` (Coolify-generated, internal network only) | Coolify → `ambit-db` → internal URL |
| Coolify version | v4.3.12 | Coolify sidebar |
| Backup on-disk path | _(TODO — does not exist until the first `0 4 * * *` run)_ | Coolify → `ambit-db` → Backups |

**The container name carries a per-deploy numeric suffix**, so anything that has to find this
container (T6's invite, T7's ingest) filters on `publish=3000` or on the resource UUID — never on
the name. Inherited from ambit-archive's A.6 trap #4; it held here.

## T3 — what the first deploy proved

Everything below is from the Mac against `192.168.1.202:3000`, before the tunnel existed. That
separation is deliberate: it makes "the app is broken" and "the tunnel can't reach it" different
questions in T4, and `/api/health` (D10) is what makes them separable at all.

```
/api/health   200  {"ok":true,"db":"ok","imageCache":"ok","commit":"4a4c428b999c…"}
/             200
```

- **`commit` echoes the deployed SHA**, so "did my redeploy land?" is answerable without a shell on
  the host. This is the payoff of T1's `SOURCE_COMMIT` work.
- **`imageCache:"ok"`** is the volume proof — the directory exists at the resolved
  `IMAGE_CACHE_DIR` and is writable *by the container's user*. Had the volume not mounted, the app
  would still have served pages perfectly while quietly re-fetching the entire corpus from the
  museums; nothing else in the system would have said so. This is precisely why the health route
  checks two things rather than one.
- **`Strict-Transport-Security: max-age=31536000; includeSubDomains` is present** — and it is the
  only evidence that Coolify's **Build Variable** tick on `BETTER_AUTH_URL` took effect.
  `next.config.js` decides HSTS inside `headers()`, which Next evaluates **at build time**, so a
  build that didn't know the real origin would have baked the wrong answer in permanently and no
  runtime variable could have undone it. The Dockerfile's `test -n "$BETTER_AUTH_URL"` guard
  catches a *missing* value loudly; a value with the wrong scheme would have failed silently. It
  didn't.
- **Two requests, two different CSP nonces** (`nonce-ZGMxZmQz…`, `nonce-ZTkyODY0…`) — `src/proxy.ts`
  is minting per request in production, not reusing a build-time constant.
- **Reaching it from the Mac at all is the Ports Mappings proof.** A.6 trap #1 produces a container
  Docker calls healthy and nothing off-host can connect to; through a tunnel that reads as a
  pre-deploy 502 and sends you looking in the wrong place. Setting both *Ports Exposes* `3000` and
  *Ports Mappings* `3000:3000` avoided it.

### Two corrections to the plan, found while executing

1. **The GitHub source.** The plan said to use whatever source the archive uses, and the archive
   uses a Deploy Key — because `ambit-archive` is a *private* repo. `Ibenthinkin/Ambit` is
   **public**, so Coolify's plain **Public Repository** source is correct and neither private path
   is needed. (Repo name is `Ambit`, capital A.) If Ambit is ever made private this breaks at the
   next clone, and the archive's Deploy Key flow is the migration.
2. **Auto Deploy is off, and has to be.** Only Coolify's *GitHub App* source registers a push
   webhook by itself; Public Repository and Deploy Key both need a webhook configured by hand in
   GitHub — and GitHub cannot reach this Coolify, which listens on `192.168.1.202:8000`, LAN-only.
   Putting a Coolify login on the public internet is not a trade 8.1 makes. **A deploy is the
   Deploy button in the UI**, which is what the archive does in practice anyway. Whether to expose
   Coolify through the tunnel is 8.2's question.

Both are written back into `docs/PHASE8_PLAN_8.1.md` at T3.4 rather than left only here, so a cold
re-read of the plan doesn't repeat them.

## The archive key now lives in three places (decided, not drifted)

T3 reused the standing `ARCHIVE_API_KEY` rather than minting a new one, so it now exists in the
Mac's `.env`, the archive's Coolify env, and Ambit's Coolify env. This is a **conscious override of
the 08-24-26 trip-wire**, which read: *rotate if the archive ever gets a public route or the key is
reused.* The first clause is still not met — the archive stays LAN-only and `ARCHIVE_URL` is a
private address that never leaves VM 202 — and the key guards a read-only `/search` on a host with
no public route, which is what made leaving it acceptable in the first place.

What the third copy actually changes is the rotation cost: **rotating fewer than all three
recreates the Immich failure exactly** (two copies drifting to two different dead values, diagnosed
only by comparing sha256 fingerprints). Recorded here and, at T9.4, in the Ambit-Admin vault log,
because nothing in either repo can see this coupling.
