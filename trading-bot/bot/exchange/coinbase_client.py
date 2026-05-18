"""
Coinbase Advanced Trade API client for perpetual futures.
Handles REST API calls with auth, rate limiting, and retries.
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import httpx

from bot.exchange.base import (
    ExchangeInterface, OrderResult, OrderSide, OrderType,
    Position, FundingInfo, MarginMode,
)
from bot.exchange.coinbase_auth import CoinbaseAuth
from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("coinbase")

# Timeframe mapping: our format -> Coinbase API granularity
TIMEFRAME_MAP = {
    "1H": "ONE_HOUR",
    "4H": "FOUR_HOUR",
    "1D": "ONE_DAY",
}

# Rate limiting: max 8 concurrent requests (under the 10/s limit)
_semaphore = asyncio.Semaphore(8)


class CoinbaseClient(ExchangeInterface):
    """Live Coinbase Advanced Trade API client."""

    def __init__(self):
        self.base_url = settings.rest_url
        self.auth = CoinbaseAuth(
            api_key=settings.CB_API_KEY,
            api_secret=settings.CB_API_SECRET,
            base_url=self.base_url,
        )
        self.symbol = settings.SYMBOL
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=10.0)
        return self._client

    async def _request(
        self,
        method: str,
        path: str,
        body: Optional[dict] = None,
        retries: int = 3,
    ) -> dict:
        """Make an authenticated API request with rate limiting and retries."""
        body_str = json.dumps(body) if body else ""
        headers = self.auth.get_headers(method, path, body_str)
        url = self.base_url + path

        for attempt in range(retries):
            async with _semaphore:
                try:
                    client = await self._get_client()
                    response = await client.request(
                        method=method,
                        url=url,
                        headers=headers,
                        content=body_str if body else None,
                    )

                    if response.status_code == 429:
                        wait = 2 ** (attempt + 1)
                        logger.warning("rate_limited", wait_seconds=wait, attempt=attempt + 1)
                        await asyncio.sleep(wait)
                        continue

                    if response.status_code >= 500:
                        wait = 2 ** (attempt + 1)
                        logger.warning(
                            "server_error",
                            status=response.status_code,
                            wait_seconds=wait,
                            attempt=attempt + 1,
                        )
                        await asyncio.sleep(wait)
                        continue

                    response.raise_for_status()
                    return response.json()

                except httpx.TimeoutException:
                    if attempt < retries - 1:
                        logger.warning("timeout", attempt=attempt + 1)
                        await asyncio.sleep(2)
                        continue
                    raise
                except httpx.HTTPStatusError as e:
                    logger.error(
                        "api_error",
                        status=e.response.status_code,
                        body=e.response.text[:500],
                        path=path,
                    )
                    raise

        raise RuntimeError(f"Failed after {retries} retries: {method} {path}")

    # --- ExchangeInterface implementation ---

    async def get_balance(self) -> Decimal:
        data = await self._request("GET", "/api/v3/brokerage/accounts")
        for account in data.get("accounts", []):
            if account.get("currency") == "USD":
                return Decimal(account["available_balance"]["value"])
        return Decimal("0")

    async def get_equity(self) -> Decimal:
        balance = await self.get_balance()
        positions = await self.get_positions()
        unrealized = sum(p.unrealized_pnl for p in positions)
        return balance + unrealized

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
        client_order_id = str(uuid.uuid4())

        order_config = {}
        if order_type == OrderType.MARKET:
            order_config["market_market_ioc"] = {
                "base_size": str(size),
            }
        elif order_type == OrderType.LIMIT:
            order_config["limit_limit_gtc"] = {
                "base_size": str(size),
                "limit_price": str(price),
            }
        elif order_type == OrderType.STOP_MARKET:
            order_config["stop_limit_stop_limit_gtc"] = {
                "base_size": str(size),
                "stop_price": str(stop_price),
                "limit_price": str(stop_price),  # same as stop for stop-market behavior
            }

        body = {
            "client_order_id": client_order_id,
            "product_id": self.symbol,
            "side": side.value.upper(),
            "order_configuration": order_config,
        }

        if leverage:
            body["leverage"] = str(leverage)
        if reduce_only:
            body["is_reduce_only"] = True

        logger.info(
            "placing_order",
            side=side.value,
            type=order_type.value,
            size=str(size),
            price=str(price) if price else None,
            stop=str(stop_price) if stop_price else None,
        )

        data = await self._request("POST", "/api/v3/brokerage/orders", body)
        order_data = data.get("success_response", data)

        return OrderResult(
            order_id=order_data.get("order_id", client_order_id),
            side=side,
            order_type=order_type,
            size=size,
            price=price,
            stop_price=stop_price,
            filled=order_data.get("status") == "FILLED",
            timestamp=datetime.now(timezone.utc),
            raw_response=data,
        )

    async def cancel_order(self, order_id: str) -> bool:
        try:
            body = {"order_ids": [order_id]}
            data = await self._request("POST", "/api/v3/brokerage/orders/batch_cancel", body)
            results = data.get("results", [])
            if results:
                return results[0].get("success", False)
            return False
        except Exception as e:
            logger.error("cancel_order_failed", order_id=order_id, error=str(e))
            return False

    async def get_positions(self) -> list[Position]:
        try:
            data = await self._request("GET", "/api/v3/brokerage/cfm/positions")
            positions = []
            for pos in data.get("positions", []):
                if Decimal(pos.get("net_size", "0")) == 0:
                    continue
                net_size = Decimal(pos["net_size"])
                side = "long" if net_size > 0 else "short"
                positions.append(Position(
                    symbol=pos.get("product_id", self.symbol),
                    side=side,
                    size=abs(net_size),
                    entry_price=Decimal(pos.get("entry_vwap", "0")),
                    current_price=Decimal(pos.get("mark_price", "0")),
                    unrealized_pnl=Decimal(pos.get("unrealized_pnl", "0")),
                    margin_used=Decimal(pos.get("margin", "0")),
                    leverage=Decimal(str(settings.LEVERAGE)),
                ))
            return positions
        except Exception as e:
            logger.error("get_positions_failed", error=str(e))
            return []

    async def get_current_price(self) -> Decimal:
        data = await self._request(
            "GET", f"/api/v3/brokerage/market/products/{self.symbol}"
        )
        return Decimal(data.get("price", "0"))

    async def get_candles(self, timeframe: str, limit: int = 200) -> list[dict]:
        granularity = TIMEFRAME_MAP.get(timeframe, "FOUR_HOUR")
        end = int(datetime.now(timezone.utc).timestamp())

        # Calculate start time based on timeframe and limit
        seconds_per_candle = {"1H": 3600, "4H": 14400, "1D": 86400}
        spc = seconds_per_candle.get(timeframe, 14400)
        start = end - (spc * limit)

        path = (
            f"/api/v3/brokerage/market/products/{self.symbol}/candles"
            f"?start={start}&end={end}&granularity={granularity}"
        )
        data = await self._request("GET", path)

        candles = []
        for c in data.get("candles", []):
            candles.append({
                "timestamp": datetime.fromtimestamp(int(c["start"]), tz=timezone.utc),
                "open": float(c["open"]),
                "high": float(c["high"]),
                "low": float(c["low"]),
                "close": float(c["close"]),
                "volume": float(c["volume"]),
            })

        # Coinbase returns newest first, we want oldest first
        candles.sort(key=lambda x: x["timestamp"])
        return candles

    async def get_funding_rate(self) -> FundingInfo:
        try:
            data = await self._request(
                "GET", f"/api/v3/brokerage/market/products/{self.symbol}"
            )
            rate = Decimal(data.get("perpetual_details", {}).get("funding_rate", "0.0001"))
            return FundingInfo(rate=rate)
        except Exception as e:
            logger.warning("funding_rate_fetch_failed", error=str(e))
            return FundingInfo(rate=Decimal("0.0001"))  # default 0.01% per 8h

    async def close_position(self, side: str, size: Decimal) -> OrderResult:
        close_side = OrderSide.SELL if side == "long" else OrderSide.BUY
        return await self.place_order(
            side=close_side,
            size=size,
            order_type=OrderType.MARKET,
            reduce_only=True,
        )

    async def set_leverage(self, leverage: Decimal) -> bool:
        logger.info("set_leverage", leverage=str(leverage))
        # Coinbase sets leverage per-order, not globally
        return True

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
