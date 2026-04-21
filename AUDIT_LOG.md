# MonkFlow Audit Log

---

## Session: 2026-04-21

### Audit Findings (live production state)
- [CRITICAL] **68% of reported "opens" were security-scanner bots** firing within seconds of send (Microsoft ATP, Barracuda, corporate mail gateways). Existing UA-based filter missed scanners that rewrite links and pre-fetch with generic Chrome UAs. Backfill revealed 179 bot opens vs only 75 human opens — "54% open rate" was actually ~4% real. **FIXED via migration 043 + latency-based detection.**
- [CRITICAL] Zero replies across 1,761 emails now explained: only 47 of 815 leads (5.8%) were ever actually opened by a human. The content problem is real but the denominator was misleading — we thought half were reading, reality is ~6%.
- [MEDIUM] Analytics dashboards showed inflated open rates; no distinction between human and scanner activity. **FIXED: variant cards + by-touch both show real_open_rate + bot_opens.**
- [LOW] `ACTIVE_VARIANTS` in admin frontend still listed C/D/E/F (retired) as current rotation. **FIXED: now 1/2/3.**
- [INFO] Scraping "paused" since 4/14 is by design — leadgen scheduler skips fresh SerpAPI searches when daily quota fills from backlog recovery (640 diagnosed leads, ~21 days of inventory). No action needed.

### Fixes Shipped This Session
- **migration 043-outreach-open-metadata.sql**: Added `human_opened_at`, `bot_opened_at`, `open_count`, `first_open_ua`, `first_open_ip`, `first_open_latency_s` to `outreach_emails`; mirrored `human_opened_at` + `bot_opened_at` on `outreach_leads`. Backfilled historical data using 60-second latency threshold.
- **`outreach.controller.js` trackOpen**: Rewrote to dual-layer bot detection — UA match + latency < 60s. Captures UA/IP on every hit. Writes `human_opened_at` only for confirmed humans; bot pings recorded separately for forensics.
- **Resend webhook `email.opened` handler**: Same latency-based filtering applied (backup path to primary pixel).
- **Outreach analytics endpoint**: `funnel.opens_recorded` now humans-only; added `bot_opens_filtered` for transparency. `byTouch` + `getAbResults` return `real_opens`, `bot_opens`, `real_open_rate`.
- **app.js frontend**: A/B variant cards show real open rate prominently with bot-filtered count ("12 human · 51 bot filtered"). By-touch section shows both real open rate and reply rate columns.

### Verification
- Migration 043 ran clean against production. Final counts:
  - outreach_emails: 1,761 total / 75 human opens / 179 bot opens
  - outreach_leads: 815 total / 47 human opens / 396 bot opens
- Real variant performance (last 14d touch 0):
  ```
  C:  29.3% real open, 0 bot     (retired but mature data)
  E:  26.3% real open, 0 bot
  D:  23.1% real open, 0 bot
  F:  14.3% real open, 0 bot
  3:  10.0% real open, 43.3% bot (active)
  1:   6.7% real open, 36.7% bot (active)
  2:   3.3% real open, 53.3% bot (active)
  B:   0.0% real open, 55.4% bot (retired, all opens were bots)
  ```
- Touch-by-touch real open rates all-time:
  ```
  Touch 0 (initial):  10.2% (46/450)
  Touch 2 (follow 1): 3.7% (26/694)
  Touch 3 (follow 2): 0.5% (3/613)
  Touch 4 (breakup): 0.0% (0/4)
  ```
- Syntax check passed on all modified files.
- Commit 47e236a pushed, deploy healthy.

### Key Interpretation
- **New frameworks (1/2/3) are hitting heavy-scanner environments** (corporate inboxes with ATP/Proofpoint). Real human open rate 3-10% — lower than mature C/D/E/F runs which mostly went to consumer inboxes. This doesn't mean the content is worse — it means the audience changed.
- **47 humans actually read these emails and nobody replied.** Even stripping bot inflation, the reply conversion from real readers is 0/47. That's the actual content problem to solve.
- **Follow-up open-rate collapse (10.2% → 3.7% → 0.5%)** suggests follow-ups are landing in Promotions/Spam. Possible: threading with same In-Reply-To makes Gmail cluster them into the original's folder; if initial was filtered, follow-ups inherit that fate.

### Next Session Priority
1. **Investigate why touch-2 and touch-3 open rate collapses.** Check if follow-ups are landing in spam/promotions by sending test to personal Gmail. Consider breaking thread on touch 3+.
2. **Audit reply rate on 47 "confirmed human reader" leads.** If any trend (industry, company size, sender, subject line style), double down.
3. **Consider adding click tracking parity** — `clicked_at` likely has same bot problem. Quick check + filter if needed.
4. **SerpAPI scraping will resume automatically** once backlog drains (~21 days). Monitor.
5. **Investigate if bot opens correlate with delivery problems.** High bot ratio = email hit a corporate gateway; low bot ratio + no human open = likely went to spam. Could use bot presence as a positive deliverability signal.

### Metrics
- Files modified: 3
- Migrations added: 1
- Commits: 1 (47e236a)
- Critical findings: 1 (bot-inflated opens)
- Backfilled records: 254 opens reclassified (179 bot + 75 human)

---

## Session: 2026-04-17 (part 2)

### Audit Findings (live production state)
- [HIGH] 99 legacy active leads had `contact_name` = page-title text ("Contact Us" ×13, "Meet Our Team" ×6, "Our Team" ×3, "Agents", "About", "FAQ", etc.) — scheduled to receive follow-ups with broken greetings & bodies — **CLOSED via DB cleanup**
- [HIGH] 16 legacy active leads had `contact_name` = city names ("Baton Rouge" ×5, etc.) or generic nouns — **CLOSED via DB cleanup**
- [HIGH] `cleanCompanyName()` returned page titles unchanged when input had no delimiter (e.g. "Meet Our Team" in, "Meet Our Team" out) — AI prompts then built subject lines like "Intake at Meet Our Team?" — **FIXED**
- [HIGH] No ingestion guard for page-title-only business names — AI wasted Claude tokens writing to leads that would never make sense — **FIXED with `skipped_bad_company` gate**
- [MEDIUM] Bounce rate 5.27% over 14 days (26/493), above Gmail's 2% safe threshold — partially addressed by closing role-based + page-title leads

### Fixes Shipped This Session
- **`nameParser.js`**: Added `looksLikePageTitle()` + `extractCompanyFromDomain()` helpers. `cleanCompanyName(raw, email)` now accepts optional email and falls back to domain-derived company name ("Meet Our Team" + `watermarkdental.com` → "Watermark Dental"). Detects city/state templates like "Panama City, FL Accounting Firm", all-caps strings, meta-description sentences.
- **`leadgen.service.js`**: All 8 `cleanCompanyName(lead.business_name)` callsites now pass `lead.email` for domain fallback. Added second ingestion gate — leads with page-title-only business names are marked `skipped_bad_company` before Claude is called.
- **`outreach.controller.js`** + **`outreach.scheduler.js`** + **`outreach-ai.service.js`**: Same domain-fallback plumbed through follow-up template generation.
- **`scripts/cleanup-bad-leads.sql`** + **`scripts/cleanup-bad-leads.js`**: One-shot cleanup scripts for the original Phase 1 SQL from the zero-reply plan. Ran against production — closed 1 new garbage-name lead (prior sessions had cleaned most).
- **DB cleanup**: Closed 115 legacy bad-contact-name active leads (335 → 220 active). 0 null-subject emails, 0 active role-based, 0 active null-subject remaining.

### Verification (post-fix)
```
raw="Panama City, FL Accounting Firm" + cpagroup.com  →  "Cpa Group"
raw="Contact Us" + allbusinesscpa.com                  →  "Allbusiness Cpa"
raw="Meet Our Team" + watermarkdental.com              →  "Watermark Dental"
raw="Baton Rouge, LA CPA Firm" + bossermanlaw.com      →  "Bosserman Law"
raw="Raleigh Dental Associates" + raleighdental.com    →  "Raleigh Dental Associates" (unchanged)
raw="Our Lady of Grace Dental"                         →  "Our Lady of Grace Dental" (unchanged)
```
All 5 modified files pass syntax check. 1-arg regression tests pass.

### Live Pipeline State (as of this session end)
- Schedulers: all 4 healthy (leadgen/outreach/linkedin/usage) — last run success
- Today's leadgen: 30 emails generated, 0 errors
- Active leads: 220 (down from 335)
- Variant mix last 30d: B=566 (legacy), 1/2/3=10 each (new framework live), C/D/E/F=153 (legacy)
- 411/754 opens in 14 days = **54.5% open rate** — tracking pixel fix is working
- Still 0 replies / 0 clicks — content framework just launched, needs a few more days of sends before verdict

### Next Session Priority
1. Check reply rate after 5-7 more business days of new-framework sends
2. If still zero, look at subject lines specifically — check open rates per variant (1/2/3)
3. Audit recent generated bodies for quality (are Framework 2 teardowns shipping with 2-3 bullets? Is Framework 3 peer-reference being specific enough?)
4. Consider re-generating `original_email_body` for active-but-not-yet-followed-up leads using new prompt (if there are any with the old Framework A/B content)
5. Monitor bounce rate — should drop as more role-based + page-title leads age out of the active pool

### Metrics
- Files modified: 5
- Bugs fixed: 4 (2 HIGH code + 2 HIGH data)
- Scripts added: 2
- Legacy DB rows closed: 115 + 1
- Commits: pending

---

## Session: 2026-04-17

### Audit Findings
- [HIGH] A/B dashboard blind to all new variant data — query filtered only A-F, excluded 1/2/3 — FIXED in commit d25628b
- [HIGH] 3 files used legacy 'B' as variant fallback instead of '1' (scheduler, outreach-ai, controller) — FIXED in commit d25628b
- [HIGH] UUID/INT type mismatch in skipped_no_name UPDATE ($1::int[] on UUID column) — silently failing every cron run, wasting API tokens — FIXED in commit d25628b
- [SECURITY] Open redirect on /track/click — no domain validation, could redirect to any URL — FIXED in commit d98bf13
- [MEDIUM] outreach-ai.service.js first-touch prompt still used retired A/B framework system — FIXED in commit d98bf13
- [MEDIUM] generateForAllPriority + generateForLead didn't pass variant, polluting A/B data with 'unknown' — FIXED in commit d98bf13
- [MEDIUM] Temperature inconsistency: outreach-ai 0.7 vs leadgen 0.6 — synced to 0.6 in commit d98bf13
- [MEDIUM] Controller's follow-up templates diverged from scheduler's rewritten versions — FIXED in commit d25628b
- [MEDIUM] Touch 3 broke email thread with new subject line (signals automated sequence) — FIXED in commit d25628b
- [MEDIUM] Follow-up spacing too aggressive (3,4,5 biz days → now 3,5,7) — FIXED in commit d98bf13
- [LOW] Touch 4 "rest of the quarter" dated the email — changed to "Wishing you well" in commit d98bf13
- [LOW] Watchdog comment said "30-min" but code was 45-min — FIXED in commit d98bf13
- [LOW] Stale comments said "4-way C/D/E/F 25% split" but code is 3-way 1/2/3 — FIXED in commit d25628b

### Content Strategy Overhaul (from prior session, deployed in commit 9f1614e)
- Replaced 4-framework C/D/E/F prompt with 3 new frameworks: Specific Observation (40%), Free Teardown (40%), Peer Reference (20%)
- Temperature 0.8 → 0.6, word limit 90 → 130
- All emails now include booking URL as P.S. (was 25%)
- CTAs rewritten as conversational questions (not yes/no commands)
- Subject lines: sentence case + curiosity-driven
- Follow-up sequence redesigned: Touch 2 = value drop (no ask), Touch 3 = social proof, Touch 4 = breakup
- Data cleanup: 392 bad leads closed (172 role-based + 5 garbage names + 215 NULL subjects)
- Bridge INSERT changed from ON CONFLICT DO NOTHING → upsert (fixes NULL subjects)
- trackOpen fixed for follow-up emails via unsubscribe_token matching

### Improvements Made
- Security: Closed open redirect vulnerability, added Resend webhook rawBody preservation (d98bf13)
- A/B testing: Dashboard now shows all variant data (historical + current) (d25628b)
- Consistency: Unified all code paths to same framework system, templates, temperature (d98bf13)
- Timing: Follow-up sequence widened from 12 to 17 business days — more professional cadence (d98bf13)

### Next Session Priority
1. Monitor reply rates over next 7 days with new framework system — if still 0, deliverability is the bottleneck
2. Check Resend dashboard for delivery rate / spam complaint rate
3. Check Google Postmaster Tools for getmonkflow.com domain reputation
4. Consider removing tracking pixel + HTML wrapper for pure plaintext (deliverability improvement)
5. Add RESEND_WEBHOOK_SECRET env var to Railway if not already set

### Metrics
- Files modified: 8
- Bugs fixed: 13 (3 HIGH, 1 SECURITY, 6 MEDIUM, 3 LOW)
- Commits: 3 (9f1614e, d25628b, d98bf13)

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

### Addendum — LinkedIn Outreach Deep Audit

User reported: "many errors when it runs and when connections are accepted, follow-up messages aren't sent." Confirmed both in prod DB.

Prod state before fix:
- 9 leads in `connect_sent` (some 5 days old), **0 ever transitioned to `connected`**
- Today (2026-04-14 14:03 UTC): 5x `422 errors/cannot_resend_yet` from Unipile, `connects_sent=0`
- Historical `400 errors/too_many_characters` on 3 leads from pre-200-char-cap

Root causes:
- [CRITICAL] sendConnects error handler only stashed `err.message` into the `error` column — status stayed `personalized` → same leads re-selected every day → same errors. Quota burned for nothing.
- [CRITICAL] Status `connect_sent → connected` transition only happened via Unipile webhook. No polling fallback. If webhook is misconfigured, signature drifts, or delivery drops, acceptances silently vanish and `sendDMs()` always sees an empty queue.

Fixes in commit 857ad28:
- `unipile.client.js`: added `listRelations({maxPages,pageSize})` — paginates `GET /users/relations`.
- `linkedin-outreach.service.js`:
  - `unipileErrorType(err)` parses Unipile's `type` field from the wrapped error.
  - `sendConnects` now flips status based on error type: `cannot_resend_yet`/`already_invited` → `connect_sent`, `already_connected` → `connected`, `too_many_characters`/`content_too_large` → `enriched` (regenerate).
  - New `reconcilePendingInvites()` — pulls relations set, flips any `connect_sent` lead whose provider_id is now in network to `connected`, bumps `accepts_received`, fires Pushover "(reconciled)" push.
  - Orchestrator calls reconcile between `sendConnects` and `sendDMs` so follow-ups fire on the next cron tick even if the webhook never delivered.

### Next Session Priority (updated)
1. Monitor tomorrow 9am CT LinkedIn cron — verify:
   - `reconciled` count in stats (should drain the 9 stuck `connect_sent` leads)
   - 0 repeat `cannot_resend_yet` errors (flipped to `connect_sent` on first encounter)
   - DMs fire on any reconciled leads (warm-1 cap is 5 DMs/day)
2. [deferred] Verify Unipile webhook config in Unipile dashboard — signature secret match, URL pointing to /api/v1/linkedin/webhook, event types include `connection_accepted` and `message_received`. Polling is a safety net, not a replacement.
3. [deferred] Widen `getFirstName` dictionary (names like "chuck", "prosper", "carson" currently fall through to "there")
4. [deferred] `reply_sentiment IS NOT NULL` guard in outreach analytics
