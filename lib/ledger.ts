// The reconciliation ledger: every protocol counted exactly once, the board's total value, and a
// checksum that ties the page's numbers to the rows they came from.

import { createHash } from 'node:crypto';
import type { Bucket } from './buckets.ts';
import type { Snapshot } from './snapshot.ts';

export interface LedgerRow {
  slug: string;
  rank: number;
  implied_value_usd: number;
}

export interface Ledger {
  counts: Record<Bucket, number>;
  total: number;
  totalImpliedUsd: number;
  checksum: string;
}

/** Counts, total, summed implied value and the first 8 hex of the canonical row hash. */
export function buildLedger(snapshot: Snapshot, buckets: Map<string, Bucket>, rows: LedgerRow[]): Ledger {
  const counts: Record<Bucket, number> = { watchlist: 0, traded: 0, excluded: 0, pre_token: 0 };
  for (const bucket of buckets.values()) counts[bucket] += 1;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const sorted = [...rows].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const canonical = sorted.map((r) => `${r.slug}:${r.rank}:${r.implied_value_usd}`).join('\n');
  const checksum = createHash('sha256').update(canonical).digest('hex').slice(0, 8);
  const totalImpliedUsd = rows.reduce((sum, r) => sum + r.implied_value_usd, 0);
  return { counts, total, totalImpliedUsd, checksum };
}
