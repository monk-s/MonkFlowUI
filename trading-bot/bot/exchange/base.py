"""Abstract exchange interface. Both CoinbaseClient and PaperEngine implement this."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP_MARKET = "stop_market"
    STOP_LIMIT = "stop_limit"


class MarginMode(str, Enum):
    ISOLATED = "isolated"
    CROSS = "cross"


@dataclass
class OrderResult:
    order_id: str
    side: OrderSide
    order_type: OrderType
    size: Decimal
    price: Optional[Decimal] = None  # fill price for market, limit price for limit
    stop_price: Optional[Decimal] = None
    filled: bool = False
    fee: Decimal = Decimal("0")
    timestamp: datetime = field(default_factory=datetime.utcnow)
    raw_response: Optional[dict] = None


@dataclass
class Position:
    symbol: str
    side: str  # "long" or "short"
    size: Decimal  # in base currency (BTC)
    entry_price: Decimal
    current_price: Decimal
    unrealized_pnl: Decimal
    margin_used: Decimal
    leverage: Decimal
    liquidation_price: Optional[Decimal] = None


@dataclass
class FundingInfo:
    rate: Decimal  # per hour
    next_payment_time: Optional[datetime] = None
    interval_hours: int = 8


class ExchangeInterface(ABC):
    """
    All exchange operations go through this interface.
    PaperEngine and CoinbaseClient both implement it.
    """

    @abstractmethod
    async def get_balance(self) -> Decimal:
        """Return available account balance in USD."""
        ...

    @abstractmethod
    async def get_equity(self) -> Decimal:
        """Return total equity (balance + unrealized P&L)."""
        ...

    @abstractmethod
    async def place_order(
        self,
        side: OrderSide,
        size: Decimal,
        order_type: OrderType,
        price: Optional[Decimal] = None,
        stop_price: Optional[Decimal] = None,
        leverage: Decimal = Decimal("4"),
        reduce_only: bool = False,
        post_only: bool = False,
    ) -> OrderResult:
        """Place an order. Returns OrderResult with order_id.

        post_only: when True (LIMIT orders), request maker-only — if the
        order would immediately take liquidity at placement, the exchange
        cancels it instead of executing. Used by the v3 grid trader to
        guarantee maker fees (cheaper) and avoid taking the spread.
        """
        ...

    @abstractmethod
    async def cancel_order(self, order_id: str) -> tuple[bool, Optional[str]]:
        """Cancel an order by ID.

        Returns (success, failure_reason). On success, failure_reason is None.
        On failure, failure_reason is the exchange's reason code (e.g.
        "UNKNOWN_CANCEL_ORDER", "ORDER_IS_FULLY_FILLED",
        "DUPLICATE_CANCEL_REQUEST") so callers can distinguish terminal
        failures (the order is definitively not open on the exchange) from
        retryable ones (the order is still open and may be re-cancelled).
        """
        ...

    @abstractmethod
    async def get_order(self, order_id: str) -> Optional[OrderResult]:
        """Look up an order by ID. Returns None if not found.

        For pending orders, OrderResult.filled is False; price reflects
        the limit/stop level. For filled orders, OrderResult.filled is True
        and price/fee reflect the actual execution. Caller checks .filled
        to decide whether to apply the fill.
        """
        ...

    @abstractmethod
    async def get_positions(self) -> list[Position]:
        """Return all open positions."""
        ...

    @abstractmethod
    async def get_current_price(self) -> Decimal:
        """Return the current market price."""
        ...

    @abstractmethod
    async def get_candles(
        self, timeframe: str, limit: int = 200
    ) -> list[dict]:
        """
        Fetch OHLCV candles. Returns list of dicts:
        [{"timestamp": datetime, "open": float, "high": float,
          "low": float, "close": float, "volume": float}, ...]
        Sorted oldest to newest.
        """
        ...

    @abstractmethod
    async def get_funding_rate(self) -> FundingInfo:
        """Return current funding rate info."""
        ...

    @abstractmethod
    async def close_position(self, side: str, size: Decimal) -> OrderResult:
        """Close a position by placing an opposing market order."""
        ...

    @abstractmethod
    async def set_leverage(self, leverage: Decimal) -> bool:
        """Set leverage for the trading pair."""
        ...
