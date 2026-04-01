-- Add priority flag and AI email fields to outreach_leads
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS priority BOOLEAN DEFAULT FALSE;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS website_url VARCHAR(500);
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS website_analysis TEXT;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS ai_email_subject VARCHAR(500);
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS ai_email_body TEXT;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS ai_email_generated_at TIMESTAMPTZ;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS ai_email_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_outreach_leads_priority ON outreach_leads(priority) WHERE priority = true;
