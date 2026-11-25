// token-radar v2 entry: the sealed snapshot in, one ranked board and an evidence page out.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
//
// The pipeline is pure: snapshot -> buckets -> value model (with P25/P75) -> peer record (with Brier)
// -> board -> ledger -> dashboard data. No network, no clock, no randomness, so two runs agree byte for
// byte. The dossier is written last and rebuilt by the gate from this same output.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard } from './lib/board.ts';
import type { FarmParams } from './lib/farm.ts';
import { classify } from './lib/buckets.ts';
import { buildLedger } from './lib/ledger.ts';
import { fitOdds } from './lib/odds-model.ts';
import { ageDays, loadSnapshot } from './lib/snapshot.ts';
import { fitValueModel } from './lib/value-model.ts';
import { validateValue } from './lib/validate.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1] as string;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/** The reader can change these; the page shows the arithmetic either way. */
const PARAMS: FarmParams = {
  depositUsd: 2000,
  dropShare: 0.07,
  feeBps: 10,
  horizonWeeks: 12,
  hoursPerWeek: 2,
  participants: 500,
  gasUsdPerWeek: 2,
  farmFloorUsdPerHour: 25,
};

const snapshot = loadSnapshot(inputFile);
const buckets = classify(snapshot);

const labeled = snapshot.protocols
  .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
  .map((p) => ({ tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd as number, category: p.category, listed_at: p.listed_at }));
const valueModel = fitValueModel(labeled);
const validation = validateValue(labeled);
const oddsModel = fitOdds(
  snapshot.protocols
    .filter((p) => p.listed_at !== null && p.tvl_usd > 0)
    .map((p) => ({
      tvl_usd: p.tvl_usd,
      ageDays: ageDays(snapshot.as_of, p.listed_at),
      hasToken: (p.mcap_usd !== null ? 1 : 0) as 0 | 1,
      listedAt: p.listed_at,
    })),
);

const board = buildBoard(snapshot, buckets, valueModel, oddsModel, PARAMS);
if (board.length < 100 || board.length > 4000) {
  process.stderr.write(`token radar: board holds ${board.length} rows, outside 100..4000\n`);
  process.exit(1);
}
const ledger = buildLedger(snapshot, buckets, board);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

const metrics = {
  as_of: snapshot.as_of,
  source: snapshot.source,
  floor_usd: snapshot.floor_usd,
  board_rows: board.length,
  watchlist_size: snapshot.watchlist.length,
  watchlist_covered: snapshot.watchlist.filter((slug) => board.some((r) => r.slug === slug)).length,
  counts: ledger.counts,
  total: ledger.total,
  total_implied_usd: ledger.totalImpliedUsd,
  checksum: ledger.checksum,
  verdicts: {
    FARM: board.filter((r) => r.verdict === 'FARM').length,
    MARGINAL: board.filter((r) => r.verdict === 'MARGINAL').length,
    SKIP: board.filter((r) => r.verdict === 'SKIP').length,
  },
  value_model: {
    slope: round6(valueModel.b),
    intercept: round6(valueModel.a),
    labeled: valueModel.n,
    walk_forward_miss: round4(validation.walkForwardMiss),
    leave_one_out_miss: round4(validation.leaveOneOutMiss),
    baseline_miss: round4(validation.baselineMiss),
    tested: validation.tested,
    tested_walk_forward: validation.walkForwardTested,
    tested_loo: validation.looTested,
    kept: validation.kept,
  },
  odds_model: {
    brier: round4(oddsModel.brier),
    base_brier: round4(oddsModel.baseBrier),
    brier_cv: round4(oddsModel.brierCv),
    base_brier_cv: round4(oddsModel.baseBrierCv),
    base_brier_cv_scored: round4(oddsModel.baseBrierCvScored),
    skill_cv_scored: round4(oddsModel.skillCvScored),
    skill_cv_train: round4(oddsModel.skillCvTrain),
    folds_lost_scored: oddsModel.foldsLostScored,
    folds: oddsModel.folds,
    n: oddsModel.n,
    median_age_days: oddsModel.medianAgeDays,
  },
  params: PARAMS,
};
writeFileSync(join(out, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
writeFileSync(join(out, 'data.js'), `window.RADAR=${JSON.stringify({ metrics, rows: board })};\n`);

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names = readdirSync(from).filter((name) => !name.startsWith('.') && statSync(join(from, name)).isFile());
  // Prune stale output: a file that is no longer in the source must not survive into the dossier.
  for (const name of readdirSync(to)) {
    if (!name.startsWith('.') && !names.includes(name)) unlinkSync(join(to, name));
  }
  for (const name of names) copyFileSync(join(from, name), join(to, name));
  return names;
}

const dash = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image(s), need 3\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: not a plain name\n`);
    process.exit(1);
  }
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

process.stdout.write(
  `token radar v2: ${snapshot.protocols.length} protocols, ${metrics.watchlist_covered}/${metrics.watchlist_size} watchlist, ${board.length} rows, ` +
    `checksum ${ledger.checksum}, miss x${metrics.value_model.walk_forward_miss} vs baseline x${metrics.value_model.baseline_miss}, ` +
    `brier 5-fold ${metrics.odds_model.brier_cv} vs base ${metrics.odds_model.base_brier_cv}, in-sample ${metrics.odds_model.brier} vs ${metrics.odds_model.base_brier}\n` +
    `token radar v2: out/ = board.json, metrics.json, data.js, dashboard (${dash.length} files), screenshots (${shots.length}), dossier.json\n`,
);
