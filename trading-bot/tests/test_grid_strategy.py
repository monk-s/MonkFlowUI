"""Tests for bot.strategy.grid_strategy.

Pure-function tests, no DB/exchange dependency. These ARE the
authoritative spec for the grid's level math — if they pass, the
backtest model and live behavior agree.
"""

from datetime import datetime, timedelta, timezone

import pytest

from bot.strategy.grid_strategy import (
    GridRange,
    capital_per_level,
    compute_dynamic_range,
    compute_levels,
    compute_range_and_levels,
    prebuy_qty_from_pct,
    should_recenter,
)


# ─────────────────────────────────────────────────────────────────────────
# compute_levels
# ─────────────────────────────────────────────────────────────────────────

class TestComputeLevels:
    def test_two_levels_returns_endpoints(self):
        levels = compute_levels(100.0, 200.0, 2)
        assert levels == (100.0, 200.0)

    def test_evenly_spaced(self):
        levels = compute_levels(50000.0, 110000.0, 7)
        assert len(levels) == 7
        # Step should be (110000 - 50000) / 6 = 10000
        for i in range(1, len(levels)):
            assert levels[i] - levels[i-1] == pytest.approx(10000.0)
        assert levels[0] == 50000.0
        assert levels[-1] == 110000.0

    def test_thirty_levels(self):
        """Production default: 30 levels across $50K-$110K."""
        levels = compute_levels(50000.0, 110000.0, 30)
        assert len(levels) == 30
        assert levels[0] == 50000.0
        assert levels[-1] == 110000.0
        step = (110000.0 - 50000.0) / 29
        for i in range(1, 30):
            assert levels[i] - levels[i-1] == pytest.approx(step)

    def test_zero_levels_raises(self):
        with pytest.raises(ValueError):
            compute_levels(100, 200, 0)
        with pytest.raises(ValueError):
            compute_levels(100, 200, 1)

    def test_low_gte_high_raises(self):
        with pytest.raises(ValueError):
            compute_levels(200, 100, 5)
        with pytest.raises(ValueError):
            compute_levels(100, 100, 5)


# ─────────────────────────────────────────────────────────────────────────
# compute_dynamic_range
# ─────────────────────────────────────────────────────────────────────────

class TestComputeDynamicRange:
    def test_basic_range_with_padding(self):
        # Recent range: 50K - 110K = width 60K
        # Padding 15% = ±9K → final range [41K, 119K]
        highs = [100000.0] * 30 + [110000.0] * 30
        lows = [60000.0] * 30 + [50000.0] * 30
        low, high = compute_dynamic_range(
            highs, lows, lookback_days=60, padding_pct=15.0,
        )
        assert low == pytest.approx(41000.0)
        assert high == pytest.approx(119000.0)

    def test_zero_padding(self):
        highs = [100.0, 200.0, 300.0]
        lows = [50.0, 80.0, 90.0]
        low, high = compute_dynamic_range(
            highs, lows, lookback_days=3, padding_pct=0.0,
        )
        assert low == 50.0
        assert high == 300.0

    def test_uses_last_n_days_only(self):
        """Older data outside the lookback should be ignored."""
        # First 10 days: huge swing (10K-200K). Last 5 days: tight range (95K-105K)
        highs = [200000.0] * 10 + [105000.0] * 5
        lows = [10000.0] * 10 + [95000.0] * 5
        low, high = compute_dynamic_range(
            highs, lows, lookback_days=5, padding_pct=0.0,
        )
        # Should only see the tight range
        assert low == 95000.0
        assert high == 105000.0

    def test_insufficient_history_raises(self):
        with pytest.raises(ValueError, match="Need >= 60 daily bars"):
            compute_dynamic_range([100.0] * 30, [50.0] * 30, lookback_days=60, padding_pct=15.0)

    def test_bad_lookback_raises(self):
        with pytest.raises(ValueError):
            compute_dynamic_range([1.0, 2.0], [0.5, 1.5], lookback_days=1, padding_pct=0)


# ─────────────────────────────────────────────────────────────────────────
# GridRange behaviors
# ─────────────────────────────────────────────────────────────────────────

class TestGridRange:
    def _build(self, low=50000.0, high=110000.0, n=7):
        return compute_range_and_levels(
            mode="static",
            static_low=low,
            static_high=high,
            n_levels=n,
        )

    def test_level_for_price_in_range(self):
        gr = self._build()
        # 80000 is the midpoint of 50000-110000 with 7 levels at step 10000:
        # [50000, 60000, 70000, 80000, 90000, 100000, 110000]
        # Index 3 = 80000.
        assert gr.level_for_price(80000.0) == 3
        assert gr.level_for_price(50000.0) == 0
        assert gr.level_for_price(110000.0) == 6

    def test_level_for_price_out_of_range(self):
        gr = self._build()
        assert gr.level_for_price(40000.0) is None
        assert gr.level_for_price(120000.0) is None

    def test_level_for_price_snaps_to_nearest(self):
        gr = self._build()
        # 84000 → nearest is 80000 (index 3, dist 4000) vs 90000 (index 4, dist 6000)
        assert gr.level_for_price(84000.0) == 3
        # 86000 → nearest is 90000
        assert gr.level_for_price(86000.0) == 4

    def test_buys_below_orders_nearest_first(self):
        gr = self._build()
        # At price 80000, levels below are [50000, 60000, 70000]; nearest first
        below = gr.buys_below(80000.0, n=10)
        assert [lvl for _, lvl in below] == [70000.0, 60000.0, 50000.0]

    def test_buys_below_respects_limit(self):
        gr = self._build()
        below = gr.buys_below(80000.0, n=2)
        assert [lvl for _, lvl in below] == [70000.0, 60000.0]

    def test_buys_below_strict(self):
        """At an exact level, buys_below excludes that level."""
        gr = self._build()
        below = gr.buys_below(80000.0, n=10)
        assert 80000.0 not in [lvl for _, lvl in below]

    def test_sells_above_orders_nearest_first(self):
        gr = self._build()
        above = gr.sells_above(80000.0, n=10)
        assert [lvl for _, lvl in above] == [90000.0, 100000.0, 110000.0]


# ─────────────────────────────────────────────────────────────────────────
# compute_range_and_levels (high-level entry point)
# ─────────────────────────────────────────────────────────────────────────

class TestComputeRangeAndLevels:
    def test_static_mode(self):
        gr = compute_range_and_levels(
            mode="static",
            static_low=50000.0,
            static_high=110000.0,
            n_levels=5,
        )
        assert gr.low == 50000.0
        assert gr.high == 110000.0
        assert gr.n_levels == 5
        assert gr.levels == (50000.0, 65000.0, 80000.0, 95000.0, 110000.0)

    def test_dynamic_mode_requires_data(self):
        with pytest.raises(ValueError):
            compute_range_and_levels(mode="dynamic", n_levels=5)

    def test_dynamic_mode_full(self):
        highs = [100000.0] * 60
        lows = [50000.0] * 60
        gr = compute_range_and_levels(
            mode="dynamic",
            daily_highs=highs,
            daily_lows=lows,
            n_levels=11,
            lookback_days=60,
            padding_pct=10.0,
        )
        # Width = 50K, padding 10% = 5K each side → [45K, 105K]
        assert gr.low == pytest.approx(45000.0)
        assert gr.high == pytest.approx(105000.0)
        assert gr.n_levels == 11

    def test_unknown_mode_raises(self):
        with pytest.raises(ValueError, match="mode must be"):
            compute_range_and_levels(mode="banana", n_levels=5)


# ─────────────────────────────────────────────────────────────────────────
# should_recenter
# ─────────────────────────────────────────────────────────────────────────

class TestShouldRecenter:
    def test_first_deploy_returns_true(self):
        assert should_recenter(None, interval_days=60) is True

    def test_recent_recenter_returns_false(self):
        now = datetime.now(timezone.utc)
        last = now - timedelta(days=5)
        assert should_recenter(last, interval_days=60, now=now) is False

    def test_overdue_recenter_returns_true(self):
        now = datetime.now(timezone.utc)
        last = now - timedelta(days=61)
        assert should_recenter(last, interval_days=60, now=now) is True

    def test_exactly_interval_returns_true(self):
        now = datetime.now(timezone.utc)
        last = now - timedelta(days=60)
        assert should_recenter(last, interval_days=60, now=now) is True


# ─────────────────────────────────────────────────────────────────────────
# Sizing helpers
# ─────────────────────────────────────────────────────────────────────────

class TestSizingHelpers:
    def test_capital_per_level_equal_split(self):
        assert capital_per_level(10000.0, 30) == pytest.approx(333.333, abs=0.01)
        assert capital_per_level(9600.0, 30) == pytest.approx(320.0)

    def test_prebuy_qty_50pct(self):
        # $9,600 × 50% = $4,800 of pre-buy notional. At $77K → 0.0623 BTC
        qty = prebuy_qty_from_pct(9600.0, 50.0, 77000.0)
        assert qty == pytest.approx(4800.0 / 77000.0, abs=1e-6)

    def test_prebuy_qty_70pct(self):
        qty = prebuy_qty_from_pct(9600.0, 70.0, 77000.0)
        assert qty == pytest.approx(6720.0 / 77000.0, abs=1e-6)

    def test_prebuy_qty_zero(self):
        assert prebuy_qty_from_pct(9600.0, 0.0, 77000.0) == 0

    def test_prebuy_qty_out_of_range_raises(self):
        with pytest.raises(ValueError):
            prebuy_qty_from_pct(9600.0, -1.0, 77000.0)
        with pytest.raises(ValueError):
            prebuy_qty_from_pct(9600.0, 101.0, 77000.0)

    def test_prebuy_qty_bad_price_raises(self):
        with pytest.raises(ValueError):
            prebuy_qty_from_pct(9600.0, 50.0, 0.0)
        with pytest.raises(ValueError):
            prebuy_qty_from_pct(9600.0, 50.0, -100.0)
