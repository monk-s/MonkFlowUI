"""
Fetches and caches OHLCV candles from the exchange.
Handles warm-up (fetching 200+ candles on first boot) and incremental updates.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

from bot.data.indicators import Candle
from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("candle_store")


class CandleStore:
    """
    Manages candle data for the strategy engine.
    Fetches from exchange and caches in the database.
    """

    def __init__(self, exchange, repository):
        self.exchange = exchange
        self.repo = repository
        self._cache_4h: list[Candle] = []
        self._cache_1h: list[Candle] = []

    async def initialize(self) -> None:
        """
        Warm up candle cache on startup.
        Fetches CANDLE_WARMUP_COUNT candles for each timeframe.
        """
        logger.info("warming_up_candles", count=settings.CANDLE_WARMUP_COUNT)

        for timeframe in ("4H", "1H"):
            # Check DB cache first
            db_candles = await self.repo.get_candles(
                settings.SYMBOL, timeframe, limit=settings.CANDLE_WARMUP_COUNT
            )

            if len(db_candles) >= settings.CANDLE_WARMUP_COUNT // 2:
                logger.info(
                    "loaded_from_cache",
                    timeframe=timeframe,
                    count=len(db_candles),
                )

            # Fetch fresh from exchange (will include any new candles)
            raw = await self.exchange.get_candles(timeframe, limit=settings.CANDLE_WARMUP_COUNT)

            if not raw:
                logger.warning("no_candles_fetched", timeframe=timeframe)
                continue

            # Cache to DB (map timestamp → open_time for repository)
            db_rows = [
                {
                    "open_time": c["timestamp"],
                    "open": c["open"],
                    "high": c["high"],
                    "low": c["low"],
                    "close": c["close"],
                    "volume": c["volume"],
                }
                for c in raw
            ]
            await self.repo.upsert_candles(db_rows, settings.SYMBOL, timeframe)

            # Convert to Candle objects
            candles = [
                Candle(
                    timestamp=c["timestamp"],
                    open=c["open"],
                    high=c["high"],
                    low=c["low"],
                    close=c["close"],
                    volume=c["volume"],
                )
                for c in raw
            ]

            if timeframe == "4H":
                self._cache_4h = candles
            else:
                self._cache_1h = candles

            logger.info(
                "candles_warmed_up",
                timeframe=timeframe,
                count=len(candles),
                latest=candles[-1].timestamp.isoformat() if candles else "none",
            )

    async def refresh(self, timeframe: str = "4H") -> list[Candle]:
        """
        Fetch the latest candles and update the cache.
        Called on every strategy tick.
        """
        raw = await self.exchange.get_candles(timeframe, limit=settings.CANDLE_WARMUP_COUNT)

        if not raw:
            logger.warning("refresh_failed_no_data", timeframe=timeframe)
            return self.get_candles(timeframe)

        db_rows = [
            {
                "open_time": c["timestamp"],
                "open": c["open"],
                "high": c["high"],
                "low": c["low"],
                "close": c["close"],
                "volume": c["volume"],
            }
            for c in raw
        ]
        await self.repo.upsert_candles(db_rows, settings.SYMBOL, timeframe)

        candles = [
            Candle(
                timestamp=c["timestamp"],
                open=c["open"],
                high=c["high"],
                low=c["low"],
                close=c["close"],
                volume=c["volume"],
            )
            for c in raw
        ]

        if timeframe == "4H":
            self._cache_4h = candles
        else:
            self._cache_1h = candles

        return candles

    def get_candles(self, timeframe: str = "4H") -> list[Candle]:
        """Return cached candles (oldest to newest)."""
        if timeframe == "4H":
            return self._cache_4h
        return self._cache_1h

    def is_stale(self, timeframe: str = "4H") -> bool:
        """Check if data is too old (> STALE_DATA_THRESHOLD_HOURS)."""
        candles = self.get_candles(timeframe)
        if not candles:
            return True

        latest = candles[-1].timestamp
        if latest.tzinfo is None:
            latest = latest.replace(tzinfo=timezone.utc)

        age = datetime.now(timezone.utc) - latest
        threshold = timedelta(hours=settings.STALE_DATA_THRESHOLD_HOURS)
        return age > threshold

    @property
    def candles_4h(self) -> list[Candle]:
        return self._cache_4h

    @property
    def candles_1h(self) -> list[Candle]:
        return self._cache_1h
