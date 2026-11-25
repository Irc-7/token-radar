import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSnapshot } from '../lib/snapshot.ts';
import { classify } from '../lib/buckets.ts';

const s = loadSnapshot('input/snapshot.json');

test('snapshot holds 758 protocols and 40 watchlist slugs', () => {
  assert.equal(s.protocols.length, 758);
  assert.equal(s.watchlist.length, 40);
});

test('every protocol lands in exactly one bucket', () => {
  const b = classify(s);
  assert.equal(b.size, s.protocols.length);
  for (const slug of s.watchlist) assert.equal(b.get(slug), 'watchlist', slug);
});

test('a protocol with a recorded token is never on the watchlist', () => {
  const b = classify(s);
  for (const p of s.protocols) if (p.mcap_usd !== null) assert.equal(b.get(p.slug), 'traded', p.slug);
});
