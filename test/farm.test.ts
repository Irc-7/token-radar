import test from 'node:test';
import assert from 'node:assert/strict';
import { farmVerdict } from '../lib/farm.ts';

const p = {
  depositUsd: 2000,
  dropShare: 0.07,
  feeBps: 10,
  horizonWeeks: 12,
  hoursPerWeek: 2,
  participants: 500,
  gasUsdPerWeek: 2,
  farmFloorUsdPerHour: 25,
};

test('one basis: the drop is the allocation split across participants, and the fee is taken from it', () => {
  const v = farmVerdict(1_000_000, p);
  assert.equal(v.dropUsd, 140);
  assert.equal(v.feeUsd, 0.14);
  assert.equal(v.netUsd, 139.86);
  assert.equal(v.netUsd, v.dropUsd - v.feeUsd);
  assert.equal(v.netPerHourUsd, 139.86 / 24);
});

test('the fee and the net never leave the drop basis', () => {
  const v = farmVerdict(10_000_000, p);
  assert.equal(v.dropUsd, 1400);
  assert.equal(v.feeUsd, 1.4);
  assert.equal(v.netUsd, 1398.6);
  assert.ok(v.netUsd < v.dropUsd, 'net stays below the drop it came from');
});

test('verdict tiers are stable at the boundaries', () => {
  assert.equal(farmVerdict(0, p).verdict, 'SKIP');
  assert.equal(farmVerdict(5_000, p).verdict, 'SKIP');
  assert.equal(farmVerdict(1_000_000, p).verdict, 'MARGINAL');
  assert.equal(farmVerdict(10_000_000, p).verdict, 'FARM');
});

test('halving the participants doubles the drop: the assumption is the only lever', () => {
  assert.equal(farmVerdict(1_000_000, { ...p, participants: 250 }).dropUsd, 280);
});
