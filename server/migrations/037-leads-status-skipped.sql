-- Allow 'skipped_no_name' status for leads filtered out of personalization
-- because no real first name could be extracted (contact_person is NULL,
-- email local part is a role address or unrecognized). These get marked
-- once and excluded from future runs instead of being re-attempted.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (
  status IN (
    'discovered',
    'diagnosed',
    'email_generated',
    'sent',
    'replied',
    'converted',
    'bounced',
    'unsubscribed',
    'skipped_no_name'
  )
);
