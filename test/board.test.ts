import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSnapshot } from '../lib/snapshot.ts';
import { classify } from '../lib/buckets.ts';
import { fitValueModel } from '../lib/value-model.ts';
import { fitOdds } from '../lib/odds-model.ts';
import { buildBoard } from '../lib/board.ts';

const s = loadSnapshot('input/snapshot.json');
const b = classify(s);
const labeledValue = s.protocols
  .filter((p) => p.mcap_usd !== null)
  .map((p) => ({ tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd as number, category: p.category, listed_at: p.listed_at }));
const valueModel = fitValueModel(labeledValue);
const oddsModel = fitOdds(
  s.protocols
    .filter((p) => p.listed_at !== null)
    .map((p) => ({
      tvl_usd: p.tvl_usd,
      ageDays: Math.max(1, Math.round((Date.parse(s.as_of) - Date.parse(p.listed_at as string)) / 86_400_000)),
      hasToken: (p.mcap_usd !== null ? 1 : 0) as 0 | 1,
    })),
);
const params = { depositUsd: 2000, dropShare: 0.07, feeBps: 10, horizonWeeks: 12, hoursPerWeek: 2 };
const rows = buildBoard(s, b, valueModel, oddsModel, params);

test('100 to 4000 rows, ranks 1..N once each', () => {
  assert.ok(rows.length >= 100 && rows.length <= 4000);
  assert.deepEqual(rows.map((r) => r.rank), rows.map((_, i) => i + 1));
});

test('values never rise as rank ascends and are not all equal', () => {
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i].implied_value_usd <= rows[i - 1].implied_value_usd);
  assert.ok(new Set(rows.map((r) => r.implied_value_usd)).size > 1);
});

test('every watchlist slug is present and farm steps are in range', () => {
  const got = new Set(rows.map((r) => r.slug));
  for (const slug of s.watchlist) assert.ok(got.has(slug), slug);
  for (const r of rows) {
    assert.ok(r.farm_steps.length >= 3 && r.farm_steps.length <= 12);
    for (const step of r.farm_steps) assert.ok(step.trim().length >= 20 && step.trim().length <= 600, `${step.length}`);
  }
});

test('two builds are byte-identical', () => {
  assert.equal(JSON.stringify(rows), JSON.stringify(buildBoard(s, b, valueModel, oddsModel, params)));
});
