"""
v2 Backtest harness — multi-symbol, multi-engine, 1H primary timeframe.

PHASE 2 GATE: runs the proposed v2 strategy on 880 days of BTC + ETH 1H + 15m
data, computes annual return, win rate, profit factor, max drawdown, and
walk-forward consistency. If pass criteria fail, the v2 production build
does NOT proceed.

USAGE
-----
    cd trading-bot
    python -m scripts.backtest_v2 --days 880
    python -m scripts.backtest_v2 --days 880 --symbols BTC-PERP-INTX
    python -m scripts.backtest_v2 --days 880 --engines ema_trend_v2

PASS CRITERIA (all must hold)
-----------------------------
    - Annualized return on TUNE window  (first 70%) > 15%
    - Annualized return on VALIDATE window (last 30%) > 10%
    - Profit factor on both windows > 1.3
    - Max drawdown on either window < 30%
    - At least 100 closed trades total
    - Both engines have positive expectancy individually (else single-engine)

OUTPUTS
-------
    data/historical/v2/<symbol>_<tf>_<days>d.json   cached candles
    data/backtest_v2/trades.csv                     full trade ledger
    data/backtest_v2/equity_curve.csv               equity per timestamp
    data/backtest_v2/REPORT.md                      human report w/ verdict
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Optional

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bot.data.indicators import Candle  # noqa: E402
from scripts.v2_engines.ema_trend_v2 import EMATrendV2, V2Signal  # noqa: E402
from scripts.v2_engines.bb_squeeze import BBSqueezeV2  # noqa: E402
from scripts.v2_engines.donchian_breakout import DonchianBreakoutV2  # noqa: E402
from scripts.v2_engines.daily_trend import DailyTrendV2  # noqa: E402

DATA_DIR = ROOT / "data" / "historical" / "v2"
OUT_DIR = ROOT / "data" / "backtest_v2"
DATA_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

COINBASE_REST = "https://api.coinbase.com"

# v2 sim params — see plan
RISK_PER_TRADE_PCT = 2.0
LEVERAGE = 4.0
MAX_MARGIN_USAGE_PCT = 25.0
MAX_CONCURRENT_POSITIONS = 4
SLIPPAGE_PCT = 0.03 / 100   # 0.03%
TAKER_FEE_PCT = 0.06 / 100  # 0.06%
STOP_LIMIT_SLIPPAGE_PCT = 0.5 / 100  # 0.5% gap protection (applied to stop fill price)


GRANULARITY = {
    "1H": "ONE_HOUR", "15m": "FIFTEEN_MINUTE", "4H": "FOUR_HOUR",
    "1D": "ONE_DAY", "6H": "SIX_HOUR",
}
SECONDS_PER = {"1H": 3600, "15m": 900, "4H": 14400, "1D": 86400, "6H": 21600}


# ──────────────────────────────────────────────────────────────────────────
# Data fetching
# ──────────────────────────────────────────────────────────────────────────

async def fetch_candles(symbol: str, timeframe: str, days: int) -> list[dict]:
    cache = DATA_DIR / f"{symbol}_{timeframe}_{days}d.json"
    if cache.exists():
        age_hours = (time.time() - cache.stat().st_mtime) / 3600
        if age_hours < 24:
            print(f"  [cache] {symbol} {timeframe}: loading (age {age_hours:.1f}h)")
            return json.loads(cache.read_text())

    print(f"  [fetch] {symbol} {timeframe}: {days} days from Coinbase...")
    end = int(datetime.now(timezone.utc).timestamp())
    start = end - (days * 86400)
    spc = SECONDS_PER[timeframe]
    chunk_seconds = 300 * spc  # Coinbase returns max ~350 candles per request
    cursor = start
    all_c: list[dict] = []
    async with httpx.AsyncClient(timeout=20.0) as client:
        while cursor < end:
            chunk_end = min(cursor + chunk_seconds, end)
            url = (
                f"{COINBASE_REST}/api/v3/brokerage/market/products/{symbol}/candles"
                f"?start={cursor}&end={chunk_end}&granularity={GRANULARITY[timeframe]}"
            )
            try:
                r = await client.get(url)
                r.raise_for_status()
                chunk = r.json().get("candles", [])
                all_c.extend(chunk)
            except httpx.HTTPStatusError as e:
                print(f"  [warn] {symbol} {timeframe}: HTTP {e.response.status_code} on chunk {cursor}")
            cursor = chunk_end
            await asyncio.sleep(0.1)

    seen = set()
    unique = []
    for c in all_c:
        if c["start"] not in seen:
            seen.add(c["start"])
            unique.append(c)
    unique.sort(key=lambda c: int(c["start"]))
    cache.write_text(json.dumps(unique))
    print(f"  [fetch] {symbol} {timeframe}: {len(unique)} candles cached")
    return unique


def to_candle_objs(raw: list[dict]) -> list[Candle]:
    return [
        Candle(
            timestamp=datetime.fromtimestamp(int(c["start"]), tz=timezone.utc),
            open=float(c["open"]),
            high=float(c["high"]),
            low=float(c["low"]),
            close=float(c["close"]),
            volume=float(c["volume"]),
        )
        for c in raw
    ]


# ──────────────────────────────────────────────────────────────────────────
# Position + trade record
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class OpenPosition:
    symbol: str
    engine: str
    direction: str
    entry_time: datetime
    entry_price: Decimal
    stop_price: Decimal
    target_price: Decimal
    initial_stop: Decimal
    size: Decimal
    margin: Decimal
    risk_per_unit: Decimal
    entry_fee: Decimal
    # ── trailing-stop fields (added for trend-following strategies) ──
    # trail_pct = 0 means no trailing stop; the existing fixed stop/target apply.
    # trail_pct > 0 means: track highest_since_entry (or lowest for shorts) and
    # exit when price retraces by trail_pct from that extreme.
    trail_pct: float = 0.0
    extreme_since_entry: Decimal = Decimal("0")  # high-water for long, low-water for short


@dataclass
class ClosedTrade:
    symbol: str
    engine: str
    direction: str
    regime: str
    entry_time: datetime
    exit_time: datetime
    entry_price: float
    exit_price: float
    stop_price: float
    target_price: float
    size: float
    intended_rr: float
    exit_reason: str        # target / stop / end_of_data
    gross_pnl: float
    fees: float
    net_pnl: float
    r_multiple: float
    hold_bars: int


# ──────────────────────────────────────────────────────────────────────────
# Backtester
# ──────────────────────────────────────────────────────────────────────────

class BacktesterV2:
    def __init__(
        self,
        candles_by_symbol: dict[str, dict[str, list[Candle]]],
        symbols: list[str],
        engines: list[str],
        starting_equity: float = 10000.0,
        primary_tf: str = "1H",
        confirm_tf: str = "15m",
        variant: str = "iter-d",
        daily_mode: str = "donchian-20",
        daily_trail_pct: float = 12.0,
        allow_shorts: bool = False,
    ):
        # candles_by_symbol[symbol][primary_tf] / [confirm_tf]
        self.candles = candles_by_symbol
        self.symbols = symbols
        self.engines_used = engines
        self.primary_tf = primary_tf
        self.confirm_tf = confirm_tf

        # Strategy instances — params depend on variant
        if variant == "v1-like":
            # v1 production parameters (matches bot/strategy/ema_trend.py)
            self.ema_engine = EMATrendV2(
                min_adx=35.0,
                atr_stop_multiplier=1.5,
                body_ratio_min=0.5,
                pullback_tolerance_pct=0.2,
                min_rr_ratio=2.0,
                min_stop_distance_pct=0.5,
                min_ema_slope_pct=0.0,  # disable iter-B slope filter (not in v1)
            )
        else:  # iter-d (default)
            self.ema_engine = EMATrendV2()  # uses iter-D defaults
        self.bb_engine = BBSqueezeV2()
        self.donchian_engine = DonchianBreakoutV2()

        # Daily trend engine — configured per CLI variant
        if daily_mode == "donchian-20":
            self.daily_trend_engine = DailyTrendV2(
                mode="donchian", channel_period=20, trail_pct=daily_trail_pct,
                allow_shorts=allow_shorts,
            )
        elif daily_mode == "donchian-55":
            self.daily_trend_engine = DailyTrendV2(
                mode="donchian", channel_period=55, trail_pct=daily_trail_pct,
                allow_shorts=allow_shorts,
            )
        elif daily_mode == "ma-cross":
            self.daily_trend_engine = DailyTrendV2(
                mode="ma_cross", ma_fast=20, ma_slow=50, trail_pct=daily_trail_pct,
                allow_shorts=allow_shorts,
            )
        elif daily_mode == "ma-cross-50-200":
            # Golden cross: 50/200-day MA. Classic regime filter for crypto.
            self.daily_trend_engine = DailyTrendV2(
                mode="ma_cross", ma_fast=50, ma_slow=200, trail_pct=daily_trail_pct,
                allow_shorts=allow_shorts,
            )
        else:
            raise ValueError(f"Unknown daily_mode: {daily_mode}")

        # State
        self.starting_equity = Decimal(str(starting_equity))
        self.cash = self.starting_equity
        self.peak_equity = self.starting_equity
        self.equity_curve: list[tuple[datetime, Decimal]] = []
        self.open_positions: list[OpenPosition] = []
        self.closed_trades: list[ClosedTrade] = []

        # PERF: pre-compute pointer indices for confirm-TF alignment.
        # For each symbol, maintain an advancing index into the confirm-TF series
        # so we don't re-scan it for every primary-TF bar.
        self._confirm_tf_idx: dict[str, int] = {sym: 0 for sym in symbols}

    # ----- equity helpers -----
    def margin_locked(self) -> Decimal:
        return sum((p.margin for p in self.open_positions), Decimal("0"))

    def unrealized(self, prices_by_symbol: dict[str, Decimal]) -> Decimal:
        total = Decimal("0")
        for p in self.open_positions:
            cur = prices_by_symbol.get(p.symbol, p.entry_price)
            if p.direction == "long":
                total += p.size * (cur - p.entry_price)
            else:
                total += p.size * (p.entry_price - cur)
        return total

    def equity(self, prices_by_symbol: dict[str, Decimal]) -> Decimal:
        return self.cash + self.margin_locked() + self.unrealized(prices_by_symbol)

    # ----- bar-by-bar -----
    def run(self) -> None:
        # The driver iterates aligned primary-TF bars across all symbols.
        # Both BTC-PERP-INTX and ETH-PERP-INTX primary-TF candles close at the
        # same wall clock so this works cleanly.
        sym0 = self.symbols[0]
        ptf = self.primary_tf
        n_bars = len(self.candles[sym0][ptf])
        # Sanity check alignment — drop to min if lengths differ
        for sym in self.symbols:
            n_bars = min(n_bars, len(self.candles[sym][ptf]))

        import time
        t0 = time.time()
        last_print = t0
        for i in range(50, n_bars):  # 50-bar warmup
            self._step(i)
            # Heartbeat every 5s so we can see progress
            if time.time() - last_print > 5:
                elapsed = time.time() - t0
                pct = 100.0 * (i - 50) / max(1, n_bars - 50)
                rate = (i - 50) / elapsed if elapsed > 0 else 0
                eta = (n_bars - i) / rate if rate > 0 else 0
                print(f"  bar {i}/{n_bars} ({pct:.1f}%) — {rate:.0f} bars/s — "
                      f"open={len(self.open_positions)} closed={len(self.closed_trades)} "
                      f"eta={eta:.0f}s", flush=True)
                last_print = time.time()

        # Close any still-open positions at last close
        if self.open_positions:
            last_prices = {
                sym: Decimal(str(self.candles[sym][ptf][n_bars - 1].close))
                for sym in self.symbols
            }
            last_time = self.candles[sym0][ptf][n_bars - 1].timestamp
            for p in list(self.open_positions):
                self._close(p, last_prices[p.symbol], last_time, "end_of_data")

    def _step(self, i: int) -> None:
        ptf = self.primary_tf
        ctf = self.confirm_tf
        # Snapshot current prices for unrealized/equity calculations
        prices = {
            sym: Decimal(str(self.candles[sym][ptf][i].close))
            for sym in self.symbols
        }
        ts = self.candles[self.symbols[0]][ptf][i].timestamp

        # 1. Manage open positions against this bar's high/low
        for sym in self.symbols:
            bar = self.candles[sym][ptf][i]
            self._manage_for_symbol(sym, bar, ts)

        # 2. Try to open new positions from each engine for each symbol
        # PERF: bound the window to last WARMUP_BARS rows. Previously sliced
        # [: i+1] each call which is O(i) per bar → O(N²) total over the run.
        # 300 bars is ample warmup for any indicator we use (max period 60
        # from bb_squeeze longer-bandwidth lookback).
        WARMUP_BARS = 300
        for sym in self.symbols:
            start_p = max(0, i + 1 - WARMUP_BARS)
            window_primary = self.candles[sym][ptf][start_p : i + 1]
            # PERF: advance the confirm-TF pointer forward only — O(1) amortized
            # vs O(N) scan that previously dominated runtime
            bar_ts = self.candles[sym][ptf][i].timestamp
            cm = self.candles[sym][ctf]
            idx = self._confirm_tf_idx[sym]
            while idx < len(cm) and cm[idx].timestamp <= bar_ts:
                idx += 1
            self._confirm_tf_idx[sym] = idx
            start_c = max(0, idx - WARMUP_BARS)
            window_confirm = cm[start_c : idx]
            if len(window_confirm) < 50:
                continue

            # Engine 1: EMA Trend V2
            if "ema_trend_v2" in self.engines_used:
                sig = self.ema_engine.evaluate(window_primary, window_confirm, sym, regime="unknown")
                if sig:
                    self._try_open(sig, ts, prices)

            # Engine 2: BB Squeeze V2
            if "bb_squeeze_v2" in self.engines_used:
                sig = self.bb_engine.evaluate(window_primary, sym, regime="unknown")
                if sig:
                    self._try_open(sig, ts, prices)

            # Engine 3: Donchian Channel Breakout V2 (iter-C)
            if "donchian_v2" in self.engines_used:
                sig = self.donchian_engine.evaluate(window_primary, sym, regime="unknown")
                if sig:
                    self._try_open(sig, ts, prices)

            # Engine 4: Daily Trend Follower (v3 research)
            if "daily_trend" in self.engines_used:
                sig = self.daily_trend_engine.evaluate(window_primary, sym, regime="unknown")
                if sig:
                    self._try_open(sig, ts, prices)

        # 3. Record equity at this bar
        cur_eq = self.equity(prices)
        self.equity_curve.append((ts, cur_eq))
        if cur_eq > self.peak_equity:
            self.peak_equity = cur_eq

    # ----- open position -----
    def _try_open(self, signal: V2Signal, ts: datetime, prices: dict) -> None:
        # Risk-manager-equivalent gating
        if len(self.open_positions) >= MAX_CONCURRENT_POSITIONS:
            return
        # No opposing position on SAME symbol
        for p in self.open_positions:
            if p.symbol == signal.symbol and p.direction != signal.direction:
                return
        # No duplicate engine+symbol+direction combos either
        for p in self.open_positions:
            if p.symbol == signal.symbol and p.engine == signal.engine and p.direction == signal.direction:
                return

        eq = self.equity(prices)
        entry = Decimal(str(signal.entry_price))
        stop = Decimal(str(signal.stop_price))
        risk_per_unit = abs(entry - stop)
        if risk_per_unit <= 0:
            return

        # Size from risk %
        risk_usd = eq * Decimal(str(RISK_PER_TRADE_PCT / 100.0))
        size = (risk_usd / risk_per_unit).quantize(Decimal("0.00000001"))
        notional = size * entry
        margin = notional / Decimal(str(LEVERAGE))

        # 25% margin cap
        max_margin = eq * Decimal(str(MAX_MARGIN_USAGE_PCT / 100.0))
        if margin > max_margin:
            margin = max_margin
            notional = margin * Decimal(str(LEVERAGE))
            size = (notional / entry).quantize(Decimal("0.00000001"))
            risk_usd = size * risk_per_unit

        if size <= 0:
            return

        # Apply slippage to entry
        if signal.direction == "long":
            fill = entry * (Decimal("1") + Decimal(str(SLIPPAGE_PCT)))
        else:
            fill = entry * (Decimal("1") - Decimal(str(SLIPPAGE_PCT)))

        fee = (size * fill) * Decimal(str(TAKER_FEE_PCT))

        # Debit margin + fee from cash
        self.cash -= margin
        self.cash -= fee

        self.open_positions.append(OpenPosition(
            symbol=signal.symbol,
            engine=signal.engine,
            direction=signal.direction,
            entry_time=ts,
            entry_price=fill,
            stop_price=stop,
            target_price=Decimal(str(signal.target_price)),
            initial_stop=stop,
            trail_pct=signal.trail_pct,
            extreme_since_entry=fill,  # initialize at entry fill
            size=size,
            margin=margin,
            risk_per_unit=abs(fill - stop),
            entry_fee=fee,
        ))

    # ----- manage open positions -----
    def _manage_for_symbol(self, symbol: str, bar: Candle, ts: datetime) -> None:
        bar_high = Decimal(str(bar.high))
        bar_low = Decimal(str(bar.low))
        bar_close = Decimal(str(bar.close))

        to_close: list[tuple[OpenPosition, Decimal, str]] = []
        for p in self.open_positions:
            if p.symbol != symbol:
                continue

            # Update trailing extreme (high-water for long, low-water for short)
            if p.trail_pct > 0:
                if p.direction == "long" and bar_high > p.extreme_since_entry:
                    p.extreme_since_entry = bar_high
                elif p.direction == "short" and bar_low < p.extreme_since_entry:
                    p.extreme_since_entry = bar_low

            if p.direction == "long":
                stop_hit = bar_low <= p.stop_price
                target_hit = bar_high >= p.target_price
                # Trailing-stop exit: triggered when bar_low retraces trail_pct
                # below the highest price seen since entry.
                if p.trail_pct > 0:
                    trail_stop = p.extreme_since_entry * (Decimal("1") - Decimal(str(p.trail_pct / 100.0)))
                    if bar_low <= trail_stop and trail_stop > p.stop_price:
                        # Trail bites first; treat similarly to stop (with same gap protection)
                        fill = trail_stop * (Decimal("1") - Decimal(str(STOP_LIMIT_SLIPPAGE_PCT)))
                        to_close.append((p, fill, "trail"))
                        continue
                if stop_hit:
                    # Apply stop-limit gap slippage (worse than stop_price)
                    fill = p.stop_price * (Decimal("1") - Decimal(str(STOP_LIMIT_SLIPPAGE_PCT)))
                    to_close.append((p, fill, "stop"))
                    continue
                if target_hit:
                    to_close.append((p, p.target_price, "target"))
                    continue
            else:  # short
                stop_hit = bar_high >= p.stop_price
                target_hit = bar_low <= p.target_price
                if p.trail_pct > 0:
                    trail_stop = p.extreme_since_entry * (Decimal("1") + Decimal(str(p.trail_pct / 100.0)))
                    if bar_high >= trail_stop and trail_stop < p.stop_price:
                        fill = trail_stop * (Decimal("1") + Decimal(str(STOP_LIMIT_SLIPPAGE_PCT)))
                        to_close.append((p, fill, "trail"))
                        continue
                if stop_hit:
                    fill = p.stop_price * (Decimal("1") + Decimal(str(STOP_LIMIT_SLIPPAGE_PCT)))
                    to_close.append((p, fill, "stop"))
                    continue
                if target_hit:
                    to_close.append((p, p.target_price, "target"))
                    continue

        for p, exit_price, reason in to_close:
            self._close(p, exit_price, ts, reason)

    def _close(self, p: OpenPosition, exit_price: Decimal, ts: datetime, reason: str) -> None:
        # Apply slippage to exit
        if p.direction == "long":
            fill = exit_price * (Decimal("1") - Decimal(str(SLIPPAGE_PCT)))
            gross = p.size * (fill - p.entry_price)
        else:
            fill = exit_price * (Decimal("1") + Decimal(str(SLIPPAGE_PCT)))
            gross = p.size * (p.entry_price - fill)

        exit_fee = (p.size * fill) * Decimal(str(TAKER_FEE_PCT))
        net = gross - exit_fee - p.entry_fee
        self.cash += p.margin + net

        risk_dollars = p.size * p.risk_per_unit
        r_mult = float(net / risk_dollars) if risk_dollars > 0 else 0.0
        intended_rr = float(abs(p.target_price - p.entry_price) / p.risk_per_unit)
        hold_bars = max(1, int((ts - p.entry_time).total_seconds() / 3600))

        self.closed_trades.append(ClosedTrade(
            symbol=p.symbol, engine=p.engine, direction=p.direction,
            regime="n/a",  # v2 engines don't use regime detector currently
            entry_time=p.entry_time, exit_time=ts,
            entry_price=float(p.entry_price), exit_price=float(fill),
            stop_price=float(p.initial_stop), target_price=float(p.target_price),
            size=float(p.size), intended_rr=round(intended_rr, 3),
            exit_reason=reason,
            gross_pnl=float(gross), fees=float(p.entry_fee + exit_fee),
            net_pnl=float(net), r_multiple=round(r_mult, 3),
            hold_bars=hold_bars,
        ))
        self.open_positions.remove(p)


# ──────────────────────────────────────────────────────────────────────────
# Stats + reporting
# ──────────────────────────────────────────────────────────────────────────

def stats_for_trades(trades: list[ClosedTrade], starting_eq: float, days: int) -> dict:
    if not trades:
        return {"n": 0, "annual_return_pct": 0.0}
    wins = [t for t in trades if t.net_pnl > 0]
    losses = [t for t in trades if t.net_pnl <= 0]
    total_pnl = sum(t.net_pnl for t in trades)
    final_eq = starting_eq + total_pnl
    total_return_pct = (final_eq - starting_eq) / starting_eq * 100
    years = days / 365.0
    annual_return_pct = total_return_pct / years if years > 0 else 0

    gross_win = sum(t.net_pnl for t in wins)
    gross_loss = abs(sum(t.net_pnl for t in losses))

    # Max consecutive losses
    max_streak = streak = 0
    for t in trades:
        if t.net_pnl <= 0:
            streak += 1; max_streak = max(max_streak, streak)
        else:
            streak = 0

    return {
        "n_trades": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate_pct": round(len(wins) / len(trades) * 100, 2),
        "avg_winner_r": round(sum(t.r_multiple for t in wins) / len(wins), 3) if wins else 0,
        "avg_loser_r": round(sum(t.r_multiple for t in losses) / len(losses), 3) if losses else 0,
        "expectancy_r": round(sum(t.r_multiple for t in trades) / len(trades), 3),
        "expectancy_$": round(total_pnl / len(trades), 2),
        "total_pnl": round(total_pnl, 2),
        "total_return_pct": round(total_return_pct, 2),
        "annual_return_pct": round(annual_return_pct, 2),
        "profit_factor": round(gross_win / gross_loss, 2) if gross_loss > 0 else float("inf"),
        "max_consecutive_losses": max_streak,
        "total_fees_paid": round(sum(t.fees for t in trades), 2),
    }


def max_drawdown_from_curve(curve: list[tuple[datetime, Decimal]]) -> float:
    peak = 0.0
    max_dd = 0.0
    for _, eq in curve:
        e = float(eq)
        if e > peak: peak = e
        if peak > 0:
            dd = (e - peak) / peak * 100
            if dd < max_dd: max_dd = dd
    return round(max_dd, 2)


def split_window(trades: list[ClosedTrade], split_ts: datetime) -> tuple[list[ClosedTrade], list[ClosedTrade]]:
    tune = [t for t in trades if t.exit_time <= split_ts]
    val = [t for t in trades if t.exit_time > split_ts]
    return tune, val


def write_report(
    full_stats: dict,
    tune_stats: dict,
    val_stats: dict,
    by_engine: dict,
    by_symbol: dict,
    max_dd_tune: float,
    max_dd_val: float,
    days: int,
    split_date: datetime,
    pass_fail: dict,
    suffix: str = "",
) -> None:
    md = []
    md.append(f"# v2 Backtest Report — {days} days\n")
    md.append(f"_Generated: {datetime.utcnow().isoformat(timespec='seconds')}Z_\n\n")
    md.append(f"## Verdict: **{pass_fail['verdict']}**\n\n")
    if pass_fail.get("reasons"):
        md.append("Reasons:\n")
        for r in pass_fail["reasons"]:
            md.append(f"- {r}\n")
        md.append("\n")

    md.append("## Pass criteria\n\n")
    md.append("| Check | Required | Actual | Pass |\n|---|---|---|---|\n")
    for k, v in pass_fail["checks"].items():
        md.append(f"| {k} | {v['required']} | {v['actual']} | {'✅' if v['pass'] else '❌'} |\n")

    md.append("\n## Full-period stats\n\n")
    md.append("| Metric | Value |\n|---|---|\n")
    for k, v in full_stats.items():
        md.append(f"| {k} | {v} |\n")
    md.append(f"| max_drawdown_pct (tune)   | {max_dd_tune} |\n")
    md.append(f"| max_drawdown_pct (validate) | {max_dd_val} |\n")

    md.append(f"\n## Walk-forward (split at {split_date})\n\n")
    md.append("| Window | Trades | Win% | E[R] | Annual % | PF |\n|---|---|---|---|---|---|\n")
    md.append(
        f"| TUNE     | {tune_stats.get('n_trades',0)} | {tune_stats.get('win_rate_pct',0)} | "
        f"{tune_stats.get('expectancy_r',0)} | {tune_stats.get('annual_return_pct',0)} | "
        f"{tune_stats.get('profit_factor',0)} |\n"
    )
    md.append(
        f"| VALIDATE | {val_stats.get('n_trades',0)} | {val_stats.get('win_rate_pct',0)} | "
        f"{val_stats.get('expectancy_r',0)} | {val_stats.get('annual_return_pct',0)} | "
        f"{val_stats.get('profit_factor',0)} |\n"
    )

    md.append("\n## By engine\n\n")
    md.append("| Engine | Trades | Win% | E[R] | Total $ |\n|---|---|---|---|---|\n")
    for k, s in by_engine.items():
        md.append(f"| {k} | {s.get('n_trades',0)} | {s.get('win_rate_pct',0)} | "
                  f"{s.get('expectancy_r',0)} | {s.get('total_pnl',0)} |\n")

    md.append("\n## By symbol\n\n")
    md.append("| Symbol | Trades | Win% | E[R] | Total $ |\n|---|---|---|---|---|\n")
    for k, s in by_symbol.items():
        md.append(f"| {k} | {s.get('n_trades',0)} | {s.get('win_rate_pct',0)} | "
                  f"{s.get('expectancy_r',0)} | {s.get('total_pnl',0)} |\n")

    md.append("\n## Caveats\n\n")
    md.append("- Backtests overstate live returns by 20-50%. Adjust your forward expectations down.\n")
    md.append("- BTC + ETH correlation is high (typically 0.85-0.95). Concurrent positions on both don't fully diversify.\n")
    md.append("- Engines are decoupled from regime detector (intentional, but means more entries in chop than v1).\n")
    md.append("- Slippage modeled at 0.03% (Coinbase median); real live slippage can spike to 0.2-0.5% in volatile periods.\n")
    md.append("- Stop-limit gap protection adds 0.5% slippage on stopped-out trades to model real fills.\n")

    fname = f"REPORT{('-' + suffix) if suffix else ''}.md"
    out_path = OUT_DIR / fname
    out_path.write_text("".join(md))
    print(f"\n  Report: {out_path}")


def evaluate_pass_fail(full_stats: dict, tune_stats: dict, val_stats: dict,
                       max_dd_tune: float, max_dd_val: float, by_engine: dict) -> dict:
    checks = {
        "Annual return TUNE > 15%": {
            "required": ">15", "actual": tune_stats.get("annual_return_pct", 0),
            "pass": tune_stats.get("annual_return_pct", 0) > 15,
        },
        "Annual return VALIDATE > 10%": {
            "required": ">10", "actual": val_stats.get("annual_return_pct", 0),
            "pass": val_stats.get("annual_return_pct", 0) > 10,
        },
        "Profit factor TUNE > 1.3": {
            "required": ">1.3", "actual": tune_stats.get("profit_factor", 0),
            "pass": tune_stats.get("profit_factor", 0) > 1.3,
        },
        "Profit factor VALIDATE > 1.3": {
            "required": ">1.3", "actual": val_stats.get("profit_factor", 0),
            "pass": val_stats.get("profit_factor", 0) > 1.3,
        },
        "Max drawdown TUNE > -30%": {
            "required": ">-30", "actual": max_dd_tune,
            "pass": max_dd_tune > -30,
        },
        "Max drawdown VALIDATE > -30%": {
            "required": ">-30", "actual": max_dd_val,
            "pass": max_dd_val > -30,
        },
        "Total trades ≥ 100": {
            "required": "≥100", "actual": full_stats.get("n_trades", 0),
            "pass": full_stats.get("n_trades", 0) >= 100,
        },
        "All engines positive expectancy": {
            "required": "all >0", "actual": ", ".join(f"{k}={s.get('expectancy_r',0)}" for k, s in by_engine.items()),
            "pass": all(s.get("expectancy_r", -1) > 0 for s in by_engine.values()) if by_engine else False,
        },
    }
    all_pass = all(c["pass"] for c in checks.values())
    reasons = []
    if not all_pass:
        for name, c in checks.items():
            if not c["pass"]:
                reasons.append(f"FAIL: {name} (actual: {c['actual']})")
    verdict = "PASS — proceed to Phase 3 (build v2 service)" if all_pass else "FAIL — redesign before building"
    return {"verdict": verdict, "checks": checks, "reasons": reasons, "all_pass": all_pass}


# ──────────────────────────────────────────────────────────────────────────
# Entrypoint
# ──────────────────────────────────────────────────────────────────────────

async def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=880)
    p.add_argument("--symbols", type=str, default="BTC-PERP-INTX,ETH-PERP-INTX")
    p.add_argument("--engines", type=str, default="ema_trend_v2,bb_squeeze_v2")
    p.add_argument("--starting-equity", type=float, default=10000.0)
    p.add_argument("--primary-tf", type=str, default="1H",
                   help="Primary timeframe (1H, 4H, 1D). Engine iterates over these bars.")
    p.add_argument("--confirm-tf", type=str, default="15m",
                   help="Confirmation timeframe (15m, 1H, 4H). Lower-TF check.")
    p.add_argument("--variant", type=str, default="iter-d",
                   choices=["iter-d", "v1-like"],
                   help="Engine parameter preset.")
    # Risk/leverage knobs (mutate the module globals at runtime)
    p.add_argument("--risk-pct", type=float, default=None, help="Risk per trade % (default 2.0)")
    p.add_argument("--leverage", type=float, default=None, help="Leverage multiplier (default 4.0)")
    p.add_argument("--max-margin-pct", type=float, default=None, help="Max %% of equity used as margin (default 25.0)")
    p.add_argument("--max-positions", type=int, default=None, help="Max concurrent positions (default 4)")
    p.add_argument("--report-suffix", type=str, default="", help="Suffix added to report filename")
    # Daily-trend specific
    p.add_argument("--daily-mode", type=str, default="donchian-20",
                   choices=["donchian-20", "donchian-55", "ma-cross", "ma-cross-50-200"],
                   help="Mode for daily_trend engine")
    p.add_argument("--daily-trail-pct", type=float, default=12.0,
                   help="Trailing stop %% from peak for daily_trend engine")
    p.add_argument("--allow-shorts", action="store_true",
                   help="Enable short trades for daily_trend engine (default off)")
    args = p.parse_args()

    # Allow CLI overrides of module-level risk constants for this run
    global RISK_PER_TRADE_PCT, LEVERAGE, MAX_MARGIN_USAGE_PCT, MAX_CONCURRENT_POSITIONS
    if args.risk_pct is not None: RISK_PER_TRADE_PCT = args.risk_pct
    if args.leverage is not None: LEVERAGE = args.leverage
    if args.max_margin_pct is not None: MAX_MARGIN_USAGE_PCT = args.max_margin_pct
    if args.max_positions is not None: MAX_CONCURRENT_POSITIONS = args.max_positions

    symbols = args.symbols.split(",")
    engines = args.engines.split(",")
    days = args.days

    print(f"\n▶ v2 Backtest — {days} days, symbols={symbols}, engines={engines}")
    print(f"  Starting equity: ${args.starting_equity:,.0f}")
    print(f"  Risk/trade: {RISK_PER_TRADE_PCT}%, leverage: {LEVERAGE}x, "
          f"max positions: {MAX_CONCURRENT_POSITIONS}, max margin: {MAX_MARGIN_USAGE_PCT}%\n")

    # Fetch all data
    primary_tf = args.primary_tf
    confirm_tf = args.confirm_tf
    print(f"  Primary TF: {primary_tf}, Confirm TF: {confirm_tf}, Variant: {args.variant}\n")
    print("Fetching candles...")
    candles_by_symbol: dict[str, dict[str, list[Candle]]] = {}
    for sym in symbols:
        candles_by_symbol[sym] = {}
        for tf in [primary_tf, confirm_tf]:
            raw = await fetch_candles(sym, tf, days)
            candles_by_symbol[sym][tf] = to_candle_objs(raw)
            n = len(candles_by_symbol[sym][tf])
            if n > 0:
                first = candles_by_symbol[sym][tf][0].timestamp
                last = candles_by_symbol[sym][tf][-1].timestamp
                print(f"  {sym} {tf}: {n} bars  ({first.date()} → {last.date()})")
    print()

    # Run
    print("Running backtest...")
    bt = BacktesterV2(candles_by_symbol, symbols, engines,
                       starting_equity=args.starting_equity,
                       primary_tf=primary_tf, confirm_tf=confirm_tf,
                       variant=args.variant,
                       daily_mode=args.daily_mode,
                       daily_trail_pct=args.daily_trail_pct,
                       allow_shorts=args.allow_shorts)
    bt.run()

    n = len(bt.closed_trades)
    final_eq = float(bt.equity_curve[-1][1]) if bt.equity_curve else args.starting_equity
    print(f"\n✓ Complete: {n} closed trades, "
          f"final equity = ${final_eq:,.2f}, "
          f"open at end: {len(bt.open_positions)}\n")

    # Stats
    full = stats_for_trades(bt.closed_trades, args.starting_equity, days)

    # Walk-forward split: 70/30
    if bt.closed_trades:
        first_ts = bt.closed_trades[0].exit_time
        last_ts = bt.closed_trades[-1].exit_time
        total_span = (last_ts - first_ts).total_seconds()
        split_ts = first_ts + (last_ts - first_ts) * 0.70
        tune_trades, val_trades = split_window(bt.closed_trades, split_ts)
        tune_days = days * 0.7
        val_days = days * 0.3
        tune_stats = stats_for_trades(tune_trades, args.starting_equity, tune_days)
        val_stats = stats_for_trades(val_trades, args.starting_equity, val_days)
        # Drawdown per window
        split_curve_idx = next((i for i, (ts, _) in enumerate(bt.equity_curve) if ts > split_ts), len(bt.equity_curve))
        max_dd_tune = max_drawdown_from_curve(bt.equity_curve[:split_curve_idx])
        max_dd_val = max_drawdown_from_curve(bt.equity_curve[split_curve_idx:])
    else:
        split_ts = datetime.now(timezone.utc)
        tune_stats = val_stats = {"n_trades": 0}
        max_dd_tune = max_dd_val = 0.0

    # By engine + by symbol
    by_engine_t: dict[str, list[ClosedTrade]] = {}
    by_sym_t: dict[str, list[ClosedTrade]] = {}
    for t in bt.closed_trades:
        by_engine_t.setdefault(t.engine, []).append(t)
        by_sym_t.setdefault(t.symbol, []).append(t)
    by_engine = {k: stats_for_trades(v, args.starting_equity, days) for k, v in by_engine_t.items()}
    by_symbol = {k: stats_for_trades(v, args.starting_equity, days) for k, v in by_sym_t.items()}

    # CSVs (apply suffix to all per-run outputs so multi-run comparisons preserve)
    suf = f"-{args.report_suffix}" if args.report_suffix else ""
    if bt.closed_trades:
        with (OUT_DIR / f"trades{suf}.csv").open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=[
                "symbol", "engine", "direction", "entry_time", "exit_time", "entry", "exit",
                "stop", "target", "size_btc", "intended_rr", "exit_reason",
                "gross_pnl", "fees", "net_pnl", "r_multiple", "hold_bars"
            ])
            w.writeheader()
            for t in bt.closed_trades:
                w.writerow({
                    "symbol": t.symbol, "engine": t.engine, "direction": t.direction,
                    "entry_time": t.entry_time.isoformat(), "exit_time": t.exit_time.isoformat(),
                    "entry": t.entry_price, "exit": t.exit_price,
                    "stop": t.stop_price, "target": t.target_price,
                    "size_btc": t.size, "intended_rr": t.intended_rr,
                    "exit_reason": t.exit_reason,
                    "gross_pnl": t.gross_pnl, "fees": t.fees, "net_pnl": t.net_pnl,
                    "r_multiple": t.r_multiple, "hold_bars": t.hold_bars,
                })
    if bt.equity_curve:
        with (OUT_DIR / f"equity_curve{suf}.csv").open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["timestamp", "equity"])
            w.writeheader()
            for ts, eq in bt.equity_curve:
                w.writerow({"timestamp": ts.isoformat(), "equity": float(eq)})

    # Pass/fail
    pf = evaluate_pass_fail(full, tune_stats, val_stats, max_dd_tune, max_dd_val, by_engine)

    # Report
    write_report(full, tune_stats, val_stats, by_engine, by_symbol, max_dd_tune, max_dd_val, days, split_ts, pf,
                 suffix=args.report_suffix)

    # Console summary
    print("=" * 70)
    print("RESULTS")
    print("=" * 70)
    print(f"  Total trades: {full.get('n_trades', 0)}")
    print(f"  Total return: {full.get('total_return_pct', 0)}% ({full.get('annual_return_pct', 0)}% annualized)")
    print(f"  Win rate: {full.get('win_rate_pct', 0)}%")
    print(f"  Profit factor: {full.get('profit_factor', 0)}")
    print(f"  Final equity: ${final_eq:,.2f}")
    print()
    print("  WALK-FORWARD:")
    print(f"    TUNE     ({tune_stats.get('n_trades',0)} trades): {tune_stats.get('annual_return_pct',0)}% annual,"
          f" PF={tune_stats.get('profit_factor',0)}, MaxDD={max_dd_tune}%")
    print(f"    VALIDATE ({val_stats.get('n_trades',0)} trades): {val_stats.get('annual_return_pct',0)}% annual,"
          f" PF={val_stats.get('profit_factor',0)}, MaxDD={max_dd_val}%")
    print()
    print("  BY ENGINE:")
    for k, s in by_engine.items():
        print(f"    {k:20s}: n={s.get('n_trades',0)}, win%={s.get('win_rate_pct',0)}, "
              f"E[R]={s.get('expectancy_r',0)}, total=${s.get('total_pnl',0)}")
    print()
    print("  BY SYMBOL:")
    for k, s in by_symbol.items():
        print(f"    {k:20s}: n={s.get('n_trades',0)}, win%={s.get('win_rate_pct',0)}, "
              f"E[R]={s.get('expectancy_r',0)}, total=${s.get('total_pnl',0)}")
    print()
    print("=" * 70)
    print(f"VERDICT: {pf['verdict']}")
    print("=" * 70)
    if pf.get("reasons"):
        for r in pf["reasons"]:
            print(f"  ✗ {r}")


if __name__ == "__main__":
    asyncio.run(main())
