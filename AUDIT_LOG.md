# MonkFlow Audit Log

---

## Session: 2026-04-09

### Audit Findings
- [HIGH] FROM email domain (getmonkflow.com) mismatched Reply-To domain (mail.getmonkflow.com) in 3 files — FIXED in commit 58927b2
- [MEDIUM] outreach-ai.service.js had redundant hardcoded fallback to root domain — FIXED in commit 58927b2
- [MEDIUM] outreach.controller.js unsub URL used env.frontendUrl with getmonkflow.com fallback instead of monkflow.io — FIXED in commit 58927b2
- [FALSE ALARM] SQL column cross-reference audit flagged 7 outreach_leads columns as missing — verified all exist in migrations 023 + 024
- [FALSE ALARM] INSERT INTO outreach_emails placeholder mismatch — was INSERT...SELECT with matching 9/9 columns

### Improvements Made
- Centralized sending domain in env.js: FROM, Reply-To, and SENDERS all now derive from OUTREACH_SENDING_DOMAIN (58927b2)
- Removed hardcoded root domain fallbacks that would bypass env configuration

### Next Session Priority
1. Verify tomorrow's 8am CT LeadGen cron succeeds with narrowed industries + new warming schedule
2. Verify 9am CT LinkedIn cron sends 5 connects with 200-char notes
3. Confirm Pushover daily summaries arrive from both schedulers
4. After 1 week: evaluate real open rate with scanner filtering active
5. Consider Phase 3C (AI prompt natural variation) and Phase 5 (monitoring endpoints)

### Metrics
- Files modified: 3
- Bugs fixed: 1 (FROM/Reply-To domain mismatch)
- Tests added: 0
- Commits: 1

---

## Session: 2026-04-05

### Bugs Fixed (6)
- [CRITICAL] Outreach Analytics 500 — `opened_at` / `replied_at` referenced on wrong table (`outreach_emails` instead of `outreach_leads`). Fixed JOINs and column names.
- [CRITICAL] JSONB Bridge Failure — `lead.diagnosis_json` passed as raw object to PostgreSQL, causing `[object Object]` corruption. Fixed with `JSON.stringify()`.
- [HIGH] 12 XSS Vulnerabilities — User-controlled data (names, emails, subjects, bodies) injected raw into HTML. Wrapped all with `escapeHtml()`.
- [HIGH] Dashboard Analytics 500 — `finished_at` doesn't exist on `workflow_executions`, actual column is `completed_at`. Fixed both occurrences.
- [MEDIUM] `.toFixed()` Crash — `avg_duration_sec` returns null on empty datasets, frontend called `.toFixed()` on it. Added null guard.
- [LOW] Priority Inconsistency — `outreach_leads.priority` never set during bridge INSERT. Now auto-flags leads with score >= 75.

### Testing
- Wrote and ran 13-suite E2E test against production DB — 93/94 passed (1 timezone false positive). All test data cleaned up.

### Infrastructure
- Set INBOUND_WEBHOOK_SECRET env var on Railway
- Full SQL-to-Schema cross-reference audit across all 24 tables — zero remaining mismatches confirmed

### Improvements Made
- Created CLAUDE.md (523 lines) — continuous audit system with 12 categories, 20-item backlog, commit protocols, session logging (commit 4322bcd)
- Auto-flag high-scoring leads as priority in outreach bridge (commit a14ef51)
- Fix analytics crash: guard avg_duration_sec.toFixed() when null (commit fd21c3b)
- Fix analytics 500: workflow_executions uses completed_at not finished_at (commit 603fb40)

### Next Session Priority
1. Run full 12-category audit per CLAUDE.md instructions
2. Verify lead gen system is fully operational (goes live tomorrow)
3. Check email deliverability — tracking pixels, unsubscribe links, threading headers
4. Add request validation (Zod schemas) to unprotected endpoints
5. Add structured error logging across all controllers

### Metrics
- Files modified: 16
- Bugs fixed: 6
- Tests written: 13 suites (93/94 passing)
- Commits pushed: 6
- Deployments: Railway + Vercel (all successful)

---

## Session: 2026-04-09

### Audit Findings
- [CRITICAL] LinkedIn connects failing — Unipile "too_many_characters" rejecting all connect notes. Root cause: 200-char limit for non-premium LinkedIn, code set to 300. FIXED: cap → 200, repersonalized all leads. 4 connects now sent. Commits 97d76f3, 53a8251.
- [CRITICAL] Cold email 0% real open rate — 72% of "opens" fired within 10 seconds (spam scanner pre-fetch). 0 replies across 661 emails. Root cause: 10 sender aliases on root domain, branded HTML sig, 20-40% bounce rates on several senders, aggressive warming. FIXED in 869e925.
- [HIGH] LeadGen scheduler timeout — 30-min watchdog too tight for 220 searches + 500 diagnoses + email gen. FIXED: bumped to 45 min. Commit 9cb7b66.
- [HIGH] LinkedIn leads sorted by created_at DESC — connect_sent leads buried below personalized. FIXED: status-priority sort (replied > connected > dm_sent > connect_sent > personalized). Commit 9cb7b66.
- [MEDIUM] Debug logging left in sendConnects — verbose per-lead logging + _connectDebug/_dmDebug in API response. FIXED: cleaned up in 46a451c.
- [MEDIUM] Follow-up email links used branded green (#00cc6a) — spam signal. FIXED: plain #333. Commit 46a451c.

### Improvements Made
- Pushover daily summary + scheduler failure alerts wired into LinkedIn, LeadGen, and Outreach schedulers (f30c811)
- LinkedIn connect note cap fixed 300→200 for non-premium accounts (97d76f3)
- Email deliverability overhaul (869e925):
  - Senders reduced 10→3 (personal names only)
  - Default domain → mail.getmonkflow.com (dedicated subdomain)
  - Warming reset: 15/day → 30 → 60 → 75 → 90 over 4 weeks
  - HTML signature stripped (no gradient logo, no "AI-powered workflows" tagline)
  - Scanner open filtering on tracking pixel endpoint
  - Role-based email leads (info@, contact@) now skipped
  - Industries narrowed 10→3 (CPA, dental, financial)
- Debug cleanup + link branding fix (46a451c)

### Verification
- Backend health: 200 ✅
- Frontend: 200 ✅
- DNS: SPF ✅, DKIM ✅, DMARC ✅ on getmonkflow.com
- Resend domains: mail.getmonkflow.com verified ✅, getmonkflow.com verified ✅, monkflow.io verified ✅
- Auth: all 5 protected routes return 401 without token ✅
- Temp endpoints removed: _pushtest 404 ✅, _diag/email 404 ✅
- Syntax check: 102 server files + app.js = 0 errors ✅
- Railway env vars: OUTREACH_SENDING_DOMAIN, DOMAIN_LAUNCH_DATE, LINKEDIN_OUTREACH_ENABLED, UNIPILE_*, PUSHOVER_* all present ✅
- Reply-To alignment: all 4 locations default to nathan@mail.getmonkflow.com = matches sender domain ✅
- LinkedIn pipeline: 4 connects sent today, 28 personalized ready, warming at week-1 (5/day cap) ✅
- Git: clean working tree, 10 commits this session ✅

### Next Session Priority
1. Monitor tomorrow's 8am LeadGen cron (should succeed with 45-min timeout + narrowed industries)
2. Monitor 9am LinkedIn cron (5 connects should go out with 200-char notes)
3. Check Pushover — should get daily summary pushes from both crons
4. After 1 week on new warming: check real open rate with scanner filtering
5. Consider adding inbox placement seed test (send to personal Gmail/Outlook)
6. Evaluate if DMARC should move from p=none to p=quarantine

### Metrics
- Files modified: 7
- Bugs fixed: 4 (CRITICAL: 2, HIGH: 2, MEDIUM: 2)
- Commits: 10
- Tests added: 0 (monitoring via production crons + Pushover alerts)

---

## Session: 2026-04-14

### Audit Findings
- [CRITICAL] Diagnosed-lead recovery capped at LIMIT = RECOVERY_CAP (today's remaining quota ≤ 30). Top-scored leads are dominantly nameless (null contact_person or page-title cruft like "About Us"), so the loop spent its entire budget marking them skipped_no_name and never reached the ~200 named leads deeper in the 969-row backlog. — FIXED in commit 12c98dc (500-row candidate pool, break on recovered-sends ≥ RECOVERY_CAP)
- [HIGH] linkedin.scheduler had no heartbeat writes to scheduler_heartbeats — silent cron failure would leave monitoring blind. — FIXED in commit 12c98dc (started/success/failed heartbeats, err.stack in error log)
- [MEDIUM] reply_sentiment FILTER in outreach.controller analytics silently matches 0 for pre-migration-032 rows — DEFERRED (low urgency, affects historical numbers only)
- [MEDIUM] Several outreach.controller SELECT * queries accessing columns implicitly — DEFERRED (not a bug, style only)
- [LOW] Frontend app.js syntax clean; defensive null checks present on all .toFixed/.toUpperCase/.toLowerCase paths audited

### Improvements Made
- Sender pool expanded 3 → 6 personal identities on mail.getmonkflow.com (commit 0e3cbc7): doubles full-phase daily capacity from 90 to 180. Verified domain-level DKIM/SPF via sender_health history showing 10 local-parts with clean sends.

### Deploy Verification
- Health: 200 ✅ (both 0e3cbc7 and 12c98dc)
- Frontend: 200 ✅
- Scheduler heartbeats today: leadgen ✅ success 13:00 UTC, outreach ✅ success 16:00 UTC, usage ✅ success 00:00 UTC
- 0 orphaned active leads ✅
- No migrations pending (latest: 041-linkedin-recent-post)

### Next Session Priority
1. Monitor tomorrow's 8am CT leadgen cron — expect recovery to drain deep into the backlog (target: tens of sends from the 969 stuck leads, not zero)
2. Verify 6-sender pool is actually distributing — query sender_health to confirm all 6 show sends, not just the old 3
3. Investigate whether `getFirstName` dictionary should be expanded (names like "chuck", "prosper", "carson" fall through to "there" despite being obvious first names — would reduce false skipped_no_name rate)
4. [HIGH deferred] Add `reply_sentiment IS NOT NULL` guard or backfill to neutral for pre-032 rows
5. Once real reply data exists, re-evaluate A/B variant performance with clean (non-scanner) open data

### Metrics
- Files modified: 2
- Bugs fixed: 2 (CRITICAL: 1, HIGH: 1)
- Improvements: 1 (sender pool expansion)
- Commits: 2 (0e3cbc7, 12c98dc)
- Tests added: 0
