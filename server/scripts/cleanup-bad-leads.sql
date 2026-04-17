-- ──────────────────────────────────────────────────────────────────────────
-- Phase 1: Data Cleanup (from the zero-reply root-cause plan)
--
-- Run this against the production Railway DB. Safe to re-run (idempotent).
-- Each UPDATE reports its row count via RETURNING.
--
-- Order matters: 1a must run BEFORE 1d, or 1d will close leads whose
-- subject is recoverable from outreach_leads.ai_email_subject.
--
-- Verify when finished:
--   SELECT COUNT(*) FROM outreach_emails WHERE subject IS NULL;          -- expect 0
--   SELECT COUNT(*) FROM outreach_leads WHERE status='active'
--     AND contact_email ~* '^(info|support|contact|admin|office|sales)@'; -- expect 0
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1a. Backfill NULL subjects in outreach_emails from outreach_leads ----------
WITH upd AS (
  UPDATE outreach_emails oe
     SET subject = ol.ai_email_subject
    FROM outreach_leads ol
   WHERE oe.lead_id = ol.id
     AND oe.subject IS NULL
     AND ol.ai_email_subject IS NOT NULL
  RETURNING 1
)
SELECT COUNT(*) AS rows_updated_1a_subject_backfill FROM upd;

-- 1b. Close role-based email leads (info@, contact@, support@, etc.) --------
WITH upd AS (
  UPDATE outreach_leads
     SET status = 'closed', next_followup_at = NULL, updated_at = NOW()
   WHERE status = 'active'
     AND contact_email ~* '^(info|support|contact|admin|office|sales|help|billing|legal|hr|marketing|hello|general|team|directory|reception|inquiries|enquiries|careers|jobs|media|press|service|feedback|accounts|mail|staff)@'
  RETURNING 1
)
SELECT COUNT(*) AS rows_updated_1b_rolebased_closed FROM upd;

-- 1c. Close leads with garbage contact names --------------------------------
WITH upd AS (
  UPDATE outreach_leads
     SET status = 'closed', next_followup_at = NULL, updated_at = NOW()
   WHERE status = 'active'
     AND (
           contact_name ~* '(attention|required|allow|discover|opportunities|click here)'
        OR contact_name LIKE '%!%'
        OR contact_name ~* '^(team|staff|admin|office|home)$'
        OR LENGTH(contact_name) > 80
         )
  RETURNING 1
)
SELECT COUNT(*) AS rows_updated_1c_badname_closed FROM upd;

-- 1d. Close leads whose subject is still NULL after 1a (unrecoverable) ------
WITH upd AS (
  UPDATE outreach_leads
     SET status = 'closed', next_followup_at = NULL, updated_at = NOW()
   WHERE status = 'active'
     AND ai_email_subject IS NULL
     AND original_subject IS NULL
  RETURNING 1
)
SELECT COUNT(*) AS rows_updated_1d_nullsubject_closed FROM upd;

COMMIT;

-- ── Verification queries (run after commit) ────────────────────────────────
SELECT COUNT(*) AS null_subject_emails_remaining FROM outreach_emails WHERE subject IS NULL;
SELECT COUNT(*) AS active_rolebased_leads_remaining FROM outreach_leads
 WHERE status = 'active'
   AND contact_email ~* '^(info|support|contact|admin|office|sales|help|billing|legal|hr|marketing|hello|general|team|directory|reception|inquiries|enquiries|careers|jobs|media|press|service|feedback|accounts|mail|staff)@';
SELECT COUNT(*) AS active_nullsubject_leads_remaining FROM outreach_leads
 WHERE status = 'active' AND ai_email_subject IS NULL AND original_subject IS NULL;
SELECT COUNT(*) AS active_leads_total FROM outreach_leads WHERE status = 'active';
