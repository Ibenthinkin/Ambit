// The adapter registry (SPEC §6.1) — the five v1 sources land in Phase 3 (decided during 3.1's
// planning, see docs/PHASE3_PLAN.md; superseded the original "three sources first" note), joined
// by a sixth, `archive`, in Phase A.5: Ben's own personal-archive service rather than a public
// museum API. The ingestion job (Phase 3.4) imports this directly rather than wiring up each
// adapter by hand, which makes this record the ONLY wiring a new source needs — adding a line
// here is what enables `bun run ingest --source=<id>` and `bun run probe <id> "query"`.
import { aic } from "./aic";
import { archive } from "./archive";
import { cma } from "./cma";
import { met } from "./met";
import { smithsonian } from "./smithsonian";
import type { SourceAdapter, SourceId } from "./types";
import { wellcome } from "./wellcome";
import { wikipedia } from "./wikipedia";

export const adapters: Record<SourceId, SourceAdapter<unknown>> = {
  wikipedia,
  met,
  aic,
  cma,
  wellcome,
  archive,
  smithsonian,
};

export type {
  NormalizedItem,
  SourceAdapter,
  SourceId,
  FetchOpts,
} from "./types";
