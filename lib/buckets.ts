// Every protocol lands in exactly one bucket, and a watchlist slug that resolves elsewhere is a
// reconciliation failure: the ledger fails closed rather than papering over the conflict.

import type { Snapshot } from './snapshot.ts';

export type Bucket = 'watchlist' | 'traded' | 'excluded' | 'pre_token';

/** The six categories the house itself kept off its watchlist (kit RULES.txt, watchlist rule). */
export const EXCLUDED_CATEGORIES: readonly string[] = [
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
];

/** A name ending in a release marker is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking in any case. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A protocol that begins with an exchange's own name is the exchange's product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;

/** Whether the protocol records a token at all: any of mcap, CoinGecko id or symbol present. */
export function recordsToken(p: { mcap_usd: number | null; gecko_id: string | null; symbol: string | null }): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

/** Whether the protocol is a wrapped, staked, bridged, versioned or exchange product. */
export function isExcluded(p: { name: string; category: string | null }): boolean {
  const category = p.category ?? '';
  return (
    EXCLUDED_CATEGORIES.includes(category) ||
    VERSIONED.test(p.name) ||
    WRAPPED_WORD.test(p.name) ||
    EXCHANGE_PREFIX.test(p.name)
  );
}

/** The bucket of every protocol, applied in the plan's precedence order. */
export function classify(s: Snapshot): Map<string, Bucket> {
  const listed = new Set(s.watchlist);
  const out = new Map<string, Bucket>();
  for (const p of s.protocols) {
    const traded = recordsToken(p);
    const excluded = !traded && isExcluded(p);
    const bucket: Bucket = traded ? 'traded' : excluded ? 'excluded' : listed.has(p.slug) ? 'watchlist' : 'pre_token';
    if (listed.has(p.slug) && bucket !== 'watchlist') {
      throw new Error(`ledger: watchlist conflict ${p.slug}`);
    }
    out.set(p.slug, bucket);
  }
  return out;
}
