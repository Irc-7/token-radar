// Snapshot loader: the sealed input's ten fields, refused unless every one is accounted for.
// A protocol that misses a field fails the load by name, never silently defaults.

import { readFileSync } from 'node:fs';

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export const SNAPSHOT_FIELDS = [
  'slug',
  'name',
  'category',
  'chains',
  'tvl_usd',
  'change_7d',
  'mcap_usd',
  'listed_at',
  'gecko_id',
  'symbol',
] as const;

export const DAY_MS = 86_400_000;

/** A whole day count from `listed_at` to `as_of`, clamped at zero; null when either date is absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The snapshot out of a file, refused unless it is the shape the model scores. */
export function loadSnapshot(path: string): Snapshot {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  if (typeof raw.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.as_of)) throw new Error('snapshot: as_of missing');
  if (typeof raw.source !== 'string') throw new Error('snapshot: source missing');
  if (typeof raw.floor_usd !== 'number' || !Number.isSafeInteger(raw.floor_usd) || raw.floor_usd <= 0) {
    throw new Error('snapshot: floor_usd missing');
  }
  if (!Array.isArray(raw.protocols)) throw new Error('snapshot: protocols missing');
  if (!Array.isArray(raw.watchlist) || raw.watchlist.some((s) => typeof s !== 'string')) {
    throw new Error('snapshot: watchlist missing');
  }
  const protocols = raw.protocols.map((value, i): Protocol => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`snapshot: protocol ${i} is not an object`);
    }
    const p = value as Record<string, unknown>;
    for (const field of SNAPSHOT_FIELDS) {
      if (!(field in p)) throw new Error(`snapshot: ${String(p.slug ?? i)} missing ${field}`);
    }
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new Error(`snapshot: protocol ${i} has a bad slug, name or TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: raw.as_of,
    source: raw.source,
    floor_usd: raw.floor_usd,
    protocols,
    watchlist: raw.watchlist as string[],
  };
}
