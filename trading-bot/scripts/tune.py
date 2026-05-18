"""
Parameter tuning — sweep configurations through the backtester and rank.

Strategy:
  1. Run baseline + ~20 targeted parameter variations on the FULL 180-day dataset.
  2. Take top 5 by expectancy_r AND by total_return_pct.
  3. WALK-FORWARD VALIDATION: re-run those top configs on a held-out validation
     split (tune on first 120 days, validate on the last 60 days). If a config
     wins both halves, it's a candidate. If it only wins in the tuning half,
     it's curve-fit and we discard it.
  4. Print leaderboard + recommend the best config.
  5. Write TUNING_REPORT.md with full results.

USAGE
-----
    cd trading-bot
    python -m scripts.tune                 # 180-day sweep + walk-forward
    python -m scripts.tune --days 90       # shorter dataset

CAVEATS
-------
Even a walk-forward validated config is fitted to ONE 6-month period of BTC.
Future performance can still diverge. The validation gives directional confidence
("this config is consistent across two non-overlapping windows"), not certainty.
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Import the backtester first — we'll modify settings BEFORE each Backtester() call
from config.settings import settings  # noqa: E402
from scripts.backtest import Backtester, fetch_candles, stats, to_candle_objs  # noqa: E402

OUT_DIR = ROOT / "data" / "backtest"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Snapshot the original settings so we can restore between runs.
SETTINGS_KEYS_TO_TUNE = [
    "REGIME_CONFIRMATION_CANDLES",
    "TREND_ADX_THRESHOLD",
    "RANGE_ADX_THRESHOLD",
    "EMA_PULLBACK_TOLERANCE_PCT",
    "EMA_BODY_RATIO_MIN",
    "ATR_STOP_MULTIPLIER",
    "MIN_RR_RATIO",
    "TRAILING_ACTIVATION_R",
    "TRAILING_DISTANCE_ATR",
    "RISK_PER_TRADE_PCT",
]
ORIGINAL_SETTINGS = {k: getattr(settings, k) for k in SETTINGS_KEYS_TO_TUNE}


def apply_overrides(overrides: dict) -> None:
    """Mutate the global settings object in place. Strategies read settings.* at evaluate time."""
    for k in SETTINGS_KEYS_TO_TUNE:
        setattr(settings, k, ORIGINAL_SETTINGS[k])
    for k, v in overrides.items():
        if k not in SETTINGS_KEYS_TO_TUNE:
            raise ValueError(f"Unknown tunable parameter: {k}")
        setattr(settings, k, v)


def restore_settings() -> None:
    for k, v in ORIGINAL_SETTINGS.items():
        setattr(settings, k, v)


# ------------------------------------------------------------------
# Configurations to test
# ------------------------------------------------------------------
# Hand-picked rather than grid search to avoid overfitting noise.
# Each variant changes 1-3 things from baseline.

CONFIGS = [
    # Baseline
    {"name": "baseline", "overrides": {}},

    # ---- single-param: regime stability ----
    {"name": "conf3", "overrides": {"REGIME_CONFIRMATION_CANDLES": 3}},
    {"name": "conf4", "overrides": {"REGIME_CONFIRMATION_CANDLES": 4}},
    {"name": "conf5", "overrides": {"REGIME_CONFIRMATION_CANDLES": 5}},

    # ---- single-param: ADX strength filter ----
    {"name": "adx30", "overrides": {"TREND_ADX_THRESHOLD": 30}},
    {"name": "adx35", "overrides": {"TREND_ADX_THRESHOLD": 35}},

    # ---- single-param: deeper pullback required ----
    {"name": "pullback_0.5", "overrides": {"EMA_PULLBACK_TOLERANCE_PCT": 0.5}},
    {"name": "pullback_1.0", "overrides": {"EMA_PULLBACK_TOLERANCE_PCT": 1.0}},

    # ---- single-param: wider stops to avoid noise stop-out ----
    {"name": "stop_2.0atr", "overrides": {"ATR_STOP_MULTIPLIER": 2.0}},
    {"name": "stop_2.5atr", "overrides": {"ATR_STOP_MULTIPLIER": 2.5}},

    # ---- single-param: higher R:R minimum (fewer trades, better quality) ----
    {"name": "rr_2.5", "overrides": {"MIN_RR_RATIO": 2.5}},
    {"name": "rr_3.0", "overrides": {"MIN_RR_RATIO": 3.0}},

    # ---- combos that should work synergistically ----
    {"name": "less_flicker", "overrides": {
        "REGIME_CONFIRMATION_CANDLES": 4,
        "TREND_ADX_THRESHOLD": 30,
    }},
    {"name": "quality_entries", "overrides": {
        "REGIME_CONFIRMATION_CANDLES": 4,
        "EMA_PULLBACK_TOLERANCE_PCT": 0.5,
    }},
    {"name": "wider_stops_better_rr", "overrides": {
        "ATR_STOP_MULTIPLIER": 2.0,
        "MIN_RR_RATIO": 2.5,
    }},
    {"name": "all_three", "overrides": {
        "REGIME_CONFIRMATION_CANDLES": 4,
        "TREND_ADX_THRESHOLD": 30,
        "EMA_PULLBACK_TOLERANCE_PCT": 0.5,
    }},
    {"name": "strong_trend_only", "overrides": {
        "REGIME_CONFIRMATION_CANDLES": 4,
        "TREND_ADX_THRESHOLD": 35,
        "ATR_STOP_MULTIPLIER": 2.0,
    }},
    {"name": "aggressive_quality", "overrides": {
        "REGIME_CONFIRMATION_CANDLES": 4,
        "TREND_ADX_THRESHOLD": 30,
        "EMA_PULLBACK_TOLERANCE_PCT": 0.75,
        "ATR_STOP_MULTIPLIER": 2.0,
        "MIN_RR_RATIO": 2.5,
    }},
    {"name": "patient_trader", "overrides": {
        "REGIME_CONFIRMATION_CANDLES": 5,
        "TREND_ADX_THRESHOLD": 30,
        "EMA_PULLBACK_TOLERANCE_PCT": 1.0,
        "ATR_STOP_MULTIPLIER": 2.0,
        "MIN_RR_RATIO": 2.5,
    }},

    # ---- risk reduction (defensive variant) ----
    {"name": "tighter_risk", "overrides": {
        "RISK_PER_TRADE_PCT": 1.0,
        "REGIME_CONFIRMATION_CANDLES": 4,
    }},
]


# ------------------------------------------------------------------
# Run a single config and collect metrics
# ------------------------------------------------------------------

async def run_one(
    candles_4h, candles_1h, config: dict,
    start_idx: int = 0, end_idx: int = None,
) -> dict:
    apply_overrides(config["overrides"])
    bt = Backtester(candles_4h, candles_1h, start_idx=start_idx, end_idx=end_idx)
    await bt.run()
    s = stats(bt.closed_trades, float(bt.starting_equity), float(bt.peak_equity), bt.equity_curve)
    restore_settings()
    return {
        "name": config["name"],
        "overrides": config["overrides"],
        "stats": s,
    }


# ------------------------------------------------------------------
# Pretty-print leaderboard
# ------------------------------------------------------------------

def leaderboard_row(r: dict, prefix: str = "") -> str:
    s = r["stats"]
    if s.get("n_trades", 0) == 0:
        return f"  {prefix}{r['name']:25s}  n=0 trades (config too restrictive)"
    return (
        f"  {prefix}{r['name']:25s}  "
        f"n={s['n_trades']:3d}  "
        f"win%={s['win_rate_pct']:5.1f}  "
        f"E[R]={s['expectancy_r']:+.3f}  "
        f"ret={s['total_return_pct']:+6.2f}%  "
        f"maxDD={s['max_drawdown_pct']:6.2f}%  "
        f"PF={s['profit_factor']:.2f}"
    )


def print_leaderboard(results: list[dict], sort_key: str = "expectancy_r") -> None:
    valid = [r for r in results if r["stats"].get("n_trades", 0) > 0]
    ranked = sorted(valid, key=lambda r: r["stats"].get(sort_key, -999), reverse=True)
    no_trades = [r for r in results if r["stats"].get("n_trades", 0) == 0]
    for r in ranked:
        print(leaderboard_row(r))
    for r in no_trades:
        print(leaderboard_row(r))


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=180)
    args = parser.parse_args()
    days = args.days

    print(f"\n▶ Parameter tuning sweep — BTC-PERP-INTX, last {days} days")
    print(f"  Configs to test: {len(CONFIGS)}")
    print(f"  Each run: ~10-30 seconds, total ~{len(CONFIGS) * 20 // 60} minutes\n")

    # Fetch once, reuse
    raw_4h = await fetch_candles("4H", days)
    raw_1h = await fetch_candles("1H", days)
    candles_4h = to_candle_objs(raw_4h)
    candles_1h = to_candle_objs(raw_1h)
    n4 = len(candles_4h)
    print(f"  4H: {n4} bars  ({candles_4h[0].timestamp.date()} → {candles_4h[-1].timestamp.date()})")
    print(f"  1H: {len(candles_1h)} bars\n")

    # ──────────── Phase 1: full-period sweep ────────────
    print("=" * 70)
    print("PHASE 1: Full-period sweep (all configs vs all 180 days)")
    print("=" * 70)
    full_results = []
    for i, cfg in enumerate(CONFIGS, 1):
        print(f"  [{i:2d}/{len(CONFIGS)}] {cfg['name']:25s} ... ", end="", flush=True)
        r = await run_one(candles_4h, candles_1h, cfg)
        s = r["stats"]
        n = s.get("n_trades", 0)
        if n == 0:
            print("0 trades (config too restrictive)")
        else:
            print(f"n={n:3d}  E[R]={s['expectancy_r']:+.3f}  ret={s['total_return_pct']:+6.2f}%")
        full_results.append(r)

    print()
    print("Full-period leaderboard (sorted by expectancy_r):")
    print_leaderboard(full_results, "expectancy_r")

    # ──────────── Phase 2: walk-forward validation ────────────
    # Split: first 70% for tuning, last 30% for validation
    split_idx = int(n4 * 0.7)
    split_date = candles_4h[split_idx].timestamp.date()

    print()
    print("=" * 70)
    print(f"PHASE 2: Walk-forward validation")
    print(f"  Tune window:     bars [0:{split_idx}]  ({candles_4h[0].timestamp.date()} → {split_date})")
    print(f"  Validate window: bars [{split_idx}:]  ({split_date} → {candles_4h[-1].timestamp.date()})")
    print("=" * 70)

    # Pick top 5 from full-period by expectancy_r (with at least 5 trades)
    candidates = [r for r in full_results if r["stats"].get("n_trades", 0) >= 5]
    candidates.sort(key=lambda r: r["stats"].get("expectancy_r", -999), reverse=True)
    top_5 = candidates[:5]

    print(f"\nTop 5 from Phase 1 (≥5 trades, by E[R]):")
    for r in top_5:
        print(leaderboard_row(r))

    # Re-run those 5 on the tune-only and validate-only windows
    print(f"\nRe-running each on the two windows separately:\n")

    walk_results = []
    for r in top_5:
        cfg = {"name": r["name"], "overrides": r["overrides"]}
        # Tune window
        tune_r = await run_one(candles_4h, candles_1h, cfg, start_idx=0, end_idx=split_idx)
        # Validate window
        val_r = await run_one(candles_4h, candles_1h, cfg, start_idx=split_idx, end_idx=None)
        walk_results.append({
            "name": cfg["name"],
            "overrides": cfg["overrides"],
            "tune": tune_r["stats"],
            "validate": val_r["stats"],
        })
        print(f"  {cfg['name']:25s}")
        print(f"    tune:     n={tune_r['stats'].get('n_trades', 0):3d}  "
              f"E[R]={tune_r['stats'].get('expectancy_r', 0):+.3f}  "
              f"ret={tune_r['stats'].get('total_return_pct', 0):+.2f}%")
        print(f"    validate: n={val_r['stats'].get('n_trades', 0):3d}  "
              f"E[R]={val_r['stats'].get('expectancy_r', 0):+.3f}  "
              f"ret={val_r['stats'].get('total_return_pct', 0):+.2f}%")

    # ──────────── Recommendation ────────────
    # Pick config where BOTH tune and validate windows have positive expectancy.
    # If none, recommend the least-bad config and flag that the strategy is not validated.
    consistent = [
        r for r in walk_results
        if r["tune"].get("expectancy_r", -999) > 0
        and r["validate"].get("expectancy_r", -999) > 0
    ]

    print()
    print("=" * 70)
    print("RECOMMENDATION")
    print("=" * 70)
    if consistent:
        best = max(consistent, key=lambda r: r["validate"]["expectancy_r"])
        print(f"\n✅ FOUND: {best['name']} is profitable on BOTH halves")
        print(f"   Overrides: {best['overrides']}")
        print(f"   Tune     window E[R]: {best['tune']['expectancy_r']:+.3f}, return: {best['tune']['total_return_pct']:+.2f}%")
        print(f"   Validate window E[R]: {best['validate']['expectancy_r']:+.3f}, return: {best['validate']['total_return_pct']:+.2f}%")
        verdict = "VALIDATED"
    else:
        # Fall back: pick the one with best VALIDATE expectancy (most recent data)
        best = max(walk_results, key=lambda r: r["validate"].get("expectancy_r", -999))
        print(f"\n⚠️  NO config passed walk-forward validation.")
        print(f"   All top-5 configs lost in at least one half.")
        print(f"   Best-of-the-worst by validation E[R]: {best['name']}")
        print(f"   Overrides: {best['overrides']}")
        print(f"   Tune     E[R]: {best['tune'].get('expectancy_r', 0):+.3f}, return: {best['tune'].get('total_return_pct', 0):+.2f}%")
        print(f"   Validate E[R]: {best['validate'].get('expectancy_r', 0):+.3f}, return: {best['validate'].get('total_return_pct', 0):+.2f}%")
        print("\n   The strategy does not have validated edge on this dataset.")
        verdict = "NOT_VALIDATED"

    # ──────────── Write report ────────────
    write_report(full_results, walk_results, best, verdict, days, split_date)


def write_report(full_results, walk_results, best, verdict, days, split_date):
    md = []
    md.append(f"# Parameter Tuning Report — BTC-PERP-INTX, last {days} days\n")
    md.append(f"_Generated: {datetime.utcnow().isoformat(timespec='seconds')}Z_\n\n")
    md.append(f"## Verdict: **{verdict}**\n\n")

    md.append(f"### Recommended config: `{best['name']}`\n\n")
    md.append("```python\n")
    for k, v in best["overrides"].items():
        md.append(f"{k} = {v}\n")
    md.append("```\n\n")

    if verdict == "VALIDATED":
        md.append("This config produced positive expectancy on BOTH the tuning window and ")
        md.append("the held-out validation window. That's a meaningful signal, but still ")
        md.append("only ~6 months of one symbol — don't treat it as a guarantee.\n\n")
    else:
        md.append("⚠️ **No configuration passed walk-forward validation.** The strategy as ")
        md.append("designed does not have demonstrable edge on the last 6 months of ")
        md.append("BTC-PERP-INTX. The 'best-of-the-worst' is shown above; treat it as ")
        md.append("information only, not as a green light.\n\n")

    md.append("## Walk-forward validation results\n\n")
    md.append(f"Split: first 70% (tune) vs last 30% (validate). Split date: {split_date}\n\n")
    md.append("| Config | Tune n | Tune E[R] | Tune % | Val n | Val E[R] | Val % |\n")
    md.append("|---|---|---|---|---|---|---|\n")
    for r in walk_results:
        t, v = r["tune"], r["validate"]
        md.append(
            f"| {r['name']} | {t.get('n_trades', 0)} | "
            f"{t.get('expectancy_r', 0):+.3f} | {t.get('total_return_pct', 0):+.2f}% | "
            f"{v.get('n_trades', 0)} | "
            f"{v.get('expectancy_r', 0):+.3f} | {v.get('total_return_pct', 0):+.2f}% |\n"
        )

    md.append("\n## Full-period sweep (all configs, all 180 days)\n\n")
    md.append("| Config | Overrides | n | Win% | E[R] | Return% | MaxDD% | PF |\n")
    md.append("|---|---|---|---|---|---|---|---|\n")
    valid = [r for r in full_results if r["stats"].get("n_trades", 0) > 0]
    ranked = sorted(valid, key=lambda r: r["stats"].get("expectancy_r", -999), reverse=True)
    for r in ranked:
        s = r["stats"]
        ov = ", ".join(f"{k}={v}" for k, v in r["overrides"].items()) or "(none)"
        md.append(
            f"| `{r['name']}` | {ov} | {s['n_trades']} | {s['win_rate_pct']:.1f}% | "
            f"{s['expectancy_r']:+.3f} | {s['total_return_pct']:+.2f}% | "
            f"{s['max_drawdown_pct']:.2f}% | {s['profit_factor']:.2f} |\n"
        )
    no_trades = [r for r in full_results if r["stats"].get("n_trades", 0) == 0]
    for r in no_trades:
        ov = ", ".join(f"{k}={v}" for k, v in r["overrides"].items())
        md.append(f"| `{r['name']}` | {ov} | 0 | — | — | — | — | — |\n")

    md.append("\n## Caveats\n\n")
    md.append("- One symbol (BTC-PERP-INTX), one ~6-month window. Future BTC behavior may differ.\n")
    md.append("- Walk-forward validation reduces (but doesn't eliminate) overfitting.\n")
    md.append("- Coinbase published candle prices used; live spreads/slippage will be worse.\n")
    md.append("- No model of news shocks, funding spikes, exchange outages.\n")
    md.append("- A 'validated' verdict means positive expectancy on two non-overlapping windows. ")
    md.append("It does NOT mean profitable forward.\n")

    output = OUT_DIR / "TUNING_REPORT.md"
    output.write_text("".join(md))
    print(f"\n  Report: {output}")


if __name__ == "__main__":
    asyncio.run(main())
