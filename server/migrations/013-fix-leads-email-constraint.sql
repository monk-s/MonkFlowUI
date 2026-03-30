-- Fix: ON CONFLICT (email) DO NOTHING requires a proper UNIQUE constraint,
-- not a partial unique index with WHERE clause.
DROP INDEX IF EXISTS idx_leads_email_unique;
ALTER TABLE leads ADD CONSTRAINT leads_email_unique UNIQUE (email);
