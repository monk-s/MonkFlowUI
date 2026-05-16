"""Tests for bot.risk.position_sizer."""

from decimal import Decimal
import pytest
from bot.risk.position_sizer import calculate_position_size


class TestPositionSizer:
    def test_basic_long(self):
        """1.5% risk on $10k equity, entry 85k stop 84k.

        Raw: risk=$150, size=0.15 BTC, margin=$3187.50
        But margin cap (25% of $10k = $2500) scales down to:
        margin=$2500, size≈0.1176 BTC, risk≈$117.65
        """
        result = calculate_position_size(
            equity=Decimal("10000"),
            entry_price=Decimal("85000"),
            stop_price=Decimal("84000"),
            risk_pct=1.5,
            leverage=4.0,
        )
        assert result.is_valid
        # Margin cap kicks in: $3187.50 > $2500 limit
        assert float(result.margin_usd) == pytest.approx(2500.0, abs=1.0)
        # Scaled-down risk ≈ $117.65
        assert float(result.risk_usd) == pytest.approx(117.65, abs=1.0)
        # Scaled-down size ≈ 0.1176 BTC
        assert float(result.size_btc) == pytest.approx(0.1176, abs=0.001)

    def test_basic_short(self):
        """Short position: stop above entry."""
        result = calculate_position_size(
            equity=Decimal("10000"),
            entry_price=Decimal("85000"),
            stop_price=Decimal("86500"),
            risk_pct=1.5,
        )
        assert result.is_valid
        # risk per btc = |85000 - 86500| = 1500
        # risk usd = 150
        # size = 150 / 1500 = 0.1 BTC
        assert float(result.size_btc) == pytest.approx(0.1, abs=0.001)

    def test_margin_cap_applied(self):
        """When position is too large, margin cap scales it down."""
        # Very tight stop = large position that exceeds 25% margin cap
        result = calculate_position_size(
            equity=Decimal("10000"),
            entry_price=Decimal("85000"),
            stop_price=Decimal("84990"),  # only $10 risk per BTC
            risk_pct=1.5,
            leverage=4.0,
        )
        assert result.is_valid
        # Without cap: size = 150/10 = 15 BTC, margin = 15*85000/4 = $318,750
        # With 25% cap: max margin = $2500, so position is scaled down
        assert float(result.margin_usd) <= 2500.01

    def test_zero_risk_returns_invalid(self):
        """Entry == stop should return zero size."""
        result = calculate_position_size(
            equity=Decimal("10000"),
            entry_price=Decimal("85000"),
            stop_price=Decimal("85000"),
        )
        assert not result.is_valid
        assert result.size_btc == 0

    def test_risk_percentage(self):
        """The risk_pct in the result should reflect actual risk."""
        result = calculate_position_size(
            equity=Decimal("10000"),
            entry_price=Decimal("85000"),
            stop_price=Decimal("84000"),
            risk_pct=1.5,
        )
        # Should be around 1.5%
        assert 1.0 <= float(result.risk_pct) <= 2.0

    def test_small_equity(self):
        """Small account should still produce valid sizing."""
        result = calculate_position_size(
            equity=Decimal("100"),
            entry_price=Decimal("85000"),
            stop_price=Decimal("84000"),
            risk_pct=1.5,
        )
        assert result.is_valid
        # risk = 100 * 0.015 = $1.50, size = 1.50 / 1000 = 0.0015 BTC
        assert float(result.size_btc) > 0
