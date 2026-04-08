-- Reply triage workflow: track which replied leads still need human action.
-- triage_status:
--   new            → reply received, no action yet (default for any replied lead)
--   booked         → meeting booked / call scheduled
--   not_interested → confirmed pass
--   snoozed        → handle later (cron unsnoozes after 2hr)
--   closed         → done, archived from triage view
ALTER TABLE outreach_leads
  ADD COLUMN IF NOT EXISTS triage_status TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS triage_note TEXT,
  ADD COLUMN IF NOT EXISTS triage_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_outreach_triage
  ON outreach_leads (triage_status)
  WHERE replied_at IS NOT NULL;
