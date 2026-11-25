import test from 'node:test';
import assert from 'node:assert/strict';
import { validateValue } from '../lib/validate.ts';

const rows = Array.from({ length: 60 }, (_, i) => ({
  tvl_usd: 1e8 * (1 + (i % 10)),
  mcap_usd: 3e8 * (1 + (i % 7)),
  category: null,
  listed_at: `202${i % 4}-01-01`,
}));
const r = validateValue(rows);

test('walk-forward and leave-one-out both report a miss above 1', () => {
  assert.ok(r.walkForwardMiss > 1 && Number.isFinite(r.walkForwardMiss));
  assert.ok(r.leaveOneOutMiss > 1 && Number.isFinite(r.leaveOneOutMiss));
});

test('baseline is reported and tested count matches the rows', () => {
  assert.ok(r.baselineMiss > 1);
  assert.equal(r.tested, rows.length);
});
