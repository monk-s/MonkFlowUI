# MonkFlow — Continuous Audit & Improvement System

> **Auto-read by Claude Code on every session startup.**
> This file instructs Claude to continuously audit, improve, and harden the MonkFlow platform.

## How This Works

```
┌─────────────────────────────────────────────────┐
│  START SESSION                                  │
│                                                 │
│  1. Run CRITICAL CHECKS (blocking issues)       │
│  2. Run FULL AUDIT (all 12 categories)          │
│  3. Prioritize findings by severity             │
│  4. Fix issues top-down until context ~80%      │
│  5. Commit + push changes                       │
│  6. Verify deployment succeeds                  │
│  7. Log what was done + what's next             │
│  8. Wait for next session                       │
│                                                 │
│  REPEAT FOREVER                                 │
└─────────────────────────────────────────────────┘
```

**Rules:**
- Always commit working code. Never push broken state.
- Run syntax checks (`node -e "new (require('vm')).Script(require('fs').readFileSync(f,'utf8'))"`) on every modified file before committing.
- Test SQL changes against production DB before deploying.
- Fix critical/high issues before working on improvements.
- Stop working at ~80% context usage to leave room for the user to do manual tasks.
- Leave ~10% context for final commit + push + verification.
- Log all changes to `AUDIT_LOG.md` in the project root (append, never overwrite).

---

## 1. CRITICAL CHECKS (Run First Every Session)

These are blocking checks — if any fail, fix them before doing anything else.

### 1.1 Server Health
```bash
curl -s https://resourceful-abundance-production.up.railway.app/api/v1/health
```
- Expected: `{"status":"ok","timestamp":"..."}`
- If down: check Railway deploy logs, recent commits, database connectivity

### 1.2 Database Connectivity
```js
// Connect from server/ directory
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL, ssl: false });
const [{ now }] = (await pool.query('SELECT NOW() AS now')).rows;
// Verify migrations are current
const migs = (await pool.query('SELECT name FROM _migrations ORDER BY id DESC LIMIT 5')).rows;
```

### 1.3 Frontend Reachable
```bash
curl -s -o /dev/null -w "%{http_code}" https://monkflow.io
```
- Expected: `200`

### 1.4 Recent Error Check
```bash
# Check Railway logs for errors in last deployment
# Look at the Deployments tab — is the latest deploy ACTIVE or FAILED?
```

### 1.5 Git State
```bash
git status                    # Any uncommitted changes from last session?
git log --oneline -5          # What was the last change?
git diff --stat HEAD~1        # What files changed?
```

---

## 2. FULL AUDIT CATEGORIES

Run all 12 categories. For each, collect findings as: CRITICAL / HIGH / MEDIUM / LOW. Fix in that order.

---

### Category A: SQL ↔ Schema Cross-Reference

**What:** Every SQL query in every controller/service must reference columns that actually exist in production.

**How:**
1. Dump production schema:
   ```sql
   SELECT table_name, column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public'
   ORDER BY table_name, ordinal_position;
   ```
2. Grep all `.js` files in `server/src/` for SQL patterns (SELECT, INSERT, UPDATE, DELETE in backtick strings)
3. Cross-reference every column name against the schema dump
4. Flag any column that doesn't exist → CRITICAL

**Files to check:**
- `server/src/controllers/*.js` (22 files)
- `server/src/services/*.js` (18 files)
- `server/src/models/*.js` (10 files)

**Common failure modes:**
- Column renamed in migration but not in code (e.g., `finished_at` vs `completed_at`)
- Column added to INSERT but parameter count doesn't match `$N` placeholders
- Column referenced on wrong table (e.g., `opened_at` on `outreach_emails` vs `outreach_leads`)

---

### Category B: Frontend JavaScript Errors

**What:** The frontend is a 7,400+ line vanilla JS SPA. Any runtime error kills the page.

**How:**
1. Syntax check: `new (require('vm')).Script(require('fs').readFileSync('app.js', 'utf8'))`
2. Search for common crash patterns:
   - `.toFixed()` / `.toUpperCase()` / `.toLowerCase()` on potentially null values
   - `${obj.property}` in template literals where `obj` could be null
   - Missing `escapeHtml()` on user-controlled data (XSS)
   - Undefined function references
   - Missing closing braces/parentheses in template literals
   - Event handlers referencing functions that don't exist
3. Check all `fetch`/`api.get`/`api.post` calls have proper error handling
4. Verify all page render functions are referenced from `renderMainContent()`

**Key functions to audit:**
- `renderOutreachPage()`, `renderOutreachAnalyticsPage()`
- `renderDashboardPage()`, `renderAnalyticsPage()`
- `renderWorkflowsPage()`, `renderAgentsPage()`
- `renderProjectsPage()`, `renderBillingPage()`
- `renderAdminPage()`, `renderSettingsPage()`
- All modal functions: `showModal()`, `viewOutreachLead()`, etc.

---

### Category C: API Endpoint Security

**What:** Every endpoint must have proper auth, validation, and error handling.

**How:**
1. Read each routes file — verify auth middleware is applied to protected routes
2. Check that webhook/tracking endpoints (no auth) validate their inputs
3. Verify rate limiting is applied appropriately
4. Check for SQL injection vectors (string concatenation instead of parameterized queries)
5. Check for open redirects (user-controlled URLs in redirects)
6. Verify CORS configuration matches production domains

**Checklist per route file:**
- [ ] `router.use(authenticate)` before protected routes
- [ ] Unauthenticated routes (webhooks, tracking) are before the auth middleware
- [ ] Webhook endpoints verify signatures/secrets
- [ ] No `req.params` or `req.query` values used in raw SQL strings
- [ ] Error responses don't leak stack traces in production

---

### Category D: Email Deliverability & Outreach

**What:** The cold email system must send correctly, track engagement, and handle replies.

**How:**
1. Check outreach email HTML for deliverability issues:
   - Tracking pixel present and URL correct
   - Unsubscribe link present and functional
   - RFC 5322 threading headers (In-Reply-To, References)
   - Plain text fallback
   - No broken HTML tags
2. Verify sender rotation logic:
   - All 10 senders cycling properly
   - Health check excludes unhealthy senders
   - Daily limits enforced per-sender and globally
3. Check warming schedule matches current day count
4. Verify the bridge INSERT (`leads` → `outreach_leads`) succeeds with proper JSONB stringification
5. Test reply detection webhook endpoint
6. Verify A/B variant tracking is recording correctly

**Production queries to run:**
```sql
-- Check recent sends
SELECT COUNT(*), date_trunc('day', sent_at)::date as day
FROM outreach_emails WHERE sent_at >= CURRENT_DATE - 7
GROUP BY day ORDER BY day;

-- Check sender distribution
SELECT sender_email, COUNT(*) FROM sender_health
WHERE date >= CURRENT_DATE - 7 GROUP BY sender_email;

-- Check bridge is working (outreach_leads linked to leads)
SELECT COUNT(*) FROM outreach_leads WHERE source_lead_id IS NOT NULL;

-- Check for orphaned active leads (stuck with no next_followup)
SELECT COUNT(*) FROM outreach_leads
WHERE status = 'active' AND next_followup_at IS NULL AND touch_count < 4;
```

---

### Category E: Database Integrity

**What:** Tables, indexes, constraints, and data quality.

**How:**
1. Verify all expected indexes exist
2. Check for orphaned records (foreign key violations that constraints should prevent)
3. Look for NULL values in required columns
4. Check for data type mismatches (e.g., boolean stored as string)
5. Verify migration table is in sync with migration files on disk

**Queries:**
```sql
-- Missing indexes (tables with >1000 rows and no index on common query columns)
SELECT schemaname, tablename, indexname FROM pg_indexes
WHERE schemaname = 'public' ORDER BY tablename;

-- Duplicate emails in outreach (constraint should prevent)
SELECT contact_email, COUNT(*) FROM outreach_leads
GROUP BY contact_email HAVING COUNT(*) > 1;

-- Migration sync check
SELECT name FROM _migrations ORDER BY id;
```

---

### Category F: Error Handling & Resilience

**What:** Every async operation must have proper error handling. No unhandled promise rejections.

**How:**
1. Search for `await` calls not wrapped in try/catch
2. Search for `.then()` without `.catch()`
3. Check that `catchAsync` wrapper is used on all controller functions
4. Verify background schedulers have error handling (a failed cron tick shouldn't crash the server)
5. Check that external API calls (Anthropic, Resend, Stripe) have timeouts and retries
6. Verify the global error handler catches all error types

**Grep patterns:**
```
await.*(?!.*catch)           # await without catch
\.then\((?!.*\.catch)        # .then without .catch
pool\.query(?!.*catch)       # raw DB queries without catch
```

---

### Category G: Performance & Scalability

**What:** Queries should be efficient, responses fast, and memory usage bounded.

**How:**
1. Look for N+1 query patterns (queries inside loops)
2. Check for missing `LIMIT` on potentially large result sets
3. Look for `SELECT *` that could be `SELECT specific_columns`
4. Check if large JSON responses are paginated
5. Verify connection pool settings are appropriate
6. Look for memory leaks (growing arrays, unclosed connections, event listener accumulation)

**Common issues:**
- `indexOf()` inside a `for` loop (O(n²))
- Loading all leads into memory instead of streaming/paginating
- JSON.stringify on large objects in hot paths
- Missing database connection release in error paths

---

### Category H: Frontend UX & Visual Bugs

**What:** UI rendering, responsiveness, accessibility, and visual consistency.

**How:**
1. Check all pages render without JavaScript errors
2. Verify loading states exist for async operations
3. Check empty states (what shows when there's no data?)
4. Verify modals close properly and don't stack
5. Check toast notifications show for all error/success cases
6. Look for hardcoded colors that should use CSS variables
7. Check responsive breakpoints (mobile, tablet)
8. Verify icon consistency (same icon set throughout)
9. Check pagination works on all list pages

---

### Category I: Authentication & Authorization

**What:** Auth flows must be bulletproof. No unauthorized access.

**How:**
1. Verify JWT token expiration is enforced
2. Check refresh token rotation (old tokens invalidated after use)
3. Verify `requireSuperadmin` middleware on admin-only routes
4. Check that users can only access their own data (user_id filtering)
5. Verify password reset flow is secure (token expiration, one-time use)
6. Check rate limiting on auth endpoints (login, signup, password reset)

---

### Category J: Billing & Payment Integrity

**What:** Stripe integration, invoice generation, usage tracking must be accurate.

**How:**
1. Verify Stripe webhook signature verification
2. Check invoice calculation logic matches plan pricing
3. Verify usage counters reset correctly (monthly)
4. Check that plan limits are enforced (workflow runs, agent tasks)
5. Verify subscription status changes propagate correctly

---

### Category K: Integration Health

**What:** External service connections (Google Calendar, QuickBooks, Resend, Anthropic).

**How:**
1. Check OAuth token refresh logic for expiring tokens
2. Verify API keys are loaded from environment (not hardcoded)
3. Check timeout configurations for external API calls
4. Verify webhook handlers validate payloads
5. Check that integration failures don't crash the server

---

### Category L: Code Quality & Maintainability

**What:** DRY violations, dead code, inconsistent patterns, documentation gaps.

**How:**
1. Find duplicate functions across files (e.g., `addBusinessDays` in multiple places)
2. Find unused exports / dead code
3. Check for inconsistent naming (camelCase vs snake_case)
4. Look for TODO/FIXME/HACK comments that need addressing
5. Check that new features follow existing patterns (controller → service → model)
6. Verify all environment variables have defaults or validation

---

## 3. IMPROVEMENT BACKLOG

After fixing all audit findings, work through these improvements in priority order:

### Tier 1 — Reliability (Do First)
1. **Add comprehensive health check** — `/api/v1/health` should verify DB, Redis (if added), scheduler status, external API reachability
2. **Add request validation** — Zod schemas for all endpoints (currently only auth/user/workflow have them)
3. **Add structured error logging** — Pino logger in all controllers, not just index.js
4. **Database query timeout** — Add `statement_timeout` to prevent long-running queries

### Tier 2 — Observability
5. **Error tracking integration** — Sentry or similar for production error aggregation
6. **API response time logging** — Middleware to log slow requests (>500ms)
7. **Scheduler health dashboard** — Track last successful run time for each cron job
8. **Database connection pool monitoring** — Alert when pool is exhausted

### Tier 3 — Testing
9. **Critical path unit tests** — Auth login/signup, workflow execution, payment webhooks
10. **Integration tests** — API endpoint tests with supertest
11. **Database migration tests** — Verify all migrations run clean on empty DB
12. **Email template rendering tests** — Verify HTML output is valid

### Tier 4 — Performance
13. **Add caching layer** — Cache expensive queries (analytics, dashboard stats)
14. **Optimize large queries** — Add missing indexes, rewrite N+1 patterns
15. **Frontend code splitting** — Break 7,400-line app.js into modules (if build step added)
16. **Image/asset optimization** — Lazy loading, compression

### Tier 5 — Features
17. **Webhook retry queue** — Failed webhooks should retry with exponential backoff
18. **Audit log** — Track admin actions (user changes, config updates)
19. **API documentation** — Auto-generate OpenAPI spec from route definitions
20. **Multi-tenant improvements** — Data isolation verification, tenant-scoped queries

---

## 4. FILE REFERENCE MAP

### Backend (server/src/)
```
controllers/   (22 files) — HTTP handlers
  auth, user, team, workflow, agent, dashboard, admin,
  appointment, notification, log, setting, apiKey, contact,
  project, leadgen, outreach, billing, quickbooks, plan,
  integration, webhook, stonkbot

services/      (18 files) — Business logic
  auth, appointment, email, invoice, billing,
  workflow.engine, agent.executor, google-calendar, quickbooks,
  workflow.scheduler, leadgen.scheduler, billing.scheduler,
  outreach.scheduler, leadgen, outreach-ai, reply-detector,
  integration

models/        (10 files) — Database access
  user, workflow, agent, appointment, invoice, qbo,
  integration, leadgen, refreshToken

routes/        (22 files) — Endpoint definitions
middleware/    (6 files)  — auth, errorHandler, validate, rateLimiter, requireSuperadmin, checkUsage
config/        (3 files)  — database, cors, env
utils/         (5 files)  — ApiError, catchAsync, pagination, crypto, logger
validators/    (5 files)  — auth, user, workflow, agent, appointment
migrations/    (34 files) — 001 through 034
```

### Frontend
```
app.js         (7,400+ lines) — Entire SPA
styles.css     (3,570 lines)  — All styles
index.html     (40 lines)     — Shell
```

### Database Tables (24 tables)
```
users, team_members, refresh_tokens, api_keys
workflows, workflow_executions, execution_logs
agents, agent_executions
leads, outreach_leads, outreach_emails, sender_health
appointments, availability_rules, blocked_dates
notifications, contact_messages
projects, project_updates, project_files
plans, invoices, usage_overages
user_integrations, qbo_connections, qbo_customer_map
```

### Deployment
```
Backend:  Railway (resourceful-abundance-production.up.railway.app)
Frontend: Vercel (monkflow.io) — proxies /api/* to Railway
Database: Railway PostgreSQL (ballast.proxy.rlwy.net:13008)
```

### Environment Variables (37 on Railway)
```
DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_DAYS,
NODE_ENV, PORT, CORS_ORIGIN, FRONTEND_URL, EMAIL_FROM, EMAIL_PROVIDER,
RESEND_API_KEY, ANTHROPIC_API_KEY, API_URL, INBOUND_WEBHOOK_SECRET,
SERPAPI_KEY, GOOGLE_SERVICE_ACCOUNT_KEY, LEADGEN_ENABLED,
LEADGEN_DAILY_LIMIT, LOG_LEVEL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, QBO_WEBHOOK_VERIFIER_TOKEN,
OWNER_USER_ID, STONKBOT_URL, STONKBOT_API_KEY, (+ Railway system vars)
```

---

## 5. COMMIT & DEPLOY PROTOCOL

### Before Every Commit:
1. Run syntax check on ALL modified files
2. Run affected SQL queries against production DB to verify they work
3. `git diff` to review all changes
4. Stage only relevant files (never `git add .`)

### Commit Message Format:
```
<type>: <concise description>

<optional body explaining why>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
Types: `fix`, `feat`, `refactor`, `perf`, `security`, `docs`, `test`

### After Push:
1. Check Railway deploy status (should auto-deploy from main)
2. Check Vercel deploy status (auto-deploys frontend changes)
3. Hit `/api/v1/health` to verify backend is up
4. If deploy fails, check logs and fix immediately

---

## 6. SESSION LOG FORMAT

Append to `AUDIT_LOG.md` at end of each session:

```markdown
## Session: YYYY-MM-DD

### Audit Findings
- [CRITICAL] Description — FIXED in commit abc1234
- [HIGH] Description — FIXED in commit def5678
- [MEDIUM] Description — deferred to next session
- [LOW] Description — logged for future

### Improvements Made
- Description of improvement (commit hash)

### Next Session Priority
1. First thing to do
2. Second thing to do
3. Third thing to do

### Metrics
- Files modified: N
- Bugs fixed: N
- Tests added: N
- Commits: N
```

---

## 7. QUICK REFERENCE COMMANDS

```bash
# Start the server locally (needs DB connection)
cd server && node src/index.js

# Syntax check a file
node -e "new (require('vm')).Script(require('fs').readFileSync('FILE','utf8'))"

# Connect to production DB
node -e "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_PUBLIC_URL});p.query('SELECT NOW()').then(r=>{console.log(r.rows);p.end()})"

# Check Railway deploy
# Navigate to: https://railway.com/project/09edcfef-5018-4634-a69b-df2f23abf8e8

# Run migrations manually
cd server && node migrations/migrate.js

# Check git changes
git status && git diff --stat

# Push to deploy
git add <files> && git commit -m "msg" && git push origin main
```
