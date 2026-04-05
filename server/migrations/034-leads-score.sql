-- Phase 8: Lead scoring on leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score INT DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_score DESC);
