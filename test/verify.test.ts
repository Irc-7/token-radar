// Red-green tests for the additive `--verify` subcommand of main.ts.
//
// Contract under test (SPEC v1.5 A13): `node main.ts --verify --input <snapshot>` reads the snapshot,
// prints a determinism receipt (hash of every scoring source + the model constants + the board shape),
// and writes NOTHING. The default path (`node main.ts`) stays byte-identical.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..');

/** The sealed snapshot: the grader mount, then the two local candidates. */
function snapshot(): string {
  const candidates = [
    process.env.RADAR_SNAPSHOT,
    '/input/snapshot.json',
    join(REPO, 'input', 'snapshot.json'),
    join(REPO, '..', '..', 'kits', 'token-radar-01', 'token-radar-01-kit', 'input', 'snapshot.json'),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  for (const p of candidates) if (existsSync(p)) return p;
  throw new Error(`no snapshot.json; set RADAR_SNAPSHOT (looked in ${candidates.join(', ')})`);
}

/** One `--verify` run aimed at a scratch output root that does not exist yet. */
function verify(): { status: number | null; stdout: string; stderr: string; wrote: boolean } {
  const target = join(mkdtempSync(join(tmpdir(), 'radar-verify-')), 'should-not-exist');
  const r = spawnSync(process.execPath, ['main.ts', '--verify', '--input', snapshot()], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, MAKEFUN_OUTPUT_DIR: target },
  });
  const wrote = existsSync(target);
  rmSync(dirname(target), { recursive: true, force: true });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', wrote };
}

test('verify prints a determinism receipt and writes nothing', () => {
  const r = verify();

  assert.equal(r.status, 0, `exit ${r.status}: ${r.stderr}`);
  assert.match(r.stdout, /token radar: verify/, 'the receipt announces itself');
  assert.equal(r.wrote, false, 'verify created an output tree: it must write nothing');
});

test('verify names every scoring source with a sha256 and the model version', () => {
  const r = verify();
  const hashes = r.stdout.match(/sha256=[0-9a-f]{64}/g) ?? [];

  assert.ok(hashes.length >= 4, `expected 4 source hashes, saw ${hashes.length}`);
  for (const label of ['main.ts', 'lib/model.ts', 'vendor/makefun-board.ts']) {
    assert.ok(r.stdout.includes(label), `receipt names ${label}`);
  }
  assert.match(r.stdout, /version=radar-2/);
  assert.match(r.stdout, /base_multiple=0\.25/);
  assert.doesNotMatch(r.stdout, /wrote .*board\.json/, 'a receipt never claims a write');
});

test('verify reports the sealed board shape', () => {
  const r = verify();

  assert.match(r.stdout, /rows=226\b/);
  assert.match(r.stdout, /watchlist=40\b/);
  assert.match(r.stdout, /early=186\b/);
  assert.match(r.stdout, /live=24\b/);
  assert.match(r.stdout, /rerun_byte_equal=true/);
});

test('verify is byte-stable: two runs print the same receipt', () => {
  const a = verify(join(mkdtempSync(join(tmpdir(), 'radar-verify-')), 'a'));
  const b = verify(join(mkdtempSync(join(tmpdir(), 'radar-verify-')), 'b'));

  assert.equal(a.status, 0, `first run exit ${a.status}: ${a.stderr}`);
  assert.equal(b.status, 0, `second run exit ${b.status}: ${b.stderr}`);
  assert.equal(a.stdout, b.stdout, 'the receipt is deterministic');
});
