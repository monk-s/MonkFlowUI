# Deep POC Analysis — BTC-PERP-INTX, 365 days
_Generated: 2026-05-18T02:03:11Z_

## Study 1: Direction filter

| Filter | n | Win% | E[R] | Return | MaxDD |
|---|---|---|---|---|---|
| both | 45 | 35.6% | -0.041 | -5.38% | -19.06% |
| long-only | 25 | 32.0% | -0.158 | -7.80% | -14.76% |
| short-only | 20 | 40.0% | +0.106 | +2.62% | -7.93% |

## Study 2: Quarter-by-quarter

| Quarter | Window | n | Win% | E[R] | Return | MaxDD |
|---|---|---|---|---|---|---|
| Q1 | 2025-05-18→2025-08-17 | 7 | 42.9% | +0.279 | +2.00% | -3.44% |
| Q2 | 2025-08-17→2025-11-16 | 15 | 40.0% | +0.079 | +1.32% | -8.77% |
| Q3 | 2025-11-16→2026-02-15 | 10 | 40.0% | +0.103 | +0.98% | -8.13% |
| Q4 | 2026-02-15→2026-05-18 | 13 | 15.4% | -0.627 | -12.14% | -14.56% |

## Study 3: Strategy vs buy-and-hold (full year)

| Approach | Return | Final equity on $10K |
|---|---|---|
| Buy & hold BTC | -25.81% | $7,419 |
| Strategy alone | -5.38% | $9,462 |
| 50/50 hedge   | -15.59% | $8,441 |

## Study 4: Strategy split (full year)

| Strategy | n | Win% | E[R] | Return | MaxDD |
|---|---|---|---|---|---|
| ema_trend | 45 | 35.6% | -0.041 | +0.00% | 0.00% |

## Caveats

- One symbol, one ~1-year window. Future BTC can differ wildly.
- Coinbase published candle prices; live spreads will be worse.
- No model of news shocks, funding spikes, exchange outages.
- Quarter splits have ~90 days each = small samples = wide confidence intervals.
