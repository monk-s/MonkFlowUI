"""
Position sizing calculator.

Given equity, entry price, stop price, and risk parameters, computes the
exact BTC position size, notional value, required margin, and dollar risk.

Enforces the 25% max-margin cap: if the computed margin exceeds 25% of
equity, the position size is scaled down to fit.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP

from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("position_sizer")


@dataclass(frozen=True)
class PositionSizeResult:
    """Immutable result of a position-size calculation."""

    size_btc: Decimal
    value_usd: Decimal
    margin_usd: Decimal
    risk_usd: Decimal
    risk_pct: Decimal

    @property
    def is_valid(self) -> bool:
        return self.size_btc > 0 and self.margin_usd > 0


def calculate_position_size(
    equity: Decimal,
    entry_price: Decimal,
    stop_price: Decimal,
    risk_pct: float = settings.RISK_PER_TRADE_PCT,
    leverage: float = settings.LEVERAGE,
) -> PositionSizeResult:
    """
    Compute position size from equity, prices, and risk parameters.

    Parameters
    ----------
    equity : Decimal
        Current account equity in USD.
    entry_price : Decimal
        Planned entry price.
    stop_price : Decimal
        Planned stop-loss price.
    risk_pct : float
        Percentage of equity to risk (default 1.5%).
    leverage : float
        Leverage multiplier (default 4x).

    Returns
    -------
    PositionSizeResult
        Fully computed sizing details.  ``size_btc`` will be 0 if the
        inputs are invalid (e.g. stop == entry).
    """
    _equity = Decimal(str(equity))
    _entry = Decimal(str(entry_price))
    _stop = Decimal(str(stop_price))
    _risk_pct = Decimal(str(risk_pct)) / Decimal("100")
    _leverage = Decimal(str(leverage))
    _max_margin_pct = Decimal(str(settings.MAX_MARGIN_USAGE_PCT)) / Decimal("100")

    # Risk per unit (in USD per BTC)
    risk_per_btc = abs(_entry - _stop)

    if risk_per_btc == 0 or _entry == 0:
        logger.warning(
            "invalid_sizing_inputs",
            entry=str(_entry),
            stop=str(_stop),
        )
        return PositionSizeResult(
            size_btc=Decimal("0"),
            value_usd=Decimal("0"),
            margin_usd=Decimal("0"),
            risk_usd=Decimal("0"),
            risk_pct=Decimal("0"),
        )

    # Dollar amount to risk
    risk_usd = (_equity * _risk_pct).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # Raw position size from risk
    size_btc = (risk_usd / risk_per_btc).quantize(Decimal("0.00000001"), rounding=ROUND_DOWN)

    # Notional value and required margin
    value_usd = (size_btc * _entry).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    margin_usd = (value_usd / _leverage).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # --- Enforce 25% max margin cap ---
    max_margin = (_equity * _max_margin_pct).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if margin_usd > max_margin:
        logger.info(
            "margin_cap_applied",
            raw_margin=str(margin_usd),
            max_margin=str(max_margin),
        )
        # Scale down to fit
        margin_usd = max_margin
        value_usd = (margin_usd * _leverage).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        size_btc = (value_usd / _entry).quantize(Decimal("0.00000001"), rounding=ROUND_DOWN)
        risk_usd = (size_btc * risk_per_btc).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # Recalculate effective risk percentage after any cap
    actual_risk_pct = (
        (risk_usd / _equity * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if _equity > 0
        else Decimal("0")
    )

    logger.info(
        "position_sized",
        equity=str(_equity),
        entry=str(_entry),
        stop=str(_stop),
        size_btc=str(size_btc),
        value_usd=str(value_usd),
        margin_usd=str(margin_usd),
        risk_usd=str(risk_usd),
        risk_pct=str(actual_risk_pct),
    )

    return PositionSizeResult(
        size_btc=size_btc,
        value_usd=value_usd,
        margin_usd=margin_usd,
        risk_usd=risk_usd,
        risk_pct=actual_risk_pct,
    )
