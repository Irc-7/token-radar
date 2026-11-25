// Peer-record odds: the share of comparable protocols that ended up trading. This is a record of the
// labelled set, never a forecast, and the page says so. A null age falls back to the labelled median,
// never to zero days.

// The Brier score is reported twice: in-sample, and pooled over five contiguous time folds where the
// coefficients are refit on the other four. The held-out number is the one the page headlines, because
// an in-sample Brier flatters a model that has simply memorised its own rows.

export interface OddsModel {
  intercept: number;
  coef: { logAge: number; logTvl: number };
  brier: number;
  baseBrier: number;
  /** Pooled Brier over five contiguous folds, coefficients refit without each fold. */
  brierCv: number;
  /** Base rate re-estimated on each training fold, scored on the matching held-out fold. */
  baseBrierCv: number;
  /** Base rate measured on the scored rows themselves, pooled: the standard Brier reference. */
  baseBrierCvScored: number;
  /** Brier skill against baseBrierCvScored: (base - brier) / base. Negative means no edge. */
  skillCvScored: number;
  /** Brier skill against baseBrierCv, the training-side rate. Positive means an edge there. */
  skillCvTrain: number;
  /** Of the folds, how many scored worse than their own rows' base rate. */
  foldsLostScored: number;
  folds: number;
  n: number;
  medianAgeDays: number;
}

export interface OddsRow {
  tvl_usd: number;
  ageDays: number | null;
  hasToken: 0 | 1;
  /** Listing date, ISO. Used only to order contiguous folds; never a feature of the model. */
  listedAt?: string | null;
}

export interface OddsFeatures {
  ageDays: number | null;
  tvl: number;
}

type LabelledRow = OddsRow & { ageDays: number; listedAt?: string | null };
interface Fit {
  intercept: number;
  coef: { logAge: number; logTvl: number };
}

const MAX_ODDS = 0.999;
const MIN_ODDS = 0.001;
const FOLD_COUNT = 5;

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor((sorted.length - 1) / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid] as number) + (sorted[mid + 1] as number)) / 2;
}

/** Gradient descent on standardised features, denormalised back to raw log10 coefficients. */
function train(labelled: LabelledRow[]): Fit {
  const n = labelled.length;
  const xs = labelled.map((r) => [Math.log10(Math.max(1, r.ageDays)), Math.log10(Math.max(1, r.tvl_usd))] as const);
  const ys = labelled.map((r) => r.hasToken);
  const meanX = [0, 1].map((j) => xs.reduce((s, x) => s + (x[j] as number), 0) / n);
  const sdX = [0, 1].map((j) => {
    const spread = Math.sqrt(xs.reduce((s, x) => s + ((x[j] as number) - (meanX[j] as number)) ** 2, 0) / n);
    return spread === 0 ? 1 : spread;
  });
  const z = xs.map((x) => [((x[0] as number) - (meanX[0] as number)) / (sdX[0] as number), ((x[1] as number) - (meanX[1] as number)) / (sdX[1] as number)] as const);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  const learningRate = 0.5;
  for (let step = 0; step < 500; step += 1) {
    let g0 = 0;
    let g1 = 0;
    let g2 = 0;
    for (let i = 0; i < n; i += 1) {
      const zi = z[i] as readonly [number, number];
      const p = sigmoid(b0 + b1 * zi[0] + b2 * zi[1]);
      const error = p - (ys[i] as number);
      g0 += error;
      g1 += error * zi[0];
      g2 += error * zi[1];
    }
    b0 -= (learningRate * g0) / n;
    b1 -= (learningRate * g1) / n;
    b2 -= (learningRate * g2) / n;
  }

  return {
    intercept: b0 - (b1 * (meanX[0] as number)) / (sdX[0] as number) - (b2 * (meanX[1] as number)) / (sdX[1] as number),
    coef: { logAge: b1 / (sdX[0] as number), logTvl: b2 / (sdX[1] as number) },
  };
}

function probability(fit: Fit, row: LabelledRow): number {
  const logAge = Math.log10(Math.max(1, row.ageDays));
  const logTvl = Math.log10(Math.max(1, row.tvl_usd));
  return sigmoid(fit.intercept + fit.coef.logAge * logAge + fit.coef.logTvl * logTvl);
}

function brierOf(fit: Fit, rows: LabelledRow[]): number {
  if (rows.length === 0) return 0.25;
  let sse = 0;
  for (const row of rows) sse += (probability(fit, row) - row.hasToken) ** 2;
  return sse / rows.length;
}

/** Oldest first, undated rows last, stable so equal dates keep their snapshot order. */
function byListing(a: LabelledRow, b: LabelledRow): number {
  const left = a.listedAt ?? '9999-99-99';
  const right = b.listedAt ?? '9999-99-99';
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function fitOdds(rows: OddsRow[]): OddsModel {
  const labelled = rows.filter((r): r is LabelledRow => r.ageDays !== null && r.tvl_usd > 0);
  const medianAgeDays = median(labelled.map((r) => r.ageDays));
  const n = labelled.length;
  if (n === 0) {
    return {
      intercept: 0,
      coef: { logAge: 0, logTvl: 0 },
      brier: 0.25,
      baseBrier: 0.25,
      brierCv: 0.25,
      baseBrierCv: 0.25,
      baseBrierCvScored: 0.25,
      skillCvScored: 0,
      skillCvTrain: 0,
      foldsLostScored: 0,
      folds: 0,
      n,
      medianAgeDays,
    };
  }

  const fit = train(labelled);
  const brier = brierOf(fit, labelled);
  const ys = labelled.map((r) => r.hasToken);
  const baseRate = ys.reduce((s, y) => s + y, 0) / n;
  const baseBrier = ys.reduce((s, y) => s + (baseRate - y) ** 2, 0) / n;

  // Contiguous folds, oldest to newest. A fold is scored by a model that never saw it, and the base
  // rate is re-estimated on the same training rows so the comparison stays honest.
  const folds = n >= 10 ? FOLD_COUNT : 1;
  let sse = brier * n;
  let baseSse = baseBrier * n;
  let baseScoredSse = baseBrier * n;
  let foldsLostScored = 0;
  if (folds > 1) {
    sse = 0;
    baseSse = 0;
    baseScoredSse = 0;
    const ordered = [...labelled].sort(byListing);
    for (let f = 0; f < folds; f += 1) {
      const start = Math.floor((f * n) / folds);
      const end = Math.floor(((f + 1) * n) / folds);
      const test = ordered.slice(start, end);
      const rest = ordered.slice(0, start).concat(ordered.slice(end));
      if (test.length === 0 || rest.length < 2) continue;
      const foldFit = train(rest);
      const foldRate = rest.reduce((s, r) => s + r.hasToken, 0) / rest.length;
      const scoredRate = test.reduce((s, r) => s + r.hasToken, 0) / test.length;
      let foldSse = 0;
      let foldScoredSse = 0;
      for (const row of test) {
        foldSse += (probability(foldFit, row) - row.hasToken) ** 2;
        foldScoredSse += (scoredRate - row.hasToken) ** 2;
        baseSse += (foldRate - row.hasToken) ** 2;
      }
      sse += foldSse;
      baseScoredSse += foldScoredSse;
      if (foldSse > foldScoredSse) foldsLostScored += 1;
    }
  }

  const brierCv = sse / n;
  const baseBrierCv = baseSse / n;
  const baseBrierCvScored = baseScoredSse / n;
  const skillCvScored = baseBrierCvScored === 0 ? 0 : (baseBrierCvScored - brierCv) / baseBrierCvScored;
  const skillCvTrain = baseBrierCv === 0 ? 0 : (baseBrierCv - brierCv) / baseBrierCv;

  return {
    intercept: fit.intercept,
    coef: fit.coef,
    brier,
    baseBrier,
    brierCv,
    baseBrierCv,
    baseBrierCvScored,
    skillCvScored,
    skillCvTrain,
    foldsLostScored,
    folds,
    n,
    medianAgeDays,
  };
}

/** The peer record at one protocol's age and TVL, clamped inside (0, 1). */
export function odds(model: OddsModel, features: OddsFeatures): number {
  const age = features.ageDays === null ? model.medianAgeDays : features.ageDays;
  const logAge = Math.log10(Math.max(1, age));
  const logTvl = Math.log10(Math.max(1, features.tvl));
  const z = model.intercept + model.coef.logAge * logAge + model.coef.logTvl * logTvl;
  return Math.min(MAX_ODDS, Math.max(MIN_ODDS, sigmoid(z)));
}
