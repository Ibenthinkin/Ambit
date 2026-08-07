// The complete v1 adapter registry (SPEC §6.1) — all five sources land in Phase 3 (decided during
// 3.1's planning, see docs/PHASE3_PLAN.md; superseded the original "three sources first" note).
// The ingestion job (Phase 3.4) imports this directly rather than wiring up each adapter by hand.
import { aic } from "./aic";
import { cma } from "./cma";
import { met } from "./met";
import type { SourceAdapter, SourceId } from "./types";
import { wellcome } from "./wellcome";
import { wikipedia } from "./wikipedia";

export const adapters: Record<SourceId, SourceAdapter<unknown>> = {
  wikipedia,
  met,
  aic,
  cma,
  wellcome,
};

export type {
  NormalizedItem,
  SourceAdapter,
  SourceId,
  FetchOpts,
} from "./types";
