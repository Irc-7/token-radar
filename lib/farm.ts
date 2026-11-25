// A farm verdict that carries its own arithmetic: drop, fee, net and net per hour, from parameters the
// reader can change. Nothing here is a promise of a token.

// Every money line below is computed on one basis, the drop: the protocol's user allocation
// (implied value x dropShare) split across the farmers assumed to chase it (participants), with the
// protocol fee taken out of that same drop and nothing charged on the deposit. The previous version
// multiplied the whole implied value by dropShare and printed it beside a $2,000 deposit, which put
// $763,272 of net next to $2,000 of capital; the participant count is what fixes that, and it is
// printed on the page as an assumption the reader can change.

export interface FarmParams {
  depositUsd: number;
  dropShare: number;
  feeBps: number;
  horizonWeeks: number;
  hoursPerWeek: number;
  /** Farmers assumed to split one protocol's user allocation. An assumption, printed on the page. */
  participants: number;
  /** Gas the weekly qualifying action costs, in dollars per week. */
  gasUsdPerWeek: number;
  /** Net an hour at which the farm is worth an hour of skilled work. */
  farmFloorUsdPerHour: number;
}

export type FarmTier = 'FARM' | 'MARGINAL' | 'SKIP';

export interface FarmVerdict {
  dropUsd: number;
  feeUsd: number;
  netUsd: number;
  netPerHourUsd: number;
  /** Net an hour below which the weekly action does not pay for its own gas. */
  skipFloorUsdPerHour: number;
  verdict: FarmTier;
}

/** Cents, so net = drop - fee holds exactly in the JSON the page and the gate both read. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * One farmer's share of the drop minus the fee on that same drop, divided by the hours the horizon
 * costs, and the tier that follows: FARM at an hour's skilled rate, MARGINAL above the gas the weekly
 * action burns, SKIP below it.
 */
export function farmVerdict(impliedUsd: number, params: FarmParams): FarmVerdict {
  const participants = params.participants > 0 ? params.participants : 1;
  const dropUsd = cents((impliedUsd * params.dropShare) / participants);
  const feeUsd = cents((dropUsd * params.feeBps) / 10_000);
  const netUsd = cents(dropUsd - feeUsd);
  const hours = params.horizonWeeks * params.hoursPerWeek;
  const netPerHourUsd = hours > 0 ? netUsd / hours : 0;
  const skipFloorUsdPerHour = params.hoursPerWeek > 0 ? params.gasUsdPerWeek / params.hoursPerWeek : 0;
  const verdict: FarmTier =
    netPerHourUsd >= params.farmFloorUsdPerHour ? 'FARM' : netPerHourUsd >= skipFloorUsdPerHour ? 'MARGINAL' : 'SKIP';
  return { dropUsd, feeUsd, netUsd, netPerHourUsd, skipFloorUsdPerHour, verdict };
}
