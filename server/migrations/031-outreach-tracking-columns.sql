-- Add opened_at and clicked_at columns to outreach_leads for tracking
-- These columns are referenced by trackOpen/trackClick endpoints but were never created

ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;

-- Add index on unsubscribe_token for tracking pixel lookups (avoids full table scan)
CREATE INDEX IF NOT EXISTS idx_outreach_leads_unsub_token ON outreach_leads(unsubscribe_token);
