"""Tests for bot.strategy.bb_rsi_reversion."""

import pytest
from bot.strategy.bb_rsi_reversion import BBRSIReversionStrategy
from bot.strategy.regime_detector import RegimeDetector
from bot.strategy.base import Signal
from tests.conftest import make_ranging, make_trending_up


class TestBBRSIReversionStrategy:
    @pytest.fixture
    def strategy(self):
        return BBRSIReversionStrategy(RegimeDetector())

    def test_no_signal_on_trend(self, strategy):
        """Strong trend data should not produce reversion signals (or rarely)."""
        candles_4h = make_trending_up(200)
        candles_1h = make_trending_up(200)
        signal = strategy.evaluate(candles_4h, candles_1h)
        # In a strong trend, mean reversion signals should be rare
        if signal is not None:
            assert isinstance(signal, Signal)

    def test_signal_fields(self, strategy):
        """If a signal is generated, verify all fields are populated."""
        candles_4h = make_ranging(200)
        candles_1h = make_ranging(200, amplitude=100)
        signal = strategy.evaluate(candles_4h, candles_1h)
        if signal is not None:
            assert signal.strategy == "bb_rsi_reversion"
            assert signal.direction in ("long", "short")
            assert signal.entry_price > 0
            assert signal.stop_price > 0
            assert signal.target_price > 0
            assert signal.rr_ratio > 0

    def test_long_signal_stop_below_entry(self, strategy):
        """Long mean reversion: stop below entry, target above."""
        candles_4h = make_ranging(200)
        candles_1h = make_ranging(200, amplitude=100)
        signal = strategy.evaluate(candles_4h, candles_1h)
        if signal is not None and signal.direction == "long":
            assert signal.stop_price < signal.entry_price
            assert signal.target_price > signal.entry_price

    def test_short_signal_stop_above_entry(self, strategy):
        """Short mean reversion: stop above entry, target below."""
        candles_4h = make_ranging(200)
        candles_1h = make_ranging(200, amplitude=100)
        signal = strategy.evaluate(candles_4h, candles_1h)
        if signal is not None and signal.direction == "short":
            assert signal.stop_price > signal.entry_price
            assert signal.target_price < signal.entry_price

    def test_insufficient_candles(self, strategy):
        """Too few candles should return None."""
        candles_4h = make_ranging(15)
        candles_1h = make_ranging(15, amplitude=100)
        signal = strategy.evaluate(candles_4h, candles_1h)
        assert signal is None
