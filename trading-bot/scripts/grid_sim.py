"""
Grid-trading simulator for crypto perps / spot.

Profits from oscillations within a price range. Places buy orders at fixed
grid levels below current price, sell orders above; when a buy fills, a new
sell goes up one level; when a sell fills, a new buy goes down one level.

Two grid styles:
  - "static":  Grid range fixed at construction (e.g. $50K-$110K for BTC).
                Trade only inside that range.
  - "dynamic": Grid recenters/resizes periodically based on recent N-day
                high/low (default 60-day). Adapts to drifting price action.

Sizing modes:
  - "fixed_qty":   Same notional ($ amount) at each level
  - "fixed_pct":   Fixed % of starting equity at each level

Long-biased: buy levels fill into a position; sell levels exit. Maximum
inventory = total capital. Won't short below the bottom.

Fill model uses bar high/low to detect crossed levels per bar. Conservative:
each level can only fill once per bar (no double-counting whipsaws inside
a single day).

Fees: Coinbase Advanced taker = 0.06% per side. Grid orders are typically
limit orders → maker fee. Coinbase maker on perps = 0.02%. Default both
to maker (more realistic for grid).
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "historical" / "v2"


@dataclass
class GridConfig:
    range_low: float
    range_high: float
    n_levels: int            # number of grid lines (incl. endpoints)
    capital_per_level: float
    maker_fee_pct: float = 0.02  # %; Coinbase Advanced perps maker fee
    taker_fee_pct: float = 0.06  # % (for fallback / forced market-out)
    starting_cash: float = 10_000.0
    style: str = "static"        # "static" or "dynamic"
    dynamic_recenter_bars: int = 60   # for dynamic: re-anchor every N bars
    dynamic_atr_mult: float = 2.5      # for dynamic: range = +/- mult * ATR(recenter window)
    leverage: float = 1.0              # if > 1, capital_per_level treated as notional w/ leverage
    long_only: bool = True             # if True, sell levels only close existing inventory

    @property
    def levels(self) -> list[float]:
        """Linear grid between range_low and range_high (inclusive)."""
        if self.n_levels < 2: raise ValueError("n_levels must be >= 2")
        step = (self.range_high - self.range_low) / (self.n_levels - 1)
        return [self.range_low + i * step for i in range(self.n_levels)]


@dataclass
class GridState:
    cash: float
    inventory: float            # base asset units held
    avg_cost: float = 0.0       # avg cost basis of inventory
    realized_pnl: float = 0.0
    n_buys: int = 0
    n_sells: int = 0
    fees_paid: float = 0.0
    last_price: float = 0.0
    equity_curve: list[tuple[datetime, float]] = field(default_factory=list)
    peak_equity: float = 0.0
    max_dd_pct: float = 0.0
    # Active grid (mutable for dynamic mode)
    levels: list[float] = field(default_factory=list)
    range_low: float = 0.0
    range_high: float = 0.0
    # Track which level we last filled — useful for "place next order one level over"
    last_filled_idx: Optional[int] = None
    rebuilds: int = 0


def load_daily(symbol: str, days: int = 880) -> list[dict]:
    p = DATA_DIR / f"{symbol}_1D_{days}d.json"
    raw = json.loads(p.read_text())
    return sorted(raw, key=lambda c: int(c["start"]))


def simulate_grid(
    candles: list[dict],
    cfg: GridConfig,
) -> GridState:
    """
    Simulate a grid trader on a daily candle series.

    Per-bar fill detection: a grid level L is "crossed" by a bar if
    bar.low <= L <= bar.high. For each crossed level, we treat it as
    a single fill at price L (limit order assumed filled when touched).

    Grid logic:
      - At each fill of a buy level: buy `units = capital_per_level / L`,
        deduct cash, add inventory.
      - At each fill of a sell level: sell `units` (up to inventory).
        For long-only, sell qty = min(inventory, units).
      - Multiple levels filled in same bar are processed in price order
        appropriate to direction (low→high if bar went up, high→low if down).

    Long-only assumption (default): buys grow inventory, sells reduce it.
    No shorting below entry. If grid bottom hit and no buys remain, we
    just sit (acceptable behavior — we're "bagged" at the bottom).
    """
    state = GridState(cash=cfg.starting_cash, inventory=0.0,
                       peak_equity=cfg.starting_cash, last_price=0.0,
                       range_low=cfg.range_low, range_high=cfg.range_high,
                       levels=list(cfg.levels))

    fee_rate = cfg.maker_fee_pct / 100.0

    # For dynamic mode: track when to recenter
    recenter_window_high = []
    recenter_window_low = []

    for i, c in enumerate(candles):
        ts = datetime.fromtimestamp(int(c["start"]), tz=timezone.utc)
        bar_high = float(c["high"])
        bar_low = float(c["low"])
        bar_close = float(c["close"])
        bar_open = float(c["open"])

        # ---- Dynamic recenter ----
        if cfg.style == "dynamic":
            recenter_window_high.append(bar_high)
            recenter_window_low.append(bar_low)
            if len(recenter_window_high) > cfg.dynamic_recenter_bars:
                recenter_window_high.pop(0)
                recenter_window_low.pop(0)
            if i > 0 and i % cfg.dynamic_recenter_bars == 0 and len(recenter_window_high) >= cfg.dynamic_recenter_bars:
                # Recenter: use the recent window's high/low as new bounds
                new_low = min(recenter_window_low)
                new_high = max(recenter_window_high)
                # Add padding (ATR-like buffer)
                pad = (new_high - new_low) * 0.2
                new_low -= pad
                new_high += pad
                state.range_low = new_low
                state.range_high = new_high
                step = (new_high - new_low) / (cfg.n_levels - 1)
                state.levels = [new_low + j * step for j in range(cfg.n_levels)]
                state.rebuilds += 1

        # ---- Detect fills this bar ----
        # Levels touched by today's range
        crossed = [(j, L) for j, L in enumerate(state.levels) if bar_low <= L <= bar_high]
        if crossed:
            # Determine direction of the day based on close vs open — proxy for
            # which levels get hit first. If up day, low levels first; if down, high first.
            up_day = bar_close >= bar_open
            crossed.sort(key=lambda x: x[1], reverse=not up_day)
            # Up day: bar went low → high, low levels hit first (buys fire), then highs (sells)
            # Down day: bar went high → low, high levels first (sells fire), then lows (buys)
            for j, L in crossed:
                # Decide buy or sell based on relation to last_price and inventory.
                # For long-only grid: buy if price came from above (and we have cash),
                # sell if price came from below (and we have inventory at this level or higher).
                # Simpler model: buy levels are those below the bar's open; sell levels are above.
                if L < bar_open:
                    # Buy at level
                    units = cfg.capital_per_level / L
                    cost = units * L
                    fee = cost * fee_rate
                    if state.cash >= cost + fee:
                        new_inv_cost = state.avg_cost * state.inventory + cost
                        state.inventory += units
                        state.avg_cost = new_inv_cost / state.inventory if state.inventory > 0 else 0
                        state.cash -= (cost + fee)
                        state.fees_paid += fee
                        state.n_buys += 1
                        state.last_filled_idx = j
                else:
                    # Sell at level
                    units = cfg.capital_per_level / L
                    if cfg.long_only and state.inventory < units * 0.5:
                        continue
                    sell_qty = min(state.inventory, units)
                    if sell_qty <= 0:
                        continue
                    proceeds = sell_qty * L
                    fee = proceeds * fee_rate
                    pnl = sell_qty * (L - state.avg_cost)
                    state.realized_pnl += pnl
                    state.inventory -= sell_qty
                    state.cash += (proceeds - fee)
                    state.fees_paid += fee
                    state.n_sells += 1
                    state.last_filled_idx = j

        # ---- Mark-to-market equity ----
        state.last_price = bar_close
        equity = state.cash + state.inventory * bar_close
        state.equity_curve.append((ts, equity))
        if equity > state.peak_equity:
            state.peak_equity = equity
        dd = (equity - state.peak_equity) / state.peak_equity
        if dd < state.max_dd_pct:
            state.max_dd_pct = dd

    return state


def summarize(state: GridState, cfg: GridConfig, candles: list[dict], label: str) -> dict:
    n_days = len(candles)
    years = n_days / 365.0
    start_eq = cfg.starting_cash
    final_eq = state.equity_curve[-1][1] if state.equity_curve else start_eq
    total_pct = (final_eq / start_eq - 1) * 100
    annual_pct = ((final_eq / start_eq) ** (1 / years) - 1) * 100 if final_eq > 0 else -100
    n_roundtrips = min(state.n_buys, state.n_sells)
    avg_per_rt = state.realized_pnl / n_roundtrips if n_roundtrips else 0
    end_price = float(candles[-1]["close"])
    inv_value = state.inventory * end_price
    return {
        "label": label,
        "total_return_pct": round(total_pct, 2),
        "annual_return_pct": round(annual_pct, 2),
        "max_drawdown_pct": round(state.max_dd_pct * 100, 2),
        "n_buys": state.n_buys,
        "n_sells": state.n_sells,
        "n_roundtrips": n_roundtrips,
        "realized_pnl": round(state.realized_pnl, 2),
        "avg_per_roundtrip": round(avg_per_rt, 2),
        "fees_paid": round(state.fees_paid, 2),
        "ending_cash": round(state.cash, 2),
        "ending_inv_units": round(state.inventory, 6),
        "ending_inv_value": round(inv_value, 2),
        "ending_equity": round(final_eq, 2),
        "rebuilds": state.rebuilds,
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--symbol", type=str, default="BTC-PERP-INTX")
    p.add_argument("--days", type=int, default=880)
    p.add_argument("--range-low", type=float, required=True)
    p.add_argument("--range-high", type=float, required=True)
    p.add_argument("--n-levels", type=int, default=20)
    p.add_argument("--capital", type=float, default=10_000)
    p.add_argument("--capital-per-level", type=float, default=None,
                    help="If unset, equals capital / n_levels")
    p.add_argument("--style", type=str, choices=["static", "dynamic"], default="static")
    p.add_argument("--recenter-bars", type=int, default=60)
    p.add_argument("--maker-fee-pct", type=float, default=0.02)
    p.add_argument("--leverage", type=float, default=1.0)
    p.add_argument("--prebuy-pct", type=float, default=0.0,
                    help="%% of starting capital to pre-buy at bar 0 (lean-long hybrid).")
    p.add_argument("--label", type=str, default="grid")
    args = p.parse_args()

    cap_per = args.capital_per_level if args.capital_per_level else args.capital / args.n_levels
    cfg = GridConfig(
        range_low=args.range_low,
        range_high=args.range_high,
        n_levels=args.n_levels,
        capital_per_level=cap_per,
        maker_fee_pct=args.maker_fee_pct,
        starting_cash=args.capital,
        style=args.style,
        dynamic_recenter_bars=args.recenter_bars,
        leverage=args.leverage,
    )

    candles = load_daily(args.symbol, args.days)

    # Pre-buy logic: spend prebuy_pct of capital at bar-0 open to seed inventory.
    if args.prebuy_pct > 0:
        seed_cash = args.capital * (args.prebuy_pct / 100.0)
        open_price = float(candles[0]["open"])
        seed_units = seed_cash / open_price
        seed_fee = seed_cash * (args.maker_fee_pct / 100.0)
        cfg.starting_cash = args.capital - seed_cash - seed_fee
        # Inject into state by simulating "start with inventory"
        state = simulate_grid(candles, cfg)
        state.inventory += seed_units
        state.avg_cost = open_price
        # Recompute equity curve with seed inventory
        for i, (ts, eq) in enumerate(state.equity_curve):
            close_i = float(candles[i]["close"])
            new_eq = eq + seed_units * close_i
            state.equity_curve[i] = (ts, new_eq)
        # Recompute peak/dd from the augmented curve
        peak = state.equity_curve[0][1]
        max_dd = 0.0
        for ts, e in state.equity_curve:
            if e > peak: peak = e
            dd = (e - peak) / peak
            if dd < max_dd: max_dd = dd
        state.peak_equity = peak
        state.max_dd_pct = max_dd
    else:
        state = simulate_grid(candles, cfg)
    summary = summarize(state, cfg, candles, args.label)

    # Compute B&H benchmark for this period
    bh_start = float(candles[0]["close"])
    bh_end = float(candles[-1]["close"])
    bh_total = (bh_end / bh_start - 1) * 100
    bh_annual = ((bh_end / bh_start) ** (1 / (len(candles)/365)) - 1) * 100

    print(f"\n=== Grid Trade Result: {args.label} ===")
    print(f"  Symbol: {args.symbol}")
    print(f"  Window: {datetime.fromtimestamp(int(candles[0]['start']), tz=timezone.utc).date()} → "
          f"{datetime.fromtimestamp(int(candles[-1]['start']), tz=timezone.utc).date()}")
    print(f"  Range: ${args.range_low:,.0f} - ${args.range_high:,.0f}, {args.n_levels} levels, "
          f"${cap_per:,.2f}/level, style={args.style}")
    print(f"  Start ${cfg.starting_cash:,.0f} → End ${summary['ending_equity']:,.2f}")
    print(f"  Total return: {summary['total_return_pct']:+.1f}% (annualized {summary['annual_return_pct']:+.1f}%)")
    print(f"  Max DD: {summary['max_drawdown_pct']:+.1f}%")
    print(f"  Trades: {summary['n_buys']} buys / {summary['n_sells']} sells "
          f"= {summary['n_roundtrips']} round-trips, avg ${summary['avg_per_roundtrip']:+.2f}/rt")
    print(f"  Fees paid: ${summary['fees_paid']:,.2f}")
    print(f"  Realized P&L: ${summary['realized_pnl']:+.2f}")
    print(f"  Ending: cash ${summary['ending_cash']:,.2f} + inv {summary['ending_inv_units']:.6f}"
          f" units @ ${bh_end:,.0f} = ${summary['ending_inv_value']:,.2f}")
    print(f"  B&H benchmark: {bh_total:+.1f}% (annualized {bh_annual:+.1f}%)")


if __name__ == "__main__":
    main()
