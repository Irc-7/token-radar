// The value model: log10(market cap / TVL) against log10(TVL), fitted on the protocols that record a
// token. No category term: it survived neither held-out test on the rank-1 page and we have no evidence
// it survives ours. The multiple is clipped so a $40B protocol and one at the $50M floor stay finite.

export interface ValueModel {
  a: number;
  b: number;
  /** Empirical log10 residuals, sorted ascending, so a quantile is a lookup. */
  residuals: number[];
  n: number;
}

export interface ValueRow {
  tvl_usd: number;
  mcap_usd: number | null;
  category?: string | null;
  listed_at?: string | null;
}

const MIN_MULTIPLE = 0.001;
const MAX_MULTIPLE = 100;

/** Ordinary least squares on the labelled rows; no category term, no random start. */
export function fitValueModel(rows: ValueRow[]): ValueModel {
  const points = rows
    .filter((r) => r.mcap_usd !== null && r.mcap_usd > 0 && r.tvl_usd > 0)
    .map((r) => ({ x: Math.log10(r.tvl_usd), y: Math.log10((r.mcap_usd as number) / r.tvl_usd) }));
  const n = points.length;
  if (n < 2) return { a: 0, b: 0, residuals: [0], n };

  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - meanX) ** 2;
    sxy += (p.x - meanX) * (p.y - meanY);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = meanY - b * meanX;
  const residuals = points.map((p) => p.y - (a + b * p.x)).sort((q, r) => q - r);
  return { a, b, residuals, n };
}

/** The point multiple at a TVL, clipped to a finite, positive band. */
export function multipleAt(model: ValueModel, tvl: number, _category: string | null = null): number {
  const raw = 10 ** (model.a + model.b * Math.log10(Math.max(1, tvl)));
  return Math.min(MAX_MULTIPLE, Math.max(MIN_MULTIPLE, raw));
}

/** The empirical quantile of the sorted residuals: linear interpolation, no RNG. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const low = sorted[lo] as number;
  const high = sorted[hi] as number;
  return low + (high - low) * (pos - lo);
}

/** The P25 or P75 multiple: the point multiple, scaled by the residual quantile, and bracketing it. */
export function rangeAt(model: ValueModel, tvl: number, q: 0.25 | 0.75): number {
  if (q !== 0.25 && q !== 0.75) throw new Error(`rangeAt: q must be 0.25 or 0.75, got ${q}`);
  const point = multipleAt(model, tvl);
  const factor = 10 ** quantile(model.residuals, q);
  const scaled = point * factor;
  return q === 0.25 ? Math.min(point, scaled) : Math.max(point, scaled);
}
