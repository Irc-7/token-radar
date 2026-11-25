import test from 'node:test';
import assert from 'node:assert/strict';
import { fitOdds, odds } from '../lib/odds-model.ts';

const rows = [
  { tvl_usd: 1e8, ageDays: 400, hasToken: 1 as const },
  { tvl_usd: 1e8, ageDays: 30, hasToken: 0 as const },
  { tvl_usd: 1e9, ageDays: 800, hasToken: 1 as const },
  { tvl_usd: 5e7, ageDays: 60, hasToken: 0 as const },
  { tvl_usd: 2e8, ageDays: 900, hasToken: 1 as const },
  { tvl_usd: 3e8, ageDays: 120, hasToken: 0 as const },
];
const m = fitOdds(rows);

test('odds stay inside (0,1) including for an unknown age', () => {
  for (const f of [{ ageDays: 1, tvl: 5e7 }, { ageDays: null, tvl: 4e10 }]) {
    const v = odds(m, f);
    assert.ok(v > 0 && v < 1, String(v));
  }
});

test('a null age uses the labelled median, never zero days', () => {
  assert.equal(odds(m, { ageDays: null, tvl: 1e8 }), odds(m, { ageDays: m.medianAgeDays, tvl: 1e8 }));
});

// Forty dated rows spread over 2021: the folds are contiguous in listing order, so a reversed input
// must produce the identical held-out score. If it does not, the folds follow array position instead.
const dated = Array.from({ length: 40 }, (_, i) => ({
  tvl_usd: 10 ** (6 + ((i * 7) % 10) / 2),
  ageDays: 30 + i * 10,
  hasToken: ((i * 37) % 11 < 5 ? 1 : 0) as 0 | 1,
  listedAt: `2021-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
}));

test('five contiguous folds, and the held-out score does not depend on input order', () => {
  const a = fitOdds(dated);
  const b = fitOdds([...dated].reverse());
  assert.equal(a.folds, 5);
  assert.ok(a.brierCv > 0 && a.brierCv < 1, String(a.brierCv));
  assert.ok(a.baseBrierCv > 0 && a.baseBrierCv < 1, String(a.baseBrierCv));
  assert.equal(a.brierCv, b.brierCv);
  assert.equal(a.baseBrierCv, b.baseBrierCv);
});

test('the held-out brier is reported separately from the in-sample brier', () => {
  const a = fitOdds(dated);
  assert.notEqual(a.brierCv, a.brier);
});

test('the scored-rows base rate is a separate reference, and skill uses it', () => {
  const a = fitOdds(dated);
  assert.ok(a.baseBrierCvScored > 0 && a.baseBrierCvScored < 1, String(a.baseBrierCvScored));
  assert.ok(Math.abs(a.skillCvScored - (a.baseBrierCvScored - a.brierCv) / a.baseBrierCvScored) < 1e-12);
  assert.ok(Math.abs(a.skillCvTrain - (a.baseBrierCv - a.brierCv) / a.baseBrierCv) < 1e-12);
  assert.ok(Number.isInteger(a.foldsLostScored) && a.foldsLostScored >= 0 && a.foldsLostScored <= a.folds);
});
