"""
Deeper analysis on top of the tuning sweep results.

Runs 4 additional studies on 365-day BTC-PERP-INTX data, each using the
same backtest engine:

  1. Long-only:  ignore short signals (run with patched strategy that only
                 returns longs)
  2. Short-only: same, opposite direction
  3. By quarter: split the year into 4 quarters, run baseline on each,
                 show which quarters worked
  4. Hedge:      buy-and-hold BTC vs strategy alone vs 50/50 hedge

USAGE:
    python -m scripts.analyze --days 365
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from config.settings import settings  # noqa: E402
from scripts.backtest import (  # noqa: E402
    Backtester, fetch_candles, stats, to_candle_objs,
)

OUT_DIR = ROOT / "data" / "backtest"
OUT_DIR.mkdir(parents=True, exist_ok=True)


# ──────────────────────────────────────────────────────────────────────────
# Direction-filtered backtests (long-only / short-only)
# ──────────────────────────────────────────────────────────────────────────

class DirectionFilteredBacktester(Backtester):
    """Backtester that drops signals not matching `allowed_direction`."""

    def __init__(self, *args, allowed_direction: str, **kwargs):
        super().__init__(*args, **kwargs)
        self.allowed_direction = allowed_direction  # "long" or "short"

    async def _try_open(self, signal, bar):
        if signal.direction != self.allowed_direction:
            return  # silently drop
        await super()._try_open(signal, bar)


async def run_direction_filter(candles_4h, candles_1h, direction: str) -> dict:
    bt = DirectionFilteredBacktester(candles_4h, candles_1h, allowed_direction=direction)
    await bt.run()
    s = stats(bt.closed_trades, float(bt.starting_equity), float(bt.peak_equity), bt.equity_curve)
    return s


# ──────────────────────────────────────────────────────────────────────────
# By-quarter analysis (4 windows on the same 365-day dataset)
# ──────────────────────────────────────────────────────────────────────────

async def run_quarter(candles_4h, candles_1h, start_idx: int, end_idx: int, label: str) -> dict:
    bt = Backtester(candles_4h, candles_1h, start_idx=start_idx, end_idx=end_idx)
    await bt.run()
    s = stats(bt.closed_trades, float(bt.starting_equity), float(bt.peak_equity), bt.equity_curve)
    s["window"] = label
    return s


# ──────────────────────────────────────────────────────────────────────────
# Reporting
# ──────────────────────────────────────────────────────────────────────────

def fmt_row(label: str, s: dict) -> str:
    if s.get("n_trades", 0) == 0:
        return f"  {label:30s}  n=0 trades"
    return (
        f"  {label:30s}  "
        f"n={s['n_trades']:3d}  "
        f"win%={s['win_rate_pct']:5.1f}  "
        f"E[R]={s['expectancy_r']:+.3f}  "
        f"ret={s['total_return_pct']:+6.2f}%  "
        f"maxDD={s['max_drawdown_pct']:6.2f}%  "
        f"PF={s['profit_factor']:.2f}"
    )


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=365)
    args = parser.parse_args()
    days = args.days

    print(f"\n▶ Deep analysis — BTC-PERP-INTX, last {days} days\n")

    raw_4h = await fetch_candles("4H", days)
    raw_1h = await fetch_candles("1H", days)
    candles_4h = to_candle_objs(raw_4h)
    candles_1h = to_candle_objs(raw_1h)
    n4 = len(candles_4h)
    print(f"  4H bars: {n4}  ({candles_4h[0].timestamp.date()} → {candles_4h[-1].timestamp.date()})\n")

    # ──────────── Study 1: long-only / short-only ────────────
    print("=" * 70)
    print("STUDY 1: Direction filter (long-only vs short-only vs both)")
    print("=" * 70)

    print("Running baseline (both directions)...")
    bt_both = Backtester(candles_4h, candles_1h)
    await bt_both.run()
    s_both = stats(bt_both.closed_trades, float(bt_both.starting_equity),
                   float(bt_both.peak_equity), bt_both.equity_curve)

    print("Running long-only...")
    s_long = await run_direction_filter(candles_4h, candles_1h, "long")

    print("Running short-only...")
    s_short = await run_direction_filter(candles_4h, candles_1h, "short")

    print()
    print(fmt_row("both directions (baseline)", s_both))
    print(fmt_row("long-only", s_long))
    print(fmt_row("short-only", s_short))

    # ──────────── Study 2: by quarter ────────────
    print()
    print("=" * 70)
    print("STUDY 2: Quarter-by-quarter (each ~90-day window)")
    print("=" * 70)

    quarter_size = n4 // 4
    quarters = []
    for q in range(4):
        s_idx = q * quarter_size
        e_idx = (q + 1) * quarter_size if q < 3 else n4
        start_date = candles_4h[s_idx].timestamp.date()
        end_date = candles_4h[e_idx - 1].timestamp.date()
        label = f"Q{q+1}: {start_date}→{end_date}"
        print(f"Running {label}...")
        s = await run_quarter(candles_4h, candles_1h, s_idx, e_idx, label)
        quarters.append(s)
        print(fmt_row(label, s))

    # ──────────── Study 3: Buy-and-hold vs strategy vs 50/50 ────────────
    print()
    print("=" * 70)
    print("STUDY 3: Strategy vs buy-and-hold vs 50/50 hedge")
    print("=" * 70)

    first_price = candles_4h[0].close
    last_price = candles_4h[-1].close
    bh_return_pct = (last_price - first_price) / first_price * 100
    strategy_return_pct = s_both["total_return_pct"]
    hedge_return_pct = 0.5 * bh_return_pct + 0.5 * strategy_return_pct

    print(f"  Buy & hold BTC:       {bh_return_pct:+7.2f}%  ($10K → ${10000 * (1 + bh_return_pct/100):,.0f})")
    print(f"  Strategy alone:       {strategy_return_pct:+7.2f}%  ($10K → ${10000 * (1 + strategy_return_pct/100):,.0f})")
    print(f"  50/50 hedge:          {hedge_return_pct:+7.2f}%  ($10K → ${10000 * (1 + hedge_return_pct/100):,.0f})")

    # ──────────── Study 4: Strategy breakdown ────────────
    print()
    print("=" * 70)
    print("STUDY 4: Strategy breakdown on full year")
    print("=" * 70)

    by_strat = {}
    for t in bt_both.closed_trades:
        by_strat.setdefault(t.strategy, []).append(t)
    for sname, ts in by_strat.items():
        s = stats(ts, 10000.0, 10000.0, [])
        print(fmt_row(f"{sname} ({len(ts)} trades)", s))
    if not by_strat:
        print("  (no trades)")

    # ──────────── Write report ────────────
    md = []
    md.append(f"# Deep POC Analysis — BTC-PERP-INTX, {days} days\n")
    md.append(f"_Generated: {datetime.utcnow().isoformat(timespec='seconds')}Z_\n\n")

    md.append("## Study 1: Direction filter\n\n")
    md.append("| Filter | n | Win% | E[R] | Return | MaxDD |\n|---|---|---|---|---|---|\n")
    for label, s in [("both", s_both), ("long-only", s_long), ("short-only", s_short)]:
        if s.get("n_trades", 0) == 0:
            md.append(f"| {label} | 0 | — | — | — | — |\n")
        else:
            md.append(f"| {label} | {s['n_trades']} | {s['win_rate_pct']:.1f}% | "
                      f"{s['expectancy_r']:+.3f} | {s['total_return_pct']:+.2f}% | "
                      f"{s['max_drawdown_pct']:.2f}% |\n")

    md.append("\n## Study 2: Quarter-by-quarter\n\n")
    md.append("| Quarter | Window | n | Win% | E[R] | Return | MaxDD |\n|---|---|---|---|---|---|---|\n")
    for q in quarters:
        w = q.get("window", "")
        if q.get("n_trades", 0) == 0:
            md.append(f"| Q{w[1]} | {w[4:]} | 0 | — | — | — | — |\n")
        else:
            md.append(f"| Q{w[1]} | {w[4:]} | {q['n_trades']} | {q['win_rate_pct']:.1f}% | "
                      f"{q['expectancy_r']:+.3f} | {q['total_return_pct']:+.2f}% | "
                      f"{q['max_drawdown_pct']:.2f}% |\n")

    md.append("\n## Study 3: Strategy vs buy-and-hold (full year)\n\n")
    md.append("| Approach | Return | Final equity on $10K |\n|---|---|---|\n")
    md.append(f"| Buy & hold BTC | {bh_return_pct:+.2f}% | ${10000 * (1 + bh_return_pct/100):,.0f} |\n")
    md.append(f"| Strategy alone | {strategy_return_pct:+.2f}% | ${10000 * (1 + strategy_return_pct/100):,.0f} |\n")
    md.append(f"| 50/50 hedge   | {hedge_return_pct:+.2f}% | ${10000 * (1 + hedge_return_pct/100):,.0f} |\n")

    md.append("\n## Study 4: Strategy split (full year)\n\n")
    md.append("| Strategy | n | Win% | E[R] | Return | MaxDD |\n|---|---|---|---|---|---|\n")
    for sname, ts in by_strat.items():
        s = stats(ts, 10000.0, 10000.0, [])
        md.append(f"| {sname} | {s['n_trades']} | {s['win_rate_pct']:.1f}% | "
                  f"{s['expectancy_r']:+.3f} | {s['total_return_pct']:+.2f}% | "
                  f"{s['max_drawdown_pct']:.2f}% |\n")

    md.append("\n## Caveats\n\n")
    md.append("- One symbol, one ~1-year window. Future BTC can differ wildly.\n")
    md.append("- Coinbase published candle prices; live spreads will be worse.\n")
    md.append("- No model of news shocks, funding spikes, exchange outages.\n")
    md.append("- Quarter splits have ~90 days each = small samples = wide confidence intervals.\n")

    (OUT_DIR / "POC_ANALYSIS.md").write_text("".join(md))
    print(f"\n  Report: {OUT_DIR / 'POC_ANALYSIS.md'}")


if __name__ == "__main__":
    asyncio.run(main())
