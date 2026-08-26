// STUB — replaced in full by Phase 6.3 T4. Exists so the registry compiles before the walker does.
import type { CorpusWalkAdapter, NormalizedItem } from "./types";

export const doorofperception: CorpusWalkAdapter<unknown> = {
  source: "doorofperception",
  walk: () =>
    Promise.reject(new Error("doorofperception walker not built yet (T4)")),
  toItem: (): NormalizedItem => {
    throw new Error("doorofperception walker not built yet (T4)");
  },
};
