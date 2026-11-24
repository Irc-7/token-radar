// A working token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the model in lib/model.ts, writes the ranked board to /output/board.json, and
// copies this repository's dashboard/ and screenshots/ to /output. Last, it writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html, dashboard/app.css
// and dashboard/app.js read /output/data.js, which this program writes from the same board. A starting
// point, not a winner: it covers the watchlist, states the model and gives every protocol a farm plan.
// Change the model, the page or the plan; keep the gate's shape.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// `--verify` is additive and read-only: it scores the same snapshot and prints a determinism receipt
// (sha256 of this file, lib/model.ts, vendor/makefun-board.ts and the snapshot, plus the model constants,
// the board shape and whether a second build is byte-equal), then exits without creating or writing
// anything. The default path above is unchanged, so board.json, data.js and the screenshots cannot shift.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  MODEL,
  MODEL_VERSION,
  boardIssue,
  buildRadar,
  dataScript,
  parseSnapshot,
} from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);

/** sha256 of one file's bytes, lowercase hex. */
function sha256Of(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** `--verify`: name every source that decides the output, then write nothing. Additive by construction -- the
 * default path below is untouched, so board.json and the screenshots cannot shift. */
function verifyReceipt(): void {
  const sources: Array<[string, string]> = [
    ['entry', fileURLToPath(import.meta.url)],
    ['scoring', join(here, 'lib', 'model.ts')],
    ['dossier', join(here, 'vendor', 'makefun-board.ts')],
  ];
  const lines = [
    'token radar: verify -- determinism receipt (this command writes nothing)',
    `snapshot ${inputFile}`,
    `snapshot sha256=${sha256Of(inputFile)} bytes=${statSync(inputFile).size}`,
  ];
  for (const [label, path] of sources) {
    lines.push(`${label} ${relative(here, path).replace(/\\/g, '/')} sha256=${sha256Of(path)} bytes=${statSync(path).size}`);
  }
  const rerun = buildRadar(snapshot).board;
  lines.push(
    `model version=${MODEL_VERSION} base_multiple=${MODEL.base_multiple} growth_weight=${MODEL.growth_weight}`,
    `model growth_floor=${MODEL.growth_floor} growth_cap=${MODEL.growth_cap} maturity_floor=${MODEL.maturity_floor} maturity_range=${MODEL.maturity_range} maturity_days=${MODEL.maturity_days} unknown_age_days=${MODEL.unknown_age_days}`,
    `model breadth_step=${MODEL.breadth_step} breadth_max_chains=${MODEL.breadth_max_chains} breadth_cap=${(1 + MODEL.breadth_max_chains * MODEL.breadth_step).toFixed(2)} category_discount=${MODEL.category_discount} wrapped_like=${MODEL.wrapped_like.length}`,
    `board rows=${board.length} watchlist=${snapshot.watchlist.length} early=${radar.early_size} live=${radar.live_size}`,
    `board rerun_byte_equal=${JSON.stringify(rerun) === JSON.stringify(board)}`,
  );
  process.stdout.write(`${lines.join('\n')}\nreceipt sha256=${createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex')}\n`);
}

if (process.argv.includes('--verify')) {
  verifyReceipt();
  process.exit(0);
}

if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
