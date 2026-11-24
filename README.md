# token-radar-01 — ranked pre-token protocol board

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Irc-7/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Irc-7/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Submitted to [make.fun's “Build the best token launch radar” bounty](https://make.fun/bounty/token-radar-01).

A deterministic make.fun competition entry. It reads a sealed DeFiLlama-derived snapshot of 758
protocols, scores every pre-token protocol with one transparent multiplicative model, and writes a
ranked board (`board.json`), the page's data (`data.js`), a static offline dashboard, three real
screenshots, and a self-describing `dossier.json`. No network, no randomness, no clock: the same input
always yields byte-identical output.

## Reproduce it

```bash
# grader-equivalent run: writes /output (or $MAKEFUN_OUTPUT_DIR)
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

# read-only determinism receipt: prints hashes, writes nothing
node main.ts --verify --input ../input/snapshot.json

# unit + integration suite
node --test test/*.test.ts

# full gate harness (10 checks: determinism, gates 1-7, parity, caps, literals, timing)
node ../check.mjs
```

Requires Node 22 or newer (this host: v26.7.0). Standard library only — no `npm install`, no build step.

## The snapshot

Sealed input at `input/snapshot.json`: 247,940 bytes, sha256
`42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`.

| Field | Value |
|---|---|
| `as_of` | 2026-11-14 |
| `floor_usd` | 50,000,000 |
| `protocols` | 758 |
| `watchlist` | 40 slugs |

Every score derives from five snapshot fields only: `tvl_usd`, `change_7d`, `listed_at`, `chains`,
`category`. No protocol name or slug is ever read in the scoring path — a grep assertion over
`lib/model.ts` proves it, so the model cannot be tuned per protocol.

## The model (locked `radar-2`)

```
age         = listed_at ? max(0, floor((as_of - listed_at) / 86_400_000)) : null
growthPct   = clamp(change_7d ?? 0, -60, 120)
growthMult  = 1 + growthPct / 100 * 0.5
breadthMult = 1 + min(max(chains.length - 1, 0), 4) * 0.03
maturity    = 0.6 + min(age ?? 365, 1095) / 1095 * 0.4
catMult     = wrapped_like(category) ? 0.85 : 1
base        = tvl_usd * 0.25
implied     = max(1, round(base * growthMult * breadthMult * maturity * catMult))
```

| Constant | Value | Why it exists |
|---|---|---|
| `BASE_MULTIPLE` | 0.25 | kept from the starter, stated and traceable |
| `GROWTH_FLOOR` / `GROWTH_CAP` | -60 / 120 | truncates the -72.7 % and +4,448 % outliers |
| `GROWTH_WEIGHT` | 0.5 | growth can move implied value at most ±60 % |
| `BREADTH_STEP` / `BREADTH_MAX_CHAINS` | 0.03 / 4 | chain reach is a distribution signal; capped at +12 % |
| `MATURITY_FLOOR` / `MATURITY_RANGE` | 0.6 / 0.4 | brand-new scores 0.60, three years scores 1.00 |
| `UNKNOWN_AGE_DAYS` | 365 | the 9 protocols with a null `listed_at` |
| `CATEGORY_DISCOUNT` | 0.85 | wrapped/staked/bridged families — products of a token that already trades |
| `LIVE_ROWS` | 24 | live-token view only; never part of the ranked board |

The `wrapped_like` list mirrors the house's own watchlist exclusion: Bridge, Canonical Bridge,
Cross Chain Bridge, Liquid Staking, Liquid Restaking, Restaking, Restaked BTC, Staking Pool, CEX,
Stablecoin Wrapper, Dual-Token Stablecoin, Anchor BTC, Decentralized BTC.

## Selection: 40 + 186 = 226 rows

```
board = watchlist (40, mandatory, floor applied)
      ∪ { p : isPreToken(p) && category !== 'CEX' && !VERSIONED.test(name) && tvl_usd < floor }
```

`isPreToken` means `mcap_usd`, `gecko_id` and `symbol` are all null — no token trades yet. A name ending
in a version marker (`V2`, `v1.3`, `2.0`) is a pool of another protocol and stays out. Above-floor
non-watchlist protocols stay out: the house removed them for a reason. Every comparator ends in a
`slug` tie-break, so ranks are dense 1..226 and the ordering is total.

## Farm plans

Six derived steps per row, each `"text Cost: $X. Time: Y."`. They are generated from
`{category, chains[0], chains.length, tvl_tier, age_days}` — never hand-written per protocol — so 226
rows cannot drift into copy-paste. Measured distinctness per position: `[105, 224, 121, 7, 133, 121]`.
Position 4 is a genuine function of age, so its seven values are intended.

## Output tree

| Path | Bytes | Note |
|---|---|---|
| `board.json` | 357,659 | `{rows:[…]}` sorted by `rank`, 226 rows |
| `data.js` | 83,804 | `window.RADAR`, same object that produced the board |
| `dashboard/` | 33,590 | `index.html` 448 + `app.css` 8,366 + `app.js` 24,776 |
| `screenshots/` | 148,789 / 215,250 / 153,340 | board, detail and filtered views, 1440×900 PNG |
| `dossier.json` | 724,813 | built last by the vendored `buildDossier`; rebuilds byte-equal |

## Dashboard

Three static files, no framework, no CDN, no `fetch`, no font, zero `http(s)://`. It opens from
`file://` and renders fully offline. Surfaces: a sortable board, a category filter plus free-text
search, a per-protocol detail view that restates the model inputs and recomputes
`implied_value_usd` with the same arithmetic as the scorer (parity holds on 226/226 rows), and a
live-token view kept separate from the ranking.

## Determinism

No `Date.now`, no randomness, no input-order-dependent iteration. Floats go through `round4`
(multipliers) or `Math.round` (dollars); every sort ends in `slug`. Two runs of the default path
produce byte-identical `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json`
(checked across all nine paths). Adding `--verify` did not change any of those bytes.

## Layout

```
main.ts               entrypoint: parse, score, gate, write
lib/model.ts          snapshot types, MODEL constants, scorer, farm steps, page data
vendor/makefun-board.ts  vendored dossier builder
dashboard/            static page
screenshots/          three real PNGs
test/                node:test suites: model, farm, verify
```

## Verification record

- `node --test test/*.test.ts` — 26 tests, 0 failures (model 16, farm 6, verify 4).
- `node ../check.mjs` — 10/10 green: byte-identity across two runs, gates 1-7, 226/226 implied-value
  recompute, 40/40 watchlist coverage, farm-step structure/quality/distinctness/page parity, dossier
  rebuild byte-equal under cap, network-clean dashboard within caps, real PNGs inside caps, zero
  protocol-name literals in scoring sources, both runs inside the grader's time bound.

## Entry metadata

`.makefun/owner.json` carries the submitting wallet; `LICENSE` is the OSI licence the competition
requires. The frozen entry tree is assembled by `assemble-entry.mjs` from an explicit allowlist
(`LICENSE`, `main.ts`, `lib/`, `vendor/`, `README.md`, plus the frozen dashboard and screenshots) —
`check.mjs`, the `test/` suites, `red.txt`/`green.txt` and every scratch directory stay out of the
submission.
