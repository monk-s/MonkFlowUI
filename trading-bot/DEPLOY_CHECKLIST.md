# Trading Bot — Deploy Checklist

Track your progress with `[x] / [ ]`. Items marked **(Claude can't do this)**
require human action — typically web UI clicks, account approvals, or
credential entry.

This checklist takes you from "code is committed" → "bot is paper-trading on
Railway" → "bot is live-trading real money". The audit + E2E tests are done.
What's left is mostly clicking buttons in Railway and Coinbase.

---

## Phase 1: Get the Code on GitHub  *(Claude can't do this — auth required)*

- [ ] On your machine, push the branch:
      ```bash
      cd /Users/nathanlinder/Desktop/MonkFlowUI
      git push origin claude/musing-moser-47f6c6
      ```
      If push fails with "Password authentication is not supported" — GitHub
      dropped password auth in 2021. Generate a Personal Access Token at
      https://github.com/settings/tokens (give it `repo` scope), then run the
      push again and paste the token as the password.
- [ ] Open the PR: https://github.com/monk-s/MonkFlowUI/compare/main...claude/musing-moser-47f6c6
- [ ] Review the diff. Pay particular attention to `config/settings.py`
      (verify `CB_SANDBOX = False` default is intentional) and
      `dashboard/static/dashboard.js` (escapeHtml additions).
- [ ] Merge to `main`.

---

## Phase 2: Coinbase Derivatives Account  *(only required for live mode — skip if paper-only for now)*

- [ ] Log into https://www.coinbase.com/advanced-trade and confirm your account
      has perpetual futures access. The product is **Coinbase Financial Markets
      (CFM)** — separate approval from spot trading.
- [ ] If not approved: apply at https://www.coinbase.com/advanced-trade/futures
      (US residents only, requires KYC + agreement to derivatives terms +
      passing the suitability questionnaire).
- [ ] Once approved, fund your derivatives wallet with the amount you're
      willing to risk. **Recommend $500-$1,000 max for the first live week.**
- [ ] Generate API keys at https://www.coinbase.com/settings/api with the
      following scopes:
      - **View** (required for balance + positions + market data)
      - **Trade** (required for placing/canceling orders)
      - Do NOT enable **Transfer** (the bot doesn't move funds, and disabling
        Transfer means a leaked key can't drain your account).
- [ ] (Recommended) Click **Restrict IP addresses** on the key and lock it
      down to Railway's egress IPs. Get those from Railway support or the
      Networking tab on the trading-bot service after first deploy.
- [ ] Save the key + secret somewhere safe (1Password, etc). Coinbase only
      shows the secret once.

---

## Phase 3: Railway Service Setup  *(Claude can't do this — needs your Railway login)*

- [ ] Open the Railway project: https://railway.com/project/09edcfef-5018-4634-a69b-df2f23abf8e8
- [ ] Click **+ New** → **GitHub Repo** → select `monk-s/MonkFlowUI`
- [ ] On the new service, open **Settings**:
      - **Root Directory**: `trading-bot`
      - **Build Command**: leave blank (Nixpacks auto-detects from `requirements.txt` + `runtime.txt`)
      - **Start Command**: leave blank (uses `Procfile`)
      - **Healthcheck Path**: `/health`
      - **Healthcheck Timeout**: `30` (already in `railway.toml`)
      - **Restart Policy**: ON_FAILURE, max 5 retries (already in `railway.toml`)
- [ ] Service name suggestion: `trading-bot`
- [ ] Don't generate the public domain yet — wait until env vars are set
      and the first deploy succeeds.

---

## Phase 4: Environment Variables  *(Railway → Variables tab)*

### Required for paper mode (set these first)

- [ ] `TRADING_MODE=paper`
- [ ] `DATABASE_URL` → set to the **reference variable**
      `${{Postgres.DATABASE_URL}}` so the bot uses the same Postgres as the
      main MonkFlow app (it lives in its own `tb_*` table prefix, no
      collisions).
- [ ] `LOG_LEVEL=INFO`
- [ ] `PORT` — leave unset; Railway assigns it automatically.

### Required for live mode (set these only when you're ready to flip)

- [ ] `CB_API_KEY=<your production key from Phase 2>`
- [ ] `CB_API_SECRET=<your production secret from Phase 2>`
- [ ] `CB_SANDBOX=false` (this is now the default but explicit is safer)
- [ ] `TRADING_MODE=live`

### Optional (only override hardcoded defaults if you have a reason)

- [ ] `RISK_PER_TRADE_PCT` (default 1.5)
- [ ] `LEVERAGE` (default 4.0)
- [ ] `MAX_CONCURRENT_POSITIONS` (default 2)
- [ ] `MAX_PORTFOLIO_HEAT_PCT` (default 5.0)
- [ ] `CB_DAILY_MAX_DRAWDOWN_PCT` (default 5.0)

---

## Phase 5: First Deploy + Schema Creation

- [ ] Railway should auto-deploy on first push to `main`. Watch the build log
      in the Railway UI.
- [ ] On boot, the bot calls `init_db()` which runs
      `Base.metadata.create_all` and creates 7 tables in the `public` schema:
      `tb_bot_state`, `tb_trades`, `tb_trade_events`, `tb_balance_history`,
      `tb_circuit_breakers`, `tb_candles`, `tb_bot_log`.
- [ ] Verify tables exist by querying the Railway DB:
      ```sql
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE 'tb_%'
      ORDER BY table_name;
      ```
      Expected: 7 rows.
- [ ] Note: the Alembic migration in `migrations/versions/001_initial_schema.py`
      is currently **not run** by the bot — `Base.metadata.create_all` is
      used instead. The schema is equivalent (same CHECK constraints and
      indexes). This is logged as a MEDIUM follow-up in `AUDIT_LOG.md`.

---

## Phase 6: Generate Public Domain + Verify Dashboard

- [ ] In Railway: trading-bot service → **Settings** → **Networking** →
      **Public Networking** → click **Generate Domain**.
- [ ] Open the generated URL — you should see the dashboard HTML with 6 tabs:
      Overview / Positions / Trade History / Equity Curve / Bot Log / Config.
- [ ] Click each tab to verify it renders without JS errors. Open the browser
      console (F12) and look for any red errors.
- [ ] **Tab 1 (Overview)** check:
      - Mode badge shows `PAPER`
      - Equity shows `$10,000.00`
      - Regime shows `unknown` initially (will populate after first 4H tick)
      - Heat bar shows `0%`
- [ ] **Tab 6 (Config)** check: shows hardcoded values — `risk_per_trade=1.5`,
      `leverage=4`, `max_positions=2`, `min_rr=2`, etc.
- [ ] Hit `/health` directly: `https://YOUR-DOMAIN/health` should return
      `{"status":"ok","service":"trading-bot"}`.

---

## Phase 7: First Strategy Tick  *(within 4 hours of deploy)*

- [ ] Wait for the next scheduled strategy tick (UTC 00:00, 04:00, 08:00,
      12:00, 16:00, or 20:00 + 1 minute).
- [ ] In Railway logs, search for `strategy_tick_complete`. You should see:
      ```
      strategy_tick_start  → regime_detected  → no_signal_this_tick (or signal_processed)  → strategy_tick_complete
      ```
- [ ] Verify the bot log table received entries:
      ```sql
      SELECT level, component, message, created_at FROM tb_bot_log
      ORDER BY created_at DESC LIMIT 20;
      ```
- [ ] Verify the regime was detected:
      ```sql
      SELECT current_regime, last_heartbeat FROM tb_bot_state WHERE id=1;
      ```
- [ ] Verify the candle cache populated:
      ```sql
      SELECT timeframe, COUNT(*), MAX(open_time) FROM tb_candles
      GROUP BY timeframe;
      ```
      Expected: ~200 4H candles + ~200 1H candles.

---

## Phase 8: Paper Trading Observation Period  *(7-14 days minimum)*

This is your safety net — paper data lets you confirm the strategies behave as
expected before any real money is on the line.

- [ ] **Day 1**: Verify the position-monitor tick runs every 60 seconds —
      `tb_balance_history` should grow by ~96 rows per day (every 15 min).
- [ ] **Day 1**: At least one strategy tick should have generated either a
      signal (logged with reason) or a "no signal" entry. If you see neither,
      something is wrong with the strategy evaluation.
- [ ] **Day 3**: Check Trade History tab → at least 1-3 paper trades should
      have been attempted. They may all be `rejected` if market is choppy
      (regime=`choppy` blocks all signals — this is by design).
- [ ] **Day 7**: Check Trade History → look at win rate, expectancy, profit
      factor. Gut check: are R:R targets being hit? Are stops being respected?
- [ ] **Day 7**: Equity curve tab should render. Check the equity chart shape
      vs the drawdown chart.
- [ ] **Day 7**: Verify no circuit breakers tripped accidentally on paper
      losses. Query: `SELECT * FROM tb_circuit_breakers WHERE is_tripped=true;`
- [ ] **Day 14 (recommended)**: At least 5-10 closed paper trades. **If win
      rate < 30% or expectancy is negative, DO NOT flip to live**. Investigate
      strategy logic first or reduce position sizing further.

---

## Phase 9: Pre-Live Verification  *(do all of these before flipping to live)*

- [ ] Confirm Coinbase Advanced shows your **derivatives wallet** (CFM,
      separate from your main spot wallet) funded with the amount you're
      willing to risk.
- [ ] In Railway, set `CB_API_KEY` + `CB_API_SECRET` from Phase 2 but **leave
      `TRADING_MODE=paper`** for now. This lets you verify the keys are
      readable without authorizing real trades yet.
- [ ] Redeploy. Check Railway logs for `live_exchange_ready` (or absence of
      auth errors during paper mode — paper still uses CoinbaseClient for
      market data only, so bad keys won't cause errors yet).
- [ ] Manually verify the API key works by visiting
      https://www.coinbase.com/settings/api — your key should show recent
      "last used" timestamp.
- [ ] Sanity-check the dashboard: `mode=PAPER`, `equity=$10,000.00`. The bot
      is still paper-trading, just connected to live API keys.

---

## Phase 10: Live Switch  *(the irreversible step)*

- [ ] **Final pre-flight**: take a screenshot of:
      - Current Coinbase derivatives wallet balance
      - Current `tb_bot_state` row (`SELECT * FROM tb_bot_state WHERE id=1;`)
      - Current open positions on Coinbase (should be 0 if you haven't
        traded manually)
- [ ] In Railway → trading-bot → Variables, set:
      - `TRADING_MODE=live`
- [ ] Click **Deploy** (Railway redeploys automatically on env change).
- [ ] Watch the boot log for:
      - `live_exchange_ready` event
      - Absence of any `coinbase` component errors
      - Dashboard Overview shows `mode=LIVE` and your **real** Coinbase
        balance (not $10,000).
- [ ] **Immediately** verify `bot_state.live_balance` populates correctly:
      ```sql
      SELECT trading_mode, live_balance, paper_balance FROM tb_bot_state WHERE id=1;
      ```
- [ ] Wait for first live signal. **Be at your computer with the dashboard
      open during the first 4H tick** so you can manually halt if anything
      looks off (see Emergency Halt Procedure below).

---

## Phase 11: Post-Live Monitoring  *(first 30 days)*

- [ ] **Daily**: Open dashboard, check equity, open positions, recent trades.
- [ ] **Daily**: Check Railway logs for any `error` level entries.
      Set up Railway log alerts if available.
- [ ] **Weekly**: Compare live trades to the paper trades from Phase 8 — does
      live behavior match paper? If live trades have significantly worse
      slippage or fees, investigate.
- [ ] **If any of these happen, manually halt and audit before resuming**:
      - 3 consecutive losses
      - Daily drawdown exceeds 3% (well before the 5% circuit breaker fires)
      - Weekly drawdown exceeds 7%
      - Any position fails to place a stop order (look for
        `stop_placement_failed_emergency_closed` log)
      - Coinbase API returns sustained errors

---

## Emergency Halt Procedure  *(memorize this — could happen at 3am)*

You have **three independent ways** to halt the bot, listed in increasing
severity:

### Option A — Dashboard halt (graceful)
- [ ] Open dashboard → Config tab → click **Halt Bot**
- [ ] Bot keeps monitoring positions but stops accepting new signals.
- [ ] Open positions stay open with their stops/targets.

### Option B — Railway env flip (immediate kill switch for new trades)
- [ ] Railway → trading-bot → Variables → set `TRADING_MODE=paper`
- [ ] Click Deploy. Bot reboots in paper mode within ~1 minute.
- [ ] **Important**: this does NOT close existing live positions. They remain
      on Coinbase and you must close them manually.

### Option C — Direct DB halt (last resort)
- [ ] Connect to Railway Postgres and run:
      ```sql
      UPDATE tb_bot_state
         SET is_halted=true, halt_reason='emergency manual halt'
       WHERE id=1;
      ```
- [ ] Bot's next position-tick (within 60s) sees the halt and stops.

### After any halt
- [ ] Manually close any open positions in the Coinbase Advanced UI if needed.
- [ ] Investigate the cause via dashboard Bot Log tab + Railway logs.
- [ ] Resume only after root cause is understood and fixed.

---

## Reference Quick Links

- **Railway project**: https://railway.com/project/09edcfef-5018-4634-a69b-df2f23abf8e8
- **GitHub PR base**: https://github.com/monk-s/MonkFlowUI/compare/main...claude/musing-moser-47f6c6
- **Coinbase Advanced Trade**: https://www.coinbase.com/advanced-trade/futures
- **Coinbase API keys**: https://www.coinbase.com/settings/api
- **Audit findings**: see `AUDIT_LOG.md` in this directory
- **E2E test runner**:
  ```bash
  cd trading-bot
  TRADING_BOT_E2E_DB_URL='postgresql://USER:PASS@HOST:PORT/DB' \
    python -m pytest tests/test_e2e_pipeline.py -v
  ```
