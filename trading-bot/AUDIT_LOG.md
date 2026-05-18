# Trading Bot Audit Log

---

## Session: 2026-05-18 — Live-Mode Safety Audit (Round 2)

### Goal

Bot is **live** with $2,605.25 USDC on Coinbase BTC-PERP-INTX (regime=choppy,
no positions yet). Hunt for any remaining bugs in the same class as those
already caught (silent-failure accounting, type mismatches, race conditions,
stale-state, asymmetric safety logic) BEFORE the first live signal fires.

### Method

Two Explore agents in parallel:
1. Pattern-match against all bugs already caught (Decimal/float, abs(), silent
   error swallowing, stale state, None guards, currency assumptions)
2. Deep-dive on the 5 money-critical paths (signal→open, position monitoring,
   trade close/P&L, equity+breakers, halt+recovery)

Combined output: 14 candidate issues. Hand-verified each by reading the actual
code (agent claims included 1 hallucinated severity inflation). Then fixed all
verified CRITICAL + HIGH in 7 commits.

### Findings

#### CRITICAL (3) — position-could-be-unprotected bugs

- **[C1]** `order_manager._place_stop_with_retry` — emergency market close
  after 3 stop-placement retries had NO try/except. If Coinbase rejected the
  emergency close (rate limit, position-not-found race, insufficient margin),
  the function raised with no indication the position was LIVE WITH NO STOP.
  FIXED in commit `b3dde87`: emergency close now has its own 3x retry +
  filled=True verification + auto-halt + CRITICAL log if everything fails.

- **[C2]** `order_manager.update_stop` — trailing stop activation cancelled
  the old stop FIRST, then placed the new one. If new placement failed (any
  Coinbase hiccup), the position would have NO stop on the exchange for up
  to 60 seconds. DB would falsely show status=trailing.
  FIXED in commit `5ee4328`: reversed to place-then-cancel. If new placement
  fails, old stop stays live. If cancel-old fails after new is placed:
  harmless (both are reduce_only, only one position exists).

- **[C3]** `coinbase_client.place_order` STOP_MARKET — set `limit_price ==
  stop_price`. If BTC gaps past the stop (news, whale moves), the limit
  doesn't fill and the position keeps losing.
  FIXED in commit `7125719`: limit is now placed `STOP_LIMIT_SLIPPAGE_PCT`
  (default 0.5%) worse than the trigger so reasonable gaps still fill.
  Worst-case extra slippage at current sizing: ~$13/trade.

#### HIGH (7) — wrong numbers / wrong state / wrong outcome

- **[H1]** `coinbase_client.place_order` — partial fills were treated as
  "not filled" → caller raised RuntimeError → trade record never created,
  BUT partial position would be live on Coinbase, orphaned.
  FIXED in commit `c63e2a3`: detect `PARTIALLY_FILLED` status, immediately
  place reduce_only market order to close the partial, return filled=False
  so caller still records a rejected trade.

- **[H2]** `position_manager._close_trade` — `float(trade.entry_price)` and
  `float(trade.stop_price)` without None guards. Recovered-orphan or
  partially-written rows could crash mid-close, leaving DB in "open" while
  position is closed on Coinbase.
  FIXED in commit `3957796`: None-guards added with the same `or 0.0`
  pattern used elsewhere. Bails safely before exchange call if invalid.

- **[H3]** `position_manager.check_positions` — line 60 assigned
  `current_price = float(await self._exchange.get_equity())` then never
  used the variable. Wasted 1,440 Coinbase API calls/day.
  FIXED in commit `3957796`: dead line removed.

- **[H4]** `tb_bot_state.live_balance` column existed in schema but no code
  wrote to it. Permanently NULL.
  FIXED in commit `94ce595`: `balance_snapshot` job now writes equity to
  `tb_bot_state.live_balance` when TRADING_MODE=live.

- **[H5]** `/api/close-all` marked trades `status="closed"` regardless of
  whether Coinbase confirmed the close. User clicks panic button →
  dashboard reports "3 closed" → 1 position still live on exchange.
  FIXED in commit `94ce595`: only updates DB after `result.filled==True`.
  Response shape: `{requested, confirmed_closed, still_open: [trade_ids]}`.

- **[H6]** `order_manager.cancel_all_orders_for_trade` silently swallowed
  cancel failures. Uncancelled stops at trade-close are a phantom-position
  risk (stop triggers after position is gone → opens opposite position).
  FIXED in commit `5ee4328`: returns list of failed order IDs; accepts
  optional repo kwarg to log failures to `tb_bot_log` with the trade_id.

- **[H7]** Both `position_manager._check_portfolio_circuit_breakers` and
  `trade_lifecycle.process_signal` had `weekly_pnl=daily_pnl,
  monthly_pnl=daily_pnl` — making those breakers duplicates of daily.
  Slow-bleed scenarios wouldn't trip.
  FIXED in commit `26b722d`: added `get_weekly_pnl` (7-day rolling) and
  `get_monthly_pnl` (30-day rolling) repo methods. Both filter to
  live-mode trades only (`entry_order_id NOT LIKE 'paper-%'`) so prior
  paper trade results don't pollute live circuit breaker math.

#### MEDIUM (4) — deferred with rationale (tracked as LOW)

- M1: `realized_pnl` doesn't include accrued unpaid funding (reporting
  error <$1/trade at current size)
- M2: JWT auth doesn't include body in signature (auth works in practice;
  AUTH TEST PASSED; will fix if Coinbase ever rejects POSTs)
- M3: `tb_circuit_breakers.starting_equity` stale on capital deposit
  (display only — actual trip math uses live equity)
- M4: Orphan recovery doesn't handle partial fills (edge case, requires
  mid-fill crash; H1 fix makes partial fills auto-close so this never
  fires)

#### Agent claims that turned out FALSE

- Agent 1 claimed `abs()` on daily/weekly/monthly breakers was the same
  pattern as the total breaker bug. **Verified false**: those branches
  are already guarded by `if daily_pnl < 0 else 0.0` upstream, so they
  cannot false-trip on gains. No fix needed.

- Agent 1 claimed line 60 in position_manager was CRITICAL because the
  bad `current_price` value was used to close trades at wrong prices.
  **Verified partially false**: variable IS misnamed and dead, but
  `market_price` (the real value, from `get_current_price()`) is what
  actually flows through to trade decisions. Severity downgraded to HIGH
  (wasted API calls + confusing) and fixed as H3.

### Fixes Applied (in this session)

| Commit | Fix |
|---|---|
| `7125719` | C3: stop-limit slippage buffer |
| `3957796` | H2, H3: None guards + dead code removed |
| `5ee4328` | C2, H6: place-then-cancel + cancel failure tracking |
| `b3dde87` | C1: emergency close hardening + auto-halt |
| `c63e2a3` | H1: partial fill detection + auto-close |
| `94ce595` | H4, H5: live_balance update + close-all verification |
| `26b722d` | H7: real weekly/monthly P&L (live-mode filtered) |

### Verification

- **Unit tests**: 70 → 94 (added 24 new regression tests across
  test_coinbase_client, test_order_manager, test_position_manager,
  test_risk_manager). All pass.
- **E2E tests**: 6/6 still pass against Railway DB (updated mocks for new
  `live_only` kwarg signature)
- **Total**: 100 tests, all green
- **Live bot**: continues running through all redeploys (Railway rolling
  restart, ~30s healthcheck per deploy). No interruption to live trading
  posture. Bot still in choppy regime, no signals, $1000.24 → $2605.25
  equity preserved.

### Next Session Priority

1. Wait for the first live signal (could be hours, could be days — depends
   on when BTC exits choppy regime per ADX≥35 filter)
2. When it fires: verify the full live execution flow against the new
   safety hardening (especially stop placement + position monitoring)
3. Address the 4 MEDIUM items if/when convenient (none are blockers)
4. After 30 closed live trades: pull stats, compare to backtest's
   `adx35` expected expectancy (+0.078R, ~0.4% annual)

### Metrics

- Files modified: 5 (`order_manager.py`, `position_manager.py`,
  `trade_lifecycle.py`, `coinbase_client.py`, `tick_scheduler.py`,
  `repository.py`, `routes.py`, `settings.py`)
- Files added: 2 (`tests/test_order_manager.py`,
  `tests/test_position_manager.py`)
- Test count: 70 → 94 unit + 6 E2E = 100
- Critical bugs caught + fixed: 3
- High bugs caught + fixed: 7
- Medium deferred (LOW): 4
- Agent hallucinations caught: 2
- Audit categories evaluated: 5 critical money paths + 6 pattern classes

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
