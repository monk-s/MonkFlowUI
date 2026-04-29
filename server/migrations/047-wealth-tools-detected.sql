-- 047-wealth-tools-detected.sql
--
-- Wealth-mgmt pivot 2026-04-29: store the array of wealth-mgmt tools detected
-- on each lead's website (CRM, financial planning tools, custodian portals).
--
-- The outreach prompt uses this to make hyper-specific observations like
-- "I see you're on Wealthbox — most Wealthbox firms still capture intake on
-- paper before re-keying it into the CRM." That reads vastly more credible
-- than generic "your intake is probably manual."
--
-- TEXT[] is sufficient for the small enum-like value set (15-20 distinct keys).
-- Stored alongside the existing diagnostic columns (has_ssl, has_booking_software,
-- has_client_portal, has_intake_forms). NULL for pre-pivot rows.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS wealth_tools_detected TEXT[];

-- Index for quick filtering of leads on a specific tool (e.g., "show me all
-- leads on Redtail" for targeted outreach campaigns or follow-up cohorts).
CREATE INDEX IF NOT EXISTS idx_leads_wealth_tools
  ON leads
  USING GIN (wealth_tools_detected)
  WHERE wealth_tools_detected IS NOT NULL;
