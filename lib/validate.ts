// Held-out validation: the model is refitted on earlier rows and asked to predict the ones it has not
// seen. A "miss" is the factor by which it typically misses: exp(median |log residual|).

import type { ValueRow } from './value-model.ts';

export interface ValidationReport {
  walkForwardMiss: number;
  leaveOneOutMiss: number;
  baselineMiss: number;
  tested: number;
  /** Walk-forward only scores rows after the first MIN_TRAIN, so it tests fewer points than LOO. */
  walkForwardTested: number;
  looTested: number;
  kept: string[];
}

interface Fit {
  a: number;
  b: number;
}

const MIN_TRAIN = 20;

function fit(rows: ValueRow[]): Fit {
  const points = rows
    .filter((r) => r.mcap_usd !== null && r.mcap_usd > 0 && r.tvl_usd > 0)
    .map((r) => ({ x: Math.log10(r.tvl_usd), y: Math.log10((r.mcap_usd as number) / r.tvl_usd) }));
  const n = points.length;
  if (n < 2) return { a: 0, b: 0 };
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - meanX) ** 2;
    sxy += (p.x - meanX) * (p.y - meanY);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: meanY - b * meanX, b };
}

function predict(m: Fit, row: ValueRow): number {
  const multiple = 10 ** (m.a + m.b * Math.log10(Math.max(1, row.tvl_usd)));
  return Math.max(1, row.tvl_usd * multiple);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor((sorted.length - 1) / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid] as number) + (sorted[mid + 1] as number)) / 2;
}

/** The factor by which the predictions typically miss, from absolute log residuals. */
function missFactor(absLogResiduals: number[]): number {
  if (absLogResiduals.length === 0) return 1;
  return Math.exp(median(absLogResiduals));
}

function byListing(a: ValueRow, b: ValueRow): number {
  const left = a.listed_at ?? '9999-99-99';
  const right = b.listed_at ?? '9999-99-99';
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Walk-forward, leave-one-out and a median-multiple baseline, all on the same labelled rows. */
export function validateValue(rows: ValueRow[]): ValidationReport {
  const labelled = rows.filter((r) => r.mcap_usd !== null && r.mcap_usd > 0 && r.tvl_usd > 0);
  const ordered = [...labelled].sort(byListing);

  const walkAbs: number[] = [];
  const baseAbs: number[] = [];
  for (let i = MIN_TRAIN; i < ordered.length; i += 1) {
    const train = ordered.slice(0, i);
    const row = ordered[i] as ValueRow;
    const actual = row.mcap_usd as number;
    const model = fit(train);
    walkAbs.push(Math.abs(Math.log(actual / predict(model, row))));
    const multiple = median(train.map((r) => (r.mcap_usd as number) / r.tvl_usd));
    baseAbs.push(Math.abs(Math.log(actual / Math.max(1, row.tvl_usd * multiple))));
  }

  const looAbs: number[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const row = ordered[i] as ValueRow;
    const train = ordered.filter((_, j) => j !== i);
    if (train.length < 2) continue;
    const model = fit(train);
    looAbs.push(Math.abs(Math.log((row.mcap_usd as number) / predict(model, row))));
  }

  const walkForwardMiss = missFactor(walkAbs);
  const baselineMiss = missFactor(baseAbs);
  const kept = walkForwardMiss < baselineMiss ? ['size'] : [];
  return {
    walkForwardMiss,
    leaveOneOutMiss: missFactor(looAbs),
    baselineMiss,
    tested: ordered.length,
    walkForwardTested: walkAbs.length,
    looTested: looAbs.length,
    kept,
  };
}
