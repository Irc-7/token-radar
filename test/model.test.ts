// Unit and integration tests for the token-radar model, run with `node --test test/`.
// RED-GREEN: these describe SPEC.md §4–§6 (model v2). Run them against the untouched starter to
// watch them fail, then implement lib/model.ts until they pass.
//
// The snapshot is the sealed competition input. Locate it through RADAR_SNAPSHOT, then /input, then
// a sibling kit directory, so the same suite runs on this host, on the Mac workspace and in a repo
// that carries its own input/.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../lib/model.ts';

/** The repository root: the parent of test/. */
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

/** A synthetic protocol with every field the model reads. */
function proto(over: Partial<M.SnapshotProtocol> & { slug: string; name: string }): M.SnapshotProtocol {
  return {
    category: null,
    chains: ['Ethereum'],
    tvl_usd: 1_000_000,
    change_7d: null,
    mcap_usd: null,
    listed_at: '2025-01-01',
    gecko_id: null,
    symbol: null,
    ...over,
  };
}

/** A synthetic snapshot. */
function snap(protocols: M.SnapshotProtocol[], watchlist: string[] = [], floor = 1_000_000): M.Snapshot {
  return { as_of: '2026-11-14', source: 'synthetic', floor_usd: floor, protocols, watchlist };
}

/** Call an export that must exist, failing with a clear message instead of a TypeError. */
function api<K extends keyof typeof M>(name: K): (typeof M)[K] {
  const fn = M[name];
  assert.notEqual(fn, undefined, `lib/model.ts must export ${String(name)}`);
  return fn;
}

// --------------------------------------------------------------------- constants

test('MODEL carries the v2 constants with their locked values', () => {
  assert.equal(M.MODEL.base_multiple, 0.25);
  assert.equal(M.MODEL.growth_weight, 0.5);
  assert.equal(M.MODEL.growth_floor, -60);
  assert.equal(M.MODEL.growth_cap, 120);
  assert.equal(M.MODEL.maturity_floor, 0.6);
  assert.equal(M.MODEL.maturity_range, 0.4);
  assert.equal(M.MODEL.maturity_days, 1095);
  assert.equal(M.MODEL.unknown_age_days, 365);
  assert.equal(M.MODEL.breadth_step, 0.03, 'chain breadth step');
  assert.equal(M.MODEL.breadth_max_chains, 4, 'breadth caps at +12%');
  assert.equal(M.MODEL.category_discount, 0.85, 'wrapped-like discount');
  assert.ok(Array.isArray(M.MODEL.wrapped_like), 'wrapped_like is a list of categories');
  for (const c of ['Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaking', 'Restaked BTC', 'Staking Pool', 'CEX', 'Stablecoin Wrapper', 'Dual-Token Stablecoin', 'Anchor BTC', 'Decentralized BTC']) {
    assert.ok(M.MODEL.wrapped_like.includes(c), `wrapped_like must name ${c}`);
  }
});

// --------------------------------------------------------------------- breadth

test('breadth multiplier is 1.00 for zero or one chain, then grows by 0.03 per extra chain', () => {
  const f = api('breadthMultiplier');
  assert.equal(f([], M.MODEL), 1);
  assert.equal(f(['Ethereum'], M.MODEL), 1);
  assert.equal(f(['Ethereum', 'Solana'], M.MODEL), 1.03);
  assert.equal(f(['Ethereum', 'Solana', 'Base'], M.MODEL), 1.06);
  assert.equal(f(['Ethereum', 'Solana', 'Base', 'Arbitrum'], M.MODEL), 1.09);
  assert.equal(f(['Ethereum', 'Solana', 'Base', 'Arbitrum', 'Optimism'], M.MODEL), 1.12);
});

test('breadth multiplier never exceeds the +12% cap no matter how many chains', () => {
  const f = api('breadthMultiplier');
  const many = Array.from({ length: 176 }, (_, i) => `Chain${i}`);
  assert.equal(f(many, M.MODEL), 1.12);
});

// --------------------------------------------------------------------- category

test('the wrapped/staked/bridged families are discounted, everything else pays full', () => {
  const f = api('categoryMultiplier');
  for (const c of ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'Staking Pool', 'CEX']) {
    assert.equal(f(c, M.MODEL), 0.85, `${c} is wrapped-like`);
  }
  for (const c of ['Dexs', 'Lending', 'Yield', 'Prediction Market', null]) {
    assert.equal(f(c, M.MODEL), 1, `${c ?? 'null'} pays full`);
  }
});

// --------------------------------------------------------------------- scoring

test('seven-day growth is clamped to the floor and the cap, and null counts as zero', () => {
  const f = api('impliedValue');
  const base = { as_of: '2026-11-14' };
  const r = (change: number | null) => f(proto({ slug: 'a', name: 'A', change_7d: change }), base.as_of, M.MODEL);
  assert.equal(r(null).growthPct, 0);
  assert.equal(r(-72.7093).growthPct, -60);
  assert.equal(r(-400).growthPct, -60);
  assert.equal(r(4448.4747).growthPct, 120);
  assert.equal(r(12.5).growthPct, 12.5);
});

test('an unknown age scores as 365 days, not as a brand-new protocol', () => {
  const f = api('impliedValue');
  const unknown = f(proto({ slug: 'a', name: 'A', listed_at: null }), '2026-11-14', M.MODEL);
  const young = f(proto({ slug: 'a', name: 'A', listed_at: '2026-10-01' }), '2026-11-14', M.MODEL);
  assert.equal(unknown.age, null);
  assert.equal(young.age, 44);
  const expected = M.MODEL.maturity_floor + (365 / M.MODEL.maturity_days) * M.MODEL.maturity_range;
  assert.ok(Math.abs(unknown.maturityMult - expected) < 1e-12);
  assert.ok(unknown.maturityMult > young.maturityMult, 'an unlisted age must not look younger than a real one');
});

test('implied value is the stated product, clamped up to one dollar', () => {
  const f = api('impliedValue');
  const ageOf = api('ageDays');
  const p = proto({
    slug: 'a', name: 'A', tvl_usd: 4_000_000, change_7d: 20, chains: ['Ethereum', 'Base'],
    listed_at: '2023-11-15', category: 'Bridge',
  });
  const r = f(p, '2026-11-14', M.MODEL);
  const growthMult = 1 + (20 / 100) * M.MODEL.growth_weight;
  const breadthMult = 1.03;
  const age = ageOf('2026-11-14', p.listed_at);
  const maturity = M.MODEL.maturity_floor + (Math.min(Math.max(age ?? M.MODEL.unknown_age_days, 0), M.MODEL.maturity_days) / M.MODEL.maturity_days) * M.MODEL.maturity_range;
  assert.equal(age, 1095, 'this fixture sits on the maturity ceiling');
  assert.equal(r.implied, Math.round(p.tvl_usd * M.MODEL.base_multiple * growthMult * breadthMult * maturity * 0.85));
  const dust = f(proto({ slug: 'b', name: 'B', tvl_usd: 0 }), '2026-11-14', M.MODEL);
  assert.equal(dust.implied, 1, 'implied value never falls below $1');
});

// --------------------------------------------------------------------- selection

test('a protocol sitting exactly on the floor is not an early row; one dollar under it is', () => {
  const on = proto({ slug: 'on-floor', name: 'On Floor' });
  const under = proto({ slug: 'under', name: 'Under', tvl_usd: 999_999 });
  const board = api('buildBoard')(snap([on, under]), M.MODEL);
  assert.deepEqual(board.map((r) => r.slug), ['under']);
});

test('the early radar is not capped: every rankable pre-token protocol below the floor is taken', () => {
  const many = Array.from({ length: 170 }, (_, i) =>
    proto({ slug: `p${String(i).padStart(3, '0')}`, name: `Protocol ${i}`, tvl_usd: 900_000 - i * 1_000 }));
  const board = api('buildBoard')(snap(many), M.MODEL);
  assert.equal(board.length, 170, 'the starter drops these at 160; v2 keeps all of them');
});

// --------------------------------------------------------------------- the sealed snapshot

test('the sealed snapshot yields a 226-row board: 40 watchlist plus 186 early rows', () => {
  const { board, radar } = api('buildRadar')(SNAPSHOT);
  assert.equal(board.length, 226);
  assert.equal(radar.board_size, 226);
  assert.equal(radar.early_size, 186);
  assert.equal(radar.watchlist_size, 40);
  const covered = new Set(board.map((r) => r.slug));
  for (const slug of SNAPSHOT.watchlist) assert.ok(covered.has(slug), `watchlist slug ${slug} is on the board`);
});

test('every row is a pre-token protocol that the snapshot lists; live tokens stay out of the ranking', () => {
  const { board } = api('buildRadar')(SNAPSHOT);
  const slugs = new Set(SNAPSHOT.protocols.map((p) => p.slug));
  for (const row of board) {
    assert.ok(slugs.has(row.slug), `${row.slug} is a snapshot protocol`);
    assert.equal(row.token_status, 'pre-token');
    const source = SNAPSHOT.protocols.find((p) => p.slug === row.slug)!;
    assert.ok(M.isPreToken(source), `${row.slug} records no token`);
  }
  const live = api('liveRows')(SNAPSHOT);
  const ranked = new Set(board.map((r) => r.slug));
  for (const row of live) assert.ok(!ranked.has(row.slug), `${row.slug} trades and must not be ranked`);
});

test('ranks are dense 1..N, implied value never rises with rank, and the board is not flat', () => {
  const { board } = api('buildRadar')(SNAPSHOT);
  board.forEach((row, i) => assert.equal(row.rank, i + 1, `rank ${i + 1}`));
  for (let i = 1; i < board.length; i++) {
    assert.ok(board[i]!.implied_value_usd <= board[i - 1]!.implied_value_usd, `row ${i + 1} outranks row ${i}`);
  }
  assert.ok(new Set(board.map((r) => r.implied_value_usd)).size > 1);
  const max = Math.max(...board.map((r) => r.implied_value_usd));
  assert.ok(max <= 1e13, `max implied ${max} is within the gate cap`);
});

test('implied value recomputes from the row and MODEL alone, for 100% of rows', () => {
  const breadthMultiplier = api('breadthMultiplier');
  const categoryMultiplier = api('categoryMultiplier');
  const { board } = api('buildRadar')(SNAPSHOT);
  let checked = 0;
  for (const row of board) {
    const growth = Math.min(M.MODEL.growth_cap, Math.max(M.MODEL.growth_floor, row.change_7d ?? 0));
    const growthMult = 1 + (growth / 100) * M.MODEL.growth_weight;
    const ageForModel = row.age_days ?? M.MODEL.unknown_age_days;
    const maturity = M.MODEL.maturity_floor + (Math.min(Math.max(ageForModel, 0), M.MODEL.maturity_days) / M.MODEL.maturity_days) * M.MODEL.maturity_range;
    const expected = Math.max(1, Math.round(row.tvl_usd * M.MODEL.base_multiple * growthMult * breadthMultiplier(row.chains, M.MODEL) * maturity * categoryMultiplier(row.category, M.MODEL)));
    assert.equal(row.implied_value_usd, expected, `${row.slug}: board says ${row.implied_value_usd}, model says ${expected}`);
    checked++;
  }
  assert.equal(checked, board.length);
});

test('two builds of the same snapshot are byte-identical', () => {
  const a = JSON.stringify(api('buildRadar')(SNAPSHOT));
  const b = JSON.stringify(api('buildRadar')(SNAPSHOT));
  assert.equal(a, b);
  const c = JSON.stringify(api('dataScript')(api('buildRadar')(SNAPSHOT).radar));
  const d = JSON.stringify(api('dataScript')(api('buildRadar')(SNAPSHOT).radar));
  assert.equal(c, d);
});

// --------------------------------------------------------------------- farm plans

test('farm steps are 3 to 12 strings, each 20 to 600 characters trimmed', () => {
  const { board } = api('buildRadar')(SNAPSHOT);
  for (const row of board) {
    assert.ok(row.farm_steps.length >= 3 && row.farm_steps.length <= 12, `${row.slug} has ${row.farm_steps.length} steps`);
    for (const s of row.farm_steps) {
      assert.ok(s.trim().length >= 20 && s.trim().length <= 600, `${row.slug} has a step of ${s.trim().length} characters`);
    }
    assert.ok(row.farm_steps.some((s) => s.includes('$')), `${row.slug} names a dollar figure`);
    assert.ok(row.farm_steps.some((s) => /\b(day|days|minute|minutes)\b/.test(s)), `${row.slug} names a duration`);
  }
});

// --------------------------------------------------------------------- no special-casing

test('no protocol slug or name from the snapshot appears as a literal in the scoring sources', () => {
  // A hardcoded identifier is a quoted literal, e.g. `if (p.slug === 'aerodrome')`. Bare words happen
  // to collide with short slugs ("cap", "re"), so scan for quoted literals, not substrings.
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
