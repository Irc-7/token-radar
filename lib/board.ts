// The board: watchlist rows plus every pre-token protocol, ranked by implied value, with the range,
// the peer record and the costed farm verdict each row carries.

import type { Bucket } from './buckets.ts';
import { farmVerdict } from './farm.ts';
import type { FarmParams } from './farm.ts';
import { odds as oddsOf } from './odds-model.ts';
import type { OddsModel } from './odds-model.ts';
import { ageDays } from './snapshot.ts';
import type { Protocol, Snapshot } from './snapshot.ts';
import { multipleAt, rangeAt } from './value-model.ts';
import type { ValueModel } from './value-model.ts';

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  p25_usd: number;
  p75_usd: number;
  odds: number;
  drop_usd: number;
  fee_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  verdict: string;
  farm_steps: string[];
}

const MAX_IMPLIED = 100_000_000_000_000;

/** Whole dollars with explicit thousands separators: no locale, so two runs agree byte for byte. */
function usd(value: number): string {
  const digits = String(Math.round(value));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    const remaining = digits.length - i;
    out += digits[i];
    if (remaining > 1 && (remaining - 1) % 3 === 0) out += ',';
  }
  return `$${out}`;
}

/** Cents, for a net an hour that now spans $0.04 to $60 and would read as "$0" in whole dollars. */
function usdCents(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const whole = String(Math.floor(Math.abs(rounded)));
  const cents = String(Math.round((Math.abs(rounded) - Number(whole)) * 100)).padStart(2, '0');
  return `${rounded < 0 ? '-' : ''}$${usd(Number(whole)).slice(1)}.${cents}`;
}

/** Five steps derived from the protocol's own fields: category, chains, TVL tier, age and verdict. */
function farmSteps(p: Protocol, age: number | null, verdict: string, netPerHourUsd: number, params: FarmParams): string[] {
  const chain = p.chains.length > 0 ? (p.chains[0] as string) : 'its main chain';
  const capital = params.depositUsd;
  const hold = age === null ? 30 : age < 180 ? 60 : age < 365 ? 45 : 30;
  const category = p.category ?? 'its category';
  return [
    `Use a fresh wallet that holds only the farming funds, then open ${p.name} on ${chain}. Cost: under $3 of gas for the first transaction. Time: 5 minutes.`,
    `Deposit ${usd(capital)} of USDC into ${p.name} as a ${category} position and keep the receipt in the same wallet. Cost: ${usd(capital)} of capital and about ${usd(capital >= 150 ? 8 : 4)} of gas. Time: 15 minutes.`,
    `Make one qualifying action each week (deposit, borrow, swap or vote) for ${params.horizonWeeks} weeks. Cost: about $2 of gas a week. Time: ${params.hoursPerWeek} hours a week.`,
    `Hold the position at least ${hold} days so more than one snapshot counts it: the model reads this row at ${verdict} and ${usdCents(netPerHourUsd)} net an hour. Cost: the ${usd(capital)} stays in the position. Time: ${hold} days.`,
    `Write the wallet, the dates and every transaction in a farm log, and claim only from the rewards page ${p.name} publishes. Cost: no fee to check. Time: 10 minutes.`,
  ];
}

/** Every watchlist and pre-token protocol, strongest implied value first, ranks 1..N. */
export function buildBoard(
  snapshot: Snapshot,
  buckets: Map<string, Bucket>,
  valueModel: ValueModel,
  oddsModel: OddsModel,
  params: FarmParams,
): BoardRow[] {
  const chosen = snapshot.protocols.filter((p) => {
    const bucket = buckets.get(p.slug);
    return bucket === 'watchlist' || bucket === 'pre_token';
  });

  const scored = chosen.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const multiple = multipleAt(valueModel, p.tvl_usd, p.category);
    const peer = oddsOf(oddsModel, { ageDays: age, tvl: p.tvl_usd });
    const implied = Math.max(1, Math.min(MAX_IMPLIED, Math.round(p.tvl_usd * multiple * peer)));
    const low = Math.max(1, Math.round(p.tvl_usd * rangeAt(valueModel, p.tvl_usd, 0.25) * peer));
    const high = Math.max(low, Math.round(p.tvl_usd * rangeAt(valueModel, p.tvl_usd, 0.75) * peer));
    const verdict = farmVerdict(implied, params);
    return { p, age, peer, implied, low, high, verdict };
  });

  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  return scored.map((row, i) => ({
    rank: i + 1,
    slug: row.p.slug,
    name: row.p.name,
    category: row.p.category,
    chains: row.p.chains,
    tvl_usd: row.p.tvl_usd,
    change_7d: row.p.change_7d,
    mcap_usd: row.p.mcap_usd,
    listed_at: row.p.listed_at,
    age_days: row.age,
    implied_value_usd: row.implied,
    p25_usd: row.low,
    p75_usd: row.high,
    odds: Math.round(row.peer * 1e4) / 1e4,
    drop_usd: row.verdict.dropUsd,
    fee_usd: row.verdict.feeUsd,
    net_usd: row.verdict.netUsd,
    net_per_hour_usd: Math.round(row.verdict.netPerHourUsd * 100) / 100,
    verdict: row.verdict.verdict,
    farm_steps: farmSteps(row.p, row.age, row.verdict.verdict, row.verdict.netPerHourUsd, params),
  }));
}
