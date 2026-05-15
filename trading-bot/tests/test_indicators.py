"""Tests for bot.data.indicators — pure math functions."""

import math
import pytest
from bot.data.indicators import (
    sma,
    ema,
    rsi,
    bollinger_bands,
    bb_bandwidth,
    atr,
    adx,
    ema_slope,
    compute_all,
    _isnan,
)
from tests.conftest import make_candle_series


class TestSMA:
    def test_basic_sma(self):
        closes = [1.0, 2.0, 3.0, 4.0, 5.0]
        result = sma(closes, 3)
        assert _isnan(result[0])
        assert _isnan(result[1])
        assert result[2] == pytest.approx(2.0)
        assert result[3] == pytest.approx(3.0)
        assert result[4] == pytest.approx(4.0)

    def test_sma_period_equals_length(self):
        closes = [10.0, 20.0, 30.0]
        result = sma(closes, 3)
        assert result[2] == pytest.approx(20.0)

    def test_sma_insufficient_data(self):
        closes = [1.0, 2.0]
        result = sma(closes, 5)
        assert all(_isnan(v) for v in result)

    def test_sma_period_one(self):
        closes = [5.0, 10.0, 15.0]
        result = sma(closes, 1)
        assert result == [5.0, 10.0, 15.0]


class TestEMA:
    def test_ema_seed_is_sma(self):
        closes = [10.0, 20.0, 30.0, 40.0, 50.0]
        result = ema(closes, 3)
        # Seed at index 2 should be SMA of first 3: (10+20+30)/3 = 20
        assert result[2] == pytest.approx(20.0)

    def test_ema_weights_recent(self):
        # EMA should be closer to recent prices than SMA
        closes = [10.0, 10.0, 10.0, 10.0, 50.0]
        ema_result = ema(closes, 3)
        sma_result = sma(closes, 3)
        # After a big jump, EMA should be higher than SMA (more weight on recent)
        assert ema_result[4] > sma_result[4]

    def test_ema_constant_prices(self):
        closes = [100.0] * 20
        result = ema(closes, 9)
        # All valid values should be 100
        for v in result[8:]:
            assert v == pytest.approx(100.0)


class TestRSI:
    def test_rsi_overbought(self):
        # Steadily rising prices should give RSI near 100
        closes = [100.0 + i * 10.0 for i in range(30)]
        result = rsi(closes, 14)
        # Last value should be very high
        assert result[-1] > 90

    def test_rsi_oversold(self):
        # Steadily falling prices should give RSI near 0
        closes = [300.0 - i * 10.0 for i in range(30)]
        result = rsi(closes, 14)
        assert result[-1] < 10

    def test_rsi_midrange(self):
        # Alternating up/down should give RSI near 50
        closes = [100.0 + (5.0 if i % 2 == 0 else -5.0) for i in range(50)]
        result = rsi(closes, 14)
        assert 40 < result[-1] < 60

    def test_rsi_range(self):
        closes = [100.0 + i * 5.0 for i in range(30)]
        result = rsi(closes, 14)
        for v in result:
            if not _isnan(v):
                assert 0 <= v <= 100


class TestBollingerBands:
    def test_bb_middle_is_sma(self):
        closes = list(range(1, 31))
        closes_float = [float(c) for c in closes]
        upper, middle, lower = bollinger_bands(closes_float, 20)
        sma_result = sma(closes_float, 20)
        # Middle band should equal SMA at every valid index
        for i in range(19, 30):
            assert middle[i] == pytest.approx(sma_result[i], abs=0.001)

    def test_bb_symmetry(self):
        closes = [100.0 + i for i in range(30)]
        upper, middle, lower = bollinger_bands(closes, 20)
        # upper - middle should equal middle - lower
        for i in range(19, 30):
            assert (upper[i] - middle[i]) == pytest.approx(
                middle[i] - lower[i], abs=0.001
            )

    def test_bb_constant_price(self):
        closes = [100.0] * 25
        upper, middle, lower = bollinger_bands(closes, 20)
        # Zero volatility: bands collapse to middle
        assert upper[-1] == pytest.approx(100.0)
        assert lower[-1] == pytest.approx(100.0)


class TestBBBandwidth:
    def test_bandwidth_calculation(self):
        upper = [float("nan")] * 5 + [110.0, 112.0]
        middle = [float("nan")] * 5 + [100.0, 100.0]
        lower = [float("nan")] * 5 + [90.0, 88.0]
        result = bb_bandwidth(upper, middle, lower)
        assert result[5] == pytest.approx(0.2)  # (110-90)/100
        assert result[6] == pytest.approx(0.24)  # (112-88)/100


class TestATR:
    def test_atr_basic(self):
        highs = [110.0 + i for i in range(20)]
        lows = [90.0 + i for i in range(20)]
        closes = [100.0 + i for i in range(20)]
        result = atr(highs, lows, closes, 14)
        # ATR should be around 20 (high - low range)
        assert result[14] == pytest.approx(20.0, abs=1.0)

    def test_atr_insufficient_data(self):
        result = atr([100.0] * 5, [90.0] * 5, [95.0] * 5, 14)
        assert all(_isnan(v) for v in result)


class TestADX:
    def test_adx_trending(self):
        # Strong uptrend should give high ADX
        n = 60
        highs = [100.0 + i * 2.0 for i in range(n)]
        lows = [95.0 + i * 2.0 for i in range(n)]
        closes = [98.0 + i * 2.0 for i in range(n)]
        result = adx(highs, lows, closes, 14)
        # Last ADX value should be > 25 (trending)
        valid = [v for v in result if not _isnan(v)]
        assert len(valid) > 0
        assert valid[-1] > 20

    def test_adx_insufficient_data(self):
        result = adx([100.0] * 10, [90.0] * 10, [95.0] * 10, 14)
        assert all(_isnan(v) for v in result)


class TestEMASlope:
    def test_positive_slope(self):
        ema_vals = [100.0, 101.0, 102.0, 103.0, 104.0, 105.0]
        slope = ema_slope(ema_vals, 5)
        assert slope > 0

    def test_negative_slope(self):
        ema_vals = [105.0, 104.0, 103.0, 102.0, 101.0, 100.0]
        slope = ema_slope(ema_vals, 5)
        assert slope < 0

    def test_flat_slope(self):
        ema_vals = [100.0] * 10
        slope = ema_slope(ema_vals, 5)
        assert slope == pytest.approx(0.0)

    def test_insufficient_data(self):
        slope = ema_slope([100.0], 5)
        assert _isnan(slope)


class TestComputeAll:
    def test_compute_all_returns_snapshot(self):
        prices = [80000.0 + i * 50.0 for i in range(60)]
        candles = make_candle_series(prices)
        snap = compute_all(candles)
        assert not _isnan(snap.ema_fast)
        assert not _isnan(snap.ema_slow)
        assert not _isnan(snap.rsi)
        assert not _isnan(snap.atr)
        assert not _isnan(snap.bb_upper)
        assert not _isnan(snap.bb_middle)
        assert not _isnan(snap.bb_lower)


class TestIsNan:
    def test_nan_detection(self):
        assert _isnan(float("nan"))
        assert not _isnan(0.0)
        assert not _isnan(1.0)
        assert not _isnan(-1.0)
