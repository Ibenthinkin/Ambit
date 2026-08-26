import { aic } from "./aic";
import { archive } from "./archive";
import { cma } from "./cma";
import { doorofperception } from "./doorofperception";
import { loc } from "./loc";
import { met } from "./met";
import { nasaImages } from "./nasa-images";
import { poetrydb } from "./poetrydb";
import { smithsonian } from "./smithsonian";
import type { CorpusWalkAdapter, SourceAdapter, SourceId } from "./types";
import { wellcome } from "./wellcome";
import { wikipedia } from "./wikipedia";
import type { WalkSourceId } from "~/server/config/topics";

/** Every SourceId that is NOT a walk source — the keys `adapters` must cover exhaustively. */
export type SearchSourceId = Exclude<SourceId, WalkSourceId>;

export const adapters: Record<SearchSourceId, SourceAdapter<unknown>> = {
  wikipedia,
  met,
  aic,
  cma,
  wellcome,
  archive,
  smithsonian,
  loc,
  "nasa-images": nasaImages,
  poetrydb,
};

/** Phase 6.3: the corpus-walk registry, beside — never inside — the search registry. The two
 *  Record key types are complementary halves of SourceId, so a source in both (or neither) is a
 *  compile error here rather than a runtime surprise in ingest. */
export const walkers: Record<WalkSourceId, CorpusWalkAdapter<unknown>> = {
  doorofperception,
};

/** For CLIs that validate a `--source` flag: everything ingest knows how to reach. */
export const ALL_SOURCE_IDS: SourceId[] = [
  ...(Object.keys(adapters) as SearchSourceId[]),
  ...(Object.keys(walkers) as WalkSourceId[]),
];

export type {
  CorpusWalkAdapter,
  NormalizedItem,
  SourceAdapter,
  SourceId,
  FetchOpts,
  WalkPage,
} from "./types";
