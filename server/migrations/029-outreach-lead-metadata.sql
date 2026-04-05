-- Add metadata columns for AI-personalized follow-ups and lead scoring

ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS diagnosis_scores JSONB;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS original_email_body TEXT;
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS lead_score INT DEFAULT 50;

CREATE INDEX IF NOT EXISTS idx_outreach_leads_score ON outreach_leads(lead_score DESC);
