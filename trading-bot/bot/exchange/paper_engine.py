"""
Paper trade engine — simulates order fills, balances, and positions internally
while using real market data from Coinbase for prices and candles.
"""

import random
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from bot.exchange.base import (
    ExchangeInterface, OrderResult, OrderSide, OrderType,
    Position, FundingInfo,
)
from bot.exchange.coinbase_client import CoinbaseClient
from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("paper_engine")


class PaperPosition:
    """Internal representation of a simulated position."""

    def __init__(
        self,
        position_id: str,
        side: str,
        size: Decimal,
        entry_price: Decimal,
        leverage: Decimal,
    ):
        self.position_id = position_id
        self.side = side
        self.size = size
        self.entry_price = entry_price
        self.leverage = leverage
        self.margin = (size * entry_price) / leverage
        self.opened_at = datetime.now(timezone.utc)

    def unrealized_pnl(self, current_price: Decimal) -> Decimal:
        if self.side == "long":
            return self.size * (current_price - self.entry_price)
        else:
            return self.size * (self.entry_price - current_price)

    def to_position(self, current_price: Decimal) -> Position:
        maint_rate = Decimal("0.005")
        if self.side == "long":
            liq = self.entry_price * (1 - (1 / self.leverage) + maint_rate)
        else:
            liq = self.entry_price * (1 + (1 / self.leverage) - maint_rate)

        return Position(
            symbol=settings.SYMBOL,
            side=self.side,
            size=self.size,
            entry_price=self.entry_price,
            current_price=current_price,
            unrealized_pnl=self.unrealized_pnl(current_price),
            margin_used=self.margin,
            leverage=self.leverage,
            liquidation_price=liq,
        )


class PaperOrder:
    """Pending order in paper engine."""

    def __init__(
        self,
        order_id: str,
        side: OrderSide,
        size: Decimal,
        order_type: OrderType,
        price: Optional[Decimal] = None,
        stop_price: Optional[Decimal] = None,
        reduce_only: bool = False,
    ):
        self.order_id = order_id
        self.side = side
        self.size = size
        self.order_type = order_type
        self.price = price
        self.stop_price = stop_price
        self.reduce_only = reduce_only
        self.created_at = datetime.now(timezone.utc)


class PaperEngine(ExchangeInterface):
    """
    Simulates trading with a virtual balance.
    Uses real market data from CoinbaseClient for prices and candles.
    """

    def __init__(self):
        self.market_client = CoinbaseClient()
        self.balance = Decimal(str(settings.PAPER_STARTING_BALANCE))
        self.positions: dict[str, PaperPosition] = {}
        self.pending_orders: dict[str, PaperOrder] = {}
        self.filled_orders: list[OrderResult] = []
        self.total_fees = Decimal("0")
        self.total_funding = Decimal("0")
        self._last_price: Optional[Decimal] = None

        logger.info(
            "paper_engine_initialized",
            starting_balance=str(self.balance),
            slippage_pct=settings.PAPER_SLIPPAGE_PCT,
        )

    def _apply_slippage(self, price: Decimal, side: OrderSide) -> Decimal:
        """Apply random slippage to simulate real market conditions."""
        slippage_pct = Decimal(str(random.uniform(0, settings.PAPER_SLIPPAGE_PCT))) / 100
        if side == OrderSide.BUY:
            return price * (1 + slippage_pct)
        else:
            return price * (1 - slippage_pct)

    def _calculate_fee(self, size: Decimal, price: Decimal, is_taker: bool) -> Decimal:
        fee_rate = (
            Decimal(str(settings.PAPER_TAKER_FEE_PCT))
            if is_taker
            else Decimal(str(settings.PAPER_MAKER_FEE_PCT))
        ) / 100
        return (size * price * fee_rate).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    # --- ExchangeInterface implementation ---

    async def get_balance(self) -> Decimal:
        return self.balance

    async def get_equity(self) -> Decimal:
        """
        Total account value = cash + margin locked in open positions + unrealized P&L.

        IMPORTANT: ``self.balance`` is the cash available for NEW positions, NOT
        the total account value. When ``place_order`` opens a position, it
        debits the margin from ``self.balance`` (line 178). The margin is still
        the trader's money — just locked. We must add it back when computing
        equity, otherwise:

          - dashboard shows a phantom drawdown of (margin / starting_equity)%
          - risk manager's drawdown check trips the total circuit breaker
            (~25% on a single 4x position at 1.5% risk) immediately after
            entry, force-closing the trade and halting the bot

        Live mode (CoinbaseClient.get_equity) gets correct equity from
        Coinbase's API which already accounts for locked margin. This fix
        makes PaperEngine match that behavior.
        """
        current_price = await self.get_current_price()
        total_margin = sum(p.margin for p in self.positions.values())
        unrealized = sum(p.unrealized_pnl(current_price) for p in self.positions.values())
        return self.balance + total_margin + unrealized

    async def place_order(
        self,
        side: OrderSide,
        size: Decimal,
        order_type: OrderType,
        price: Optional[Decimal] = None,
        stop_price: Optional[Decimal] = None,
        leverage: Decimal = Decimal("4"),
        reduce_only: bool = False,
    ) -> OrderResult:
        order_id = f"paper-{uuid.uuid4().hex[:12]}"

        if order_type == OrderType.MARKET:
            # Fill immediately with slippage
            current_price = await self.get_current_price()
            fill_price = self._apply_slippage(current_price, side)
            fee = self._calculate_fee(size, fill_price, is_taker=True)

            self.total_fees += fee
            self.balance -= fee

            if reduce_only:
                # Closing a position
                pnl = self._close_position_internal(side, size, fill_price)
                self.balance += pnl
                logger.info(
                    "paper_fill_close",
                    order_id=order_id,
                    side=side.value,
                    size=str(size),
                    price=str(fill_price),
                    fee=str(fee),
                    pnl=str(pnl),
                )
            else:
                # Opening a position
                pos_id = f"pos-{uuid.uuid4().hex[:8]}"
                direction = "long" if side == OrderSide.BUY else "short"
                margin = (size * fill_price) / leverage
                self.balance -= margin

                self.positions[pos_id] = PaperPosition(
                    position_id=pos_id,
                    side=direction,
                    size=size,
                    entry_price=fill_price,
                    leverage=leverage,
                )

                logger.info(
                    "paper_fill_open",
                    order_id=order_id,
                    position_id=pos_id,
                    side=direction,
                    size=str(size),
                    price=str(fill_price),
                    fee=str(fee),
                    margin=str(margin),
                )

            result = OrderResult(
                order_id=order_id,
                side=side,
                order_type=order_type,
                size=size,
                price=fill_price,
                filled=True,
                fee=fee,
                timestamp=datetime.now(timezone.utc),
            )
            self.filled_orders.append(result)
            return result

        elif order_type in (OrderType.STOP_MARKET, OrderType.LIMIT):
            # Queue as pending — checked each tick
            pending = PaperOrder(
                order_id=order_id,
                side=side,
                size=size,
                order_type=order_type,
                price=price,
                stop_price=stop_price,
                reduce_only=reduce_only,
            )
            self.pending_orders[order_id] = pending

            logger.info(
                "paper_order_pending",
                order_id=order_id,
                type=order_type.value,
                side=side.value,
                size=str(size),
                price=str(price),
                stop_price=str(stop_price),
            )

            return OrderResult(
                order_id=order_id,
                side=side,
                order_type=order_type,
                size=size,
                price=price,
                stop_price=stop_price,
                filled=False,
                timestamp=datetime.now(timezone.utc),
            )

        raise ValueError(f"Unsupported order type: {order_type}")

    def _close_position_internal(
        self, close_side: OrderSide, size: Decimal, fill_price: Decimal
    ) -> Decimal:
        """Close matching position and return realized P&L."""
        target_side = "short" if close_side == OrderSide.BUY else "long"

        for pos_id, pos in list(self.positions.items()):
            if pos.side == target_side and pos.size == size:
                pnl = pos.unrealized_pnl(fill_price)
                # Return margin to balance
                self.balance += pos.margin
                del self.positions[pos_id]
                return pnl

        # Partial close or no matching position
        for pos_id, pos in list(self.positions.items()):
            if pos.side == target_side:
                pnl = pos.unrealized_pnl(fill_price)
                self.balance += pos.margin
                del self.positions[pos_id]
                return pnl

        logger.warning("no_matching_position_to_close", side=target_side)
        return Decimal("0")

    async def check_pending_orders(self, candle_high: float, candle_low: float) -> list[OrderResult]:
        """
        Check pending orders against candle prices.
        Called on every position management tick.
        Returns list of filled OrderResults.
        """
        filled = []
        to_remove = []

        for order_id, order in self.pending_orders.items():
            triggered = False

            if order.order_type == OrderType.STOP_MARKET:
                if order.side == OrderSide.SELL and candle_low <= float(order.stop_price):
                    # Stop-loss for long: triggered when price drops to stop
                    triggered = True
                elif order.side == OrderSide.BUY and candle_high >= float(order.stop_price):
                    # Stop-loss for short: triggered when price rises to stop
                    triggered = True

            elif order.order_type == OrderType.LIMIT:
                if order.side == OrderSide.BUY and candle_low <= float(order.price):
                    triggered = True
                elif order.side == OrderSide.SELL and candle_high >= float(order.price):
                    triggered = True

            if triggered:
                fill_price = Decimal(str(order.stop_price or order.price))
                fill_price = self._apply_slippage(fill_price, order.side)
                fee = self._calculate_fee(order.size, fill_price, is_taker=True)

                self.total_fees += fee
                self.balance -= fee

                if order.reduce_only:
                    pnl = self._close_position_internal(order.side, order.size, fill_price)
                    self.balance += pnl
                    logger.info(
                        "paper_stop_triggered",
                        order_id=order_id,
                        side=order.side.value,
                        fill_price=str(fill_price),
                        pnl=str(pnl),
                    )

                result = OrderResult(
                    order_id=order_id,
                    side=order.side,
                    order_type=order.order_type,
                    size=order.size,
                    price=fill_price,
                    stop_price=order.stop_price,
                    filled=True,
                    fee=fee,
                    timestamp=datetime.now(timezone.utc),
                )
                filled.append(result)
                self.filled_orders.append(result)
                to_remove.append(order_id)

        for oid in to_remove:
            del self.pending_orders[oid]

        return filled

    async def apply_funding(self) -> Decimal:
        """
        Apply funding rate to all open positions.
        Called every 8 hours. Returns total funding paid/received.
        """
        if not self.positions:
            return Decimal("0")

        funding_info = await self.get_funding_rate()
        total_funding = Decimal("0")

        for pos in self.positions.values():
            # Funding = position_value × funding_rate
            position_value = pos.size * pos.entry_price
            funding = position_value * funding_info.rate

            if pos.side == "long":
                # Longs pay when funding is positive
                self.balance -= funding
                total_funding -= funding
            else:
                # Shorts receive when funding is positive
                self.balance += funding
                total_funding += funding

        self.total_funding += abs(total_funding)
        logger.info("funding_applied", total=str(total_funding), rate=str(funding_info.rate))
        return total_funding

    async def cancel_order(self, order_id: str) -> bool:
        if order_id in self.pending_orders:
            del self.pending_orders[order_id]
            logger.info("paper_order_cancelled", order_id=order_id)
            return True
        return False

    async def get_positions(self) -> list[Position]:
        if not self.positions:
            return []
        current_price = await self.get_current_price()
        return [p.to_position(current_price) for p in self.positions.values()]

    async def get_current_price(self) -> Decimal:
        price = await self.market_client.get_current_price()
        self._last_price = price
        return price

    async def get_candles(self, timeframe: str, limit: int = 200) -> list[dict]:
        return await self.market_client.get_candles(timeframe, limit)

    async def get_funding_rate(self) -> FundingInfo:
        return await self.market_client.get_funding_rate()

    async def close_position(self, side: str, size: Decimal) -> OrderResult:
        close_side = OrderSide.SELL if side == "long" else OrderSide.BUY
        return await self.place_order(
            side=close_side,
            size=size,
            order_type=OrderType.MARKET,
            reduce_only=True,
        )

    async def set_leverage(self, leverage: Decimal) -> bool:
        logger.info("paper_leverage_set", leverage=str(leverage))
        return True

    async def close(self):
        await self.market_client.close()
