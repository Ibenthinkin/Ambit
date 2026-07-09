# Ambit — Project Log

Narrative record of decisions, findings, and dead-ends that don't live in commit
messages. `/brief` reads this. Newest on top.

## 2026-07

### [[07-08-26 Wed]] — Repo setup + in-repo log
**Shipped:**
- `docs/BUILD_PLAN.md`: the living execution tracker (Phase 0 → MVP → Polish), step 0.1 done (plan committed, `LICENSE` moved to repo root, README license field fixed).
- `docs/source-candidates.md`: post-MVP backlog of candidate content APIs, seeded with early ideas to organize later.
- This `log.md` convention, replacing the dead `VAULT_LOG_PATH` vault-rollup step (adapted from Magpie's `log.md` pattern — the vault's `/brief` skill already reads any hybrid project's `<repo>/log.md` generically, no per-project wiring needed).

**Decisions:**
- Dev magic-link mail: Mailpit in dev, Resend in prod. Dev DB: local Docker Compose (`pgvector` image). Recorded in BUILD_PLAN.md context.
- Project log lives in-repo (`log.md` at root) and complements commits — retired `VAULT_LOG_PATH`.

**Open / next (pick up here):**
- Phase 0 is still the active phase: **0.2 sample harvester** — Bun script to pull ~300–600 raw items from Wikipedia + Met + AIC across ~8 topic seeds, normalize, dump to `phase0/items.json`, note per-source density in `phase0/NOTES.md`.
- Then 0.3 (embed with both candidates) → 0.4 (eyeball harness, go/no-go on serendipity + embedding model pick).
