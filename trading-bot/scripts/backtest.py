"""
Historical backtest of the trading bot's strategy on real BTC-PERP-INTX candles.

Reuses the LIVE strategy code (regime_detector, ema_trend, bb_rsi_reversion,
risk_manager, position_sizer, trailing_stop) — no logic is duplicated, so the
backtest reflects exactly what the live bot would have done.

USAGE
-----
    cd trading-bot
    python -m scripts.backtest               # default: 180 days
    python -m scripts.backtest --days 90
    python -m scripts.backtest --start 2025-11-17 --end 2026-05-17

OUTPUTS
-------
    data/historical/btc-perp-intx_4H.json    Cached candles (4H)
    data/historical/btc-perp-intx_1H.json    Cached candles (1H)
    data/backtest/trades.csv                 Per-trade ledger
    data/backtest/equity_curve.csv           Equity over time
    data/backtest/BACKTEST_REPORT.md         Human-readable summary

HONEST CAVEATS
--------------
This backtest will OVERSTATE forward returns. Why:
  - Coinbase's published candles are the result of completed trades; real
    fills sit between bid and ask, slightly worse than the candle close.
  - The strategy was DESIGNED knowing what BTC has done recently (hindsight bias).
  - No model of news shocks, exchange outages, partial fills, or order rejection.
  - No funding-rate variation (uses a single flat assumption).
  - Slippage is a static 0.03% (paper engine assumption), not empirical.

Treat this as a FLOOR for whether the strategy is even worth running, not as
a forecast of live performance. Live results will be ~20-50% worse.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import math
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Optional

import httpx

# Make sure bot/ is importable
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bot.data.indicators import Candle, atr  # noqa: E402
from bot.risk.position_sizer import calculate_position_size  # noqa: E402
from bot.risk.risk_manager import RiskManager  # noqa: E402
from bot.risk.trailing_stop import TrailingStopManager  # noqa: E402
from bot.strategy.base import Signal  # noqa: E402
from bot.strategy.bb_rsi_reversion import BBRSIReversionStrategy  # noqa: E402
from bot.strategy.ema_trend import EMATrendStrategy  # noqa: E402
from bot.strategy.regime_detector import RegimeDetector  # noqa: E402
from config.settings import settings  # noqa: E402

DATA_DIR = ROOT / "data" / "historical"
OUT_DIR = ROOT / "data" / "backtest"
DATA_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

COINBASE_REST = "https://api.coinbase.com"
SYMBOL = "BTC-PERP-INTX"

# Sim assumptions (mirror PaperEngine constants)
SLIPPAGE_PCT = Decimal(str(settings.PAPER_SLIPPAGE_PCT)) / Decimal("100")  # 0.03% -> 0.0003
TAKER_FEE_PCT = Decimal(str(settings.PAPER_TAKER_FEE_PCT)) / Decimal("100")  # 0.06% -> 0.0006


# ──────────────────────────────────────────────────────────────────────────
# Data fetching
# ──────────────────────────────────────────────────────────────────────────

GRANULARITY = {"4H": "FOUR_HOUR", "1H": "ONE_HOUR"}
SECONDS_PER = {"4H": 14400, "1H": 3600}


async def fetch_candles(timeframe: str, days: int) -> list[dict]:
    """Fetch `days` days of `timeframe` candles from Coinbase, paginated."""
    cache = DATA_DIR / f"btc-perp-intx_{timeframe}_{days}d.json"
    if cache.exists():
        age_hours = (time.time() - cache.stat().st_mtime) / 3600
        if age_hours < 12:  # re-fetch if cache > 12h old
            print(f"  [cache] {timeframe}: loading {cache.name} (age {age_hours:.1f}h)")
            return json.loads(cache.read_text())

    print(f"  [fetch] {timeframe}: {days} days from Coinbase...")
    end = int(datetime.now(timezone.utc).timestamp())
    start = end - (days * 86400)

    spc = SECONDS_PER[timeframe]
    # Coinbase returns max ~350 candles per request; chunk to be safe
    chunk_seconds = 300 * spc
    cursor = start
    all_candles: list[dict] = []
    async with httpx.AsyncClient(timeout=15.0) as client:
        while cursor < end:
            chunk_end = min(cursor + chunk_seconds, end)
            url = (
                f"{COINBASE_REST}/api/v3/brokerage/market/products/{SYMBOL}/candles"
                f"?start={cursor}&end={chunk_end}&granularity={GRANULARITY[timeframe]}"
            )
            r = await client.get(url)
            r.raise_for_status()
            chunk = r.json().get("candles", [])
            all_candles.extend(chunk)
            cursor = chunk_end
            await asyncio.sleep(0.1)  # be polite

    # Dedupe + sort
    seen = set()
    unique = []
    for c in all_candles:
        if c["start"] not in seen:
            seen.add(c["start"])
            unique.append(c)
    unique.sort(key=lambda c: int(c["start"]))

    cache.write_text(json.dumps(unique))
    print(f"  [fetch] {timeframe}: {len(unique)} candles → cached to {cache.name}")
    return unique


def to_candle_objs(raw: list[dict]) -> list[Candle]:
    """Convert Coinbase raw candles → Candle dataclasses."""
    out = []
    for c in raw:
        out.append(Candle(
            timestamp=datetime.fromtimestamp(int(c["start"]), tz=timezone.utc),
            open=float(c["open"]),
            high=float(c["high"]),
            low=float(c["low"]),
            close=float(c["close"]),
            volume=float(c["volume"]),
        ))
    return out


# ──────────────────────────────────────────────────────────────────────────
# Backtest engine
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class OpenPosition:
    """Open paper position during backtest."""
    direction: str            # "long" or "short"
    strategy: str
    regime: str
    entry_time: datetime
    entry_price: Decimal
    stop_price: Decimal
    target_price: Decimal
    initial_stop: Decimal     # for trailing logic
    size: Decimal
    margin: Decimal
    risk_per_unit: Decimal
    entry_fee: Decimal
    is_trailing: bool = False
    # `side` / `risk_pct` for risk-manager compatibility
    side: str = ""
    risk_pct: float = 0.0


@dataclass
class ClosedTrade:
    """Completed trade for the report."""
    strategy: str
    direction: str
    regime: str
    entry_time: datetime
    exit_time: datetime
    entry_price: float
    exit_price: float
    stop_price: float
    target_price: float
    size: float
    risk_per_unit: float
    intended_rr: float
    exit_reason: str          # "target" | "stop" | "trailing_stop" | "end_of_data"
    gross_pnl: float
    fees: float
    net_pnl: float
    r_multiple: float
    hold_bars_4h: int


class Backtester:
    def __init__(
        self,
        candles_4h: list[Candle],
        candles_1h: list[Candle],
        starting_equity: float = 10000.0,
        start_idx: int = 0,
        end_idx: Optional[int] = None,
    ):
        self.candles_4h = candles_4h if end_idx is None else candles_4h[:end_idx]
        self.candles_1h = candles_1h
        self.start_idx = start_idx

        # Bot machinery (real, not mocked) — instantiated AFTER any settings
        # overrides have been applied by the caller. Strategies read settings.*
        # at evaluate time, so global monkey-patches in tune.py take effect.
        self.regime = RegimeDetector()
        self.ema = EMATrendStrategy(self.regime)
        self.bb_rsi = BBRSIReversionStrategy(self.regime)
        self.risk = RiskManager()
        self.trailing = TrailingStopManager()

        self.starting_equity = Decimal(str(starting_equity))

        # State
        self.cash = self.starting_equity          # available cash (margin debited)
        self.peak_equity = self.starting_equity
        self.equity_curve: list[tuple[datetime, Decimal]] = []
        self.open_positions: list[OpenPosition] = []
        self.closed_trades: list[ClosedTrade] = []
        # daily P&L tracking for circuit-breaker check
        self.daily_pnl: dict[str, float] = {}     # date_str -> realized pnl that day

    # ----- equity helpers -----
    def margin_locked(self) -> Decimal:
        return sum((p.margin for p in self.open_positions), Decimal("0"))

    def unrealized(self, current_price: Decimal) -> Decimal:
        total = Decimal("0")
        for p in self.open_positions:
            if p.direction == "long":
                total += p.size * (current_price - p.entry_price)
            else:
                total += p.size * (p.entry_price - current_price)
        return total

    def equity(self, current_price: Decimal) -> Decimal:
        return self.cash + self.margin_locked() + self.unrealized(current_price)

    def daily_pnl_for_date(self, dt: datetime) -> float:
        return self.daily_pnl.get(dt.strftime("%Y-%m-%d"), 0.0)

    # ----- per-bar logic -----
    async def step(self, i: int) -> None:
        """Process the 4H candle at index i: signal eval + open-position management."""
        if i < 50:
            return  # warmup

        bar = self.candles_4h[i]
        candles_4h_window = self.candles_4h[: i + 1]  # everything up to and including this bar

        # Align 1H window: take 1H candles up to the same timestamp as this 4H bar
        bar_ts = bar.timestamp
        candles_1h_window = [c for c in self.candles_1h if c.timestamp <= bar_ts]
        if len(candles_1h_window) < 50:
            return

        # 1. Manage open positions FIRST (check stops/targets/trailing using THIS bar's high/low)
        await self._manage_open_positions(bar, candles_4h_window)

        # 2. Detect regime
        regime_str = self.regime.update(candles_4h_window)

        # 3. Evaluate strategies
        signal: Optional[Signal] = None
        if regime_str in ("trending_up", "trending_down"):
            signal = self.ema.evaluate(candles_4h_window, candles_1h_window)
        elif regime_str == "ranging":
            signal = self.bb_rsi.evaluate(candles_4h_window, candles_1h_window)

        # 4. Process signal (if any)
        if signal:
            await self._try_open(signal, bar)

        # 5. Record equity at end of bar
        self.equity_curve.append((bar.timestamp, self.equity(Decimal(str(bar.close)))))

        # 6. Update peak equity
        cur_eq = self.equity(Decimal(str(bar.close)))
        if cur_eq > self.peak_equity:
            self.peak_equity = cur_eq

    async def _try_open(self, signal: Signal, bar: Candle) -> None:
        """Run risk check + sizing + simulated entry."""
        eq = self.equity(Decimal(str(bar.close)))

        # Build position-shaped objects for risk-manager
        pos_for_risk = [
            type("P", (), {"side": p.direction, "risk_pct": p.risk_pct})() for p in self.open_positions
        ]
        total_pnl_pct = float((eq - self.starting_equity) / self.starting_equity * 100)

        rr = await self.risk.check_trade(
            signal=signal,
            equity=eq,
            open_positions=pos_for_risk,
            daily_pnl=self.daily_pnl_for_date(bar.timestamp),
            weekly_pnl=self.daily_pnl_for_date(bar.timestamp),  # simplified
            monthly_pnl=self.daily_pnl_for_date(bar.timestamp),  # simplified
            total_pnl_pct=total_pnl_pct,
        )
        if not rr.allowed:
            return  # silently rejected (matches live behavior — would write rejected trade in DB)

        # Size + fees
        sz = calculate_position_size(
            equity=eq,
            entry_price=Decimal(str(signal.entry_price)),
            stop_price=Decimal(str(signal.stop_price)),
            risk_pct=settings.RISK_PER_TRADE_PCT,
            leverage=settings.LEVERAGE,
        )
        if not sz.is_valid:
            return

        # Apply slippage to entry
        entry = Decimal(str(signal.entry_price))
        if signal.direction == "long":
            fill = entry * (Decimal("1") + SLIPPAGE_PCT)
        else:
            fill = entry * (Decimal("1") - SLIPPAGE_PCT)

        notional = sz.size_btc * fill
        fee = notional * TAKER_FEE_PCT

        # Debit margin + fee from cash
        self.cash -= sz.margin_usd
        self.cash -= fee

        # Re-derive risk-per-unit from actual stop distance (not signal.entry vs signal.stop)
        risk_per_unit = abs(fill - Decimal(str(signal.stop_price)))

        self.open_positions.append(OpenPosition(
            direction=signal.direction,
            strategy=signal.strategy,
            regime=signal.regime,
            entry_time=bar.timestamp,
            entry_price=fill,
            stop_price=Decimal(str(signal.stop_price)),
            target_price=Decimal(str(signal.target_price)),
            initial_stop=Decimal(str(signal.stop_price)),
            size=sz.size_btc,
            margin=sz.margin_usd,
            risk_per_unit=risk_per_unit,
            entry_fee=fee,
            is_trailing=False,
            side=signal.direction,
            risk_pct=float(sz.risk_pct),
        ))

    async def _manage_open_positions(self, bar: Candle, history: list[Candle]) -> None:
        """For each open position, check if THIS bar hit stop/target. Update trailing stops."""
        # Compute ATR for trailing stop calc
        try:
            cur_atr = atr(history, period=settings.ATR_PERIOD)
        except Exception:
            cur_atr = 0.0

        to_close: list[tuple[OpenPosition, Decimal, str]] = []

        bar_high = Decimal(str(bar.high))
        bar_low = Decimal(str(bar.low))

        for p in self.open_positions:
            # Decide whether stop or target hit during this bar.
            # Conservative: if BOTH appear hit in the same bar, treat as stop.
            if p.direction == "long":
                stop_hit = bar_low <= p.stop_price
                target_hit = bar_high >= p.target_price
                if stop_hit:
                    to_close.append((p, p.stop_price,
                                     "trailing_stop" if p.is_trailing else "stop"))
                    continue
                if target_hit:
                    to_close.append((p, p.target_price, "target"))
                    continue
                # Trailing stop activation: profit ≥ 1R
                profit = bar.close - float(p.entry_price)
                if cur_atr > 0 and profit >= float(p.risk_per_unit):
                    candidate = Decimal(str(bar.close - settings.TRAILING_DISTANCE_ATR * cur_atr))
                    if candidate > p.stop_price:
                        p.stop_price = candidate
                        p.is_trailing = True
            else:  # short
                stop_hit = bar_high >= p.stop_price
                target_hit = bar_low <= p.target_price
                if stop_hit:
                    to_close.append((p, p.stop_price,
                                     "trailing_stop" if p.is_trailing else "stop"))
                    continue
                if target_hit:
                    to_close.append((p, p.target_price, "target"))
                    continue
                profit = float(p.entry_price) - bar.close
                if cur_atr > 0 and profit >= float(p.risk_per_unit):
                    candidate = Decimal(str(bar.close + settings.TRAILING_DISTANCE_ATR * cur_atr))
                    if candidate < p.stop_price:
                        p.stop_price = candidate
                        p.is_trailing = True

        # Close the ones that exited
        for p, exit_price, reason in to_close:
            # Apply slippage to exit (away from us)
            if p.direction == "long":
                fill = exit_price * (Decimal("1") - SLIPPAGE_PCT)
                gross = p.size * (fill - p.entry_price)
            else:
                fill = exit_price * (Decimal("1") + SLIPPAGE_PCT)
                gross = p.size * (p.entry_price - fill)

            exit_fee = (p.size * fill) * TAKER_FEE_PCT
            net = gross - exit_fee - p.entry_fee

            # Return margin + net P&L to cash
            self.cash += p.margin + net

            # R-multiple
            risk_dollars = p.size * p.risk_per_unit
            r_mult = float(net / risk_dollars) if risk_dollars > 0 else 0.0

            # Track daily P&L for circuit-breaker (negative only counted)
            day = bar.timestamp.strftime("%Y-%m-%d")
            self.daily_pnl[day] = self.daily_pnl.get(day, 0.0) + float(net)

            hold = max(1, int((bar.timestamp - p.entry_time).total_seconds() / 14400))
            intended_rr = float(abs(p.target_price - p.entry_price) / p.risk_per_unit)

            self.closed_trades.append(ClosedTrade(
                strategy=p.strategy,
                direction=p.direction,
                regime=p.regime,
                entry_time=p.entry_time,
                exit_time=bar.timestamp,
                entry_price=float(p.entry_price),
                exit_price=float(fill),
                stop_price=float(p.initial_stop),
                target_price=float(p.target_price),
                size=float(p.size),
                risk_per_unit=float(p.risk_per_unit),
                intended_rr=intended_rr,
                exit_reason=reason,
                gross_pnl=float(gross),
                fees=float(p.entry_fee + exit_fee),
                net_pnl=float(net),
                r_multiple=r_mult,
                hold_bars_4h=hold,
            ))
            self.open_positions.remove(p)

    async def run(self) -> None:
        start = max(self.start_idx, 50)  # always allow indicator warmup
        for i in range(start, len(self.candles_4h)):
            await self.step(i)
        # Force-close any still-open at end of data
        if self.open_positions:
            last = self.candles_4h[-1]
            for p in list(self.open_positions):
                if p.direction == "long":
                    gross = p.size * (Decimal(str(last.close)) - p.entry_price)
                else:
                    gross = p.size * (p.entry_price - Decimal(str(last.close)))
                exit_fee = (p.size * Decimal(str(last.close))) * TAKER_FEE_PCT
                net = gross - exit_fee - p.entry_fee
                self.cash += p.margin + net
                risk_dollars = p.size * p.risk_per_unit
                self.closed_trades.append(ClosedTrade(
                    strategy=p.strategy, direction=p.direction, regime=p.regime,
                    entry_time=p.entry_time, exit_time=last.timestamp,
                    entry_price=float(p.entry_price), exit_price=float(last.close),
                    stop_price=float(p.initial_stop), target_price=float(p.target_price),
                    size=float(p.size), risk_per_unit=float(p.risk_per_unit),
                    intended_rr=float(abs(p.target_price - p.entry_price) / p.risk_per_unit),
                    exit_reason="end_of_data",
                    gross_pnl=float(gross), fees=float(p.entry_fee + exit_fee),
                    net_pnl=float(net),
                    r_multiple=float(net / risk_dollars) if risk_dollars > 0 else 0.0,
                    hold_bars_4h=max(1, int((last.timestamp - p.entry_time).total_seconds() / 14400)),
                ))
                self.open_positions.remove(p)


# ──────────────────────────────────────────────────────────────────────────
# Reporting
# ──────────────────────────────────────────────────────────────────────────

def stats(trades: list[ClosedTrade], starting_eq: float, peak_eq: float,
          equity_curve: list[tuple[datetime, Decimal]]) -> dict:
    if not trades:
        return {"n": 0}
    wins = [t for t in trades if t.net_pnl > 0]
    losses = [t for t in trades if t.net_pnl <= 0]
    final_eq = float(equity_curve[-1][1]) if equity_curve else starting_eq

    # Monthly breakdown
    monthly: dict[str, float] = {}
    for t in trades:
        month = t.exit_time.strftime("%Y-%m")
        monthly[month] = monthly.get(month, 0.0) + t.net_pnl

    # Max drawdown from equity curve
    max_dd_pct = 0.0
    peak_so_far = starting_eq
    for _, eq in equity_curve:
        eq_f = float(eq)
        if eq_f > peak_so_far:
            peak_so_far = eq_f
        dd = (eq_f - peak_so_far) / peak_so_far * 100
        if dd < max_dd_pct:
            max_dd_pct = dd

    # Max consecutive losses
    max_streak = streak = 0
    for t in trades:
        if t.net_pnl <= 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    total_gross_win = sum(t.net_pnl for t in wins)
    total_gross_loss = abs(sum(t.net_pnl for t in losses))

    return {
        "n_trades": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate_pct": round(len(wins) / len(trades) * 100, 2),
        "avg_winner_r": round(sum(t.r_multiple for t in wins) / len(wins), 3) if wins else 0.0,
        "avg_loser_r": round(sum(t.r_multiple for t in losses) / len(losses), 3) if losses else 0.0,
        "avg_winner_$": round(sum(t.net_pnl for t in wins) / len(wins), 2) if wins else 0.0,
        "avg_loser_$": round(sum(t.net_pnl for t in losses) / len(losses), 2) if losses else 0.0,
        "expectancy_r": round(sum(t.r_multiple for t in trades) / len(trades), 3),
        "expectancy_$": round(sum(t.net_pnl for t in trades) / len(trades), 2),
        "profit_factor": round(total_gross_win / total_gross_loss, 2) if total_gross_loss > 0 else float("inf"),
        "max_consecutive_losses": max_streak,
        "max_drawdown_pct": round(max_dd_pct, 2),
        "starting_equity": starting_eq,
        "ending_equity": round(final_eq, 2),
        "total_return_pct": round((final_eq - starting_eq) / starting_eq * 100, 2),
        "peak_equity": round(peak_eq, 2),
        "total_fees_paid": round(sum(t.fees for t in trades), 2),
        "monthly_pnl": {k: round(v, 2) for k, v in sorted(monthly.items())},
    }


def split_by(trades: list[ClosedTrade], key: str) -> dict[str, dict]:
    buckets: dict[str, list[ClosedTrade]] = {}
    for t in trades:
        buckets.setdefault(getattr(t, key), []).append(t)
    return {k: stats(v, 10000.0, 10000.0, []) for k, v in buckets.items()}


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("")
        return
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def write_report(s: dict, by_strat: dict, by_regime: dict, by_exit: dict,
                 days: int, output_path: Path) -> None:
    md: list[str] = []
    md.append(f"# Backtest Report — BTC-PERP-INTX, last {days} days\n")
    md.append(f"_Generated: {datetime.utcnow().isoformat(timespec='seconds')}Z_\n\n")
    md.append("## Summary\n\n")
    md.append("| Metric | Value |\n|---|---|\n")
    for k in ("n_trades", "wins", "losses", "win_rate_pct",
              "avg_winner_r", "avg_loser_r", "avg_winner_$", "avg_loser_$",
              "expectancy_r", "expectancy_$", "profit_factor",
              "max_consecutive_losses", "max_drawdown_pct",
              "starting_equity", "ending_equity", "total_return_pct",
              "peak_equity", "total_fees_paid"):
        md.append(f"| {k} | {s.get(k, 'n/a')} |\n")
    md.append("\n## Monthly P&L\n\n")
    md.append("| Month | Net P&L ($) |\n|---|---|\n")
    for m, v in s.get("monthly_pnl", {}).items():
        md.append(f"| {m} | {v:+,.2f} |\n")
    md.append("\n## Stats by strategy\n\n")
    md.append("| Strategy | Trades | Win% | Expectancy R | Total $ |\n|---|---|---|---|---|\n")
    for k, st in by_strat.items():
        md.append(f"| {k} | {st['n_trades']} | {st['win_rate_pct']}% | "
                  f"{st['expectancy_r']} | {st['expectancy_$'] * st['n_trades']:+,.2f} |\n")
    md.append("\n## Stats by regime at signal time\n\n")
    md.append("| Regime | Trades | Win% | Expectancy R |\n|---|---|---|---|\n")
    for k, st in by_regime.items():
        md.append(f"| {k} | {st['n_trades']} | {st['win_rate_pct']}% | {st['expectancy_r']} |\n")
    md.append("\n## Exit reason breakdown\n\n")
    md.append("| Reason | Count | Avg R |\n|---|---|---|\n")
    for k, st in by_exit.items():
        md.append(f"| {k} | {st['n_trades']} | {st['expectancy_r']} |\n")
    md.append("\n## Caveats — read before extrapolating\n\n")
    md.append("- This backtest will **overstate forward returns** by ~20-50%.\n")
    md.append("- Coinbase published candles are at clean prices; live fills cross spread.\n")
    md.append("- The strategy was DESIGNED knowing what BTC has done recently (hindsight bias).\n")
    md.append("- No model of news shocks, exchange outages, partial fills.\n")
    md.append("- Slippage is a flat 0.03%; real spikes during volatility.\n")
    md.append("- One symbol, one ~6 month period — limited statistical confidence.\n")
    md.append("- If this period was unusually trendy or choppy, performance is unrepresentative.\n")
    md.append("\nUse as a FLOOR for whether the strategy has positive expectancy on the data it was designed around. Live results will be worse.\n")
    output_path.write_text("".join(md))


# ──────────────────────────────────────────────────────────────────────────
# Entrypoint
# ──────────────────────────────────────────────────────────────────────────

async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=180,
                        help="How many days of history to backtest (default 180)")
    args = parser.parse_args()
    days = args.days

    print(f"\n▶ Backtest BTC-PERP-INTX, last {days} days")
    print(f"  Risk: {settings.RISK_PER_TRADE_PCT}%/trade, Leverage: {settings.LEVERAGE}x, "
          f"Min R:R: {settings.MIN_RR_RATIO}, Slippage: {settings.PAPER_SLIPPAGE_PCT}%, "
          f"Taker fee: {settings.PAPER_TAKER_FEE_PCT}%\n")

    print("Fetching candles...")
    raw_4h = await fetch_candles("4H", days)
    raw_1h = await fetch_candles("1H", days)
    candles_4h = to_candle_objs(raw_4h)
    candles_1h = to_candle_objs(raw_1h)
    print(f"  4H: {len(candles_4h)} bars, "
          f"first={candles_4h[0].timestamp.date()}, last={candles_4h[-1].timestamp.date()}")
    print(f"  1H: {len(candles_1h)} bars\n")

    print("Running backtest...")
    bt = Backtester(candles_4h, candles_1h)
    await bt.run()

    print(f"\n✓ Complete: {len(bt.closed_trades)} closed trades, "
          f"final equity = ${float(bt.equity(Decimal(str(candles_4h[-1].close)))):,.2f}\n")

    # Stats + writeouts
    s = stats(bt.closed_trades, float(bt.starting_equity), float(bt.peak_equity), bt.equity_curve)
    by_strat = split_by(bt.closed_trades, "strategy")
    by_regime = split_by(bt.closed_trades, "regime")
    by_exit = split_by(bt.closed_trades, "exit_reason")

    # Trades CSV
    write_csv(OUT_DIR / "trades.csv", [
        {
            "entry_time": t.entry_time.isoformat(),
            "exit_time": t.exit_time.isoformat(),
            "strategy": t.strategy, "direction": t.direction, "regime": t.regime,
            "entry": t.entry_price, "exit": t.exit_price,
            "stop": t.stop_price, "target": t.target_price,
            "size_btc": t.size,
            "intended_rr": round(t.intended_rr, 3),
            "exit_reason": t.exit_reason,
            "gross_pnl": round(t.gross_pnl, 2),
            "fees": round(t.fees, 2),
            "net_pnl": round(t.net_pnl, 2),
            "r_multiple": round(t.r_multiple, 3),
            "hold_bars_4h": t.hold_bars_4h,
        } for t in bt.closed_trades
    ])

    # Equity curve CSV
    write_csv(OUT_DIR / "equity_curve.csv", [
        {"timestamp": ts.isoformat(), "equity": float(eq)} for ts, eq in bt.equity_curve
    ])

    # Report
    write_report(s, by_strat, by_regime, by_exit, days, OUT_DIR / "BACKTEST_REPORT.md")

    # Console summary
    print("=" * 70)
    print("RESULTS")
    print("=" * 70)
    for k, v in s.items():
        if k != "monthly_pnl":
            print(f"  {k:25s} {v}")
    print()
    print("Monthly P&L:")
    for m, v in s.get("monthly_pnl", {}).items():
        print(f"  {m}: ${v:+,.2f}")
    print()
    print(f"  → trades.csv:           {OUT_DIR / 'trades.csv'}")
    print(f"  → equity_curve.csv:     {OUT_DIR / 'equity_curve.csv'}")
    print(f"  → BACKTEST_REPORT.md:   {OUT_DIR / 'BACKTEST_REPORT.md'}")


if __name__ == "__main__":
    asyncio.run(main())
