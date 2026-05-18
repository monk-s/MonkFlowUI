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
        """
        Return available collateral balance for the configured SYMBOL.

        For BTC-PERP-INTX (Coinbase International Exchange perpetuals)
        collateral is denominated in USDC. For CFM (Coinbase Financial Markets)
        futures it's USD. The earlier implementation only looked for USD and
        therefore returned $0 (or a leftover spot balance) for INTX traders.

        Strategy:
          1. Sum available balance across all USDC accounts (INTX collateral)
          2. Sum available balance across all USD accounts (CFM / spot)
          3. Prefer the currency with the larger non-zero balance, with a
             tie-break toward USDC (matches the bot's BTC-PERP-INTX target).
          4. Log which currency was selected for visibility.
        """
        data = await self._request("GET", "/api/v3/brokerage/accounts")
        accounts = data.get("accounts", []) or []

        usdc_total = Decimal("0")
        usd_total = Decimal("0")

        for account in accounts:
            currency = (account.get("currency") or "").upper()
            try:
                val = (account.get("available_balance") or {}).get("value", "0")
                avail = Decimal(str(val))
            except (TypeError, ValueError, KeyError):
                continue
            if currency == "USDC":
                usdc_total += avail
            elif currency == "USD":
                usd_total += avail

        if usdc_total >= usd_total and usdc_total > 0:
            logger.info(
                "balance_selected",
                currency="USDC",
                balance=str(usdc_total),
                usd_also_available=str(usd_total),
            )
            return usdc_total
        if usd_total > 0:
            logger.info(
                "balance_selected",
                currency="USD",
                balance=str(usd_total),
                usdc_also_available=str(usdc_total),
            )
            return usd_total

        logger.warning(
            "no_collateral_balance",
            n_accounts=len(accounts),
            note="Neither USDC nor USD balance found. Bot cannot size positions."
        )
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
            # GAP PROTECTION: Coinbase only offers stop-LIMIT (no true stop-market).
            # If we set limit_price == stop_price, the limit won't fill when price
            # gaps past the stop (CPI prints, sudden whales). We set the limit
            # STOP_LIMIT_SLIPPAGE_PCT worse than the trigger so reasonable gaps
            # still get filled. Direction:
            #   - SELL stop (closes a LONG): limit BELOW stop_price (accept worse sell)
            #   - BUY stop  (closes a SHORT): limit ABOVE stop_price (accept worse buy)
            slip = Decimal(str(settings.STOP_LIMIT_SLIPPAGE_PCT)) / Decimal("100")
            sp = Decimal(str(stop_price))
            if side == OrderSide.SELL:
                limit_price_val = sp * (Decimal("1") - slip)
            else:  # BUY
                limit_price_val = sp * (Decimal("1") + slip)
            # Round to Coinbase's quote_increment (0.1 for BTC-PERP-INTX)
            limit_price_val = limit_price_val.quantize(Decimal("0.1"))
            order_config["stop_limit_stop_limit_gtc"] = {
                "base_size": str(size),
                "stop_price": str(stop_price),
                "limit_price": str(limit_price_val),
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

        # H1: Coinbase returns these status values:
        #   "FILLED"           — completely filled
        #   "PARTIALLY_FILLED" — some quantity filled, rest cancelled/pending
        #   "OPEN" / "PENDING" — accepted but no fills yet (limit/stop)
        #   "CANCELLED" / etc — not filled at all
        # The original code only treated "FILLED" as success. PARTIALLY_FILLED
        # was treated as "not filled" → caller raised RuntimeError → trade
        # record never created → BUT the partial position WOULD still be live
        # on Coinbase, orphaned.
        status = (order_data.get("status") or "").upper()
        is_filled = status == "FILLED"
        is_partial = status == "PARTIALLY_FILLED"

        if is_partial and order_type == OrderType.MARKET and not reduce_only:
            # ORPHAN-AVOIDANCE: market entry that only partially filled.
            # Close the partial position immediately with a reduce_only market
            # order so we don't leave naked exposure on the exchange. Then we
            # still report filled=False so the caller treats this as a
            # failed entry (correct outcome — entry didn't get the planned size).
            filled_size = order_data.get("filled_size") or order_data.get("cumulative_quantity")
            logger.error(
                "partial_fill_detected_auto_closing",
                order_id=order_data.get("order_id"),
                intended_size=str(size),
                filled_size=str(filled_size),
                side=side.value,
            )
            try:
                opposite = OrderSide.SELL if side == OrderSide.BUY else OrderSide.BUY
                # Use the actual filled size if Coinbase reported it, otherwise the
                # intended size (Coinbase will reject if no position exists, which
                # is safe — we just want to ensure no orphaned BTC).
                close_size = Decimal(str(filled_size)) if filled_size else size
                close_config = {"market_market_ioc": {"base_size": str(close_size)}}
                close_body = {
                    "client_order_id": str(uuid.uuid4()),
                    "product_id": self.symbol,
                    "side": opposite.value.upper(),
                    "order_configuration": close_config,
                    "is_reduce_only": True,
                }
                if leverage:
                    close_body["leverage"] = str(leverage)
                await self._request("POST", "/api/v3/brokerage/orders", close_body)
                logger.info("partial_fill_closed", closed_size=str(close_size))
            except Exception as exc:
                logger.critical(
                    "partial_fill_close_FAILED_position_orphaned",
                    error=str(exc),
                    filled_size=str(filled_size),
                    side=side.value,
                )
                # Don't raise — let the caller see filled=False and reject the trade.
                # The orphan needs human attention; the bot's other safety logic
                # (position_manager next tick) may catch it.

        return OrderResult(
            order_id=order_data.get("order_id", client_order_id),
            side=side,
            order_type=order_type,
            size=size,
            price=price,
            stop_price=stop_price,
            filled=is_filled,
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
