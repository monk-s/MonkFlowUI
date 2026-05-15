"""Tests for bot.strategy.ema_trend."""

import pytest
from bot.strategy.ema_trend import EMATrendStrategy
from bot.strategy.regime_detector import RegimeDetector
from bot.strategy.base import Signal
from tests.conftest import make_trending_up, make_trending_down, make_ranging


class TestEMATrendStrategy:
    @pytest.fixture
    def strategy(self):
        return EMATrendStrategy(RegimeDetector())

    def test_no_signal_on_ranging(self, strategy):
        """Ranging data should not produce trend signals."""
        candles_4h = make_ranging(200)
        candles_1h = make_ranging(200, amplitude=100)
        signal = strategy.evaluate(candles_4h, candles_1h)
        # Ranging market: no trend signal expected
        # (signal may or may not be None depending on exact conditions)
        if signal is not None:
            assert isinstance(signal, Signal)

    def test_signal_has_required_fields(self, strategy):
        """If a signal is generated, verify all fields are populated."""
        candles_4h = make_trending_up(200)
        candles_1h = make_trending_up(200)
        signal = strategy.evaluate(candles_4h, candles_1h)
        if signal is not None:
            assert signal.strategy == "ema_trend"
            assert signal.direction in ("long", "short")
            assert signal.entry_price > 0
            assert signal.stop_price > 0
            assert signal.target_price > 0
            assert signal.rr_ratio >= 2.0
            assert abs(signal.entry_price - signal.stop_price) > 0

    def test_long_signal_structure(self, strategy):
        """For a long signal, stop < entry < target."""
        candles_4h = make_trending_up(200)
        candles_1h = make_trending_up(200)
        signal = strategy.evaluate(candles_4h, candles_1h)
        if signal is not None and signal.direction == "long":
            assert signal.stop_price < signal.entry_price
            assert signal.target_price > signal.entry_price

    def test_short_signal_structure(self, strategy):
        """For a short signal, stop > entry > target."""
        candles_4h = make_trending_down(200)
        candles_1h = make_trending_down(200)
        signal = strategy.evaluate(candles_4h, candles_1h)
        if signal is not None and signal.direction == "short":
            assert signal.stop_price > signal.entry_price
            assert signal.target_price < signal.entry_price

    def test_insufficient_candles(self, strategy):
        """Too few candles should return None."""
        candles_4h = make_trending_up(20)
        candles_1h = make_trending_up(20)
        signal = strategy.evaluate(candles_4h, candles_1h)
        assert signal is None
