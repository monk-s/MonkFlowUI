-- Open tracking metadata + bot-filtering
--
-- Problem: 68% of "opens" are security-scanner bots firing within seconds of
-- send (Microsoft ATP, Barracuda, Proofpoint, corporate mail gateways). The
-- existing UA-based scanner filter in outreach.controller.js misses modern
-- scanners that rewrite links and pre-fetch with generic Chrome user-agents.
--
-- Fix: capture UA/IP on every pixel hit, compute latency from sent_at, and
-- classify opens < 60s as bots. Keep opened_at for backward compat, add
-- human_opened_at as the true signal for analytics.

ALTER TABLE outreach_emails
  ADD COLUMN IF NOT EXISTS human_opened_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bot_opened_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_open_ua         TEXT,
  ADD COLUMN IF NOT EXISTS first_open_ip         TEXT,
  ADD COLUMN IF NOT EXISTS first_open_latency_s  INTEGER;

-- Same on outreach_leads for per-lead true-open tracking
ALTER TABLE outreach_leads
  ADD COLUMN IF NOT EXISTS human_opened_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bot_opened_at         TIMESTAMPTZ;

-- Index for fast "real open rate" analytics queries
CREATE INDEX IF NOT EXISTS idx_outreach_emails_human_opened
  ON outreach_emails (human_opened_at) WHERE human_opened_at IS NOT NULL;

-- Backfill outreach_emails: classify historical opens by latency
-- Opens < 60s after send = bot (security scanner pre-click)
-- Opens >= 60s = likely human
-- Leave opened_at intact so existing queries continue to work; add new columns
UPDATE outreach_emails
SET bot_opened_at = opened_at,
    first_open_latency_s = EXTRACT(EPOCH FROM (opened_at - sent_at))::int,
    open_count = GREATEST(open_count, 1)
WHERE opened_at IS NOT NULL
  AND bot_opened_at IS NULL
  AND EXTRACT(EPOCH FROM (opened_at - sent_at)) < 60;

UPDATE outreach_emails
SET human_opened_at = opened_at,
    first_open_latency_s = EXTRACT(EPOCH FROM (opened_at - sent_at))::int,
    open_count = GREATEST(open_count, 1)
WHERE opened_at IS NOT NULL
  AND human_opened_at IS NULL
  AND EXTRACT(EPOCH FROM (opened_at - sent_at)) >= 60;

-- Backfill outreach_leads: mirror per-lead classification from their emails
-- A lead is "human opened" if ANY of their emails had a human open
UPDATE outreach_leads ol
SET human_opened_at = sub.min_human
FROM (
  SELECT lead_id, MIN(human_opened_at) AS min_human
  FROM outreach_emails
  WHERE human_opened_at IS NOT NULL
  GROUP BY lead_id
) sub
WHERE ol.id = sub.lead_id AND ol.human_opened_at IS NULL;

-- Leads with opened_at but NO human_opened_at = all bot opens
UPDATE outreach_leads
SET bot_opened_at = opened_at
WHERE opened_at IS NOT NULL
  AND human_opened_at IS NULL
  AND bot_opened_at IS NULL;
