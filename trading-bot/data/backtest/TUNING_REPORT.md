# Parameter Tuning Report — BTC-PERP-INTX, last 365 days
_Generated: 2026-05-18T00:44:52Z_

## Verdict: **NOT_VALIDATED**

### Recommended config: `conf3`

```python
REGIME_CONFIRMATION_CANDLES = 3
```

⚠️ **No configuration passed walk-forward validation.** The strategy as designed does not have demonstrable edge on the last 6 months of BTC-PERP-INTX. The 'best-of-the-worst' is shown above; treat it as information only, not as a green light.

## Walk-forward validation results

Split: first 70% (tune) vs last 30% (validate). Split date: 2026-01-28

| Config | Tune n | Tune E[R] | Tune % | Val n | Val E[R] | Val % |
|---|---|---|---|---|---|---|
| adx35 | 13 | +0.732 | +13.63% | 10 | -0.772 | -11.65% |
| strong_trend_only | 12 | +0.416 | +6.80% | 10 | -0.463 | -7.32% |
| pullback_0.5 | 40 | +0.155 | +5.24% | 18 | -0.414 | -11.47% |
| conf3 | 27 | +0.214 | +7.91% | 17 | -0.413 | -10.74% |
| baseline | 29 | +0.223 | +8.14% | 16 | -0.520 | -12.50% |

## Full-period sweep (all configs, all 180 days)

| Config | Overrides | n | Win% | E[R] | Return% | MaxDD% | PF |
|---|---|---|---|---|---|---|---|
| `adx35` | TREND_ADX_THRESHOLD=35 | 23 | 39.1% | +0.078 | +0.40% | -14.14% | 1.06 |
| `strong_trend_only` | REGIME_CONFIRMATION_CANDLES=4, TREND_ADX_THRESHOLD=35, ATR_STOP_MULTIPLIER=2.0 | 22 | 36.4% | +0.016 | -1.02% | -9.95% | 0.99 |
| `pullback_0.5` | EMA_PULLBACK_TOLERANCE_PCT=0.5 | 58 | 36.2% | -0.022 | -6.82% | -18.10% | 0.94 |
| `conf3` | REGIME_CONFIRMATION_CANDLES=3 | 44 | 36.4% | -0.029 | -3.68% | -19.12% | 0.97 |
| `baseline` | (none) | 45 | 35.6% | -0.041 | -5.38% | -19.06% | 0.94 |
| `conf5` | REGIME_CONFIRMATION_CANDLES=5 | 50 | 36.0% | -0.044 | -6.26% | -16.78% | 0.92 |
| `quality_entries` | REGIME_CONFIRMATION_CANDLES=4, EMA_PULLBACK_TOLERANCE_PCT=0.5 | 59 | 35.6% | -0.049 | -7.34% | -14.82% | 0.92 |
| `patient_trader` | REGIME_CONFIRMATION_CANDLES=5, TREND_ADX_THRESHOLD=30, EMA_PULLBACK_TOLERANCE_PCT=1.0, ATR_STOP_MULTIPLIER=2.0, MIN_RR_RATIO=2.5 | 41 | 29.3% | -0.065 | -5.08% | -20.79% | 0.93 |
| `conf4` | REGIME_CONFIRMATION_CANDLES=4 | 49 | 34.7% | -0.077 | -6.99% | -15.78% | 0.90 |
| `tighter_risk` | RISK_PER_TRADE_PCT=1.0, REGIME_CONFIRMATION_CANDLES=4 | 49 | 34.7% | -0.077 | -5.52% | -11.59% | 0.89 |
| `all_three` | REGIME_CONFIRMATION_CANDLES=4, TREND_ADX_THRESHOLD=30, EMA_PULLBACK_TOLERANCE_PCT=0.5 | 39 | 33.3% | -0.105 | -8.00% | -16.99% | 0.85 |
| `pullback_1.0` | EMA_PULLBACK_TOLERANCE_PCT=1.0 | 71 | 32.4% | -0.133 | -18.52% | -23.79% | 0.80 |
| `less_flicker` | REGIME_CONFIRMATION_CANDLES=4, TREND_ADX_THRESHOLD=30 | 31 | 32.3% | -0.135 | -6.70% | -16.00% | 0.84 |
| `adx30` | TREND_ADX_THRESHOLD=30 | 32 | 31.2% | -0.159 | -9.77% | -16.14% | 0.77 |
| `stop_2.5atr` | ATR_STOP_MULTIPLIER=2.5 | 45 | 26.7% | -0.275 | -18.63% | -21.67% | 0.65 |
| `aggressive_quality` | REGIME_CONFIRMATION_CANDLES=4, TREND_ADX_THRESHOLD=30, EMA_PULLBACK_TOLERANCE_PCT=0.75, ATR_STOP_MULTIPLIER=2.0, MIN_RR_RATIO=2.5 | 35 | 22.9% | -0.281 | -14.07% | -18.39% | 0.69 |
| `rr_3.0` | MIN_RR_RATIO=3.0 | 44 | 20.4% | -0.283 | -20.97% | -22.01% | 0.64 |
| `stop_2.0atr` | ATR_STOP_MULTIPLIER=2.0 | 45 | 26.7% | -0.284 | -19.32% | -19.81% | 0.64 |
| `rr_2.5` | MIN_RR_RATIO=2.5 | 37 | 21.6% | -0.342 | -18.79% | -19.71% | 0.60 |
| `wider_stops_better_rr` | ATR_STOP_MULTIPLIER=2.0, MIN_RR_RATIO=2.5 | 33 | 18.2% | -0.445 | -20.91% | -22.71% | 0.50 |

## Caveats

- One symbol (BTC-PERP-INTX), one ~6-month window. Future BTC behavior may differ.
- Walk-forward validation reduces (but doesn't eliminate) overfitting.
- Coinbase published candle prices used; live spreads/slippage will be worse.
- No model of news shocks, funding spikes, exchange outages.
- A 'validated' verdict means positive expectancy on two non-overlapping windows. It does NOT mean profitable forward.
