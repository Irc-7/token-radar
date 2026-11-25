import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSnapshot } from '../lib/snapshot.ts';
import { classify } from '../lib/buckets.ts';
import { buildLedger } from '../lib/ledger.ts';

const s = loadSnapshot('input/snapshot.json');
const b = classify(s);

test('counts sum to the protocol total', () => {
  const l = buildLedger(s, b, []);
  const sum = Object.values(l.counts).reduce((a, n) => a + n, 0);
  assert.equal(sum, s.protocols.length);
  assert.equal(l.total, 758);
});

test('checksum is stable across two builds', () => {
  assert.equal(buildLedger(s, b, []).checksum, buildLedger(s, b, []).checksum);
});
