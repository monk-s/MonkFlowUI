-- Bridge leadgen bot → outreach follow-up sequence
-- Adds traceability column + index so we can link outreach_leads back to source leads

ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS source_lead_id UUID REFERENCES leads(id);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_source ON outreach_leads(source_lead_id);

-- Ensure contact_email has a unique constraint for ON CONFLICT DO NOTHING
-- (outreach_leads may already have a unique constraint from the original CREATE TABLE — this is safe)
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_leads_email_unique ON outreach_leads(contact_email);
