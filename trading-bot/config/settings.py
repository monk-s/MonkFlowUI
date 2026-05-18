"""
Centralized configuration loaded from environment variables with Pydantic validation.
All risk management parameters are hardcoded defaults from the trading guide.
"""

from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Mode ---
    TRADING_MODE: Literal["paper", "live"] = "paper"

    # --- Exchange (Coinbase Advanced) ---
    CB_API_KEY: str = ""
    CB_API_SECRET: str = ""
    CB_API_PASSPHRASE: str = ""
    # CB_SANDBOX defaults to False because Coinbase Sandbox does not host
    # BTC-PERP-INTX (returns 404). Paper trading still uses production market
    # data endpoints (read-only, no auth required) but never places real orders.
    # Only set CB_SANDBOX=true if you have a sandbox account configured for
    # a product the sandbox actually supports (e.g. BTC-USD spot).
    CB_SANDBOX: bool = False
    CB_REST_URL: str = "https://api.coinbase.com"
    CB_SANDBOX_REST_URL: str = "https://api-sandbox.coinbase.com"
    CB_WS_URL: str = "wss://advanced-trade-ws.coinbase.com"
    CB_SANDBOX_WS_URL: str = "wss://advanced-trade-ws-sandbox.coinbase.com"
    SYMBOL: str = "BTC-PERP-INTX"

    # --- Database ---
    DATABASE_URL: str = "postgresql+asyncpg://localhost:5432/trading_bot"

    # --- Risk Management (hardcoded from trading guide) ---
    RISK_PER_TRADE_PCT: float = 1.5
    MAX_RISK_PER_TRADE_PCT: float = 2.0
    MIN_RR_RATIO: float = 2.0
    MAX_PORTFOLIO_HEAT_PCT: float = 5.0
    MAX_CONCURRENT_POSITIONS: int = 2
    LEVERAGE: float = 4.0
    MARGIN_MODE: str = "isolated"
    MAX_MARGIN_USAGE_PCT: float = 25.0  # margin can't exceed 25% of equity

    # --- Circuit Breakers ---
    CB_DAILY_MAX_DRAWDOWN_PCT: float = 5.0
    CB_WEEKLY_MAX_DRAWDOWN_PCT: float = 10.0
    CB_MONTHLY_MAX_DRAWDOWN_PCT: float = 15.0
    CB_TOTAL_MAX_DRAWDOWN_PCT: float = 25.0

    # --- Strategy: EMA Trend Following ---
    EMA_FAST_PERIOD: int = 9
    EMA_SLOW_PERIOD: int = 26
    EMA_PULLBACK_TOLERANCE_PCT: float = 0.2  # price must be within 0.2% of EMA
    EMA_SLOPE_THRESHOLD: float = 0.002  # 0.2% slope over 5 bars
    # TREND_ADX_THRESHOLD raised from 25 → 35 on 2026-05-18 based on
    # data/backtest/POC_ANALYSIS.md (365-day BTC-PERP-INTX). adx35 was the
    # only config with positive profit factor on the full year (1.06), best
    # full-year return (+0.40%), and lowest trade frequency (~2/month) —
    # filters out regime-flicker entries during chop. See AUDIT_LOG.md.
    TREND_ADX_THRESHOLD: float = 35.0
    EMA_BODY_RATIO_MIN: float = 0.5  # candle body >= 50% of range

    # --- Strategy: BB/RSI Mean Reversion ---
    BB_PERIOD: int = 20
    BB_STD_DEV: float = 2.0
    RSI_PERIOD: int = 14
    RSI_OVERSOLD: float = 30.0
    RSI_OVERBOUGHT: float = 70.0
    RANGE_ADX_THRESHOLD: float = 20.0
    BB_BANDWIDTH_EXPANSION_MAX: float = 1.2  # max 1.2x avg bandwidth
    BB_BANDWIDTH_CONTRACTION_MIN: float = 0.5  # min 0.5x avg bandwidth

    # --- ATR ---
    ATR_PERIOD: int = 14
    ATR_STOP_MULTIPLIER: float = 1.5
    EMA_STOP_BUFFER_PCT: float = 0.003  # 0.3% buffer below EMA for stops

    # --- Trailing Stop ---
    TRAILING_ACTIVATION_R: float = 1.0
    TRAILING_DISTANCE_ATR: float = 1.0

    # --- Regime Detection ---
    REGIME_CONFIRMATION_CANDLES: int = 2  # need 2 consecutive same-regime candles
    REGIME_ADX_AMBIGUOUS_LOW: float = 20.0
    REGIME_ADX_AMBIGUOUS_HIGH: float = 25.0
    REGIME_EMA_SEPARATION_THRESHOLD: float = 0.01  # 1% EMA separation

    # --- Paper Trading ---
    PAPER_STARTING_BALANCE: float = 10000.0
    PAPER_SLIPPAGE_PCT: float = 0.03
    PAPER_TAKER_FEE_PCT: float = 0.06
    PAPER_MAKER_FEE_PCT: float = 0.04

    # --- Dashboard ---
    DASHBOARD_PORT: int = 8080
    DASHBOARD_HOST: str = "0.0.0.0"
    PORT: int = 8080  # Railway sets this

    # --- Scheduling ---
    STRATEGY_TICK_HOURS: str = "0,4,8,12,16,20"  # UTC hours for 4H candle closes
    POSITION_CHECK_INTERVAL_SEC: int = 60
    CANDLE_WARMUP_COUNT: int = 200  # fetch 200 candles for indicator warmup
    STALE_DATA_THRESHOLD_HOURS: int = 8  # flag stale if > 8h old

    # --- Logging ---
    LOG_LEVEL: str = "INFO"

    @property
    def rest_url(self) -> str:
        return self.CB_SANDBOX_REST_URL if self.CB_SANDBOX else self.CB_REST_URL

    @property
    def ws_url(self) -> str:
        return self.CB_SANDBOX_WS_URL if self.CB_SANDBOX else self.CB_WS_URL

    @property
    def mode_label(self) -> str:
        return "PAPER" if self.TRADING_MODE == "paper" else "LIVE"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


settings = Settings()
