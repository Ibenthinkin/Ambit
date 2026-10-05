// The temperament strip (docs/DESIGN_first-exhibition.md §6): Rentfrow, Goldberg & Zilca's five
// entertainment dimensions — Communal, Aesthetic, Dark, Thrilling, Cerebral — read off the topic
// scores through a per-topic weight table (config/temperament.ts, a design proposal, not the
// paper's numbers), plus the destinations' and reading cards' own direct weights. Normalised so
// the strongest dimension is 1 and the strip reads 0…1. Pure.
import {
  DIRECT_TEMPERAMENT_FACTOR,
  TEMPERAMENT_DIMENSIONS,
  TOPIC_TEMPERAMENT,
  type TemperamentDimension,
} from "~/server/config/temperament";
import type { TemperamentWeights } from "~/server/config/interview-destinations";

export type Temperament = Record<TemperamentDimension, number>;

function zeros(): Temperament {
  const t = {} as Temperament;
  for (const d of TEMPERAMENT_DIMENSIONS) t[d.id] = 0;
  return t;
}

/**
 *   dims[d] = Σ_topic max(0, score[topic]) × table[topic][d]
 *           + DIRECT_TEMPERAMENT_FACTOR × Σ direct[d]
 *   then every dim / the largest (all zeros stay zeros).
 */
export function temperamentFrom(
  scores: ReadonlyMap<string, number>,
  direct: readonly TemperamentWeights[],
  table: Readonly<Record<string, TemperamentWeights>> = TOPIC_TEMPERAMENT,
): Temperament {
  const t = zeros();
  for (const [topic, score] of scores) {
    if (score <= 0) continue;
    const w = table[topic];
    if (!w) continue;
    for (const d of TEMPERAMENT_DIMENSIONS) t[d.id] += score * (w[d.id] ?? 0);
  }
  for (const w of direct)
    for (const d of TEMPERAMENT_DIMENSIONS)
      t[d.id] += DIRECT_TEMPERAMENT_FACTOR * (w[d.id] ?? 0);
  const max = Math.max(...TEMPERAMENT_DIMENSIONS.map((d) => t[d.id]));
  if (max > 0) for (const d of TEMPERAMENT_DIMENSIONS) t[d.id] /= max;
  return t;
}
