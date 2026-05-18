# Backtest Report — BTC-PERP-INTX, last 180 days
_Generated: 2026-05-18T00:14:39Z_

## Summary

| Metric | Value |
|---|---|
| n_trades | 21 |
| wins | 4 |
| losses | 17 |
| win_rate_pct | 19.05 |
| avg_winner_r | 1.87 |
| avg_loser_r | -1.083 |
| avg_winner_$ | 258.35 |
| avg_loser_$ | -150.21 |
| expectancy_r | -0.521 |
| expectancy_$ | -72.39 |
| profit_factor | 0.4 |
| max_consecutive_losses | 7 |
| max_drawdown_pct | -19.06 |
| starting_equity | 10000.0 |
| ending_equity | 8385.11 |
| total_return_pct | -16.15 |
| peak_equity | 10359.59 |
| total_fees_paid | 189.22 |

## Monthly P&L

| Month | Net P&L ($) |
|---|---|
| 2026-01 | -387.61 |
| 2026-02 | -31.50 |
| 2026-03 | -41.83 |
| 2026-04 | -508.96 |
| 2026-05 | -550.24 |

## Stats by strategy

| Strategy | Trades | Win% | Expectancy R | Total $ |
|---|---|---|---|---|
| ema_trend | 21 | 19.05% | -0.521 | -1,520.19 |

## Stats by regime at signal time

| Regime | Trades | Win% | Expectancy R |
|---|---|---|---|
| trending_up | 14 | 14.29% | -0.668 |
| trending_down | 7 | 28.57% | -0.226 |

## Exit reason breakdown

| Reason | Count | Avg R |
|---|---|---|
| target | 4 | 1.87 |
| stop | 17 | -1.083 |

## Caveats — read before extrapolating

- This backtest will **overstate forward returns** by ~20-50%.
- Coinbase published candles are at clean prices; live fills cross spread.
- The strategy was DESIGNED knowing what BTC has done recently (hindsight bias).
- No model of news shocks, exchange outages, partial fills.
- Slippage is a flat 0.03%; real spikes during volatility.
- One symbol, one ~6 month period — limited statistical confidence.
- If this period was unusually trendy or choppy, performance is unrepresentative.

Use as a FLOOR for whether the strategy has positive expectancy on the data it was designed around. Live results will be worse.
