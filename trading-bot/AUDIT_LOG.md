# Trading Bot Audit Log

---

## Session: 2026-05-15 — Initial E2E Audit + Fixes

### Goal

Comprehensive static + dynamic audit of the trading-bot codebase before first
Railway deploy. Verify the bot can boot end-to-end, generate signals, place
orders, monitor positions, and serve the dashboard against a real PostgreSQL
database. Catch bugs that would only surface in production.

### Method

- **Static audit** — Cross-referenced repository SQL against migration columns,
  scanned for hardcoded secrets, verified Coinbase API integration, audited
  dashboard JS for XSS vectors, checked deployment files (Procfile,
  requirements.txt, railway.toml), reviewed test coverage gaps.
- **Dynamic audit** — Booted the bot locally with `python -m bot.main` against
  an isolated PostgreSQL schema (`tb_e2e_dynamic`) on the Railway database,
  hit every dashboard endpoint, verified the strategy/position scheduler
  registered and uvicorn served the dashboard.
- **E2E test suite** — Built `tests/test_e2e_pipeline.py` (6 test cases)
  exercising the full pipeline against a real PostgreSQL schema
  (`tb_e2e_test`, dropped CASCADE on teardown).

### Findings

#### CRITICAL

- **[A9] `greenlet` missing from `requirements.txt`** — SQLAlchemy's async
  layer (`sqlalchemy[asyncio]`) requires `greenlet` at runtime, but it is not
  declared. On Railway the bot would crash on first DB call with
  `ValueError: the greenlet library is required to use this function.` — FIXED
  by adding `greenlet==3.1.1` to `requirements.txt`.

- **[A6] `CB_SANDBOX=True` default breaks paper trading** — Default settings
  pointed market-data calls at `https://api-sandbox.coinbase.com`, which
  returned **404 Not Found** for `BTC-PERP-INTX` (sandbox does not host that
  product). With the default, the bot logs `candle_warmup_failed` then never
  generates signals because `len(candles_4h) < 50` on every tick. Verified
  production endpoint returns full product data and 200+ candles without auth.
  — FIXED by changing the default in `config/settings.py` to `CB_SANDBOX=False`,
  with an inline comment explaining why, and updating `.env.example` to match.

#### HIGH

- **[A8] Dashboard `innerHTML` lacks HTML escaping** — `dashboard/static/dashboard.js`
  injects `l.message`, `l.component`, `t.strategy`, `t.status`, `p.strategy`,
  and config keys/values directly into `innerHTML` via template literals. While
  most fields are bot-controlled enums (low realistic XSS risk), `bot_log.message`
  often contains the body of failed Coinbase API responses, which are arbitrary
  upstream text. — FIXED by adding an `escapeHtml()` helper and applying it to
  every untrusted field in logs, trades, positions, and config rendering.

#### MEDIUM (deferred — recommendations only)

- **[A2/A9] Migration file is dead code** — `bot/persistence/database.py:init_db()`
  uses `Base.metadata.create_all()` instead of running Alembic migrations.
  `migrations/versions/001_initial_schema.py` therefore never executes. The
  schema is equivalent (models declare matching CHECK constraints + indexes),
  so production tables are correct, but the seed `INSERT INTO tb_bot_state...`
  in the migration never runs. Repository's `get_bot_state()` covers this by
  creating the singleton on first call, so behavior is correct but redundant.
  **Recommended fix** (next session): replace `init_db()` with `alembic upgrade
  head` for proper migration discipline going forward.

- **[Performance] `upsert_candles` does N round-trips** — Inserts 200 candles
  via 200 separate `pg_insert` statements inside one session. On the Railway
  cross-region link this took ~24 seconds per timeframe (48s total boot).
  On Railway's co-located service this will be ~2-3 seconds, so not a
  production blocker, but should be a single bulk INSERT...ON CONFLICT for
  cleanliness. **Recommended fix**: rewrite as one `pg_insert(Candle).values([...])`
  call with all rows.

- **[Performance] `/api/overview` makes 9 sequential awaits** — 6 DB queries +
  3 exchange calls in series. Slow on cross-region Railway latency (~3s+ here
  but timed out my 3s curl). Should `await asyncio.gather(...)` the
  independent calls. **Recommended fix**: parallelize the independent awaits.

#### LOW

- **[A12] 8 modules without dedicated unit tests** — `candle_store.py`,
  `order_manager.py`, `position_manager.py`, `trailing_stop.py`,
  `tick_scheduler.py`, `coinbase_client.py`, `database.py`, `models.py`,
  `repository.py`, `base.py`, `main.py`. **Mitigation**: the new
  `test_e2e_pipeline.py` covers most of these indirectly through the full
  pipeline (lifecycle, repo, paper engine, scheduler-equivalent calls,
  dashboard). Coinbase live client remains untested — acceptable since unit
  testing it requires either a real sandbox account or extensive mocking.

#### PASSED

- **[A1] Settings & defaults** — Pydantic settings load cleanly. `TRADING_MODE`
  literal `"paper"|"live"` matches `main.py` checks. Risk constants match the
  trading guide (1.5% / 4× / 2:1 / 5% heat / -5/-10/-15/-25 circuit breakers).
  `PORT` env var preferred over `DASHBOARD_PORT` for Railway.

- **[A2] Schema vs models** — All `__tablename__` values present in models match
  the migration. CHECK constraints declared in both `Migration` and `Models`
  with matching enum values. Indexes match.

- **[A3] Strategy thresholds vs `bitcoin-derivatives-guide.md`** — All values
  align: ADX > 25 trending, ADX < 20 ranging, EMA(9/26), pullback tolerance
  0.2%, body ratio ≥ 50%, BB(20, 2.0), RSI(14) 30/70, ATR stop 1.5×, trailing
  activation 1R + 1×ATR distance.

- **[A4] Risk manager** — All 6 checks fire in correct order (circuit breaker →
  heat → max positions → opposing → risk% → R:R). Circuit breaker math uses
  `abs(daily_dd_pct)` correctly. Verified end-to-end via E2E
  `test_daily_drawdown_circuit_breaker_blocks_trade`.

- **[A5] Trade lifecycle state machine** — `process_signal` returns `"open"`,
  `"rejected"`, or `"error"` consistently. `_create_rejected_trade` writes
  audit row even on errors. `recover_orphaned_trades` correctly handles the
  `entry_pending → cancelled` transition (verified by E2E test).

- **[A6] Coinbase API correctness** — Endpoints under `/api/v3/brokerage/*`
  (correct API version). HMAC signing format `timestamp + method + path + body`
  matches Coinbase docs. Rate limit semaphore at 8/sec is under the 10/sec
  limit. Retry policy: 3× exponential backoff (2s/4s/8s) on 429+5xx. Verified
  `BTC-PERP-INTX` is the live product ID via `curl https://api.coinbase.com/api/v3/brokerage/market/products/BTC-PERP-INTX`.

- **[A7] Error handling & resilience** — Every scheduler tick wrapped in
  `try/except Exception`. No bare `except:` clauses anywhere in `bot/` or
  `dashboard/`. `get_positions()` returns `[]` on error (doesn't propagate).

- **[A10] Security** — No hardcoded API keys, secrets, or passwords in `bot/`
  or `config/`. Secrets only loaded from environment via Pydantic Settings.
  `CB_API_SECRET` not logged anywhere.

- **[A11] Logging & observability** — structlog configured with mode prefix
  via `_add_mode_prefix` processor (every log line includes `mode: "PAPER"` or
  `"LIVE"`). Log level configurable via `LOG_LEVEL`. JSON renderer for
  Railway, console renderer for local DEBUG. Heartbeat job runs every 5 min,
  balance snapshot every 15 min.

### Fixes Applied (in this session, pre-commit)

1. `requirements.txt` — added `greenlet==3.1.1` to runtime deps.
2. `config/settings.py` — flipped `CB_SANDBOX` default to `False` with
   explanatory comment about sandbox not hosting `BTC-PERP-INTX`.
3. `.env.example` — updated `CB_SANDBOX=false` with matching warning.
4. `dashboard/static/dashboard.js` — added `escapeHtml()` helper and applied
   it to every `innerHTML` insertion of bot-log/trade/position/config strings.
5. `tests/test_e2e_pipeline.py` — new file with 6 E2E test cases (full
   lifecycle, risk rejections (×2), circuit breaker, orphan recovery,
   dashboard health) running against an isolated `tb_e2e_test` schema.
6. `tests/conftest.py` — no changes (existing fixtures sufficient).
7. `pytest.ini` — new file declaring `asyncio_mode = strict` for explicit
   event loop scoping.

### Verification

- **Unit tests**: `python -m pytest tests/ --ignore=tests/test_e2e_pipeline.py`
  → 67 passed in 4.36s
- **E2E tests**: `TRADING_BOT_E2E_DB_URL=<url> python -m pytest tests/test_e2e_pipeline.py`
  → 6 passed in 65.29s
  - `test_signal_opens_trade_and_records_audit_trail` — full happy path
  - `test_max_concurrent_positions_blocks_new_signal` — risk gate works
  - `test_low_rr_signal_rejected` — sub-2.0 R:R blocked
  - `test_daily_drawdown_circuit_breaker_blocks_trade` — breaker fires
  - `test_orphan_pending_with_no_position_is_cancelled` — recovery works
  - `test_health_and_state_endpoints_respond` — dashboard responds
- **Dynamic boot**: `python -m bot.main` with default settings reaches
  `bot_ready` event in ~62 seconds (cross-region Railway). Dashboard `/health`
  returns `{"status":"ok","service":"trading-bot"}`. No 404s. Scheduler
  registered with strategy hours `0,4,8,12,16,20` UTC and 60s position tick.
- **Schema isolation verified**: After all tests, `tb_e2e_test` and
  `tb_e2e_dynamic` schemas were dropped CASCADE. Public schema untouched
  (no `tb_*` tables created in production area).

### Next Session Priority

1. **User action**: Push branch + open PR + merge — see `DEPLOY_CHECKLIST.md`.
2. **User action**: Create Railway service for `trading-bot/` and configure
   env vars per `DEPLOY_CHECKLIST.md` Phase 4.
3. **MEDIUM fix**: Replace `init_db()` with `alembic upgrade head` so
   migrations are the source of truth going forward.
4. **MEDIUM fix**: Bulk-insert candles in `upsert_candles` (rewrite as a
   single `pg_insert(...).values([rows]).on_conflict_do_update(...)`).
5. **MEDIUM fix**: Parallelize independent awaits in `/api/overview` with
   `asyncio.gather`.
6. **Post-deploy verification** (per DEPLOY_CHECKLIST.md Phase 6-7):
   verify `/health` returns 200 from public Railway URL, verify first 4H
   strategy tick fires, verify `tb_*` tables created in public schema.

### Metrics

- Files modified: 4 (`requirements.txt`, `config/settings.py`,
  `.env.example`, `dashboard/static/dashboard.js`)
- Files added: 3 (`tests/test_e2e_pipeline.py`, `pytest.ini`, this `AUDIT_LOG.md`)
- Tests added: 6 E2E
- Total test count: 73 (67 unit + 6 E2E), all passing
- Critical bugs fixed: 2
- High bugs fixed: 1
- Medium recommendations logged: 3
- Low recommendations logged: 1
- Audit categories evaluated: 12 of 12 (A1-A12)
