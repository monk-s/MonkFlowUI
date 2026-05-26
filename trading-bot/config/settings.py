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

    # --- Live order safety ---
    # Stop-limit gap protection: Coinbase places stop-LIMIT orders, so if
    # price gaps past the stop_price the limit at stop_price won't fill.
    # We set the limit STOP_LIMIT_SLIPPAGE_PCT worse than the trigger so
    # any reasonable gap still fills. Worst-case extra slippage on a
    # 1.5% risk trade at $2,605 equity is ~$13 (= 0.5% * size * leverage).
    # See order_manager.py + coinbase_client.py STOP_MARKET branch.
    STOP_LIMIT_SLIPPAGE_PCT: float = 0.5  # percent

    # --- Dashboard ---
    DASHBOARD_PORT: int = 8080
    DASHBOARD_HOST: str = "0.0.0.0"
    PORT: int = 8080  # Railway sets this

    # --- Scheduling ---
    STRATEGY_TICK_HOURS: str = "0,4,8,12,16,20"  # UTC hours for 4H candle closes
    POSITION_CHECK_INTERVAL_SEC: int = 60
    CANDLE_WARMUP_COUNT: int = 200  # fetch 200 candles for indicator warmup
    STALE_DATA_THRESHOLD_HOURS: int = 8  # flag stale if > 8h old

    # ── v3: Grid Trader ─────────────────────────────────────────────────────
    # Which engine to run. "ema_trend" is the v1 legacy strategy (deprecated).
    # "grid" is the v3 lean-long hybrid grid trader.
    BOT_ENGINE: Literal["ema_trend", "grid"] = "grid"

    # Pre-buy: % of starting capital to immediately allocate to a LONG
    # perp position on first deploy.
    # 50% = "moderate aggressive" baseline (+58% annual in backtest)
    # 70% = "more aggressive" variant (+100% annual in backtest, ~-2pp DD)
    # User confirmed 2026-05-26 they want the 70% variant; chosen for the
    # asymmetric reward profile (~2x expected gain for ~1.6x downside).
    # See data/profitability_roadmap.png + AUDIT_LOG.md.
    GRID_PREBUY_PCT: float = 70.0

    # Number of grid levels (evenly spaced across the active range).
    # 30 levels with ~$9.6K capital = ~$320/level after 50% pre-buy.
    GRID_NUM_LEVELS: int = 30

    # Range mode. "dynamic" recenters every GRID_RECENTER_DAYS based on
    # recent N-day high/low (no hindsight bias). "static" uses
    # GRID_STATIC_RANGE_LOW/HIGH (set once and never change).
    GRID_RANGE_MODE: Literal["dynamic", "static"] = "dynamic"

    # Dynamic mode: how many days of history to use when recentering,
    # and how often to recenter.
    GRID_RECENTER_DAYS: int = 60          # lookback window for high/low
    GRID_RECENTER_INTERVAL_DAYS: int = 60 # how often to rebuild the grid
    # Padding added to recent-range bounds (15% = grid extends 15% above
    # recent high and 15% below recent low, so we don't immediately get
    # blown out of range by normal volatility).
    GRID_RANGE_PADDING_PCT: float = 15.0

    # Static-range fallback (only used when GRID_RANGE_MODE=static).
    GRID_STATIC_RANGE_LOW: float = 50000.0
    GRID_STATIC_RANGE_HIGH: float = 110000.0

    # Grid tick: how often the bot checks the orderbook + fills + level set.
    # 30s is plenty for grid trading; faster ticks just burn rate-limit budget.
    GRID_TICK_INTERVAL_SEC: int = 30

    # Maker-only safety. If True, only POST_ONLY limit orders are placed.
    # Falls back to taker only when GRID_TAKER_FALLBACK is True AND a
    # retry threshold is exceeded (handled in grid_order_manager).
    GRID_MAKER_ONLY: bool = True
    GRID_TAKER_FALLBACK: bool = False

    # How many price levels above and below current price to keep populated
    # at any time. 10 each side = 20 total open orders concurrently.
    # Combined with 70% pre-buy, this aggressive sizing roughly maxes out
    # the Coinbase 25% margin cap on a $9.6K account — fully utilizing
    # available margin for fill frequency (~2× the 5-per-side variant)
    # without crossing into reckless territory. See AUDIT_LOG 2026-05-26.
    GRID_OPEN_ORDERS_PER_SIDE: int = 10

    # Order staleness: cancel + replace if an open order is older than this
    # many minutes without filling. Catches edge cases where the price
    # drifted away from the order and a stale level is no longer relevant.
    GRID_ORDER_STALE_MINUTES: int = 1440  # 24h default

    # Grid-level equity drawdown circuit breaker. If peak-to-trough equity
    # DD ≥ this %, the bot cancels all open orders, market-closes the perp
    # position, and halts. Re-arm requires manual unhalt AND daily close
    # above the 50-day MA.
    GRID_DD_CIRCUIT_BREAKER_PCT: float = 40.0
    GRID_DD_REARM_MA_DAYS: int = 50

    # Long-only floor. When True, sell orders only execute if current
    # position size exceeds prebuy_qty + 1 level worth (prevents the grid
    # from accidentally flipping net-short during a strong uptrend).
    GRID_LONG_ONLY: bool = True

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
