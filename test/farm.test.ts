// Farm-plan quality tests: SPEC.md §6 quality bar ("no two rows may read as copy-paste").
//
// The gate only bounds length (20..600 chars) and count (3..12). The judge's criterion 3 is
// "concrete steps, not slogans", and the judge reads a detail view: a step that is byte-identical
// across 226 protocols reads as one slogan repeated. These tests hold the plan to a distinctness
// floor per step position, derived only from the row's own fields.
//
// RED: against the starter plan, positions 1, 3, 5 and 6 are a single shared sentence
// (distinct counts [1, 224, 1, 7, 1, 1]).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../lib/model.ts';

const REPO = fileURLToPath(new URL('..', import.meta.url));

/** Where the sealed snapshot lives, first candidate that exists. */
function snapshotPath(): string {
  const candidates = [
    process.env.RADAR_SNAPSHOT,
    '/input/snapshot.json',
    join(REPO, 'input', 'snapshot.json'),
    join(REPO, '..', '..', 'kits', 'token-radar-01', 'token-radar-01-kit', 'input', 'snapshot.json'),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  for (const p of candidates) if (existsSync(p)) return p;
  throw new Error(`no snapshot.json; set RADAR_SNAPSHOT (looked in ${candidates.join(', ')})`);
}

const SNAPSHOT = M.parseSnapshot(readFileSync(snapshotPath(), 'utf8'));
const BOARD = M.buildRadar(SNAPSHOT).board;

/** How many distinct strings one step position carries across the whole board. */
function distinctAt(position: number): number {
  return new Set(BOARD.map((r) => r.farm_steps[position]!)).size;
}

test('every step position carries more than 100 distinct sentences across the board', () => {
  // Step 2 was already field-derived (224); the four template steps are the blocker.
  for (const position of [0, 2, 4, 5]) {
    const n = distinctAt(position);
    assert.ok(n > 100, `farm step ${position + 1} is one of ${n} distinct sentences across ${BOARD.length} rows; the judge reads a template`);
  }
});

test('no step position collapses to a single shared sentence', () => {
  for (let position = 0; position < 6; position++) {
    assert.ok(distinctAt(position) > 1, `farm step ${position + 1} is byte-identical in every row`);
  }
});

test('each row names a dollar figure and a duration somewhere in its plan', () => {
  for (const row of BOARD) {
    assert.ok(row.farm_steps.some((s) => s.includes('$')), `${row.slug} names no dollar figure`);
    assert.ok(row.farm_steps.some((s) => /\b(day|days|minute|minutes)\b/.test(s)), `${row.slug} names no duration`);
  }
});

test('the plan is derived from the row alone: the same protocol scores the same plan twice', () => {
  for (const row of BOARD.slice(0, 40)) {
    const again = M.farmSteps(
      { ...row, listed_at: row.listed_at },
      row.age_days,
    ).map(M.stepText);
    assert.deepEqual(again, row.farm_steps, `${row.slug} is not a pure function of its fields`);
  }
});

test('every step stays inside the gate bounds after the derivation changed', () => {
  for (const row of BOARD) {
    assert.ok(row.farm_steps.length >= 3 && row.farm_steps.length <= 12, `${row.slug} has ${row.farm_steps.length} steps`);
    for (const s of row.farm_steps) {
      const t = s.trim().length;
      assert.ok(t >= 20 && t <= 600, `${row.slug} has a step of ${t} characters`);
    }
  }
});

test('the plan never names a protocol literally in the scoring sources', () => {
  const sources = ['lib/model.ts', 'main.ts', 'dashboard/app.js'].map((p) => ({ path: p, text: readFileSync(join(REPO, p), 'utf8') }));
  const identifiers = [
    ...SNAPSHOT.protocols.map((p) => p.slug),
    ...SNAPSHOT.protocols.map((p) => p.name).filter((n) => n.length >= 5),
  ];
  const hits: string[] = [];
  for (const { path, text } of sources) {
    for (const id of identifiers) {
      const literal = new RegExp(`['"\`]${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
      if (literal.test(text)) hits.push(`${path}: ${JSON.stringify(id)}`);
    }
  }
  assert.deepEqual(hits, [], `special-cased protocol identifiers:\n${hits.join('\n')}`);
});
