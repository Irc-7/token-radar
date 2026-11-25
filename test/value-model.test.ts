import test from 'node:test';
import assert from 'node:assert/strict';
import { fitValueModel, multipleAt, rangeAt } from '../lib/value-model.ts';

const rows = [
  { tvl_usd: 1e8, mcap_usd: 4e8, category: 'Lending', listed_at: '2023-01-01' },
  { tvl_usd: 1e9, mcap_usd: 1e9, category: 'Lending', listed_at: '2022-01-01' },
  { tvl_usd: 5e9, mcap_usd: 2e9, category: 'Dexes', listed_at: '2021-01-01' },
];
const m = fitValueModel(rows);

test('multiple is finite and positive across five orders of magnitude', () => {
  for (const tvl of [5e7, 1e8, 1e9, 1e10, 4e10]) {
    const v = multipleAt(m, tvl, 'Lending');
    assert.ok(Number.isFinite(v) && v > 0, `${tvl} -> ${v}`);
  }
});

test('P25 is below P75 and both bracket the point multiple', () => {
  const point = multipleAt(m, 1e9, 'Lending');
  const lo = rangeAt(m, 1e9, 0.25);
  const hi = rangeAt(m, 1e9, 0.75);
  assert.ok(lo <= point && point <= hi && lo < hi, `${lo} ${point} ${hi}`);
});
