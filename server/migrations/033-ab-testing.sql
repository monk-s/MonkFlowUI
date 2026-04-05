-- Phase 6: A/B Testing Framework for cold outreach email variants
ALTER TABLE outreach_emails ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT 'A';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_variant TEXT DEFAULT 'A';
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS email_variant TEXT DEFAULT 'A';
