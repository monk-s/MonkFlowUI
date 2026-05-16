# Trading Bot — Deploy Checklist

Track your progress with `[x] / [ ]`. Each item is tagged with who can do it:

- 🤖 = **Claude can do this** (or has already done it)
- 🤝 = **Claude can do with your permission/setup** (e.g. needs you to pick a browser, paste a token, log in once)
- 👤 = **Truly you-only** (KYC, financial decisions, password entry, irreversible production changes you should consciously make)

This is the deploy runbook from "code is committed" → "bot is paper-trading on
Railway" → "bot is live-trading real money". The audit + E2E tests are done
and committed at `c3d82db`.

---

## Phase 1: Get the Code on GitHub

### 🤖 Already done by Claude
- [x] Audit complete (see `AUDIT_LOG.md`)
- [x] Diff self-reviewed: CB_SANDBOX flip is correct, escapeHtml applied to all user-controlled fields, requirements.txt has greenlet
- [x] Branch is committed locally (2 commits ahead of `origin/main`):
  - `c60f279` — initial trading bot (57 files)
  - `c3d82db` — audit fixes + E2E suite + this checklist

### 🤝 Needs your one-time auth setup, then Claude can take over

The push is the only blocker. Three options, in order of "least effort to maintain long-term":

**Option A — SSH key (recommended, one-time):**
- [ ] 👤 Tell Claude: "generate me an SSH key for GitHub". Claude creates the keypair and prints the public key.
- [ ] 👤 Paste the public key at https://github.com/settings/ssh/new (give it a name like "MonkFlow MacBook"), click "Add SSH key", and confirm with your password.
- [ ] 🤖 Claude switches the git remote from HTTPS to SSH and runs `git push`.
- [ ] 🤖 Claude verifies the push succeeded.

**Option B — Personal Access Token (one-time):**
- [ ] 👤 Visit https://github.com/settings/tokens?type=beta and click "Generate new token". Scope it to the `monk-s/MonkFlowUI` repo with `Contents: Read and write` permission. Set expiration (90 days is reasonable).
- [ ] 👤 Copy the token (starts with `github_pat_...`).
- [ ] 👤 In your terminal, run `git push origin claude/musing-moser-47f6c6` and paste the token when prompted for "Password". macOS keychain stores it for next time.

**Option C — Use GitHub via Chrome (no terminal):**
- [ ] 🤝 Tell Claude: "use Chrome MCP to push and create the PR" — Claude will ask which connected browser is the one logged into GitHub.
- [ ] 🤖 Claude navigates to the PR creation page and submits.
  *(Note: Chrome MCP can create the PR if you're logged in but cannot directly do `git push` — you'd still need Option A or B for the actual push.)*

### 🤝 Once pushed, Claude can do these:
- [ ] 🤖 Open the PR (via Chrome MCP if you pick a browser logged into GitHub) at https://github.com/monk-s/MonkFlowUI/compare/main...claude/musing-moser-47f6c6
- [ ] 🤖 Review the diff one more time and confirm CI status
- [ ] 👤 **Merge to `main`** — this is the irreversible "ship it" decision. Claude can click the merge button via Chrome MCP if you say so, but the call is yours.

---

## Phase 2: Coinbase Derivatives Account  *(only required for live mode)*

Skip this entire phase if you're starting in paper mode (recommended). Come back to it after you've watched paper trading for 7-14 days.

### 👤 You-only (account, KYC, financial decisions)
- [ ] 👤 Log into https://www.coinbase.com/advanced-trade and confirm your account has perpetual futures access (Coinbase Financial Markets / CFM — separate approval from spot trading).
- [ ] 👤 If not approved: apply at https://www.coinbase.com/advanced-trade/futures (US residents only, KYC + suitability questionnaire).
- [ ] 👤 Once approved, fund your derivatives wallet. **Recommend $500-$1,000 max for the first live week.**

### 🤝 Key generation — you create the keys, Claude tells you what scopes to set
- [ ] 👤 Generate API keys at https://www.coinbase.com/settings/api with these scopes ONLY:
      - **View** (required for balance + positions + market data)
      - **Trade** (required for placing/canceling orders)
      - **DO NOT** enable **Transfer** (the bot doesn't move funds; disabling Transfer means a leaked key cannot drain your account)
- [ ] 👤 Save the key + secret somewhere safe (1Password). Coinbase only shows the secret once.
- [ ] 🤖 (Optional) IP-allowlist the keys to Railway's egress IPs — Claude can fetch those from Railway after first deploy and tell you what to paste.

---

## Phase 3: Railway Service Setup

### 🤝 Could be done in Chrome — but Railway changes are real, you should drive
- [ ] 👤 Open the Railway project: https://railway.com/project/09edcfef-5018-4634-a69b-df2f23abf8e8
- [ ] 👤 Click **+ New** → **GitHub Repo** → select `monk-s/MonkFlowUI`
- [ ] 👤 In the new service **Settings**:
      - **Root Directory**: `trading-bot`
      - **Build Command**: leave blank (Nixpacks auto-detects from `requirements.txt` + `runtime.txt`)
      - **Start Command**: leave blank (uses `Procfile`)
      - **Healthcheck Path**: `/health`
      - (Healthcheck Timeout 30, Restart Policy ON_FAILURE max 5 retries are already set in `railway.toml`)
- [ ] 👤 Service name suggestion: `trading-bot`
- [ ] 👤 Don't generate the public domain yet — wait until env vars are set and the first deploy succeeds.

*Claude offer: if you want, Claude can drive this via Chrome MCP. Each click happens in front of you so you can stop at any point. Just say "use Chrome MCP for Railway setup".*

---

## Phase 4: Environment Variables  *(Railway → Variables tab)*

### 👤 You set these (production secrets — your call)

**Required for paper mode (set these first):**
- [ ] `TRADING_MODE=paper`
- [ ] `DATABASE_URL` → set to the **reference variable** `${{Postgres.DATABASE_URL}}`
- [ ] `LOG_LEVEL=INFO`
- [ ] `PORT` — leave unset; Railway assigns automatically.

**Required for live mode (set these only when flipping):**
- [ ] `CB_API_KEY=<production key from Phase 2>`
- [ ] `CB_API_SECRET=<production secret from Phase 2>`
- [ ] `CB_SANDBOX=false` (default — explicit is safer)
- [ ] `TRADING_MODE=live`

**Optional overrides:**
- [ ] `RISK_PER_TRADE_PCT` (default 1.5)
- [ ] `LEVERAGE` (default 4.0)
- [ ] `MAX_CONCURRENT_POSITIONS` (default 2)
- [ ] `MAX_PORTFOLIO_HEAT_PCT` (default 5.0)
- [ ] `CB_DAILY_MAX_DRAWDOWN_PCT` (default 5.0)

---

## Phase 5: First Deploy + Schema Creation

### 🤖 Already pre-validated by Claude
- [x] Schema preflight ran against Railway DB — all 7 tables instantiate cleanly via `Base.metadata.create_all`. Total: 7 tables, 84 columns, 13 indexes. Test schemas dropped CASCADE; production `public` is untouched.

### 🤖 + 👤 Auto-deploys; Claude verifies after
- [ ] 👤 Railway auto-deploys on first push to `main`. Watch the build log.
- [ ] 🤖 After first deploy completes, Claude runs the verification queries below for you. Just say "verify the deploy".
      ```sql
      -- Tables created (expect 7)
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE 'tb_%'
      ORDER BY table_name;
      -- Bot state singleton seeded
      SELECT * FROM tb_bot_state WHERE id=1;
      ```
- [x] 🤖 Note logged: the Alembic migration is currently bypassed (`init_db()` uses `Base.metadata.create_all` instead of `alembic upgrade head`). Schema is equivalent. MEDIUM follow-up in `AUDIT_LOG.md`.

---

## Phase 6: Generate Public Domain + Verify Dashboard

### 👤 You click; 🤖 Claude verifies
- [ ] 👤 In Railway: trading-bot service → **Settings** → **Networking** → **Public Networking** → click **Generate Domain**.
- [ ] 🤖 Once you have the URL, paste it to Claude. Claude will:
      - Hit `/health` and verify the JSON response
      - Hit `/api/overview`, `/api/config`, `/api/trades`, `/api/positions` and verify shapes
      - Optionally: open the URL in Chrome MCP and visually verify each of the 6 tabs renders

---

## Phase 7: First Strategy Tick  *(within 4 hours of deploy)*

### 🤖 Claude can verify all of these post-deploy
- [ ] 👤 Wait for the next scheduled strategy tick (UTC 00:00, 04:00, 08:00, 12:00, 16:00, or 20:00 + 1 minute).
- [ ] 🤖 Claude greps Railway logs for `strategy_tick_complete` (or you paste the log if Claude doesn't have Railway log access).
- [ ] 🤖 Claude runs all post-tick verification queries:
      ```sql
      SELECT level, component, message, created_at FROM tb_bot_log ORDER BY created_at DESC LIMIT 20;
      SELECT current_regime, last_heartbeat FROM tb_bot_state WHERE id=1;
      SELECT timeframe, COUNT(*), MAX(open_time) FROM tb_candles GROUP BY timeframe;
      ```

---

## Phase 8: Paper Trading Observation Period  *(7-14 days minimum)*

### 👤 You observe over time; 🤖 Claude can run check-in queries on demand

This is your safety net — paper data lets you confirm strategies work before any real money is on the line.

- [ ] 👤 **Day 1**: 🤖 ask Claude to verify `tb_balance_history` is growing (should add ~96 rows/day, every 15 min).
- [ ] 👤 **Day 1**: 🤖 ask Claude for first signal/rejection summary.
- [ ] 👤 **Day 3**: Check Trade History tab. 🤖 Claude can pull this same data via SQL if you don't want to use the dashboard.
- [ ] 👤 **Day 7**: 🤖 ask Claude for a stats summary (win rate, expectancy, profit factor) by running:
      ```sql
      SELECT COUNT(*) FILTER (WHERE status='target') AS wins,
             COUNT(*) FILTER (WHERE status='stopped') AS losses,
             AVG(r_multiple) FILTER (WHERE r_multiple IS NOT NULL) AS avg_r,
             SUM(net_pnl) FILTER (WHERE status IN ('target','stopped')) AS total_pnl
      FROM tb_trades WHERE status IN ('target','stopped');
      ```
- [ ] 👤 **Day 7**: 🤖 ask Claude to verify circuit breakers haven't tripped:
      ```sql
      SELECT * FROM tb_circuit_breakers WHERE is_tripped=true;
      ```
- [ ] 👤 **Day 14 (recommended)**: At least 5-10 closed paper trades. **If win rate < 30% or expectancy is negative, DO NOT flip to live**. 🤖 Claude can produce a written summary of paper performance to inform the go/no-go decision.

---

## Phase 9: Pre-Live Verification

### 👤 + 🤖 You set, Claude verifies
- [ ] 👤 Confirm Coinbase Advanced shows your derivatives wallet funded.
- [ ] 👤 In Railway, set `CB_API_KEY` + `CB_API_SECRET` from Phase 2 but **leave `TRADING_MODE=paper`**.
- [ ] 👤 Redeploy.
- [ ] 🤖 Ask Claude to verify boot — Claude reads `tb_bot_log` for `live_exchange_ready` or absence of auth errors.
- [ ] 👤 Manually verify the API key was used: visit https://www.coinbase.com/settings/api and check the "last used" timestamp on the key.
- [ ] 🤖 Ask Claude to confirm dashboard still shows `mode=PAPER` and `equity=$10,000.00`.

---

## Phase 10: Live Switch  *(the irreversible step — drive yourself)*

### 👤 Final pre-flight
- [ ] 👤 Take a screenshot of:
      - Coinbase derivatives wallet balance (the source of truth)
      - Current `tb_bot_state` (🤖 ask Claude to dump this)
      - Open positions on Coinbase (should be 0 if you haven't traded manually)

### 👤 Flip the switch (you, consciously)
- [ ] 👤 In Railway → trading-bot → Variables, set `TRADING_MODE=live`
- [ ] 👤 Click **Deploy** (or it auto-redeploys on env change).

### 🤖 Claude can verify post-flip
- [ ] 🤖 Ask Claude to verify boot logs show `live_exchange_ready` and zero `coinbase` errors.
- [ ] 🤖 Ask Claude to verify `bot_state.live_balance` populated correctly:
      ```sql
      SELECT trading_mode, live_balance, paper_balance FROM tb_bot_state WHERE id=1;
      ```
- [ ] 👤 Wait for the first live signal. **Be at your computer with the dashboard open during the first 4H tick** so you can manually halt if anything looks wrong.

---

## Phase 11: Post-Live Monitoring  *(first 30 days)*

### 👤 Daily ops; 🤖 Claude pulls data on demand
- [ ] 👤 **Daily**: open dashboard, eyeball equity + open positions + recent trades.
- [ ] 🤖 **Daily**: ask Claude to grep Railway logs for `error` level entries.
- [ ] 🤖 **Weekly**: ask Claude to compare live vs paper (slippage, fees, R-multiples).
- [ ] 👤 **Halt and audit if any of these happen** (🤖 Claude monitors `tb_trades` and `tb_bot_log` for these on demand):
      - 3 consecutive losses
      - Daily drawdown > 3% (well before the 5% breaker)
      - Weekly drawdown > 7%
      - `stop_placement_failed_emergency_closed` log appears
      - Sustained Coinbase API errors

---

## Emergency Halt Procedure  *(memorize — could happen at 3am)*

You have **three independent halt paths**, in increasing severity:

### Option A — Dashboard halt (graceful)
- [ ] 👤 Dashboard → Config tab → click **Halt Bot**
      Bot keeps monitoring positions but stops accepting new signals. Open positions stay open with stops/targets.

### Option B — Railway env flip (immediate kill switch for new trades)
- [ ] 👤 Railway → trading-bot → Variables → set `TRADING_MODE=paper` → Deploy. Bot reboots in paper mode (~1 min).
- [ ] **Important**: this does NOT close existing live positions. Close them manually on Coinbase if needed.

### Option C — Direct DB halt (last resort, fastest)
- [ ] 🤖 Tell Claude: "halt the bot via DB". Claude runs:
      ```sql
      UPDATE tb_bot_state
         SET is_halted=true, halt_reason='emergency manual halt'
       WHERE id=1;
      ```
      Bot's next position-tick (within 60s) sees the halt and stops.

### After any halt
- [ ] 👤 Manually close any open positions in Coinbase Advanced UI if needed.
- [ ] 🤖 Ask Claude to summarize the failure (Bot Log + Railway logs).
- [ ] 👤 Resume only after root cause is understood and fixed.

---

## Reference Quick Links

- **Railway project**: https://railway.com/project/09edcfef-5018-4634-a69b-df2f23abf8e8
- **GitHub PR base**: https://github.com/monk-s/MonkFlowUI/compare/main...claude/musing-moser-47f6c6
- **Coinbase Advanced Trade**: https://www.coinbase.com/advanced-trade/futures
- **Coinbase API keys**: https://www.coinbase.com/settings/api
- **Audit findings**: `trading-bot/AUDIT_LOG.md`
- **E2E test runner**:
  ```bash
  cd trading-bot
  TRADING_BOT_E2E_DB_URL='postgresql://USER:PASS@HOST:PORT/DB' \
    python -m pytest tests/test_e2e_pipeline.py -v
  ```

---

## Summary of "Claude can do" actions you can hand off

After the initial push (which needs your one-time auth setup), Claude can autonomously do all of these for you on demand:

| Action | Why it's possible |
|---|---|
| Verify post-deploy: 7 tables exist, bot_state seeded | DB access via the `DATABASE_PUBLIC_URL` you shared |
| Verify dashboard: `/health`, `/api/overview`, etc. respond | Once you share the public Railway URL |
| Pull paper-trading stats (win rate, expectancy, R-mult) | DB access |
| Compare live vs paper performance weekly | DB access |
| Emergency halt via DB | DB access |
| Drive Railway/Coinbase web UIs | Chrome MCP, if you grant a browser session |
| Re-run E2E test suite after any code change | Local + Railway DB |
| Re-audit the codebase after each change | Read access |

Claude **cannot** do (these are physically impossible without you):
- KYC and Coinbase derivatives account approval
- Generating Coinbase API keys (requires your password)
- Funding your Coinbase wallet
- Final "merge to main" / "set TRADING_MODE=live" decisions (irreversible)
