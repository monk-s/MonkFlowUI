"""
Trailing stop manager.

Activation: profit exceeds 1R (TRAILING_ACTIVATION_R).
Trail distance: 1 * ATR (TRAILING_DISTANCE_ATR).
Ratchet: the stop only moves in the profitable direction.
"""

from __future__ import annotations

from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("trailing_stop")


class TrailingStopManager:
    """Stateless trailing-stop logic.  Pure functions, no side effects."""

    def should_activate(
        self,
        entry_price: float,
        current_price: float,
        stop_price: float,
        direction: str,
    ) -> bool:
        """
        Return True when unrealized profit exceeds TRAILING_ACTIVATION_R
        multiples of risk (1R by default).

        Parameters
        ----------
        entry_price : float
            The trade's entry fill price.
        current_price : float
            The latest market price.
        stop_price : float
            The original stop-loss price.
        direction : str
            "long" or "short".
        """
        risk = abs(entry_price - stop_price)
        if risk == 0:
            return False

        if direction == "long":
            profit = current_price - entry_price
        else:
            profit = entry_price - current_price

        r_multiple = profit / risk
        activated = r_multiple >= settings.TRAILING_ACTIVATION_R

        if activated:
            logger.info(
                "trailing_activation_check",
                direction=direction,
                r_multiple=round(r_multiple, 2),
                threshold=settings.TRAILING_ACTIVATION_R,
                activated=True,
            )

        return activated

    def calculate_trailing_stop(
        self,
        current_price: float,
        atr: float,
        direction: str,
    ) -> float:
        """
        Compute a new trailing stop price based on current price and ATR.

        For longs:  new_stop = current_price - TRAILING_DISTANCE_ATR * ATR
        For shorts: new_stop = current_price + TRAILING_DISTANCE_ATR * ATR
        """
        distance = settings.TRAILING_DISTANCE_ATR * atr

        if direction == "long":
            new_stop = current_price - distance
        else:
            new_stop = current_price + distance

        logger.debug(
            "trailing_stop_calculated",
            direction=direction,
            current_price=round(current_price, 2),
            atr=round(atr, 2),
            new_stop=round(new_stop, 2),
        )

        return new_stop

    def update_stop(
        self,
        current_stop: float,
        new_stop: float,
        direction: str,
    ) -> float:
        """
        Ratchet the trailing stop -- it only moves in the profitable direction.

        For longs: keep the higher of current_stop and new_stop.
        For shorts: keep the lower of current_stop and new_stop.

        Returns the updated stop price.
        """
        if direction == "long":
            updated = max(current_stop, new_stop)
        else:
            updated = min(current_stop, new_stop)

        if updated != current_stop:
            logger.info(
                "trailing_stop_updated",
                direction=direction,
                old_stop=round(current_stop, 2),
                new_stop=round(updated, 2),
            )

        return updated
