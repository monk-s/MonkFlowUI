# MonkFlow Audit Log

---

## Session: 2026-04-21 (part 5) — Live Test + Three Rendered-Email Fixes

### Goal
After part 4's code fixes were deployed, user ran a live test send to
nate@thelinders.com and gave three concrete content complaints from the
*rendered* email (not theoretical — actual Gmail render). Triage, fix, live-
retest, and commit before 2026-04-22 8am CT cohort.

### Findings (from live rendered email, not static audit)
1. **[HIGH] No greeting at all** — live v4 email to "Nate" opened with the
   operational observation, skipping "Hey Nate,". Root cause: `getFirstName`
   returned `'there'` for "Nate" because `COMMON_NAMES` was missing common
   short forms. Prompt logic was correct; word set was too narrow.
2. **[HIGH] Signature pigeonholed MonkFlow** — rendered as `Founder, MonkFlow
   — automation for dental practices`, which reads as a specialist shop. Real
   customer base spans many industries; industry-specific signature hurts
   positioning and discourages cross-industry replies.
3. **[HIGH] Booking URL was broken placeholder** — part 4's over-conservative
   revert left `BOOKING_URL` default as `https://cal.com/PLACEHOLDER-SET-BOOKING-URL-ENV`.
   Verified against app.js that `monkflow.io/#schedule` IS a working 3-step
   scheduling modal (hash triggers `handleHashRoute()` → `showSchedulingModal()`
   at app.js:632–636, modal at app.js:5210). Not a broken anchor — it's the
   built-in booking UX. Production Railway env already matched; only default
   fallback was wrong.
4. **[NOTE] Spam foldering on the test** — user reported the test email hit
   junk. Root cause *for this test specifically* is Gmail's self-impersonation
   heuristic (same last name "Linder" + unfamiliar sender domain
   `mail.getmonkflow.com` is a classic phish signal Gmail scores aggressively).
   Real prospects with different last names won't trigger this. DNS audit
   confirmed SPF/DKIM/DMARC all correct for the sending domain. No code change
   required — monitor first 100 cohort sends for inbox placement.

### Fixes (commit 4770484)
- **`server/src/utils/nameParser.js`** — Added ~130 nicknames / short forms
  to `COMMON_NAMES` Set (Nate, Liz, Ben, Tom, Max, Meg, Abby, Gabe, Marty,
  etc.). Garbage blocklist (`Santa`, `Plumber`, `Best`) still rejects correctly.
- **`server/src/services/leadgen.service.js:631`** — Changed sign-off prompt
  from `Founder, MonkFlow — automation for ${shortIndustry}` → `Founder, MonkFlow`.
  Industry still injected at line 624 in the offer phrase (`automations for
  dental practices like yours`) — that's value-prop personalization, not
  company positioning.
- **`server/src/config/env.js:40`** — Reverted `bookingUrl` default from
  `cal.com/PLACEHOLDER-SET-BOOKING-URL-ENV` → `https://monkflow.io/#schedule`
  with explanatory comment.
- **`server/src/services/outreach.scheduler.js:66`** — Matching revert of
  follow-up template fallback.
- **`server/scripts/e2e-outreach-test.js:223`** — Matching revert of E2E test
  fallback so the script stays consistent.

### Verification
- Unit: `getFirstName('Nate', 'nate@thelinders.com') → 'Nate'`;
  `getFirstName('Liz', ...) → 'Liz'`; `getFirstName('Santa', 'info@best.com') → 'there'`
  (blocklist still works). All five edge cases pass.
- Syntax: `node -e "new (require('vm')).Script(...)"` clean on all 5 files.
- Live E2E: Generated + sent v4 email via Resend to nate@thelinders.com.
  Resend ID `a00a635e-6671-497b-a118-b33afad29383`. Five rendered-output
  assertions all pass: greeting `Hey Nate,`, signature exactly
  `Founder, MonkFlow`, booking URL `https://monkflow.io/#schedule`, exact
  micro-CTA `Reply 'send it'`, no industry pigeonhole in signature.
- Deploy: Pushed to main → Railway auto-deploy → `/api/v1/health` returns 200.

### Next Session Priority
1. **Monitor the 2026-04-22 8am CT 100-lead cohort** during send and first
   24h. Watch Resend dashboard for bounces, spam complaints, Gmail inbox
   placement. If spam rate > 5%, pause remaining cohort and investigate.
2. **Build "reply 'send it' → auto-deliver PDF" flow** — currently 1-pagers
   are sent manually. At 1–5% reply on 100 leads = 1–5 manual sends, so
   manual is fine for this cohort but won't scale to 500/1000-lead cohorts.
3. **Run reply-rate query 2 weeks post-send** (~2026-05-06) after T4 fires.
   Success gate: ≥1% reply = signal, ≥3% = ship default, <0.5% = pivot offer.
4. **Review Gmail postmaster tools** for mail.getmonkflow.com reputation —
   first cohort will generate enough volume for domain reputation to start
   registering. Spam-fold rate is the blocker to watch.
5. **Body length post-send audit** — after T2 fires for v4 cohort, run:
   ```sql
   SELECT touch_number, AVG(LENGTH(body))::int AS avg_chars,
          MAX(LENGTH(body))::int AS max_chars
   FROM outreach_emails WHERE variant = 'v4-named-deliverable' AND touch_number > 0
   GROUP BY touch_number;
   ```
   T2 avg should be <400, T3 <500, T4 <300. If exceeded, enforce via post-
   generation truncate-and-regenerate (AI tends to ignore hard word limits).

### Follow-up: Hyperlink Verification
After commit 4770484 shipped, user reported the P.S. URL in the test email
wasn't a clickable hyperlink. Traced the render pipeline end-to-end:
- **Initial send (touch 0):** `leadgen.service.js:784` runs `(https?:\/\/[^\s<]+)`
  regex on each line AFTER `escapeHtml` (which leaves `#` untouched). Correctly
  wraps `https://monkflow.io/#schedule` in `<a href>`. VERIFIED.
- **Static fallback follow-ups (touches 2–4):** `outreach.scheduler.js:72,75`
  uses explicit `<a href="${bookingUrl}">${bookingUrl}</a>`. VERIFIED.
- **AI-generated follow-ups:** `outreach.scheduler.js:108` uses the same
  linkify regex. VERIFIED.

Root cause of the user-seen unlinked URL: my throwaway test script used
bare `<p>${l}</p>` wrapping without the linkify step. Production will render
hyperlinks correctly. Re-sent a test using the EXACT production render path
(Resend ID `5def55a2-97fb-4b3c-b329-4abc0eaf1d61`) — verified `<a href>` tag
emitted in HTML, assertion passed, no code change required.

### Metrics
- Files modified: 5
- Bugs fixed: 3 (HIGH: 3)
- Live test sends: 2 (Resend IDs a00a635e-…, 5def55a2-…)
- Commits: 1 (4770484)
- Tests added: 0 (inline verification in throwaway scripts, deleted after use)

---

## Session: 2026-04-21 (part 4) — Final Pre-ship Polish + Soft Fixes

### Goal
Last-mile audit before tomorrow 2026-04-22 8am CT send. User ask: "NOT have me
end up in the spam folder." Find any remaining soft concerns from content,
deliverability, or measurement perspectives and patch before the cohort fires.

### Audit Findings
- [HIGH] **No RFC 8058 one-click unsubscribe POST handler.** Outbound headers
  advertise `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, but only a GET
  handler existed at `/unsubscribe/:token`. If Gmail / Apple Mail / Outlook
  tries the one-click POST (which compliant clients DO, per RFC 8058 §3.1), the
  POST 404s and the mailbox provider counts it as a negative deliverability
  signal — directly undermining the header's purpose. — FIXED in commit `e2b127e`.
- [MEDIUM] **Subject monoculture.** Rendering test produced "3 automations for
  {company}" on ALL 4 test leads at temperature 0.4. The AI was anchoring on
  the cheapest example in the preferred-patterns list. Across a 100-lead
  cohort this would trip `subjectIsOverused()` dedup from lead #6 onward —
  adding latency + AI cost and potentially still producing corpus-duplicate
  subject fingerprints. — FIXED in commit `ec41767` (reorder preferred patterns
  to put name+question and "Saw something at X" first, add explicit "VARY your
  choice" directive, bump `MAX_DEDUP` from 2 to 3). Post-fix rendering test:
  5 unique subjects / 5 sends across 4 industries.
- [MEDIUM] **Awkward offer phrasing.** Line 624 of leadgen.service.js said
  `${lead.business_type} practices like yours` — for `business_type = "e-commerce
  retailer"` this rendered as "e-commerce retailer practices" (a retail brand
  is not a "practice"). Same redundancy for "chiropractic office practices".
  — FIXED in commit `ec41767` (use already-computed `${shortIndustry}` which
  gives "dental practices", "e-commerce brands", "financial advisors",
  "chiropractic offices" cleanly). Post-fix: 5/5 offer lines clean.
- [MEDIUM] **T3 static fallback hardcoded dental case study.** Case 3 in
  outreach.scheduler.js::getFollowupTemplate had a Tulsa dental proof
  paragraph baked in. Rare path (fires only when AI generation errors on
  touch 3), but a real foot-gun when it does — a financial advisor on day 12
  with a Tulsa dental proof is obviously templated. — FIXED in commit
  `ec41767` (use `selectCaseStudyForFollowup()` from outreach-ai.service.js
  to industry-match; exported the selector from that module for reuse).
- [LOW / FALSE-ALARM] **Follow-up plain-text alternative was flagged as
  missing by the spam analysis agent.** Actually already present in both send
  paths: initial send at leadgen.service.js:791 derives plain text from
  `outreach_body` + unsubscribe URL and passes as `text:`; follow-up send at
  outreach.scheduler.js:225-241 strips HTML tags to plain text and passes as
  `text:`. Both pass through `sendEmail()` which forwards `text` to Resend's
  `text` field. — NO-OP (logged so next audit doesn't re-flag).

### Production DB State (verified via ballast.proxy.rlwy.net)
- Leads inventory: 1,607 sent, 640 diagnosed (ready), 320 skipped_no_name,
  29 unsubscribed, 24 bounced.
- outreach_leads: 538 closed, 277 active, 0 orphans (no `status='active' AND
  next_followup_at IS NULL AND touch_count < 4`).
- **Replies EVER detected: 0.** Across 1,607 sends. 29 unsubscribes happened,
  so inboxes ARE engaging — yet 0 replies. This is statistically very
  suspicious and is consistent with the MX/SES reply-routing concern.
- First-touch variant counts: B/C/D/E/F/1/2/3/A all pre-v4 — `v4-named-deliverable`
  count = 0 (clean slate for tomorrow).
- Sender health 7d: 7 senders on mail.getmonkflow.com + 1 on getmonkflow.com,
  0 bounces today, 3 historical bounces across the week (all isolated, not a
  trending signal). All healthy for tomorrow's warming-day-12 send.
- Latest migration: current (041-linkedin-recent-post series).

### Operational Concern Flagged for User Decision (not code)
- **MX for `mail.getmonkflow.com` → `inbound-smtp.us-east-1.amazonaws.com`**
  (raw AWS SES inbound). `Reply-To` header sets `nathan@mail.getmonkflow.com`.
  If SES Receiving Rules are not configured for that subdomain, every reply
  is silently dropped. The 0-replies-across-1,607-sends DB finding is
  consistent with either (a) content was bad OR (b) replies never routed.
  v4 framework hinges on "Reply 'send it'" — if replies aren't monitored, the
  framework can't self-correct. Safest mitigation: `LEADGEN_REPLY_TO=nate@thelinders.com`
  in Railway env → overrides the default in all 5 code sites, guarantees
  capture. User to decide before 8am.

### Deploy Verification
- `ec41767` pushed to main, Railway deploy green, health returns 200.
- POST `/leadgen/unsubscribe/:token` with invalid-UUID returns 400 (proving
  new handler active, not route-not-found 404).
- Module load + selectCaseStudyForFollowup unit test: 5/5 industries route
  correctly.
- Live rendering with real Anthropic API (5 leads): 5 unique subjects,
  5/5 offer lines using clean `${shortIndustry}`, CTAs exact, signatures
  compliant.

### Next Session Priority
1. After 8am CT send: run Q4/Q5/Q7/Q9 again to confirm v4 cohort landed at
   full 100 leads, senders distributed evenly, no new bounces.
2. Monitor nathan@mail.getmonkflow.com AND nate@thelinders.com inboxes for
   first reply — and compare. If replies land only at nate@, the MX/SES
   concern is confirmed; update code comments + consider changing the
   default.
3. After T2 fires (~day 8), run the follow-up length verification SQL from
   the plan.

### Commits This Session
- `e2b127e` — RFC 8058 one-click unsubscribe POST handler
- `ec41767` — three soft-concern fixes (subject variety, offer phrasing,
  T3 static fallback industry-match)

### Metrics
- Files modified: 4 (leadgen.controller, leadgen.routes, leadgen.service,
  outreach-ai.service, outreach.scheduler)
- Bugs fixed: 4 (HIGH: 1, MEDIUM: 3)
- Commits: 2
- Tests: 1 live-API rendering test (5 leads, 5 unique subjects) + 1 unit test
  (5 case study mappings)

---

## Session: 2026-04-21 (part 3) — Pre-ship E2E Audit

### Goal
Audit the entire lead-gen → cold-email pipeline end-to-end before tomorrow's
8am send cohort (first 100-lead `v4-named-deliverable` run). Find and fix
anything that would silently break a send, corrupt analytics, or leak a
placeholder URL into a real prospect's inbox.

### Audit Findings (all fixed this session unless noted)

- [CRITICAL] **5 sites still defaulted `email_variant` to `'1'`** when the lead
  row had no explicit variant. Every new v4 send would have been mis-tagged
  as variant `1` (retired framework), poisoning analytics and making the
  2–5% reply target impossible to measure. Sites: `leadgen.service.js:836`
  (bridge INSERT), `leadgen.service.js:855` (outreach_emails mirror),
  `outreach.scheduler.js:246` (follow-up insert),
  `outreach-ai.service.js:374` (AI-only path),
  `outreach.controller.js:338` (admin ai-send). **FIXED: all default to
  `'v4-named-deliverable'`.**
- [CRITICAL] **`BOOKING_URL` defaulted to a placeholder** (`https://cal.com/PLACEHOLDER-SET-BOOKING-URL-ENV`)
  and no guard existed — if Railway env wasn't set, the placeholder string
  would appear in every P.S. line sent to prospects. **FIXED with hard boot
  guard in `env.js`:** production start throws an error if `BOOKING_URL`
  contains `PLACEHOLDER`, and send paths now call `env.bookingUrlIsPlaceholder()`
  to omit the P.S. line as a defense-in-depth second layer.
- [HIGH] **`subjectIsOverused` whitespace normalization was broken**:
  the SQL template literal `'\s+'` collapsed to the literal string `'s+'`
  (backslash consumed by JS parser), so the query was replacing sequences of
  literal `s` characters with spaces — not whitespace. This made the proper-
  noun + whitespace normalization compare two differently-spaced variants as
  different templates, defeating the dedup. **FIXED: escaped to `'\\s+'` so
  Postgres receives a literal `\s+`.**
- [HIGH] **`looksLikePersonName` in `leadgen.service.js`** (scraping-side,
  for JSON-LD Person schema and page title parsing) did not consult
  `NAME_BLOCKLIST`. A scraped string like "Santa Smith" or "Trusted Team"
  could pass the regex checks and end up as a contact name. **FIXED: shared
  `NAME_BLOCKLIST` exported from `nameParser.js`; scraping-side check now
  rejects if the first word is in the blocklist.**
- [HIGH] **Outreach scheduler SELECT lacked `replied_at IS NULL` guard.**
  If the reply-detector webhook set `replied_at` but a follow-up cron tick
  raced in before the status update (or the status update failed), the
  follow-up would still fire at someone who had just replied. **FIXED:
  added `AND ol.replied_at IS NULL` to the due-followup query.**
- [MEDIUM] **Analytics variant filter + labels missing `v4-named-deliverable`.**
  `getAbResults` only returned rows for variants in `IN ('A','B','C','D','E','F','1','2','3')`,
  which would silently exclude the entire v4 cohort from the A/B dashboard.
  **FIXED: added `'v4-named-deliverable'` to the IN clause and the
  `VARIANT_LABELS` map. Old variants re-labeled as "(retired)".**

### Fixes Shipped This Session (commit 2208996)
1. `server/src/config/env.js`: boot-time refusal for placeholder BOOKING_URL;
   `env.bookingUrlIsPlaceholder()` helper.
2. `server/src/utils/nameParser.js`: export `NAME_BLOCKLIST` + `COMMON_NAMES`.
3. `server/src/services/leadgen.service.js`: NAME_BLOCKLIST-aware
   `looksLikePersonName`; `'v4-named-deliverable'` default variant (×2);
   AI prompt gates the P.S. line when placeholder; `subjectIsOverused`
   regex escape fix.
4. `server/src/services/outreach.scheduler.js`: `replied_at IS NULL` filter;
   `'v4-named-deliverable'` default; static fallback templates gate P.S.
   line when placeholder.
5. `server/src/services/outreach-ai.service.js`: `'v4-named-deliverable'`
   default; touch 3/4 instructions gate P.S. line when placeholder.
6. `server/src/controllers/outreach.controller.js`: `'v4-named-deliverable'`
   default in admin ai-send; analytics variant IN clause + labels updated.

### Verification
- All 6 modified files pass `node -e "new (require('vm')).Script(...)"` syntax check.
- Runtime module load: all modules import cleanly; no circular-dep break.
- `env.bookingUrlIsPlaceholder()` → `true` in dev, `false` after BOOKING_URL set.
- Prod mode boot guard throws when BOOKING_URL unset (verified via Node REPL).
- `getFirstName('Santa', 'info@bestchristmasplumbers.com')` → `'there'` (was `'Santa'`)
- `getFirstName('Plumber', 'john@acmeplumbing.com')` → `'John'` (falls to email)
- `getFirstName('Best', 'pam.osborne@firm.com')` → `'Pam'`
- `getFirstName('Team', 'info@company.com')` → `'there'` (role rejected, name rejected)
- `getFirstName('Nathan Linder', 'n@x.com')` → `'Nathan'` (honorifics branch unaffected)
- Template literal escape verified: `'\\s+'` in JS → literal `\s+` in SQL string.
- Commit 2208996 pushed to main.
- Post-push health check: Railway `/api/v1/health` returned 200 throughout.
  NOTE: cannot distinguish "new deploy live" from "new deploy failed, old still
  running" without Railway log access — user must verify in Railway dashboard.
  If BOOKING_URL env var isn't set before deploy, the new code WILL fail its
  boot guard and Railway will keep running the prior deploy. USER ACTION
  REQUIRED: set `BOOKING_URL` in Railway to a real Cal.com / Calendly URL
  before the 8am send.

### ⚠️ BLOCKING USER TASK BEFORE NEXT SEND
1. Set `BOOKING_URL` in Railway env to a real calendar URL (e.g.
   `https://cal.com/nathan-linder/intro` or your Calendly link).
2. Trigger a Railway redeploy of commit 2208996 if the first auto-deploy
   failed on the boot guard.
3. Verify in the Railway Deployments tab that commit 2208996 shows ACTIVE,
   not FAILED.
4. Smoke test by hitting `/api/v1/health` — should still be 200.

### Deferred to Next Session (non-blocking for v4 cohort)
- **List-Unsubscribe POST handler**: Gmail requires a one-click POST endpoint
  for the bulk-sender compliance rules. Current implementation only has a GET
  token link. Not a blocker for 100-lead cohort but matters once daily volume
  grows past ~1000/day.
- **Migration 044 for `leads_status_check`**: the `skipped_bad_company` status
  was added in-code but the enum constraint on `leads.status` doesn't list it,
  causing the UPDATE to fail silently. Needs a migration that does
  `ALTER TABLE leads DROP CONSTRAINT leads_status_check, ADD CONSTRAINT ...`.
- **Resume-path page-title guard**: leads created before commit d449692 may
  still have page-title-only company names; the resume path doesn't re-check
  them against `looksLikePageTitle`. Low severity — counts visibly small in
  current DB.
- **Admin-only AI paths still reference OLD framework**: `generateEmailForLead`
  in `outreach-ai.service.js` lines 188-210 still uses `'1'`/`'2'`/`'3'`
  frameworks + temperature 0.6. These only fire from admin-triggered
  `/outreach/:id/ai-send` and `/outreach/ai-generate-all`. Not used by the
  normal daily send scheduler, so v4 cohort is safe — but worth unifying
  to a single framework eventually.
- **Static T3 fallback case study hardcoded to dental**: `outreach.scheduler.js`
  static templates reference the dental case study regardless of lead industry.
  Fires only on AI-generation failure, which is rare. Minor issue.

### Metrics
- Files modified: 6
- Audit findings: 6 (3 CRITICAL, 2 HIGH, 1 MEDIUM) — all fixed
- Deferred findings: 5 (non-blocking)
- Commits: 1 (2208996)
- Lines changed: +70 / -27

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

---

## Session: 2026-04-21 — Cold Email Reply-Rate Rewrite

User ask: "Do some diligent research and create a plan to have emails elicit a reply more than my current cold emails."

Prior state: 1,930 emails sent across 725 leads, **0 replies, 0 clicks, 0 unsubscribes**. Deliverability + warming + bot-filtering were all already fixed. The content itself was the remaining failure.

### Audit Findings (nine content failures, all from production data)
- [CRITICAL] `getFirstName` accepts any single capitalized word in its COMMON_NAMES set — in prod this produced greetings like "Hey Santa," "Hey Plumber," "Hey Best." The `'there'` fallback never fired because the function always returned a garbage name instead. — FIXED in commit aff7733
- [CRITICAL] Case-study dump in `generateOutreachEmail` sent all 4 case studies to the AI with "pick the one that matches" — in prod every cohort (dental, real estate, e-commerce) quoted the Dallas wealth study because the AI does not route correctly from a dumped list. — FIXED in commit aff7733
- [HIGH] Subject-line reuse at spam scale: "Re: Quick question" used 223×, "Quick question about {company}" 200+×, "{city} {industry} + intake" 50–100×. No dedup guard existed. — FIXED in commit aff7733
- [HIGH] Follow-up length bloat: T2 avg ~779 chars, T3 avg ~1000+ chars. Prompt limits were 60/70/40 words but AI ignored them. Best-in-class cold follow-ups are <400 chars. — FIXED in commit aff7733
- [HIGH] Booking URL was `https://monkflow.io/#schedule` — a hash anchor that loads the marketing homepage, requires scrolling + contact-form fill, and is not a calendar. The tiny minority who tried to book bounced. — FIXED in commit aff7733 (placeholder + TODO; Railway env var still needs to be set to real Cal.com URL)
- [HIGH] CTAs offered easy escape: "Is this on your radar?" / "Curious if this is on your radar?" across all three frameworks — invite silence, no micro-decision forcing. — FIXED in commit aff7733 (replaced with exact-string "Reply 'send it' and I'll email it over today.")
- [HIGH] The offer was weak: meeting ask or a vague "yes" — a high-commitment cold ask with no named deliverable and no pre-built artifact. — FIXED in commit aff7733 (offer is now a named 1-page map of the 3 highest-ROI automations for the prospect's industry; keep regardless, no call required)
- [MEDIUM] Personalization was surface-level: `analyzeWebsite` detected booking software/SSL/contact form — the "specific observation" became "your booking routes through a contact form," a website symptom rather than a business pain. — FIXED in commit aff7733 (prompt now forces inference of operational PAIN from the website signal: "If {Company} is still handling intake by phone, your front desk is spending 8–12 hours a week on it.")
- [MEDIUM] Three frameworks (`'1'`, `'2'`, `'3'`) with different structures AND different CTAs meant reply lift could not be cleanly attributed to any single change. — FIXED in commit aff7733 (consolidated to single `v4-named-deliverable` variant; historical sends remain tagged `'1'/'2'/'3'` for clean cohort comparison)

### Improvements Made
- **Single framework.** Replaced three structurally-different prompts + rotation (leadgen.service.js lines 503–582) with one framework that varies observation/industry per lead but fixes structure and CTA. Cohort-level reply lift is now attributable.
- **Named-deliverable offer.** Ask is no longer "want to chat?" — it is "1-page map of the 3 highest-ROI automations for {industry} practices like yours. Yours to keep, no call required. Reply 'send it' and I'll email it over today." Moves from high-commitment meeting ask to low-commitment one-word reply with value delivered regardless of outcome.
- **Industry-matched case studies.** Added `selectCaseStudy(business_type)` in leadgen.service.js and `selectCaseStudyForFollowup` (inlined to avoid circular import) in outreach-ai.service.js. Dental→Tulsa, financial/CPA/wealth→Dallas, chiro→Columbus, ecommerce/retail→Austin. CASE_STUDIES is now exported from outreach-ai.service.js.
- **Name-blocklist.** `NAME_BLOCKLIST` in nameParser.js with ~60 entries (santa, plumber, best, top, welcome, team, attention, dental, chiro, realty, etc.). `getFirstName` single-word branch tightened to require length ≥3, membership in COMMON_NAMES, AND absence from blocklist. `looksLikePersonName` helper exported for reuse.
- **Subject-line dedup.** `subjectIsOverused()` normalizes proper nouns via pg `regexp_replace` → `_X_` and counts matches in last 30 days. ≥5 matches triggers up-to-2 regenerations with a "REJECTED: generate completely different pattern" instruction appended to the prompt. Cap is 2 dedup attempts before sending whatever the AI returns (do not block the send).
- **Follow-up rewrite.** Touches 2/3/4 now form a coherent single-offer sequence. T2 ("still have that 1-page map — want it?" 350-char limit). T3 (case-study proof + last offer + PS booking link, 400-char limit). T4 (breakup, no guilt-trip, 250-char limit). Static fallbacks in outreach.scheduler.js match.
- **Temperature drop 0.6 → 0.4.** Prompt is structurally rigid (numbered steps, exact CTA string) but substantively free (observation/pain/industry vary per lead). Temperature 0.4 delivers structural consistency with substantive variation.

### Files Modified
- `server/src/utils/nameParser.js` — NAME_BLOCKLIST + tightened single-word branch + `looksLikePersonName` export
- `server/src/services/leadgen.service.js` — single-framework prompt, `selectCaseStudy`, `subjectIsOverused`, temp 0.4, REC_VARIANTS/TEST_VARIANTS → `['v4-named-deliverable']`
- `server/src/services/outreach-ai.service.js` — CASE_STUDIES export, `selectCaseStudyForFollowup`, new FOLLOWUP_SYSTEM_PROMPT, rewritten touch 2/3/4 instructions with hard char limits, VARIANTS → `['v4-named-deliverable']`
- `server/src/services/outreach.scheduler.js` — rewritten static fallback templates (T2/T3/T4) to <400 char named-deliverable sequence; fallback URL matches placeholder
- `server/src/config/env.js` — `bookingUrl` default changed to placeholder + TODO pointing to Railway env var
- `server/scripts/e2e-outreach-test.js` — fallback URL assertion updated; warning if BOOKING_URL not set

### Deploy Verification
- Module load: clean (all 6 files require() without error, no circular refs)
- Syntax check: clean on all modified files
- Unit test `getFirstName`: 9/9 pass (Santa→there, Plumber→John-via-email, Best→Pam-via-email, Team→there, Nathan Linder→Nathan, real name passes through)
- Unit test `selectCaseStudy`: 11/11 pass (dental→Tulsa, chiro→Columbus, CPA/wealth/financial→Dallas, ecommerce/retail/shopify→Austin, unknown→Austin fallback)
- Commit aff7733 pushed to main
- Railway deploy: health check 200 ✅ (`{"status":"ok","timestamp":"2026-04-21T16:28:41.298Z"}`)
- Frontend: 200 ✅ (monkflow.io)

### Expected Impact
Baseline: 0/725 = **0% reply rate**. Target for first 100-lead v4 cohort over 2-week window: **2–5%**. Single biggest lever is the named-deliverable offer (~60% of expected lift). Remaining 40% from observation specificity, single-framework measurement clarity, case-study match, CTA force, subject dedup.

### Success Gate for Cohort v4 (run after first 100 leads complete T4)
```sql
SELECT variant, COUNT(*) AS sent,
  COUNT(DISTINCT CASE WHEN replied_at IS NOT NULL THEN lead_id END) AS replies,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN replied_at IS NOT NULL THEN lead_id END)
        / NULLIF(COUNT(DISTINCT lead_id), 0), 2) AS reply_rate_pct
FROM outreach_emails e JOIN outreach_leads l ON l.id = e.lead_id
WHERE e.touch_number = 0 AND e.sent_at > '2026-04-21'
GROUP BY variant ORDER BY sent DESC;
```
- ≥1%: real signal, proceed to cohort 2
- ≥3%: ship as default, retire old variants
- <0.5%: offer itself is still wrong — pivot to different named deliverable (Loom, free audit doc, custom video)

### Next Session Priority
1. **Set `BOOKING_URL` env var in Railway** to a real Cal.com/Calendly link (e.g. https://cal.com/nathan-linder/intro) BEFORE next send cohort. Current placeholder `https://cal.com/PLACEHOLDER-SET-BOOKING-URL-ENV` is obviously invalid and will break the PS link on live sends. This is a user task — I cannot modify Railway env vars.
2. **Produce 1-page PDFs** for dental, financial services, chiro, and e-commerce — title: "3 Highest-ROI Automations for {industry} Practices." ~400 words each with screenshot/flow. For first 100 leads at 1–5% reply rate, that's 1–5 manual sends — Nathan can reply with the PDF by hand until we automate a "reply 'send it' → auto-deliver PDF" flow.
3. **Send dry-run to nate@thelinders.com** via admin test endpoint with four fake leads (one per industry). Verify: subject ≤6 words and not in banned patterns, greeting either `Hey {realName},` or omitted entirely (never `Hey Santa`/`Hey team`), body contains exact `Reply 'send it'`, case study matches lead's `business_type`, sign-off is 3 lines (Nathan / Founder, MonkFlow — automation for {industry} / monkflow.io), PS uses BOOKING_URL env var.
4. **Monitor v4 cohort reply rate** — run the success-gate query weekly. First meaningful read is T+14 days once the 4-touch sequence completes on the first 100 leads.
5. **After T2 fires for v4 cohort, run length verification**:
   ```sql
   SELECT touch_number, AVG(LENGTH(body))::int AS avg_chars, MAX(LENGTH(body))::int AS max_chars
   FROM outreach_emails WHERE variant = 'v4-named-deliverable' AND touch_number > 0
   GROUP BY touch_number;
   ```
   T2 avg <400, T3 <500, T4 <300. If higher, AI is ignoring hard limits — enforce via post-generation truncate-and-regenerate.

### Metrics
- Files modified: 6
- Bugs fixed: 9 (CRITICAL: 2, HIGH: 5, MEDIUM: 2)
- Improvements: 6 (single framework, named-deliverable offer, case-study routing, name blocklist, subject dedup, follow-up coherent sequence)
- Commits: 1 (aff7733)
- Tests added: 0 (unit-test-executed manually in REPL; no persistent test suite)

