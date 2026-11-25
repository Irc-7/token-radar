# token-radar-01 — ranked pre-token protocol board

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Irc-7/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Irc-7/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Submitted to [make.fun's “Build the best token launch radar” bounty](https://make.fun/bounty/token-radar-01).

A deterministic make.fun competition entry. It reads a sealed DeFiLlama-derived snapshot of 758
protocols, scores every watchlist and pre-token protocol with one fitted value model and one fitted
peer-record model, and writes a ranked board (`board.json`), the page's data (`data.js`), a static
offline dashboard, three real screenshots, and a self-describing `dossier.json`. No network, no
randomness, no clock: the same input always yields byte-identical output.

Version 2 replaces the hand-written multiplier with two fitted models and adds the evidence layer the
judge can check: held-out walk-forward and leave-one-out error, a five-fold Brier score, empirical
P25/P75 bands, a reconciliation ledger, and a farm verdict whose arithmetic closes on one basis.

## Reproduce it

```bash
# grader-equivalent run: reads the sealed snapshot, writes out/ (or $MAKEFUN_OUTPUT_DIR)
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

# unit + integration suite
node --test test/*.test.ts
```

Requires Node 22 or newer (Node 22.23.5 on the build host, Node 26.7.0 on the Windows mirror).
Standard library only — no `npm install`, no build step, no dependency file. The grader mounts the
sealed snapshot at `/input/snapshot.json`; locally point `--input` at the same file.

## The snapshot

Sealed input at `input/snapshot.json`: 247,940 bytes, sha256
`42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`.

| Field | Value |
|---|---|
| `as_of` | 2026-11-14 |
| `floor_usd` | 50,000,000 |
| `protocols` | 758 |
| `watchlist` | 40 slugs |

Buckets over those 758: **40 watchlist, 416 already traded, 144 excluded, 158 pre-token**. The board
is the 40 watchlist rows plus the 158 pre-token rows: **198 rows**, ranks dense 1..198, ordered by
implied value with `slug` as the final tie-break. The score reads `tvl_usd`, `mcap_usd`, `listed_at`
and `category`; `name` and `slug` appear only in display text and the tie-break.

## The value model

Ordinary least squares, one term, no category dummy:

```
x = log10(tvl_usd)
y = log10(mcap_usd / tvl_usd)
y = a + b·x          a = 3.024673, b = -0.477734     fitted on 128 labelled rows
multiple = clip(10^(a + b·x), 0.001, 100)
implied  = round(tvl_usd × multiple × peerOdds)
```

No category term survives a held-out test, so none is fitted. The residual distribution, sorted
ascending, gives the P25 and P75 bands by linear interpolation: `multiple × 10^quantile(residuals, q)`,
with P25 forced below and P75 above the point estimate.

| Held-out check | Points | Median miss factor |
|---|---|---|
| Walk-forward (refit at every row, min 20 train) | 108 | **×3.7874** |
| Leave-one-out | 128 | ×3.3987 |
| Median-multiple baseline | 108 | ×5.3866 |

`kept: ["size"]` is the recorded verdict: the size term beats the median-multiple baseline on the same
rows by 29.7 %. 33 of the 128 labelled rows carry a null `listed_at` and sort last in every ordering —
that is conservative (they are scored only after the fit has seen the earlier rows), and it is stated
on the page rather than hidden.

## The peer record (odds model)

A logistic model on `log(tvl)` and `age_days`, fitted on the 645 rows that carry a token decision.
Brier is reported three ways, because the reference you pick moves the sign:

| Reference | Brier | Brier skill |
|---|---|---|
| Held out, 5 contiguous folds ordered by `listed_at` | 0.1318 | — |
| Base rate of the scored rows (standard BSS reference) | 0.1305 | **−1.0 %** |
| Base rate of the training side of each fold | 0.1412 | +6.6 % |
| In-sample model / in-sample base | 0.1301 / 0.1373 | +5.2 % |

The page prints the loss, not the flattering reference: **no edge on scored rows, 3 of 5 folds lost**.
Coefficients for each fold are fitted without that fold, and the fold order does not change the pooled
score (a unit test asserts it). Median age of the labelled rows is 677 days.

## Farm verdicts: one basis, printed

```
drop   = implied_value_usd × dropShare / participants
fee    = drop × feeBps / 10,000
net    = drop − fee
hours  = horizonWeeks × hoursPerWeek
net/h  = net / hours
```

Every money line rides on the drop. The deposit is capital, never a denominator, and the participant
count is an assumption printed on the page. Tier: **FARM** at ≥ $25/h (an hour of skilled work),
**MARGINAL** at ≥ gas ÷ hours per week = $1/h, **SKIP** below that. Board spread: **FARM 11 ·
MARGINAL 174 · SKIP 13** — a classifier that separates rows, not a constant.

The row in screenshot 2, in full: implied $10,903,921 → drop **$1,526.55** (7 % ÷ 500 farmers) → fee
**$1.53** (10 bps of the drop) → net **$1,525.02** → **$63.54/h** over 12 weeks × 2 hours. Net against
the $2,000 deposit is 0.76×, not 381×.

| Parameter | Value | Source |
|---|---|---|
| `depositUsd` | 2,000 | capital at risk, printed in the steps |
| `dropShare` | 0.07 | share of implied value modelled as the user allocation |
| `participants` | 500 | **assumed**, split evenly; halving it doubles the drop |
| `feeBps` | 10 | protocol fee on the drop |
| `horizonWeeks` / `hoursPerWeek` | 12 / 2 | 24 hours of work per farm |
| `gasUsdPerWeek` | 2 | weekly qualifying action |
| `farmFloorUsdPerHour` | 25 | FARM threshold |

## Output tree

| Path | Bytes | Note |
|---|---|---|
| `board.json` | 242,446 | `{rows:[…]}`, 198 rows, `total_implied_usd` $277,199,811, checksum `76bea874` |
| `metrics.json` | 1,279 | every headline number, plus the farm parameters |
| `data.js` | 243,449 | `window.RADAR`, the same object that produced the board |
| `dashboard/` | 23,142 | `index.html` 6,209 + `app.js` 11,168 + `app.css` 5,765 |
| `screenshots/` | 166,150 / 200,581 / 81,150 | board 1440×900, detail 1280×900, method 900×1024 |
| `dossier.json` | 621,838 | built last by the vendored `buildDossier`; rebuilds byte-equal |

Reconciliation ledger, printed on the page and in the dossier: **758 = 40 + 416 + 144 + 158**, with a
SHA-256 over `slug:rank:implied` rows (`76bea874`).

## Dashboard

Three static files, no framework, no CDN, no `fetch`, no font, zero `http(s)://`. It opens from
`file://` and renders fully offline.

- KPI strip carries the comparison inline: `×3.7874` with `baseline ×5.3866 · LOO ×3.3987`, and
  `0.1318` with `base 0.1305 · BSS −1.0 %`. No number lives only in a tooltip.
- Method panel prints all six odds rows, the validation table and the reconciliation ledger.
- Board table: verdict spread in the header, sortable columns, keyboard-scrollable region
  (`tabindex="0"` + `role="region"`), sticky header.
- Detail dialog is a native `<dialog>`: model inputs, the P25/P75 band, the farm arithmetic row by row,
  and the full chain list (wrapped, never clipped).
- Contrast is measured, not assumed: 12 computed pairs ≥ 4.5:1 in both themes; the KPI value sits at
  15.29:1 against its panel and is brighter than its own label.

## Determinism

No `Date.now`, no randomness, no input-order-dependent iteration. Floats go through `round4`, `round6`
or cents rounding; every sort ends in `slug`. The gate rebuilds the tree twice and compares all four
JSON artifacts against the shipped `out/`: `board.json`, `metrics.json`, `data.js` and `dossier.json`
must agree byte for byte, and `out/` must equal both fresh runs (a stale `out/` fails).

## Verification record

Run on `gh-mac-worker-2`, Node 22.23.5, from the v2 workspace. The gate harness lives in the author's
workspace, not in this repo, so the entry tree stays on the competition's allowlist.

| Check | Result |
|---|---|
| `node --test test/*.test.ts` | **22 tests, 22 pass, 0 fail** (7 files) |
| `node qa-gate.mjs` | **5/6 pass, 1 skipped, 0 fail** — skip is `frozen entry untouched`, which needs the Windows host that holds the v1 repository; it prints SKIP, never PASS |
| `qa-v2/known-totals.mjs` | 15 headline numbers + 2 comparators; 198/198 rows obey `net = drop − fee`; verdict spread measured |
| `qa-v2/contrast.mjs` | 12 computed pairs ≥ 4.5:1 in both themes |
| `qa-v2/words-audit.mjs` | 0 prose runs over six words |
| Dossier | rebuilds byte-equal to `621,838 B`, inside 1.5 MiB |

Screenshots were rendered by Chrome 158 on the same macOS runner, under the account that owns the
runner's console session: the build account has no GUI session and Chrome exits SIGTRAP there. No root,
no `--no-sandbox`, no preference edited.

## Layout

```
main.ts                  entrypoint: load, fit, score, gate, write
lib/snapshot.ts          snapshot types, loader, age days
lib/buckets.ts           watchlist / traded / excluded / pre-token classification
lib/value-model.ts       log-log OLS, P25/P75 quantiles, clip
lib/validate.ts          walk-forward, leave-one-out, median-multiple baseline
lib/odds-model.ts        logistic peer record, 5-fold Brier, fold loss count
lib/farm.ts              single-basis drop / fee / net / net per hour / tier
lib/board.ts             selection, ranking, row assembly, farm steps
lib/ledger.ts            bucket counts, total implied, checksum
vendor/makefun-board.ts  vendored dossier builder
dashboard/               static page (html, css, js)
screenshots/             three real PNGs
test/                    node:test suites, 7 files
```

## Entry metadata

`.makefun/owner.json` carries the submitting wallet; `LICENSE` is the OSI licence the competition
requires. The entry tree is assembled from an explicit allowlist — `LICENSE`, `main.ts`, `lib/`,
`vendor/`, `README.md`, plus `dashboard/` and `screenshots/` from the built output. The gate harness,
the `test/` suites, the sealed snapshot and every scratch directory stay out of the submitted tree.
